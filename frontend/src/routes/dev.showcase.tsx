import { createFileRoute, notFound } from "@tanstack/react-router";
import { OutfitShowcase } from "@/components/showcase/OutfitShowcase";
import { DEV_SAMPLE_OUTFITS } from "@/lib/showcase";

// MOT-001: development-only page for the showcase interaction. Production builds answer 404, and
// the sample is labelled as test data; M4 will feed real, server-checked results instead.
export const Route = createFileRoute("/dev/showcase")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({
    meta: [{ title: "코디 쇼케이스 (개발용)" }, { name: "robots", content: "noindex" }],
  }),
  component: DevShowcase,
});

function DevShowcase() {
  return (
    <main className="min-h-screen overflow-x-clip bg-background">
      <div className="mx-auto w-full max-w-[640px] px-5 pb-16 pt-9">
        <p
          role="note"
          className="rounded-2xl bg-secondary px-4 py-3 text-sm text-secondary-foreground"
        >
          개발용 시험 화면이에요. 아래 코디·품목·가격은 실제 상품이나 추천 결과가 아니에요.
        </p>
        <h1 className="mt-6 font-display text-3xl font-extrabold text-foreground">코디 보기</h1>
        <div className="mt-6">
          <OutfitShowcase outfits={DEV_SAMPLE_OUTFITS} />
        </div>
      </div>
    </main>
  );
}
