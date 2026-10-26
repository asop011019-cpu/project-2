import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignupPage, AccountPage } from "@/components/auth/AuthPages";
import * as api from "@/lib/auth-api";
import { ApiError } from "@/lib/onboarding-api";
vi.mock("@/components/auth/AuthShell", () => ({
  AuthShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock("@/lib/auth-api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getPending: vi.fn(),
  getMe: vi.fn(),
  getConsentDocuments: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
  deleteAccount: vi.fn(),
  startKakao: vi.fn(),
}));
const documents = [
  {
    key: "terms",
    version: "v2",
    required: true,
    title: "이용약관",
    body: "서버에서 받은 이용약관 본문",
    effectiveAt: "2026-10-26",
  },
  {
    key: "privacy_required",
    version: "v3",
    required: true,
    title: "개인정보 필수 동의",
    body: "서버 개인정보 본문",
    effectiveAt: "2026-10-26",
  },
  {
    key: "ai_analysis",
    version: "v1",
    required: false,
    title: "AI 분석",
    body: "외부 전송 동의 본문",
    effectiveAt: "2026-10-26",
  },
];
function mount(ui: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      {ui}
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
  vi.mocked(api.getPending).mockResolvedValue({ provider: "kakao", documents });
  vi.mocked(api.getConsentDocuments).mockResolvedValue({ documents });
  vi.mocked(api.getMe).mockResolvedValue({
    user: { id: "u1", providers: ["kakao"], consents: {} },
    consentUpdates: [],
    session: { idleExpiresAt: "", absoluteExpiresAt: "" },
  });
});
afterEach(cleanup);
describe("AUTH-003 screens", () => {
  it("deletion requiring reauth only navigates after user action", async () => {
    vi.mocked(api.deleteAccount).mockRejectedValue(
      new ApiError({ status: 401, code: "REAUTH_REQUIRED", message: "" }),
    );
    mount(<AccountPage />);
    fireEvent.click(await screen.findByRole("button", { name: "회원 탈퇴" }));
    fireEvent.click(screen.getByRole("button", { name: "탈퇴하기" }));
    const retry = await screen.findByRole("button", { name: "카카오로 다시 로그인" });
    expect(api.startKakao).not.toHaveBeenCalled();
    fireEvent.click(retry);
    expect(api.startKakao).toHaveBeenCalledWith("/account?confirmDelete=1", true);
  });
  it("required consents gate signup; optional remains false and server body is available", async () => {
    mount(<SignupPage />);
    const submit = await screen.findByRole("button", { name: "동의하고 가입하기" });
    expect(submit).toBeDisabled();
    fireEvent.click(await screen.findByRole("checkbox", { name: "필수 이용약관" }));
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "필수 개인정보 필수 동의" }));
    expect(submit).toBeEnabled();
    const bodyToggle = screen.getAllByText("본문 펼쳐 보기")[0];
    if (!bodyToggle) throw new Error("Missing document disclosure");
    fireEvent.click(bodyToggle);
    expect(screen.getByText("서버에서 받은 이용약관 본문")).toBeVisible();
    vi.mocked(api.signup).mockReturnValue(new Promise(() => {}));
    fireEvent.click(submit);
    await waitFor(() =>
      expect(vi.mocked(api.signup).mock.calls[0]?.[0]).toEqual([
        { key: "terms", version: "v2", granted: true },
        { key: "privacy_required", version: "v3", granted: true },
        { key: "ai_analysis", version: "v1", granted: false },
      ]),
    );
  });
  it("reauth return opens deletion confirmation without deleting automatically", async () => {
    window.history.replaceState({}, "", "/account?confirmDelete=1");
    mount(<AccountPage />);
    expect(await screen.findByRole("alertdialog")).toBeVisible();
    expect(api.deleteAccount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it("logout announces home navigation only after 204 success", async () => {
    vi.mocked(api.logout).mockResolvedValue();
    const done = vi.fn();
    window.addEventListener("auth-finished", done);
    mount(<AccountPage />);
    fireEvent.click(await screen.findByRole("button", { name: /^로그아웃$/ }));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(api.logout).toHaveBeenCalledWith(false, expect.anything());
    window.removeEventListener("auth-finished", done);
  });
});
