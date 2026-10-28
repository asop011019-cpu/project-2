import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { client, context, fixturePng, type Context } from "./helpers.ts";
import { migrate } from "../src/db/migrations.ts";

// COND-001: temperature range, occasion, formality and extra-purchase budget for recommendations.
const url = "/api/onboarding/session/conditions";
const unset = {
  temperatureC: null,
  occasions: null,
  formality: null,
  additionalBudgetKrw: null,
};
async function member(c: Context) {
  const user = client(c);
  await user.create();
  const put = (body: unknown) => user.request("PUT", url, body);
  const get = async () => (await user.request("GET", url)).json().conditions;
  return { user, put, get };
}
async function putGarment(c: Context, cookie: string, garmentType: string) {
  const form = new FormData();
  form.set(
    "metadata",
    JSON.stringify({
      garmentType,
      brand: null,
      productName: null,
      purchaseUrl: null,
    }),
  );
  form.set(
    "image",
    new Blob([new Uint8Array(fixturePng(7))], { type: "image/png" }),
    "x.png",
  );
  const request = new Request("http://localhost/", {
    method: "PUT",
    body: form,
  });
  const response = await c.app.inject({
    method: "PUT",
    url: "/api/onboarding/session/garment",
    payload: Buffer.from(await request.arrayBuffer()),
    headers: {
      "content-type": request.headers.get("content-type")!,
      cookie,
      "x-onboarding-request": "1",
    },
  });
  assert.equal(response.statusCode, 200, response.body);
}
const rows = (c: Context) =>
  Number(
    c.db.prepare("SELECT count(*) n FROM recommendation_conditions").get()![
      "n"
    ],
  );

test("conditions start unanswered and come back as saved, also after a restart", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const m = await member(c);
  assert.deepEqual(await m.get(), { ...unset, updatedAt: null });
  const body = {
    temperatureC: { min: 8, max: 20 },
    occasions: ["work_school"],
    formality: 60,
    additionalBudgetKrw: 150000,
  };
  const saved = await m.put(body);
  assert.equal(saved.statusCode, 200, saved.body);
  assert.deepEqual(saved.json().conditions, {
    ...body,
    updatedAt: "2026-10-23T01:00:00.000Z",
  });
  assert.deepEqual(await m.get(), saved.json().conditions);
  // Another app instance on the same database file reads the same values.
  const { buildApp } = await import("../src/app.ts");
  const again = buildApp({
    config: c.config,
    now: () => new Date("2026-10-23T02:00:00.000Z"),
    logger: false,
    oauthProvider: c.kakao,
  });
  await again.app.ready();
  const restored = await again.app.inject({
    method: "GET",
    url,
    headers: { cookie: m.user.cookie },
  });
  await again.app.close();
  assert.deepEqual(restored.json().conditions, saved.json().conditions);
});

test("not answered (null) and any stay distinct, and clearing everything removes the row", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const m = await member(c);
  const anyAll = {
    temperatureC: "any",
    occasions: "any",
    formality: "any",
    additionalBudgetKrw: "any",
  };
  assert.equal((await m.put(anyAll)).statusCode, 200);
  assert.deepEqual(await m.get(), {
    ...anyAll,
    updatedAt: "2026-10-23T01:00:00.000Z",
  });
  const mixed = {
    ...unset,
    formality: "any",
    temperatureC: { min: 25, max: 25 },
  };
  assert.equal((await m.put(mixed)).statusCode, 200);
  const { updatedAt: _, ...values } = await m.get();
  assert.deepEqual(values, mixed);
  assert.equal(rows(c), 1);
  const cleared = await m.put(unset);
  assert.equal(cleared.statusCode, 200);
  assert.deepEqual(cleared.json().conditions, { ...unset, updatedAt: null });
  assert.equal(rows(c), 0);
});

test("saving the same values again keeps updatedAt; a change moves it", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const m = await member(c);
  const body = { ...unset, occasions: ["daily"] };
  await m.put(body);
  c.advance(60_000);
  assert.equal(
    (await m.put(body)).json().conditions.updatedAt,
    "2026-10-23T01:00:00.000Z",
  );
  assert.equal(
    (await m.put({ ...body, formality: 10 })).json().conditions.updatedAt,
    "2026-10-23T01:01:00.000Z",
  );
});

test("values outside the contract are rejected and leave what was saved", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const m = await member(c);
  const good = {
    temperatureC: { min: -5, max: 5 },
    occasions: ["formal_event"],
    formality: 90,
    additionalBudgetKrw: 300000,
  };
  await m.put(good);
  const cases: [string, unknown][] = [
    ["temperatureC", { min: 10, max: 5 }],
    ["temperatureC", { min: -21, max: 0 }],
    ["temperatureC", { min: 0, max: 41 }],
    ["temperatureC", { min: 0.5, max: 10 }],
    ["temperatureC", { min: 0 }],
    ["temperatureC", { min: 0, max: 10, unit: "F" }],
    ["temperatureC", "spring"],
    ["occasions", []],
    ["occasions", ["daily", "outdoor"]],
    ["occasions", ["any"]],
    ["occasions", ["party"]],
    ["occasions", "daily"],
    ["formality", -1],
    ["formality", 101],
    ["formality", 50.5],
    ["formality", "50"],
    ["additionalBudgetKrw", -1],
    ["additionalBudgetKrw", 5000001],
    ["additionalBudgetKrw", 15000.5],
    ["additionalBudgetKrw", -10000],
    ["additionalBudgetKrw", "50000"],
    ["additionalBudgetKrw", "0"],
  ];
  for (const [field, value] of cases) {
    const r = await m.put({ ...good, [field]: value });
    assert.equal(r.statusCode, 400, `${field} ${JSON.stringify(value)}`);
    assert.equal(r.json().error.code, "INVALID_INPUT");
    assert.ok(
      r
        .json()
        .error.issues.every((i: { path: string }) => i.path.startsWith(field)),
      `${field}: ${r.body}`,
    );
  }
  const { formality: _, ...missing } = good;
  assert.equal((await m.put(missing)).statusCode, 400);
  assert.equal((await m.put({ ...good, seasons: ["spring"] })).statusCode, 400);
  const { updatedAt: __, ...values } = await m.get();
  assert.deepEqual(values, good);
});

test("conditions belong to the account and need its progress, login and request header", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const a = await member(c);
  const b = await member(c);
  await a.put({ ...unset, formality: 30 });
  assert.deepEqual(await b.get(), { ...unset, updatedAt: null });
  await b.put({ ...unset, formality: 80 });
  assert.equal((await a.get()).formality, 30);
  const anonymous = await c.app.inject({ method: "GET", url });
  assert.equal(anonymous.statusCode, 401);
  assert.equal(anonymous.json().error.code, "AUTH_REQUIRED");
  const noHeader = await c.app.inject({
    method: "PUT",
    url,
    payload: unset,
    headers: { cookie: a.user.cookie },
  });
  assert.equal(noHeader.statusCode, 403);
  const fresh = client(c);
  await fresh.login("9301");
  const noProgress = await fresh.request("PUT", url, unset);
  assert.equal(noProgress.statusCode, 401);
  assert.equal(noProgress.json().error.code, "SESSION_REQUIRED");
  assert.deepEqual((await fresh.request("GET", url)).json().conditions, {
    ...unset,
    updatedAt: null,
  });
});

test("category switches and garment changes keep the conditions", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const m = await member(c);
  const body = { ...unset, occasions: ["outdoor"], additionalBudgetKrw: 50000 };
  await m.put(body);
  for (const categoryId of ["menswear", "womenswear"])
    assert.equal(
      (
        await m.user.request("PUT", "/api/onboarding/session/category", {
          categoryId,
        })
      ).statusCode,
      200,
    );
  await putGarment(c, m.user.cookie, "pants");
  await putGarment(c, m.user.cookie, "skirt");
  assert.equal(
    (await m.user.request("DELETE", "/api/onboarding/session/garment"))
      .statusCode,
    204,
  );
  const { updatedAt: _, ...values } = await m.get();
  assert.deepEqual(values, body);
});

test("deleting or resetting progress and deleting the account remove the conditions", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  c.config.auth.deletionGraceSeconds = 0;
  const body = { ...unset, formality: 50 };
  const reset = await member(c);
  await reset.put(body);
  assert.equal(
    (await reset.user.request("POST", "/api/onboarding/session/reset", {}))
      .statusCode,
    200,
  );
  assert.deepEqual(await reset.get(), { ...unset, updatedAt: null });
  const deleted = await member(c);
  await deleted.put(body);
  assert.equal(
    (await deleted.user.request("DELETE", "/api/onboarding/session"))
      .statusCode,
    204,
  );
  const withdrawn = await member(c);
  await withdrawn.put(body);
  assert.equal(rows(c), 1);
  assert.equal(
    (await withdrawn.user.request("DELETE", "/api/auth/account", {}))
      .statusCode,
    204,
  );
  assert.equal(rows(c), 0);
});

test("an account restored during the deletion grace keeps its conditions", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const user = client(c);
  await user.login("9401");
  await user.create();
  await user.request("PUT", url, { ...unset, formality: 70 });
  assert.equal(
    (await user.request("DELETE", "/api/auth/account", {})).statusCode,
    204,
  );
  const start = await user.request("GET", "/api/auth/kakao/start?returnTo=/");
  const state = new URL(String(start.headers.location)).searchParams.get(
    "state",
  )!;
  const back = await user.request(
    "GET",
    `/api/auth/kakao/callback?code=user-9401&state=${state}`,
  );
  assert.equal(String(back.headers.location), "/restore");
  assert.equal(
    (await user.request("POST", "/api/auth/restore", {})).statusCode,
    200,
  );
  assert.equal(
    (await user.request("GET", url)).json().conditions.formality,
    70,
  );
});

test("migration v9 adds the conditions table and keeps existing progress", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "cond001-migration-"));
  const db = new DatabaseSync(path.join(directory, "v8.sqlite"), {
    enableForeignKeyConstraints: true,
  });
  t.after(async () => {
    db.close();
    await rm(directory, { recursive: true, force: true });
  });
  migrate(db, 8);
  db.exec(
    `INSERT INTO onboarding_sessions(id,token_hash,started_at,updated_at,expires_at) VALUES('s1','${"a".repeat(64)}','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z','2026-12-01T00:00:00.000Z');`,
  );
  migrate(db, 9);
  assert.equal(db.prepare("PRAGMA user_version").get()!["user_version"], 9);
  assert.equal(
    db.prepare("SELECT count(*) n FROM onboarding_sessions").get()!["n"],
    1,
  );
  db.exec(
    `INSERT INTO recommendation_conditions VALUES('s1','conditions-0.1','{"formality":10}','2026-10-01T00:00:00.000Z')`,
  );
  db.exec("DELETE FROM onboarding_sessions WHERE id='s1'");
  assert.equal(
    db.prepare("SELECT count(*) n FROM recommendation_conditions").get()!["n"],
    0,
  );
});
