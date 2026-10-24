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
}
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
  };
}
