import { createFileRoute, notFound } from "@tanstack/react-router";
import { siteHead } from "@/lib/site";
import { NotFoundComponent } from "./__root";
export const Route = createFileRoute("/$")({
  head: () =>
    siteHead(
      "찾는 페이지가 없어요",
      "주소가 바뀌었거나 존재하지 않는 페이지예요. 처음 화면에서 다시 시작해 주세요.",
      "/",
    ),
  notFoundComponent: NotFoundComponent,
  beforeLoad: () => {
    throw notFound();
  },
});
