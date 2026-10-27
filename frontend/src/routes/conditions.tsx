import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMe, authMessage } from "@/lib/auth-api";
import { Button } from "@/components/ui/button";
import { siteHead } from "@/lib/site";
import { ConditionsScreen } from "@/components/conditions/ConditionsScreen";

export const Route = createFileRoute("/conditions")({
  head: () =>
    siteHead(
      "코디 조건",
      "기온·상황·격식·추가 구매 예산처럼 추천에 쓸 코디 조건을 정하고 저장해요.",
      "/conditions",
    ),
  component: ProtectedConditions,
});

function ProtectedConditions() {
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: getMe, retry: false, staleTime: 0 });
  useEffect(() => {
    if (me.data?.consentUpdates.length)
      window.dispatchEvent(
        new CustomEvent("auth-navigation", { detail: "/consent-update?returnTo=%2Fconditions" }),
      );
  }, [me.data]);
  return (
    <>
      {me.isError && (
        <div className="auth-connection" role="alert">
          <p>{authMessage(me.error)}</p>
          <Button variant="outline" onClick={() => void me.refetch()}>
            다시 시도
          </Button>
        </div>
      )}
      <ConditionsScreen authReady={!!me.data && !me.data.consentUpdates.length} />
    </>
  );
}
