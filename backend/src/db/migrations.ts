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
  `CREATE TABLE garments (session_id TEXT PRIMARY KEY REFERENCES onboarding_sessions(id) ON DELETE CASCADE, id TEXT NOT NULL, garment_type TEXT NOT NULL CHECK(garment_type IN ('pants','skirt')), brand TEXT, product_name TEXT, purchase_url TEXT, filename TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;`,
  // v4 (AUTH-002): accounts, login sessions and consents. Existing rows are untouched;
  // pre-existing anonymous onboarding sessions keep user_id NULL and are never attached to an account.
  `CREATE TABLE users (id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('active','deleting')), created_at TEXT NOT NULL, deleted_at TEXT) STRICT;
   CREATE TABLE user_identities (
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     provider TEXT NOT NULL CHECK(provider IN ('kakao','email')), provider_subject TEXT NOT NULL,
     password_hash TEXT, email_verified_at TEXT, created_at TEXT NOT NULL,
     UNIQUE(provider,provider_subject)
   ) STRICT;
   CREATE TABLE auth_sessions (
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
     previous_token_hash TEXT UNIQUE CHECK(previous_token_hash IS NULL OR length(previous_token_hash)=64),
     previous_valid_until TEXT, created_at TEXT NOT NULL, authenticated_at TEXT NOT NULL,
     renewed_at TEXT NOT NULL, idle_expires_at TEXT NOT NULL, absolute_expires_at TEXT NOT NULL,
     revoked_at TEXT, revoke_reason TEXT
   ) STRICT;
   CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);
   CREATE TABLE oauth_states (
     state_hash TEXT PRIMARY KEY CHECK(length(state_hash)=64), browser_hash TEXT NOT NULL CHECK(length(browser_hash)=64),
     provider TEXT NOT NULL CHECK(provider IN ('kakao')), return_to TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
   ) STRICT;
   CREATE TABLE pending_signups (
     token_hash TEXT PRIMARY KEY CHECK(length(token_hash)=64), provider TEXT NOT NULL CHECK(provider IN ('kakao')),
     provider_subject TEXT NOT NULL, return_to TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
   ) STRICT;
   CREATE TABLE consent_documents (
     key TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0), required INTEGER NOT NULL CHECK(required IN (0,1)),
     title TEXT NOT NULL, body TEXT NOT NULL, body_sha256 TEXT NOT NULL, effective_at TEXT NOT NULL,
     PRIMARY KEY(key,version)
   ) STRICT;
   CREATE TABLE user_consents (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, key TEXT NOT NULL, version INTEGER NOT NULL,
     granted INTEGER NOT NULL CHECK(granted IN (0,1)), decided_at TEXT NOT NULL,
     PRIMARY KEY(user_id,key), FOREIGN KEY(key,version) REFERENCES consent_documents(key,version)
   ) STRICT;
   CREATE TABLE consent_events (
     id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, key TEXT NOT NULL,
     version INTEGER NOT NULL, granted INTEGER NOT NULL CHECK(granted IN (0,1)), decided_at TEXT NOT NULL,
     FOREIGN KEY(key,version) REFERENCES consent_documents(key,version)
   ) STRICT;
   ALTER TABLE onboarding_sessions ADD COLUMN user_id TEXT REFERENCES users(id);
   CREATE UNIQUE INDEX onboarding_sessions_user_idx ON onboarding_sessions(user_id) WHERE user_id IS NOT NULL;`,
  // v5 (AUTH-004): account deletion jobs. A job keeps only what later steps need (the Kakao member
  // number for unlinking) and drops it once unlinked, so deletion can resume without a login.
  `CREATE TABLE account_deletions (
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT, provider_subject TEXT,
     stage TEXT NOT NULL CHECK(stage IN ('pending','data_deleted','done')),
     attempts INTEGER NOT NULL CHECK(attempts>=0), last_error TEXT,
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL
   ) STRICT;
   CREATE INDEX account_deletions_stage_idx ON account_deletions(stage);`,
];

/** Applies pending migrations; `target` (tests only) stops at an older schema version. */
export function migrate(
  db: DatabaseSync,
  target: number = migrations.length,
): void {
  const current = Number(
    db.prepare("PRAGMA user_version").get()!["user_version"],
  );
  if (current > migrations.length)
    throw new Error(
      "Database version is newer than this backend; refusing to overwrite it.",
    );
  for (
    let index = current;
    index < Math.min(target, migrations.length);
    index++
  ) {
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
