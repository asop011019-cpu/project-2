import { loadConfig } from "../config.ts";
import { openDatabase } from "../db/connection.ts";
import { seedCatalog } from "../modules/onboarding/catalog-management.ts";
import { SqliteOnboardingRepository } from "../modules/onboarding/repository.ts";
const db = openDatabase(loadConfig().databasePath);
try {
  seedCatalog(db);
  const catalog = new SqliteOnboardingRepository(db).catalog();
  console.log(
    JSON.stringify({
      catalogVersion: catalog.version,
      categories: catalog.categories.length,
      genreGroups: catalog.genreGroups.length,
      styles: catalog.styles.length,
      images: catalog.images.length,
    }),
  );
} finally {
  db.close();
}
