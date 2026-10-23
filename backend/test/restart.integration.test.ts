import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.ts";
import { context, client, publish } from "./helpers.ts";

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 3000);
  timeout.unref();
  await exited;
  clearTimeout(timeout);
}

test("closing and reopening the database restores the exact snapshot and preferences", async (t) => {
  const c = await context();
  let reopened: ReturnType<typeof buildApp> | undefined;
  t.after(async () => {
    await reopened?.app.close();
    await c.cleanup();
  });
  await publish(c, ["men_casual", "men_gorpcore"]);
  const visitor = client(c);
  await visitor.create();
  await visitor.category("menswear");
  await visitor.request(
    "PUT",
    "/api/onboarding/session/styles/men_casual/images/fixture_men_casual_0/preference",
    { selected: true },
  );
  await visitor.request(
    "PUT",
    "/api/onboarding/session/styles/men_casual/response",
    { response: "disliked", nextStyleId: "men_gorpcore" },
  );
  const before = (
    await visitor.request("GET", "/api/onboarding/session")
  ).json();
  await c.app.close();
  reopened = buildApp({ config: c.config, logger: false });
  const response = await reopened.app.inject({
    method: "GET",
    url: "/api/onboarding/session",
    headers: { cookie: visitor.cookie },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), before);
});

test(
  "real HTTP requests and a separate server-process restart preserve cookie-authenticated progress",
  { timeout: 15000 },
  async (t) => {
    const c = await context();
    let child: ChildProcess | undefined;
    t.after(async () => {
      if (child) await stop(child);
      await c.cleanup();
    });
    await publish(c, ["men_casual", "women_daily_casual"]);
    await c.app.close();
    const port = await freePort(),
      origin = `http://127.0.0.1:${port}`;
    let stderr = "";
    const start = async () => {
      child = spawn(
        process.execPath,
        [fileURLToPath(new URL("../src/server.js", import.meta.url))],
        {
          env: {
            ...process.env,
            NODE_ENV: "test",
            HOST: "127.0.0.1",
            PORT: String(port),
            DATABASE_PATH: c.config.databasePath,
            ASSET_ROOT: c.config.assetRoot,
            PUBLIC_ORIGIN: origin,
          },
          stdio: ["ignore", "ignore", "pipe"],
        },
      );
      child.stderr?.on("data", (data) => {
        stderr += String(data);
      });
      for (let index = 0; index < 100; index++) {
        if (child.exitCode !== null)
          throw new Error(`Server exited: ${stderr}`);
        try {
          if ((await fetch(`${origin}/health`)).ok) return;
        } catch {}
        await delay(30);
      }
      throw new Error(`Server did not become ready: ${stderr}`);
    };
    await start();
    const headers = {
      "content-type": "application/json",
      "x-onboarding-request": "1",
      origin,
    };
    const created = await fetch(`${origin}/api/onboarding/session`, {
      method: "POST",
      headers,
      body: "{}",
    });
    assert.equal(created.status, 201);
    const cookie = created.headers.get("set-cookie")!.split(";")[0]!;
    const authenticated = { ...headers, cookie };
    const category = await fetch(`${origin}/api/onboarding/session/category`, {
      method: "PUT",
      headers: authenticated,
      body: JSON.stringify({ categoryId: "menswear" }),
    });
    assert.equal(category.status, 200);
    const saved = await fetch(
      `${origin}/api/onboarding/session/styles/men_casual/response`,
      {
        method: "PUT",
        headers: authenticated,
        body: JSON.stringify({ response: "skipped", nextStyleId: null }),
      },
    );
    assert.equal(saved.status, 200);
    const before = await saved.json();
    await fetch(`${origin}/api/onboarding/session/photo-exploration`, {
      method: "POST",
      headers: authenticated,
      body: "{}",
    });
    const visited = await fetch(
      `${origin}/api/onboarding/session/genres/men_formal_group/progress`,
      {
        method: "PUT",
        headers: authenticated,
        body: JSON.stringify({
          status: "viewed",
          nextGenreGroupId: "men_casual_group",
        }),
      },
    );
    assert.equal(visited.status, 200);
    const photoBefore = await visited.json();
    await stop(child!);
    await start();
    const restored = await fetch(`${origin}/api/onboarding/session`, {
      headers: { cookie },
    });
    assert.equal(restored.status, 200);
    const restoredState = await restored.json();
    assert.deepEqual(restoredState, photoBefore);
    assert.deepEqual(restoredState.responses, before.responses);
    assert.equal((await fetch(`${origin}/api/onboarding/session`)).status, 401);
  },
);
