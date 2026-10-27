import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StylePager, type PagerGenre } from "@/components/onboarding/StylePager";

const genres: PagerGenre[] = [
  {
    id: "g1",
    name: "포멀",
    styles: [
      { id: "a", name: "스타일A", ready: true },
      { id: "b", name: "스타일B", ready: true },
      { id: "c", name: "스타일C", ready: false },
    ],
  },
  {
    id: "g2",
    name: "유러피안",
    styles: [
      { id: "d", name: "스타일D", ready: false },
      { id: "e", name: "스타일E", ready: true },
    ],
  },
];

// jsdom has no layout: give the pager, rows, tracks and cards real-looking sizes.
function layout(container: HTMLElement) {
  const pager = container.querySelector<HTMLElement>(".style-pager")!;
  Object.defineProperty(pager, "clientHeight", { value: 500, configurable: true });
  Array.from(pager.children).forEach((row, i) =>
    Object.defineProperty(row, "offsetTop", { value: i * 500, configurable: true }),
  );
  for (const track of Array.from(container.querySelectorAll<HTMLElement>(".style-track"))) {
    Object.defineProperty(track, "clientWidth", { value: 300, configurable: true });
    Array.from(track.children).forEach((card, i) => {
      Object.defineProperty(card, "offsetLeft", { value: 36 + i * 238, configurable: true });
      Object.defineProperty(card, "offsetWidth", { value: 228, configurable: true });
    });
  }
  return pager;
}

function renderPager(currentId = "a") {
  const onSelect = vi.fn();
  const view = render(
    <StylePager
      genres={genres}
      currentId={currentId}
      onSelect={onSelect}
      preview={() => undefined}
      renderCover={(id) => <div data-testid="cover">{id}</div>}
    />,
  );
  return { onSelect, pager: layout(view.container), ...view };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
afterEach(() => vi.useRealTimers());

describe("ONB-3D-001 스타일 카드 탐색", () => {
  it("장르마다 한 줄, 가운데(현재) 카드만 사진 조작을 갖고 나머지는 이름·준비 중만 보인다", () => {
    renderPager("a");
    const rows = screen.getAllByRole("region").filter((r) => r.tagName === "SECTION");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual([
      "포멀, 장르 1 / 2",
      "유러피안, 장르 2 / 2",
    ]);
    const current = screen.getByRole("listitem", { current: true });
    expect(current).toHaveAccessibleName("1 / 3: 스타일A");
    expect(within(current).getByTestId("cover")).toHaveTextContent("a");
    expect(screen.getAllByTestId("cover")).toHaveLength(1);
    expect(
      screen.getByRole("listitem", { name: "3 / 3: 스타일C, 사진 준비 중" }),
    ).toHaveTextContent("사진 준비 중");
  });

  it("옆 카드를 누르면 그 스타일을 보기만 하고(응답 없음) 현재 카드는 다시 고르지 않는다", async () => {
    const { onSelect } = renderPager("a");
    await userEvent.click(screen.getByRole("listitem", { name: "2 / 3: 스타일B" }));
    expect(onSelect).toHaveBeenCalledWith("b");
    await userEvent.click(screen.getByRole("listitem", { current: true }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("좌우로 밀어 멈춘 자리의 가운데 카드를 고른다", async () => {
    const { onSelect, container } = renderPager("a");
    await wait(900); // past the first positioning
    const track = container.querySelector<HTMLElement>(".style-track")!;
    track.scrollLeft = 238; // second card centred
    fireEvent.scroll(track);
    await wait(200);
    expect(onSelect).toHaveBeenLastCalledWith("b");
  });

  it("위아래로 밀어 다음 장르로 가면 그 장르의 첫 응답 가능한 스타일을 고른다", async () => {
    const { onSelect, pager } = renderPager("a");
    await wait(900);
    pager.scrollTop = 500;
    fireEvent.scroll(pager);
    await wait(200);
    expect(onSelect).toHaveBeenLastCalledWith("e");
  });

  it("앱이 현재 스타일을 옮기는 동안의 스크롤은 사용자 선택으로 보지 않는다", async () => {
    const { onSelect, rerender, container } = renderPager("a");
    await wait(900);
    rerender(
      <StylePager
        genres={genres}
        currentId="e"
        onSelect={onSelect}
        preview={() => undefined}
        renderCover={(id) => <div data-testid="cover">{id}</div>}
      />,
    );
    const track = container.querySelector<HTMLElement>(".style-track")!;
    fireEvent.scroll(track); // the programmatic scroll's own event, still on the old row
    await wait(200);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
