import { z } from "zod";

// COND-001: what the user wants the recommended outfit to fit. Every field is either not
// answered (null), explicitly "any", or a value; the three are never mixed up.
export const CONDITIONS_VERSION = "conditions-0.1";
export const OCCASIONS = [
  "daily",
  "work_school",
  "date_gathering",
  "formal_event",
  "outdoor",
] as const;
export const TEMPERATURE_RANGE = { min: -20, max: 40 } as const;
/** 0 won is a real answer: use only garments already in the account's wardrobe (WARD-001). */
export const BUDGET_RANGE = { min: 0, max: 5_000_000 } as const;
/** One occasion for now; an array so allowing several later does not break the API. */
export const MAX_OCCASIONS = 1;

const answer = <T extends z.ZodType>(value: T) =>
  z.union([z.null(), z.literal("any"), value]);
const temperature = z
  .number()
  .int()
  .min(TEMPERATURE_RANGE.min)
  .max(TEMPERATURE_RANGE.max);
export const conditionsSchema = z
  .object({
    temperatureC: answer(
      z
        .object({ min: temperature, max: temperature })
        .strict()
        .refine((range) => range.min <= range.max, {
          message: "최저 기온이 최고 기온보다 높아요.",
          path: ["min"],
        }),
    ),
    occasions: answer(
      z
        .array(z.enum(OCCASIONS))
        .min(1)
        .max(MAX_OCCASIONS)
        .refine(
          (list) => new Set(list).size === list.length,
          "같은 상황이 두 번 있어요.",
        ),
    ),
    formality: answer(z.number().int().min(0).max(100)),
    additionalBudgetKrw: answer(
      z.number().int().min(BUDGET_RANGE.min).max(BUDGET_RANGE.max),
    ),
  })
  .strict();
export type Conditions = z.infer<typeof conditionsSchema>;

export const UNANSWERED: Conditions = {
  temperatureC: null,
  occasions: null,
  formality: null,
  additionalBudgetKrw: null,
};

/** Puts lists in vocabulary order so the same choice is always stored the same way. */
export function normalizeConditions(conditions: Conditions): Conditions {
  const occasions = conditions.occasions;
  return {
    ...conditions,
    occasions: Array.isArray(occasions)
      ? OCCASIONS.filter((o) => occasions.includes(o))
      : occasions,
  };
}

export const isUnanswered = (conditions: Conditions) =>
  Object.values(conditions).every((value) => value === null);
