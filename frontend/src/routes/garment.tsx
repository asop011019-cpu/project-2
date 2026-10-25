import { createFileRoute } from "@tanstack/react-router";

import { siteHead } from "@/lib/site";
import { GarmentScreen } from "@/components/garment/GarmentScreen";

export const Route = createFileRoute("/garment")({
  head: () =>
    siteHead(
      "기준 하의 등록",
      "코디의 기준이 될 하의 사진 한 장과 기본 정보를 등록하고 수정·교체·삭제할 수 있어요.",
      "/garment",
    ),
  component: GarmentScreen,
});
