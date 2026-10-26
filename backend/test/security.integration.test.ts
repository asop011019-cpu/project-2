import assert from "node:assert/strict";
import { test } from "node:test";
import { context, client, publish, fakeKakao } from "./helpers.ts";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
const base = "/api/onboarding/session";

test("session IDs never grant access; each cookie sees only its own state", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, ["men_casual"]);
  const alice = client(c),
    bob = client(c);
  const aliceSession = await alice.create();
  await alice.category("menswear");
  await alice.request("PUT", `${base}/styles/men_casual/response`, {
    response: "liked",
  });
  const bobSession = await bob.create();
  assert.notEqual(bobSession.id, aliceSession.id);
  assert.equal(
    (await bob.request("GET", base)).json().selectedCategoryId,
    null,
  );
  assert.equal(
    (await c.app.inject({ method: "GET", url: base })).statusCode,
    401,
  );
  assert.equal(
    (
      await c.app.inject({
        method: "GET",
        url: base,
        headers: { cookie: `onboarding_dev=${aliceSession.id}` },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (await bob.request("GET", `${base}/${aliceSession.id}`)).statusCode,
    404,
  );
  assert.equal(
    (await bob.request("GET", `${base}?sessionId=${aliceSession.id}`))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await bob.request("PUT", `${base}/category`, {
        categoryId: "menswear",
        sessionId: aliceSession.id,
      })
    ).statusCode,
    400,
  );
  await bob.category("menswear");
  assert.equal(
    (await bob.request("GET", base)).json().progress.answeredCount,
    0,
  );
  const raw = alice.cookie.split("=")[1]!;
  assert.ok(
    !JSON.stringify(
      c.db.prepare("SELECT * FROM onboarding_sessions").all(),
    ).includes(raw),
  );
  assert.equal(
    JSON.stringify((await alice.request("GET", base)).json()).includes(
      "tokenHash",
    ),
    false,
  );
  assert.equal((await alice.request("POST", base, {})).statusCode, 200);
});

test("mutations require the explicit request header and reject cross-site origins", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  let result = await c.app.inject({ method: "POST", url: base, payload: {} });
  assert.equal(result.statusCode, 403);
  assert.equal(result.json().error.code, "REQUEST_HEADER_REQUIRED");
  const user = client(c);
  result = await user.request(
    "POST",
    base,
    {},
    { origin: "https://other.invalid" },
  );
  assert.equal(result.statusCode, 403);
  result = await user.request(
    "POST",
    base,
    {},
    { "sec-fetch-site": "cross-site" },
  );
  assert.equal(result.statusCode, 403);
  assert.equal(
    c.db.prepare("SELECT count(*) AS count FROM onboarding_sessions").get()![
      "count"
    ],
    0,
  );
  result = await user.request("POST", base, {});
  assert.equal(result.statusCode, 401);
  assert.equal(result.json().error.code, "AUTH_REQUIRED");
  await user.login();
  result = await user.request("POST", base, {});
  assert.equal(result.statusCode, 201);
  // Progress is owned by the login; onboarding no longer issues its own cookie.
  assert.equal(result.headers["set-cookie"], undefined);
  assert.equal(result.headers["access-control-allow-origin"], undefined);
  assert.equal(result.headers["cache-control"], "no-store");
});

test("production requires HTTPS and sets host-only Secure HttpOnly cookies", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        PUBLIC_ORIGIN: "http://example.test",
      }),
    /HTTPS/,
  );
  const config = {
    ...c.config,
    secureCookies: true,
    publicOrigin: "https://example.test",
    databasePath: ":memory:",
  };
  const secure = {
    ...c,
    ...buildApp({ config, logger: false, oauthProvider: fakeKakao() }),
  };
  t.after(() => secure.app.close());
  const user = client(secure);
  const start = await user.request("GET", "/api/auth/kakao/start");
  const binder = String(start.headers["set-cookie"]);
  assert.ok(binder.startsWith("__Host-auth-oauth="));
  await user.login();
  const result = await user.request("POST", base, {});
  assert.equal(result.statusCode, 201);
  const login = await user.request("GET", "/api/auth/me");
  assert.equal(login.statusCode, 200);
  assert.ok(user.cookie.includes("__Host-auth="));
  for (const header of [binder]) {
    assert.ok(header.includes("Secure"));
    assert.ok(header.includes("HttpOnly"));
    assert.ok(header.includes("Path=/"));
    assert.ok(header.includes("SameSite=Lax"));
    assert.ok(!header.includes("Domain="));
  }
});

test("reset and deletion replace only the owner's progress; the login survives and deletion is idempotent", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, ["men_casual"]);
  const alice = client(c),
    bob = client(c);
  await alice.create();
  await bob.create();
  await alice.category("menswear");
  await alice.request("PUT", `${base}/styles/men_casual/response`, {
    response: "liked",
  });
  await alice.request(
    "PUT",
    `${base}/styles/men_casual/images/fixture_men_casual_0/preference`,
    { selected: true },
  );
  const login = alice.cookie;
  const reset = await alice.request("POST", `${base}/reset`, {});
  assert.equal(reset.statusCode, 200);
  assert.equal(alice.cookie, login);
  assert.equal(reset.json().selectedCategoryId, null);
  for (const table of [
    "category_sessions",
    "session_styles",
    "style_responses",
    "image_preferences",
  ])
    assert.equal(
      c.db.prepare(`SELECT count(*) AS count FROM ${table}`).get()!["count"],
      0,
    );
  let result = await alice.request("DELETE", base, {});
  assert.equal(result.statusCode, 204);
  result = await alice.request("GET", base);
  assert.equal(result.statusCode, 401);
  assert.equal(result.json().error.code, "SESSION_REQUIRED");
  assert.equal((await alice.request("GET", "/api/auth/me")).statusCode, 200);
  result = await alice.request("DELETE", base, {});
  assert.equal(result.statusCode, 204);
  assert.equal((await alice.request("POST", base, {})).statusCode, 201);
  assert.equal((await bob.request("GET", base)).statusCode, 200);
});

test("login expiry fails authentication without trusting a public session ID", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const user = client(c);
  await user.create();
  c.advance(c.config.auth.idleTtlSeconds * 1000 + 1);
  const result = await user.request("GET", base);
  assert.equal(result.statusCode, 401);
  assert.equal(result.json().error.code, "AUTH_REQUIRED");
});
