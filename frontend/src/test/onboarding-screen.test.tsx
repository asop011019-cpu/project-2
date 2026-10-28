import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  getSession: vi.fn(),
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
  api.getSession.mockResolvedValue(s);
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

  it("좋아요 응답 저장 요청 본문 (두 번 탭)", async () => {
    setupOnline(session());
    api.putStyleResponse.mockImplementation((id: string, r: string) =>
      Promise.resolve(
        session({ responses: [{ styleId: id, response: r as "liked", updatedAt: "" }] }),
      ),
    );
    renderScreen();
    await userEvent.dblClick(await screen.findByTestId("style-card-photo"));
    await waitFor(() => expect(api.putStyleResponse).toHaveBeenCalledTimes(1));
    expect(api.putStyleResponse.mock.calls[0]).toEqual(["a", "liked", undefined]);
  });

  it("응답 저장 실패 시 상태 미반영", async () => {
    setupOnline(session());
    api.putStyleResponse.mockRejectedValue(
      new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "" }),
    );
    renderScreen();
    await userEvent.dblClick(await screen.findByTestId("style-card-photo"));
    expect(await screen.findByText("저장에 실패했어요. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(screen.getByTestId("like-status")).toHaveAttribute("data-liked", "false");
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
        responses: [{ styleId: "a", response: "liked", updatedAt: "" }],
        imagePreferences: [{ styleId: "a", imageId: "i1", selected: true, updatedAt: "" }],
      }),
    );
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "이 사진 좋아요" }));
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
    const done = await screen.findByRole("button", { name: /사진 등록으로/ });
    await waitFor(() => expect(done).toBeDisabled());
    expect(screen.getByText(/응답하지 않은 스타일이 1개/)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("일부만 좋아요해도 취향 저장으로 넘어가되, 완료·응답 요청은 보내지 않는다", async () => {
    setupOnline(session());
    api.getSummary.mockResolvedValue({
      session: session({ progress: { ...session().progress, canComplete: false } }),
      likedStyles: [
        {
          id: "a",
          name: "스타일A",
          genreGroupId: "g1",
          order: 1,
          explorationOrder: 1,
          contentStatus: "ready",
        },
      ],
      dislikedStyles: [],
      skippedStyles: [],
      unansweredStyleIds: ["b"],
      likedImages: [],
      isExploringOnly: false,
    });
    const onComplete = renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "취향 확인하기" }));
    const done = await screen.findByRole("button", { name: "취향 저장하고 사진 등록으로" });
    await waitFor(() => expect(done).toBeEnabled());
    expect(screen.getByText(/좋아요한 스타일만 취향으로 반영해요/)).toBeInTheDocument();
    expect(screen.queryByText("별로")).not.toBeInTheDocument();
    expect(screen.queryByText("건너뜀")).not.toBeInTheDocument();
    expect(screen.getByText("남음")).toBeInTheDocument();
    await userEvent.click(done);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(api.completeSession).not.toHaveBeenCalled();
    expect(api.putStyleResponse).not.toHaveBeenCalled();
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
    const done = await screen.findByRole("button", { name: /사진 등록으로/ });
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
    // ONB-004: 현재 스타일의 장르는 자동으로 펼쳐진다
    const genre = await screen.findByRole("button", { name: /장르G/ });
    await waitFor(() => expect(genre).toHaveAttribute("aria-expanded", "true"));
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

  it("옆 카드 선택: putPosition 본문, 성공 시에만 이동", async () => {
    setupOnline(session());
    api.putPosition.mockResolvedValue(session({ currentStyleId: "b" }));
    renderScreen();
    await userEvent.click(await screen.findByRole("listitem", { name: /: 스타일B/ }));
    await waitFor(() => expect(api.putPosition).toHaveBeenCalledWith("b"));
    expect(await screen.findByRole("heading", { name: "스타일B" })).toBeInTheDocument();
  });

  it("이전 위치 실패 시 위치 유지·오류", async () => {
    setupOnline(session({ currentStyleId: "b" }));
    api.putPosition.mockRejectedValue(new ApiError({ status: 500, code: "X", message: "" }));
    renderScreen();
    await userEvent.click(await screen.findByRole("listitem", { name: /: 스타일A/ }));
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
    await userEvent.click(await screen.findByRole("listitem", { name: /: 스타일B/ }));
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
    await userEvent.dblClick(await screen.findByTestId("style-card-photo"));
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

describe("ONB-003", () => {
  const liked = (id: string) =>
    session({ responses: [{ styleId: id, response: "liked", updatedAt: "" }] });

  it("더블탭: putStyleResponse(styleId,'liked') nextStyleId 미전달, 위치 유지", async () => {
    setupOnline(session());
    api.putStyleResponse.mockResolvedValue(liked("a"));
    renderScreen();
    await screen.findByRole("heading", { name: "스타일A" });
    await userEvent.dblClick(screen.getByTestId("style-card-photo"));
    await waitFor(() => expect(api.putStyleResponse).toHaveBeenCalledTimes(1));
    expect(api.putStyleResponse.mock.calls[0]).toEqual(["a", "liked", undefined]);
    expect(await screen.findByText("좋아요한 스타일")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "스타일A" })).toBeInTheDocument();
  });

  it("단일 탭은 호출 없음", async () => {
    setupOnline(session());
    renderScreen();
    await screen.findByRole("heading", { name: "스타일A" });
    await userEvent.click(screen.getByTestId("style-card-photo"));
    expect(api.putStyleResponse).not.toHaveBeenCalled();
  });

  it("이미 liked면 더블탭 미호출", async () => {
    setupOnline(liked("a"));
    renderScreen();
    await screen.findByRole("heading", { name: "스타일A" });
    await userEvent.dblClick(screen.getByTestId("style-card-photo"));
    expect(api.putStyleResponse).not.toHaveBeenCalled();
  });

  it("더블탭 실패 시 상태 복원·알림", async () => {
    setupOnline(session());
    api.putStyleResponse.mockRejectedValue(new ApiError({ status: 500, code: "X", message: "" }));
    renderScreen();
    await screen.findByRole("heading", { name: "스타일A" });
    await userEvent.dblClick(screen.getByTestId("style-card-photo"));
    expect(await screen.findByText("저장에 실패했어요. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(screen.getByTestId("like-status")).toHaveAttribute("data-liked", "false");
    expect(screen.getByText("아직 좋아요 안 함")).toBeInTheDocument();
    expect(screen.queryByTestId("tap-heart")).not.toBeInTheDocument();
  });

  it("상단 하트는 현재 스타일 liked 상태 반영", async () => {
    setupOnline(liked("a"));
    renderScreen();
    await screen.findByRole("heading", { name: "스타일A" });
    expect(screen.getByTestId("like-status")).toHaveAttribute("data-liked", "true");
    expect(screen.queryByLabelText(/좋아요 \d+개/)).not.toBeInTheDocument();
  });

  it("뒤로 가기: 취향 확인 → 고르기 → 범주(응답 유지)", async () => {
    setupOnline(liked("a"));
    api.getSummary.mockResolvedValue({
      session: liked("a"),
      likedStyles: [],
      dislikedStyles: [],
      skippedStyles: [],
      unansweredStyleIds: [],
      likedImages: [],
      isExploringOnly: false,
    });
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "취향 확인하기" }));
    await screen.findByRole("heading", { name: "지금까지 고른 취향" });
    await userEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(await screen.findByRole("heading", { name: "스타일A" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(
      await screen.findByRole("heading", { name: "어떤 옷을 추천받을까요?" }),
    ).toBeInTheDocument();
    expect(api.resetOnboardingSession).not.toHaveBeenCalled();
    expect(api.putCategory).not.toHaveBeenCalled();
  });
});

describe("ONB-003-R1 사진 선호", () => {
  const images = ["i1", "i2"].map((id) => ({
    id,
    styleId: "a",
    categoryId: "menswear" as const,
    alt: id,
    thumbnailUrl: `/${id}.jpg`,
    originalUrl: `/${id}.jpg`,
    width: 400,
    height: 600,
    format: "model_outfit" as const,
    isGenerated: false,
    order: 1,
    sourceUrl: null,
    creator: null,
    usageStatus: "approved",
    publicationStatus: "published",
  }));
  function setup(s = session()) {
    setupOnline(s);
    api.getStyle.mockResolvedValue({ images });
    let saved = s;
    api.putImagePreference.mockImplementation(async (_style, imageId, selected) => {
      saved = { ...saved, imagePreferences: [{ styleId: "a", imageId, selected, updatedAt: "" }] };
      return saved;
    });
    api.putStyleResponse.mockImplementation(async () => {
      saved = { ...saved, responses: [{ styleId: "a", response: "liked", updatedAt: "" }] };
      return saved;
    });
    return renderScreen();
  }
  it("좋아요·별로 버튼 없이 맨 아래 건너뛰기, 추가 사진 묶음 없음", async () => {
    setup();
    await screen.findByRole("heading", { name: "스타일A" });
    expect(screen.queryByRole("button", { name: /^좋아요$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "별로" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("style-photo-i2")).not.toBeInTheDocument();
    const skip = screen.getByRole("button", { name: "건너뛰기" });
    const check = screen.getByRole("button", { name: "취향 확인하기" });
    expect(check.compareDocumentPosition(skip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("지운 이전·다음 줄, 응답·장르 카운터, 요약 넘김이 되살아나지 않는다", async () => {
    api.getSummary.mockResolvedValue({
      session: session({ progress: { ...session().progress, canComplete: true } }),
      likedStyles: [],
      dislikedStyles: [],
      skippedStyles: [],
      unansweredStyleIds: [],
      likedImages: [],
      isExploringOnly: false,
    });
    setup();
    await screen.findByRole("heading", { name: "스타일A" });
    expect(screen.queryByRole("button", { name: /이전$|^다음/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/응답 \d+ ?\/ ?\d+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^장르 \d+ \/ \d+$/)).not.toBeInTheDocument();
    expect(screen.queryByText("입고 싶은 가능성")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "취향 확인하기" }));
    await screen.findByRole("button", { name: "취향 저장하고 사진 등록으로" });
    expect(document.querySelector(".page-turn")).toBeNull();
  });
  it("건너뛰기는 자동 추천 안내 후 응답 저장 없이 다음 단계로, 계속 고르기는 그대로", async () => {
    const onComplete = setup();
    await screen.findByRole("heading", { name: "스타일A" });
    await userEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    const dialog = await screen.findByRole("alertdialog", { name: "취향 고르기를 건너뛸까요?" });
    expect(dialog).toHaveTextContent("자동으로 추천해 드릴게요");
    await userEvent.click(screen.getByRole("button", { name: "계속 고르기" }));
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "스타일A" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    await userEvent.click(await screen.findByRole("button", { name: "건너뛰고 사진 등록으로" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(api.putStyleResponse).not.toHaveBeenCalled();
    expect(api.completeSession).not.toHaveBeenCalled();
  });
  it("대표 사진 더블탭은 해당 사진+스타일 저장, 위치 유지", async () => {
    setup();
    await userEvent.dblClick(await screen.findByTestId("style-card-photo"));
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "이 사진 좋아요" })[0]).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(api.putImagePreference).toHaveBeenCalledWith("a", "i1", true);
    expect(api.putStyleResponse.mock.calls).toEqual([["a", "liked"]]);
    expect(screen.getByRole("heading", { name: "스타일A" })).toBeInTheDocument();
    expect(screen.getByTestId("like-status")).toHaveAttribute("data-liked", "true");
  });
  it("선호 사진은 스타일이 liked가 아니어도 더블탭 무시", async () => {
    setup(
      session({
        imagePreferences: [{ styleId: "a", imageId: "i1", selected: true, updatedAt: "" }],
      }),
    );
    await userEvent.dblClick(await screen.findByTestId("style-card-photo"));
    expect(api.putImagePreference).not.toHaveBeenCalled();
    expect(api.putStyleResponse).not.toHaveBeenCalled();
  });
  it("대표 사진 단일 탭은 저장·확대 없음", async () => {
    setup();
    await userEvent.click(await screen.findByTestId("style-card-photo"));
    expect(api.putImagePreference).not.toHaveBeenCalled();
    expect(api.putStyleResponse).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("하트 켜기는 liked 함께, 끄기는 사진만", async () => {
    setup();
    const heart = (await screen.findAllByRole("button", { name: "이 사진 좋아요" }))[0];
    if (!heart) throw new Error("missing photo heart");
    await userEvent.click(heart);
    await waitFor(() => expect(heart).toHaveAttribute("aria-pressed", "true"));
    expect(api.putStyleResponse.mock.calls).toEqual([["a", "liked"]]);
    api.putStyleResponse.mockClear();
    await userEvent.click(heart);
    await waitFor(() => expect(heart).toHaveAttribute("aria-pressed", "false"));
    expect(api.putImagePreference.mock.calls.at(-1)).toEqual(["a", "i1", false]);
    expect(api.putStyleResponse).not.toHaveBeenCalled();
    expect(screen.getByTestId("like-status")).toHaveAttribute("data-liked", "true");
  });
  it("liked 스타일 사진 켜기는 response 없음", async () => {
    setup(session({ responses: [{ styleId: "a", response: "liked", updatedAt: "" }] }));
    await userEvent.dblClick(await screen.findByTestId("style-card-photo"));
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "이 사진 좋아요" })[0]).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(api.putStyleResponse).not.toHaveBeenCalled();
  });
  it("사진 저장 실패 시 서버 상태 복원·알림", async () => {
    setup();
    api.putImagePreference.mockRejectedValue(new ApiError({ status: 500, code: "X", message: "" }));
    await userEvent.dblClick(await screen.findByTestId("style-card-photo"));
    await screen.findByText("저장에 실패했어요. 다시 시도해 주세요.");
    expect(screen.getAllByRole("button", { name: "이 사진 좋아요" })[0]).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(api.putStyleResponse).not.toHaveBeenCalled();
    expect(api.getSession).toHaveBeenCalledTimes(1);
  });
  it("스타일 저장 실패는 성공한 사진 저장을 서버 응답대로 보존", async () => {
    setup();
    const partial = session({
      imagePreferences: [{ styleId: "a", imageId: "i1", selected: true, updatedAt: "" }],
    });
    api.getSession.mockResolvedValue(partial);
    api.putStyleResponse.mockRejectedValue(new ApiError({ status: 500, code: "X", message: "" }));
    await userEvent.dblClick(await screen.findByTestId("style-card-photo"));
    await screen.findByText("저장에 실패했어요. 다시 시도해 주세요.");
    expect(screen.getAllByRole("button", { name: "이 사진 좋아요" })[0]).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("like-status")).toHaveAttribute("data-liked", "false");
  });
  it("두 요청 성공 전에는 확정하지 않으며 중복 탭 무시", async () => {
    setup();
    let finish: ((s: SessionView) => void) | undefined;
    api.putStyleResponse.mockImplementation(
      () =>
        new Promise<SessionView>((resolve) => {
          finish = resolve;
        }),
    );
    const photo = await screen.findByTestId("style-card-photo");
    await userEvent.dblClick(photo);
    await waitFor(() => expect(api.putStyleResponse).toHaveBeenCalledTimes(1));
    expect(screen.getAllByRole("button", { name: "이 사진 좋아요" })[0]).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await userEvent.dblClick(photo);
    expect(api.putImagePreference).toHaveBeenCalledTimes(1);
    finish?.(
      session({
        responses: [{ styleId: "a", response: "liked", updatedAt: "" }],
        imagePreferences: [{ styleId: "a", imageId: "i1", selected: true, updatedAt: "" }],
      }),
    );
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "이 사진 좋아요" })[0]).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });
  it("401은 재생성·자동 재조회 없음", async () => {
    setup();
    api.putStyleResponse.mockRejectedValue(
      new ApiError({ status: 401, code: "SESSION_REQUIRED", message: "" }),
    );
    await userEvent.dblClick(await screen.findByTestId("style-card-photo"));
    await screen.findByText(/이전 기록을 불러오지 못했어요/);
    expect(api.getSession).not.toHaveBeenCalled();
    expect(api.resetOnboardingSession).not.toHaveBeenCalled();
    expect(api.createSession).toHaveBeenCalledTimes(1);
  });
});

describe("ONB-003-R2 대표 사진 전신", () => {
  it("대표 사진은 서버 비율의 칸에 담기고, 이름은 사진 칸 밖에 있다", async () => {
    setupOnline(session());
    api.getStyle.mockResolvedValue({
      images: [
        {
          id: "i1",
          styleId: "a",
          alt: "전신",
          thumbnailUrl: "/t.jpg",
          originalUrl: "/o.jpg",
          width: 600,
          height: 800,
          isGenerated: false,
        },
      ],
    });
    renderScreen();
    const frame = await screen.findByTestId("style-card-frame");
    expect(frame.style.aspectRatio).toBe("600 / 800");
    expect(frame.querySelector("img")).toHaveAttribute("alt", "전신");
    expect(screen.getByTestId("style-card-photo").querySelector("h2")).toBeNull();
  });
});

describe("ONB-004 스타일 카드 직접 선택", () => {
  const catalog: CatalogView = {
    version: 1,
    contentStatus: "ready",
    categories: [],
    genreGroups: [
      {
        id: "g",
        categoryId: "menswear",
        name: "유러피안",
        description: "",
        order: 1,
        styleDefinitions: [
          { id: "a", name: "스타일A", order: 1 },
          { id: "b", name: "스타일B", order: 2 },
        ],
        representativeImage: null,
      },
      {
        id: "h",
        categoryId: "menswear",
        name: "아메리칸",
        description: "",
        order: 2,
        styleDefinitions: [{ id: "c", name: "스타일C", order: 1 }],
        representativeImage: null,
      },
    ],
    styles: [],
  } as unknown as CatalogView;
  const base = () =>
    session({
      activeStyleOrder: ["a", "b", "c"],
      styles: [
        ...session().styles,
        {
          id: "c",
          name: "스타일C",
          genreGroupId: "h",
          order: 3,
          explorationOrder: 3,
          contentStatus: "ready",
        },
      ],
      responses: [{ styleId: "b", response: "skipped", updatedAt: "" }],
    });
  const GENRE: Record<string, RegExp> = { a: /유러피안/, b: /유러피안/, c: /아메리칸/ };
  async function pick(id: string) {
    const g = screen.getByRole("button", { name: GENRE[id]! });
    if (g.getAttribute("aria-expanded") !== "true") await userEvent.click(g);
    await userEvent.click(
      screen.getByRole("button", { name: `스타일${id.toUpperCase()} 스타일 보기` }),
    );
  }
  function setup(s = base()) {
    setupOnline(s);
    api.getCatalog.mockResolvedValue(catalog);
    renderScreen();
  }

  it("같은 장르 카드 선택: putPosition만 호출, 응답 요청 없음", async () => {
    api.putPosition.mockResolvedValue(base());
    api.putPosition.mockResolvedValueOnce({ ...base(), currentStyleId: "b" });
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "스타일B 스타일 보기" }));
    expect(await screen.findByRole("heading", { name: "스타일B" })).toBeInTheDocument();
    expect(api.putPosition).toHaveBeenCalledWith("b");
    expect(api.putStyleResponse).not.toHaveBeenCalled();
    expect(api.putImagePreference).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "스타일B 스타일 보기" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("다른 장르 카드 선택(키보드 Enter): 해당 장르 펼침·강조", async () => {
    api.putPosition.mockResolvedValue({ ...base(), currentStyleId: "c" });
    setup();
    await userEvent.click(await screen.findByRole("button", { name: /아메리칸/ }));
    screen.getByRole("button", { name: "스타일C 스타일 보기" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "스타일C" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /아메리칸/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("새로고침 복원: currentStyleId의 장르가 펼쳐지고 카드 강조", async () => {
    setup({ ...base(), currentStyleId: "c" });
    expect(await screen.findByRole("heading", { name: "스타일C" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "스타일C 스타일 보기" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("실패 시 위치 유지·재시도", async () => {
    api.putPosition.mockRejectedValueOnce(new ApiError({ status: 500, code: "X", message: "" }));
    api.putPosition.mockResolvedValueOnce({ ...base(), currentStyleId: "b" });
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "스타일B 스타일 보기" }));
    expect(
      await screen.findByText("위치를 저장하지 못했어요. 다시 시도해 주세요."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "스타일A" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("heading", { name: "스타일B" })).toBeInTheDocument();
  });

  it("401: reset 미호출", async () => {
    api.putPosition.mockRejectedValue(
      new ApiError({ status: 401, code: "SESSION_REQUIRED", message: "" }),
    );
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "스타일B 스타일 보기" }));
    expect(await screen.findByText(/이전 기록을 불러오지 못했어요/)).toBeInTheDocument();
    expect(api.resetOnboardingSession).not.toHaveBeenCalled();
  });

  // 실제 쓰기를 모사: 서버 저장 위치는 요청이 "처리될 때" 바뀌고, 응답은 수동으로 지연 해제한다.
  function serverSim() {
    const srv = { pos: "a", calls: [] as string[], inflight: 0, maxInflight: 0 };
    const pending: (() => void)[] = [];
    api.putPosition.mockImplementation(
      (id: string) =>
        new Promise<SessionView>((resolve) => {
          srv.calls.push(id);
          srv.inflight++;
          srv.maxInflight = Math.max(srv.maxInflight, srv.inflight);
          pending.push(() => {
            srv.pos = id;
            srv.inflight--;
            resolve({ ...base(), currentStyleId: id });
          });
        }),
    );
    const flush = async () => {
      for (let i = 0; i < 10 && pending.length; i++) {
        pending.shift()?.();
        await new Promise((r) => setTimeout(r, 10));
      }
    };
    return { srv, flush };
  }

  it.each([
    [["b", "c"], "c", "스타일C"],
    [["b", "c", "b"], "b", "스타일B"],
  ])("빠른 연속 선택 %j: 한 번에 하나, 서버 최종 위치=화면", async (seq, finalId, finalName) => {
    const { srv, flush } = serverSim();
    setup();
    await screen.findByRole("heading", { name: "스타일A" });
    for (const id of seq) await pick(id);
    await flush();
    expect(srv.maxInflight).toBe(1);
    expect(srv.pos).toBe(finalId);
    expect(await screen.findByRole("heading", { name: finalName })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${finalName} 스타일 보기` })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(api.putStyleResponse).not.toHaveBeenCalled();
  });

  it("대기열 중 실패: 대기 의도 폐기·자동 재시도 없음", async () => {
    let fail: () => void = () => {};
    api.putPosition.mockImplementation(
      () =>
        new Promise<SessionView>((_, reject) => {
          fail = () => reject(new ApiError({ status: 500, code: "X", message: "" }));
        }),
    );
    setup();
    await screen.findByRole("heading", { name: "스타일A" });
    await pick("b");
    await pick("c");
    fail();
    expect(
      await screen.findByText("위치를 저장하지 못했어요. 다시 시도해 주세요."),
    ).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 30));
    expect(api.putPosition).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "스타일A" })).toBeInTheDocument();
  });

  it("order 밖(콘텐츠 미준비) 카드: 읽기 전용 상세, 요청 0, 준비된 카드로 복귀", async () => {
    const extra = {
      ...catalog,
      genreGroups: [
        ...catalog.genreGroups,
        {
          id: "k",
          categoryId: "menswear",
          name: "준비중장르",
          description: "준비 설명",
          order: 3,
          styleDefinitions: [{ id: "z", name: "스타일Z", order: 1 }],
          representativeImage: null,
        },
      ],
    } as unknown as CatalogView;
    setupOnline(base());
    api.getCatalog.mockResolvedValue(extra);
    api.putPosition.mockResolvedValue({ ...base(), currentStyleId: "b" });
    renderScreen();
    await screen.findByRole("heading", { name: "스타일A" });
    await userEvent.click(screen.getByRole("button", { name: /준비중장르/ }));
    const z = screen.getByRole("button", { name: "스타일Z 스타일 보기" });
    z.focus();
    await userEvent.keyboard("{Enter}");
    const detail = await screen.findByTestId("browse-detail");
    expect(detail).toHaveTextContent("스타일Z");
    expect(detail).toHaveTextContent("준비 설명");
    expect(detail).toHaveTextContent("사진 준비 중");
    expect(z).toHaveAttribute("aria-current", "true");
    expect(api.putPosition).not.toHaveBeenCalled();
    expect(api.putStyleResponse).not.toHaveBeenCalled();
    expect(api.putImagePreference).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /유러피안/ }));
    await userEvent.click(screen.getByRole("button", { name: "스타일A 스타일 보기" }));
    expect(await screen.findByRole("heading", { name: "스타일A" })).toBeInTheDocument();
    expect(screen.queryByTestId("browse-detail")).not.toBeInTheDocument();
    expect(api.putPosition).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "스타일B 스타일 보기" }));
    expect(await screen.findByRole("heading", { name: "스타일B" })).toBeInTheDocument();
    expect(api.putPosition).toHaveBeenCalledWith("b");
  });

  it("사진 0장 ready 카드: 정상 상세 + 사진 준비 중", async () => {
    api.putPosition.mockResolvedValue({ ...base(), currentStyleId: "b" });
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "스타일B 스타일 보기" }));
    expect(await screen.findByRole("heading", { name: "스타일B" })).toBeInTheDocument();
    expect(screen.getAllByText("사진 준비 중").length).toBeGreaterThan(0);
  });

  it("서버 미연결: 카드 클릭은 읽기 전용 상세, 요청 0", async () => {
    api.createSession.mockRejectedValue(
      new ApiError({ status: 0, code: "NETWORK_ERROR", message: "" }),
    );
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "남성복 선택, 24개 스타일" }));
    await screen.findByRole("heading", { name: "남성복의 장르" });
    const genres = genreGroupsFor("menswear");
    const g = genres[2]!;
    await userEvent.click(screen.getByRole("button", { name: new RegExp(g.name) }));
    const first = screen.getAllByRole("button", { name: / 스타일 보기$/ })[0]!;
    const name = (first.getAttribute("aria-label") ?? "").replace(" 스타일 보기", "");
    await userEvent.click(first);
    expect(await screen.findByTestId("browse-detail")).toHaveTextContent(name);
    expect(api.putPosition).not.toHaveBeenCalled();
    expect(api.putStyleResponse).not.toHaveBeenCalled();
  });
});
