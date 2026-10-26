import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "@/components/auth/AuthPages";
import { siteHead } from "@/lib/site";
export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      ...siteHead("내 계정", "입고 싶은 가능성의 동의 현황과 로그인 계정을 관리하세요.", "/account")
        .meta,
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AccountPage,
});
