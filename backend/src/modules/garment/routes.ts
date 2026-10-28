import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import {
  openSync,
  closeSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { z, ZodError } from "zod";
import type { OnboardingService } from "../onboarding/service.ts";
import type { AuthGuard } from "../auth/routes.ts";
import { DomainError } from "../onboarding/domain.ts";
import { garmentFiles } from "./files.ts";
import type { WardrobeStore } from "../wardrobe/store.ts";
import {
  GARMENT_TYPES,
  VOCABULARY_VERSION,
  keepCommonValues,
  parseAttributeValues,
  type AttributeValues,
} from "./attributes.ts";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);
const metadataSchema = z
  .object({
    garmentType: z.enum(GARMENT_TYPES),
    brand: optionalText(100),
    productName: optionalText(200),
    purchaseUrl: optionalText(2048).refine((value) => {
      if (!value) return true;
      try {
        const u = new URL(value);
        return (
          ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
        );
      } catch {
        return false;
      }
    }, "인증정보 없는 http/https 주소가 필요해요."),
    // WARD-001: which wardrobe item this save is for. A new id registers a new garment; sending
    // the same id again (a retry) updates that item instead of adding a duplicate.
    itemId: z.uuid().optional(),
  })
  .strict();
const invalid = (field: string) =>
  new ZodError([
    { code: "custom", path: [field], message: "입력 내용을 확인해 주세요." },
  ]);
const attributesBody = z
  .object({
    garmentType: z.enum(GARMENT_TYPES),
    values: z.record(z.string(), z.unknown()),
    rawText: optionalText(200),
  })
  .strict();
const referenceBody = z.object({ itemId: z.uuid() }).strict();
export const notFound = () =>
  new DomainError(404, "GARMENT_NOT_FOUND", "옷장에서 그 옷을 찾을 수 없어요.");

async function normalizeImage(image: Buffer) {
  const jpeg = image[0] === 255 && image[1] === 216;
  const png = image
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp =
    image.toString("ascii", 0, 4) === "RIFF" &&
    image.toString("ascii", 8, 12) === "WEBP";
  if (!jpeg && !png && !webp)
    throw new DomainError(
      415,
      "UNSUPPORTED_IMAGE_FORMAT",
      "JPEG, PNG, WebP 사진을 사용해 주세요.",
    );
  try {
    const meta = await sharp(image, {
      limitInputPixels: false,
    }).metadata();
    if ((meta.width ?? 0) * (meta.height ?? 0) > 40_000_000)
      throw new DomainError(
        413,
        "IMAGE_PIXEL_LIMIT",
        "사진은 40메가픽셀 이하여야 해요.",
      );
    if ((meta.pages ?? 1) > 1)
      throw new DomainError(
        415,
        "UNSUPPORTED_IMAGE_FORMAT",
        "정지 사진 한 장만 지원해요.",
      );
    return await sharp(image, {
      limitInputPixels: 40_000_000,
      failOn: "warning",
    })
      .rotate()
      .png()
      .toBuffer({ resolveWithObject: true });
  } catch (e) {
    if (e instanceof DomainError) throw e;
    throw new DomainError(400, "INVALID_IMAGE", "사진을 디코딩할 수 없어요.");
  }
}

/**
 * The reference garment of the account's onboarding progress (AUTH-002), now one item of the
 * account's wardrobe (WARD-001). These paths keep their earlier request and response shapes.
 */
export function registerGarmentRoutes(
  app: FastifyInstance,
  store: WardrobeStore,
  service: OnboardingService,
  guard: AuthGuard,
) {
  const { db, root } = store;
  const files = garmentFiles(root);
  const url = "/api/onboarding/session/garment";
  const user = (r: FastifyRequest, reply: FastifyReply) =>
    guard(r, reply).userId;
  const reference = (owner: string) => {
    const id = service.sessionIdForUser(owner);
    return id ? store.reference(owner, id) : undefined;
  };
  const view = (owner: string) => {
    const row = reference(owner);
    return row ? store.view(row, url + "/image") : null;
  };
  // Multipart support is scoped to these routes; existing JSON limits remain 16 KiB.
  app.register(async (scoped) => {
    await scoped.register(multipart, {
      limits: {
        fileSize: 10 * 1024 * 1024,
        files: 2,
        fields: 2,
        parts: 4,
        fieldSize: 16 * 1024,
      },
    });
    scoped.addHook("onRequest", async (r, reply) => {
      guard(r, reply);
    });
    scoped.get(url, (r, reply) => ({ garment: view(user(r, reply)) }));
    scoped.get(url + "/image", (r, reply) => {
      z.object({ v: z.string().optional() }).strict().parse(r.query);
      const row = reference(user(r, reply));
      if (!row)
        throw new DomainError(404, "IMAGE_UNAVAILABLE", "사진이 없어요.");
      return reply.type("image/png").send(readFileSync(store.imagePath(row)));
    });
    scoped.put(url, async (r, reply) => {
      let metadata: unknown;
      let image: Buffer | undefined;
      let seen = false;
      if (!r.isMultipart()) throw invalid("metadata");
      for await (const part of r.parts()) {
        if (part.type === "file") {
          if (image || part.fieldname !== "image")
            throw new DomainError(
              400,
              "MULTIPLE_IMAGES",
              "사진 한 장만 등록해 주세요.",
            );
          image = await part.toBuffer();
          if (part.file.truncated)
            throw new DomainError(
              413,
              "PAYLOAD_TOO_LARGE",
              "사진은 10 MiB 이하여야 해요.",
            );
        } else {
          if (seen || part.fieldname !== "metadata" || part.valueTruncated)
            throw invalid("metadata");
          seen = true;
          try {
            metadata = JSON.parse(String(part.value));
          } catch {
            throw invalid("metadata");
          }
        }
      }
      if (!seen) throw invalid("metadata");
      const data = metadataSchema.parse(metadata);
      const normalized = image ? await normalizeImage(image) : undefined;
      // No await below: DB and file updates are serialized on this server process.
      const owner = user(r, reply);
      // An explicit id names the item; without one (earlier clients) it is the current reference.
      const old = data.itemId
        ? store.item(owner, data.itemId)
        : reference(owner);
      // Another account's id is never looked up here: it reads like an unknown id, and the
      // upsert below refuses to touch it.
      if (!old && !normalized) throw invalid("image");
      // A first photo starts the account's onboarding progress if none exists yet.
      const sessionId =
        service.sessionIdForUser(owner) ??
        service.ensureForUser(owner).session.id;
      const id = old?.id ?? data.itemId ?? randomUUID();
      const now = new Date(
        Math.max(
          service.now().getTime(),
          old ? Date.parse(old.updatedAt) + 1 : 0,
        ),
      ).toISOString();
      const filename = normalized ? randomUUID() + ".png" : old!.filename;
      store.transaction((undo) => {
        if (normalized) {
          const file = path.join(root, filename);
          mkdirSync(root, { recursive: true, mode: 0o700 });
          const fd = openSync(file, "wx", 0o600);
          undo(() => unlinkSync(file));
          try {
            writeFileSync(fd, normalized.data);
          } finally {
            closeSync(fd);
          }
        }
        // The WHERE keeps another account's item untouched; no row changed means it was not ours.
        const saved = db
          .prepare(
            `INSERT INTO wardrobe_items VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET garment_type=excluded.garment_type,brand=excluded.brand,product_name=excluded.product_name,purchase_url=excluded.purchase_url,filename=excluded.filename,width=excluded.width,height=excluded.height,updated_at=excluded.updated_at WHERE user_id=excluded.user_id`,
          )
          .run(
            id,
            owner,
            data.garmentType,
            data.brand,
            data.productName,
            data.purchaseUrl,
            filename,
            normalized?.info.width ?? old!.width,
            normalized?.info.height ?? old!.height,
            old?.createdAt ?? now,
            now,
          );
        if (saved.changes === 0) throw notFound();
        // A new garment type keeps only the attributes every type shares (color, material look,
        // the user's own words) so axes of the old type never mix into the new one.
        const confirmed = old && store.attributes(id);
        if (confirmed && old.garmentType !== data.garmentType)
          db.prepare(
            "UPDATE wardrobe_item_attributes SET values_json=? WHERE item_id=?",
          ).run(
            JSON.stringify(keepCommonValues(JSON.parse(confirmed.valuesJson))),
            id,
          );
        store.setReference(sessionId, id);
        if (normalized && old) undo(files.remove(old.filename));
      });
      return { garment: view(owner) };
    });
    // Saves the attributes the user confirmed for the current photo and garment type.
    scoped.put(url + "/attributes", (r, reply) => {
      const body = attributesBody.parse(r.body);
      const owner = user(r, reply);
      const row = reference(owner);
      if (!row)
        throw new DomainError(
          404,
          "GARMENT_NOT_FOUND",
          "먼저 옷 사진을 등록해 주세요.",
        );
      if (body.garmentType !== row.garmentType)
        throw new DomainError(
          409,
          "GARMENT_TYPE_CHANGED",
          "옷 종류가 바뀌었어요. 화면을 새로 고친 뒤 다시 저장해 주세요.",
        );
      let values: AttributeValues;
      try {
        values = parseAttributeValues(row.garmentType, body.values);
      } catch (error) {
        if (error instanceof ZodError)
          throw new ZodError(
            error.issues.map((issue) => ({
              ...issue,
              path: ["values", ...issue.path],
            })),
          );
        throw error;
      }
      db.prepare(
        `INSERT INTO wardrobe_item_attributes VALUES(?,?,?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET garment_type=excluded.garment_type,vocabulary_version=excluded.vocabulary_version,values_json=excluded.values_json,raw_text=excluded.raw_text,confirmed_image=excluded.confirmed_image,updated_at=excluded.updated_at`,
      ).run(
        row.id,
        row.garmentType,
        VOCABULARY_VERSION,
        JSON.stringify(values),
        body.rawText,
        row.filename,
        service.now().toISOString(),
      );
      return { garment: store.view(row, url + "/image") };
    });
    // Makes one of the account's wardrobe items the reference garment of its progress.
    scoped.put(url + "/reference", (r, reply) => {
      const { itemId } = referenceBody.parse(r.body);
      const owner = user(r, reply);
      if (!store.item(owner, itemId)) throw notFound();
      const sessionId =
        service.sessionIdForUser(owner) ??
        service.ensureForUser(owner).session.id;
      store.setReference(sessionId, itemId);
      return { garment: view(owner) };
    });
    // Deletes the current reference garment from the wardrobe (photo included).
    scoped.delete(url, (r, reply) => {
      const owner = user(r, reply);
      const row = reference(owner);
      if (row) store.remove(owner, row.id);
      return reply.code(204).send();
    });
  });
}
