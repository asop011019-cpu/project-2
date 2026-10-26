# backend core
- Entry `src/server.ts` -> `src/app.ts` (Fastify). Modules: `src/modules/onboarding` (domain.ts pure rules, service, repository = SQLite, routes, catalog-management), `src/modules/garment` (routes, files).
- Domain rules must not depend on Fastify/SQLite/browser/UI.
- Config `src/config.ts` from env: HOST, PORT, PUBLIC_ORIGIN (exact single origin; https in production), DATABASE_PATH, GARMENT_ROOT (default: `garments/` next to DB, private), ASSET_ROOT (public catalog images under `/media`).
- Session: anonymous cookie (`onboarding_dev` over http dev; HttpOnly, SameSite=Strict). Mutations require header `X-Onboarding-Request: 1`, Origin == PUBLIC_ORIGIN, `Sec-Fetch-Site: cross-site` rejected. 401 SESSION_REQUIRED never auto-recreates.
- Styles are explorable only with >=4 allowed+published images; a session's activeStyleOrder is fixed at category start (catalog changes don't reorder existing sessions).
- Catalog content via `npm run catalog:import -- <json>` (upsert only; hide images by re-importing with publicationStatus draft). `usageStatus: allowed` requires a creator.
- Garment: one row per session; image re-encoded to PNG (sharp), metadata stripped; contract in docs/GARMENT_API.md.
- Local test data lives in gitignored `backend/data/<task>/` (own sqlite + garments + assets + .env). Never touch another task's data dir or prod DB. Rights-pending photos (CUR-001) are internal-test-only.
- `node --env-file` does not override variables already set in the environment.
