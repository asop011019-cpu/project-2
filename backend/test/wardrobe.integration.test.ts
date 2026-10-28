import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { context, client, fixturePng, type Context } from "./helpers.ts";
import { migrate } from "../src/db/migrations.ts";
import {
  allowedCandidates,
  budgetMode,
  ownedOnlyCheck,
  purchaseTotalKrw,
} from "../src/modules/wardrobe/policy.ts";

// WARD-001: saved photos build up the account's wardrobe; the progress points at one of them.
const garment = "/api/onboarding/session/garment";
const meta = (garmentType: string, extra: Record<string, unknown> = {}) => ({
  garmentType,
  brand: null,
  productName: null,
  purchaseUrl: null,
  ...extra,
});
function form(metadata: unknown, image?: Buffer) {
  const boundary = "ward001-boundary";
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
async function member(c: Context, subject?: string) {
  const user = client(c);
  await user.login(subject);
  const put = (metadata: unknown, image?: Buffer) => {
    const f = form(metadata, image);
    return c.app.inject({
      method: "PUT",
      url: garment,
      payload: f.payload,
      headers: {
        ...f.headers,
        cookie: user.cookie,
        "x-onboarding-request": "1",
      },
    });
  };
  const wardrobe = async () =>
    (await user.request("GET", "/api/wardrobe")).json();
  const reference = async () =>
    (await user.request("GET", garment)).json().garment;
  return { user, put, wardrobe, reference };
}
const files = async (c: Context) =>
  (await readdir(c.config.garmentRoot!).catch(() => [])).length;

test("each saved garment joins the wardrobe; a retry with the same id adds nothing", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const m = await member(c);
  assert.deepEqual(await m.wardrobe(), { items: [], referenceItemId: null });
  // Choosing a photo is not registering it: only a 200 save adds it.
  const failed = await m.put(meta("pants"), Buffer.from("not an image"));
  assert.equal(failed.statusCode, 415);
  assert.equal((await m.wardrobe()).items.length, 0);

  const pantsId = randomUUID();
  const first = await m.put(meta("pants", { itemId: pantsId }), fixturePng(1));
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().garment.id, pantsId);
  const retry = await m.put(meta("pants", { itemId: pantsId }), fixturePng(1));
  assert.equal(retry.statusCode, 200);
  assert.equal((await m.wardrobe()).items.length, 1);
  assert.equal(await files(c), 1);

  // Registering a different garment is a new item and the new reference; the old one stays.
  const topId = randomUUID();
  assert.equal(
    (await m.put(meta("top", { itemId: topId }), fixturePng(1))).statusCode,
    200,
  );
  let list = await m.wardrobe();
  assert.deepEqual(
    list.items.map((i: { id: string }) => i.id).sort(),
    [pantsId, topId].sort(),
  );
  assert.equal(list.referenceItemId, topId);
  assert.equal(await files(c), 2);
  const pants = list.items.find((i: { id: string }) => i.id === pantsId);
  assert.equal(pants.imageUrl, `/api/wardrobe/items/${pantsId}/image`);
  assert.equal(
    (await m.user.request("GET", pants.imageUrl)).headers["content-type"],
    "image/png",
  );

  // Earlier clients (no itemId) edit the current reference, never another item.
  const edited = await m.put(meta("top", { brand: "브랜드" }));
  assert.equal(edited.json().garment.id, topId);
  list = await m.wardrobe();
  assert.equal(list.items.length, 2);
  assert.equal(
    list.items.find((i: { id: string }) => i.id === pantsId).brand,
    null,
  );

  // Choosing the reference, then a photo replacement, touch only that item.
  const chosen = await m.user.request("PUT", garment + "/reference", {
    itemId: pantsId,
  });
  assert.equal(chosen.statusCode, 200, chosen.body);
  assert.equal(chosen.json().garment.id, pantsId);
  const topImage = (
    await m.user.request("GET", `/api/wardrobe/items/${topId}/image`)
  ).rawPayload;
  await m.put(meta("pants", { itemId: pantsId }), fixturePng(7));
  assert.deepEqual(
    (await m.user.request("GET", `/api/wardrobe/items/${topId}/image`))
      .rawPayload,
    topImage,
  );
  assert.equal(await files(c), 2);
  assert.equal(
    (
      await m.user.request("PUT", garment + "/attributes", {
        garmentType: "pants",
        values: { length: "ankle" },
        rawText: null,
      })
    ).statusCode,
    200,
  );
  list = await m.wardrobe();
  assert.equal(
    list.items.find((i: { id: string }) => i.id === topId).attributes,
    null,
  );

  // A first photo without an id still works and becomes the reference.
  const other = await member(c);
  const legacy = await other.put(meta("skirt"), fixturePng(3));
  assert.equal(legacy.statusCode, 200);
  assert.equal(
    (await other.wardrobe()).referenceItemId,
    legacy.json().garment.id,
  );
});

test("deleting one item removes only its photo; deleting the reference leaves no reference", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const m = await member(c);
  const a = randomUUID(),
    b = randomUUID();
  await m.put(meta("top", { itemId: a }), fixturePng(1));
  await m.put(meta("pants", { itemId: b }), fixturePng(2));
  const fileOf = (id: string) =>
    path.join(
      c.config.garmentRoot!,
      String(
        c.db.prepare("SELECT filename FROM wardrobe_items WHERE id=?").get(id)![
          "filename"
        ],
      ),
    );
  const fileA = fileOf(a),
    fileB = fileOf(b);
  assert.equal(
    (await m.user.request("DELETE", `/api/wardrobe/items/${a}`)).statusCode,
    204,
  );
  assert.equal(existsSync(fileA), false);
  assert.equal(existsSync(fileB), true);
  assert.equal((await m.wardrobe()).referenceItemId, b);
  assert.equal(
    (await m.user.request("DELETE", `/api/wardrobe/items/${a}`)).statusCode,
    404,
  );
  assert.equal(
    (await m.user.request("DELETE", `/api/wardrobe/items/${b}`)).statusCode,
    204,
  );
  assert.equal(await m.reference(), null);
  assert.deepEqual(await m.wardrobe(), { items: [], referenceItemId: null });
  assert.equal(await files(c), 0);
});

test("another account's items are invisible and untouchable, even by id", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const a = await member(c);
  const b = await member(c);
  const id = randomUUID();
  await a.put(meta("top", { itemId: id }), fixturePng(1));
  const before = (await a.wardrobe()).items;
  assert.deepEqual(await b.wardrobe(), { items: [], referenceItemId: null });
  const attempts = [
    await b.user.request("GET", `/api/wardrobe/items/${id}/image`),
    await b.user.request("DELETE", `/api/wardrobe/items/${id}`),
    await b.user.request("PUT", garment + "/reference", { itemId: id }),
    await b.put(meta("pants", { itemId: id }), fixturePng(9)),
    await b.put(meta("pants", { itemId: id })),
    await b.put(meta("pants", { itemId: randomUUID() })),
  ];
  // Without a photo another account's id answers exactly like an unknown id (400 image).
  assert.deepEqual(
    attempts.map((r) => r.statusCode),
    [404, 404, 404, 404, 400, 400],
  );
  assert.deepEqual((await a.wardrobe()).items, before);
  assert.equal(await b.reference(), null);
  assert.equal(await files(c), 1);
  // Without a login nothing is readable.
  for (const url of ["/api/wardrobe", `/api/wardrobe/items/${id}/image`])
    assert.equal((await c.app.inject({ method: "GET", url })).statusCode, 401);
  assert.equal(
    (await b.user.request("GET", "/api/wardrobe/items/not-a-uuid/image"))
      .statusCode,
    404,
  );
});

test("logging in again restores the wardrobe; a progress reset keeps it", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const m = await member(c, "8101");
  const id = randomUUID();
  await m.put(meta("outer", { itemId: id }), fixturePng(4));
  assert.equal(
    (await m.user.request("POST", "/api/onboarding/session/reset", {}))
      .statusCode,
    200,
  );
  assert.deepEqual(
    (await m.wardrobe()).items.map((i: { id: string }) => i.id),
    [id],
  );
  assert.equal(await m.reference(), null);
  assert.equal(
    (await m.user.request("POST", "/api/auth/logout", {})).statusCode,
    204,
  );
  assert.equal((await m.user.request("GET", "/api/wardrobe")).statusCode, 401);
  const again = await member(c, "8101");
  const list = await again.wardrobe();
  assert.deepEqual(
    list.items.map((i: { id: string }) => i.id),
    [id],
  );
  assert.equal(list.referenceItemId, null);
  assert.equal(
    (
      await again.user.request("PUT", garment + "/reference", { itemId: id })
    ).json().garment.id,
    id,
  );
});

test("a failed save leaves no item and no photo; a failed delete keeps both", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const m = await member(c);
  const kept = randomUUID();
  await m.put(meta("top", { itemId: kept }), fixturePng(1));
  c.db.exec(
    "CREATE TRIGGER fail_insert BEFORE INSERT ON wardrobe_items BEGIN SELECT RAISE(ABORT,'test'); END",
  );
  const fresh = randomUUID();
  assert.equal(
    (await m.put(meta("pants", { itemId: fresh }), fixturePng(2))).statusCode,
    500,
  );
  c.db.exec("DROP TRIGGER fail_insert");
  assert.equal((await m.wardrobe()).items.length, 1);
  assert.equal((await m.wardrobe()).referenceItemId, kept);
  assert.equal(await files(c), 1);
  c.db.exec(
    "CREATE TRIGGER fail_delete BEFORE DELETE ON wardrobe_items BEGIN SELECT RAISE(ABORT,'test'); END",
  );
  assert.equal(
    (await m.user.request("DELETE", `/api/wardrobe/items/${kept}`)).statusCode,
    500,
  );
  c.db.exec("DROP TRIGGER fail_delete");
  assert.equal((await m.wardrobe()).items.length, 1);
  assert.equal(
    (await m.user.request("GET", `/api/wardrobe/items/${kept}/image`))
      .statusCode,
    200,
  );
});

test("account deletion removes every wardrobe item and photo, other accounts keep theirs", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  c.config.auth.deletionGraceSeconds = 0;
  const gone = await member(c);
  const stays = await member(c);
  await gone.put(meta("top", { itemId: randomUUID() }), fixturePng(1));
  await gone.put(meta("pants", { itemId: randomUUID() }), fixturePng(2));
  await stays.put(meta("skirt", { itemId: randomUUID() }), fixturePng(3));
  assert.equal(
    (await gone.user.request("DELETE", "/api/auth/account", {})).statusCode,
    204,
  );
  await c.auth.processDeletions();
  assert.equal(
    Number(c.db.prepare("SELECT count(*) n FROM wardrobe_items").get()!["n"]),
    1,
  );
  assert.equal(await files(c), 1);
  assert.equal((await stays.wardrobe()).items.length, 1);
});

test("0 won is its own answer; the check uses the account's wardrobe on the server", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const m = await member(c);
  const check = async () =>
    (
      await m.user.request(
        "GET",
        "/api/onboarding/session/recommendation-check",
      )
    ).json();
  const conditions = (additionalBudgetKrw: unknown) =>
    m.user.request("PUT", "/api/onboarding/session/conditions", {
      temperatureC: null,
      occasions: null,
      formality: null,
      additionalBudgetKrw,
    });
  // No progress yet: nothing answered, nothing blocked.
  assert.deepEqual(await check(), {
    budgetMode: "unanswered",
    blockedReason: null,
    missing: [],
    wardrobeCount: 0,
  });
  await m.user.request("POST", "/api/onboarding/session", {});
  for (const [value, mode] of [
    [null, "unanswered"],
    ["any", "any"],
    [1, "purchase"],
    [9999, "purchase"],
    [0, "owned_only"],
  ] as const) {
    const saved = await conditions(value);
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(saved.json().conditions.additionalBudgetKrw, value);
    assert.equal((await check()).budgetMode, mode);
  }
  assert.deepEqual(await check(), {
    budgetMode: "owned_only",
    blockedReason: "WARDROBE_EMPTY",
    missing: ["top", "bottom"],
    wardrobeCount: 0,
  });
  await m.put(meta("pants", { itemId: randomUUID() }), fixturePng(1));
  await m.put(meta("outer", { itemId: randomUUID() }), fixturePng(2));
  assert.deepEqual(await check(), {
    budgetMode: "owned_only",
    blockedReason: "WARDROBE_INSUFFICIENT",
    missing: ["top"],
    wardrobeCount: 2,
  });
  const top = randomUUID();
  await m.put(meta("top", { itemId: top }), fixturePng(3));
  assert.equal((await check()).blockedReason, null);
  // Deleting the only top makes it insufficient again.
  await m.user.request("DELETE", `/api/wardrobe/items/${top}`);
  assert.deepEqual((await check()).missing, ["top"]);
  // A positive budget is never blocked by the wardrobe.
  await conditions(50_000);
  assert.equal((await check()).blockedReason, null);
});

test("budget policy: 0 won keeps only owned items; owned items never count as purchases", () => {
  assert.equal(budgetMode(null), "unanswered");
  assert.equal(budgetMode("any"), "any");
  assert.equal(budgetMode(0), "owned_only");
  assert.equal(budgetMode(1), "purchase");
  assert.deepEqual(ownedOnlyCheck(["skirt", "top"]), {
    blockedReason: null,
    missing: [],
  });
  const owned = new Set(["mine"]);
  const candidates = [
    { source: "owned", itemId: "mine" },
    { source: "owned", itemId: "deleted-or-someone-else" },
    { source: "product", productId: "free", priceKrw: 0 },
    { source: "product", productId: "coat", priceKrw: 80_000 },
    { source: "product", productId: "unknown", priceKrw: null },
  ] as const;
  assert.deepEqual(allowedCandidates(0, owned, [...candidates]), [
    candidates[0],
  ]);
  assert.deepEqual(
    allowedCandidates(100_000, owned, [...candidates]).map((c) =>
      c.source === "owned" ? c.itemId : c.productId,
    ),
    ["mine", "free", "coat", "unknown"],
  );
  assert.deepEqual(purchaseTotalKrw([...candidates]), {
    total: 80_000,
    complete: false,
  });
  assert.deepEqual(purchaseTotalKrw([candidates[0], candidates[3]]), {
    total: 80_000,
    complete: true,
  });
});

test("migration v10 moves account garments into the wardrobe without losing anything", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "ward001-migration-"));
  const db = new DatabaseSync(path.join(directory, "v9.sqlite"), {
    enableForeignKeyConstraints: true,
  });
  t.after(async () => {
    db.close();
    await rm(directory, { recursive: true, force: true });
  });
  migrate(db, 9);
  const at = "2026-10-01T00:00:00.000Z";
  db.exec(
    `INSERT INTO users VALUES('u1','active','${at}',NULL);
     INSERT INTO onboarding_sessions(id,token_hash,started_at,updated_at,expires_at,user_id) VALUES('s1','${"a".repeat(64)}','${at}','${at}','2026-12-01T00:00:00.000Z','u1');
     INSERT INTO onboarding_sessions(id,token_hash,started_at,updated_at,expires_at) VALUES('s2','${"b".repeat(64)}','${at}','${at}','2026-12-01T00:00:00.000Z');
     INSERT INTO garments VALUES('s1','g1','top','브랜드','이름','https://shop.example/x','f1.png',8,12,'${at}','2026-10-02T00:00:00.000Z');
     INSERT INTO garments VALUES('s2','g2','pants',NULL,NULL,NULL,'f2.png',8,12,'${at}','${at}');
     INSERT INTO garment_attributes VALUES('s1','top','garment-attributes-0.2','{"sleeve":"short"}','메모','f1.png','${at}');`,
  );
  migrate(db, 10);
  assert.equal(db.prepare("PRAGMA user_version").get()!["user_version"], 10);
  assert.deepEqual(
    { ...db.prepare("SELECT * FROM wardrobe_items").get() },
    {
      id: "g1",
      user_id: "u1",
      garment_type: "top",
      brand: "브랜드",
      product_name: "이름",
      purchase_url: "https://shop.example/x",
      filename: "f1.png",
      width: 8,
      height: 12,
      created_at: at,
      updated_at: "2026-10-02T00:00:00.000Z",
    },
  );
  assert.deepEqual(
    { ...db.prepare("SELECT * FROM wardrobe_item_attributes").get() },
    {
      item_id: "g1",
      garment_type: "top",
      vocabulary_version: "garment-attributes-0.2",
      values_json: '{"sleeve":"short"}',
      raw_text: "메모",
      confirmed_image: "f1.png",
      updated_at: at,
    },
  );
  assert.deepEqual(
    { ...db.prepare("SELECT * FROM reference_garments").get() },
    { session_id: "s1", item_id: "g1" },
  );
  // The anonymous progress (no account) keeps its row where it was.
  assert.deepEqual(
    db
      .prepare("SELECT session_id AS s FROM garments")
      .all()
      .map((r) => r["s"]),
    ["s2"],
  );
  assert.equal(
    Number(db.prepare("SELECT count(*) n FROM garment_attributes").get()!["n"]),
    0,
  );
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  // Deleting the progress keeps the account's wardrobe; deleting the account removes it.
  db.exec("DELETE FROM onboarding_sessions WHERE id='s1'");
  assert.equal(
    Number(db.prepare("SELECT count(*) n FROM wardrobe_items").get()!["n"]),
    1,
  );
  assert.equal(
    Number(db.prepare("SELECT count(*) n FROM reference_garments").get()!["n"]),
    0,
  );
  db.exec("DELETE FROM users WHERE id='u1'");
  assert.equal(
    Number(db.prepare("SELECT count(*) n FROM wardrobe_items").get()!["n"]),
    0,
  );
});
