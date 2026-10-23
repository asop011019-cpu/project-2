// Types only: no backend runtime or database code is bundled in the browser.
export type {
  ApiErrorResponse,
  CatalogView,
  ClothingCategoryId,
  GenreGroupView,
  PublicStyleImage,
  ResponseValue,
  SessionSummary,
  SessionView,
  StyleDetail,
} from "../../../backend/src/modules/onboarding/types.ts";
import type {
  CatalogView,
  ClothingCategoryId,
  ResponseValue,
  SessionSummary,
  SessionView,
  StyleDetail,
} from "../../../backend/src/modules/onboarding/types.ts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 0, code = "NETWORK_ERROR") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/onboarding${path}`, {
      method,
      credentials: "include",
      headers:
        method === "GET"
          ? {}
          : {
              "X-Onboarding-Request": "1",
              ...(body === undefined
                ? {}
                : { "Content-Type": "application/json" }),
            },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(
      "연결이 끊겼어요. 선택은 그대로 두고 다시 시도해 주세요.",
    );
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new ApiError(
      data?.error?.message ??
        "불러오거나 저장하지 못했어요. 다시 시도해 주세요.",
      response.status,
      data?.error?.code ?? "INVALID_SERVER_RESPONSE",
    );
  }
  return data as T;
}

let initialization: Promise<SessionView> | null = null;
export const api = {
  initialize() {
    initialization ??= request<SessionView>("/session", "POST", {}).finally(
      () => {
        initialization = null;
      },
    );
    return initialization;
  },
  catalog: () => request<CatalogView>("/catalog"),
  session: () => request<SessionView>("/session"),
  category: (categoryId: ClothingCategoryId) =>
    request<SessionView>("/session/category", "PUT", { categoryId }),
  startPhotos: () =>
    request<SessionView>("/session/photo-exploration", "POST", {}),
  genrePosition: (genreGroupId: string | null) =>
    request<SessionView>("/session/genre-position", "PUT", { genreGroupId }),
  visitGenre: (
    genreGroupId: string,
    status: "viewed" | "skipped",
    nextGenreGroupId: string | null,
  ) =>
    request<SessionView>(
      `/session/genres/${encodeURIComponent(genreGroupId)}/progress`,
      "PUT",
      { status, nextGenreGroupId },
    ),
  detail: (id: string) =>
    request<StyleDetail>(`/styles/${encodeURIComponent(id)}`),
  respond: (id: string, response: ResponseValue) =>
    request<SessionView>(
      `/session/styles/${encodeURIComponent(id)}/response`,
      "PUT",
      { response, nextStyleId: id },
    ),
  prefer: (styleId: string, imageId: string, selected: boolean) =>
    request<SessionView>(
      `/session/styles/${encodeURIComponent(styleId)}/images/${encodeURIComponent(imageId)}/preference`,
      "PUT",
      { selected },
    ),
  position: (styleId: string | null) =>
    request<SessionView>("/session/position", "PUT", { styleId }),
  summary: () => request<SessionSummary>("/session/summary"),
  complete: () => request<SessionView>("/session/complete", "POST", {}),
  refresh: () => request<SessionView>("/session/refresh-catalog", "POST", {}),
  delete: () => request<void>("/session", "DELETE"),
};
