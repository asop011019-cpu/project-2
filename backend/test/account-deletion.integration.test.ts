import assert from "node:assert/strict";
import { test } from "node:test";
import {
  existsSync,
  mkdirSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { buildApp } from "../src/app.ts";
import {
  client,
  context,
  fakeKakao,
  fixturePng,
  type Context,
} from "./helpers.ts";

const session = "/api/onboarding/session";

async function putGarment(c: Context, cookie: string, color: number) {
  const form = new FormData();
  form.set(
    "metadata",
    JSON.stringify({
      garmentType: "skirt",
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
    url: `${session}/garment`,
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
const count = (c: Context, sql: string, ...args: string[]) =>
  Number(c.db.prepare(sql).get(...args)!["n"]);
function fileOf(c: Context, userId: string) {
  const row = c.db
    .prepare(
      "SELECT g.filename FROM garments g JOIN onboarding_sessions o ON o.id=g.session_id WHERE o.user_id=?",
    )
    .get(userId) as { filename: string } | undefined;
  return row ? path.join(c.config.garmentRoot!, row.filename) : undefined;
}
async function member(c: Context, subject?: string) {
  const user = client(c);
  const id = await user.login(subject);
  await user.create();
  const me = (await user.request("GET", "/api/auth/me")).json();
  return { user, subject: id, userId: me.user.id as string };
}
const job = (c: Context, userId: string) => ({
  ...(c.db
    .prepare(
      "SELECT stage, provider_subject AS subject, last_error AS error, attempts FROM account_deletions WHERE user_id=?",
    )
    .get(userId) as {
    stage: string;
    subject: string | null;
    error: string | null;
    attempts: number;
  }),
});

test("deletion needs a fresh login, removes every row and photo, unlinks Kakao and leaves other accounts alone", async (t) => {
  const c = await context();
  c.config.auth.deletionGraceSeconds = 0; // these cases are about the deletion itself, not the grace
  t.after(c.cleanup);
  const a = await member(c, "9001"),
    b = await member(c, "9002");
  await putGarment(c, a.user.cookie, 30);
  await putGarment(c, b.user.cookie, 40);
  const fileA = fileOf(c, a.userId)!,
    fileB = fileOf(c, b.userId)!;
  c.advance(c.config.auth.reauthWindowSeconds * 1000 + 1);
  let result = await a.user.request("DELETE", "/api/auth/account", {});
  assert.equal(result.statusCode, 401);
  assert.equal(result.json().error.code, "REAUTH_REQUIRED");
  assert.equal(
    count(c, "SELECT count(*) n FROM users WHERE status='active'"),
    2,
  );
  const start = await a.user.request(
    "GET",
    "/api/auth/kakao/start?reauth=1&returnTo=/account",
  );
  assert.match(String(start.headers.location), /prompt=login/);
  await a.user.login("9001");
  const old = a.user.cookie;
  result = await a.user.request("DELETE", "/api/auth/account", {});
  assert.equal(result.statusCode, 204);
  assert.equal(a.user.cookie, "");
  assert.equal(
    (
      await c.app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: old },
      })
    ).statusCode,
    401,
  );
  for (const table of [
    "users",
    "user_identities",
    "auth_sessions",
    "user_consents",
    "consent_events",
  ])
    assert.equal(
      count(
        c,
        `SELECT count(*) n FROM ${table} WHERE user_id=?`.replace(
          "users WHERE user_id",
          "users WHERE id",
        ),
        a.userId,
      ),
      0,
      table,
    );
  assert.equal(
    count(
      c,
      "SELECT count(*) n FROM onboarding_sessions WHERE user_id=?",
      a.userId,
    ),
    0,
  );
  assert.equal(existsSync(fileA), false);
  assert.equal(existsSync(fileB), true);
  assert.deepEqual(job(c, a.userId), {
    stage: "done",
    subject: null,
    error: null,
    attempts: 0,
  });
  assert.deepEqual(c.kakao.unlinked, ["9001"]);
  assert.equal(
    (await b.user.request("GET", `${session}/garment/image`)).statusCode,
    200,
  );
  // The same Kakao member can join again as a brand-new account.
  const again = client(c);
  const s = await again.request("GET", "/api/auth/kakao/start");
  const state = new URL(String(s.headers.location)).searchParams.get("state")!;
  const back = await again.request(
    "GET",
    `/api/auth/kakao/callback?code=user-9001&state=${state}`,
  );
  assert.equal(back.headers.location, "/signup");
});

test("a failed photo deletion keeps the account locked and is retried, also after a restart", async (t) => {
  const c = await context();
  c.config.auth.deletionGraceSeconds = 0; // these cases are about the deletion itself, not the grace
  let reopened: ReturnType<typeof buildApp> | undefined;
  t.after(async () => {
    await reopened?.app.close();
    await c.cleanup();
  });
  const a = await member(c, "9100");
  await putGarment(c, a.user.cookie, 50);
  const file = fileOf(c, a.userId)!;
  // Turn the photo into a directory so reading it fails (EISDIR) during deletion.
  unlinkSync(file);
  mkdirSync(file);
  assert.equal(
    (await a.user.request("DELETE", "/api/auth/account", {})).statusCode,
    204,
  );
  let state = job(c, a.userId);
  assert.equal(state.stage, "pending");
  assert.equal(state.attempts, 1);
  assert.ok(state.error);
  assert.equal(
    count(
      c,
      "SELECT count(*) n FROM users WHERE id=? AND status='deleting'",
      a.userId,
    ),
    1,
  );
  assert.equal(
    count(
      c,
      "SELECT count(*) n FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL",
      a.userId,
    ),
    0,
  );
  // Logging in again is refused while the deletion is unfinished.
  const retry = client(c);
  const s = await retry.request("GET", "/api/auth/kakao/start");
  const st = new URL(String(s.headers.location)).searchParams.get("state")!;
  const back = await retry.request(
    "GET",
    `/api/auth/kakao/callback?code=user-9100&state=${st}`,
  );
  assert.equal(back.headers.location, "/login?error=ACCOUNT_UNAVAILABLE");
  // Fix the disk problem and restart: the job resumes from the stored record alone.
  rmdirSync(file);
  writeFileSync(file, fixturePng(50));
  await c.app.close();
  const kakao = fakeKakao();
  reopened = buildApp({
    config: c.config,
    logger: false,
    oauthProvider: kakao,
  });
  await reopened.app.ready();
  await reopened.auth.processDeletions();
  state = job({ ...c, db: reopened.db } as Context, a.userId);
  assert.equal(state.stage, "done");
  assert.equal(existsSync(file), false);
  assert.deepEqual(kakao.unlinked, ["9100"]);
});

test("without a Kakao admin key the data is deleted but the unlink step waits, keeping only the member number", async (t) => {
  const c = await context();
  c.config.auth.deletionGraceSeconds = 0; // these cases are about the deletion itself, not the grace
  t.after(c.cleanup);
  const a = await member(c, "9200");
  c.kakao.unlinkMode = "not_configured";
  assert.equal(
    (await a.user.request("DELETE", "/api/auth/account", {})).statusCode,
    204,
  );
  let state = job(c, a.userId);
  assert.deepEqual(state, {
    stage: "data_deleted",
    subject: "9200",
    error: "KAKAO_UNLINK_NOT_CONFIGURED",
    attempts: 1,
  });
  assert.equal(
    count(c, "SELECT count(*) n FROM users WHERE id=?", a.userId),
    0,
  );
  c.kakao.unlinkMode = "fail";
  await c.auth.processDeletions();
  assert.equal(job(c, a.userId).error, "OAUTH_PROVIDER_ERROR");
  c.kakao.unlinkMode = "ok";
  await c.auth.processDeletions();
  state = job(c, a.userId);
  assert.deepEqual(state, {
    stage: "done",
    subject: null,
    error: null,
    attempts: 2,
  });
});

test("a delayed unlink is skipped when the same Kakao member has already joined again", async (t) => {
  const c = await context();
  c.config.auth.deletionGraceSeconds = 0; // these cases are about the deletion itself, not the grace
  t.after(c.cleanup);
  const old = await member(c, "9300");
  c.kakao.unlinkMode = "not_configured";
  assert.equal(
    (await old.user.request("DELETE", "/api/auth/account", {})).statusCode,
    204,
  );
  assert.equal(job(c, old.userId).stage, "data_deleted");
  // The person signs up again before the admin key is configured.
  const fresh = await member(c, "9300");
  assert.notEqual(fresh.userId, old.userId);
  c.kakao.unlinkMode = "ok";
  await c.auth.processDeletions();
  assert.deepEqual(job(c, old.userId), {
    stage: "done",
    subject: null,
    error: null,
    attempts: 1,
  });
  // Unlinking now would have cut the new account's Kakao connection.
  assert.deepEqual(c.kakao.unlinked, []);
  assert.equal(
    (await fresh.user.request("GET", "/api/auth/me")).statusCode,
    200,
  );
});
