import { describe, expect, it } from "vitest";

import {
  BRAND_MAX,
  PRODUCT_NAME_MAX,
  PURCHASE_URL_MAX,
  buildMetadata,
  normalizeOptional,
  validatePurchaseUrl,
} from "@/lib/garment-form";

describe("normalizeOptional", () => {
  it("앞뒤 공백을 제거한다", () => {
    expect(normalizeOptional("  무신사  ")).toBe("무신사");
  });

  it("공백만 있으면 null이다", () => {
    expect(normalizeOptional("   ")).toBeNull();
    expect(normalizeOptional("")).toBeNull();
  });
});

describe("validatePurchaseUrl", () => {
  it("빈 값은 선택 항목이므로 통과한다", () => {
    expect(validatePurchaseUrl("")).toBeNull();
    expect(validatePurchaseUrl("   ")).toBeNull();
  });

  it("http와 https 링크를 허용한다", () => {
    expect(validatePurchaseUrl("https://example.com/item/1")).toBeNull();
    expect(validatePurchaseUrl("http://example.com")).toBeNull();
  });

  it("http/https 외 스킴은 거부한다", () => {
    expect(validatePurchaseUrl("ftp://example.com/item")).not.toBeNull();
  });

  it("형식이 잘못된 링크는 거부한다", () => {
    expect(validatePurchaseUrl("not-a-url")).not.toBeNull();
  });

  it("사용자명·비밀번호가 포함된 링크는 거부한다", () => {
    expect(validatePurchaseUrl("https://user:pass@example.com")).not.toBeNull();
    expect(validatePurchaseUrl("https://user@example.com")).not.toBeNull();
  });

  it("2048자를 넘으면 거부한다", () => {
    const long = `https://example.com/${"a".repeat(PURCHASE_URL_MAX)}`;
    expect(validatePurchaseUrl(long)).not.toBeNull();
  });
});

describe("buildMetadata", () => {
  const base = { garmentType: "pants" as const, brand: "", productName: "", purchaseUrl: "" };

  it("종류가 없으면 garmentType 오류를 돌려준다", () => {
    const result = buildMetadata({ ...base, garmentType: null });
    expect(result).toEqual({ fieldErrors: { garmentType: expect.any(String) } });
  });

  it("브랜드가 100자를 넘으면 오류다", () => {
    const result = buildMetadata({ ...base, brand: "가".repeat(BRAND_MAX + 1) });
    expect(result).toEqual({ fieldErrors: { brand: expect.any(String) } });
  });

  it("제품명이 200자를 넘으면 오류다", () => {
    const result = buildMetadata({ ...base, productName: "나".repeat(PRODUCT_NAME_MAX + 1) });
    expect(result).toEqual({ fieldErrors: { productName: expect.any(String) } });
  });

  it("빈 선택 항목은 null로 보낸다", () => {
    const result = buildMetadata(base);
    expect(result).toEqual({
      metadata: { garmentType: "pants", brand: null, productName: null, purchaseUrl: null },
    });
  });

  it("정상 입력은 trim된 metadata를 만든다", () => {
    const result = buildMetadata({
      garmentType: "skirt",
      brand: "  브랜드 ",
      productName: "플리츠 스커트",
      purchaseUrl: "https://example.com/item/1",
    });
    expect(result).toEqual({
      metadata: {
        garmentType: "skirt",
        brand: "브랜드",
        productName: "플리츠 스커트",
        purchaseUrl: "https://example.com/item/1",
      },
    });
  });
});
