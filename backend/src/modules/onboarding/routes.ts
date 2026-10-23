import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../../config.ts";
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
  genreParams,
  genrePositionBody,
  genreProgressBody,
} from "./validation.ts";

export function registerOnboardingRoutes(
  app: FastifyInstance,
  service: OnboardingService,
  config: AppConfig,
): void {
  const prefix = "/api/onboarding";
  const cookieName = config.secureCookies
    ? "__Host-onboarding"
    : "onboarding_dev";
  const token = (request: FastifyRequest) => request.cookies[cookieName];
  const setCookie = (reply: FastifyReply, value: string, expiresAt: string) =>
    reply.setCookie(cookieName, value, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: "strict",
      path: "/",
      maxAge: config.sessionTtlSeconds,
      expires: new Date(expiresAt),
    });
  const clearCookie = (reply: FastifyReply) =>
    reply.clearCookie(cookieName, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: "strict",
      path: "/",
    });
  app.get(`${prefix}/catalog`, (request) =>
    service.catalog(catalogQuery.parse(request.query).categoryId),
  );
  app.get(`${prefix}/styles/:styleId`, (request) =>
    service.style(styleParams.parse(request.params).styleId),
  );
  app.post(`${prefix}/session`, (request, reply) => {
    emptyBody.parse(request.body ?? {});
    const result = service.create(token(request));
    if (result.token) setCookie(reply, result.token, result.session.expiresAt);
    return reply.code(result.created ? 201 : 200).send(result.session);
  });
  app.get(`${prefix}/session`, (request) => {
    emptyBody.parse(request.query);
    return service.restore(token(request));
  });
  app.put(`${prefix}/session/category`, (request) =>
    service.selectCategory(
      token(request),
      categoryBody.parse(request.body).categoryId,
    ),
  );
  app.put(`${prefix}/session/styles/:styleId/response`, (request) => {
    const { styleId } = styleParams.parse(request.params);
    const body = responseBody.parse(request.body);
    return service.respond(
      token(request),
      styleId,
      body.response,
      body.nextStyleId,
    );
  });
  app.put(
    `${prefix}/session/styles/:styleId/images/:imageId/preference`,
    (request) => {
      const { styleId, imageId } = imageParams.parse(request.params);
      return service.preferImage(
        token(request),
        styleId,
        imageId,
        preferenceBody.parse(request.body).selected,
      );
    },
  );
  app.put(`${prefix}/session/position`, (request) =>
    service.position(token(request), positionBody.parse(request.body).styleId),
  );
  app.post(`${prefix}/session/photo-exploration`, (request) => {
    emptyBody.parse(request.body ?? {});
    return service.startPhotoExploration(token(request));
  });
  app.put(`${prefix}/session/genre-position`, (request) =>
    service.genrePosition(
      token(request),
      genrePositionBody.parse(request.body).genreGroupId,
    ),
  );
  app.put(`${prefix}/session/genres/:genreGroupId/progress`, (request) => {
    const { genreGroupId } = genreParams.parse(request.params);
    const body = genreProgressBody.parse(request.body);
    return service.visitGenre(
      token(request),
      genreGroupId,
      body.status,
      body.nextGenreGroupId,
    );
  });
  app.get(`${prefix}/session/summary`, (request) => {
    emptyBody.parse(request.query);
    return service.summary(token(request));
  });
  app.post(`${prefix}/session/complete`, (request) => {
    emptyBody.parse(request.body ?? {});
    return service.complete(token(request));
  });
  app.post(`${prefix}/session/refresh-catalog`, (request) => {
    emptyBody.parse(request.body ?? {});
    return service.refreshCatalog(token(request));
  });
  app.post(`${prefix}/session/reset`, (request, reply) => {
    emptyBody.parse(request.body ?? {});
    const result = service.reset(token(request));
    setCookie(reply, result.token, result.session.expiresAt);
    return result.session;
  });
  app.delete(`${prefix}/session`, (request, reply) => {
    emptyBody.parse(request.body ?? {});
    service.delete(token(request));
    clearCookie(reply);
    return reply.code(204).send();
  });
}
