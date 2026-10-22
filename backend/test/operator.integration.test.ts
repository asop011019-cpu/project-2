import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { context, publish } from "./helpers.ts";
import { openDatabase } from "../src/db/connection.ts";
import { SqliteOnboardingRepository } from "../src/modules/onboarding/repository.ts";

test("real migration, seed, export and import CLIs preserve content and reject export overwrite", async (t) => {
  const c = await context();
  t.after(c.cleanup);
  await publish(c, ["men_casual"]);
  const before = c.repository.catalog();
  await c.app.close();
  const run = (script: string, args: string[] = []) =>
    execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL(`../src/scripts/${script}.js`, import.meta.url)),
        ...args,
      ],
      {
        env: {
          ...process.env,
          DATABASE_PATH: c.config.databasePath,
          ASSET_ROOT: c.config.assetRoot,
        },
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
      },
    );
  assert.match(run("migrate"), /schemaVersion/);
  assert.match(run("seed"), /"styles":24/);
  const filename = path.join(c.directory, "manifest.json");
  run("export-catalog", [filename]);
  const manifest = JSON.parse(await readFile(filename, "utf8"));
  assert.equal(manifest.styles.length, 24);
  assert.equal(manifest.images.length, 4);
  assert.equal(manifest.tokenHash, undefined);
  assert.throws(() => run("export-catalog", [filename]));
  assert.match(run("import-catalog", [filename]), /"explorableStyles":1/);
  const db = openDatabase(c.config.databasePath);
  try {
    assert.deepEqual(new SqliteOnboardingRepository(db).catalog(), before);
  } finally {
    db.close();
  }
});
