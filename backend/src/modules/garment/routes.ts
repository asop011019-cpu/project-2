import { garmentFiles } from "./files.ts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import {
  openSync,
  closeSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { z, ZodError } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type { AppConfig } from "../../config.ts";
import type { OnboardingService } from "../onboarding/service.ts";
import { DomainError } from "../onboarding/domain.ts";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);
const metadataSchema = z
  .object({
    garmentType: z.enum(["pants", "skirt"]),
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
  })
  .strict();
const invalid = (field: string) =>
  new ZodError([
    { code: "custom", path: [field], message: "입력 내용을 확인해 주세요." },
  ]);
type Row = {
  id: string;
  garmentType: "pants" | "skirt";
  brand: string | null;
  productName: string | null;
  purchaseUrl: string | null;
  filename: string;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
};
export function registerGarmentRoutes(
  app: FastifyInstance,
  db: DatabaseSync,
  service: OnboardingService,
  config: AppConfig,
) {
  const root =
    config.garmentRoot ??
    path.join(path.dirname(config.databasePath), "garments");
  const files = garmentFiles(root);
  const get = (id: string) =>
    db
      .prepare(
        `SELECT id,garment_type AS garmentType,brand,product_name AS productName,purchase_url AS purchaseUrl,filename,width,height,created_at AS createdAt,updated_at AS updatedAt FROM garments WHERE session_id=?`,
      )
      .get(id) as Row | undefined;
  const token = (r: FastifyRequest) =>
    r.cookies[config.secureCookies ? "__Host-onboarding" : "onboarding_dev"];
  const session = (r: FastifyRequest) => service.authenticated(token(r)).id;
  const view = (row: Row | undefined) =>
    row
      ? (({ filename: _, ...data }) => ({
          ...data,
          imageUrl: "/api/onboarding/session/garment/image",
        }))(row)
      : null;
  const url = "/api/onboarding/session/garment";
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
    scoped.addHook("onRequest", async (r) => {
      session(r);
    });
    scoped.get(url, (r) => ({ garment: view(get(session(r))) }));
    scoped.get(url + "/image", (r, reply) => {
      z.object({ v: z.string().optional() }).strict().parse(r.query);
      const row = get(session(r));
      if (!row)
        throw new DomainError(404, "IMAGE_UNAVAILABLE", "사진이 없어요.");
      return reply
        .type("image/png")
        .send(readFileSync(path.join(root, row.filename)));
    });
    scoped.put(url, async (r) => {
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
      let normalized:
        { data: Buffer; info: { width: number; height: number } } | undefined;
      if (image) {
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
          normalized = await sharp(image, {
            limitInputPixels: 40_000_000,
            failOn: "warning",
          })
            .rotate()
            .png()
            .toBuffer({ resolveWithObject: true });
        } catch (e) {
          if (e instanceof DomainError) throw e;
          throw new DomainError(
            400,
            "INVALID_IMAGE",
            "사진을 디코딩할 수 없어요.",
          );
        }
      }
      // No await below: DB and file updates are serialized on this server process.
      const id = session(r),
        old = get(id);
      if (!old && !normalized) throw invalid("image");
      const now = new Date(
        Math.max(
          service.now().getTime(),
          old ? Date.parse(old.updatedAt) + 1 : 0,
        ),
      ).toISOString();
      const filename = normalized ? randomUUID() + ".png" : old!.filename;
      let written = false;
      let restore: (() => void) | undefined;
      db.exec("BEGIN IMMEDIATE");
      try {
        if (normalized) {
          mkdirSync(root, { recursive: true, mode: 0o700 });
          const fd = openSync(path.join(root, filename), "wx", 0o600);
          written = true;
          try {
            writeFileSync(fd, normalized.data);
          } finally {
            closeSync(fd);
          }
        }
        db.prepare(
          `INSERT INTO garments VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET garment_type=excluded.garment_type,brand=excluded.brand,product_name=excluded.product_name,purchase_url=excluded.purchase_url,filename=excluded.filename,width=excluded.width,height=excluded.height,updated_at=excluded.updated_at`,
        ).run(
          id,
          old?.id ?? randomUUID(),
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
        if (normalized && old) restore = files.remove(old.filename);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        if (restore) restore();
        if (written) unlinkSync(path.join(root, filename));
        throw e;
      }
      return { garment: view(get(id)) };
    });
    scoped.delete(url, (r, reply) => {
      const id = session(r),
        old = get(id);
      let restore: (() => void) | undefined;
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("DELETE FROM garments WHERE session_id=?").run(id);
        if (old) restore = files.remove(old.filename);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        restore?.();
        throw e;
      }
      return reply.code(204).send();
    });
  });
}
