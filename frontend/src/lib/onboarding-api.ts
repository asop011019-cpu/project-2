/**
 * 기준 하의 온보딩 API 클라이언트.
 *
 * 계약 (GAR-001/GAR-002 확정):
 * - 같은 출처 /api, credentials: "include"
 * - 변경 요청(POST/PUT/DELETE)에만 X-Onboarding-Request: 1 헤더
 * - PUT은 FormData(metadata JSON 문자열 + image 파일), Content-Type 수동 설정 금지
 * - 오류 본문 { error: { code, message, issues? }, requestId }
 * - HTML/비JSON 응답(프록시 413/5xx)도 오류로 처리, 성공으로 간주 금지
 * - 401 SESSION_REQUIRED 시 자동 세션 재생성/초기화 금지 (호출자가 명시적 선택을 받아야 함)
 */

export type GarmentType = "pants" | "skirt";

export interface Garment {
  id: string;
  garmentType: GarmentType;
  brand: string | null;
  productName: string | null;
  purchaseUrl: string | null;
  imageUrl: string;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
}

export interface GarmentMetadata {
  garmentType: GarmentType;
  brand: string | null;
  productName: string | null;
  purchaseUrl: string | null;
}

export interface ApiIssue {
  path?: string;
  message?: string;
  [key: string]: unknown;
}

export interface ApiErrorInit {
  status: number;
  code: string;
  message: string;
  issues?: ApiIssue[] | undefined;
  requestId?: string | undefined;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: ApiIssue[] | undefined;
  readonly requestId: string | undefined;

  constructor(init: ApiErrorInit) {
    super(init.message || init.code);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.issues = init.issues;
    this.requestId = init.requestId;
  }
}

const SESSION_PATH = "/api/onboarding/session";
const GARMENT_PATH = "/api/onboarding/session/garment";
const MUTATION_HEADERS = { "X-Onboarding-Request": "1" } as const;

function defaultCodeForStatus(status: number): string {
  if (status === 401) return "SESSION_REQUIRED";
  if (status === 403) return "ORIGIN_NOT_ALLOWED";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 415) return "UNSUPPORTED_MEDIA_TYPE";
  if (status >= 500) return "INTERNAL_ERROR";
  return "UNEXPECTED_RESPONSE";
}

async function parseErrorResponse(res: Response): Promise<ApiError> {
  const requestId = res.headers.get("x-request-id") ?? undefined;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await res.json()) as {
        error?: { code?: unknown; message?: unknown; issues?: ApiIssue[] };
        requestId?: string;
      };
      if (body && typeof body === "object" && body.error && typeof body.error === "object") {
        return new ApiError({
          status: res.status,
          code:
            typeof body.error.code === "string"
              ? body.error.code
              : defaultCodeForStatus(res.status),
          message: typeof body.error.message === "string" ? body.error.message : "",
          issues: Array.isArray(body.error.issues) ? body.error.issues : undefined,
          requestId: body.requestId ?? requestId,
        });
      }
    } catch {
      // JSON 파싱 실패 → 아래 일반 오류로 처리
    }
  }
  // 프록시가 HTML 등 비JSON 오류를 돌려주는 경우
  return new ApiError({
    status: res.status,
    code: defaultCodeForStatus(res.status),
    message: "",
    requestId,
  });
}

/** 온보딩 공통 fetch 래퍼. 세션/카탈로그 클라이언트(onboarding-session-api)도 같은 규칙으로 재사용한다. */
export async function request<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: "include", ...init });
  } catch {
    throw new ApiError({ status: 0, code: "NETWORK_ERROR", message: "" });
  }
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    // 비JSON 2xx 응답도 성공으로 처리하지 않는다
    throw new ApiError({ status: res.status, code: "UNEXPECTED_RESPONSE", message: "" });
  }
  return (await res.json()) as T;
}

/** 세션 생성/재사용. 401을 자동으로 해소하지 않고 그대로 던진다. */
export async function ensureSession(): Promise<void> {
  await request<unknown>(SESSION_PATH, {
    method: "POST",
    headers: { ...MUTATION_HEADERS, "Content-Type": "application/json" },
    body: "{}",
  });
}

export async function getGarment(): Promise<Garment | null> {
  const data = await request<{ garment: Garment | null }>(GARMENT_PATH, { method: "GET" });
  return data.garment ?? null;
}

/**
 * 기준 하의 저장. 최초 등록은 image 필수, 정보만 수정이면 image 생략,
 * 사진 교체 시 image 포함. Content-Type은 브라우저가 boundary와 함께 설정한다.
 */
export async function putGarment(metadata: GarmentMetadata, image?: File): Promise<Garment> {
  const form = new FormData();
  form.set("metadata", JSON.stringify(metadata));
  if (image) {
    form.set("image", image, image.name);
  }
  const data = await request<{ garment: Garment }>(GARMENT_PATH, {
    method: "PUT",
    headers: { ...MUTATION_HEADERS },
    body: form,
  });
  return data.garment;
}

/** 기준 하의 삭제. 204 성공 전까지 호출자는 기존 상태를 지우지 않는다. */
export async function deleteGarment(): Promise<void> {
  await request<unknown>(GARMENT_PATH, {
    method: "DELETE",
    headers: { ...MUTATION_HEADERS },
  });
}

/**
 * 전체 세션 초기화 후 새 세션 생성.
 * 사용자가 명시적으로 '새로 시작'을 선택했을 때만 호출한다.
 * 일반 저장 재시도에서 호출 금지.
 */
export async function resetSession(): Promise<void> {
  await request<unknown>(SESSION_PATH, {
    method: "DELETE",
    headers: { ...MUTATION_HEADERS },
  });
  await ensureSession();
}

/** 저장본 사진 URL. 상대경로 + updatedAt 캐시 쿼리. */
export function garmentImageSrc(garment: Garment): string {
  return `${garment.imageUrl}?v=${encodeURIComponent(garment.updatedAt)}`;
}
