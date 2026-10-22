import type { DatabaseSync } from "node:sqlite";
import { migrateGenreClassification } from "./genre-classification-migration.ts";

const migrations: (string | ((db: DatabaseSync) => void))[] = [
  `CREATE TABLE catalog_state (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL CHECK(version>=0)) STRICT;
   INSERT INTO catalog_state VALUES(1,0);
   CREATE TABLE clothing_categories (
     id TEXT PRIMARY KEY CHECK(id IN ('menswear','womenswear')), name TEXT NOT NULL, position INTEGER NOT NULL
   ) STRICT;
   CREATE TABLE genre_groups (
     id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES clothing_categories(id),
     name TEXT NOT NULL, description TEXT NOT NULL, position INTEGER NOT NULL,
     UNIQUE(id,category_id)
   ) STRICT;
   CREATE TABLE styles (
     id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES clothing_categories(id), genre_group_id TEXT NOT NULL,
     name TEXT NOT NULL, description TEXT NOT NULL, position INTEGER NOT NULL,
     publication_status TEXT NOT NULL CHECK(publication_status IN ('draft','published')),
     UNIQUE(id,category_id), FOREIGN KEY(genre_group_id,category_id) REFERENCES genre_groups(id,category_id)
   ) STRICT;
   CREATE TABLE style_images (
     id TEXT PRIMARY KEY, style_id TEXT NOT NULL, category_id TEXT NOT NULL,
     original_ref TEXT NOT NULL UNIQUE, thumbnail_ref TEXT NOT NULL, alt TEXT NOT NULL,
     width INTEGER NOT NULL CHECK(width>0), height INTEGER NOT NULL CHECK(height>0),
     format TEXT NOT NULL CHECK(format IN ('model_outfit','flat_lay','collage')),
     is_generated INTEGER NOT NULL CHECK(is_generated IN (0,1)), position INTEGER NOT NULL,
     source_url TEXT, creator TEXT,
     usage_status TEXT NOT NULL CHECK(usage_status IN ('pending','allowed','revoked')),
     publication_status TEXT NOT NULL CHECK(publication_status IN ('draft','published')),
     content_hash TEXT UNIQUE,
     CHECK(usage_status!='allowed' OR (creator IS NOT NULL AND length(trim(creator))>0)),
     UNIQUE(id,style_id,category_id), FOREIGN KEY(style_id,category_id) REFERENCES styles(id,category_id)
   ) STRICT;
   CREATE TABLE onboarding_sessions (
     id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
     selected_category_id TEXT REFERENCES clothing_categories(id),
     started_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT NOT NULL
   ) STRICT;
   CREATE TABLE category_sessions (
     session_id TEXT NOT NULL REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
     category_id TEXT NOT NULL REFERENCES clothing_categories(id), catalog_version INTEGER NOT NULL,
     current_style_id TEXT, status TEXT NOT NULL CHECK(status IN ('in_progress','completed')),
     started_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT,
     PRIMARY KEY(session_id,category_id),
     CHECK((status='completed' AND completed_at IS NOT NULL) OR (status='in_progress' AND completed_at IS NULL)),
     FOREIGN KEY(current_style_id,category_id) REFERENCES styles(id,category_id)
   ) STRICT;
   CREATE TABLE session_styles (
     session_id TEXT NOT NULL, category_id TEXT NOT NULL, style_id TEXT NOT NULL,
     position INTEGER NOT NULL, withdrawn_at TEXT,
     PRIMARY KEY(session_id,category_id,style_id), UNIQUE(session_id,category_id,position),
     FOREIGN KEY(session_id,category_id) REFERENCES category_sessions(session_id,category_id) ON DELETE CASCADE,
     FOREIGN KEY(style_id,category_id) REFERENCES styles(id,category_id)
   ) STRICT;
   CREATE TABLE style_responses (
     session_id TEXT NOT NULL, category_id TEXT NOT NULL, style_id TEXT NOT NULL,
     response TEXT NOT NULL CHECK(response IN ('liked','disliked','skipped')), updated_at TEXT NOT NULL,
     PRIMARY KEY(session_id,category_id,style_id),
     FOREIGN KEY(session_id,category_id) REFERENCES category_sessions(session_id,category_id) ON DELETE CASCADE,
     FOREIGN KEY(style_id,category_id) REFERENCES styles(id,category_id)
   ) STRICT;
   CREATE TABLE image_preferences (
     session_id TEXT NOT NULL, category_id TEXT NOT NULL, style_id TEXT NOT NULL, image_id TEXT NOT NULL,
     selected INTEGER NOT NULL CHECK(selected IN (0,1)), updated_at TEXT NOT NULL,
     PRIMARY KEY(session_id,category_id,image_id),
     FOREIGN KEY(session_id,category_id) REFERENCES category_sessions(session_id,category_id) ON DELETE CASCADE,
     FOREIGN KEY(image_id,style_id,category_id) REFERENCES style_images(id,style_id,category_id)
   ) STRICT;
   CREATE INDEX sessions_expiry_idx ON onboarding_sessions(expires_at);
   CREATE INDEX style_images_style_idx ON style_images(style_id,position);`,
  migrateGenreClassification,
];

export function migrate(db: DatabaseSync): void {
  const current = Number(
    db.prepare("PRAGMA user_version").get()!["user_version"],
  );
  if (current > migrations.length)
    throw new Error(
      "Database version is newer than this backend; refusing to overwrite it.",
    );
  for (let index = current; index < migrations.length; index++) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const migration = migrations[index]!;
      if (typeof migration === "string") db.exec(migration);
      else migration(db);
      db.exec(`PRAGMA user_version = ${index + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
