import { createFileRoute } from "@tanstack/react-router";
import { RestorePage } from "@/components/auth/AuthPages";
import { siteHead } from "@/lib/site";
export const Route = createFileRoute("/restore")({
  head: () => ({
    meta: [
      ...siteHead("계정 복구", "탈퇴 유예 중인 입고 싶은 가능성 계정을 복구하세요.", "/restore")
        .meta,
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RestorePage,
});
