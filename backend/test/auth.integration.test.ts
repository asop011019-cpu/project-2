import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { buildApp } from "../src/app.ts";
import { kakaoProvider } from "../src/modules/auth/kakao.ts";
import { safeReturnTo } from "../src/modules/auth/service.ts";
import {
  client,
  context,
  fakeKakao,
  fixturePng,
  type Context,
} from "./helpers.ts";

const session = "/api/onboarding/session";

async function startLogin(user: ReturnType<typeof client>, returnTo?: string) {
  const start = await user.request(
    "GET",
    `/api/auth/kakao/start${returnTo === undefined ? "" : `?returnTo=${encodeURIComponent(returnTo)}`}`,
  );
  assert.equal(start.statusCode, 302, start.body);
  return new URL(String(start.headers.location)).searchParams.get("state")!;
}
const callback = (
  user: ReturnType<typeof client>,
  state: string,
  code: string,
) =>
  user.request(
    "GET",
    `/api/auth/kakao/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
  );
const users = (c: Context) =>
  Number(c.db.prepare("SELECT count(*) AS n FROM users").get()!["n"]);
async function documents(user: ReturnType<typeof client>) {
  const response = await user.request("GET", "/api/auth/consent-documents");
  assert.equal(response.statusCode, 200);
  return response.json().documents as {
    key: string;
    version: number;
    required: boolean;
    title: string;
    body: string;
  }[];
}
function garmentForm(color: number) {
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
  return form;
}
async function putGarment(c: Context, cookie: string, color: number) {
  const request = new Request("http://localhost/", {
    method: "PUT",
    body: garmentForm(color),
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
  return response;
}

test("new Kakao member signs up with explicit consents; returning member logs straight in", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const user = client(c);
  const state = await startLogin(user, "/style?step=2");
  const first = await callback(user, state, "user-501");
  assert.equal(first.headers.location, "/signup");
  assert.equal(users(c), 0);
  const pending = await user.request("GET", "/api/auth/signup/pending");
  assert.equal(pending.statusCode, 200);
  const docs = pending.json().documents as Awaited<
    ReturnType<typeof documents>
  >;
  assert.deepEqual(
    docs.map((d) => [d.key, d.required]),
    [
      ["privacy_required", true],
      ["terms", true],
      ["ai_analysis", false],
    ],
  );
  for (const d of docs) assert.ok(d.body.length > 40 && d.title.length > 0);
  const signup = await user.request("POST", "/api/auth/signup", {
    consents: docs.map((d) => ({
      key: d.key,
      version: d.version,
      granted: d.required,
    })),
  });
  assert.equal(signup.statusCode, 201, signup.body);
  assert.equal(signup.json().returnTo, "/style?step=2");
  const header = String(signup.headers["set-cookie"]);
  assert.ok(header.includes("auth_dev="));
  assert.ok(
    header.includes("HttpOnly") &&
      header.includes("SameSite=Lax") &&
      header.includes("Path=/"),
  );
  const me = (await user.request("GET", "/api/auth/me")).json();
  assert.deepEqual(me.user.providers, ["kakao"]);
  assert.equal(me.user.consents.privacy_required.granted, true);
  assert.equal(me.user.consents.ai_analysis.granted, false);
  assert.deepEqual(me.consentUpdates, []);
  // Returning member: no signup step, lands on the requested page.
  const again = client(c);
  const back = await callback(
    again,
    await startLogin(again, "/garment"),
    "user-501",
  );
  assert.equal(back.headers.location, "/garment");
  assert.equal(
    (await again.request("GET", "/api/auth/me")).json().user.id,
    me.user.id,
  );
  assert.equal(users(c), 1);
  // Text content of pending signup never contains the Kakao member number.
  assert.ok(!JSON.stringify(pending.json()).includes("501"));
});

test("OAuth state is bound to the browser, single-use and short-lived; the provider is not called on bad state", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const failed = (response: { headers: Record<string, unknown> }) =>
    String(response.headers.location);
  const a = client(c),
    b = client(c);
  const state = await startLogin(a);
  await startLogin(b); // b holds its own valid binder cookie, just not the one for a's state
  assert.equal(
    failed(await callback(b, state, "user-1")),
    "/login?error=OAUTH_STATE_INVALID",
  );
  // b's attempt consumed it: even the right browser cannot reuse the state.
  assert.equal(
    failed(await callback(a, state, "user-1")),
    "/login?error=OAUTH_STATE_INVALID",
  );
  const forged = client(c);
  await startLogin(forged);
  assert.equal(
    failed(await callback(forged, "A".repeat(43), "user-1")),
    "/login?error=OAUTH_STATE_INVALID",
  );
  const late = client(c);
  const lateState = await startLogin(late);
  c.advance(c.config.auth.handshakeTtlSeconds * 1000 + 1);
  assert.equal(
    failed(await callback(late, lateState, "user-1")),
    "/login?error=OAUTH_STATE_INVALID",
  );
  const used = client(c);
  const usedState = await startLogin(used);
  assert.equal(failed(await callback(used, usedState, "user-2")), "/signup");
  assert.equal(
    failed(await callback(used, usedState, "user-2")),
    "/login?error=OAUTH_STATE_INVALID",
  );
  assert.deepEqual(c.kakao.exchanged, ["user-2"]);
  const denied = client(c);
  const deniedState = await startLogin(denied);
  const deny = await denied.request(
    "GET",
    `/api/auth/kakao/callback?error=access_denied&state=${deniedState}`,
  );
  assert.equal(deny.headers.location, "/login?error=OAUTH_DENIED");
  const outage = client(c);
  assert.equal(
    failed(await callback(outage, await startLogin(outage), "fail")),
    "/login?error=OAUTH_PROVIDER_ERROR",
  );
  assert.equal(users(c), 0);
});

test("returnTo accepts only same-site relative paths", () => {
  for (const bad of [
    "https://evil.example/x",
    "//evil.example/x",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "/api/auth/logout",
    "relative/path",
    "/a\nb",
    "",
  ])
    assert.equal(safeReturnTo(bad), "/", bad);
  assert.equal(safeReturnTo("/garment?x=1#top"), "/garment?x=1#top");
});

test("signup requires every required consent at the current version, keeps the pending signup on errors and expires", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const user = client(c);
  await callback(user, await startLogin(user), "user-77");
  const docs = await documents(user);
  const all = (granted: (d: (typeof docs)[number]) => boolean) =>
    docs.map((d) => ({ key: d.key, version: d.version, granted: granted(d) }));
  let result = await user.request("POST", "/api/auth/signup", {
    consents: all((d) => d.key !== "terms"),
  });
  assert.equal(result.statusCode, 400);
  assert.equal(result.json().error.code, "CONSENT_REQUIRED");
  result = await user.request("POST", "/api/auth/signup", {
    consents: all(() => true).map((d) =>
      d.key === "privacy_required" ? { ...d, version: d.version + 1 } : d,
    ),
  });
  assert.equal(result.statusCode, 409);
  assert.equal(result.json().error.code, "CONSENT_VERSION_MISMATCH");
  result = await user.request("POST", "/api/auth/signup", {
    consents: [
      ...all(() => true),
      { key: "unknown", version: 1, granted: true },
    ],
  });
  assert.equal(result.statusCode, 400);
  result = await user.request(
    "POST",
    "/api/auth/signup",
    { consents: all(() => true) },
    { "x-onboarding-request": "" },
  );
  assert.equal(result.statusCode, 403);
  assert.equal(users(c), 0);
  result = await user.request("POST", "/api/auth/signup", {
    consents: all(() => true),
  });
  assert.equal(result.statusCode, 201);
  assert.equal(
    (await user.request("GET", "/api/auth/me")).json().user.consents.ai_analysis
      .granted,
    true,
  );
  // Expired pending signup.
  const slow = client(c);
  await callback(slow, await startLogin(slow), "user-78");
  c.advance(c.config.auth.handshakeTtlSeconds * 1000 + 1);
  result = await slow.request("POST", "/api/auth/signup", {
    consents: all(() => true),
  });
  assert.equal(result.statusCode, 410);
  assert.equal(result.json().error.code, "SIGNUP_EXPIRED");
  // The same Kakao member cannot become two accounts.
  const twin1 = client(c),
    twin2 = client(c);
  await callback(twin1, await startLogin(twin1), "user-79");
  await callback(twin2, await startLogin(twin2), "user-79");
  assert.equal(
    (
      await twin1.request("POST", "/api/auth/signup", {
        consents: all(() => true),
      })
    ).statusCode,
    201,
  );
  result = await twin2.request("POST", "/api/auth/signup", {
    consents: all(() => true),
  });
  assert.equal(result.statusCode, 409);
  assert.equal(result.json().error.code, "IDENTITY_ALREADY_LINKED");
});

test("a new required document version blocks protected APIs until accepted; required consent cannot be withdrawn", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const user = client(c);
  await user.create();
  const doc = (
    await user.request("GET", "/api/auth/consent-documents/privacy_required/1")
  ).json();
  assert.equal(doc.required, true);
  c.db
    .prepare(
      "INSERT INTO consent_documents VALUES('privacy_required',99,1,'개인정보 v99','test-only v2 body for re-consent','x',?)",
    )
    .run(new Date(Date.parse("2026-10-23T01:00:00.000Z") - 1).toISOString());
  let result = await user.request("GET", session);
  assert.equal(result.statusCode, 403);
  assert.equal(result.json().error.code, "CONSENT_UPDATE_REQUIRED");
  const me = (await user.request("GET", "/api/auth/me")).json();
  assert.deepEqual(me.consentUpdates, [
    { key: "privacy_required", version: 99 },
  ]);
  result = await user.request("PUT", "/api/auth/consents", {
    key: "privacy_required",
    version: 1,
    granted: true,
  });
  assert.equal(result.statusCode, 409);
  result = await user.request("PUT", "/api/auth/consents", {
    key: "privacy_required",
    version: 99,
    granted: false,
  });
  assert.equal(
    result.json().error.code,
    "REQUIRED_CONSENT_CANNOT_BE_WITHDRAWN",
  );
  result = await user.request("PUT", "/api/auth/consents", {
    key: "privacy_required",
    version: 99,
    granted: true,
  });
  assert.equal(result.statusCode, 200);
  assert.equal((await user.request("GET", session)).statusCode, 200);
  // Optional AI consent toggles freely and is recorded as an event each time.
  for (const granted of [true, false]) {
    result = await user.request("PUT", "/api/auth/consents", {
      key: "ai_analysis",
      version: 1,
      granted,
    });
    assert.equal(result.json().user.consents.ai_analysis.granted, granted);
  }
  assert.equal(
    Number(
      c.db
        .prepare(
          "SELECT count(*) AS n FROM consent_events WHERE key='ai_analysis'",
        )
        .get()!["n"],
    ),
    3,
  );
});

test("login persists across a server restart; idle and absolute limits end it", async (t) => {
  const c = await context();
  let reopened: ReturnType<typeof buildApp> | undefined;
  t.after(async () => {
    await reopened?.app.close();
    await c.cleanup();
  });
  const user = client(c);
  await user.create();
  const cookie = user.cookie;
  await c.app.close();
  let time = new Date("2026-10-23T02:00:00.000Z");
  reopened = buildApp({
    config: c.config,
    logger: false,
    now: () => time,
    oauthProvider: fakeKakao(),
  });
  const me = () =>
    reopened!.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });
  assert.equal((await me()).statusCode, 200);
  time = new Date(time.getTime() + c.config.auth.idleTtlSeconds * 1000 + 1);
  assert.equal((await me()).statusCode, 401);
  // Absolute limit: an account used daily still has to log in again.
  const daily = client({ ...c, app: reopened.app } as Context);
  await daily.login();
  for (let day = 0; day < 100; day++) {
    time = new Date(time.getTime() + 24 * 3600 * 1000);
    const response = await daily.request("GET", "/api/auth/me");
    if (day < 89) assert.equal(response.statusCode, 200, `day ${day}`);
    else {
      assert.equal(response.statusCode, 401, `day ${day}`);
      break;
    }
  }
});

test("token rotation keeps parallel requests logged in; the old token dies after the grace period", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const user = client(c);
  await user.create();
  const old = user.cookie;
  c.advance(c.config.auth.renewAfterSeconds * 1000 + 1);
  const parallel = await Promise.all(
    [1, 2, 3].map(() =>
      c.app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: old },
      }),
    ),
  );
  assert.deepEqual(
    parallel.map((r) => r.statusCode),
    [200, 200, 200],
  );
  const rotated = parallel.filter((r) => r.headers["set-cookie"]);
  assert.equal(rotated.length, 1);
  const fresh = String(rotated[0]!.headers["set-cookie"]).split(";")[0]!;
  assert.notEqual(fresh, old);
  assert.equal(
    (
      await c.app.inject({
        method: "GET",
        url: session,
        headers: { cookie: fresh },
      })
    ).statusCode,
    200,
  );
  c.advance(c.config.auth.rotationGraceSeconds * 1000 + 1);
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
  assert.equal(
    (
      await c.app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: fresh },
      })
    ).statusCode,
    200,
  );
});

test("logout revokes the token for reuse; logout-all ends other devices too", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const phone = client(c);
  const subject = await phone.login();
  const laptop = client(c);
  await laptop.login(subject);
  const stolen = phone.cookie;
  assert.equal(
    (await phone.request("POST", "/api/auth/logout", {})).statusCode,
    204,
  );
  assert.equal(phone.cookie, "");
  const reuse = await c.app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { cookie: stolen },
  });
  assert.equal(reuse.statusCode, 401);
  assert.equal((await laptop.request("GET", "/api/auth/me")).statusCode, 200);
  const tablet = client(c);
  await tablet.login(subject);
  const tabletCookie = tablet.cookie;
  assert.equal(
    (await laptop.request("POST", "/api/auth/logout-all", {})).statusCode,
    204,
  );
  assert.equal(
    (
      await c.app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: tabletCookie },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (await laptop.request("POST", "/api/auth/logout", {})).statusCode,
    204,
  );
});

test("accounts never see each other's photos; deleting a photo removes only the owner's file", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const a = client(c),
    b = client(c);
  await a.login();
  await b.login();
  assert.equal((await putGarment(c, a.cookie, 10)).statusCode, 200);
  assert.equal((await putGarment(c, b.cookie, 20)).statusCode, 200);
  const files = () =>
    (
      c.db.prepare("SELECT filename FROM garments").all() as {
        filename: string;
      }[]
    ).map((r) => path.join(c.config.garmentRoot!, r.filename));
  const [fileA, fileB] = files();
  const imageA = (await a.request("GET", `${session}/garment/image`))
    .rawPayload;
  const imageB = (await b.request("GET", `${session}/garment/image`))
    .rawPayload;
  assert.notDeepEqual(imageA, imageB);
  assert.equal(
    (await a.request("DELETE", `${session}/garment`)).statusCode,
    204,
  );
  assert.equal(
    (await a.request("GET", `${session}/garment`)).json().garment,
    null,
  );
  assert.equal(
    (await a.request("GET", `${session}/garment/image`)).statusCode,
    404,
  );
  assert.deepEqual(
    (await b.request("GET", `${session}/garment/image`)).rawPayload,
    imageB,
  );
  assert.equal(existsSync(fileA!), false);
  assert.equal(existsSync(fileB!), true);
  assert.equal((await a.request("GET", "/api/auth/me")).statusCode, 200);
  const anonymous = await c.app.inject({
    method: "GET",
    url: `${session}/garment`,
  });
  assert.equal(anonymous.statusCode, 401);
  assert.equal(anonymous.json().error.code, "AUTH_REQUIRED");
});

test("existing anonymous progress is preserved but never attached to a new account", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  c.db
    .prepare(
      "INSERT INTO onboarding_sessions(id,token_hash,selected_category_id,started_at,updated_at,expires_at) VALUES('anon-1',?,NULL,?,?,?)",
    )
    .run(
      "a".repeat(64),
      "2026-10-20T00:00:00.000Z",
      "2026-10-20T00:00:00.000Z",
      "2026-11-19T00:00:00.000Z",
    );
  const user = client(c);
  user.cookie = "onboarding_dev=" + "B".repeat(43);
  const blocked = await user.request("GET", session);
  assert.equal(blocked.json().error.code, "AUTH_REQUIRED");
  const view = await user.create();
  assert.notEqual(view.id, "anon-1");
  const anonymous = c.db
    .prepare("SELECT user_id FROM onboarding_sessions WHERE id='anon-1'")
    .get()!;
  assert.equal(anonymous["user_id"], null);
});

test("without Kakao settings the real login path is a clear configuration error, never a fake login", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const plain = buildApp({
    config: { ...c.config, databasePath: ":memory:" },
    logger: false,
  });
  t.after(() => plain.app.close());
  const start = await plain.app.inject({
    method: "GET",
    url: "/api/auth/kakao/start",
  });
  assert.equal(start.statusCode, 503);
  assert.equal(start.json().error.code, "AUTH_PROVIDER_NOT_CONFIGURED");
  const callbackResponse = await plain.app.inject({
    method: "GET",
    url: "/api/auth/kakao/callback?code=user-1&state=x",
  });
  assert.equal(
    callbackResponse.headers.location,
    "/login?error=OAUTH_STATE_INVALID",
  );
});

test("real Kakao client builds the authorize URL and reads only the member number", async () => {
  const calls: string[] = [];
  const settings = {
    restApiKey: "rest-key",
    clientSecret: "secret",
    redirectUri: "https://app.test/api/auth/kakao/callback",
  };
  const provider = kakaoProvider(settings, (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/oauth/token")) {
      const body = String(init?.body);
      assert.ok(
        body.includes("code=abc") && body.includes("client_secret=secret"),
      );
      return Response.json({ access_token: "at" });
    }
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer at");
    return Response.json({
      id: 123456789,
      kakao_account: { email: "never-used@example.com" },
    });
  }) as typeof fetch);
  const authorize = new URL(provider.authorizeUrl("st"));
  assert.equal(
    authorize.origin + authorize.pathname,
    "https://kauth.kakao.com/oauth/authorize",
  );
  assert.equal(authorize.searchParams.get("client_id"), "rest-key");
  assert.equal(
    authorize.searchParams.get("redirect_uri"),
    settings.redirectUri,
  );
  assert.equal(authorize.searchParams.get("state"), "st");
  assert.equal(await provider.subjectFor("abc"), "123456789");
  assert.deepEqual(calls, [
    "https://kauth.kakao.com/oauth/token",
    "https://kapi.kakao.com/v2/user/me",
  ]);
  const broken = kakaoProvider(
    settings,
    (async () => new Response("no", { status: 401 })) as typeof fetch,
  );
  await assert.rejects(
    broken.subjectFor("abc"),
    (e: { code?: string }) => e.code === "OAUTH_PROVIDER_ERROR",
  );
});
