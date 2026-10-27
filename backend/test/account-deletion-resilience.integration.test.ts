import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { client, context, fixturePng, type Context } from "./helpers.ts";

// AUTH-004-R1: deletion under failures, retries and a rejoin racing the Kakao unlink (fake Kakao only).
const session = "/api/onboarding/session";

async function member(c: Context, subject: string) {
  const user = client(c);
  await user.login(subject);
  await user.create();
  const me = (await user.request("GET", "/api/auth/me")).json();
  return { user, userId: me.user.id as string };
}
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
const jobs = (c: Context) =>
  (
    c.db
      .prepare(
        "SELECT user_id AS userId, stage, provider_subject AS subject, unlink_started_at AS claimed, last_error AS error, attempts FROM account_deletions ORDER BY created_at",
      )
      .all() as {
      userId: string;
      stage: string;
      subject: string | null;
      claimed: string | null;
      error: string | null;
      attempts: number;
    }[]
  ).map((row) => ({ ...row }));
/** Starts a Kakao login and returns where the callback sent the browser. */
async function kakaoLogin(user: ReturnType<typeof client>, subject: string) {
  const start = await user.request("GET", "/api/auth/kakao/start");
  const state = new URL(String(start.headers.location)).searchParams.get(
    "state",
  )!;
  const back = await user.request(
    "GET",
    `/api/auth/kakao/callback?code=user-${subject}&state=${state}`,
  );
  return String(back.headers.location);
}
async function signupAll(user: ReturnType<typeof client>) {
  const docs = (await user.request("GET", "/api/auth/consent-documents")).json()
    .documents as { key: string; version: number }[];
  return user.request("POST", "/api/auth/signup", {
    consents: docs.map((d) => ({
      key: d.key,
      version: d.version,
      granted: true,
    })),
  });
}
const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++)
    await new Promise((resolve) => setImmediate(resolve));
  assert.ok(check(), "condition never became true");
};
function gate(c: Context) {
  let open!: () => void;
  c.kakao.unlinkGate = new Promise<void>((resolve) => (open = resolve));
  return () => {
    c.kakao.unlinkGate = undefined;
    open();
  };
}

test("a rejoin while the unlink is in flight is refused, then allowed; the new account is never unlinked", async (t) => {
  const c = await context();
  c.config.auth.deletionGraceSeconds = 0; // these cases are about the deletion itself, not the grace
  t.after(c.cleanup);
  const old = await member(c, "9400");
  const release = gate(c);
  const deletion = old.user.request("DELETE", "/api/auth/account", {});
  await until(() => jobs(c)[0]?.claimed != null);
  // The same Kakao member tries to come back while Kakao is being unlinked.
  const twin = client(c);
  assert.equal(
    await kakaoLogin(twin, "9400"),
    "/login?error=ACCOUNT_UNAVAILABLE",
  );
  release();
  assert.equal((await deletion).statusCode, 204);
  assert.deepEqual(c.kakao.unlinked, ["9400"]);
  assert.equal(jobs(c)[0]!.stage, "done");
  assert.equal(jobs(c)[0]!.claimed, null);
  // After the unlink the member can join again, and nothing unlinks the new account.
  assert.equal(await kakaoLogin(twin, "9400"), "/signup");
  assert.equal((await signupAll(twin)).statusCode, 201);
  await c.auth.processDeletions();
  assert.deepEqual(c.kakao.unlinked, ["9400"]);
  assert.equal((await twin.request("GET", "/api/auth/me")).statusCode, 200);
});

test("a signup started before the unlink is held until the unlink finishes", async (t) => {
  const c = await context();
  c.config.auth.deletionGraceSeconds = 0; // these cases are about the deletion itself, not the grace
  t.after(c.cleanup);
  const old = await member(c, "9500");
  c.kakao.unlinkMode = "not_configured";
  assert.equal(
    (await old.user.request("DELETE", "/api/auth/account", {})).statusCode,
    204,
  );
  // The member starts signing up again while the unlink still waits for the admin key.
  const twin = client(c);
  assert.equal(await kakaoLogin(twin, "9500"), "/signup");
  c.kakao.unlinkMode = "ok";
  const release = gate(c);
  const run = c.auth.processDeletions();
  await until(() => jobs(c)[0]?.claimed != null);
  let result = await signupAll(twin);
  assert.equal(result.statusCode, 403);
  assert.equal(result.json().error.code, "ACCOUNT_UNAVAILABLE");
  release();
  await run;
  assert.deepEqual(c.kakao.unlinked, ["9500"]);
  // The pending signup survived the refusal and completes now.
  result = await signupAll(twin);
  assert.equal(result.statusCode, 201);
});

test("a crashed unlink frees the member after the lease; a rejoined member is then not unlinked", async (t) => {
  const c = await context();
  c.config.auth.deletionGraceSeconds = 0; // these cases are about the deletion itself, not the grace
  t.after(c.cleanup);
  const old = await member(c, "9600");
  c.kakao.unlinkMode = "not_configured";
  await old.user.request("DELETE", "/api/auth/account", {});
  // Simulate a server crash right after claiming the unlink.
  c.db
    .prepare("UPDATE account_deletions SET unlink_started_at=?")
    .run(new Date("2026-10-23T01:00:00.000Z").toISOString());
  const twin = client(c);
  assert.equal(
    await kakaoLogin(twin, "9600"),
    "/login?error=ACCOUNT_UNAVAILABLE",
  );
  c.advance(c.config.auth.unlinkLeaseSeconds * 1000 + 1);
  assert.equal(await kakaoLogin(twin, "9600"), "/signup");
  assert.equal((await signupAll(twin)).statusCode, 201);
  c.kakao.unlinkMode = "ok";
  await c.auth.processDeletions();
  assert.equal(jobs(c)[0]!.stage, "done");
  assert.deepEqual(c.kakao.unlinked, []);
  assert.equal(c.kakao.unlinkCalls, 1); // only the earlier not-configured attempt
});

test("a database failure mid-deletion keeps the job and other accounts intact and completes on retry", async (t) => {
  const c = await context();
  c.config.auth.deletionGraceSeconds = 0; // these cases are about the deletion itself, not the grace
  t.after(c.cleanup);
  const a = await member(c, "9700"),
    b = await member(c, "9701");
  await putGarment(c, a.user.cookie, 60);
  await putGarment(c, b.user.cookie, 70);
  c.db.exec(
    "CREATE TRIGGER block_user_delete BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT,'test'); END",
  );
  assert.equal(
    (await a.user.request("DELETE", "/api/auth/account", {})).statusCode,
    204,
  );
  let job = jobs(c)[0]!;
  assert.equal(job.stage, "pending");
  assert.equal(job.attempts, 1);
  assert.ok(job.error);
  assert.equal(
    c.db.prepare("SELECT status FROM users WHERE id=?").get(a.userId)![
      "status"
    ],
    "deleting",
  );
  assert.equal(
    (await b.user.request("GET", `${session}/garment/image`)).statusCode,
    200,
  );
  c.db.exec("DROP TRIGGER block_user_delete");
  await c.auth.processDeletions();
  job = jobs(c)[0]!;
  assert.equal(job.stage, "done");
  assert.equal(job.attempts, 1);
  assert.equal(
    c.db.prepare("SELECT count(*) n FROM users WHERE id=?").get(a.userId)!["n"],
    0,
  );
  assert.equal((await b.user.request("GET", "/api/auth/me")).statusCode, 200);
});

test("double requests and concurrent retries create one job and unlink once", async (t) => {
  const c = await context();
  c.config.auth.deletionGraceSeconds = 0; // these cases are about the deletion itself, not the grace
  t.after(c.cleanup);
  const a = await member(c, "9800");
  await putGarment(c, a.user.cookie, 80);
  const photo = path.join(
    c.config.garmentRoot!,
    String(c.db.prepare("SELECT filename FROM garments").get()!["filename"]),
  );
  // A crash after the photo was removed but before the rows were: the retry treats it as removed.
  c.kakao.unlinkMode = "not_configured";
  const cookie = a.user.cookie;
  const [first, second] = await Promise.all([
    c.app.inject({
      method: "DELETE",
      url: "/api/auth/account",
      payload: {},
      headers: {
        cookie,
        "x-onboarding-request": "1",
        origin: c.config.publicOrigin,
      },
    }),
    c.app.inject({
      method: "DELETE",
      url: "/api/auth/account",
      payload: {},
      headers: {
        cookie,
        "x-onboarding-request": "1",
        origin: c.config.publicOrigin,
      },
    }),
  ]);
  assert.deepEqual([first.statusCode, second.statusCode].sort(), [204, 401]);
  assert.equal(jobs(c).length, 1);
  assert.equal(existsSync(photo), false);
  c.kakao.unlinkMode = "ok";
  await Promise.all([
    c.auth.processDeletions(),
    c.auth.processDeletions(),
    c.auth.processDeletions(),
  ]);
  assert.equal(jobs(c)[0]!.stage, "done");
  assert.deepEqual(c.kakao.unlinked, ["9800"]);
});

test("a photo already removed by an interrupted run does not block the deletion", async (t) => {
  const c = await context();
  c.config.auth.deletionGraceSeconds = 0; // these cases are about the deletion itself, not the grace
  t.after(c.cleanup);
  const a = await member(c, "9900");
  await putGarment(c, a.user.cookie, 90);
  const photo = path.join(
    c.config.garmentRoot!,
    String(c.db.prepare("SELECT filename FROM garments").get()!["filename"]),
  );
  unlinkSync(photo);
  assert.equal(
    (await a.user.request("DELETE", "/api/auth/account", {})).statusCode,
    204,
  );
  assert.equal(jobs(c)[0]!.stage, "done");
});
