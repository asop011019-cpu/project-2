import assert from "node:assert/strict";
import { test } from "node:test";
import { client, context, publish } from "./helpers.ts";
import { importCatalog } from "../src/modules/onboarding/catalog-management.ts";
import type { SessionView } from "../src/modules/onboarding/types.ts";

const base = "/api/onboarding/session";
test("genre visits are atomic, idempotent and independent of style responses and photo hearts", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(
    c,
    ["men_classic", "men_business_casual", "women_classic_tailored"],
    2,
  );
  const user = client(c);
  await user.create();
  await user.category("menswear");
  let state: SessionView = (
    await user.request("POST", `${base}/photo-exploration`, {})
  ).json();
  assert.equal(state.photoExploration!.currentGenreGroupId, "men_formal_group");
  assert.equal(state.photoExploration!.genres.length, 5);
  assert.equal(state.styles[0]!.imageCount, 2);
  assert.ok(state.responses.every((row) => row.response === null));
  const heart = `${base}/styles/men_classic/images/fixture_men_classic_0/preference`;
  await user.request("PUT", heart, { selected: true });
  const visit = `${base}/genres/men_formal_group/progress`;
  const payload = { status: "skipped", nextGenreGroupId: "men_casual_group" };
  state = (await user.request("PUT", visit, payload)).json();
  assert.equal(state.photoExploration!.genres[0]!.status, "skipped");
  assert.equal(state.imagePreferences[0]!.selected, true);
  assert.ok(state.responses.every((row) => row.response === null));
  c.advance();
  assert.deepEqual((await user.request("PUT", visit, payload)).json(), state);
  assert.equal(
    (
      await user.request("PUT", visit, {
        status: "viewed",
        nextGenreGroupId: "women_formal_group",
      })
    ).statusCode,
    422,
  );
  assert.deepEqual((await user.request("GET", base)).json(), state);
  // A DB failure cannot commit the visit without its matching position.
  c.db.exec(
    "CREATE TRIGGER reject_genre BEFORE INSERT ON session_genres BEGIN SELECT RAISE(ABORT,'test failure'); END;",
  );
  assert.equal(
    (
      await user.request("PUT", visit, {
        status: "viewed",
        nextGenreGroupId: null,
      })
    ).statusCode,
    500,
  );
  c.db.exec("DROP TRIGGER reject_genre");
  assert.deepEqual((await user.request("GET", base)).json(), state);
  await user.request("PUT", `${base}/genre-position`, {
    genreGroupId: "men_formal_group",
  });
  assert.equal(
    (await user.request("GET", base)).json().photoExploration.genres[0].status,
    "skipped",
  );
  await user.request("PUT", visit, {
    status: "viewed",
    nextGenreGroupId: "men_casual_group",
  });
  await user.category("womenswear");
  const women = (
    await user.request("POST", `${base}/photo-exploration`, {})
  ).json();
  assert.equal(
    women.photoExploration.currentGenreGroupId,
    "women_formal_group",
  );
  assert.deepEqual(women.imagePreferences, []);
  assert.equal((await user.request("PUT", visit, payload)).statusCode, 422);
  const restored = await user.category("menswear");
  assert.equal(
    restored.photoExploration!.currentGenreGroupId,
    "men_casual_group",
  );
  assert.equal(restored.photoExploration!.genres[0]!.status, "viewed");
  const summary = (await user.request("GET", `${base}/summary`)).json();
  assert.equal(summary.selectedExamples[0].style.name, "클래식 테일러드");
  assert.equal(summary.selectedExamples[0].genreGroup.name, "포멀");
  assert.deepEqual(summary.likedStyles, []);
  const stranger = client(c);
  await stranger.create();
  assert.equal(
    (await stranger.request("GET", `${base}?sessionId=${restored.id}`))
      .statusCode,
    400,
  );
  assert.equal(
    (await stranger.request("PUT", heart, { selected: true })).statusCode,
    409,
  );
});

test("photo-only completion permits zero hearts, preserves completion on navigation and reopens on real edits", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, ["men_classic"], 1);
  const user = client(c);
  await user.create();
  await user.category("menswear");
  let state: SessionView = (
    await user.request("POST", `${base}/photo-exploration`, {})
  ).json();
  assert.equal(
    (await user.request("POST", `${base}/complete`, {})).statusCode,
    409,
  );
  for (const genre of state.photoExploration!.genres)
    state = (
      await user.request(
        "PUT",
        `${base}/genres/${genre.genreGroupId}/progress`,
        {
          status: genre.position % 2 ? "skipped" : "viewed",
          nextGenreGroupId: null,
        },
      )
    ).json();
  assert.equal(state.photoExploration!.progress.canComplete, true);
  assert.ok(state.responses.every((row) => row.response === null));
  assert.deepEqual(state.imagePreferences, []);
  state = (await user.request("POST", `${base}/complete`, {})).json();
  assert.equal(state.status, "completed");
  c.advance();
  assert.deepEqual(
    (await user.request("POST", `${base}/complete`, {})).json(),
    state,
  );
  assert.equal(
    (
      await user.request("PUT", `${base}/genre-position`, {
        genreGroupId: "men_formal_group",
      })
    ).json().status,
    "completed",
  );
  const changed = (
    await user.request(
      "PUT",
      `${base}/styles/men_classic/images/fixture_men_classic_0/preference`,
      { selected: true },
    )
  ).json();
  assert.equal(changed.status, "in_progress");
  assert.equal(changed.completedAt, null);
  assert.equal(changed.photoExploration.progress.canComplete, true);
  await user.request("POST", `${base}/complete`, {});
  importCatalog(c.db, {
    images: c.repository
      .catalog()
      .images.map((image) => ({ ...image, usageStatus: "revoked" as const })),
  });
  const withdrawn = (await user.request("GET", base)).json();
  assert.equal(withdrawn.contentStatus, "not_ready");
  assert.equal(withdrawn.status, "in_progress");
  assert.equal(withdrawn.photoExploration.progress.canComplete, false);
  assert.equal(withdrawn.imagePreferences.length, 0);
});

test("empty content stays incomplete; explicit refresh retains visits and asks to revisit newly available groups", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const user = client(c);
  await user.create();
  await user.category("menswear");
  const state: SessionView = (
    await user.request("POST", `${base}/photo-exploration`, {})
  ).json();
  for (const genre of state.photoExploration!.genres)
    await user.request("PUT", `${base}/genres/${genre.genreGroupId}/progress`, {
      status: "skipped",
      nextGenreGroupId: null,
    });
  assert.equal(
    (await user.request("POST", `${base}/complete`, {})).statusCode,
    409,
  );
  await publish(c, ["men_classic"], 1);
  assert.equal(
    (await user.request("GET", base)).json().contentStatus,
    "not_ready",
  );
  c.db.exec("UPDATE genre_groups SET position=99 WHERE id='men_formal_group'");
  const frozen = (await user.request("GET", base)).json();
  assert.equal(
    frozen.photoExploration.genres[0].genreGroupId,
    "men_formal_group",
  );
  const refreshed = (
    await user.request("POST", `${base}/refresh-catalog`, {})
  ).json();
  assert.equal(refreshed.contentStatus, "ready");
  assert.equal(
    refreshed.photoExploration.genres.find(
      (g: { genreGroupId: string }) => g.genreGroupId === "men_formal_group",
    ).status,
    "unseen",
  );
  assert.equal(refreshed.photoExploration.progress.completedCount, 4);
});
