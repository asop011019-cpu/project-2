import { createPortal } from "react-dom";
import { Heart, Shirt } from "lucide-react";
import type { SessionView } from "@/lib/onboarding-session-api";
export function PreferenceRail({
  session,
  message,
  failed,
  currentStyleId = null,
}: {
  session: SessionView | null;
  message: string | null;
  failed: boolean;
  currentStyleId?: string | null;
}) {
  const liked = session?.responses.filter((r) => r.response === "liked") ?? [];
  const isLiked = currentStyleId !== null && liked.some((r) => r.styleId === currentStyleId);
  return (
    <header className="preference-rail">
      {createPortal(
        <div
          className={`save-pill ${message ? "save-pill-open" : ""} ${failed ? "save-pill-error" : ""}`}
          role="status"
          aria-live="polite"
        >
          {message}
        </div>,
        document.body,
      )}
      <div className="rail-content">
        <div
          className={`like-status ${isLiked ? "like-status-on" : ""}`}
          role="status"
          data-testid="like-status"
          data-liked={isLiked}
        >
          <Heart size={26} aria-hidden="true" />
          <span className="text-xs text-muted-foreground" aria-hidden="true">
            좋아요
          </span>
          <span className="sr-only">{isLiked ? "좋아요한 스타일" : "아직 좋아요 안 함"}</span>
        </div>
        <ul className="hanger-rail" aria-label="좋아요한 스타일">
          {liked.slice(-8).map((r) => (
            <li
              className="hanger-in"
              key={r.styleId}
              title={session?.styles.find((s) => s.id === r.styleId)?.name}
            >
              <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
                <path
                  d="M13 7V4.6a2.2 2.2 0 1 0-2.2-2.2M13 7 2 15.5h22L13 7z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
              </svg>
              <Shirt size={20} aria-hidden="true" />
              <span className="sr-only">
                {session?.styles.find((s) => s.id === r.styleId)?.name}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <progress
        className="rail-progress"
        value={session?.progress.answeredCount ?? 0}
        max={session?.progress.totalCount || 1}
        aria-label="스타일 응답 진행"
      />
    </header>
  );
}
