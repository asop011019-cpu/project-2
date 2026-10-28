import type { Conditions } from "../conditions/conditions.ts";
import type { GarmentType } from "../garment/attributes.ts";

// WARD-001: what an additional-purchase budget allows. 0 won means "only garments the account
// already has in its wardrobe"; it is a real value, distinct from unanswered (null) and "any".
export type BudgetMode = "unanswered" | "any" | "owned_only" | "purchase";
export const budgetMode = (
  budget: Conditions["additionalBudgetKrw"],
): BudgetMode =>
  budget === null
    ? "unanswered"
    : budget === "any"
      ? "any"
      : budget === 0
        ? "owned_only"
        : "purchase";

/** The garment kinds one owned-only outfit needs at least. Outers are optional. */
export type OutfitSlot = "top" | "bottom";
const SLOT: Record<GarmentType, OutfitSlot | null> = {
  top: "top",
  pants: "bottom",
  skirt: "bottom",
  outer: null,
};
export type OwnedOnlyCheck = {
  blockedReason: null | "WARDROBE_EMPTY" | "WARDROBE_INSUFFICIENT";
  missing: OutfitSlot[];
};
/** Whether the wardrobe alone can make one outfit; the reason and the missing kinds if not. */
export function ownedOnlyCheck(types: GarmentType[]): OwnedOnlyCheck {
  if (types.length === 0)
    return { blockedReason: "WARDROBE_EMPTY", missing: ["top", "bottom"] };
  const have = new Set(types.map((type) => SLOT[type]));
  const missing = (["top", "bottom"] as const).filter(
    (slot) => !have.has(slot),
  );
  return {
    blockedReason: missing.length ? "WARDROBE_INSUFFICIENT" : null,
    missing,
  };
}

/** A garment a recommendation may use: one from the wardrobe, or a product to buy. */
export type Candidate =
  | { source: "owned"; itemId: string }
  | { source: "product"; productId: string; priceKrw: number | null };

/**
 * Keeps the candidates the budget allows. `ownedItemIds` must come from the account's own
 * wardrobe on the server, never from the client. With 0 won only owned items stay: a free
 * product, a deleted item or another account's item never counts as owned.
 */
export function allowedCandidates(
  budget: Conditions["additionalBudgetKrw"],
  ownedItemIds: ReadonlySet<string>,
  candidates: Candidate[],
): Candidate[] {
  const owned = (c: Candidate) =>
    c.source === "owned" && ownedItemIds.has(c.itemId);
  if (budgetMode(budget) === "owned_only") return candidates.filter(owned);
  return candidates.filter((c) => c.source === "product" || owned(c));
}

/** Sum of what would be bought; owned and reference garments are never counted. */
export function purchaseTotalKrw(candidates: Candidate[]): {
  total: number;
  complete: boolean;
} {
  let total = 0;
  let complete = true;
  for (const c of candidates) {
    if (c.source !== "product") continue;
    if (c.priceKrw === null) complete = false;
    else total += c.priceKrw;
  }
  return { total, complete };
}
