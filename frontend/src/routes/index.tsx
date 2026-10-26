import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { getMe, authMessage } from "@/lib/auth-api";
import { ApiError } from "@/lib/onboarding-api";
import { Button } from "@/components/ui/button";

import { SITE, siteHead } from "@/lib/site";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";

export const Route = createFileRoute("/")({
  head: () =>
    siteHead(SITE.name, "좋아하는 스타일을 발견하고, 마음에 든 옷 한 벌을 나다운 코디로.", "/"),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const beforeStart = useCallback(async () => {
    setError(null);
    try {
      const me = await getMe();
      if (me.consentUpdates.length) {
        await navigate({ href: "/consent-update?returnTo=" + encodeURIComponent("/?explore=1") });
        return false;
      }
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === "AUTH_REQUIRED")
        await navigate({ href: "/login?returnTo=" + encodeURIComponent("/?explore=1") });
      else setError(authMessage(e));
      return false;
    }
  }, [navigate]);
  return (
    <>
      <OnboardingScreen
        showIntro
        onBeforeStart={beforeStart}
        onComplete={() => void navigate({ to: "/garment" })}
      />
      {error && (
        <div className="auth-connection" role="alert">
          <p>{error}</p>
          <Button variant="outline" onClick={() => setError(null)}>
            닫기
          </Button>
        </div>
      )}
    </>
  );
}
