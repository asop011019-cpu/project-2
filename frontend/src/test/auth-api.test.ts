import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getMe,
  getPending,
  getConsentDocuments,
  signup,
  putConsent,
  logout,
  deleteAccount,
  startKakao,
  kakaoStartUrl,
  authMessage,
} from "@/lib/auth-api";
import { authErrorDestination, currentReturnTo, safeReturnTo } from "@/lib/auth-routing";
afterEach(() => vi.unstubAllGlobals());
describe("AUTH-003 API", () => {
  it("explains restore confirmation expiry without a restart prompt", () => {
    expect(authMessage("RESTORE_EXPIRED")).toBe("복구할 수 있는 시간이 지났어요.");
  });
  it("explains unavailable accounts and signup only after deletion", () => {
    expect(authMessage("ACCOUNT_UNAVAILABLE")).toBe(
      "탈퇴 처리 중인 계정이라 지금은 로그인할 수 없어요. 복구 기간(30일)이 지난 계정은 복구할 수 없고, 삭제가 끝나면 새로 가입할 수 있어요.",
    );
  });
  it("GETs include credentials without mutation header", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response("{}", { headers: { "Content-Type": "application/json" } })),
      );
    vi.stubGlobal("fetch", fetcher);
    await getMe();
    await getPending();
    await getConsentDocuments();
    for (const [, init] of fetcher.mock.calls) {
      expect(init.credentials).toBe("include");
      expect(init.method).toBe("GET");
      expect(init.headers).toBeUndefined();
    }
  });
  it("all mutations send the contract header, JSON and credentials", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response("{}", { headers: { "Content-Type": "application/json" } })),
      );
    vi.stubGlobal("fetch", fetcher);
    await signup([{ key: "terms", version: 1, granted: true }]);
    await putConsent({ key: "ai_analysis", version: 1, granted: false });
    await logout();
    await logout(true);
    await deleteAccount();
    expect(fetcher.mock.calls.map((c) => c[1].method)).toEqual([
      "POST",
      "PUT",
      "POST",
      "POST",
      "DELETE",
    ]);
    for (const [, init] of fetcher.mock.calls) {
      expect(init.credentials).toBe("include");
      expect(init.headers["X-Onboarding-Request"]).toBe("1");
    }
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body ?? "null")).toEqual({
      consents: [{ key: "terms", version: 1, granted: true }],
    });
    expect(fetcher.mock.calls[3]?.[0]).toBe("/api/auth/logout-all");
    expect(fetcher.mock.calls[4]?.[1].body).toBe("{}");
  });
  it("Kakao uses page navigation, never fetch", () => {
    const assign = vi.fn();
    const fetcher = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    vi.stubGlobal("fetch", fetcher);
    startKakao("/account?confirmDelete=1", true);
    expect(assign).toHaveBeenCalledWith(
      "/api/auth/kakao/start?returnTo=%2Faccount%3FconfirmDelete%3D1&reauth=1",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("AUTH_REQUIRED preserves returnTo, SESSION_REQUIRED does not redirect", () => {
    expect(authErrorDestination(401, "AUTH_REQUIRED", "/garment?draft=1")).toBe(
      "/login?returnTo=%2Fgarment%3Fdraft%3D1",
    );
    expect(authErrorDestination(401, "SESSION_REQUIRED", "/garment")).toBeNull();
  });
  it("403 consent updates preserve the original screen", () => {
    expect(authErrorDestination(403, "CONSENT_UPDATE_REQUIRED", "/?explore=1")).toBe(
      "/consent-update?returnTo=%2F%3Fexplore%3D1",
    );
  });
  it("external returnTo is rejected", () => {
    expect(safeReturnTo("//evil.example")).toBe("/");
    expect(safeReturnTo("/\\evil.example")).toBe("/");
    expect(kakaoStartUrl("https://evil.example")).toBe("/api/auth/kakao/start?returnTo=%2F");
  });
  it("real API auth errors emit navigation without retry or reset", async () => {
    const spy = vi.fn();
    window.addEventListener("auth-navigation", spy);
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "AUTH_REQUIRED", message: "" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(getMe()).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    window.removeEventListener("auth-navigation", spy);
  });
  it("a second auth error after reaching the login page keeps the original destination", () => {
    window.history.pushState({}, "", "/login?returnTo=%2Fconditions");
    expect(currentReturnTo()).toBe("/conditions");
    window.history.pushState({}, "", "/consent-update?returnTo=%2Fgarment");
    expect(currentReturnTo()).toBe("/garment");
    window.history.pushState({}, "", "/login?returnTo=%2F%2Fevil.example");
    expect(currentReturnTo()).toBe("/");
    window.history.pushState({}, "", "/conditions?x=1");
    expect(currentReturnTo()).toBe("/conditions?x=1");
    window.history.pushState({}, "", "/");
  });
});
