import { registerGarmentRoutes } from "./modules/garment/routes.ts";
import { registerWardrobeRoutes } from "./modules/wardrobe/routes.ts";
import { WardrobeStore } from "./modules/wardrobe/store.ts";
import { registerConditionsRoutes } from "./modules/conditions/routes.ts";
import Fastify, { LogController } from "fastify";
import cookie from "@fastify/cookie";
import { ZodError } from "zod";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { openDatabase } from "./db/connection.ts";
import type { AppConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import {
  seedCatalog,
  localAssetPath,
} from "./modules/onboarding/catalog-management.ts";
import { DomainError } from "./modules/onboarding/domain.ts";
import { SqliteOnboardingRepository } from "./modules/onboarding/repository.ts";
import { OnboardingService } from "./modules/onboarding/service.ts";
import { registerOnboardingRoutes } from "./modules/onboarding/routes.ts";
import { syncConsentDocuments } from "./modules/auth/consent-documents.ts";
import { kakaoProvider, type OAuthProvider } from "./modules/auth/kakao.ts";
import { AuthService } from "./modules/auth/service.ts";
import { createAuthGuard, registerAuthRoutes } from "./modules/auth/routes.ts";

export function buildApp(
  options: {
    config?: AppConfig;
    now?: () => Date;
    logger?: boolean;
    /** Test-only: integration tests pass a fake Kakao. Production always uses the real client from config. */
    oauthProvider?: OAuthProvider;
  } = {},
) {
  const config = options.config ?? loadConfig();
  const db = openDatabase(config.databasePath);
  try {
    seedCatalog(db);
    syncConsentDocuments(db);
  } catch (error) {
    db.close();
    throw error;
  }
  const garmentRoot =
    config.garmentRoot ??
    path.join(path.dirname(config.databasePath), "garments");
  const repository = new SqliteOnboardingRepository(db, garmentRoot);
  const wardrobe = new WardrobeStore(db, garmentRoot);
  const service = new OnboardingService(
    repository,
    config.sessionTtlSeconds,
    options.now,
  );
  const app = Fastify({
    bodyLimit: 16 * 1024,
    trustProxy: false,
    logController: new LogController({ disableRequestLogging: true }),
    logger:
      options.logger === false
        ? false
        : {
            level: "info",
            redact: [
              "req.headers.cookie",
              "req.headers.authorization",
              "res.headers.set-cookie",
            ],
          },
  });
  app.register(cookie);
  app.addHook("onRequest", async (request) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
    if (request.headers["x-onboarding-request"] !== "1")
      throw new DomainError(
        403,
        "REQUEST_HEADER_REQUIRED",
        "X-Onboarding-Request: 1 헤더가 필요해요.",
      );
    if (
      request.headers.origin &&
      request.headers.origin !== config.publicOrigin
    )
      throw new DomainError(
        403,
        "ORIGIN_NOT_ALLOWED",
        "허용되지 않은 요청 출처예요.",
      );
    if (request.headers["sec-fetch-site"] === "cross-site")
      throw new DomainError(
        403,
        "ORIGIN_NOT_ALLOWED",
        "다른 사이트에서 보낸 변경 요청은 허용하지 않아요.",
      );
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'",
    );
    return payload;
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: {
          code: "INVALID_INPUT",
          message: "요청 내용을 확인해 주세요.",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        requestId: request.id,
      });
    if (error instanceof DomainError)
      return reply.code(error.status).send({
        error: { code: error.code, message: error.message },
        requestId: request.id,
      });
    const status = (error as { statusCode?: number }).statusCode;
    if (status && [400, 413, 415].includes(status))
      return reply.code(status).send({
        error: {
          code:
            status === 413
              ? "PAYLOAD_TOO_LARGE"
              : status === 415
                ? "UNSUPPORTED_MEDIA_TYPE"
                : "INVALID_INPUT",
          message: "요청 형식이나 크기를 확인해 주세요.",
        },
        requestId: request.id,
      });
    request.log.error({ err: error }, "Request failed");
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "저장 또는 조회에 실패했어요. 다시 시도해 주세요.",
      },
      requestId: request.id,
    });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: { code: "NOT_FOUND", message: "요청한 경로를 찾을 수 없어요." },
      requestId: request.id,
    }),
  );
  app.get("/health", () => ({ status: "ok" }));
  const auth = new AuthService(
    db,
    config.auth,
    options.oauthProvider ??
      (config.auth.kakao ? kakaoProvider(config.auth.kakao) : undefined),
    options.now,
    // Wardrobe photos first, then the progress; each step is safe to repeat on a retry.
    (userId) => {
      wardrobe.removeAllForUser(userId);
      service.deleteForUser(userId);
    },
  );
  // Run deletions whose 30-day grace has ended, and resume ones interrupted by a crash or a
  // provider outage: once at start, then every deletionSweepSeconds.
  const sweep = () =>
    auth
      .processDeletions()
      .catch((error: unknown) =>
        app.log.error({ err: error }, "Account deletion sweep failed"),
      );
  let sweeper: NodeJS.Timeout | undefined;
  app.addHook("onReady", async () => {
    void sweep();
    sweeper = setInterval(sweep, config.auth.deletionSweepSeconds * 1000);
    sweeper.unref();
  });
  app.addHook("onClose", async () => clearInterval(sweeper));
  const guard = createAuthGuard(auth, config);
  registerAuthRoutes(app, auth, config, guard);
  registerOnboardingRoutes(app, service, guard);
  registerGarmentRoutes(app, wardrobe, service, guard);
  registerWardrobeRoutes(app, wardrobe, service, guard);
  registerConditionsRoutes(app, db, service, guard);
  // A local image URL stays readable only while it belongs to currently public content.
  app.get("/media/*", async (request, reply) => {
    const reference = `/media/${(request.params as { "*": string })["*"]}`;
    if (!service.isPublicAsset(reference))
      throw new DomainError(
        404,
        "IMAGE_UNAVAILABLE",
        "현재 공개된 이미지를 찾을 수 없어요.",
      );
    let filename: string;
    try {
      filename = await localAssetPath(reference, config.assetRoot);
    } catch {
      throw new DomainError(
        404,
        "IMAGE_UNAVAILABLE",
        "이미지 파일을 찾을 수 없어요.",
      );
    }
    const metadata = await stat(filename);
    if (!metadata.isFile() || metadata.size > 20 * 1024 * 1024)
      throw new DomainError(
        404,
        "IMAGE_UNAVAILABLE",
        "이미지 파일을 제공할 수 없어요.",
      );
    const mime: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".avif": "image/avif",
    };
    return reply
      .type(mime[path.extname(filename).toLowerCase()]!)
      .send(await readFile(filename));
  });
  app.addHook("onClose", async () => {
    db.close();
  });
  return { app, repository, service, auth, db, config };
}
