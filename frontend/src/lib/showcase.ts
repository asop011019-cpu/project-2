/**
 * What an outfit card needs to show (MOT-001). The shape is kept small and reusable for the M4
 * results screen; nothing here recommends, prices or fetches products.
 */
export interface ShowcaseItem {
  id: string;
  /** e.g. 상의, 신발, 기준 옷 */
  role: string;
  name: string;
  /** The user's own reference garment: shown, never counted as a purchase. */
  owned: boolean;
  /** Reference price in won, or null when unknown. Not a guaranteed sale price. */
  referencePriceKrw: number | null;
  storeName: string | null;
  /** Shop link checked by the server, or null. */
  url: string | null;
  imageUrl: string | null;
  imageAlt: string;
}
export interface ShowcaseOutfit {
  id: string;
  title: string;
  note: string;
  items: ShowcaseItem[];
}

/** Sum of the reference prices of items to buy; unknown when any of them has no price. */
export function purchaseTotal(outfit: ShowcaseOutfit): { total: number; complete: boolean } {
  const toBuy = outfit.items.filter((item) => !item.owned);
  return {
    total: toBuy.reduce((sum, item) => sum + (item.referencePriceKrw ?? 0), 0),
    complete: toBuy.every((item) => item.referencePriceKrw !== null),
  };
}

export const formatWon = (value: number) => `${value.toLocaleString("ko-KR")}원`;

/** Only http(s) links are opened; anything else is shown as no link. */
export function safeShopUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/**
 * Development-only sample for checking the showcase interaction. These are not products, prices
 * or recommendations; there are no images or shop links, so nothing real is implied.
 */
export const DEV_SAMPLE_OUTFITS: ShowcaseOutfit[] = ["A", "B", "C"].map((letter, index) => ({
  id: `dev-sample-${letter}`,
  title: `시험 코디 ${letter}`,
  note: "개발용 시험 데이터예요. 실제 상품·가격이 아니에요.",
  items: [
    {
      id: `dev-${letter}-base`,
      role: "기준 옷",
      name: "내가 등록한 옷 (시험)",
      owned: true,
      referencePriceKrw: null,
      storeName: null,
      url: null,
      imageUrl: null,
      imageAlt: "",
    },
    {
      id: `dev-${letter}-top`,
      role: "상의",
      name: `시험 품목 ${letter}-1`,
      owned: false,
      referencePriceKrw: 10_000 * (index + 1),
      storeName: null,
      url: null,
      imageUrl: null,
      imageAlt: "",
    },
    {
      id: `dev-${letter}-shoes`,
      role: "신발",
      name: `시험 품목 ${letter}-2`,
      owned: false,
      referencePriceKrw: index === 2 ? null : 20_000,
      storeName: null,
      url: null,
      imageUrl: null,
      imageAlt: "",
    },
  ],
}));
