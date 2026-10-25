import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/onboarding-api";
import { genreGroupsFor, styleCountFor } from "@/lib/onboarding-catalog";
import type { CatalogView, SessionSummary, SessionView } from "@/lib/onboarding-session-api";
import { genreSectionsFrom } from "@/lib/onboarding-view";
import { routeTree } from "@/routeTree.gen";

const api = vi.hoisted(() => ({
  createSession: vi.fn(),
  getCatalog: vi.fn(),
  getStyle: vi.fn(),
  getSummary: vi.fn(),
  putCategory: vi.fn(),
  putImagePreference: vi.fn(),
  putStyleResponse: vi.fn(),
  putPosition: vi.fn(),
  completeSession: vi.fn(),
  resetOnboardingSession: vi.fn(),
}));
vi.mock("@/lib/onboarding-session-api", async (orig) => ({
  ...(await orig<typeof import("@/lib/onboarding-session-api")>()),
  ...api,
}));

import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";

function session(over: Partial<SessionView> = {}): SessionView {
  return {
    id: "s1",
    selectedCategoryId: "menswear",
    startedAt: "",
    updatedAt: "",
    expiresAt: "",
    completedAt: null,
    status: "in_progress",
    contentStatus: "ready",
    catalogVersion: 1,
    currentCatalogVersion: 1,
    catalogChanged: false,
    activeStyleOrder: ["a", "b"],
    styles: [
      {
        id: "a",
        name: "스타일A",
        genreGroupId: "g",
        order: 1,
        explorationOrder: 1,
        contentStatus: "ready",
      },
      {
        id: "b",
        name: "스타일B",
        genreGroupId: "g",
        order: 2,
        explorationOrder: 2,
        contentStatus: "ready",
      },
    ],
    currentStyleId: "a",
    progress: {
      currentIndex: 0,
      answeredCount: 0,
      totalCount: 2,
      originalTotalCount: 2,
      withdrawnCount: 0,
      allAnswered: false,
      canComplete: false,
    },
    navigation: { previousStyleId: null, nextStyleId: "b" },
    responses: [],
    imagePreferences: [],
    ...over,
  };
}

const emptyCatalog: CatalogView = {
  version: 1,
  contentStatus: "ready",
  categories: [],
  genreGroups: [],
  styles: [],
};

function renderScreen(onComplete = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <OnboardingScreen onComplete={onComplete} />
    </QueryClientProvider>,
  );
  return onComplete;
}

function setupOnline(s: SessionView) {
  api.createSession.mockResolvedValue(s);
  api.getCatalog.mockResolvedValue(emptyCatalog);
  api.getStyle.mockResolvedValue({ images: [] });
}

beforeEach(() =>
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: String(query).includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
);
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("분류", () => {
  it("남성복 5장르/24, 여성복 5장르/30", () => {
    expect(genreGroupsFor("menswear")).toHaveLength(5);
    expect(styleCountFor("menswear")).toBe(24);
    expect(genreGroupsFor("womenswear")).toHaveLength(5);
    expect(styleCountFor("womenswear")).toBe(30);
  });
  it("장르 이름은 정적 데이터에서도 계약 name 기준", () => {
    const men = genreSectionsFrom(null, "menswear").sections;
    const women = genreSectionsFrom(null, "womenswear").sections;
    expect(men.find((g) => g.id === "men_casual_group")?.name).toBe("아메리칸");
    expect(women.find((g) => g.id === "women_other_group")?.name).toBe("스트릿");
  });
  it("API 카탈로그가 있으면 API name을 그대로 사용", () => {
    const cat: CatalogView = {
      ...emptyCatalog,
      genreGroups: [
        {
          id: "men_casual_group",
          categoryId: "menswear",
          name: "API이름",
          description: "",
          order: 1,
          styleDefinitions: [],
          availableStyleCount: 0,
          contentStatus: "not_ready",
          representativeImage: null,
        },
      ],
    };
    const r = genreSectionsFrom(cat, "menswear");
    expect(r.source).toBe("api");
    expect(r.sections[0]?.name).toBe("API이름");
  });
});

describe("OnboardingScreen", () => {
  it("첫 화면은 범주 선택", async () => {
    api.createSession.mockResolvedValue(session({ selectedCategoryId: null }));
    renderScreen();
    expect(
      await screen.findByRole("heading", { name: "어떤 옷을 추천받을까요?" }),
    ).toBeInTheDocument();
  });

  it("401에서 자동 DELETE/POST 없음, 새로 시작 확인 후에만 호출", async () => {
    api.createSession.mockRejectedValue(
      new ApiError({ status: 401, code: "SESSION_REQUIRED", message: "" }),
    );
    api.resetOnboardingSession.mockResolvedValue(session({ selectedCategoryId: null }));
    renderScreen();
    expect(await screen.findByText(/이전 기록을 불러오지 못했어요/)).toBeInTheDocument();
    expect(api.createSession).toHaveBeenCalledTimes(1);
    expect(api.resetOnboardingSession).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "새로 시작" }));
    expect(api.resetOnboardingSession).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "새로 시작하기" }));
    await waitFor(() => expect(api.resetOnboardingSession).toHaveBeenCalledTimes(1));
  });

  it("not_ready(빈 activeStyleOrder)와 네트워크 실패는 다른 화면", async () => {
    setupOnline(session({ contentStatus: "not_ready", activeStyleOrder: [] }));
    renderScreen();
    expect(await screen.findByText("콘텐츠 준비 중")).toBeInTheDocument();
    expect(screen.queryByText(/서버에 연결할 수 없어요/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "좋아요" })).not.toBeInTheDocument();
  });

  it("네트워크 실패 시 미리보기 표시, 응답 버튼 없음", async () => {
    api.createSession.mockRejectedValue(
      new ApiError({ status: 0, code: "NETWORK_ERROR", message: "" }),
    );
    renderScreen();
    expect(await screen.findByText(/서버에 연결할 수 없어요/)).toBeInTheDocument();
    expect(screen.getAllByText("분류 미리보기 · 저장 연결 준비 중").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: /남성복/ }));
    expect(api.putCategory).not.toHaveBeenCalled();
    expect(screen.queryByText("콘텐츠 준비 중")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "좋아요" })).not.toBeInTheDocument();
  });

  it("세 응답 저장 요청 본문", async () => {
    setupOnline(session());
    api.putStyleResponse.mockImplementation((id: string, r: string) =>
      Promise.resolve(
        session({ responses: [{ styleId: id, response: r as "liked", updatedAt: "" }] }),
      ),
    );
    renderScreen();
    for (const [label, value] of [
      ["좋아요", "liked"],
      ["별로", "disliked"],
      ["건너뛰기", "skipped"],
    ] as const) {
      await userEvent.click(await screen.findByRole("button", { name: label }));
      await waitFor(() => expect(api.putStyleResponse.mock.calls.at(-1)?.[1]).toBe(value));
    }
    expect(api.putStyleResponse.mock.calls[0]).toEqual(["a", "liked", "b"]);
    expect(api.putStyleResponse.mock.calls[1]).toEqual(["b", "disliked", null]);
  });

  it("응답 저장 실패 시 상태 미반영", async () => {
    setupOnline(session());
    api.putStyleResponse.mockRejectedValue(
      new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "" }),
    );
    renderScreen();
    const like = await screen.findByRole("button", { name: "좋아요" });
    await userEvent.click(like);
    expect(await screen.findByText("저장에 실패했어요. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "좋아요" })).toHaveAttribute("aria-pressed", "false");
  });

  it("하트와 확대는 별개", async () => {
    setupOnline(session());
    api.getStyle.mockResolvedValue({
      images: [
        {
          id: "i1",
          styleId: "a",
          alt: "사진1",
          thumbnailUrl: "/t.jpg",
          originalUrl: "/o.jpg",
          isGenerated: false,
        },
      ],
    });
    api.putImagePreference.mockResolvedValue(
      session({
        imagePreferences: [{ styleId: "a", imageId: "i1", selected: true, updatedAt: "" }],
      }),
    );
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "이 사진 마음에 들어요" }));
    await waitFor(() => expect(api.putImagePreference).toHaveBeenCalledWith("a", "i1", true));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "사진1 크게 보기" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(api.putImagePreference).toHaveBeenCalledTimes(1);
  });

  it("canComplete=false면 완료 비활성, 성공 후에만 이동", async () => {
    const summary = (canComplete: boolean): SessionSummary => ({
      session: session({ progress: { ...session().progress, canComplete } }),
      likedStyles: [],
      dislikedStyles: [],
      skippedStyles: [],
      unansweredStyleIds: canComplete ? [] : ["b"],
      likedImages: [],
      isExploringOnly: false,
    });
    setupOnline(session());
    api.getSummary.mockResolvedValue(summary(false));
    const onComplete = renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "취향 확인하기" }));
    const done = await screen.findByRole("button", { name: /기준 하의 등록으로/ });
    await waitFor(() => expect(done).toBeDisabled());
    expect(screen.getByText(/응답하지 않은 스타일이 1개/)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("complete 실패 시 이동 안 하고 성공 시 이동", async () => {
    setupOnline(session());
    api.getSummary.mockResolvedValue({
      session: session({ progress: { ...session().progress, canComplete: true } }),
      likedStyles: [],
      dislikedStyles: [],
      skippedStyles: [],
      unansweredStyleIds: [],
      likedImages: [],
      isExploringOnly: false,
    });
    api.completeSession.mockRejectedValueOnce(
      new ApiError({ status: 500, code: "X", message: "" }),
    );
    api.completeSession.mockResolvedValueOnce(session({ status: "completed" }));
    const onComplete = renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "취향 확인하기" }));
    const done = await screen.findByRole("button", { name: /기준 하의 등록으로/ });
    await waitFor(() => expect(done).toBeEnabled());
    await userEvent.click(done);
    await screen.findByText("저장에 실패했어요. 다시 시도해 주세요.");
    expect(onComplete).not.toHaveBeenCalled();
    await userEvent.click(done);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});

describe("ONB-002-R1", () => {
  const catWithImage: CatalogView = {
    ...emptyCatalog,
    genreGroups: [
      {
        id: "g",
        categoryId: "menswear",
        name: "장르G",
        description: "",
        order: 1,
        styleDefinitions: [{ id: "a", name: "스타일A", order: 1, contentStatus: "ready" }],
        availableStyleCount: 1,
        contentStatus: "ready",
        representativeImage: {
          originalUrl: "/r.jpg",
          thumbnailUrl: "/rt.jpg",
          alt: "대표사진",
          width: 400,
          height: 300,
        },
      },
    ],
  };

  it("대표 이미지는 장르 영역에만, 스타일 프레임엔 없음", async () => {
    setupOnline(session());
    api.getCatalog.mockResolvedValue(catWithImage);
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: /장르G/ }));
    const imgs = await screen.findAllByAltText("대표사진");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]?.closest("[data-testid=genre-representative]")).not.toBeNull();
    expect(screen.getAllByText("스타일 사진 준비 중").length).toBeGreaterThan(0);
  });

  it("범주 버튼 이름 + Enter/Space 키보드 선택", async () => {
    api.createSession.mockRejectedValue(
      new ApiError({ status: 0, code: "NETWORK_ERROR", message: "" }),
    );
    renderScreen();
    const men = await screen.findByRole("button", { name: "남성복 선택, 24개 스타일" });
    expect(screen.getByRole("button", { name: "여성복 선택, 30개 스타일" })).toBeInTheDocument();
    men.focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "남성복의 장르" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "범주 바꾸기" }));
    screen.getByRole("button", { name: "여성복 선택, 30개 스타일" }).focus();
    await userEvent.keyboard(" ");
    expect(await screen.findByRole("heading", { name: "여성복의 장르" })).toBeInTheDocument();
  });

  it("다음 클릭: putPosition 본문, 성공 시에만 이동", async () => {
    setupOnline(session());
    api.putPosition.mockResolvedValue(session({ currentStyleId: "b" }));
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "다음 →" }));
    await waitFor(() => expect(api.putPosition).toHaveBeenCalledWith("b"));
    expect(await screen.findByRole("heading", { name: "스타일B" })).toBeInTheDocument();
  });

  it("이전 위치 실패 시 위치 유지·오류", async () => {
    setupOnline(session({ currentStyleId: "b" }));
    api.putPosition.mockRejectedValue(new ApiError({ status: 500, code: "X", message: "" }));
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "← 이전" }));
    expect(
      await screen.findByText("위치를 저장하지 못했어요. 다시 시도해 주세요."),
    ).toBeInTheDocument();
    expect(api.putPosition).toHaveBeenCalledWith("a");
    expect(screen.getByRole("heading", { name: "스타일B" })).toBeInTheDocument();
  });

  it("위치 저장 401 시 reset 미호출", async () => {
    setupOnline(session());
    api.putPosition.mockRejectedValue(
      new ApiError({ status: 401, code: "SESSION_REQUIRED", message: "" }),
    );
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "다음 →" }));
    expect(await screen.findByText(/이전 기록을 불러오지 못했어요/)).toBeInTheDocument();
    expect(api.resetOnboardingSession).not.toHaveBeenCalled();
    expect(api.createSession).toHaveBeenCalledTimes(1);
  });

  it("복원: currentStyleId 스타일 표시", async () => {
    setupOnline(session({ currentStyleId: "b" }));
    renderScreen();
    expect(await screen.findByRole("heading", { name: "스타일B" })).toBeInTheDocument();
  });

  it("알림 알약: 메시지 없으면 닫힘, 생기면 status로 표시", async () => {
    setupOnline(session());
    api.putStyleResponse.mockRejectedValue(
      new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "" }),
    );
    renderScreen();
    await screen.findByRole("heading", { name: "스타일A" });
    const idle = document.querySelector(".save-pill");
    expect(idle).not.toBeNull();
    expect(idle).not.toHaveClass("save-pill-open");
    expect(idle?.textContent).toBe("");
    await userEvent.click(await screen.findByRole("button", { name: "좋아요" }));
    const pill = await screen.findByText("저장에 실패했어요. 다시 시도해 주세요.");
    expect(pill).toHaveClass("save-pill-open");
    expect(pill).toHaveAttribute("role", "status");
    expect(pill).toHaveAttribute("aria-live", "polite");
  });
});

describe("라우팅", () => {
  it("/ 와 /garment 매칭", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/").at(-1)?.routeId).toBe("/");
    expect(router.matchRoutes("/garment").at(-1)?.routeId).toBe("/garment");
  });
});
