import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { context, client, fixturePng, type Context } from "./helpers.ts";
import { migrate } from "../src/db/migrations.ts";

// GAR-002: one reference garment (pants, skirt, top or outer) with attributes the user confirms.
const url = "/api/onboarding/session/garment";
const meta = (garmentType: string, brand: string | null = null) => ({
  garmentType,
  brand,
  productName: null,
  purchaseUrl: null,
});
function form(metadata: unknown, image?: Buffer) {
  const boundary = "gar002-boundary";
  const parts: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    ),
  ];
  if (image)
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="x.png"\r\nContent-Type: image/png\r\n\r\n`,
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
async function member(c: Context, color = 1) {
  const user = client(c);
  await user.create();
  const put = (metadata: unknown, image?: Buffer) => {
    const f = form(metadata, image);
    return c.app.inject({
      method: "PUT",
      url,
      payload: f.payload,
      headers: {
        ...f.headers,
        cookie: user.cookie,
        "x-onboarding-request": "1",
      },
    });
  };
  const confirm = (body: unknown) =>
    user.request("PUT", url + "/attributes", body);
  const garment = async () => (await user.request("GET", url)).json().garment;
  return { user, put, confirm, garment, photo: fixturePng(color) };
}

test("each garment type saves its own attributes and returns them unchanged on a later visit", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const cases = [
    {
      type: "pants",
      values: {
        color: { base: "navy", tone: "dark", denimWash: "raw_indigo" },
        materialLook: "denim",
        construction: ["five_pocket"],
        silhouette: "straight",
        length: "full",
      },
    },
    {
      type: "skirt",
      values: {
        color: { base: "beige", pattern: "solid" },
        materialLook: "cotton_twill",
        skirtStructure: ["pleated"],
        silhouette: "a_line",
        length: "midi",
      },
    },
    {
      type: "top",
      values: {
        color: { base: "white" },
        materialLook: "oxford_cotton",
        topType: "shirt",
        neckline: "collar",
        sleeve: "long",
        topFit: "regular",
        topLength: "regular",
      },
    },
    {
      type: "outer",
      values: {
        color: { base: "khaki" },
        materialLook: "unknown",
        outerType: "coat_transitional",
        neckline: "collar",
        sleeve: "long",
        topFit: "relaxed",
        topLength: "long",
      },
    },
  ];
  for (const [index, item] of cases.entries()) {
    const m = await member(c, index + 2);
    assert.equal(
      (await m.put(meta(item.type, "브랜드"), m.photo)).statusCode,
      200,
    );
    const saved = await m.confirm({
      garmentType: item.type,
      values: item.values,
      rawText: "  조드퍼즈 느낌  ",
    });
    assert.equal(saved.statusCode, 200, saved.body);
    const again = await m.garment();
    assert.equal(again.garmentType, item.type);
    assert.equal(again.brand, "브랜드");
    assert.deepEqual(again.attributes.values, item.values);
    assert.equal(again.attributes.rawText, "조드퍼즈 느낌");
    assert.equal(again.attributes.needsConfirmation, false);
    assert.equal(again.attributes.vocabularyVersion, "garment-vocab-0.2");
    assert.deepEqual(saved.json().garment, again);
  }
});

test("unanswered axes stay absent, and unknown is kept as an answer", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const m = await member(c);
  await m.put(meta("pants"), m.photo);
  const saved = await m.confirm({
    garmentType: "pants",
    values: {
      color: { base: null, tone: "mid" },
      silhouette: null,
      construction: [],
      length: "unknown",
    },
    rawText: "",
  });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.deepEqual(saved.json().garment.attributes.values, {
    color: { tone: "mid" },
    length: "unknown",
  });
  assert.equal(saved.json().garment.attributes.rawText, null);
});

test("values outside the vocabulary or of another garment type are rejected without changing what was saved", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const m = await member(c);
  await m.put(meta("pants"), m.photo);
  assert.equal(
    (
      await m.confirm({
        garmentType: "pants",
        values: { silhouette: "wide" },
        rawText: null,
      })
    ).statusCode,
    200,
  );
  for (const values of [
    { topType: "shirt" },
    { silhouette: "very_wide" },
    { construction: ["five_pocket", "five_pocket"] },
    { color: { base: "navy", shade: "dark" } },
    { fiberComposition: "cotton 100%" },
  ]) {
    const r = await m.confirm({ garmentType: "pants", values, rawText: null });
    assert.equal(r.statusCode, 400, JSON.stringify(values));
    assert.equal(r.json().error.code, "INVALID_INPUT");
    assert.ok(
      r
        .json()
        .error.issues.every((i: { path: string }) =>
          i.path.startsWith("values"),
        ),
    );
  }
  const stale = await m.confirm({
    garmentType: "skirt",
    values: {},
    rawText: null,
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().error.code, "GARMENT_TYPE_CHANGED");
  assert.deepEqual((await m.garment()).attributes.values, {
    silhouette: "wide",
  });
});

test("changing the garment type keeps only shared attributes and asks to confirm again", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const m = await member(c);
  await m.put(meta("pants", "브랜드"), m.photo);
  await m.confirm({
    garmentType: "pants",
    values: {
      color: { base: "black" },
      materialLook: "suiting",
      construction: ["tailored_trouser"],
      silhouette: "wide",
    },
    rawText: "울 블렌드라고 적혀 있음",
  });
  const switched = await m.put(meta("top", "브랜드"));
  assert.equal(switched.statusCode, 200, switched.body);
  const attributes = switched.json().garment.attributes;
  assert.deepEqual(attributes.values, {
    color: { base: "black" },
    materialLook: "suiting",
  });
  assert.equal(attributes.rawText, "울 블렌드라고 적혀 있음");
  assert.equal(attributes.needsConfirmation, true);
  const confirmed = await m.confirm({
    garmentType: "top",
    values: { ...attributes.values, topType: "knit_sweater" },
    rawText: attributes.rawText,
  });
  assert.equal(confirmed.json().garment.attributes.needsConfirmation, false);
});

test("a new photo asks to confirm again; editing only the brand does not", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const m = await member(c);
  await m.put(meta("skirt"), m.photo);
  await m.confirm({
    garmentType: "skirt",
    values: { length: "mini" },
    rawText: null,
  });
  const edited = await m.put(meta("skirt", "새 브랜드"));
  assert.equal(edited.json().garment.attributes.needsConfirmation, false);
  const replaced = await m.put(meta("skirt", "새 브랜드"), fixturePng(9));
  const attributes = replaced.json().garment.attributes;
  assert.equal(attributes.needsConfirmation, true);
  assert.deepEqual(attributes.values, { length: "mini" });
});

test("attributes belong to the account: others cannot read or write them, and deletion removes them", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  c.config.auth.deletionGraceSeconds = 0;
  const a = await member(c, 3);
  const b = await member(c, 4);
  await a.put(meta("outer"), a.photo);
  await a.confirm({
    garmentType: "outer",
    values: { outerType: "blazer" },
    rawText: null,
  });
  assert.equal(await b.garment(), null);
  const foreign = await b.confirm({
    garmentType: "outer",
    values: { outerType: "cardigan" },
    rawText: null,
  });
  assert.equal(foreign.statusCode, 404);
  assert.equal(foreign.json().error.code, "GARMENT_NOT_FOUND");
  assert.equal(
    (await c.app.inject({ method: "PUT", url: url + "/attributes" }))
      .statusCode,
    403,
  );
  assert.deepEqual((await a.garment()).attributes.values, {
    outerType: "blazer",
  });
  const count = () =>
    Number(
      c.db.prepare("SELECT count(*) n FROM wardrobe_item_attributes").get()![
        "n"
      ],
    );
  assert.equal((await a.user.request("DELETE", url)).statusCode, 204);
  assert.equal(count(), 0);
  await b.put(meta("top"), b.photo);
  await b.confirm({
    garmentType: "top",
    values: { sleeve: "short" },
    rawText: null,
  });
  assert.equal(count(), 1);
  assert.equal(
    (await b.user.request("DELETE", "/api/auth/account", {})).statusCode,
    204,
  );
  assert.equal(count(), 0);
});

test("migration v8 keeps an existing pants garment and adds no attributes", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "gar002-migration-"));
  const db = new DatabaseSync(path.join(directory, "v7.sqlite"), {
    enableForeignKeyConstraints: true,
  });
  t.after(async () => {
    db.close();
    await rm(directory, { recursive: true, force: true });
  });
  migrate(db, 7);
  db.exec(
    `INSERT INTO onboarding_sessions(id,token_hash,started_at,updated_at,expires_at) VALUES('s1','${"a".repeat(64)}','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z','2026-12-01T00:00:00.000Z');
     INSERT INTO garments VALUES('s1','g1','pants','브랜드',NULL,NULL,'f.png',8,12,'2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z');`,
  );
  migrate(db, 8);
  assert.equal(db.prepare("PRAGMA user_version").get()!["user_version"], 8);
  assert.deepEqual(
    { ...db.prepare("SELECT * FROM garments").get() },
    {
      session_id: "s1",
      id: "g1",
      garment_type: "pants",
      brand: "브랜드",
      product_name: null,
      purchase_url: null,
      filename: "f.png",
      width: 8,
      height: 12,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
    },
  );
  assert.equal(
    db.prepare("SELECT count(*) n FROM garment_attributes").get()!["n"],
    0,
  );
  // The rebuilt table keeps its cascade from the onboarding session.
  db.exec("DELETE FROM onboarding_sessions WHERE id='s1'");
  assert.equal(db.prepare("SELECT count(*) n FROM garments").get()!["n"], 0);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
});
