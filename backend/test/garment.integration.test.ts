import test from "node:test";
import assert from "node:assert/strict";
import { readdir, rename } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { context, client, fixturePng } from "./helpers.ts";
import { buildApp } from "../src/app.ts";
const url = "/api/onboarding/session/garment";
const meta = {
  garmentType: "pants",
  brand: null,
  productName: null,
  purchaseUrl: null,
};
function form(metadata: unknown = meta, images: Buffer[] = [fixturePng(1)]) {
  const boundary = "gar001-boundary";
  const parts: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${typeof metadata === "string" ? metadata : JSON.stringify(metadata)}\r\n`,
    ),
  ];
  for (const image of images)
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="untrusted.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      image,
      Buffer.from("\r\n"),
    );
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}
async function setup(t: import("node:test").TestContext) {
  const c = await context();
  t.after(c.cleanup);
  const a = client(c);
  await a.create();
  const put = (metadata: unknown = meta, images?: Buffer[]) => {
    const f = form(metadata, images);
    return c.app.inject({
      method: "PUT",
      url,
      payload: f.payload,
      headers: { ...f.headers, cookie: a.cookie, "x-onboarding-request": "1" },
    });
  };
  return { c, a, put };
}
test("garment lifecycle, normalized image, metadata, replacement and reopened database", async (t) => {
  const { c, a, put } = await setup(t);
  assert.deepEqual((await a.request("GET", url)).json(), { garment: null });
  const image = await sharp(fixturePng(4))
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  let r = await put(meta, [image]);
  assert.equal(r.statusCode, 200, r.body);
  const first = r.json().garment;
  assert.equal(first.width, 12);
  assert.equal(first.height, 8);
  const out = await a.request("GET", url + "/image?v=1");
  assert.equal(out.statusCode, 200);
  assert.equal(out.headers["cache-control"], "no-store");
  assert.equal((await sharp(out.rawPayload).metadata()).exif, undefined);
  r = await put({ ...meta, brand: "  브랜드  ", garmentType: "skirt" }, []);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().garment.brand, "브랜드");
  assert.equal(r.json().garment.id, first.id);
  r = await put(meta, [fixturePng(8)]);
  assert.equal(r.statusCode, 200, r.body);
  const reopened = buildApp({
    config: c.config,
    logger: false,
    now: () => new Date("2026-10-23T01:00:00Z"),
  });
  await reopened.app.ready();
  try {
    const restored = await reopened.app.inject({
      method: "GET",
      url,
      headers: { cookie: a.cookie },
    });
    assert.deepEqual(restored.json(), r.json());
  } finally {
    await reopened.app.close();
  }
  assert.equal((await readdir(c.config.garmentRoot!)).length, 1);
  assert.equal((await a.request("DELETE", url)).statusCode, 204);
  assert.deepEqual(await readdir(c.config.garmentRoot!), []);
  assert.equal((await a.request("DELETE", url)).statusCode, 204);
});
test("garment rejects malformed, unsupported, multiple, oversized and missing inputs", async (t) => {
  const { put } = await setup(t);
  for (const [m, imgs, status, code] of [
    [meta, [], 400, "INVALID_INPUT"],
    ["{", [], 400, "INVALID_INPUT"],
    [
      { ...meta, purchaseUrl: "https://user:pass@example.com" },
      [],
      400,
      "INVALID_INPUT",
    ],
    [{ ...meta, brand: "x".repeat(101) }, [], 400, "INVALID_INPUT"],
    [meta, [Buffer.from("<svg/>")], 415, "UNSUPPORTED_IMAGE_FORMAT"],
    [meta, [Buffer.from([255, 216, 1, 2])], 400, "INVALID_IMAGE"],
    [meta, [fixturePng(1), fixturePng(2)], 400, "MULTIPLE_IMAGES"],
    [meta, [Buffer.alloc(10 * 1024 * 1024 + 1)], 413, "PAYLOAD_TOO_LARGE"],
  ] as const) {
    const r = await put(m, [...imgs]);
    assert.equal(r.statusCode, status, r.body);
    assert.equal(r.json().error.code, code);
  }
  const huge = await sharp({
    create: { width: 6400, height: 6400, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const r = await put(meta, [huge]);
  assert.equal(r.statusCode, 413, r.body);
  assert.equal(r.json().error.code, "IMAGE_PIXEL_LIMIT");
});
test("garment ownership, header protection, expiry, reset and session deletion", async (t) => {
  const { c, a, put } = await setup(t);
  assert.equal((await put()).statusCode, 200);
  const b = client(c);
  await b.create();
  assert.deepEqual((await b.request("GET", url)).json(), { garment: null });
  assert.equal((await b.request("GET", url + "/image")).statusCode, 404);
  assert.equal(
    (await c.app.inject({ method: "GET", url: url + "/image" })).statusCode,
    401,
  );
  const f = form();
  assert.equal(
    (
      await c.app.inject({
        method: "PUT",
        url,
        ...f,
        headers: { ...f.headers, cookie: a.cookie },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (await a.request("POST", "/api/onboarding/session/reset", {})).statusCode,
    200,
  );
  assert.deepEqual(await readdir(c.config.garmentRoot!), []);
  assert.equal((await put()).statusCode, 200);
  assert.equal(
    (await a.request("DELETE", "/api/onboarding/session")).statusCode,
    204,
  );
  assert.deepEqual(await readdir(c.config.garmentRoot!), []);
  await a.create();
  await put();
  c.advance(31 * 86400000);
  assert.equal((await a.request("GET", url + "/image")).statusCode, 401);
});
test("concurrent replacements keep final image; DB failures preserve previous file and metadata", async (t) => {
  const { c, a, put } = await setup(t);
  await put();
  const results = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      put({ ...meta, brand: String(i) }, [fixturePng(i + 2)]),
    ),
  );
  for (const r of results) assert.equal(r.statusCode, 200, r.body);
  assert.equal((await readdir(c.config.garmentRoot!)).length, 1);
  const before = (await a.request("GET", url)).body;
  const bytes = (await a.request("GET", url + "/image")).rawPayload;
  c.db.exec(
    "CREATE TRIGGER fail_garment BEFORE UPDATE ON garments BEGIN SELECT RAISE(ABORT,'test'); END",
  );
  assert.equal((await put()).statusCode, 500);
  assert.equal((await a.request("GET", url)).body, before);
  assert.deepEqual((await a.request("GET", url + "/image")).rawPayload, bytes);
  assert.equal((await readdir(c.config.garmentRoot!)).length, 1);
  c.db.exec("DROP TRIGGER fail_garment");
  const row = c.db.prepare("SELECT filename FROM garments").get()!;
  const file = path.join(c.config.garmentRoot!, String(row.filename));
  await rename(file, file + ".away");
  assert.equal((await a.request("DELETE", url)).statusCode, 500);
  assert.equal((await a.request("GET", url)).body, before);
  await rename(file + ".away", file);
  c.db.exec(
    "CREATE TRIGGER fail_session BEFORE DELETE ON onboarding_sessions BEGIN SELECT RAISE(ABORT,'test'); END",
  );
  assert.equal(
    (await a.request("POST", "/api/onboarding/session/reset", {})).statusCode,
    500,
  );
  assert.deepEqual((await a.request("GET", url + "/image")).rawPayload, bytes);
});

test("WebP decode, revoked cookies and cross-origin uploads", async (t) => {
  const { c, a, put } = await setup(t);
  const webp = await sharp(fixturePng(5)).webp().toBuffer();
  assert.equal((await put(meta, [webp])).statusCode, 200);
  const old = a.cookie;
  const f = form();
  const denied = await c.app.inject({
    method: "PUT",
    url,
    payload: f.payload,
    headers: {
      ...f.headers,
      cookie: old,
      "x-onboarding-request": "1",
      origin: "https://other.example",
    },
  });
  assert.equal(denied.statusCode, 403);
  await a.request("POST", "/api/onboarding/session/reset", {});
  assert.equal(
    (
      await c.app.inject({
        method: "GET",
        url: url + "/image",
        headers: { cookie: old },
      })
    ).statusCode,
    401,
  );
  await put();
  const current = a.cookie;
  await a.request("DELETE", "/api/onboarding/session");
  assert.equal(
    (
      await c.app.inject({
        method: "GET",
        url: url + "/image",
        headers: { cookie: current },
      })
    ).statusCode,
    401,
  );
});
