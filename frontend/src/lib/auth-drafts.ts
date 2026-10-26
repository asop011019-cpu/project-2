// Memory-only drafts retain File objects across client auth navigation; never persist photos or cookies.
const drafts = new Map<string, unknown>();
export function readAuthDraft<T>(key: string): T | undefined {
  return drafts.get(key) as T | undefined;
}
export function writeAuthDraft(key: string, value: unknown) {
  drafts.set(key, value);
}
export function clearAuthDrafts() {
  drafts.clear();
}
