import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
export function AuthNavigation() {
  const router = useRouter();
  const qc = useQueryClient();
  useEffect(() => {
    const navigate = (event: Event) => {
      const href = (event as CustomEvent<string>).detail;
      if (href && window.location.pathname + window.location.search !== href) {
        void qc
          .cancelQueries({ queryKey: ["onboarding"] })
          .then(() => qc.removeQueries({ queryKey: ["onboarding"] }));
        void router.navigate({ href });
      }
    };
    const finish = (event: Event) => {
      qc.clear();
      void router.navigate({ href: "/" }).then(() => {
        if ((event as CustomEvent<boolean>).detail)
          toast.success("회원 탈퇴가 완료됐어요. 30일 안에 다시 로그인하면 복구할 수 있어요.");
      });
    };
    window.addEventListener("auth-navigation", navigate);
    window.addEventListener("auth-finished", finish);
    return () => {
      window.removeEventListener("auth-navigation", navigate);
      window.removeEventListener("auth-finished", finish);
    };
  }, [router, qc]);
  return null;
}
