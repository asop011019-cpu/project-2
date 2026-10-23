import { z } from "zod";
export const idSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const categoryIdSchema = z.enum(["menswear", "womenswear"]);
export const categoryBody = z.object({ categoryId: categoryIdSchema }).strict();
export const responseBody = z
  .object({
    response: z.enum(["liked", "disliked", "skipped"]),
    // Omitted: save only. Null: review. ID: move there in the same transaction.
    nextStyleId: idSchema.nullable().optional(),
  })
  .strict();
export const preferenceBody = z.object({ selected: z.boolean() }).strict();
export const positionBody = z.object({ styleId: idSchema.nullable() }).strict();
export const genreParams = z.object({ genreGroupId: idSchema }).strict();
export const genrePositionBody = z
  .object({ genreGroupId: idSchema.nullable() })
  .strict();
export const genreProgressBody = z
  .object({
    status: z.enum(["viewed", "skipped"]),
    nextGenreGroupId: idSchema.nullable().optional(),
  })
  .strict();
export const emptyBody = z.object({}).strict();
export const catalogQuery = z
  .object({ categoryId: categoryIdSchema.optional() })
  .strict();
export const styleParams = z.object({ styleId: idSchema }).strict();
export const imageParams = z
  .object({ styleId: idSchema, imageId: idSchema })
  .strict();
export type SelectCategoryRequest = z.infer<typeof categoryBody>;
export type SaveStyleResponseRequest = z.infer<typeof responseBody>;
export type SetImagePreferenceRequest = z.infer<typeof preferenceBody>;
export type SavePositionRequest = z.infer<typeof positionBody>;
