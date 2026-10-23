// A single writer coalesces repeated clicks to the latest desired state per image.
// Failed writes stay in memory and block navigation until retried; no local persistence.
export class PreferenceQueue<T> {
  private items = new Map<
    string,
    { styleId: string; selected: boolean; revision: number }
  >();
  private writing = false;
  version = 0;
  error: Error | null = null;
  constructor(
    private save: (
      styleId: string,
      imageId: string,
      selected: boolean,
    ) => Promise<T>,
    private commit: (value: T) => void,
    private notify: () => void,
  ) {}
  get pending() {
    return this.items.size > 0 || this.writing;
  }
  desired(imageId: string): boolean | undefined {
    return this.items.get(imageId)?.selected;
  }
  set(styleId: string, imageId: string, selected: boolean) {
    this.items.set(imageId, { styleId, selected, revision: ++this.version });
    this.error = null;
    this.notify();
    void this.drain();
  }
  retry() {
    this.error = null;
    this.notify();
    void this.drain();
  }
  clear() {
    this.items.clear();
    this.error = null;
    this.version++;
    this.notify();
  }
  private async drain() {
    if (this.writing) return;
    this.writing = true;
    while (this.items.size) {
      const [imageId, intent] = this.items.entries().next().value!;
      try {
        const result = await this.save(
          intent.styleId,
          imageId,
          intent.selected,
        );
        this.commit(result);
        if (this.items.get(imageId)?.revision === intent.revision)
          this.items.delete(imageId);
        this.version++;
      } catch (error) {
        this.error =
          error instanceof Error
            ? error
            : new Error("사진 선택을 저장하지 못했어요.");
        break;
      }
    }
    this.writing = false;
    this.notify();
  }
}
