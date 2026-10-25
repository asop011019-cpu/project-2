import { createFileRoute } from "@tanstack/react-router";
import { sitemapXml } from "@/lib/site";
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const xml = sitemapXml();
        return new Response(xml ?? "Public site URL is not configured.", {
          status: xml ? 200 : 404,
          headers: {
            "Content-Type": xml ? "application/xml; charset=utf-8" : "text/plain; charset=utf-8",
          },
        });
      },
    },
  },
});
