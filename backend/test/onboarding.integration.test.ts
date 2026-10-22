import assert from "node:assert/strict";
import { test } from "node:test";
import { context, client, publish } from "./helpers.ts";
import {
  seedCatalog,
  importCatalog,
} from "../src/modules/onboarding/catalog-management.ts";
import type {
  SessionView,
  SessionSummary,
} from "../src/modules/onboarding/types.ts";

const base = "/api/onboarding/session";
test("seeds exactly 12 styles per category without fabricating images or public readiness", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const catalog = c.repository.catalog();
  assert.equal(catalog.categories.length, 2);
  assert.equal(catalog.genreGroups.length, 7);
  assert.equal(catalog.styles.length, 24);
  assert.equal(catalog.images.length, 0);
  assert.deepEqual(
    catalog.styles
      .filter((s) => s.categoryId === "menswear")
      .map((s) => s.name)
      .sort(),
    [
      "캐주얼",
      "고프코어",
      "아메카지",
      "시티보이",
      "놈코어",
      "클래식",
      "아이비",
      "프레피",
      "모던 포멀",
      "스트릿웨어",
      "테크웨어",
      "미니멀",
    ].sort(),
  );
  assert.deepEqual(
    catalog.styles
      .filter((s) => s.categoryId === "womenswear")
      .map((s) => s.name)
      .sort(),
    [
      "데일리 캐주얼",
      "고프코어",
      "시티보이",
      "Y2K",
      "페미닌 룩",
      "로맨틱/러블리",
      "코켓 코어",
      "클래식 테일러드",
      "프레피 룩",
      "올드머니 룩",
      "미니멀리즘",
      "스트릿 웨어",
    ].sort(),
  );
  assert.ok(catalog.styles.every((s) => s.publicationStatus === "draft"));
  seedCatalog(c.db);
  assert.deepEqual(c.repository.catalog(), catalog);
  const visitor = client(c);
  await visitor.create();
  const state = await visitor.category("menswear");
  assert.equal(state.contentStatus, "not_ready");
  assert.equal(state.progress.totalCount, 0);
  assert.equal(state.progress.canComplete, false);
  assert.equal(
    (await visitor.request("POST", `${base}/complete`, {})).statusCode,
    409,
  );
  const response = await visitor.request("GET", "/api/onboarding/catalog");
  assert.equal(response.json().contentStatus, "not_ready");
  assert.deepEqual(response.json().styles, []);
  assert.equal(
    (await visitor.request("GET", "/api/onboarding/styles/men_casual"))
      .statusCode,
    404,
  );
});

test("public catalog branches by category, supports mixed formats, and never exposes drafts", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, ["men_casual", "women_daily_casual"], 6);
  const visitor = client(c);
  const men = (
    await visitor.request("GET", "/api/onboarding/catalog?categoryId=menswear")
  ).json();
  assert.deepEqual(
    men.styles.map((s: { id: string }) => s.id),
    ["men_casual"],
  );
  assert.equal(men.genreGroups.length, 3);
  const women = (
    await visitor.request(
      "GET",
      "/api/onboarding/catalog?categoryId=womenswear",
    )
  ).json();
  assert.deepEqual(
    women.styles.map((s: { id: string }) => s.id),
    ["women_daily_casual"],
  );
  assert.equal(women.genreGroups.length, 4);
  const detail = (
    await visitor.request("GET", "/api/onboarding/styles/men_casual")
  ).json();
  assert.equal(detail.images.length, 6);
  assert.deepEqual(
    [
      ...new Set(
        detail.images.map((image: { format: string }) => image.format),
      ),
    ],
    ["model_outfit", "flat_lay", "collage"],
  );
  assert.ok(
    detail.images.every(
      (image: { creator: string; width: number }) =>
        image.creator && image.width === 8,
    ),
  );
  assert.equal(
    (await visitor.request("GET", detail.images[0].originalUrl)).statusCode,
    200,
  );
  const before = c.repository.catalog();
  seedCatalog(c.db);
  assert.deepEqual(c.repository.catalog(), before);
});

test("position, explicit skipped/disliked responses, and completion are separate", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, ["men_casual", "men_gorpcore"]);
  const user = client(c);
  await user.create();
  let state = await user.category("menswear");
  assert.deepEqual(
    state.responses.map((row) => row.response),
    [null, null],
  );
  state = (
    await user.request("PUT", `${base}/position`, { styleId: "men_gorpcore" })
  ).json();
  assert.equal(state.progress.currentIndex, 1);
  assert.equal(state.progress.answeredCount, 0);
  assert.equal(
    (await user.request("POST", `${base}/complete`, {})).statusCode,
    409,
  );
  state = (
    await user.request("PUT", `${base}/styles/men_casual/response`, {
      response: "skipped",
      nextStyleId: "men_gorpcore",
    })
  ).json();
  assert.equal(state.progress.answeredCount, 1);
  assert.equal(state.currentStyleId, "men_gorpcore");
  state = (
    await user.request("PUT", `${base}/styles/men_gorpcore/response`, {
      response: "disliked",
      nextStyleId: null,
    })
  ).json();
  assert.equal(state.currentStyleId, null);
  assert.equal(state.progress.canComplete, true);
  const complete = await user.request("POST", `${base}/complete`, {});
  assert.equal(complete.statusCode, 200);
  assert.equal(complete.json().status, "completed");
  assert.ok(complete.json().completedAt);
  c.advance();
  assert.deepEqual(
    (await user.request("POST", `${base}/complete`, {})).json(),
    complete.json(),
  );
  const summary = (
    await user.request("GET", `${base}/summary`)
  ).json<SessionSummary>();
  assert.equal(summary.isExploringOnly, true);
  assert.equal(summary.likedStyles.length, 0);
  assert.equal(summary.skippedStyles[0]?.id, "men_casual");
  assert.equal(summary.dislikedStyles[0]?.id, "men_gorpcore");
});

test("image preferences are idempotent final states and do not answer or advance styles", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, ["men_casual", "men_gorpcore"]);
  const user = client(c);
  await user.create();
  const start = await user.category("menswear");
  const url = `${base}/styles/men_casual/images/fixture_men_casual_0/preference`;
  const first = (
    await user.request("PUT", url, { selected: true })
  ).json<SessionView>();
  c.advance();
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      user.request("PUT", url, { selected: true }),
    ),
  );
  for (const result of results) {
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.json(), first);
  }
  assert.equal(first.currentStyleId, start.currentStyleId);
  assert.equal(first.progress.answeredCount, 0);
  assert.equal(
    c.db.prepare("SELECT count(*) AS count FROM image_preferences").get()![
      "count"
    ],
    1,
  );
  await user.request("PUT", `${base}/styles/men_casual/response`, {
    response: "disliked",
  });
  const summary = (
    await user.request("GET", `${base}/summary`)
  ).json<SessionSummary>();
  assert.equal(summary.likedImages.length, 1);
  assert.equal(summary.dislikedStyles.length, 1);
  const clear = (await user.request("PUT", url, { selected: false })).json();
  c.advance();
  assert.deepEqual(
    (await user.request("PUT", url, { selected: false })).json(),
    clear,
  );
  assert.equal(
    (await user.request("GET", `${base}/summary`)).json().likedImages.length,
    0,
  );
  assert.equal(
    c.db.prepare("SELECT count(*) AS count FROM image_preferences").get()![
      "count"
    ],
    1,
  );
});

test("response replay does not advance twice, and invalid movement rolls back the answer", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, [
    "men_casual",
    "men_gorpcore",
    "men_amekaji",
    "women_daily_casual",
  ]);
  const user = client(c);
  await user.create();
  await user.category("menswear");
  const url = `${base}/styles/men_casual/response`,
    payload = { response: "liked", nextStyleId: "men_gorpcore" };
  const first = await user.request("PUT", url, payload);
  assert.equal(first.statusCode, 200);
  c.advance();
  assert.deepEqual(
    (await user.request("PUT", url, payload)).json(),
    first.json(),
  );
  const failed = await user.request(
    "PUT",
    `${base}/styles/men_amekaji/response`,
    { response: "liked", nextStyleId: "women_daily_casual" },
  );
  assert.equal(failed.statusCode, 422);
  assert.equal(failed.json().error.code, "STYLE_NOT_IN_SESSION");
  assert.equal(
    (await user.request("GET", base)).json().progress.answeredCount,
    1,
  );
});

test("category switches preserve independent responses, hearts, order and position", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, [
    "men_gorpcore",
    "men_cityboy",
    "women_gorpcore",
    "women_cityboy",
  ]);
  const user = client(c);
  await user.create();
  await user.category("menswear");
  await user.request("PUT", `${base}/styles/men_gorpcore/response`, {
    response: "liked",
    nextStyleId: "men_cityboy",
  });
  await user.request(
    "PUT",
    `${base}/styles/men_gorpcore/images/fixture_men_gorpcore_0/preference`,
    { selected: true },
  );
  const women = await user.category("womenswear");
  assert.equal(women.progress.answeredCount, 0);
  assert.deepEqual(women.imagePreferences, []);
  assert.equal(
    (
      await user.request("PUT", `${base}/styles/men_gorpcore/response`, {
        response: "disliked",
      })
    ).statusCode,
    422,
  );
  assert.equal(
    (
      await user.request(
        "PUT",
        `${base}/styles/women_gorpcore/images/fixture_men_gorpcore_0/preference`,
        { selected: true },
      )
    ).statusCode,
    422,
  );
  await user.request("PUT", `${base}/styles/women_gorpcore/response`, {
    response: "skipped",
  });
  const men = await user.category("menswear");
  assert.equal(men.currentStyleId, "men_cityboy");
  assert.equal(men.responses[0]?.response, "liked");
  assert.equal(men.imagePreferences.length, 1);
  assert.equal(
    (await user.category("womenswear")).responses[0]?.response,
    "skipped",
  );
});

test("editing actual preferences reopens completion; navigation and no-op writes do not", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, ["men_casual"]);
  const user = client(c);
  await user.create();
  await user.category("menswear");
  await user.request("PUT", `${base}/styles/men_casual/response`, {
    response: "skipped",
  });
  let done = (
    await user.request("POST", `${base}/complete`, {})
  ).json<SessionView>();
  c.advance();
  let state = (
    await user.request("PUT", `${base}/position`, { styleId: "men_casual" })
  ).json<SessionView>();
  assert.equal(state.status, "completed");
  assert.equal(state.completedAt, done.completedAt);
  state = (
    await user.request("PUT", `${base}/styles/men_casual/response`, {
      response: "liked",
    })
  ).json();
  assert.equal(state.status, "in_progress");
  assert.equal(state.completedAt, null);
  assert.equal(state.progress.canComplete, true);
  done = (await user.request("POST", `${base}/complete`, {})).json();
  assert.notEqual(done.completedAt, null);
  c.advance();
  state = (
    await user.request(
      "PUT",
      `${base}/styles/men_casual/images/fixture_men_casual_0/preference`,
      { selected: true },
    )
  ).json();
  assert.equal(state.status, "in_progress");
  assert.equal(state.completedAt, null);
});

test("schema validation rejects URLs, toggles, unknown response states, and extra fields", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, ["men_casual"]);
  const user = client(c);
  await user.create();
  await user.category("menswear");
  for (const payload of [
    { selected: "true" },
    { toggle: true },
    { selected: true, url: "https://unregistered.invalid/photo.jpg" },
  ])
    assert.equal(
      (
        await user.request(
          "PUT",
          `${base}/styles/men_casual/images/fixture_men_casual_0/preference`,
          payload,
        )
      ).statusCode,
      400,
    );
  for (const response of ["unseen", "unsure", "unanswered", "skip", null])
    assert.equal(
      (
        await user.request("PUT", `${base}/styles/men_casual/response`, {
          response,
        })
      ).statusCode,
      400,
    );
  assert.equal(
    (await user.request("GET", "/api/onboarding/catalog?categoryId=unknown"))
      .statusCode,
    400,
  );
  assert.equal(
    (await user.request("PUT", `${base}/position`, { styleId: "unknown" }))
      .statusCode,
    422,
  );
  assert.equal(
    (await user.request("GET", base)).json().progress.answeredCount,
    0,
  );
});

test("a database failure cannot partially save an answer or claim success", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, ["men_casual", "men_gorpcore"]);
  const user = client(c);
  await user.create();
  const before = await user.category("menswear");
  c.db.exec(
    "CREATE TRIGGER fail_category_write BEFORE UPDATE ON category_sessions BEGIN SELECT RAISE(ABORT,'fixture database failure'); END;",
  );
  const failed = await user.request(
    "PUT",
    `${base}/styles/men_casual/response`,
    { response: "liked", nextStyleId: "men_gorpcore" },
  );
  assert.equal(failed.statusCode, 500);
  assert.equal(failed.json().error.code, "INTERNAL_ERROR");
  assert.ok(!failed.body.includes("fixture database"));
  assert.equal(
    c.db.prepare("SELECT count(*) AS count FROM style_responses").get()![
      "count"
    ],
    0,
  );
  c.db.exec("DROP TRIGGER fail_category_write");
  assert.deepEqual((await user.request("GET", base)).json(), before);
});

test("multiple liked styles stay independent when a previous answer is edited", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, ["men_casual", "men_gorpcore"]);
  const user = client(c);
  await user.create();
  await user.category("menswear");
  for (const id of ["men_casual", "men_gorpcore"]) {
    assert.equal(
      (
        await user.request("PUT", `${base}/styles/${id}/response`, {
          response: "liked",
        })
      ).statusCode,
      200,
    );
  }
  assert.equal(
    (await user.request("GET", `${base}/summary`)).json().likedStyles.length,
    2,
  );
  await user.request("PUT", `${base}/position`, { styleId: "men_casual" });
  await user.request("PUT", `${base}/styles/men_casual/response`, {
    response: "disliked",
  });
  const summary = (
    await user.request("GET", `${base}/summary`)
  ).json<SessionSummary>();
  assert.deepEqual(
    summary.likedStyles.map((style) => style.id),
    ["men_gorpcore"],
  );
  assert.deepEqual(
    summary.dislikedStyles.map((style) => style.id),
    ["men_casual"],
  );
});
