import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "ONBOARDING_");
  const target = environment.ONBOARDING_API_TARGET || "http://127.0.0.1:3001";
  return {
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": { target },
        "/media": { target },
      },
    },
  };
});
