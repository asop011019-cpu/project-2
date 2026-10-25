// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Local Node backend for same-origin /api and /media during `vite dev` only (INT-001-B).
// Headers (Cookie, Origin, Sec-Fetch-Site, X-Onboarding-Request) pass through unchanged.
const backendUrl = process.env["BACKEND_URL"] ?? "http://127.0.0.1:3001";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      proxy: {
        "/api": { target: backendUrl, changeOrigin: false },
        "/media": { target: backendUrl, changeOrigin: false },
      },
    },
  },
});
