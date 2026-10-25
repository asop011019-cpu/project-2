import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INTRO_IMAGES, robotsText, sitemapXml } from "@/lib/site";
import { swipeResponse } from "@/lib/swipe";
import { routeTree } from "@/routeTree.gen";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
const api = vi.hoisted(() => ({
  createSession: vi.fn().mockRejectedValue(new Error("unreachable")),
}));
vi.mock("@/lib/onboarding-session-api", async (orig) => ({
  ...(await orig<typeof import("@/lib/onboarding-session-api")>()),
  ...api,
}));
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OnboardingScreen showIntro onComplete={vi.fn()} />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  vi.restoreAllMocks();
});
describe("DES-002", () => {
  it("intro chooses one of the supplied male/female model images after mount", async () => {
    mount();
    const photo = await screen.findByRole("img");
    expect(INTRO_IMAGES.map((i) => i.src)).toContain(photo.getAttribute("src"));
    expect(INTRO_IMAGES.map((i) => i.alt)).toContain(photo.getAttribute("alt"));
  });
  it("intro CTA moves to category with a curtain", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "내 취향 찾기" }));
    expect(screen.getByTestId("curtain")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "남성복 선택, 24개 스타일" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("curtain")).not.toBeInTheDocument());
  });
  it("reduced motion moves immediately without a curtain", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    mount();
    await userEvent.click(screen.getByRole("button", { name: "내 취향 찾기" }));
    expect(screen.queryByTestId("curtain")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "여성복 선택, 30개 스타일" }),
    ).toBeInTheDocument();
  });
  it("right beyond 90px means liked", () => expect(swipeResponse(91, 0)).toBe("liked"));
  it("left beyond 90px means disliked", () => expect(swipeResponse(-91, 0)).toBe("disliked"));
  it("up beyond 90px means skipped", () => expect(swipeResponse(0, -91)).toBe("skipped"));
  it("90px boundary and downward drag do not respond", () => {
    expect(swipeResponse(90, -90)).toBeNull();
    expect(swipeResponse(-90, 100)).toBeNull();
  });
  it("empty SITE_URL emits no sitemap directive", () => {
    expect(robotsText("", false)).not.toContain("Sitemap:");
    expect(robotsText("", false)).toContain("Allow: /");
  });
  it("empty SITE_URL does not invent a sitemap", () => expect(sitemapXml("")).toBeNull());
  it("configured sitemap includes real route URLs", () => {
    expect(sitemapXml("https://example.org")).toContain("<loc>https://example.org/privacy</loc>");
    expect(robotsText("https://example.org", false)).toContain(
      "Sitemap: https://example.org/sitemap.xml",
    );
  });
  it("preview crawler setting blocks indexing", () =>
    expect(robotsText("", true)).toContain("Disallow: /"));
  it("unknown route invokes root not-found handling and privacy is a leaf", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/not-a-page").at(-1)?.routeId).toBe("/$");
    expect(router.routesById["__root__"]?.options.notFoundComponent).toBeTypeOf("function");
    expect(router.matchRoutes("/privacy").at(-1)?.routeId).toBe("/privacy");
  });
  it("ONB-003 뒤로 가기: 범주 → 인트로, 인트로엔 버튼 없음", async () => {
    mount();
    expect(screen.queryByRole("button", { name: "뒤로 가기" })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "내 취향 찾기" }));
    await screen.findByRole("heading", { name: "어떤 옷을 추천받을까요?" });
    await waitFor(() => expect(screen.queryByTestId("curtain")).not.toBeInTheDocument());
    await userEvent.click(await screen.findByRole("button", { name: "뒤로 가기" }));
    expect(await screen.findByRole("button", { name: "내 취향 찾기" })).toBeInTheDocument();
  });
});
