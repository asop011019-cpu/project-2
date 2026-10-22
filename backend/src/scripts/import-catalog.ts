import { readFile } from "node:fs/promises";
import { loadConfig } from "../config.ts";
import { openDatabase } from "../db/connection.ts";
import {
  catalogImportSchema,
  importCatalog,
  verifyLocalAssets,
  seedCatalog,
} from "../modules/onboarding/catalog-management.ts";
import { SqliteOnboardingRepository } from "../modules/onboarding/repository.ts";
import { explorableStyles } from "../modules/onboarding/domain.ts";
const filename = process.argv[2];
if (!filename)
  throw new Error("Usage: npm run catalog:import -- /path/to/catalog.json");
const config = loadConfig();
const data = await verifyLocalAssets(
  catalogImportSchema.parse(JSON.parse(await readFile(filename, "utf8"))),
  config.assetRoot,
);
const db = openDatabase(config.databasePath);
try {
  seedCatalog(db);
  importCatalog(db, data);
  const catalog = new SqliteOnboardingRepository(db).catalog();
  console.log(
    JSON.stringify({
      catalogVersion: catalog.version,
      registeredStyles: catalog.styles.length,
      explorableStyles: explorableStyles(catalog).length,
      images: catalog.images.length,
    }),
  );
} finally {
  db.close();
}
