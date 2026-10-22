import type { DatabaseSync } from "node:sqlite";
import { GENRE_GROUPS, STYLES } from "../modules/onboarding/data/catalog.ts";

/** Data-only v2 upgrade. The caller wraps this in the existing migration transaction. */
export function migrateGenreClassification(db: DatabaseSync): void {
  db.exec(
    "ALTER TABLE styles ADD COLUMN exploration_order INTEGER NOT NULL DEFAULT 0 CHECK(exploration_order>=0)",
  );
  const categories = new Set(
    db
      .prepare("SELECT id FROM clothing_categories")
      .all()
      .map((row) => row["id"]),
  );
  if (!categories.size) return; // A new DB is populated by the regular non-destructive seed.

  // Capture the actual old order, including any operator changes, BEFORE regrouping.
  db.exec(`WITH ranks AS (
    SELECT s.id, ROW_NUMBER() OVER (
      PARTITION BY s.category_id ORDER BY g.position,s.position,s.id
    ) * 10 AS sequence FROM styles s JOIN genre_groups g ON g.id=s.genre_group_id
  ) UPDATE styles SET exploration_order=(SELECT sequence FROM ranks WHERE ranks.id=styles.id)`);
  for (const group of GENRE_GROUPS) {
    if (!categories.has(group.categoryId)) continue;
    const existing = db
      .prepare("SELECT category_id FROM genre_groups WHERE id=?")
      .get(group.id);
    if (existing && existing["category_id"] !== group.categoryId)
      throw new Error(
        "Genre ID belongs to another category; classification upgrade rolled back.",
      );
    db.prepare(
      `INSERT INTO genre_groups VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,description=excluded.description,position=excluded.position`,
    ).run(
      group.id,
      group.categoryId,
      group.name,
      group.description,
      group.order,
    );
  }
  for (const style of STYLES) {
    if (!categories.has(style.categoryId)) continue;
    const existing = db
      .prepare("SELECT category_id FROM styles WHERE id=?")
      .get(style.id);
    if (existing) {
      if (existing["category_id"] !== style.categoryId)
        throw new Error(
          "Style ID belongs to another category; classification upgrade rolled back.",
        );
      // Keep descriptions, publication state, IDs, image references, and every session row.
      db.prepare(
        "UPDATE styles SET genre_group_id=?,name=?,position=? WHERE id=?",
      ).run(style.genreGroupId, style.name, style.order, style.id);
    } else {
      const next = Number(
        db
          .prepare(
            "SELECT coalesce(max(exploration_order),0)+10 AS next FROM styles WHERE category_id=?",
          )
          .get(style.categoryId)!["next"],
      );
      db.prepare("INSERT INTO styles VALUES(?,?,?,?,?,?,?,?)").run(
        style.id,
        style.categoryId,
        style.genreGroupId,
        style.name,
        style.description,
        style.order,
        "draft",
        next,
      );
    }
  }
  db.prepare("UPDATE catalog_state SET version=version+1 WHERE id=1").run();
}
