import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthGuard } from "../auth/routes.ts";
import type { OnboardingService } from "./service.ts";
import {
  categoryBody,
  catalogQuery,
  responseBody,
  preferenceBody,
  positionBody,
  emptyBody,
  styleParams,
  imageParams,
} from "./validation.ts";

export function registerOnboardingRoutes(
  app: FastifyInstance,
  service: OnboardingService,
  guard: AuthGuard,
): void {
  const prefix = "/api/onboarding";
  // Progress belongs to the logged-in account (AUTH-002); there is no anonymous onboarding cookie any more.
  const user = (request: FastifyRequest, reply: FastifyReply) =>
    guard(request, reply).userId;
  const progressId = (request: FastifyRequest, reply: FastifyReply) =>
    service.sessionIdForUser(user(request, reply));
  app.get(`${prefix}/catalog`, (request) =>
    service.catalog(catalogQuery.parse(request.query).categoryId),
  );
  app.get(`${prefix}/styles/:styleId`, (request) =>
    service.style(styleParams.parse(request.params).styleId),
  );
  app.post(`${prefix}/session`, (request, reply) => {
    emptyBody.parse(request.body ?? {});
    const result = service.ensureForUser(user(request, reply));
    return reply.code(result.created ? 201 : 200).send(result.session);
  });
  app.get(`${prefix}/session`, (request, reply) => {
    emptyBody.parse(request.query);
    return service.restore(progressId(request, reply));
  });
  app.put(`${prefix}/session/category`, (request, reply) =>
    service.selectCategory(
      progressId(request, reply),
      categoryBody.parse(request.body).categoryId,
    ),
  );
  app.put(`${prefix}/session/styles/:styleId/response`, (request, reply) => {
    const { styleId } = styleParams.parse(request.params);
    const body = responseBody.parse(request.body);
    return service.respond(
      progressId(request, reply),
      styleId,
      body.response,
      body.nextStyleId,
    );
  });
  app.put(
    `${prefix}/session/styles/:styleId/images/:imageId/preference`,
    (request, reply) => {
      const { styleId, imageId } = imageParams.parse(request.params);
      return service.preferImage(
        progressId(request, reply),
        styleId,
        imageId,
        preferenceBody.parse(request.body).selected,
      );
    },
  );
  app.put(`${prefix}/session/position`, (request, reply) =>
    service.position(
      progressId(request, reply),
      positionBody.parse(request.body).styleId,
    ),
  );
  app.get(`${prefix}/session/summary`, (request, reply) => {
    emptyBody.parse(request.query);
    return service.summary(progressId(request, reply));
  });
  app.post(`${prefix}/session/complete`, (request, reply) => {
    emptyBody.parse(request.body ?? {});
    return service.complete(progressId(request, reply));
  });
  app.post(`${prefix}/session/refresh-catalog`, (request, reply) => {
    emptyBody.parse(request.body ?? {});
    return service.refreshCatalog(progressId(request, reply));
  });
  app.post(`${prefix}/session/reset`, (request, reply) => {
    emptyBody.parse(request.body ?? {});
    return service.reset(progressId(request, reply));
  });
  app.delete(`${prefix}/session`, (request, reply) => {
    emptyBody.parse(request.body ?? {});
    service.delete(progressId(request, reply));
    return reply.code(204).send();
  });
}
