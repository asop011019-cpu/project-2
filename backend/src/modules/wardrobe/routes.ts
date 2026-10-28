import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { OnboardingService } from "../onboarding/service.ts";
import type { AuthGuard } from "../auth/routes.ts";
import { DomainError } from "../onboarding/domain.ts";
import { notFound } from "../garment/routes.ts";
import type { Conditions } from "../conditions/conditions.ts";
import type { WardrobeStore } from "./store.ts";
import { budgetMode, ownedOnlyCheck } from "./policy.ts";

const params = z.object({ id: z.uuid() }).strict();

/** WARD-001: the logged-in account's wardrobe. Another account's item is reported as missing. */
export function registerWardrobeRoutes(
  app: FastifyInstance,
  store: WardrobeStore,
  service: OnboardingService,
  guard: AuthGuard,
) {
  const user = (r: FastifyRequest, reply: FastifyReply) =>
    guard(r, reply).userId;
  const itemUrl = (id: string) => `/api/wardrobe/items/${id}/image`;
  const ownedItem = (r: FastifyRequest, reply: FastifyReply) => {
    const owner = user(r, reply);
    const parsed = params.safeParse(r.params);
    return {
      owner,
      row: parsed.success ? store.item(owner, parsed.data.id) : undefined,
    };
  };

  app.get("/api/wardrobe", (r, reply) => {
    const owner = user(r, reply);
    const sessionId = service.sessionIdForUser(owner);
    return {
      items: store.items(owner).map((row) => store.view(row, itemUrl(row.id))),
      referenceItemId:
        (sessionId && store.reference(owner, sessionId)?.id) || null,
    };
  });
  app.get("/api/wardrobe/items/:id/image", (r, reply) => {
    z.object({ v: z.string().optional() }).strict().parse(r.query);
    const { row } = ownedItem(r, reply);
    if (!row) throw new DomainError(404, "IMAGE_UNAVAILABLE", "사진이 없어요.");
    return reply.type("image/png").send(readFileSync(store.imagePath(row)));
  });
  app.delete("/api/wardrobe/items/:id", (r, reply) => {
    const { owner, row } = ownedItem(r, reply);
    if (!row || !store.remove(owner, row.id)) throw notFound();
    return reply.code(204).send();
  });

  // Whether the saved conditions can lead to a recommendation, judged on the server from the
  // account's own wardrobe. With 0 won only owned garments may be used (see policy.ts).
  app.get("/api/onboarding/session/recommendation-check", (r, reply) => {
    const owner = user(r, reply);
    const sessionId = service.sessionIdForUser(owner);
    const row = sessionId
      ? (store.db
          .prepare(
            "SELECT values_json AS v FROM recommendation_conditions WHERE session_id=?",
          )
          .get(sessionId) as { v: string } | undefined)
      : undefined;
    const budget = row
      ? ((JSON.parse(row.v) as Conditions).additionalBudgetKrw ?? null)
      : null;
    const items = store.items(owner);
    const mode = budgetMode(budget);
    const check =
      mode === "owned_only"
        ? ownedOnlyCheck(items.map((item) => item.garmentType))
        : { blockedReason: null, missing: [] };
    return { budgetMode: mode, ...check, wardrobeCount: items.length };
  });
}
