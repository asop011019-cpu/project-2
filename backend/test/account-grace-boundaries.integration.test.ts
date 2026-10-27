import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { buildApp } from "../src/app.ts";
import { client, context, fixturePng, type Context } from "./helpers.ts";

// AUTH-005-REVIEW: edges of the 30-day grace (exact expiry instant, a clock stepping back
// mid-sweep, deletion failing after the grace, a server down for longer than the grace).
const DAY = 24 * 60 * 60 * 1000;
const START = Date.parse("2026-10-23T01:00:00.000Z");

async function putGarment(c: Context, cookie: string, color: number) {
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
    new Blob([new Uint8Array(fixturePng(color))], { type: "image/png" }),
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
async function withdrawn(c: Context, subject: string, color: number) {
  const user = client(c);
  await user.login(subject);
  await user.create();
  await putGarment(c, user.cookie, color);
  const userId = (await user.request("GET", "/api/auth/me")).json().user
    .id as string;
  const photo = path.join(
    c.config.garmentRoot!,
    String(
      c.db
        .prepare("SELECT filename FROM garments ORDER BY rowid DESC LIMIT 1")
        .get()!["filename"],
    ),
  );
  assert.equal(
    (await user.request("DELETE", "/api/auth/account", {})).statusCode,
    204,
  );
  return { userId, photo };
}
const status = (c: Context, userId: string) =>
  c.db.prepare("SELECT status FROM users WHERE id=?").get(userId)?.["status"];

test("the grace ends at one instant: restorable just before it, deleted from it on", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const { userId, photo } = await withdrawn(c, "7101", 41);
  const scheduledAt = String(
    c.db
      .prepare("SELECT scheduled_at FROM account_deletions WHERE user_id=?")
      .get(userId)!["scheduled_at"],
  );
  // Stored and compared as UTC ISO strings, so the server time zone never moves the instant.
  assert.equal(scheduledAt, new Date(START + 30 * DAY).toISOString());
  c.advance(30 * DAY - 1);
  const early = client(c);
  assert.equal(await kakaoLogin(early, "7101"), "/restore");
  await c.auth.processDeletions();
  assert.equal(existsSync(photo), true);
  c.advance(1);
  const result = await early.request("POST", "/api/auth/restore", {});
  assert.equal(result.statusCode, 410);
  assert.equal(result.json().error.code, "RESTORE_EXPIRED");
  assert.equal(
    await kakaoLogin(client(c), "7101"),
    "/login?error=ACCOUNT_UNAVAILABLE",
  );
  await c.auth.processDeletions();
  assert.equal(existsSync(photo), false);
  assert.equal(status(c, userId), undefined);
});

test("a restore during a running sweep is never undone by that sweep, even if the clock steps back", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const first = await withdrawn(c, "7201", 42);
  c.advance(1000);
  const second = await withdrawn(c, "7202", 43);
  c.advance(30 * DAY + 2000);
  let release!: () => void;
  c.kakao.unlinkGate = new Promise((resolve) => (release = resolve));
  // The sweep takes both overdue jobs, deletes the first account and waits on its unlink.
  const sweep = c.auth.processDeletions();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(existsSync(first.photo), false);
  // The system clock is corrected backwards; the second account is inside its grace again.
  c.advance(-2 * DAY);
  const back = client(c);
  assert.equal(await kakaoLogin(back, "7202"), "/restore");
  assert.equal(
    (await back.request("POST", "/api/auth/restore", {})).statusCode,
    200,
  );
  release();
  await sweep;
  assert.equal(existsSync(second.photo), true);
  assert.equal(status(c, second.userId), "active");
  assert.equal((await back.request("GET", "/api/auth/me")).statusCode, 200);
  assert.deepEqual(c.kakao.unlinked, ["7201"]);
});

test("a deletion still failing after the grace keeps the account locked without a restore, then finishes", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const { userId } = await withdrawn(c, "7301", 44);
  c.db.exec(
    "CREATE TRIGGER block_user_delete BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT,'test'); END",
  );
  c.advance(30 * DAY + 1);
  await c.auth.processDeletions();
  c.advance(60 * 60 * 1000);
  await c.auth.processDeletions();
  const job = c.db
    .prepare(
      "SELECT stage, attempts, last_error AS error FROM account_deletions WHERE user_id=?",
    )
    .get(userId)!;
  assert.deepEqual(
    { stage: job["stage"], attempts: job["attempts"] },
    { stage: "pending", attempts: 2 },
  );
  assert.ok(job["error"]);
  assert.equal(status(c, userId), "deleting");
  assert.equal(
    await kakaoLogin(client(c), "7301"),
    "/login?error=ACCOUNT_UNAVAILABLE",
  );
  c.db.exec("DROP TRIGGER block_user_delete");
  await c.auth.processDeletions();
  assert.equal(status(c, userId), undefined);
  assert.deepEqual(c.kakao.unlinked, ["7301"]);
  assert.equal(await kakaoLogin(client(c), "7301"), "/signup");
});

test("a server down for longer than the grace deletes the overdue account when it starts", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const { userId, photo } = await withdrawn(c, "7401", 45);
  await c.app.close();
  const later = new Date(START + 45 * DAY);
  const again = buildApp({
    config: c.config,
    now: () => later,
    logger: false,
    oauthProvider: c.kakao,
  });
  try {
    await again.app.ready();
    // Queued behind the sweep that onReady started, so this waits for it.
    await again.auth.processDeletions();
    assert.equal(existsSync(photo), false);
    assert.equal(
      again.db.prepare("SELECT status FROM users WHERE id=?").get(userId),
      undefined,
    );
    assert.deepEqual(c.kakao.unlinked, ["7401"]);
  } finally {
    await again.app.close();
  }
});
