import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import type { OnboardingService } from "../onboarding/service.ts";
import type { AuthGuard } from "../auth/routes.ts";
import { DomainError } from "../onboarding/domain.ts";
import {
  CONDITIONS_VERSION,
  UNANSWERED,
  conditionsSchema,
  isUnanswered,
  normalizeConditions,
  type Conditions,
} from "./conditions.ts";

type Row = { valuesJson: string; updatedAt: string };

export function registerConditionsRoutes(
  app: FastifyInstance,
  db: DatabaseSync,
  service: OnboardingService,
  guard: AuthGuard,
) {
  const url = "/api/onboarding/session/conditions";
  const get = (id: string) =>
    db
      .prepare(
        "SELECT values_json AS valuesJson,updated_at AS updatedAt FROM recommendation_conditions WHERE session_id=?",
      )
      .get(id) as Row | undefined;
  const view = (row: Row | undefined) => ({
    conditions: row
      ? {
          ...UNANSWERED,
          ...(JSON.parse(row.valuesJson) as Conditions),
          updatedAt: row.updatedAt,
        }
      : { ...UNANSWERED, updatedAt: null },
  });
  // Conditions belong to the logged-in account's onboarding progress, like the garment.
  const existing = (r: FastifyRequest, reply: FastifyReply) =>
    service.sessionIdForUser(guard(r, reply).userId);

  app.get(url, (r, reply) => {
    const id = existing(r, reply);
    return view(id ? get(id) : undefined);
  });
  app.put(url, (r, reply) => {
    const conditions = normalizeConditions(conditionsSchema.parse(r.body));
    const id = existing(r, reply);
    if (!id)
      throw new DomainError(
        401,
        "SESSION_REQUIRED",
        "취향 진행을 찾을 수 없어요. 새로 시작해 주세요.",
      );
    if (isUnanswered(conditions)) {
      db.prepare(
        "DELETE FROM recommendation_conditions WHERE session_id=?",
      ).run(id);
      return view(undefined);
    }
    const json = JSON.stringify(conditions);
    // Saving the same values again keeps the time they were last changed.
    if (get(id)?.valuesJson !== json)
      db.prepare(
        "INSERT INTO recommendation_conditions VALUES(?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET vocabulary_version=excluded.vocabulary_version,values_json=excluded.values_json,updated_at=excluded.updated_at",
      ).run(id, CONDITIONS_VERSION, json, service.now().toISOString());
    return view(get(id));
  });
}
