import assert from "node:assert/strict";
import { test } from "node:test";
import { writeFile, symlink } from "node:fs/promises";
import path from "node:path";
import { context, client, publish } from "./helpers.ts";
import {
  importCatalog,
  catalogImportSchema,
  verifyLocalAssets,
  imageReferenceSchema,
} from "../src/modules/onboarding/catalog-management.ts";
const base = "/api/onboarding/session";

test("frozen order survives reordering and new styles until explicit catalog refresh", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, ["men_casual", "men_gorpcore"]);
  const oldUser = client(c);
  await oldUser.create();
  const original = await oldUser.category("menswear");
  const gorp = c.repository
    .catalog()
    .styles.find((style) => style.id === "men_gorpcore")!;
  importCatalog(c.db, { styles: [{ ...gorp, explorationOrder: 0 }] });
  await publish(c, ["men_amekaji"]);
  const restored = (await oldUser.request("GET", base)).json();
  assert.deepEqual(restored.activeStyleOrder, original.activeStyleOrder);
  assert.equal(restored.catalogVersion, original.catalogVersion);
  assert.equal(restored.catalogChanged, true);
  const newUser = client(c);
  await newUser.create();
  assert.deepEqual((await newUser.category("menswear")).activeStyleOrder, [
    "men_gorpcore",
    "men_casual",
    "men_amekaji",
  ]);
  const refreshed = (
    await oldUser.request("POST", `${base}/refresh-catalog`, {})
  ).json();
  assert.deepEqual(refreshed.activeStyleOrder, [
    "men_gorpcore",
    "men_casual",
    "men_amekaji",
  ]);
  assert.equal(refreshed.catalogChanged, false);
});

test("withdrawal removes public content and recalculates counts without inventing responses", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, ["men_casual", "men_gorpcore"]);
  const user = client(c);
  await user.create();
  await user.category("menswear");
  await user.request("PUT", `${base}/styles/men_casual/response`, {
    response: "liked",
  });
  await user.request(
    "PUT",
    `${base}/styles/men_casual/images/fixture_men_casual_0/preference`,
    { selected: true },
  );
  const casual = c.repository
    .catalog()
    .styles.find((style) => style.id === "men_casual")!;
  importCatalog(c.db, { styles: [{ ...casual, publicationStatus: "draft" }] });
  const state = (await user.request("GET", base)).json();
  assert.deepEqual(state.activeStyleOrder, ["men_gorpcore"]);
  assert.equal(state.currentStyleId, "men_gorpcore");
  assert.equal(state.progress.totalCount, 1);
  assert.equal(state.progress.originalTotalCount, 2);
  assert.equal(state.progress.withdrawnCount, 1);
  assert.equal(state.progress.answeredCount, 0);
  const summary = (await user.request("GET", `${base}/summary`)).json();
  assert.deepEqual(summary.likedStyles, []);
  assert.deepEqual(summary.likedImages, []);
  assert.equal(
    (await user.request("GET", "/api/onboarding/styles/men_casual")).statusCode,
    404,
  );
  assert.equal(
    (await user.request("GET", "/media/fixture_men_casual_0.png")).statusCode,
    404,
  );
  importCatalog(c.db, {
    styles: [{ ...casual, publicationStatus: "published" }],
  });
  assert.deepEqual((await user.request("GET", base)).json().activeStyleOrder, [
    "men_gorpcore",
  ]);
  const refreshed = (
    await user.request("POST", `${base}/refresh-catalog`, {})
  ).json();
  assert.equal(refreshed.responses[0].response, "liked");
  assert.equal(refreshed.imagePreferences.length, 1);
});

test("an image rights withdrawal below four eligible images prevents false completion", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, ["men_casual"]);
  const user = client(c);
  await user.create();
  await user.category("menswear");
  await user.request("PUT", `${base}/styles/men_casual/response`, {
    response: "skipped",
  });
  assert.equal(
    (await user.request("POST", `${base}/complete`, {})).json().status,
    "completed",
  );
  const image = c.repository.catalog().images[0]!;
  importCatalog(c.db, { images: [{ ...image, usageStatus: "revoked" }] });
  const state = (await user.request("GET", base)).json();
  assert.equal(state.contentStatus, "not_ready");
  assert.equal(state.progress.totalCount, 0);
  assert.equal(state.status, "in_progress");
  assert.equal(state.completedAt, null);
  assert.equal(
    (await user.request("POST", `${base}/complete`, {})).statusCode,
    409,
  );
  assert.equal((await user.request("GET", image.originalRef)).statusCode, 404);
});

test("an empty initial snapshot requires explicit refresh when images become available", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const user = client(c);
  await user.create();
  await user.category("womenswear");
  await publish(c, ["women_daily_casual"]);
  assert.equal((await user.request("GET", base)).json().progress.totalCount, 0);
  const state = (
    await user.request("POST", `${base}/refresh-catalog`, {})
  ).json();
  assert.equal(state.progress.totalCount, 1);
  assert.equal(state.currentStyleId, "women_daily_casual");
});

test("catalog import and DB constraints reject duplicate originals, content, category mixing and image identity changes", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, ["men_casual", "women_daily_casual"]);
  const catalog = c.repository.catalog(),
    first = catalog.images[0]!;
  assert.throws(() =>
    importCatalog(c.db, {
      images: [{ ...first, id: "duplicate_original", contentHash: null }],
    }),
  );
  assert.throws(() =>
    importCatalog(c.db, {
      images: [
        {
          ...first,
          id: "duplicate_hash",
          originalRef: "/media/not-registered-test.png",
        },
      ],
    }),
  );
  assert.throws(() =>
    importCatalog(c.db, {
      images: [
        {
          ...first,
          id: "mixed",
          categoryId: "womenswear",
          originalRef: "/media/invalid-test.png",
          contentHash: null,
        },
      ],
    }),
  );
  assert.throws(
    () =>
      importCatalog(c.db, {
        images: [{ ...first, originalRef: "/media/replacement-test.png" }],
      }),
    /immutable/,
  );
  assert.deepEqual(c.repository.catalog(), catalog);
  assert.throws(() =>
    c.db
      .prepare(
        "INSERT INTO style_responses VALUES('missing','menswear','women_daily_casual','liked','time')",
      )
      .run(),
  );
});

test("eligibility caps each style at six and excludes pending or draft images", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, ["men_casual"], 7);
  const visitor = client(c);
  let detail = (
    await visitor.request("GET", "/api/onboarding/styles/men_casual")
  ).json();
  assert.equal(detail.images.length, 6);
  const images = c.repository.catalog().images;
  importCatalog(c.db, {
    images: images.slice(0, 4).map((image, index) => ({
      ...image,
      ...(index % 2
        ? { publicationStatus: "draft" }
        : { usageStatus: "pending" }),
    })),
  });
  assert.equal(
    (await visitor.request("GET", "/api/onboarding/styles/men_casual"))
      .statusCode,
    404,
  );
});

test("local media references reject traversal, active content, missing files and escaping symlinks", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  for (const reference of [
    "/media/../outside.png",
    "/media/%2e%2e/outside.png",
    "/media/test.svg",
    "http://example.test/image.jpg",
    "javascript:alert(1)",
    "https://user:pass@example.test/image.jpg",
  ])
    assert.equal(
      imageReferenceSchema.safeParse(reference).success,
      false,
      reference,
    );
  const image = {
    id: "test",
    styleId: "men_casual",
    categoryId: "menswear",
    originalRef: "/media/missing.png",
    thumbnailRef: "/media/missing.png",
    alt: "Test only",
    width: 8,
    height: 12,
    format: "flat_lay",
    isGenerated: true,
    order: 1,
    sourceUrl: null,
    creator: "Test",
    usageStatus: "allowed",
    publicationStatus: "published",
  };
  await assert.rejects(() =>
    verifyLocalAssets(
      catalogImportSchema.parse({ images: [image] }),
      c.config.assetRoot,
    ),
  );
  const outside = path.join(c.directory, "outside.png");
  await writeFile(outside, "test");
  await symlink(outside, path.join(c.config.assetRoot, "escape.png"));
  await assert.rejects(
    () =>
      verifyLocalAssets(
        catalogImportSchema.parse({
          images: [
            {
              ...image,
              originalRef: "/media/escape.png",
              thumbnailRef: "/media/escape.png",
            },
          ],
        }),
        c.config.assetRoot,
      ),
    /escapes/,
  );
});

test("image registration validates dimensions and real HTTP source URL metadata", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, ["men_casual"]);
  const image = c.repository.catalog().images[0]!;
  assert.equal(
    catalogImportSchema.safeParse({
      images: [{ ...image, sourceUrl: "https://example.test/fixture-source" }],
    }).success,
    true,
  );
  assert.equal(
    catalogImportSchema.safeParse({ images: [{ ...image, width: 0 }] }).success,
    false,
  );
  assert.equal(
    catalogImportSchema.safeParse({ images: [{ ...image, format: "unknown" }] })
      .success,
    false,
  );
  assert.equal(
    catalogImportSchema.safeParse({ images: [{ ...image, creator: null }] })
      .success,
    false,
  );
});
