export type TrackEvent =
  | { type: "category"; categoryId: string }
  | { type: "response"; response: string; styleId: string }
  | { type: "complete" };
/** Intentionally sends nothing. Replace only this function when analytics is approved. */
export function track(_event: TrackEvent): void {}
