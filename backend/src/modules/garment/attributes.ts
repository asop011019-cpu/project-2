import { z } from "zod";

// GAR-002: user-confirmed garment attributes, drawn from the curator's VOC-001 vocabulary
// (garment-vocab-0.2). Only axes the user can judge from the garment are offered; fiber
// composition is never inferred from a photo, so it has no axis here (rawText keeps what the
// user writes). null means "not answered", distinct from an explicit "unknown".
// AI estimates are a separate, later concern (ANL-001) and are never stored here.
export const VOCABULARY_VERSION = "garment-vocab-0.2";
export const GARMENT_TYPES = ["pants", "skirt", "top", "outer"] as const;
export type GarmentType = (typeof GARMENT_TYPES)[number];

const one = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values).nullable().optional();
const many = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.enum(values))
    .max(values.length)
    .refine((list) => new Set(list).size === list.length, "중복된 값이 있어요.")
    .nullable()
    .optional();

const color = z
  .object({
    base: one([
      "black",
      "white",
      "ivory",
      "beige",
      "khaki",
      "olive",
      "brown",
      "grey",
      "charcoal",
      "navy",
      "blue",
      "red",
      "pink",
      "green",
      "yellow",
      "purple",
      "other",
    ]),
    tone: one(["light", "mid", "dark"]),
    pattern: one([
      "solid",
      "stripe",
      "pinstripe",
      "check",
      "glen_check",
      "houndstooth",
      "herringbone",
      "floral",
      "dot",
      "other",
      "unknown",
    ]),
    denimWash: one([
      "raw_indigo",
      "mid_wash",
      "light_wash",
      "black",
      "grey",
      "unknown",
    ]),
  })
  .strict()
  .nullable()
  .optional();
const materialLook = one([
  "denim",
  "cotton_twill",
  "suiting",
  "corduroy",
  "knit_jersey",
  "sweat",
  "technical",
  "linen_like",
  "leather_like",
  "tweed",
  "satin_like",
  "oxford_cotton",
  "suede_like",
  "canvas",
  "fleece",
  "padded",
  "other",
  "unknown",
]);
const silhouette = one([
  "skinny",
  "slim",
  "tapered",
  "straight",
  "regular",
  "relaxed",
  "wide",
  "barrel",
  "bootcut_flare",
  "h_line",
  "a_line",
  "flare_skirt",
  "mermaid",
  "balloon",
  "unknown",
]);
const length = one([
  "full",
  "ankle",
  "cropped",
  "shorts_knee",
  "shorts_short",
  "mini",
  "midi",
  "long",
  "unknown",
]);
const upper = {
  neckline: one([
    "crew",
    "v_neck",
    "turtleneck",
    "collar",
    "polo_collar",
    "hood",
    "boat",
    "square",
    "unknown",
  ]),
  sleeve: one(["sleeveless", "short", "long", "unknown"]),
  topFit: one(["slim", "regular", "relaxed", "unknown"]),
  topLength: one(["crop", "regular", "half", "long", "unknown"]),
};

/** Axes every garment type shares; they survive a change of garment type. */
const COMMON = ["color", "materialLook"] as const;
const schemas = {
  pants: z
    .object({
      color,
      materialLook,
      construction: many([
        "tailored_trouser",
        "five_pocket",
        "chino_style",
        "utility_cargo",
        "athletic",
        "leggings",
        "other",
        "unknown",
      ]),
      silhouette,
      length,
    })
    .strict(),
  skirt: z
    .object({
      color,
      materialLook,
      skirtStructure: many([
        "pleated",
        "wrap",
        "gathered",
        "tiered",
        "slit",
        "button_front",
        "plain",
        "unknown",
      ]),
      silhouette,
      length,
    })
    .strict(),
  top: z
    .object({
      color,
      materialLook,
      topType: one([
        "tshirt",
        "polo_pique",
        "knit_polo",
        "shirt",
        "blouse",
        "knit_sweater",
        "sweatshirt",
        "hoodie",
        "knit_vest",
        "sleeveless",
        "other",
        "unknown",
      ]),
      ...upper,
    })
    .strict(),
  outer: z
    .object({
      color,
      materialLook,
      outerType: one([
        "blazer",
        "shirt_jacket",
        "cardigan",
        "trucker",
        "work_safari",
        "blouson_ma1",
        "coach_nylon",
        "leather_rider",
        "fleece",
        "hood_zip",
        "vest",
        "coat_transitional",
        "coat_winter",
        "padding_light",
        "padding_heavy",
        "other",
        "unknown",
      ]),
      ...upper,
    })
    .strict(),
} satisfies Record<GarmentType, z.ZodTypeAny>;

export type AttributeValues = Record<string, unknown>;

/** Validates values for one garment type; axes of another type are rejected, not dropped. */
export function parseAttributeValues(
  type: GarmentType,
  values: unknown,
): AttributeValues {
  const parsed = schemas[type].parse(values) as AttributeValues;
  // Store answered axes only, so "not answered" is always absent rather than null-or-missing.
  const answered = (entries: [string, unknown][]) =>
    entries.filter(
      ([, value]) =>
        value != null && !(Array.isArray(value) && value.length === 0),
    );
  const result = Object.fromEntries(answered(Object.entries(parsed)));
  if (result.color) {
    const color = Object.fromEntries(
      answered(Object.entries(result.color as object)),
    );
    if (Object.keys(color).length) result.color = color;
    else delete result.color;
  }
  return result;
}

/** Keeps only the axes shared by every type, used when the user switches the garment type. */
export function keepCommonValues(values: AttributeValues): AttributeValues {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) =>
      (COMMON as readonly string[]).includes(key),
    ),
  );
}
