import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import {
  catalogImportSchema,
  verifyLocalAssets,
  importCatalog,
} from "../src/modules/onboarding/catalog-management.ts";
import type { SessionView } from "../src/modules/onboarding/types.ts";
import type { OAuthProvider } from "../src/modules/auth/kakao.ts";
import { DomainError } from "../src/modules/onboarding/domain.ts";

/** Test-only Kakao: code "user-<n>" logs in Kakao member <n>; code "fail" is a provider outage. */
export function fakeKakao(): OAuthProvider & { exchanged: string[] } {
  const exchanged: string[] = [];
  return {
    name: "kakao",
    exchanged,
    authorizeUrl: (state) =>
      `https://kauth.kakao.test/oauth/authorize?state=${encodeURIComponent(state)}`,
    async subjectFor(code) {
      exchanged.push(code);
      if (code === "fail")
        throw new DomainError(502, "OAUTH_PROVIDER_ERROR", "fake outage");
      const match = /^user-([0-9]+)$/.exec(code);
      if (!match)
        throw new DomainError(502, "OAUTH_PROVIDER_ERROR", "bad code");
      return match[1]!;
    },
  };
}
let nextSubject = 1000;

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function fixturePng(color: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const label = Buffer.from(type),
      size = Buffer.alloc(4),
      crc = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(Buffer.concat([label, data])));
    return Buffer.concat([size, label, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(12, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows = [];
  for (let row = 0; row < 12; row++)
    rows.push(
      Buffer.concat([
        Buffer.from([0]),
        Buffer.from(
          Array.from(
            { length: 24 },
            (_, index) => (color + index * 13 + row * 7) % 256,
          ),
        ),
      ]),
    );
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
export async function context() {
  const directory = await mkdtemp(path.join(tmpdir(), "project2-api-test-"));
  const assetRoot = path.join(directory, "assets");
  await mkdir(assetRoot);
  let time = new Date("2026-10-23T01:00:00.000Z");
  const config = loadConfig({
    DATABASE_PATH: path.join(directory, "test.sqlite"),
    ASSET_ROOT: assetRoot,
    PUBLIC_ORIGIN: "http://localhost:3001",
  });
  const kakao = fakeKakao();
  const built = buildApp({
    config,
    now: () => time,
    logger: false,
    oauthProvider: kakao,
  });
  await built.app.ready();
  return {
    ...built,
    kakao,
    directory,
    advance: (ms = 1000) => {
      time = new Date(time.getTime() + ms);
    },
    cleanup: async () => {
      await built.app.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
export type Context = Awaited<ReturnType<typeof context>>;
export async function publish(context: Context, styleIds: string[], count = 4) {
  const catalog = context.repository.catalog();
  const styles = styleIds.map((id) => {
    const style = catalog.styles.find((style) => style.id === id);
    assert.ok(style);
    return { ...style, publicationStatus: "published" as const };
  });
  const images = [];
  let color = catalog.images.length + 1;
  for (const style of styles)
    for (let index = 0; index < count; index++) {
      const id = `fixture_${style.id}_${index}`;
      const ref = `/media/${id}.png`;
      await writeFile(
        path.join(context.config.assetRoot, `${id}.png`),
        fixturePng(color++),
      );
      images.push({
        id,
        styleId: style.id,
        categoryId: style.categoryId,
        originalRef: ref,
        thumbnailRef: ref,
        alt: `Integration fixture ${id}; not a fashion example`,
        width: 8,
        height: 12,
        format: (["model_outfit", "flat_lay", "collage"] as const)[index % 3]!,
        isGenerated: true,
        order: index,
        sourceUrl: null,
        creator: "Automated test fixture",
        usageStatus: "allowed",
        publicationStatus: "published",
        contentHash: null,
      });
    }
  const data = await verifyLocalAssets(
    catalogImportSchema.parse({ styles, images }),
    context.config.assetRoot,
  );
  importCatalog(context.db, data);
  return data;
}
export function client(context: Context) {
  // Cookie jar: name -> value. "cookie" reads/writes it as a Cookie header string.
  const jar = new Map<string, string>();
  const absorb = (header: string | string[] | undefined) => {
    for (const line of header
      ? Array.isArray(header)
        ? header
        : [header]
      : []) {
      const [pair, ...attributes] = line.split(";");
      const index = pair!.indexOf("=");
      const name = pair!.slice(0, index).trim();
      const value = pair!.slice(index + 1).trim();
      const removed = attributes.some((a) => /^\s*max-age=0\s*$/i.test(a));
      if (removed || !value) jar.delete(name);
      else jar.set(name, value);
    }
  };
  return {
    get cookie() {
      return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(value: string) {
      jar.clear();
      for (const part of value.split(";")) {
        const index = part.indexOf("=");
        if (index > 0)
          jar.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
      }
    },
    async request(
      method: "GET" | "POST" | "PUT" | "DELETE",
      url: string,
      payload?: unknown,
      extra: Record<string, string> = {},
    ) {
      const cookie = this.cookie;
      const response = await context.app.inject({
        method,
        url,
        headers: {
          "x-onboarding-request": "1",
          ...(payload !== undefined
            ? { "content-type": "application/json" }
            : {}),
          origin: context.config.publicOrigin,
          ...(cookie ? { cookie } : {}),
          ...extra,
        },
        ...(payload !== undefined ? { payload: JSON.stringify(payload)! } : {}),
      });
      absorb(response.headers["set-cookie"] as string | string[] | undefined);
      return response;
    },
    /** Logs in through the fake Kakao; a new member also completes signup with all consents granted. */
    async login(subject = String(nextSubject++), grantOptional = false) {
      const start = await this.request("GET", "/api/auth/kakao/start");
      assert.equal(start.statusCode, 302, start.body);
      const state = new URL(String(start.headers.location)).searchParams.get(
        "state",
      )!;
      const callback = await this.request(
        "GET",
        `/api/auth/kakao/callback?code=user-${subject}&state=${encodeURIComponent(state)}`,
      );
      assert.equal(callback.statusCode, 302, callback.body);
      if (callback.headers.location === "/signup") {
        const pending = await this.request("GET", "/api/auth/signup/pending");
        assert.equal(pending.statusCode, 200, pending.body);
        const documents = pending.json().documents as {
          key: string;
          version: number;
          required: boolean;
        }[];
        const signup = await this.request("POST", "/api/auth/signup", {
          consents: documents.map((d) => ({
            key: d.key,
            version: d.version,
            granted: d.required || grantOptional,
          })),
        });
        assert.equal(signup.statusCode, 201, signup.body);
      }
      return subject;
    },
    async create(): Promise<SessionView> {
      if (
        ![...jar.keys()].some(
          (name) =>
            name.includes("auth") &&
            !name.includes("oauth") &&
            !name.includes("signup"),
        )
      )
        await this.login();
      const response = await this.request(
        "POST",
        "/api/onboarding/session",
        {},
      );
      assert.equal(response.statusCode, 201, response.body);
      return response.json();
    },
    async category(
      categoryId: "menswear" | "womenswear",
    ): Promise<SessionView> {
      const response = await this.request(
        "PUT",
        "/api/onboarding/session/category",
        { categoryId },
      );
      assert.equal(response.statusCode, 200, response.body);
      return response.json();
    },
  };
}
