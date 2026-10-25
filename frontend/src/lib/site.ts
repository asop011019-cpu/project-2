import menswear from "../assets/intro-menswear.jpg.asset.json";
import womenswear from "../assets/intro-womenswear.jpg.asset.json";
import share from "../assets/intro-share.jpg.asset.json";
export const SITE = {
  name: "입고 싶은 가능성",
  // Set VITE_SITE_URL to the actual public origin, never a preview URL.
  url: (import.meta.env["VITE_SITE_URL"] ?? "").replace(/\/$/, ""),
  noindex: import.meta.env["VITE_ALLOW_INDEXING"] !== "true",
  shareImage: share.url,
};
export const INTRO_IMAGES = [
  {
    src: menswear.url,
    alt: "갈색 셔츠 재킷과 베이지 와이드 팬츠 차림으로 걸어가는 남성 모델",
  },
  {
    src: womenswear.url,
    alt: "갈색 재킷과 꽃무늬 플리츠 미디 스커트 차림으로 걸어가는 여성 모델",
  },
] as const;
export function siteHead(title: string, description: string, path: string) {
  const pageTitle = title === SITE.name ? title : `${title} — ${SITE.name}`;
  return {
    meta: [
      { title: pageTitle },
      { name: "description", content: description },
      { property: "og:title", content: pageTitle },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...(SITE.noindex ? [{ name: "robots", content: "noindex, nofollow" }] : []),
      ...(SITE.url
        ? [
            { property: "og:url", content: `${SITE.url}${path}` },
            { property: "og:image", content: `${SITE.url}${SITE.shareImage}` },
            { name: "twitter:image", content: `${SITE.url}${SITE.shareImage}` },
          ]
        : []),
    ],
  };
}
export function robotsText(url = SITE.url, noindex = SITE.noindex) {
  const rules = ["Googlebot", "Bingbot", "Twitterbot", "facebookexternalhit", "*"]
    .map((agent) => `User-agent: ${agent}\n${noindex ? "Disallow: /" : "Allow: /"}`)
    .join("\n\n");
  return `${rules}\n${url ? `\nSitemap: ${url}/sitemap.xml\n` : ""}`;
}
export function sitemapXml(url = SITE.url) {
  if (!url) return null;
  const escape = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["/", "/garment", "/privacy"].map((path) => `<url><loc>${escape(url + path)}</loc></url>`).join("")}</urlset>`;
}
