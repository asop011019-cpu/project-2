/**
 * 온보딩 화면용 순수 변환 함수. 화면 로직에서 분리해 테스트로 고정한다.
 */
import { ApiError } from "@/lib/onboarding-api";
import { genreGroupsFor, styleDefsFor, type CategoryId } from "@/lib/onboarding-catalog";
import type {
  CatalogView,
  GenreGroupImage,
  SessionSummary,
  SessionView,
} from "@/lib/onboarding-session-api";

export interface GenreSection {
  id: string;
  name: string;
  description: string;
  styles: { id: string; name: string }[];
  image: GenreGroupImage | null;
}

/** API 카탈로그가 있으면 그 name/styleDefinitions만 사용, 없으면 정적 미리보기. */
export function genreSectionsFrom(
  catalog: CatalogView | null | undefined,
  categoryId: CategoryId,
): { sections: GenreSection[]; source: "api" | "preview" } {
  if (catalog) {
    const sections = catalog.genreGroups
      .filter((g) => g.categoryId === categoryId)
      .sort((a, b) => a.order - b.order)
      .map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        styles: [...g.styleDefinitions]
          .sort((a, b) => a.order - b.order)
          .map((s) => ({ id: s.id, name: s.name })),
        image: g.representativeImage,
      }));
    return { sections, source: "api" };
  }
  const sections = genreGroupsFor(categoryId).map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    styles: styleDefsFor(g.id).map((s) => ({ id: s.id, name: s.name })),
    image: null,
  }));
  return { sections, source: "preview" };
}

/** 응답 가능한 현재 스타일: 서버 currentStyleId → 첫 미응답 → 첫 항목 (activeStyleOrder 안에서만). */
export function currentStyleOf(session: SessionView): string | null {
  const order = session.activeStyleOrder;
  if (order.length === 0) return null;
  if (session.currentStyleId && order.includes(session.currentStyleId)) {
    return session.currentStyleId;
  }
  const answered = new Set(
    session.responses.filter((r) => r.response !== null).map((r) => r.styleId),
  );
  return order.find((id) => !answered.has(id)) ?? order[0] ?? null;
}

export function incompleteReason(summary: SessionSummary): string | null {
  const s = summary.session;
  if (s.progress.canComplete) return null;
  if (s.contentStatus === "not_ready" || s.activeStyleOrder.length === 0) {
    return "스타일 콘텐츠를 준비 중이라 아직 완료할 수 없어요.";
  }
  if (summary.unansweredStyleIds.length > 0) {
    return `아직 응답하지 않은 스타일이 ${summary.unansweredStyleIds.length}개 있어요.`;
  }
  return "아직 완료 조건을 충족하지 않았어요.";
}

export type ErrorAction = "expired" | "refetch" | "toCategory" | "none";

export function describeOnboardingError(e: unknown): { message: string; action: ErrorAction } {
  if (!(e instanceof ApiError)) {
    return { message: "요청을 처리하지 못했어요. 다시 시도해 주세요.", action: "none" };
  }
  if (e.status === 401) return { message: "이전 기록을 불러오지 못했어요.", action: "expired" };
  if (e.code === "NETWORK_ERROR")
    return { message: "서버에 연결할 수 없어 저장하지 못했어요.", action: "none" };
  if (e.status === 403)
    return { message: "요청 출처를 확인할 수 없어요. 페이지를 새로고침해 주세요.", action: "none" };
  if (e.status === 404 || e.status === 422)
    return { message: "상태가 바뀌어 최신 정보를 다시 불러왔어요.", action: "refetch" };
  if (e.status === 409) {
    if (e.code === "CATEGORY_REQUIRED")
      return { message: "먼저 추천받을 옷의 범주를 선택해 주세요.", action: "toCategory" };
    if (e.code === "CONTENT_NOT_READY")
      return { message: "스타일 콘텐츠를 준비 중이에요.", action: "refetch" };
    if (e.code === "RESPONSES_REQUIRED")
      return { message: "아직 응답하지 않은 스타일이 있어요.", action: "refetch" };
    return { message: e.message || "현재 상태에서 처리할 수 없어요.", action: "refetch" };
  }
  if (e.status >= 500) return { message: "저장에 실패했어요. 다시 시도해 주세요.", action: "none" };
  return { message: e.message || "요청을 처리하지 못했어요.", action: "none" };
}
