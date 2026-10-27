/**
 * 기준 옷 입력 검증 규칙 (GAR-002 확정값).
 * brand 100자 / productName 200자 / purchaseUrl 2048자,
 * URL은 http/https만, 사용자명·비밀번호 포함 금지, trim 후 빈 값은 null.
 */

import type { GarmentMetadata, GarmentType } from "./onboarding-api";

export const BRAND_MAX = 100;
export const PRODUCT_NAME_MAX = 200;
export const PURCHASE_URL_MAX = 2048;

export type GarmentField = "garmentType" | "brand" | "productName" | "purchaseUrl";
export type FieldErrors = Partial<Record<GarmentField, string>>;

/** trim 후 빈 문자열이면 null. */
export function normalizeOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** purchaseUrl 검증. 유효하면 null, 아니면 안내 문구를 돌려준다. */
export function validatePurchaseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.length > PURCHASE_URL_MAX) {
    return `구매처 링크는 ${PURCHASE_URL_MAX}자까지 입력할 수 있어요.`;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "링크 형식을 확인해 주세요.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "http 또는 https 링크만 입력할 수 있어요.";
  }
  if (url.username !== "" || url.password !== "") {
    return "링크에 사용자 이름이나 비밀번호를 포함할 수 없어요.";
  }
  return null;
}

export interface GarmentFormInput {
  garmentType: GarmentType | null;
  brand: string;
  productName: string;
  purchaseUrl: string;
}

export type BuildMetadataResult = { metadata: GarmentMetadata } | { fieldErrors: FieldErrors };

/** 입력값을 검증해 서버에 보낼 metadata를 만든다. 실패 시 필드별 오류를 돌려준다. */
export function buildMetadata(input: GarmentFormInput): BuildMetadataResult {
  const fieldErrors: FieldErrors = {};

  if (input.garmentType === null) {
    fieldErrors.garmentType = "바지 또는 치마를 선택해 주세요.";
  }

  const brand = normalizeOptional(input.brand);
  if (brand !== null && brand.length > BRAND_MAX) {
    fieldErrors.brand = `브랜드는 ${BRAND_MAX}자까지 입력할 수 있어요.`;
  }

  const productName = normalizeOptional(input.productName);
  if (productName !== null && productName.length > PRODUCT_NAME_MAX) {
    fieldErrors.productName = `제품명은 ${PRODUCT_NAME_MAX}자까지 입력할 수 있어요.`;
  }

  const purchaseUrlError = validatePurchaseUrl(input.purchaseUrl);
  if (purchaseUrlError !== null) {
    fieldErrors.purchaseUrl = purchaseUrlError;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    metadata: {
      garmentType: input.garmentType as GarmentType,
      brand,
      productName,
      purchaseUrl: normalizeOptional(input.purchaseUrl),
    },
  };
}
