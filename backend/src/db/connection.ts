import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import { migrate } from "./migrations.ts";

export function openDatabase(filename: string): DatabaseSync {
  if (filename !== ":memory:")
    mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename, {
    enableForeignKeyConstraints: true,
    timeout: 3000,
  });
  try {
    db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;",
    );
    migrate(db);
    if (filename !== ":memory:") chmodSync(filename, 0o600);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
