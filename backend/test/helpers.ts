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
  const built = buildApp({ config, now: () => time, logger: false });
  await built.app.ready();
  return {
    ...built,
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
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    set cookie(value: string) {
      cookie = value;
    },
    async request(
      method: "GET" | "POST" | "PUT" | "DELETE",
      url: string,
      payload?: unknown,
      extra: Record<string, string> = {},
    ) {
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
      const header = response.headers["set-cookie"];
      if (header)
        cookie = (Array.isArray(header) ? header[0]! : header).split(";")[0]!;
      return response;
    },
    async create(): Promise<SessionView> {
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
