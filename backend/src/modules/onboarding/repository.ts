import type { DatabaseSync } from "node:sqlite";
import type { OnboardingRepository } from "./ports.ts";
import type {
  CatalogSnapshot,
  ClothingCategoryId,
  SessionRecord,
  CategorySession,
  SnapshotStyle,
  StyleResponse,
  ImagePreference,
  PhotoExploration,
} from "./types.ts";

export class SqliteOnboardingRepository implements OnboardingRepository {
  readonly db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
  }
  transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  catalog(): CatalogSnapshot {
    return {
      version: Number(
        this.db.prepare("SELECT version FROM catalog_state WHERE id=1").get()![
          "version"
        ],
      ),
      categories: this.db
        .prepare(
          'SELECT id,name,position AS "order" FROM clothing_categories ORDER BY position,id',
        )
        .all() as unknown as CatalogSnapshot["categories"],
      genreGroups: this.db
        .prepare(
          'SELECT id,category_id AS categoryId,name,description,position AS "order" FROM genre_groups ORDER BY position,id',
        )
        .all() as unknown as CatalogSnapshot["genreGroups"],
      styles: this.db
        .prepare(
          'SELECT id,category_id AS categoryId,genre_group_id AS genreGroupId,name,description,position AS "order",publication_status AS publicationStatus,exploration_order AS explorationOrder FROM styles ORDER BY exploration_order,id',
        )
        .all() as unknown as CatalogSnapshot["styles"],
      images: this.db
        .prepare(
          `SELECT id,style_id AS styleId,category_id AS categoryId,original_ref AS originalRef,
        thumbnail_ref AS thumbnailRef,alt,width,height,format,is_generated AS isGenerated,position AS "order",
        source_url AS sourceUrl,creator,usage_status AS usageStatus,publication_status AS publicationStatus,content_hash AS contentHash
        FROM style_images ORDER BY position,id`,
        )
        .all()
        .map((row) => ({
          ...row,
          isGenerated: Boolean(row["isGenerated"]),
        })) as unknown as CatalogSnapshot["images"],
    };
  }
  findSession(tokenHash: string): SessionRecord | undefined {
    return this.db
      .prepare(
        `SELECT id,token_hash AS tokenHash,selected_category_id AS selectedCategoryId,
      started_at AS startedAt,updated_at AS updatedAt,expires_at AS expiresAt FROM onboarding_sessions WHERE token_hash=?`,
      )
      .get(tokenHash) as unknown as SessionRecord | undefined;
  }
  insertSession(s: SessionRecord): void {
    this.db
      .prepare("INSERT INTO onboarding_sessions VALUES(?,?,?,?,?,?)")
      .run(
        s.id,
        s.tokenHash,
        s.selectedCategoryId,
        s.startedAt,
        s.updatedAt,
        s.expiresAt,
      );
  }
  deleteSession(id: string): void {
    this.db.prepare("DELETE FROM onboarding_sessions WHERE id=?").run(id);
  }
  selectCategory(id: string, category: ClothingCategoryId, now: string): void {
    this.db
      .prepare(
        "UPDATE onboarding_sessions SET selected_category_id=?,updated_at=? WHERE id=?",
      )
      .run(category, now, id);
  }
  touchSession(id: string, now: string): void {
    this.db
      .prepare("UPDATE onboarding_sessions SET updated_at=? WHERE id=?")
      .run(now, id);
  }
  categorySession(
    id: string,
    category: ClothingCategoryId,
  ): CategorySession | undefined {
    return this.db
      .prepare(
        `SELECT session_id AS sessionId,category_id AS categoryId,catalog_version AS catalogVersion,
      current_style_id AS currentStyleId,status,started_at AS startedAt,updated_at AS updatedAt,completed_at AS completedAt
      FROM category_sessions WHERE session_id=? AND category_id=?`,
      )
      .get(id, category) as unknown as CategorySession | undefined;
  }
  insertCategory(c: CategorySession): void {
    this.db
      .prepare("INSERT INTO category_sessions VALUES(?,?,?,?,?,?,?,?)")
      .run(
        c.sessionId,
        c.categoryId,
        c.catalogVersion,
        c.currentStyleId,
        c.status,
        c.startedAt,
        c.updatedAt,
        c.completedAt,
      );
  }
  updateCategory(c: CategorySession): void {
    this.db
      .prepare(
        `UPDATE category_sessions SET catalog_version=?,current_style_id=?,status=?,updated_at=?,completed_at=?
      WHERE session_id=? AND category_id=?`,
      )
      .run(
        c.catalogVersion,
        c.currentStyleId,
        c.status,
        c.updatedAt,
        c.completedAt,
        c.sessionId,
        c.categoryId,
      );
  }
  snapshot(id: string, category: ClothingCategoryId): SnapshotStyle[] {
    return this.db
      .prepare(
        `SELECT style_id AS styleId,position,withdrawn_at AS withdrawnAt FROM session_styles
      WHERE session_id=? AND category_id=? ORDER BY position`,
      )
      .all(id, category) as unknown as SnapshotStyle[];
  }
  replaceSnapshot(
    id: string,
    category: ClothingCategoryId,
    styles: readonly string[],
  ): void {
    this.db
      .prepare(
        "DELETE FROM session_styles WHERE session_id=? AND category_id=?",
      )
      .run(id, category);
    const insert = this.db.prepare(
      "INSERT INTO session_styles VALUES(?,?,?,?,NULL)",
    );
    styles.forEach((styleId, index) =>
      insert.run(id, category, styleId, index),
    );
  }
  withdraw(
    id: string,
    category: ClothingCategoryId,
    styleIds: readonly string[],
    now: string,
  ): void {
    const statement = this.db.prepare(
      "UPDATE session_styles SET withdrawn_at=? WHERE session_id=? AND category_id=? AND style_id=? AND withdrawn_at IS NULL",
    );
    for (const styleId of styleIds) statement.run(now, id, category, styleId);
  }
  responses(id: string, category: ClothingCategoryId): StyleResponse[] {
    return this.db
      .prepare(
        `SELECT session_id AS sessionId,category_id AS categoryId,style_id AS styleId,response,updated_at AS updatedAt
      FROM style_responses WHERE session_id=? AND category_id=?`,
      )
      .all(id, category) as unknown as StyleResponse[];
  }
  saveResponse(r: StyleResponse): void {
    this.db
      .prepare(
        `INSERT INTO style_responses VALUES(?,?,?,?,?) ON CONFLICT(session_id,category_id,style_id)
      DO UPDATE SET response=excluded.response,updated_at=excluded.updated_at`,
      )
      .run(r.sessionId, r.categoryId, r.styleId, r.response, r.updatedAt);
  }
  preferences(id: string, category: ClothingCategoryId): ImagePreference[] {
    return this.db
      .prepare(
        `SELECT session_id AS sessionId,category_id AS categoryId,style_id AS styleId,image_id AS imageId,
      selected,updated_at AS updatedAt FROM image_preferences WHERE session_id=? AND category_id=?`,
      )
      .all(id, category)
      .map((row) => ({
        ...row,
        selected: Boolean(row["selected"]),
      })) as unknown as ImagePreference[];
  }
  savePreference(p: ImagePreference): void {
    this.db
      .prepare(
        `INSERT INTO image_preferences VALUES(?,?,?,?,?,?) ON CONFLICT(session_id,category_id,image_id)
      DO UPDATE SET selected=excluded.selected,updated_at=excluded.updated_at`,
      )
      .run(
        p.sessionId,
        p.categoryId,
        p.styleId,
        p.imageId,
        Number(p.selected),
        p.updatedAt,
      );
  }
  photoExploration(
    id: string,
    category: ClothingCategoryId,
  ): PhotoExploration | undefined {
    const row = this.db
      .prepare(
        "SELECT current_genre_group_id AS currentGenreGroupId FROM photo_explorations WHERE session_id=? AND category_id=?",
      )
      .get(id, category);
    if (!row) return undefined;
    return {
      currentGenreGroupId: row["currentGenreGroupId"] as string | null,
      genres: this.db
        .prepare(
          "SELECT genre_group_id AS genreGroupId,position,status,updated_at AS updatedAt FROM session_genres WHERE session_id=? AND category_id=? ORDER BY position",
        )
        .all(id, category) as unknown as PhotoExploration["genres"],
    };
  }
  savePhotoExploration(
    id: string,
    category: ClothingCategoryId,
    value: PhotoExploration,
  ): void {
    this.db
      .prepare(
        `INSERT INTO photo_explorations VALUES(?,?,?) ON CONFLICT(session_id,category_id)
       DO UPDATE SET current_genre_group_id=excluded.current_genre_group_id`,
      )
      .run(id, category, value.currentGenreGroupId);
    this.db
      .prepare(
        "DELETE FROM session_genres WHERE session_id=? AND category_id=?",
      )
      .run(id, category);
    const insert = this.db.prepare(
      "INSERT INTO session_genres VALUES(?,?,?,?,?,?)",
    );
    for (const visit of value.genres)
      insert.run(
        id,
        category,
        visit.genreGroupId,
        visit.position,
        visit.status,
        visit.updatedAt,
      );
  }
}
