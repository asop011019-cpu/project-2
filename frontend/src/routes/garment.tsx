import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMe, authMessage } from "@/lib/auth-api";
import { Button } from "@/components/ui/button";

import { siteHead } from "@/lib/site";
import { GarmentScreen } from "@/components/garment/GarmentScreen";

export const Route = createFileRoute("/garment")({
  head: () =>
    siteHead(
      "기준 옷 등록",
      "코디의 기준이 될 옷 사진 한 장과 기본 정보를 등록하고 수정·교체·삭제할 수 있어요.",
      "/garment",
    ),
  component: ProtectedGarment,
});
function ProtectedGarment() {
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: getMe, retry: false, staleTime: 0 });
  useEffect(() => {
    if (me.data?.consentUpdates.length)
      window.dispatchEvent(
        new CustomEvent("auth-navigation", { detail: "/consent-update?returnTo=%2Fgarment" }),
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
      <GarmentScreen preserveDraft authReady={!!me.data && !me.data.consentUpdates.length} />
    </>
  );
}
