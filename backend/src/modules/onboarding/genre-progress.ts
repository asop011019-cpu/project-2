import type { PhotoExploration, PhotoExplorationView } from "./types.ts";
import { DomainError } from "./domain.ts";

export function photoProgress(
  value: PhotoExploration,
  hasContent: boolean,
): PhotoExplorationView {
  const index = value.genres.findIndex(
    (genre) => genre.genreGroupId === value.currentGenreGroupId,
  );
  const completedCount = value.genres.filter(
    (genre) => genre.status !== "unseen",
  ).length;
  return {
    ...value,
    progress: {
      currentIndex: index < 0 ? null : index,
      completedCount,
      totalCount: value.genres.length,
      canComplete:
        hasContent &&
        value.genres.length > 0 &&
        completedCount === value.genres.length,
    },
  };
}
export function assertGenre(value: PhotoExploration, id: string): void {
  if (!value.genres.some((genre) => genre.genreGroupId === id))
    throw new DomainError(
      422,
      "GENRE_NOT_IN_SESSION",
      "현재 의류 범주의 장르가 아니에요.",
    );
}
export function assertPhotoCompletable(
  value: PhotoExploration,
  hasContent: boolean,
): void {
  if (!hasContent)
    throw new DomainError(
      409,
      "CONTENT_NOT_READY",
      "탐색할 사진이 아직 준비되지 않았어요.",
    );
  if (!photoProgress(value, hasContent).progress.canComplete)
    throw new DomainError(
      409,
      "GENRE_VISITS_REQUIRED",
      "모든 장르를 살펴보거나 명시적으로 건너뛰어 주세요.",
    );
}
