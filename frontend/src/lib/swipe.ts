import type { StyleResponse } from "./onboarding-session-api";
export const SWIPE_THRESHOLD = 90;
export function swipeResponse(dx: number, dy: number): StyleResponse | null {
  if (dx > SWIPE_THRESHOLD) return "liked";
  if (dx < -SWIPE_THRESHOLD) return "disliked";
  if (dy < -SWIPE_THRESHOLD) return "skipped";
  return null;
}
