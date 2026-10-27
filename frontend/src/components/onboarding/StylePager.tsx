import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import type { StyleImage } from "@/lib/onboarding-session-api";

export interface PagerGenre {
  id: string;
  name: string;
  /** ready: has published photos and can be answered; the rest show "사진 준비 중". */
  styles: { id: string; name: string; ready: boolean }[];
}

const SETTLE_MS = 140;
const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Style browsing (ONB-3D-001): genres stack vertically and snap one at a time when the user slides
 * up or down; inside a genre its styles sit side by side and snap one at a time when slid left or
 * right. The card in the middle faces forward at full size, its neighbours turn slightly away and
 * shrink. Only the settled position selects a style (as a viewing position); nothing here answers
 * like, dislike or skip.
 */
export function StylePager({
  genres,
  currentId,
  busy,
  onSelect,
  renderCover,
  preview,
}: {
  genres: PagerGenre[];
  currentId: string | null;
  /** A save is in flight; a slide made meanwhile is either applied after it or undone. */
  busy: boolean;
  onSelect: (id: string) => void;
  /** The interactive photo (heart, zoom, double tap) for the current, answerable card. */
  renderCover: (id: string) => ReactNode;
  /** A photo already loaded for a style, to show on neighbouring cards. */
  preview: (id: string) => StyleImage | undefined;
}) {
  const pagerRef = useRef<HTMLDivElement>(null);
  const tracks = useRef(new Map<string, HTMLUListElement>());
  const lastInGenre = useRef(new Map<string, string>());
  const settle = useRef<number>(0);
  const frame = useRef(0);
  // While the view scrolls to a position the app chose, its scroll events are not user choices.
  const steerUntil = useRef(0);
  // The style the user last slid to, until the app has taken it (or turned it down).
  const requested = useRef<string | null>(null);
  // Same genres and styles, even if the array is new on every render.
  const genreKey = genres
    .map((g) => `${g.id}:${g.styles.map((st) => `${st.id}${st.ready ? "+" : "-"}`).join(",")}`)
    .join("|");

  const genreOf = (id: string | null) =>
    id ? genres.findIndex((g) => g.styles.some((s) => s.id === id)) : -1;
  const currentGenre = Math.max(0, genreOf(currentId));

  const applyDepth = useCallback((track: HTMLUListElement) => {
    const flat = reducedMotion();
    const middle = track.scrollLeft + track.clientWidth / 2;
    for (const child of Array.from(track.children)) {
      const card = child as HTMLElement;
      const d = (card.offsetLeft + card.offsetWidth / 2 - middle) / Math.max(1, card.offsetWidth);
      const near = Math.min(1, Math.abs(d));
      card.style.transform = flat
        ? ""
        : `perspective(1100px) rotateY(${(-Math.max(-1, Math.min(1, d)) * 26).toFixed(2)}deg) scale(${(1 - near * 0.14).toFixed(3)})`;
      card.style.opacity = flat ? "" : (1 - near * 0.4).toFixed(3);
      // Neighbours shrink toward the middle card, so their near edge stays in view.
      card.style.transformOrigin = flat ? "" : d > 0 ? "left center" : d < 0 ? "right center" : "";
    }
  }, []);

  const centreOf = (track: HTMLUListElement) => {
    const middle = track.scrollLeft + track.clientWidth / 2;
    let best: HTMLElement | null = null;
    let distance = Infinity;
    for (const child of Array.from(track.children)) {
      const card = child as HTMLElement;
      const d = Math.abs(card.offsetLeft + card.offsetWidth / 2 - middle);
      if (d < distance) {
        distance = d;
        best = card;
      }
    }
    return best?.dataset["styleId"] ?? null;
  };

  const scrollToCard = (genreIndex: number, id: string, smooth: boolean) => {
    const pager = pagerRef.current;
    const genre = genres[genreIndex];
    if (!pager || !genre) return;
    const row = pager.children[genreIndex] as HTMLElement | undefined;
    const behavior: ScrollBehavior = smooth && !reducedMotion() ? "smooth" : "auto";
    if (row) pager.scrollTo?.({ top: row.offsetTop, behavior });
    const track = tracks.current.get(genre.id);
    const card = Array.from(track?.children ?? []).find(
      (child) => (child as HTMLElement).dataset["styleId"] === id,
    ) as HTMLElement | undefined;
    if (track && card)
      track.scrollTo?.({
        left: card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2,
        behavior,
      });
  };

  const afterSettle = (run: () => void) => {
    window.clearTimeout(settle.current);
    // Checked again once the app's own scroll is over, so a user scroll in that window still counts.
    const check = () => {
      const wait = steerUntil.current - Date.now();
      if (wait > 0) settle.current = window.setTimeout(check, wait);
      else run();
    };
    settle.current = window.setTimeout(check, SETTLE_MS);
  };

  // Follow the app's current style (a list pick, the previous/next buttons, or the next style
  // after an answer), so the card in the middle always matches the name, text and photos shown.
  // A slide the app did not take (a failed or ignored save) is undone, so the middle card never
  // shows a style other than the current one.
  useLayoutEffect(() => {
    if (!currentId) return;
    if (requested.current && busy) return;
    requested.current = null;
    const gi = genreOf(currentId);
    if (gi < 0) return;
    lastInGenre.current.set(genres[gi]!.id, currentId);
    const track = tracks.current.get(genres[gi]!.id);
    const pager = pagerRef.current;
    const row = pager?.children[gi] as HTMLElement | undefined;
    const onRow = !pager || !row || Math.abs(pager.scrollTop - row.offsetTop) < 2;
    if (onRow && track && centreOf(track) === currentId) return;
    steerUntil.current = Date.now() + 800;
    window.clearTimeout(settle.current);
    scrollToCard(gi, currentId, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, genreKey, busy]);

  useEffect(() => {
    tracks.current.forEach(applyDepth);
  }, [applyDepth, genreKey]);
  useEffect(
    () => () => {
      window.clearTimeout(settle.current);
      cancelAnimationFrame(frame.current);
    },
    [],
  );

  const choose = (id: string) => {
    requested.current = id;
    onSelect(id);
  };

  const onPagerScroll = () =>
    afterSettle(() => {
      const pager = pagerRef.current;
      if (!pager) return;
      const index = Math.round(pager.scrollTop / Math.max(1, pager.clientHeight));
      const genre = genres[index];
      if (!genre || index === currentGenre) return;
      const id =
        lastInGenre.current.get(genre.id) ??
        genre.styles.find((s) => s.ready)?.id ??
        genre.styles[0]?.id;
      if (id) choose(id);
    });

  const onTrackScroll = (genre: PagerGenre) => {
    const track = tracks.current.get(genre.id);
    if (!track) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => applyDepth(track));
    afterSettle(() => {
      const id = centreOf(track);
      if (!id) return;
      lastInGenre.current.set(genre.id, id);
      if (id !== currentId) choose(id);
    });
  };

  return (
    <div
      ref={pagerRef}
      className="style-pager"
      role="region"
      aria-roledescription="장르 넘기기"
      aria-label="장르와 스타일, 위아래로 장르, 좌우로 스타일"
      tabIndex={0}
      onScroll={onPagerScroll}
    >
      {genres.map((genre, gi) => (
        <section
          key={genre.id}
          className="style-pager-row"
          aria-label={`${genre.name}, 장르 ${gi + 1} / ${genres.length}`}
          aria-current={gi === currentGenre || undefined}
        >
          <header className="style-pager-head">
            <h3>{genre.name}</h3>
            <span>
              장르 {gi + 1} / {genres.length}
            </span>
          </header>
          <ul
            ref={(el) => {
              if (el) tracks.current.set(genre.id, el);
              else tracks.current.delete(genre.id);
            }}
            className="style-track"
            aria-label={`${genre.name}의 스타일`}
            tabIndex={0}
            onScroll={() => onTrackScroll(genre)}
          >
            {genre.styles.map((style, si) => {
              const isCurrent = style.id === currentId;
              const image = style.ready ? preview(style.id) : undefined;
              return (
                <li
                  key={style.id}
                  data-style-id={style.id}
                  className="style-card3d"
                  data-current={isCurrent || undefined}
                  aria-current={isCurrent || undefined}
                  aria-label={`${si + 1} / ${genre.styles.length}: ${style.name}${style.ready ? "" : ", 사진 준비 중"}`}
                  onClick={() => {
                    if (isCurrent) return;
                    lastInGenre.current.set(genre.id, style.id);
                    choose(style.id);
                  }}
                >
                  {isCurrent && style.ready ? (
                    renderCover(style.id)
                  ) : (
                    <div className="style-card3d-face" aria-hidden="true">
                      {image ? (
                        <img src={image.thumbnailUrl} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span className="style-card3d-pending">
                          {style.ready ? "" : "사진 준비 중"}
                        </span>
                      )}
                      <span className="style-card3d-name">{style.name}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
