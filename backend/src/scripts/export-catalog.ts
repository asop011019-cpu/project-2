import { writeFile } from "node:fs/promises";
import { loadConfig } from "../config.ts";
import { openDatabase } from "../db/connection.ts";
import { seedCatalog } from "../modules/onboarding/catalog-management.ts";
import { SqliteOnboardingRepository } from "../modules/onboarding/repository.ts";
const filename = process.argv[2];
if (!filename)
  throw new Error(
    "Usage: npm run catalog:export -- /path/to/new-manifest.json",
  );
const db = openDatabase(loadConfig().databasePath);
try {
  seedCatalog(db);
  const { version, ...data } = new SqliteOnboardingRepository(db).catalog();
  await writeFile(filename, JSON.stringify(data, null, 2) + "\n", {
    flag: "wx",
  });
  console.log(
    JSON.stringify({ exported: true, catalogVersion: version, filename }),
  );
} finally {
  db.close();
}
