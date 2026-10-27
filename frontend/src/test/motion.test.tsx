import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatusButton, useSaveStatus } from "@/components/motion/StatusButton";
import { OutfitShowcase } from "@/components/showcase/OutfitShowcase";
import { IntroScreen } from "@/components/onboarding/IntroScreen";
import {
  DEV_SAMPLE_OUTFITS,
  purchaseTotal,
  safeShopUrl,
  type ShowcaseOutfit,
} from "@/lib/showcase";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const labels = { idle: "저장하기", pending: "저장 중…", success: "저장했어요", error: "다시 저장" };

function Harness() {
  const [state, setState] = useState<{
    status: "idle" | "pending" | "success" | "error";
    at: number;
  }>({ status: "idle", at: 0 });
  const shown = useSaveStatus(state.status, state.at, 1000);
  return (
    <>
      <StatusButton status={shown} labels={labels} onClick={() => undefined} />
      <button onClick={() => setState({ status: "pending", at: 1 })}>start</button>
      <button onClick={() => setState({ status: "success", at: 1 })}>ok</button>
      <button onClick={() => setState({ status: "pending", at: 2 })}>again</button>
      <button onClick={() => setState({ status: "error", at: 2 })}>fail</button>
    </>
  );
}

afterEach(() => vi.useRealTimers());

describe("MOT-001 저장 버튼 상태 전환", () => {
  it("성공은 응답 뒤에만 잠깐 보이고, 진행 중엔 다시 누를 수 없으며 실패도 같은 자리에서 알린다", () => {
    vi.useFakeTimers();
    render(<Harness />);
    const save = () =>
      screen.getByRole("button", { name: /저장하기|저장 중…|저장했어요|다시 저장/ });
    expect(save()).toHaveAccessibleName("저장하기");
    fireEvent.click(screen.getByText("start"));
    expect(save()).toHaveAccessibleName("저장 중…");
    expect(save()).toBeDisabled();
    expect(save()).toHaveAttribute("aria-busy", "true");
    fireEvent.click(screen.getByText("ok"));
    expect(save()).toHaveAccessibleName("저장했어요");
    act(() => vi.advanceTimersByTime(1000));
    expect(save()).toHaveAccessibleName("저장하기");
    fireEvent.click(screen.getByText("again"));
    fireEvent.click(screen.getByText("fail"));
    expect(save()).toHaveAccessibleName("다시 저장");
    expect(save()).toBeEnabled();
  });
});

describe("MOT-001 저장 버튼 연속 클릭", () => {
  it("같은 순간 두 번 눌러도 한 번만 보낸다", () => {
    const onClick = vi.fn();
    render(<StatusButton status="idle" labels={labels} onClick={onClick} />);
    const button = screen.getByRole("button", { name: "저장하기" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("MOT-001 코디 쇼케이스", () => {
  it("이전·다음 버튼과 화살표 키로 넘기고, 끝에서는 더 넘어가지 않는다", async () => {
    render(<OutfitShowcase outfits={DEV_SAMPLE_OUTFITS} />);
    const prev = screen.getByRole("button", { name: "이전 코디" });
    const next = screen.getByRole("button", { name: "다음 코디" });
    expect(prev).toBeDisabled();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    await userEvent.click(next);
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    const track = screen.getByRole("list", { name: /코디 목록/ });
    fireEvent.keyDown(track, { key: "ArrowRight" });
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(next).toBeDisabled();
    fireEvent.keyDown(track, { key: "ArrowRight" });
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    fireEvent.keyDown(track, { key: "ArrowLeft" });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: true })).toHaveAccessibleName(
      "2 / 3: 시험 코디 B",
    );
  });

  it("카드를 열면 구성·참고가·링크를 보여 주고, 기준 옷은 합계에서 뺀다", async () => {
    const outfit: ShowcaseOutfit = {
      id: "t",
      title: "테스트 코디",
      note: "테스트",
      items: [
        {
          id: "own",
          role: "기준 옷",
          name: "내 바지",
          owned: true,
          referencePriceKrw: 99_000,
          storeName: null,
          url: null,
          imageUrl: null,
          imageAlt: "",
        },
        {
          id: "top",
          role: "상의",
          name: "테스트 상의",
          owned: false,
          referencePriceKrw: 30_000,
          storeName: "테스트 판매처",
          url: "https://shop.example/item",
          imageUrl: null,
          imageAlt: "",
        },
        {
          id: "bad",
          role: "신발",
          name: "테스트 신발",
          owned: false,
          referencePriceKrw: 20_000,
          storeName: null,
          url: "javascript:alert(1)",
          imageUrl: null,
          imageAlt: "",
        },
      ],
    };
    render(<OutfitShowcase outfits={[outfit]} />);
    await userEvent.click(screen.getByRole("button", { name: "구성·참고가 보기" }));
    const sheet = await screen.findByRole("dialog", { name: "테스트 코디" });
    expect(within(sheet).getByText("구매 안 함")).toBeInTheDocument();
    expect(within(sheet).getByText(/50,000원/)).toBeInTheDocument();
    const link = within(sheet).getByRole("link", { name: /판매처에서 보기/ });
    expect(link).toHaveAttribute("href", "https://shop.example/item");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(sheet).getAllByRole("link")).toHaveLength(1);
    expect(within(sheet).getByText(/실제 판매가·재고와 다를 수 있어요/)).toBeInTheDocument();
  });

  it("참고가가 빠진 품목이 있으면 합계를 확정하지 않는다", () => {
    expect(purchaseTotal(DEV_SAMPLE_OUTFITS[2]!)).toEqual({ total: 30_000, complete: false });
    expect(purchaseTotal(DEV_SAMPLE_OUTFITS[0]!)).toEqual({ total: 30_000, complete: true });
    expect(safeShopUrl("ftp://x.example")).toBeNull();
    expect(safeShopUrl("not a url")).toBeNull();
  });

  it("시험 데이터에는 이미지·판매처 링크가 없다", () => {
    for (const outfit of DEV_SAMPLE_OUTFITS)
      for (const item of outfit.items) {
        expect(item.imageUrl).toBeNull();
        expect(item.url).toBeNull();
      }
  });
});

describe("MOT-001 인트로", () => {
  it("문구는 그대로이고 시작 버튼은 첫 화면부터 누를 수 있다", async () => {
    const onStart = vi.fn();
    render(<IntroScreen onStart={onStart} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName("입고 싶은 가능성");
    await userEvent.click(screen.getByRole("button", { name: "내 취향 찾기" }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
