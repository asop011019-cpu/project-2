import { loadConfig } from "../config.ts";
import { openDatabase } from "../db/connection.ts";
const db = openDatabase(loadConfig().databasePath);
try {
  console.log(
    JSON.stringify({
      schemaVersion: db.prepare("PRAGMA user_version").get()!["user_version"],
    }),
  );
} finally {
  db.close();
}
