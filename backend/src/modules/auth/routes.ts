import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../../config.ts";
import { DomainError } from "../onboarding/domain.ts";
import type { AuthContext, AuthService } from "./service.ts";
import { safeReturnTo } from "./service.ts";

export type AuthGuard = (
  request: FastifyRequest,
  reply: FastifyReply,
  options?: { allowConsentUpdate?: boolean },
) => AuthContext;

const decision = z
  .object({
    key: z.string().min(1).max(64),
    version: z.number().int().positive(),
    granted: z.boolean(),
  })
  .strict();
const signupBody = z.object({ consents: z.array(decision).max(20) }).strict();

export function authCookies(config: AppConfig) {
  const name = (base: string) =>
    config.secureCookies ? `__Host-${base}` : `${base}_dev`;
  const names = {
    session: name("auth"),
    oauth: name("auth-oauth"),
    signup: name("auth-signup"),
  };
  // Lax: the Kakao redirect back to us is a cross-site navigation, which Strict cookies would miss.
  // Mutations stay protected by the X-Onboarding-Request header and Origin checks.
  const base = {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: "lax" as const,
    path: "/",
  };
  return {
    names,
    set(
      reply: FastifyReply,
      cookie: keyof typeof names,
      value: string,
      expiresAt: string,
    ) {
      // The server-side expiry is authoritative; the browser copy may outlive it slightly.
      reply.setCookie(names[cookie], value, {
        ...base,
        expires: new Date(expiresAt),
        maxAge:
          cookie === "session"
            ? config.auth.idleTtlSeconds
            : config.auth.handshakeTtlSeconds,
      });
    },
    clear(reply: FastifyReply, cookie: keyof typeof names) {
      reply.clearCookie(names[cookie], base);
    },
  };
}

export function createAuthGuard(
  auth: AuthService,
  config: AppConfig,
): AuthGuard {
  const cookies = authCookies(config);
  const cache = new WeakMap<FastifyRequest, AuthContext>();
  return (request, reply, options = {}) => {
    const cached = cache.get(request);
    if (cached) return cached;
    const context = auth.authenticate(
      request.cookies[cookies.names.session],
      options,
    );
    if (context.renewedToken)
      cookies.set(
        reply,
        "session",
        context.renewedToken,
        context.cookieExpiresAt,
      );
    cache.set(request, context);
    return context;
  };
}

export function registerAuthRoutes(
  app: FastifyInstance,
  auth: AuthService,
  config: AppConfig,
  guard: AuthGuard,
): void {
  const prefix = "/api/auth";
  const cookies = authCookies(config);
  const handshakeExpiry = () =>
    new Date(
      auth.clock().getTime() + config.auth.handshakeTtlSeconds * 1000,
    ).toISOString();
  const failed = (reply: FastifyReply, code: string) =>
    reply.redirect(`/login?error=${encodeURIComponent(code)}`, 302);

  app.get(`${prefix}/kakao/start`, (request, reply) => {
    const query = z
      .object({
        returnTo: z.string().max(2048).optional(),
        reauth: z.literal("1").optional(),
      })
      .strict()
      .parse(request.query);
    const { location, binder } = auth.startLogin(query.returnTo, {
      reauth: query.reauth === "1",
    });
    cookies.set(reply, "oauth", binder, handshakeExpiry());
    return reply.redirect(location, 302);
  });

  app.get(`${prefix}/kakao/callback`, async (request, reply) => {
    const query = z
      .object({
        code: z.string().max(2048).optional(),
        state: z.string().max(256).optional(),
        error: z.string().max(128).optional(),
        error_description: z.string().max(1024).optional(),
      })
      .passthrough()
      .parse(request.query);
    const consumed = auth.consumeState(
      query.state,
      request.cookies[cookies.names.oauth],
    );
    cookies.clear(reply, "oauth");
    if (!consumed) return failed(reply, "OAUTH_STATE_INVALID");
    if (query.error || !query.code) return failed(reply, "OAUTH_DENIED");
    try {
      const result = await auth.completeLogin(query.code, consumed.returnTo);
      if (result.kind === "signup") {
        cookies.set(reply, "signup", result.token, handshakeExpiry());
        return reply.redirect("/signup", 302);
      }
      cookies.set(reply, "session", result.token, result.expiresAt);
      return reply.redirect(result.returnTo, 302);
    } catch (error) {
      if (error instanceof DomainError) return failed(reply, error.code);
      request.log.error({ err: error }, "Kakao login failed");
      return failed(reply, "LOGIN_FAILED");
    }
  });

  app.get(`${prefix}/consent-documents`, () => ({
    documents: auth.currentDocuments(),
  }));
  app.get(`${prefix}/consent-documents/:key/:version`, (request) => {
    const params = z
      .object({
        key: z.string().min(1).max(64),
        version: z.coerce.number().int().positive(),
      })
      .strict()
      .parse(request.params);
    return auth.document(params.key, params.version);
  });

  app.get(`${prefix}/signup/pending`, (request) =>
    auth.pendingSignup(request.cookies[cookies.names.signup]),
  );
  app.post(`${prefix}/signup`, (request, reply) => {
    const body = signupBody.parse(request.body);
    const result = auth.signup(
      request.cookies[cookies.names.signup],
      body.consents,
    );
    cookies.clear(reply, "signup");
    cookies.set(reply, "session", result.token, result.expiresAt);
    return reply
      .code(201)
      .send({ user: { id: result.userId }, returnTo: result.returnTo });
  });

  app.get(`${prefix}/me`, (request, reply) =>
    auth.me(guard(request, reply, { allowConsentUpdate: true })),
  );
  app.put(`${prefix}/consents`, (request, reply) => {
    const context = guard(request, reply, { allowConsentUpdate: true });
    auth.decide(context.userId, decision.parse(request.body));
    return auth.me(context);
  });
  app.post(`${prefix}/logout`, (request, reply) => {
    z.object({})
      .strict()
      .parse(request.body ?? {});
    auth.logout(request.cookies[cookies.names.session]);
    cookies.clear(reply, "session");
    return reply.code(204).send();
  });
  app.delete(`${prefix}/account`, async (request, reply) => {
    z.object({})
      .strict()
      .parse(request.body ?? {});
    const context = guard(request, reply, { allowConsentUpdate: true });
    await auth.requestDeletion(context);
    cookies.clear(reply, "session");
    return reply.code(204).send();
  });
  app.post(`${prefix}/logout-all`, (request, reply) => {
    z.object({})
      .strict()
      .parse(request.body ?? {});
    const context = guard(request, reply, { allowConsentUpdate: true });
    auth.logoutAll(context.userId);
    cookies.clear(reply, "session");
    return reply.code(204).send();
  });
}
