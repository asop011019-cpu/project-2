import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { SqliteOnboardingRepository } from "./repository.ts";
import { CLOTHING_CATEGORIES, GENRE_GROUPS, STYLES } from "./data/catalog.ts";
import { idSchema, categoryIdSchema } from "./validation.ts";
import type { StyleImage } from "./types.ts";

const order = z.number().int().min(0).max(1_000_000);
const label = z.string().trim().min(1).max(200);
const publication = z.enum(["draft", "published"]);
export const imageReferenceSchema = z
  .string()
  .max(2000)
  .refine((value) => {
    if (/^\/media\/[a-zA-Z0-9_./-]+\.(png|jpe?g|webp|avif)$/.test(value))
      return value.split("/").every((part) => part !== "." && part !== "..");
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use an existing /media/ file reference or an HTTPS image URL.");
const imageSchema = z
  .object({
    id: idSchema,
    styleId: idSchema,
    categoryId: categoryIdSchema,
    originalRef: imageReferenceSchema,
    thumbnailRef: imageReferenceSchema,
    alt: z.string().trim().min(1).max(800),
    width: z.number().int().positive().max(30000),
    height: z.number().int().positive().max(30000),
    format: z.enum(["model_outfit", "flat_lay", "collage"]),
    isGenerated: z.boolean(),
    order,
    sourceUrl: z
      .string()
      .url()
      .refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
      .nullable(),
    creator: label.nullable(),
    usageStatus: z.enum(["pending", "allowed", "revoked"]),
    publicationStatus: publication,
    contentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable()
      .default(null),
  })
  .strict()
  .superRefine((image, context) => {
    if (image.usageStatus === "allowed" && !image.creator)
      context.addIssue({
        code: "custom",
        path: ["creator"],
        message: "Display approval requires an identified creator.",
      });
  });
export const catalogImportSchema = z
  .object({
    categories: z
      .array(z.object({ id: categoryIdSchema, name: label, order }).strict())
      .default([]),
    genreGroups: z
      .array(
        z
          .object({
            id: idSchema,
            categoryId: categoryIdSchema,
            name: label,
            description: z.string().max(1000),
            order,
          })
          .strict(),
      )
      .default([]),
    styles: z
      .array(
        z
          .object({
            id: idSchema,
            categoryId: categoryIdSchema,
            genreGroupId: idSchema,
            name: label,
            description: z.string().trim().min(1).max(1000),
            order,
            publicationStatus: publication,
            explorationOrder: order.optional(),
          })
          .strict(),
      )
      .default([]),
    images: z.array(imageSchema).max(2000).default([]),
  })
  .strict();
export type CatalogImport = z.infer<typeof catalogImportSchema>;

export function seedCatalog(db: DatabaseSync): void {
  const repository = new SqliteOnboardingRepository(db);
  repository.transaction(() => {
    let changed = 0;
    const category = db.prepare(
      "INSERT INTO clothing_categories VALUES(?,?,?) ON CONFLICT(id) DO NOTHING",
    );
    for (const c of CLOTHING_CATEGORIES)
      changed += Number(category.run(c.id, c.name, c.order).changes);
    const group = db.prepare(
      "INSERT INTO genre_groups VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
    );
    for (const g of GENRE_GROUPS)
      changed += Number(
        group.run(g.id, g.categoryId, g.name, g.description, g.order).changes,
      );
    const style = db.prepare(
      "INSERT INTO styles VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
    );
    for (const s of STYLES)
      changed += Number(
        style.run(
          s.id,
          s.categoryId,
          s.genreGroupId,
          s.name,
          s.description,
          s.order,
          s.publicationStatus,
          s.explorationOrder,
        ).changes,
      );
    if (changed)
      db.prepare("UPDATE catalog_state SET version=version+1 WHERE id=1").run();
  });
}
function sameFields(left: object | undefined, right: object): boolean {
  return (
    Boolean(left) &&
    Object.entries(right).every(
      ([key, value]) => Reflect.get(left!, key) === value,
    )
  );
}
/** Trusted operator entry point. It is deliberately not exposed as a public HTTP endpoint. */
export function importCatalog(db: DatabaseSync, input: unknown): void {
  const data = catalogImportSchema.parse(input);
  const repository = new SqliteOnboardingRepository(db);
  repository.transaction(() => {
    const old = repository.catalog();
    let changed = false;
    for (const c of data.categories) {
      if (
        sameFields(
          old.categories.find((row) => row.id === c.id),
          c,
        )
      )
        continue;
      db.prepare(
        "INSERT INTO clothing_categories VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,position=excluded.position",
      ).run(c.id, c.name, c.order);
      changed = true;
    }
    for (const g of data.genreGroups) {
      const previous = old.genreGroups.find((row) => row.id === g.id);
      if (previous && previous.categoryId !== g.categoryId)
        throw new Error("Genre category identity cannot change.");
      if (sameFields(previous, g)) continue;
      db.prepare(
        `INSERT INTO genre_groups VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE
        SET name=excluded.name,description=excluded.description,position=excluded.position`,
      ).run(g.id, g.categoryId, g.name, g.description, g.order);
      changed = true;
    }
    for (const s of data.styles) {
      const previous = old.styles.find((row) => row.id === s.id);
      if (previous && previous.categoryId !== s.categoryId)
        throw new Error("Style category identity cannot change.");
      const explorationOrder =
        s.explorationOrder ??
        previous?.explorationOrder ??
        Number(
          db
            .prepare(
              "SELECT coalesce(max(exploration_order),0)+10 AS next FROM styles WHERE category_id=?",
            )
            .get(s.categoryId)!["next"],
        );
      if (sameFields(previous, { ...s, explorationOrder })) continue;
      db.prepare(
        `INSERT INTO styles VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
        genre_group_id=excluded.genre_group_id,name=excluded.name,description=excluded.description,
        position=excluded.position,publication_status=excluded.publication_status,exploration_order=excluded.exploration_order`,
      ).run(
        s.id,
        s.categoryId,
        s.genreGroupId,
        s.name,
        s.description,
        s.order,
        s.publicationStatus,
        explorationOrder,
      );
      changed = true;
    }
    for (const image of data.images) {
      const previous = old.images.find((row) => row.id === image.id);
      if (
        previous &&
        (previous.originalRef !== image.originalRef ||
          previous.styleId !== image.styleId ||
          previous.categoryId !== image.categoryId ||
          (previous.contentHash && previous.contentHash !== image.contentHash))
      )
        throw new Error(
          "An image ID identifies immutable original content. Use a new ID and original filename when replacing it.",
        );
      if (sameFields(previous, image)) continue;
      db.prepare(
        `INSERT INTO style_images VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
        thumbnail_ref=excluded.thumbnail_ref,alt=excluded.alt,width=excluded.width,height=excluded.height,
        format=excluded.format,is_generated=excluded.is_generated,position=excluded.position,source_url=excluded.source_url,
        creator=excluded.creator,usage_status=excluded.usage_status,publication_status=excluded.publication_status,content_hash=excluded.content_hash`,
      ).run(
        image.id,
        image.styleId,
        image.categoryId,
        image.originalRef,
        image.thumbnailRef,
        image.alt,
        image.width,
        image.height,
        image.format,
        Number(image.isGenerated),
        image.order,
        image.sourceUrl,
        image.creator,
        image.usageStatus,
        image.publicationStatus,
        image.contentHash,
      );
      changed = true;
    }
    if (changed)
      db.prepare("UPDATE catalog_state SET version=version+1 WHERE id=1").run();
  });
}

export async function localAssetPath(
  reference: string,
  assetRoot: string,
): Promise<string> {
  if (
    !reference.startsWith("/media/") ||
    !imageReferenceSchema.safeParse(reference).success
  )
    throw new Error("Invalid local asset reference.");
  const root = await realpath(assetRoot);
  const filename = await realpath(
    path.join(root, reference.slice("/media/".length)),
  );
  const relative = path.relative(root, filename);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("Asset escapes ASSET_ROOT.");
  return filename;
}
export async function verifyLocalAssets(
  data: CatalogImport,
  assetRoot: string,
): Promise<CatalogImport> {
  const images: StyleImage[] = [];
  for (const image of data.images) {
    const next = { ...image };
    if (image.originalRef.startsWith("/media/")) {
      const bytes = await readFile(
        await localAssetPath(image.originalRef, assetRoot),
      );
      if (bytes.length > 20 * 1024 * 1024)
        throw new Error("An image exceeds the 20 MiB asset limit.");
      next.contentHash = createHash("sha256").update(bytes).digest("hex");
    }
    if (image.thumbnailRef.startsWith("/media/"))
      await localAssetPath(image.thumbnailRef, assetRoot);
    images.push(next);
  }
  return { ...data, images };
}
