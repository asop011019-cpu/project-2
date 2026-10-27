import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { client, context, fixturePng, type Context } from "./helpers.ts";

// AUTH-004-R2 (user decision 2026-10-27): withdrawal completes at once, data is kept for a
// 30-day grace in which logging in again can restore the account, then deletion runs.
const DAY = 24 * 60 * 60 * 1000;

async function putGarment(c: Context, cookie: string) {
  const form = new FormData();
  form.set(
    "metadata",
    JSON.stringify({
      garmentType: "pants",
      brand: null,
      productName: null,
      purchaseUrl: null,
    }),
  );
  form.set(
    "image",
    new Blob([new Uint8Array(fixturePng(33))], { type: "image/png" }),
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
      origin: c.config.publicOrigin,
    },
  });
  assert.equal(response.statusCode, 200, response.body);
}
async function kakaoLogin(user: ReturnType<typeof client>, subject: string) {
  const start = await user.request(
    "GET",
    "/api/auth/kakao/start?returnTo=/garment",
  );
  const state = new URL(String(start.headers.location)).searchParams.get(
    "state",
  )!;
  const back = await user.request(
    "GET",
    `/api/auth/kakao/callback?code=user-${subject}&state=${state}`,
  );
  return String(back.headers.location);
}
async function withdrawn(c: Context, subject: string) {
  const user = client(c);
  await user.login(subject);
  await user.create();
  await putGarment(c, user.cookie);
  const userId = (await user.request("GET", "/api/auth/me")).json().user
    .id as string;
  const photo = path.join(
    c.config.garmentRoot!,
    String(c.db.prepare("SELECT filename FROM garments").get()!["filename"]),
  );
  assert.equal(
    (await user.request("DELETE", "/api/auth/account", {})).statusCode,
    204,
  );
  return { user, userId, photo };
}

test("withdrawal locks the account at once but keeps data for 30 days", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const { user, userId, photo } = await withdrawn(c, "7001");
  assert.equal((await user.request("GET", "/api/auth/me")).statusCode, 401);
  const job = c.db
    .prepare(
      "SELECT stage, scheduled_at AS scheduledAt FROM account_deletions WHERE user_id=?",
    )
    .get(userId)!;
  assert.equal(job["stage"], "pending");
  assert.equal(
    job["scheduledAt"],
    new Date(Date.parse("2026-10-23T01:00:00.000Z") + 30 * DAY).toISOString(),
  );
  c.advance(29 * DAY);
  await c.auth.processDeletions();
  assert.equal(existsSync(photo), true);
  assert.equal(
    c.db.prepare("SELECT status FROM users WHERE id=?").get(userId)!["status"],
    "deleting",
  );
});

test("logging in again within 30 days offers a restore; confirming brings everything back", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const { userId, photo } = await withdrawn(c, "7002");
  c.advance(10 * DAY);
  const back = client(c);
  assert.equal(await kakaoLogin(back, "7002"), "/restore");
  // Nothing is restored until the user confirms.
  assert.equal((await back.request("GET", "/api/auth/me")).statusCode, 401);
  const pending = await back.request("GET", "/api/auth/restore/pending");
  assert.equal(pending.statusCode, 200);
  assert.equal(
    pending.json().deletionScheduledAt,
    new Date(Date.parse("2026-10-23T01:00:00.000Z") + 30 * DAY).toISOString(),
  );
  const restored = await back.request("POST", "/api/auth/restore", {});
  assert.equal(restored.statusCode, 200);
  assert.deepEqual(restored.json(), {
    user: { id: userId },
    returnTo: "/garment",
  });
  const me = (await back.request("GET", "/api/auth/me")).json();
  assert.equal(me.user.id, userId);
  // Ten days on, the 30-day retention wording (privacy v2) is in force: accept it first.
  assert.deepEqual(me.consentUpdates, [
    { key: "privacy_required", version: 2 },
  ]);
  assert.equal(
    (await back.request("GET", "/api/onboarding/session/garment/image"))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await back.request("PUT", "/api/auth/consents", {
        key: "privacy_required",
        version: 2,
        granted: true,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await back.request("GET", "/api/onboarding/session/garment/image"))
      .statusCode,
    200,
  );
  assert.equal(existsSync(photo), true);
  assert.equal(
    Number(
      c.db.prepare("SELECT count(*) n FROM account_deletions").get()!["n"],
    ),
    0,
  );
  // The restore handshake is single-use.
  assert.equal(
    (await back.request("POST", "/api/auth/restore", {})).statusCode,
    410,
  );
  // Later sweeps never delete the restored account.
  c.advance(40 * DAY);
  await c.auth.processDeletions();
  assert.equal(existsSync(photo), true);
});

test("after 30 days the data is deleted and the same Kakao member can join as a new account", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const { userId, photo } = await withdrawn(c, "7003");
  c.advance(30 * DAY + 1);
  // Before the sweep has run, a login no longer offers the restore.
  const late = client(c);
  assert.equal(
    await kakaoLogin(late, "7003"),
    "/login?error=ACCOUNT_UNAVAILABLE",
  );
  await c.auth.processDeletions();
  assert.equal(existsSync(photo), false);
  assert.equal(
    Number(
      c.db.prepare("SELECT count(*) n FROM users WHERE id=?").get(userId)!["n"],
    ),
    0,
  );
  assert.deepEqual(c.kakao.unlinked, ["7003"]);
  assert.equal(await kakaoLogin(late, "7003"), "/signup");
});

test("a restore started near the end of the grace expires with the grace", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await withdrawn(c, "7004");
  c.advance(30 * DAY - 60_000);
  const back = client(c);
  assert.equal(await kakaoLogin(back, "7004"), "/restore");
  c.advance(120_000);
  const result = await back.request("POST", "/api/auth/restore", {});
  assert.equal(result.statusCode, 410);
  assert.equal(result.json().error.code, "RESTORE_EXPIRED");
  assert.equal((await back.request("GET", "/api/auth/me")).statusCode, 401);
});
