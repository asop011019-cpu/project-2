import type {
  CatalogSnapshot,
  Style,
  StyleImage,
  PublicStyleImage,
  StyleDetail,
  StyleResponse,
} from "./types.ts";
export const MIN_STYLE_IMAGES = 4;
export const MAX_STYLE_IMAGES = 6;
export class DomainError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "DomainError";
    this.status = status;
    this.code = code;
  }
}
export function publicImage(image: StyleImage): PublicStyleImage {
  return {
    id: image.id,
    styleId: image.styleId,
    categoryId: image.categoryId,
    originalUrl: image.originalRef,
    thumbnailUrl: image.thumbnailRef,
    alt: image.alt,
    width: image.width,
    height: image.height,
    format: image.format,
    isGenerated: image.isGenerated,
    order: image.order,
    sourceUrl: image.sourceUrl,
    creator: image.creator!,
    usageStatus: "allowed",
    publicationStatus: "published",
  };
}
export function visibleImages(
  style: Style,
  images: readonly StyleImage[],
): StyleImage[] {
  return images
    .filter(
      (image) =>
        image.styleId === style.id &&
        image.categoryId === style.categoryId &&
        image.publicationStatus === "published" &&
        image.usageStatus === "allowed" &&
        Boolean(image.creator),
    )
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .slice(0, MAX_STYLE_IMAGES);
}
export function explorableStyles(catalog: CatalogSnapshot): StyleDetail[] {
  return catalog.styles
    .filter((style) => style.publicationStatus === "published")
    .map((style) => ({
      ...style,
      images: visibleImages(style, catalog.images).map(publicImage),
    }))
    .filter((style) => style.images.length >= MIN_STYLE_IMAGES)
    .sort(
      (a, b) =>
        a.explorationOrder - b.explorationOrder || a.id.localeCompare(b.id),
    )
    .map((style) => ({ ...style, imageCount: style.images.length }));
}
export function answeredCount(
  styleIds: readonly string[],
  responses: readonly StyleResponse[],
): number {
  const answered = new Set(responses.map((response) => response.styleId));
  return styleIds.filter((id) => answered.has(id)).length;
}
export function assertCompletable(total: number, answered: number): void {
  if (!total)
    throw new DomainError(
      409,
      "CONTENT_NOT_READY",
      "탐색할 게시 스타일이 아직 준비되지 않았어요.",
    );
  if (answered !== total)
    throw new DomainError(
      409,
      "RESPONSES_REQUIRED",
      "모든 스타일에 응답하거나 명시적으로 건너뛰어 주세요.",
    );
}
