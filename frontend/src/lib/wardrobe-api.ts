import { request, type Garment } from "./onboarding-api";

/**
 * WARD-001 내 옷장 API. 저장(200)된 옷만 목록에 있고, 남의 항목은 404로 보인다.
 * 기준 옷은 옷장 항목 중 하나를 가리킨다(referenceItemId).
 */
export interface Wardrobe {
  items: Garment[];
  referenceItemId: string | null;
}

export type BudgetMode = "unanswered" | "any" | "owned_only" | "purchase";
export interface RecommendationCheck {
  budgetMode: BudgetMode;
  blockedReason: null | "WARDROBE_EMPTY" | "WARDROBE_INSUFFICIENT";
  missing: ("top" | "bottom")[];
  wardrobeCount: number;
}

export const WARDROBE_QUERY_KEY = ["wardrobe"] as const;
export const CHECK_QUERY_KEY = ["recommendation-check"] as const;
const MUTATION_HEADERS = { "X-Onboarding-Request": "1" } as const;

export function getWardrobe(): Promise<Wardrobe> {
  return request<Wardrobe>("/api/wardrobe", { method: "GET" });
}

/** 옷장 항목을 기준 옷으로 고른다. */
export async function selectReference(itemId: string): Promise<Garment> {
  const data = await request<{ garment: Garment }>("/api/onboarding/session/garment/reference", {
    method: "PUT",
    headers: { ...MUTATION_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ itemId }),
  });
  return data.garment;
}

/** 옷장 항목 하나와 그 사진을 지운다. 기준 옷이었다면 기준이 비게 된다. */
export async function deleteWardrobeItem(itemId: string): Promise<void> {
  await request<unknown>(`/api/wardrobe/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    headers: { ...MUTATION_HEADERS },
  });
}

/** 저장된 조건과 서버의 계정 옷장으로 계산한 진행 가능 여부(추천 결과 아님). */
export function getRecommendationCheck(): Promise<RecommendationCheck> {
  return request<RecommendationCheck>("/api/onboarding/session/recommendation-check", {
    method: "GET",
  });
}
