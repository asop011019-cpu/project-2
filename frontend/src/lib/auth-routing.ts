export function safeReturnTo(value: unknown, fallback = "/"): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    [...value].some((char) => char.charCodeAt(0) < 32)
  )
    return fallback;
  return value;
}
export function currentReturnTo() {
  return safeReturnTo(window.location.pathname + window.location.search);
}
export function authErrorDestination(status: number, code: string, returnTo: string) {
  const target =
    status === 401 && code === "AUTH_REQUIRED"
      ? "/login"
      : status === 403 && code === "CONSENT_UPDATE_REQUIRED"
        ? "/consent-update"
        : null;
  return target ? `${target}?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}` : null;
}
export function announceAuthError(status: number, code: string) {
  if (typeof window === "undefined") return;
  const destination = authErrorDestination(status, code, currentReturnTo());
  if (destination)
    window.dispatchEvent(new CustomEvent("auth-navigation", { detail: destination }));
}
