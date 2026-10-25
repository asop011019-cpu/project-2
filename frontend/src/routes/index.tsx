import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { SITE, siteHead } from "@/lib/site";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";

export const Route = createFileRoute("/")({
  head: () =>
    siteHead(SITE.name, "좋아하는 스타일을 발견하고, 마음에 든 옷 한 벌을 나다운 코디로.", "/"),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  return <OnboardingScreen showIntro onComplete={() => void navigate({ to: "/garment" })} />;
}
