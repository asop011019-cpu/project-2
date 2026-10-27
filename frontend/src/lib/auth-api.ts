import { request } from "./onboarding-api";
import { safeReturnTo } from "./auth-routing";
export interface ConsentDocument {
  key: string;
  version: number;
  required: boolean;
  title: string;
  body: string;
  effectiveAt: string;
}
export interface ConsentDecision {
  key: string;
  version: number;
  granted: boolean;
}
export interface AuthMe {
  user: {
    id: string;
    providers: string[];
    consents: Record<
      string,
      {
        required: boolean;
        currentVersion: number;
        acceptedVersion: number | null;
        granted: boolean;
        decidedAt: string | null;
      }
    >;
  };
  consentUpdates: { key: string; version: number }[];
  session: { idleExpiresAt: string; absoluteExpiresAt: string };
}
const json = (method: string, body: unknown) => ({
  method,
  headers: { "X-Onboarding-Request": "1", "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export const getMe = () => request<AuthMe>("/api/auth/me", { method: "GET" });
export const getPending = () =>
  request<{ provider: "kakao"; documents: ConsentDocument[] }>("/api/auth/signup/pending", {
    method: "GET",
  });
export const getConsentDocuments = () =>
  request<{ documents: ConsentDocument[] }>("/api/auth/consent-documents", { method: "GET" });
export const signup = (consents: ConsentDecision[]) =>
  request<{ user: { id: string }; returnTo: string }>(
    "/api/auth/signup",
    json("POST", { consents }),
  );
export const putConsent = (consent: ConsentDecision) =>
  request<AuthMe>("/api/auth/consents", json("PUT", consent));
export const logout = (all = false) =>
  request<void>(`/api/auth/${all ? "logout-all" : "logout"}`, json("POST", {}));
export const deleteAccount = () => request<void>("/api/auth/account", json("DELETE", {}));
export const getRestorePending = () =>
  request<{ deletionScheduledAt: string }>("/api/auth/restore/pending", { method: "GET" });
export const restoreAccount = () =>
  request<{ user: { id: string }; returnTo: string }>("/api/auth/restore", json("POST", {}));
export function kakaoStartUrl(returnTo: string, reauth = false) {
  return `/api/auth/kakao/start?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}${reauth ? "&reauth=1" : ""}`;
}
export function startKakao(returnTo: string, reauth = false) {
  window.location.assign(kakaoStartUrl(returnTo, reauth));
}
export function authMessage(error: unknown): string {
  const code =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
  const messages: Record<string, string> = {
    OAUTH_DENIED: "카카오 로그인을 취소했어요. 다시 시작할 수 있어요.",
    OAUTH_STATE_INVALID: "로그인 시간이 초과됐거나 요청을 확인할 수 없어요. 다시 로그인해 주세요.",
    OAUTH_PROVIDER_ERROR: "카카오에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
    AUTH_PROVIDER_NOT_CONFIGURED: "카카오 로그인 연결이 아직 준비되지 않았어요.",
    ACCOUNT_UNAVAILABLE:
      "탈퇴 처리 중인 계정이라 지금은 로그인할 수 없어요. 복구 기간(30일)이 지난 계정은 복구할 수 없고, 삭제가 끝나면 새로 가입할 수 있어요.",
    LOGIN_FAILED: "로그인을 완료하지 못했어요. 다시 시도해 주세요.",
    SIGNUP_EXPIRED: "가입 시간이 만료됐어요. 카카오로 다시 로그인해 주세요.",
    CONSENT_REQUIRED: "필수 항목에 모두 동의해 주세요.",
    CONSENT_VERSION_MISMATCH: "동의 문서가 변경됐어요. 최신 문서를 확인하고 다시 동의해 주세요.",
    IDENTITY_ALREADY_LINKED: "이미 가입된 카카오 계정이에요. 로그인해 주세요.",
    REQUIRED_CONSENT_CANNOT_BE_WITHDRAWN: "필수 동의는 이 화면에서 철회할 수 없어요.",
    REAUTH_REQUIRED: "보안을 위해 카카오로 다시 로그인해 주세요.",
    AUTH_REQUIRED: "로그인이 필요해요.",
    RESTORE_EXPIRED: "복구할 수 있는 시간이 지났어요.",
  };
  return (
    messages[code] ??
    "서버에 연결할 수 없거나 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."
  );
}
