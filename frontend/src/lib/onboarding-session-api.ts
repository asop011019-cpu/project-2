/**
 * 온보딩 세션·카탈로그 API 클라이언트 (API v1 계약 원문 기준).
 *
 * - 같은 출처 /api/onboarding, credentials: "include" (onboarding-api의 request 재사용)
 * - 변경 요청(POST/PUT/DELETE)에만 X-Onboarding-Request: 1
 * - JSON 요청에는 Content-Type: application/json
 * - 401 SESSION_REQUIRED 시 자동 세션 재생성 금지 — 명시적 '새로 시작'만 허용
 * - 세션 ID를 URL·본문·헤더에 넣지 않는다 (쿠키는 서버가 설정)
 */

import { request } from "@/lib/onboarding-api";
import type { CategoryId } from "@/lib/onboarding-catalog";

export type StyleResponse = "liked" | "disliked" | "skipped";
export type ContentStatus = "ready" | "not_ready";

export interface StyleDefinitionView {
  id: string;
  name: string;
  order: number;
  contentStatus: ContentStatus;
}

export interface GenreGroupImage {
  originalUrl: string;
  thumbnailUrl: string;
  alt: string;
  width: number;
  height: number;
}

export interface GenreGroupView {
  id: string;
  categoryId: CategoryId;
  name: string;
  description: string;
  order: number;
  styleDefinitions: StyleDefinitionView[];
  availableStyleCount: number;
  contentStatus: ContentStatus;
  representativeImage: GenreGroupImage | null;
}

export interface CatalogView {
  version: number;
  contentStatus: ContentStatus;
  categories: { id: CategoryId; name: string; order: number }[];
  genreGroups: GenreGroupView[];
  styles: SessionStyleSummary[];
}

export interface StyleImage {
  id: string;
  styleId: string;
  categoryId: CategoryId;
  originalUrl: string;
  thumbnailUrl: string;
  alt: string;
  width: number;
  height: number;
  format: "model_outfit" | "flat_lay" | "collage";
  isGenerated: boolean;
  order: number;
  sourceUrl: string | null;
  creator: string | null;
  usageStatus: string;
  publicationStatus: string;
}

export interface StyleDetail {
  id: string;
  categoryId: CategoryId;
  genreGroupId: string;
  name: string;
  description: string;
  order: number;
  contentStatus: ContentStatus;
  imageCount: number;
  images: StyleImage[];
}

export interface SessionStyleSummary {
  id: string;
  name: string;
  genreGroupId: string;
  order: number;
  explorationOrder: number;
  contentStatus: ContentStatus;
}

export interface SessionProgress {
  currentIndex: number | null;
  answeredCount: number;
  totalCount: number;
  originalTotalCount: number;
  withdrawnCount: number;
  allAnswered: boolean;
  canComplete: boolean;
}

export interface SessionNavigation {
  previousStyleId: string | null;
  nextStyleId: string | null;
}

export interface SessionStyleResponseEntry {
  styleId: string;
  response: StyleResponse | null;
  updatedAt: string | null;
}

export interface SessionImagePreference {
  styleId: string;
  imageId: string;
  selected: boolean;
  updatedAt: string;
}

export interface SessionView {
  id: string;
  selectedCategoryId: CategoryId | null;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
  completedAt: string | null;
  status: "in_progress" | "completed";
  contentStatus: "category_required" | ContentStatus;
  catalogVersion: number | null;
  currentCatalogVersion: number | null;
  catalogChanged: boolean;
  activeStyleOrder: string[];
  styles: SessionStyleSummary[];
  currentStyleId: string | null;
  progress: SessionProgress;
  navigation: SessionNavigation;
  responses: SessionStyleResponseEntry[];
  imagePreferences: SessionImagePreference[];
}

export interface SessionSummary {
  session: SessionView;
  likedStyles: SessionStyleSummary[];
  dislikedStyles: SessionStyleSummary[];
  skippedStyles: SessionStyleSummary[];
  unansweredStyleIds: string[];
  likedImages: SessionImagePreference[];
  isExploringOnly: boolean;
}

const BASE = "/api/onboarding";
const MUTATION_HEADERS = {
  "X-Onboarding-Request": "1",
  "Content-Type": "application/json",
} as const;

export function getCatalog(categoryId?: CategoryId): Promise<CatalogView> {
  const query = categoryId ? `?categoryId=${categoryId}` : "";
  return request<CatalogView>(`${BASE}/catalog${query}`, { method: "GET" });
}

export function getStyle(styleId: string): Promise<StyleDetail> {
  return request<StyleDetail>(`${BASE}/styles/${encodeURIComponent(styleId)}`, {
    method: "GET",
  });
}

/** 세션 생성/재사용. 401을 자동 해소하지 않고 그대로 던진다. */
export function createSession(): Promise<SessionView> {
  return request<SessionView>(`${BASE}/session`, {
    method: "POST",
    headers: { ...MUTATION_HEADERS },
    body: "{}",
  });
}

export function getSession(): Promise<SessionView> {
  return request<SessionView>(`${BASE}/session`, { method: "GET" });
}

export function putCategory(categoryId: CategoryId): Promise<SessionView> {
  return request<SessionView>(`${BASE}/session/category`, {
    method: "PUT",
    headers: { ...MUTATION_HEADERS },
    body: JSON.stringify({ categoryId }),
  });
}

export function putStyleResponse(
  styleId: string,
  response: StyleResponse,
  nextStyleId?: string | null,
): Promise<SessionView> {
  return request<SessionView>(`${BASE}/session/styles/${encodeURIComponent(styleId)}/response`, {
    method: "PUT",
    headers: { ...MUTATION_HEADERS },
    body: JSON.stringify(nextStyleId === undefined ? { response } : { response, nextStyleId }),
  });
}

export function putImagePreference(
  styleId: string,
  imageId: string,
  selected: boolean,
): Promise<SessionView> {
  return request<SessionView>(
    `${BASE}/session/styles/${encodeURIComponent(styleId)}/images/${encodeURIComponent(imageId)}/preference`,
    {
      method: "PUT",
      headers: { ...MUTATION_HEADERS },
      body: JSON.stringify({ selected }),
    },
  );
}

export function putPosition(styleId: string | null): Promise<SessionView> {
  return request<SessionView>(`${BASE}/session/position`, {
    method: "PUT",
    headers: { ...MUTATION_HEADERS },
    body: JSON.stringify({ styleId }),
  });
}

export function getSummary(): Promise<SessionSummary> {
  return request<SessionSummary>(`${BASE}/session/summary`, { method: "GET" });
}

export function completeSession(): Promise<SessionView> {
  return request<SessionView>(`${BASE}/session/complete`, {
    method: "POST",
    headers: { ...MUTATION_HEADERS },
    body: "{}",
  });
}

/**
 * 전체 세션 초기화 후 새 세션 생성.
 * 사용자가 명시적으로 '새로 시작'을 선택했을 때만 호출한다.
 */
export async function resetOnboardingSession(): Promise<SessionView> {
  await request<unknown>(`${BASE}/session`, {
    method: "DELETE",
    headers: { ...MUTATION_HEADERS },
    body: "{}",
  });
  return createSession();
}
