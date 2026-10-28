import type { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { garmentFiles } from "../garment/files.ts";
import type { AttributeValues, GarmentType } from "../garment/attributes.ts";

export type ItemRow = {
  id: string;
  garmentType: GarmentType;
  brand: string | null;
  productName: string | null;
  purchaseUrl: string | null;
  filename: string;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
};
export type AttributesRow = {
  garmentType: GarmentType;
  vocabularyVersion: string;
  valuesJson: string;
  rawText: string | null;
  confirmedImage: string;
  updatedAt: string;
};
const COLUMNS =
  "i.id,i.garment_type AS garmentType,i.brand,i.product_name AS productName,i.purchase_url AS purchaseUrl,i.filename,i.width,i.height,i.created_at AS createdAt,i.updated_at AS updatedAt";

/**
 * WARD-001: the account's wardrobe and the reference garment each onboarding progress points at.
 * Every read takes the owner, so an item id alone never grants access.
 */
export class WardrobeStore {
  readonly db: DatabaseSync;
  readonly root: string;
  private readonly files: ReturnType<typeof garmentFiles>;
  constructor(db: DatabaseSync, root: string) {
    this.db = db;
    this.root = root;
    this.files = garmentFiles(root);
  }
  /** Runs `operation` in one transaction; `undo` callbacks it registers run if it fails. */
  transaction<T>(operation: (undo: (fn: () => void) => void) => T): T {
    const undos: (() => void)[] = [];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation((fn) => undos.push(fn));
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      for (const fn of undos.reverse()) fn();
      throw error;
    }
  }
  item(userId: string, id: string): ItemRow | undefined {
    return this.db
      .prepare(
        `SELECT ${COLUMNS} FROM wardrobe_items i WHERE i.id=? AND i.user_id=?`,
      )
      .get(id, userId) as ItemRow | undefined;
  }
  items(userId: string): ItemRow[] {
    return this.db
      .prepare(
        `SELECT ${COLUMNS} FROM wardrobe_items i WHERE i.user_id=? ORDER BY i.created_at DESC,i.id`,
      )
      .all(userId) as unknown as ItemRow[];
  }
  reference(userId: string, sessionId: string): ItemRow | undefined {
    return this.db
      .prepare(
        `SELECT ${COLUMNS} FROM reference_garments r JOIN wardrobe_items i ON i.id=r.item_id WHERE r.session_id=? AND i.user_id=?`,
      )
      .get(sessionId, userId) as ItemRow | undefined;
  }
  setReference(sessionId: string, itemId: string): void {
    this.db
      .prepare(
        "INSERT INTO reference_garments VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET item_id=excluded.item_id",
      )
      .run(sessionId, itemId);
  }
  attributes(itemId: string): AttributesRow | undefined {
    return this.db
      .prepare(
        "SELECT garment_type AS garmentType,vocabulary_version AS vocabularyVersion,values_json AS valuesJson,raw_text AS rawText,confirmed_image AS confirmedImage,updated_at AS updatedAt FROM wardrobe_item_attributes WHERE item_id=?",
      )
      .get(itemId) as AttributesRow | undefined;
  }
  /** API shape shared by the reference garment and the wardrobe list (file name stays private). */
  view(row: ItemRow, imageUrl: string) {
    const { filename, ...data } = row;
    const saved = this.attributes(row.id);
    return {
      ...data,
      imageUrl,
      // Attributes the user confirmed. needsConfirmation: the photo or the garment type changed since.
      attributes: saved
        ? {
            garmentType: saved.garmentType,
            vocabularyVersion: saved.vocabularyVersion,
            values: JSON.parse(saved.valuesJson) as AttributeValues,
            rawText: saved.rawText,
            needsConfirmation:
              saved.confirmedImage !== filename ||
              saved.garmentType !== row.garmentType,
            updatedAt: saved.updatedAt,
          }
        : null,
    };
  }
  imagePath(row: ItemRow): string {
    return path.join(this.root, row.filename);
  }
  /** Deletes one owned item with its attributes, reference pointers and photo file. */
  remove(userId: string, id: string): boolean {
    return this.transaction((undo) => {
      const row = this.item(userId, id);
      if (!row) return false;
      this.db
        .prepare("DELETE FROM wardrobe_items WHERE id=? AND user_id=?")
        .run(id, userId);
      undo(this.files.remove(row.filename));
      return true;
    });
  }
  /** Account deletion: every item and photo. An already-missing photo does not block it. */
  removeAllForUser(userId: string): void {
    this.transaction((undo) => {
      for (const row of this.items(userId))
        undo(this.files.remove(row.filename, { missingOk: true }));
      this.db.prepare("DELETE FROM wardrobe_items WHERE user_id=?").run(userId);
    });
  }
}
