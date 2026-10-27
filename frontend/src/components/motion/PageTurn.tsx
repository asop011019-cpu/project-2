import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

const COMMIT_SHARE = 0.35; // dragged past this share of the width, the page turns
const COMMIT_SPEED = 0.6; // or flicked faster than this (px per ms)
const TURN_MS = 380;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * A page the user turns like a book: dragging from right to left lifts it from its left edge, and
 * letting go far or fast enough turns it over and calls `onTurn`. A short drag springs back, a
 * vertical drag scrolls as usual. The hint under the page does the same turn for keyboard and
 * screen-reader users. If the step fails (`error` set), the page comes back.
 */
export function PageTurn({
  enabled,
  busy,
  error,
  hint,
  next,
  onTurn,
  children,
}: {
  enabled: boolean;
  busy: boolean;
  error: string | null;
  /** e.g. "취향 저장하고 사진 등록으로" */
  hint: string;
  /** What the next page is, shown underneath as this one lifts. */
  next: ReactNode;
  onTurn: () => void;
  children: ReactNode;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [turned, setTurned] = useState(false);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    t: number;
    horizontal: boolean | null;
  } | null>(null);
  const moved = useRef(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // A failed save brings the page back so the user can read the error and try again.
  useEffect(() => {
    if (!error) return;
    setTurned(false);
    setProgress(0);
  }, [error]);

  const turn = () => {
    if (!enabled || busy || turned) return;
    setTurned(true);
    setProgress(1);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(onTurn, reducedMotion() ? 0 : TURN_MS);
  };

  const width = () => pageRef.current?.clientWidth || window.innerWidth || 1;
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!enabled || busy || turned || (e.pointerType === "mouse" && e.button !== 0)) return;
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: e.timeStamp,
      horizontal: null,
    };
    moved.current = false;
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.horizontal === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      // Decide once: mostly sideways and leftwards turns the page, anything else is a scroll.
      g.horizontal = Math.abs(dx) > Math.abs(dy) && dx < 0;
      if (!g.horizontal) {
        gesture.current = null;
        return;
      }
      moved.current = true;
      setDragging(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    setProgress(Math.min(1, Math.max(0, -dx / width())));
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !g.horizontal) return;
    setDragging(false);
    const dx = e.clientX - g.x;
    const speed = -dx / Math.max(1, e.timeStamp - g.t);
    if (-dx / width() > COMMIT_SHARE || speed > COMMIT_SPEED) turn();
    else setProgress(0);
  };

  const angle = progress * 95;
  return (
    <div className="page-turn">
      <div className="page-turn-under" aria-hidden="true">
        {next}
        {turned && busy && <p className="mt-3 text-sm text-muted-foreground">저장하는 중…</p>}
      </div>
      <div
        ref={pageRef}
        className="page-turn-page"
        data-dragging={dragging || undefined}
        aria-hidden={turned || undefined}
        style={{
          transform: angle ? `perspective(1400px) rotateY(${-angle}deg)` : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        // A drag must not also press the button it started on.
        onClickCapture={(e) => {
          if (moved.current) {
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
          }
        }}
      >
        {children}
        <button
          type="button"
          className="page-turn-hint"
          disabled={!enabled || busy || turned}
          onClick={turn}
        >
          <ArrowLeft aria-hidden="true" />
          <span>
            밀어서 넘기기 <span className="sr-only">: </span>
            <strong>{hint}</strong>
          </span>
        </button>
        <span className="page-turn-shade" aria-hidden="true" style={{ opacity: progress * 0.55 }} />
      </div>
    </div>
  );
}
