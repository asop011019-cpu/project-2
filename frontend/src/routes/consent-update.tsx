import { createFileRoute } from "@tanstack/react-router";
import { ConsentUpdatePage } from "@/components/auth/AuthPages";
import { siteHead } from "@/lib/site";
export const Route = createFileRoute("/consent-update")({
  head: () => ({
    meta: [
      ...siteHead(
        "필수 동의 갱신",
        "변경된 필수 동의 문서를 확인하고 취향 탐색을 이어가세요.",
        "/consent-update",
      ).meta,
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ConsentUpdatePage,
});
