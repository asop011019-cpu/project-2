import path from "node:path";
import { z } from "zod";
export interface AppConfig {
  host: string;
  port: number;
  databasePath: string;
  assetRoot: string;
  garmentRoot?: string;
  publicOrigin: string;
  secureCookies: boolean;
  sessionTtlSeconds: number;
  auth: AuthConfig;
}
// Login session lifetimes are adjustable development defaults (AUTH-002), not an approved policy.
export interface AuthConfig {
  idleTtlSeconds: number;
  absoluteTtlSeconds: number;
  renewAfterSeconds: number;
  rotationGraceSeconds: number;
  handshakeTtlSeconds: number;
  reauthWindowSeconds: number;
  unlinkLeaseSeconds: number;
  kakao?: {
    restApiKey: string;
    clientSecret?: string;
    redirectUri: string;
    adminKey?: string;
  };
}
const seconds = (value: string | undefined, fallback: number) =>
  z.coerce
    .number()
    .int()
    .min(1)
    .parse(value ?? fallback);
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env.NODE_ENV === "production";
  const origin = new URL(env.PUBLIC_ORIGIN ?? "http://localhost:3001");
  if (
    origin.origin !== origin.href.replace(/\/$/, "") ||
    origin.username ||
    origin.password
  )
    throw new Error(
      "PUBLIC_ORIGIN must be a single origin without credentials or a path.",
    );
  if (!(
    origin.protocol === "https:" ||
    (!production && origin.protocol === "http:")
  ))
    throw new Error("Production requires an HTTPS PUBLIC_ORIGIN.");
  return {
    host: env.HOST ?? "127.0.0.1",
    port: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .parse(env.PORT ?? 3001),
    databasePath: path.resolve(env.DATABASE_PATH ?? "./data/onboarding.sqlite"),
    garmentRoot: path.resolve(
      env.GARMENT_ROOT ??
        path.join(
          path.dirname(env.DATABASE_PATH ?? "./data/onboarding.sqlite"),
          "garments",
        ),
    ),
    assetRoot: path.resolve(env.ASSET_ROOT ?? "./assets"),
    publicOrigin: origin.origin,
    secureCookies: production || origin.protocol === "https:",
    sessionTtlSeconds: 60 * 60 * 24 * 30,
    auth: {
      idleTtlSeconds: seconds(env.AUTH_IDLE_TTL_SECONDS, 60 * 60 * 24 * 30),
      absoluteTtlSeconds: seconds(
        env.AUTH_ABSOLUTE_TTL_SECONDS,
        60 * 60 * 24 * 90,
      ),
      renewAfterSeconds: seconds(env.AUTH_RENEW_AFTER_SECONDS, 60 * 60 * 24),
      rotationGraceSeconds: seconds(env.AUTH_ROTATION_GRACE_SECONDS, 60),
      handshakeTtlSeconds: 600,
      reauthWindowSeconds: 600,
      // Longer than the 10 s Kakao request timeout; a crashed unlink frees the member after this.
      unlinkLeaseSeconds: 60,
      ...(env.KAKAO_REST_API_KEY
        ? {
            kakao: {
              restApiKey: env.KAKAO_REST_API_KEY,
              ...(env.KAKAO_CLIENT_SECRET
                ? { clientSecret: env.KAKAO_CLIENT_SECRET }
                : {}),
              ...(env.KAKAO_ADMIN_KEY ? { adminKey: env.KAKAO_ADMIN_KEY } : {}),
              redirectUri:
                env.KAKAO_REDIRECT_URI ??
                `${origin.origin}/api/auth/kakao/callback`,
            },
          }
        : {}),
    },
  };
}
