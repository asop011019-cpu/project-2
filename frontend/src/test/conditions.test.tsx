import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/onboarding-api";
import { DRAFT_KEY, conditionHints, unansweredLabels, type Conditions } from "@/lib/conditions";

const api = vi.hoisted(() => ({ getConditions: vi.fn(), putConditions: vi.fn() }));
vi.mock("@/lib/conditions-api", () => api);
const wardrobe = vi.hoisted(() => ({ getRecommendationCheck: vi.fn() }));
vi.mock("@/lib/wardrobe-api", async (orig) => ({
  ...(await orig<typeof import("@/lib/wardrobe-api")>()),
  getRecommendationCheck: wardrobe.getRecommendationCheck,
}));

import { ConditionsScreen } from "@/components/conditions/ConditionsScreen";

const EMPTY: Conditions = {
  temperatureC: null,
  occasions: null,
  formality: null,
  additionalBudgetKrw: null,
  updatedAt: null,
};

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ConditionsScreen />
    </QueryClientProvider>,
  );
}
const status = (id: string) => screen.getByTestId(`${id}-status`);
const section = (name: string) => screen.getByRole("region", { name });
const saveBtn = () => screen.getByRole("button", { name: /조건 저장|저장 중/ });

afterEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe("코디 조건 화면", { timeout: 15_000 }, () => {
  it("한 번도 정하지 않았으면 기온 7~17°C·격식 50이 기본, 상황·예산은 '아직 안 정함', 저장 비활성", async () => {
    api.getConditions.mockResolvedValue(EMPTY);
    renderScreen();
    await screen.findByText("코디 조건", { selector: "h1" });
    await waitFor(() =>
      expect(screen.getByTestId("cond-temp-value")).toHaveTextContent("7°C ~ 17°C"),
    );
    expect(status("cond-temp")).toHaveTextContent("쌀쌀함 ~ 선선함");
    expect(status("cond-form")).toHaveTextContent("50, 중간");
    expect(screen.getByRole("slider", { name: "격식 정도" })).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
    for (const id of ["cond-occ", "cond-budget"])
      expect(status(id)).toHaveTextContent("아직 안 정함");
    expect(saveBtn()).toBeDisabled();
  });

  it("이전에 저장한 값(상관없음 포함)은 기본값으로 바뀌지 않고 그대로 보인다", async () => {
    api.getConditions.mockResolvedValue({
      temperatureC: { min: -3, max: 4 },
      occasions: null,
      formality: "any",
      additionalBudgetKrw: null,
      updatedAt: "2026-10-27T00:00:00Z",
    });
    renderScreen();
    await waitFor(() =>
      expect(screen.getByTestId("cond-temp-value")).toHaveTextContent("-3°C ~ 4°C"),
    );
    expect(status("cond-form")).toHaveTextContent("상관없음");
    expect(saveBtn()).toBeDisabled();
  });

  it("다른 항목만 저장해도 기본 기온·격식이 함께 저장된다", async () => {
    api.getConditions.mockResolvedValue(EMPTY);
    api.putConditions.mockImplementation(async (v) => ({
      ...v,
      updatedAt: "2026-10-27T00:00:00Z",
    }));
    renderScreen();
    await userEvent.click(
      within(await screen.findByRole("group", { name: "상황" })).getByRole("button", {
        name: "일상",
      }),
    );
    await userEvent.click(saveBtn());
    await waitFor(() => expect(api.putConditions).toHaveBeenCalledTimes(1));
    expect(api.putConditions.mock.calls[0]![0]).toEqual({
      temperatureC: { min: 7, max: 17 },
      occasions: ["daily"],
      formality: 50,
      additionalBudgetKrw: null,
    });
  });

  it("상관없음·선택·지우기가 PUT 본문에 null/'any'를 구분해 그대로 들어간다", async () => {
    api.getConditions.mockResolvedValue(EMPTY);
    api.putConditions.mockImplementation(async (v) => ({
      ...v,
      updatedAt: "2026-10-27T00:00:00Z",
    }));
    renderScreen();
    const temp = await screen.findByRole("region", { name: "기온" });
    await userEvent.click(within(temp).getByRole("button", { name: "상관없음" }));
    await userEvent.click(within(section("상황")).getByRole("button", { name: "출근·등교" }));
    const form = section("격식");
    // 상관없음 on and off again: back to the default, not to "not answered".
    await userEvent.click(within(form).getByRole("button", { name: "상관없음" }));
    await userEvent.click(within(form).getByRole("button", { name: "상관없음" }));
    await userEvent.click(
      within(section("추가 구매 예산")).getByRole("button", { name: "상한 없음" }),
    );
    await userEvent.click(saveBtn());
    await waitFor(() => expect(api.putConditions).toHaveBeenCalledTimes(1));
    expect(api.putConditions.mock.calls[0]![0]).toEqual({
      temperatureC: "any",
      occasions: ["work_school"],
      formality: 50,
      additionalBudgetKrw: "any",
    });
    expect(await screen.findByText("저장했어요")).toBeInTheDocument();
    expect(saveBtn()).toBeDisabled();
  });

  it("선택된 상황 칩을 다시 누르면 null로 돌아가 저장할 변경이 없다", async () => {
    api.getConditions.mockResolvedValue(EMPTY);
    renderScreen();
    const occ = await screen.findByRole("group", { name: "상황" });
    const chip = within(occ).getByRole("button", { name: "일상" });
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(saveBtn()).toBeEnabled();
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(saveBtn()).toBeDisabled();
  });

  it("기온 손잡이: 기본 7~17, 화살표 ±1, 교차 방지, aria-valuetext", async () => {
    api.getConditions.mockResolvedValue(EMPTY);
    renderScreen();
    const low = await screen.findByRole("slider", { name: "최저 기온" });
    const high = screen.getByRole("slider", { name: "최고 기온" });
    expect(low).toHaveAttribute("aria-valuetext", "7도, 쌀쌀함");
    fireEvent.keyDown(low, { key: "ArrowLeft" });
    fireEvent.keyDown(low, { key: "ArrowLeft" });
    expect(low).toHaveAttribute("aria-valuetext", "5도, 쌀쌀함");
    expect(screen.getByTestId("cond-temp-value")).toHaveTextContent("5°C ~ 17°C");
    expect(status("cond-temp")).toHaveTextContent("쌀쌀함 ~ 선선함");
    for (let i = 0; i < 20; i++) fireEvent.keyDown(high, { key: "ArrowLeft" });
    expect(high).toHaveAttribute("aria-valuenow", "5");
    fireEvent.keyDown(low, { key: "ArrowRight" });
    expect(low).toHaveAttribute("aria-valuenow", "5");
    fireEvent.keyDown(high, { key: "End" });
    expect(high).toHaveAttribute("aria-valuetext", "40도, 더움");
  });

  it("예산 직접 입력: 쉼표 표시·정수 전송·범위 밖 안내", async () => {
    api.getConditions.mockResolvedValue(EMPTY);
    api.putConditions.mockImplementation(async (v) => ({ ...v, updatedAt: "x" }));
    renderScreen();
    const budget = await screen.findByRole("region", { name: "추가 구매 예산" });
    await userEvent.click(within(budget).getByRole("button", { name: "직접 입력" }));
    const input = screen.getByLabelText("예산 금액");
    await userEvent.type(input, "5000001");
    expect(input).toHaveValue("5,000,001");
    expect(screen.getByText("0원~500만 원 사이로 입력해 주세요.")).toBeInTheDocument();
    expect(saveBtn()).toBeDisabled();
    // WARD-001: no 10,000 won minimum any more.
    await userEvent.clear(input);
    await userEvent.type(input, "5000");
    expect(status("cond-budget")).toHaveTextContent("5,000원");
    expect(saveBtn()).toBeEnabled();
    await userEvent.clear(input);
    await userEvent.type(input, "150000");
    expect(input).toHaveValue("150,000");
    expect(status("cond-budget")).toHaveTextContent("150,000원");
    await userEvent.click(saveBtn());
    await waitFor(() =>
      expect(api.putConditions.mock.calls[0]![0].additionalBudgetKrw).toBe(150000),
    );
  });

  it("저장 실패·SESSION_REQUIRED여도 입력이 유지되고 성공 표시가 없다", async () => {
    api.getConditions.mockResolvedValue(EMPTY);
    api.putConditions.mockRejectedValueOnce(
      new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "" }),
    );
    renderScreen();
    const occ = await screen.findByRole("group", { name: "상황" });
    await userEvent.click(within(occ).getByRole("button", { name: "야외활동" }));
    await userEvent.click(saveBtn());
    expect(await screen.findByText(/조건을 저장하지 못했어요/)).toBeInTheDocument();
    expect(within(occ).getByRole("button", { name: "야외활동" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByText("저장했어요")).not.toBeInTheDocument();
    api.putConditions.mockRejectedValueOnce(
      new ApiError({ status: 401, code: "SESSION_REQUIRED", message: "" }),
    );
    await userEvent.click(saveBtn());
    expect(await screen.findByText(/세션이 만료됐거나/)).toBeInTheDocument();
    expect(within(occ).getByRole("button", { name: "야외활동" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByText("저장했어요")).not.toBeInTheDocument();
  });

  it("AUTH_REQUIRED로 로그인 이동 직전 초안을 보관하고 재진입 시 복원한다", async () => {
    api.getConditions.mockResolvedValue(EMPTY);
    api.putConditions.mockImplementation(async () => {
      window.dispatchEvent(
        new CustomEvent("auth-navigation", { detail: "/login?returnTo=%2Fconditions" }),
      );
      throw new ApiError({ status: 401, code: "AUTH_REQUIRED", message: "" });
    });
    const first = renderScreen();
    const form = await screen.findByRole("region", { name: "격식" });
    await userEvent.click(within(form).getByRole("button", { name: "상관없음" }));
    await userEvent.click(saveBtn());
    await waitFor(() => expect(window.sessionStorage.getItem(DRAFT_KEY)).not.toBeNull());
    const stored = JSON.parse(window.sessionStorage.getItem(DRAFT_KEY)!);
    expect(stored).toEqual({
      temperatureC: { min: 7, max: 17 },
      occasions: null,
      formality: "any",
      additionalBudgetKrw: null,
    });
    first.unmount();

    renderScreen();
    expect(await screen.findByText("저장하지 않은 입력을 불러왔어요")).toBeInTheDocument();
    expect(status("cond-form")).toHaveTextContent("상관없음");
    expect(saveBtn()).toBeEnabled();
  });

  it("서버 값과 같으면 저장 버튼이 비활성이다", async () => {
    api.getConditions.mockResolvedValue({
      temperatureC: { min: 8, max: 20 },
      occasions: ["daily"],
      formality: 60,
      additionalBudgetKrw: 100000,
      updatedAt: "2026-10-27T00:00:00Z",
    });
    renderScreen();
    await waitFor(() =>
      expect(screen.getByTestId("cond-temp-value")).toHaveTextContent("8°C ~ 20°C"),
    );
    expect(screen.getByRole("slider", { name: "격식 정도" })).toHaveAttribute(
      "aria-valuetext",
      "60, 조금 격식",
    );
    expect(saveBtn()).toBeDisabled();
    const occ = screen.getByRole("group", { name: "상황" });
    await userEvent.click(within(occ).getByRole("button", { name: "일상" }));
    expect(saveBtn()).toBeEnabled();
    await userEvent.click(within(occ).getByRole("button", { name: "일상" }));
    expect(saveBtn()).toBeDisabled();
  });
});

describe("코디 조건 안내", { timeout: 15_000 }, () => {
  it("어긋난 조합은 안내만 하고 값과 저장은 그대로 둔다", () => {
    const base = { ...EMPTY };
    expect(conditionHints({ ...base, occasions: ["formal_event"], formality: 30 })).toEqual({
      formality: expect.stringContaining("격식 행사인데 격식을 낮게"),
    });
    expect(conditionHints({ ...base, occasions: ["formal_event"], formality: 40 })).toEqual({});
    expect(conditionHints({ ...base, occasions: ["outdoor"], formality: 80 }).formality).toContain(
      "야외활동인데 격식을 높게",
    );
    expect(conditionHints({ ...base, occasions: "any", formality: 0 })).toEqual({});
    expect(conditionHints({ ...base, temperatureC: { min: 5, max: 20 } }).temperatureC).toContain(
      "일교차가 15도",
    );
    expect(conditionHints({ ...base, temperatureC: { min: 6, max: 20 } })).toEqual({});
    expect(unansweredLabels({ ...base, formality: "any" })).toEqual([
      "기온",
      "상황",
      "추가 구매 예산",
    ]);
  });

  it("화면은 안내를 해당 칸에 보이고, 정하지 않은 항목을 저장 버튼 위에 알린다", async () => {
    api.getConditions.mockResolvedValue({
      ...EMPTY,
      occasions: ["formal_event"],
      formality: 20,
      updatedAt: "2026-10-27T00:00:00Z",
    });
    renderScreen();
    expect(
      await within(await screen.findByRole("region", { name: "격식" })).findByText(
        /격식 행사인데 격식을 낮게/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("cond-unanswered")).toHaveTextContent(
      "정하지 않은 항목(추가 구매 예산)은 조건 없이 추천해요",
    );
    await userEvent.click(within(section("격식")).getByRole("button", { name: "상관없음" }));
    expect(within(section("격식")).queryByText(/격식 행사인데/)).not.toBeInTheDocument();
  });

  describe("WARD-001 0원 예산", () => {
    const NOTICE =
      "추가 구매 없이 내 옷장에 등록한 옷으로만 코디를 제안해요. 필요한 옷이 부족하면 코디를 완성하지 못할 수 있어요.";

    it("0원 칩은 알림 후 [계속]이면 0원으로 저장하고, 저장할 때 다시 묻지 않는다", async () => {
      api.getConditions.mockResolvedValue(EMPTY);
      api.putConditions.mockImplementation(async (v) => ({ ...v, updatedAt: "x" }));
      wardrobe.getRecommendationCheck.mockResolvedValue({
        budgetMode: "owned_only",
        blockedReason: null,
        missing: [],
        wardrobeCount: 3,
      });
      renderScreen();
      const budget = await screen.findByRole("region", { name: "추가 구매 예산" });
      await userEvent.click(within(budget).getByRole("button", { name: "0원" }));
      const dialog = await screen.findByRole("alertdialog");
      expect(dialog).toHaveTextContent(NOTICE);
      await userEvent.click(within(dialog).getByRole("button", { name: "계속" }));
      expect(status("cond-budget")).toHaveTextContent("0원, 내 옷장 옷만");
      await userEvent.click(saveBtn());
      await waitFor(() => expect(api.putConditions.mock.calls[0]![0].additionalBudgetKrw).toBe(0));
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(await screen.findByText("내 옷장 옷 3벌로만 코디를 제안해요.")).toBeInTheDocument();
    });

    it("[금액 변경]은 0원을 풀고 직접 입력으로 보낸다", async () => {
      api.getConditions.mockResolvedValue(EMPTY);
      renderScreen();
      const budget = await screen.findByRole("region", { name: "추가 구매 예산" });
      await userEvent.click(within(budget).getByRole("button", { name: "0원" }));
      await userEvent.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", { name: "금액 변경" }),
      );
      expect(status("cond-budget")).toHaveTextContent("아직 안 정함");
      await waitFor(() => expect(screen.getByLabelText("예산 금액")).toHaveFocus());
    });

    it("직접 입력한 0은 글자마다 묻지 않고 입력란을 벗어날 때 한 번 묻는다", async () => {
      api.getConditions.mockResolvedValue(EMPTY);
      renderScreen();
      const budget = await screen.findByRole("region", { name: "추가 구매 예산" });
      await userEvent.click(within(budget).getByRole("button", { name: "직접 입력" }));
      const input = screen.getByLabelText("예산 금액");
      await userEvent.type(input, "000");
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      fireEvent.blur(input);
      const dialog = await screen.findByRole("alertdialog");
      await userEvent.click(within(dialog).getByRole("button", { name: "계속" }));
      expect(within(budget).getByRole("button", { name: "0원" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("저장된 0원을 불러올 때는 알림 없이, 빈 옷장이면 사진 등록·금액 변경을 안내한다", async () => {
      api.getConditions.mockResolvedValue({ ...EMPTY, additionalBudgetKrw: 0, updatedAt: "x" });
      wardrobe.getRecommendationCheck.mockResolvedValue({
        budgetMode: "owned_only",
        blockedReason: "WARDROBE_EMPTY",
        missing: ["top", "bottom"],
        wardrobeCount: 0,
      });
      const nav = vi.fn();
      const onNav = (e: Event) => nav((e as CustomEvent<string>).detail);
      window.addEventListener("auth-navigation", onNav);
      renderScreen();
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("0원 코디를 이용하려면 먼저 내 옷장에 옷을 등록해주세요.");
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      await userEvent.click(within(alert).getByRole("button", { name: "사진 등록" }));
      expect(nav).toHaveBeenCalledWith("/garment");
      await userEvent.click(within(alert).getByRole("button", { name: "금액 변경" }));
      expect(status("cond-budget")).toHaveTextContent("아직 안 정함");
      window.removeEventListener("auth-navigation", onNav);
    });

    it("옷이 부족하면 없는 종류를 알린다", async () => {
      api.getConditions.mockResolvedValue({ ...EMPTY, additionalBudgetKrw: 0, updatedAt: "x" });
      wardrobe.getRecommendationCheck.mockResolvedValue({
        budgetMode: "owned_only",
        blockedReason: "WARDROBE_INSUFFICIENT",
        missing: ["top"],
        wardrobeCount: 2,
      });
      renderScreen();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "내 옷장 옷만으로는 아직 코디를 완성할 수 없어요. 상의를 하나 이상 등록해 주세요.",
      );
    });
  });
});
