import { createFileRoute } from "@tanstack/react-router";
import { SignupPage } from "@/components/auth/AuthPages";
import { siteHead } from "@/lib/site";
export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      ...siteHead("가입 동의", "입고 싶은 가능성 가입에 필요한 동의 문서를 확인하세요.", "/signup")
        .meta,
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SignupPage,
});
