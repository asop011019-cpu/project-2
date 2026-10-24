import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "../src/db/migrations.ts";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { SqliteOnboardingRepository } from "../src/modules/onboarding/repository.ts";
import { context, client, publish } from "./helpers.ts";
import type {
  ClothingCategory,
  GenreGroup,
  Style,
  CatalogView,
  ClothingCategoryId,
} from "../src/modules/onboarding/types.ts";

const expected = {
  menswear: [
    "포멀:클래식 테일러드,모던 포멀,비즈니스 캐주얼",
    "아메리칸:아메카지,워크웨어,밀리터리 캐주얼,웨스턴,아이비,프레피",
    "유러피안:프렌치 시크,브리티시 클래식·컨트리,이탈리안 캐주얼",
    "컨템포러리:미니멀,시티보이,놈코어,모던 캐주얼",
    "스트릿:스트릿웨어,스케이트,힙합,그런지,락시크,펑크,고프코어,테크웨어",
  ],
  womenswear: [
    "클래식·시크:클래식 테일러드,모던 포멀,비즈니스 캐주얼,드뮤어,프렌치 시크,브리티시 클래식·컨트리,올드머니",
    "아메리칸:아메카지,워크웨어,웨스턴,아이비,프레피",
    "로맨틱·내추럴:페미닌,로맨틱·러블리,코켓,발레코어,내추럴,모리걸,보헤미안",
    "컨템포러리:미니멀,놈코어,시티보이,모던 데일리",
    "스트릿:스트릿웨어,Y2K,스포티·애슬레저,고프코어,테크웨어,그런지,락시크",
  ],
};

test("catalog exposes exactly the requested five groups and 24/30 labels, with explicit readiness", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  const visitor = client(c);
  for (const categoryId of ["menswear", "womenswear"] as const) {
    const response = await visitor.request(
      "GET",
      `/api/onboarding/catalog?categoryId=${categoryId}`,
    );
    assert.equal(response.statusCode, 200);
    const catalog = response.json<CatalogView>();
    assert.deepEqual(
      catalog.genreGroups.map(
        (group) =>
          `${group.name}:${group.styleDefinitions.map((style) => style.name).join(",")}`,
      ),
      expected[categoryId],
    );
    assert.equal(
      catalog.genreGroups.flatMap((group) => group.styleDefinitions).length,
      categoryId === "menswear" ? 24 : 30,
    );
    assert.deepEqual(catalog.styles, []);
    for (const group of catalog.genreGroups) {
      assert.equal(group.categoryId, categoryId);
      assert.equal(group.contentStatus, "not_ready");
      assert.equal(group.availableStyleCount, 0);
      assert.equal(group.representativeImage, null);
      assert.ok(group.description.length > 0);
      for (const style of group.styleDefinitions) {
        assert.equal(style.contentStatus, "not_ready");
        assert.deepEqual(Object.keys(style).sort(), [
          "contentStatus",
          "id",
          "name",
          "order",
        ]);
      }
    }
  }
  assert.equal(
    (await visitor.request("GET", "/api/onboarding/styles/men_business_casual"))
      .statusCode,
    404,
  );
});

test("ready group previews use only eligible images and classification changes do not reorder exploration", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, [
    "men_casual",
    "men_classic",
    "men_gorpcore",
    "men_minimal",
  ]);
  const visitor = client(c);
  const response = (
    await visitor.request("GET", "/api/onboarding/catalog?categoryId=menswear")
  ).json<CatalogView>();
  const street = response.genreGroups.find((group) => group.name === "스트릿")!;
  assert.equal(street.availableStyleCount, 1);
  assert.equal(street.representativeImage?.styleId, "men_gorpcore");
  assert.equal(
    street.styleDefinitions.find((style) => style.name === "고프코어")
      ?.contentStatus,
    "ready",
  );
  assert.equal(
    street.styleDefinitions.find((style) => style.name === "스케이트")
      ?.contentStatus,
    "not_ready",
  );
  await visitor.create();
  const session = await visitor.category("menswear");
  assert.deepEqual(session.activeStyleOrder, [
    "men_casual",
    "men_gorpcore",
    "men_classic",
    "men_minimal",
  ]);
  assert.equal(session.progress.answeredCount, 0);
});

type LegacyCatalog = {
  categories: ClothingCategory[];
  genreGroups: GenreGroup[];
  styles: Omit<Style, "explorationOrder">[];
};
async function legacyDatabase() {
  const directory = await mkdtemp(
    path.join(tmpdir(), "classification-upgrade-"),
  );
  const assetRoot = path.join(directory, "assets");
  await mkdir(assetRoot);
  const config = loadConfig({
    DATABASE_PATH: path.join(directory, "legacy.sqlite"),
    ASSET_ROOT: assetRoot,
    PUBLIC_ORIGIN: "http://localhost:3001",
  });
  const db = new DatabaseSync(config.databasePath, {
    enableForeignKeyConstraints: true,
  });
  migrate(db);
  // Schema v2 only adds this column: reverse it in this isolated fixture to restore exact v1 DDL.
  db.exec(
    "DROP TABLE garments; ALTER TABLE styles DROP COLUMN exploration_order; PRAGMA user_version=1;",
  );
  const fixture = JSON.parse(
    await readFile(
      path.resolve("test/fixtures/classification-v1.json"),
      "utf8",
    ),
  ) as LegacyCatalog;
  for (const c of fixture.categories)
    db.prepare("INSERT INTO clothing_categories VALUES(?,?,?)").run(
      c.id,
      c.name,
      c.order,
    );
  for (const g of fixture.genreGroups)
    db.prepare("INSERT INTO genre_groups VALUES(?,?,?,?,?)").run(
      g.id,
      g.categoryId,
      g.name,
      g.description,
      g.order,
    );
  for (const s of fixture.styles)
    db.prepare("INSERT INTO styles VALUES(?,?,?,?,?,?,?)").run(
      s.id,
      s.categoryId,
      s.genreGroupId,
      s.name,
      s.description,
      s.order,
      s.publicationStatus,
    );
  db.prepare("UPDATE catalog_state SET version=1").run();
  return { directory, db, config, fixture };
}
function history(db: DatabaseSync) {
  return Object.fromEntries(
    [
      "onboarding_sessions",
      "category_sessions",
      "session_styles",
      "style_responses",
      "image_preferences",
    ].map((table) => [
      table,
      db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    ]),
  );
}

test("v1 upgrade preserves all IDs, images, responses, completion, and operator-modified exploration order", async (t) => {
  const legacy = await legacyDatabase();
  let upgraded: ReturnType<typeof buildApp> | undefined;
  t.after(async () => {
    await upgraded?.app.close();
    await rm(legacy.directory, { recursive: true, force: true });
  });
  const { db, fixture } = legacy;
  // Preserve operator edits as well as the default order.
  db.prepare(
    "UPDATE styles SET position=5,description='Operator description',publication_status='published' WHERE id='men_gorpcore'",
  ).run();
  db.prepare(
    "UPDATE styles SET publication_status='published' WHERE id IN ('men_casual','women_daily_casual','women_gorpcore')",
  ).run();
  const oldOrders = Object.fromEntries(
    fixture.categories.map((category) => [
      category.id,
      db
        .prepare(
          `SELECT s.id FROM styles s JOIN genre_groups g ON g.id=s.genre_group_id WHERE s.category_id=? ORDER BY g.position,s.position,s.id`,
        )
        .all(category.id)
        .map((row) => String(row["id"])),
    ]),
  );
  const repository = new SqliteOnboardingRepository(db);
  const startedAt = "2026-10-23T00:00:00.000Z",
    completedAt = "2026-10-23T00:05:00.000Z";
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  repository.insertSession({
    id: "legacy-owner",
    tokenHash,
    selectedCategoryId: "menswear",
    startedAt,
    updatedAt: startedAt,
    expiresAt: "2099-01-01T00:00:00.000Z",
  });
  const active = {
    menswear: ["men_gorpcore", "men_casual"],
    womenswear: ["women_daily_casual", "women_gorpcore"],
  };
  for (const categoryId of ["menswear", "womenswear"] as const) {
    repository.insertCategory({
      sessionId: "legacy-owner",
      categoryId,
      catalogVersion: 1,
      currentStyleId: categoryId === "menswear" ? "men_casual" : null,
      status: categoryId === "menswear" ? "in_progress" : "completed",
      startedAt,
      updatedAt: startedAt,
      completedAt: categoryId === "menswear" ? null : completedAt,
    });
    repository.replaceSnapshot("legacy-owner", categoryId, active[categoryId]);
    for (const styleId of active[categoryId]) {
      repository.saveResponse({
        sessionId: "legacy-owner",
        categoryId,
        styleId,
        response: styleId === active[categoryId][0] ? "liked" : "skipped",
        updatedAt: startedAt,
      });
      for (let i = 0; i < 4; i++)
        db.prepare(
          "INSERT INTO style_images VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ).run(
          `legacy_${styleId}_${i}`,
          styleId,
          categoryId,
          `/media/legacy_${styleId}_${i}.png`,
          `/media/legacy_${styleId}_${i}.png`,
          "Metadata fixture only; file not requested",
          8,
          12,
          "flat_lay",
          1,
          i,
          null,
          "Test fixture",
          "allowed",
          "published",
          null,
        );
      repository.savePreference({
        sessionId: "legacy-owner",
        categoryId,
        styleId,
        imageId: `legacy_${styleId}_0`,
        selected: true,
        updatedAt: startedAt,
      });
    }
  }
  const before = history(db),
    images = db.prepare("SELECT * FROM style_images ORDER BY id").all();
  const descriptions = db
    .prepare("SELECT id,description,publication_status FROM styles ORDER BY id")
    .all();
  db.close();
  upgraded = buildApp({ config: legacy.config, logger: false });
  await upgraded.app.ready();
  const catalog = upgraded.repository.catalog();
  assert.equal(catalog.styles.length, 54);
  assert.equal(catalog.genreGroups.length, 10);
  assert.ok(
    fixture.styles.every((old) =>
      catalog.styles.some((style) => style.id === old.id),
    ),
  );
  assert.ok(
    fixture.genreGroups.every((old) =>
      catalog.genreGroups.some((group) => group.id === old.id),
    ),
  );
  assert.deepEqual(
    upgraded.db.prepare("SELECT * FROM style_images ORDER BY id").all(),
    images,
  );
  for (const old of descriptions) {
    const current = catalog.styles.find((style) => style.id === old["id"])!;
    assert.equal(current.description, old["description"]);
    assert.equal(current.publicationStatus, old["publication_status"]);
  }
  for (const categoryId of ["menswear", "womenswear"] as const) {
    const previous = new Set(oldOrders[categoryId]);
    assert.deepEqual(
      catalog.styles
        .filter(
          (style) => style.categoryId === categoryId && previous.has(style.id),
        )
        .map((style) => style.id),
      oldOrders[categoryId],
    );
  }
  const restored = await upgraded.app.inject({
    method: "GET",
    url: "/api/onboarding/session",
    headers: { cookie: `onboarding_dev=${token}` },
  });
  assert.equal(restored.statusCode, 200);
  assert.deepEqual(restored.json().activeStyleOrder, active.menswear);
  assert.equal(restored.json().currentStyleId, "men_casual");
  assert.equal(restored.json().progress.answeredCount, 2);
  assert.deepEqual(history(upgraded.db), before);
  migrate(upgraded.db);
  assert.equal(upgraded.repository.catalog().version, 2);
  assert.deepEqual(upgraded.db.prepare("PRAGMA foreign_key_check").all(), []);
});

test("classification collision rolls back migration and keeps the v1 schema and records intact", async (t) => {
  const legacy = await legacyDatabase();
  t.after(async () => {
    legacy.db.close();
    await rm(legacy.directory, { recursive: true, force: true });
  });
  legacy.db
    .prepare(
      "INSERT INTO genre_groups VALUES('men_european_group','womenswear','Operator-owned group','Preserve',99)",
    )
    .run();
  const before = legacy.db
    .prepare("SELECT * FROM genre_groups ORDER BY id")
    .all();
  assert.throws(() => migrate(legacy.db), /another category/);
  assert.equal(
    legacy.db.prepare("PRAGMA user_version").get()!["user_version"],
    1,
  );
  assert.equal(
    legacy.db
      .prepare("PRAGMA table_info(styles)")
      .all()
      .some((column) => column["name"] === "exploration_order"),
    false,
  );
  assert.deepEqual(
    legacy.db.prepare("SELECT * FROM genre_groups ORDER BY id").all(),
    before,
  );
});
