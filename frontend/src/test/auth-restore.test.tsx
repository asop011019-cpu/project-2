import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RestorePage, AccountPage } from "@/components/auth/AuthPages";
import * as api from "@/lib/auth-api";
import { ApiError } from "@/lib/onboarding-api";
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/components/auth/AuthShell", () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/lib/auth-api", async (orig) => ({
  ...(await orig<typeof api>()),
  getRestorePending: vi.fn(),
  restoreAccount: vi.fn(),
  startKakao: vi.fn(),
  getMe: vi.fn(),
  getConsentDocuments: vi.fn(),
}));
const mount = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );
const nav = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  window.addEventListener("auth-navigation", nav);
  vi.mocked(api.getRestorePending).mockResolvedValue({
    deletionScheduledAt: "2026-11-26T08:02:14.607Z",
  });
});
afterEach(() => {
  window.removeEventListener("auth-navigation", nav);
  cleanup();
});
const target = () => (nav.mock.calls.at(-1)?.[0] as CustomEvent).detail;
describe("AUTH-004-R2 restore", () => {
  it("shows Korean deadline and restores to returnTo", async () => {
    vi.mocked(api.restoreAccount).mockResolvedValue({ user: { id: "u" }, returnTo: "/garment" });
    mount(<RestorePage />);
    expect(
      await screen.findByText(/2026년 11월 26일 오후 5:02\(한국 시간\)까지 기존 계정을 복구할 수/),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "탈퇴 취소하고 복구하기" }));
    await waitFor(() => expect(target()).toBe("/garment"));
  });
  it("declining goes to intro without POST", async () => {
    mount(<RestorePage />);
    fireEvent.click(await screen.findByRole("button", { name: "복구하지 않기" }));
    expect(target()).toBe("/");
    expect(api.restoreAccount).not.toHaveBeenCalled();
  });
  it("410 explains the confirmation expiry and offers only home navigation", async () => {
    vi.mocked(api.getRestorePending).mockRejectedValue(
      new ApiError({ status: 410, code: "RESTORE_EXPIRED", message: "" }),
    );
    mount(<RestorePage />);
    expect(await screen.findByText(/복구 화면은 로그인 후 10분 동안만 열려 있어요/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "카카오로 다시 시작" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "처음으로" }));
    expect(target()).toBe("/");
    expect(api.startKakao).not.toHaveBeenCalled();
    expect(api.restoreAccount).not.toHaveBeenCalled();
  });
  it("deletion dialog explains 30-day grace", async () => {
    vi.mocked(api.getMe).mockResolvedValue({
      user: { id: "u", providers: ["kakao"], consents: {} },
      consentUpdates: [],
      session: { idleExpiresAt: "", absoluteExpiresAt: "" },
    });
    vi.mocked(api.getConsentDocuments).mockResolvedValue({ documents: [] });
    mount(<AccountPage />);
    fireEvent.click(await screen.findByRole("button", { name: "회원 탈퇴" }));
    expect(await screen.findByText(/30일 동안 보관돼요/)).toBeVisible();
  });
});
