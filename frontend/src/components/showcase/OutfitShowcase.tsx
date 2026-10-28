import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GarmentSheet } from "@/components/garment/GarmentSheet";
import { cn } from "@/lib/utils";
import {
  formatWon,
  purchaseTotal,
  safeShopUrl,
  type ShowcaseItem,
  type ShowcaseOutfit,
} from "@/lib/showcase";

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function ItemThumb({ item, size }: { item: ShowcaseItem; size: "sm" | "md" }) {
  const box = size === "sm" ? "h-14 w-14" : "h-20 w-20";
  // Whole product, never cropped or stretched.
  return item.imageUrl ? (
    <img
      src={item.imageUrl}
      alt={item.imageAlt}
      className={cn(box, "shrink-0 rounded-xl bg-background object-contain ring-1 ring-border")}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        box,
        "flex shrink-0 items-center justify-center rounded-xl bg-secondary text-xs font-bold text-muted-foreground ring-1 ring-border",
      )}
    >
      {item.role}
    </span>
  );
}

function TotalLine({ outfit }: { outfit: ShowcaseOutfit }) {
  const { total, complete } = purchaseTotal(outfit);
  return (
    <p className="text-sm text-foreground">
      추가 구매 참고가 <strong className="font-bold">{formatWon(total)}</strong>
      {!complete && <span className="text-muted-foreground"> 이상 (일부 참고가 없음)</span>}
    </p>
  );
}

/**
 * Outfit cards the user moves through by swiping, the arrow buttons or the arrow keys (MOT-001,
 * after the twoclipping reference). The card in the middle is the current one; opening it shows
 * its items, reference prices and shop links. Motion only follows what the user did.
 */
export function OutfitShowcase({ outfits }: { outfits: ShowcaseOutfit[] }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const frame = useRef(0);

  // The current card is the one whose centre is nearest the track's centre.
  const syncActive = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const middle = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDistance = Infinity;
    Array.from(track.children).forEach((child, index) => {
      const el = child as HTMLElement;
      const distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - middle);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    setActive(best);
  }, []);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const goTo = (index: number) => {
    const track = trackRef.current;
    const target = track?.children[index] as HTMLElement | undefined;
    if (!track || !target) return;
    // Horizontal only, so the page never jumps vertically.
    track.scrollTo?.({
      left: target.offsetLeft - (track.clientWidth - target.offsetWidth) / 2,
      behavior: reducedMotion() ? "auto" : "smooth",
    });
    setActive(index);
  };
  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "ArrowRight" && active < outfits.length - 1) {
      e.preventDefault();
      goTo(active + 1);
    } else if (e.key === "ArrowLeft" && active > 0) {
      e.preventDefault();
      goTo(active - 1);
    }
  };

  const opened = outfits.find((o) => o.id === openId) ?? null;
  if (outfits.length === 0) return null;
  return (
    <section aria-roledescription="carousel" aria-label="코디" className="showcase">
      <ul
        ref={trackRef}
        tabIndex={0}
        aria-label="코디 목록, 좌우로 넘겨 보세요"
        onKeyDown={onKey}
        onScroll={() => {
          cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(syncActive);
        }}
        className="showcase-track"
      >
        {outfits.map((outfit, index) => (
          <li
            key={outfit.id}
            aria-roledescription="slide"
            aria-label={`${index + 1} / ${outfits.length}: ${outfit.title}`}
            aria-current={index === active || undefined}
            className="showcase-card"
            data-active={index === active || undefined}
            onClick={() => index !== active && goTo(index)}
          >
            <div className="flex h-full flex-col gap-4 rounded-3xl bg-card p-5 ring-1 ring-border">
              <div className="overflow-hidden">
                {/* Keyed so the title re-enters from its mask each time this card becomes current. */}
                <h2
                  key={index === active ? "on" : "off"}
                  className="showcase-title font-display text-2xl font-extrabold text-foreground"
                >
                  {outfit.title}
                </h2>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{outfit.note}</p>
              <ul className="flex flex-wrap gap-2" aria-label="구성">
                {outfit.items.map((item) => (
                  <li key={item.id}>
                    <ItemThumb item={item} size="sm" />
                  </li>
                ))}
              </ul>
              <div className="mt-auto space-y-3">
                <TotalLine outfit={outfit} />
                <Button
                  type="button"
                  variant="outline"
                  className="tap-feedback h-11 w-full rounded-full border-input bg-transparent"
                  tabIndex={index === active ? 0 : -1}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenId(outfit.id);
                  }}
                >
                  구성·참고가 보기
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-full"
          aria-label="이전 코디"
          disabled={active === 0}
          onClick={() => goTo(active - 1)}
        >
          <ChevronLeft />
        </Button>
        {/* Announced for screen readers only; no visible counter (user, 2026-10-28). */}
        <p className="sr-only" aria-live="polite">
          {active + 1} / {outfits.length}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-full"
          aria-label="다음 코디"
          disabled={active === outfits.length - 1}
          onClick={() => goTo(active + 1)}
        >
          <ChevronRight />
        </Button>
      </div>

      <GarmentSheet
        open={opened !== null}
        onOpenChange={(open) => !open && setOpenId(null)}
        title={opened?.title ?? ""}
        footer={
          <p className="text-xs leading-relaxed text-muted-foreground">
            참고가는 실제 판매가·재고와 다를 수 있어요. 기준 옷은 합계에 넣지 않아요.
          </p>
        }
      >
        {opened && (
          <div className="space-y-5">
            <ul className="space-y-3">
              {opened.items.map((item) => {
                const href = safeShopUrl(item.url);
                return (
                  <li key={item.id} className="flex gap-3">
                    <ItemThumb item={item} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">
                        {item.role}
                        {item.owned && " · 갖고 있는 옷"}
                      </p>
                      <p className="break-words font-bold text-foreground">{item.name}</p>
                      <p className="text-sm text-foreground">
                        {item.owned
                          ? "구매 안 함"
                          : item.referencePriceKrw === null
                            ? "참고가 없음"
                            : `참고가 ${formatWon(item.referencePriceKrw)}`}
                        {item.storeName && (
                          <span className="text-muted-foreground"> · {item.storeName}</span>
                        )}
                      </p>
                      {!item.owned &&
                        (href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-primary underline underline-offset-4"
                          >
                            판매처에서 보기
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                        ) : (
                          <p className="mt-1 text-xs text-muted-foreground">판매처 링크 없음</p>
                        ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            <TotalLine outfit={opened} />
          </div>
        )}
      </GarmentSheet>
    </section>
  );
}
