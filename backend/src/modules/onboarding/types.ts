export type ClothingCategoryId = "menswear" | "womenswear";
export type PublicationStatus = "draft" | "published";
export type ImageFormat = "model_outfit" | "flat_lay" | "collage";
export type ResponseValue = "liked" | "disliked" | "skipped";
export type SessionStatus = "in_progress" | "completed";
export interface ClothingCategory {
  id: ClothingCategoryId;
  name: string;
  order: number;
}
export interface GenreGroup {
  id: string;
  categoryId: ClothingCategoryId;
  name: string;
  description: string;
  order: number;
}
export interface Style {
  id: string;
  categoryId: ClothingCategoryId;
  genreGroupId: string;
  name: string;
  description: string;
  order: number;
  publicationStatus: PublicationStatus;
}
export interface StyleImage {
  id: string;
  styleId: string;
  categoryId: ClothingCategoryId;
  originalRef: string;
  thumbnailRef: string;
  alt: string;
  width: number;
  height: number;
  format: ImageFormat;
  isGenerated: boolean;
  order: number;
  sourceUrl: string | null;
  creator: string | null;
  usageStatus: "pending" | "allowed" | "revoked";
  publicationStatus: PublicationStatus;
  contentHash: string | null;
}
export interface PublicStyleImage {
  id: string;
  styleId: string;
  categoryId: ClothingCategoryId;
  originalUrl: string;
  thumbnailUrl: string;
  alt: string;
  width: number;
  height: number;
  format: ImageFormat;
  isGenerated: boolean;
  order: number;
  sourceUrl: string | null;
  creator: string;
  usageStatus: "allowed";
  publicationStatus: "published";
}
export interface CatalogSnapshot {
  version: number;
  categories: ClothingCategory[];
  genreGroups: GenreGroup[];
  styles: Style[];
  images: StyleImage[];
}
export interface StyleSummary extends Style {
  imageCount: number;
}
export interface StyleDetail extends StyleSummary {
  images: PublicStyleImage[];
}
export interface SessionRecord {
  id: string;
  tokenHash: string;
  selectedCategoryId: ClothingCategoryId | null;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
}
export interface CategorySession {
  sessionId: string;
  categoryId: ClothingCategoryId;
  catalogVersion: number;
  currentStyleId: string | null;
  status: SessionStatus;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}
export interface SnapshotStyle {
  styleId: string;
  position: number;
  withdrawnAt: string | null;
}
export interface StyleResponse {
  sessionId: string;
  categoryId: ClothingCategoryId;
  styleId: string;
  response: ResponseValue;
  updatedAt: string;
}
export interface ImagePreference {
  sessionId: string;
  categoryId: ClothingCategoryId;
  styleId: string;
  imageId: string;
  selected: boolean;
  updatedAt: string;
}
export interface SessionView {
  id: string;
  selectedCategoryId: ClothingCategoryId | null;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
  status: SessionStatus;
  completedAt: string | null;
  contentStatus: "category_required" | "not_ready" | "ready";
  catalogVersion: number | null;
  currentCatalogVersion: number;
  catalogChanged: boolean;
  activeStyleOrder: string[];
  styles: StyleSummary[];
  currentStyleId: string | null;
  progress: {
    currentIndex: number | null;
    answeredCount: number;
    totalCount: number;
    originalTotalCount: number;
    withdrawnCount: number;
    allAnswered: boolean;
    canComplete: boolean;
  };
  navigation: { previousStyleId: string | null; nextStyleId: string | null };
  responses: {
    styleId: string;
    response: ResponseValue | null;
    updatedAt: string | null;
  }[];
  imagePreferences: {
    styleId: string;
    imageId: string;
    selected: boolean;
    updatedAt: string;
  }[];
}
export interface SessionSummary {
  session: SessionView;
  likedStyles: StyleSummary[];
  dislikedStyles: StyleSummary[];
  skippedStyles: StyleSummary[];
  unansweredStyleIds: string[];
  likedImages: PublicStyleImage[];
  isExploringOnly: boolean;
}
export interface CatalogView {
  version: number;
  contentStatus: "ready" | "not_ready";
  categories: ClothingCategory[];
  genreGroups: GenreGroup[];
  styles: StyleSummary[];
}
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    issues?: { path: string; message: string }[];
  };
  requestId: string;
}
