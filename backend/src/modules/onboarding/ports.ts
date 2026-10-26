import type {
  CatalogSnapshot,
  ClothingCategoryId,
  SessionRecord,
  CategorySession,
  SnapshotStyle,
  StyleResponse,
  ImagePreference,
} from "./types.ts";
export interface OnboardingRepository {
  transaction<T>(operation: () => T): T;
  catalog(): CatalogSnapshot;
  findSession(id: string): SessionRecord | undefined;
  sessionIdForUser(userId: string): string | undefined;
  insertSession(session: SessionRecord): void;
  deleteSession(id: string, options?: { missingFileOk?: boolean }): void;
  selectCategory(id: string, categoryId: ClothingCategoryId, now: string): void;
  touchSession(id: string, now: string): void;
  categorySession(
    id: string,
    categoryId: ClothingCategoryId,
  ): CategorySession | undefined;
  insertCategory(category: CategorySession): void;
  updateCategory(category: CategorySession): void;
  snapshot(id: string, categoryId: ClothingCategoryId): SnapshotStyle[];
  replaceSnapshot(
    id: string,
    categoryId: ClothingCategoryId,
    styleIds: readonly string[],
  ): void;
  withdraw(
    id: string,
    categoryId: ClothingCategoryId,
    styleIds: readonly string[],
    now: string,
  ): void;
  responses(id: string, categoryId: ClothingCategoryId): StyleResponse[];
  saveResponse(response: StyleResponse): void;
  preferences(id: string, categoryId: ClothingCategoryId): ImagePreference[];
  savePreference(preference: ImagePreference): void;
}
