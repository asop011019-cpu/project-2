import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/components/auth/AuthPages";
import { siteHead } from "@/lib/site";
export const Route = createFileRoute("/login")({
  head: () => ({
    ...siteHead("카카오 로그인", "카카오 계정으로 입고 싶은 가능성에 로그인하세요.", "/login"),
    meta: [
      ...siteHead("카카오 로그인", "카카오 계정으로 입고 싶은 가능성에 로그인하세요.", "/login")
        .meta,
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LoginPage,
});
