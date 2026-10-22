# project-2 collaboration

- This is a new project. Do not import or rebuild the old `project` app.
- Backend changes belong in `backend/`; Gemini owns frontend screens and design.
- Read `docs/API.md`, `docs/DATA.md`, and `docs/GEMINI_HANDOFF.md` before changing API contracts.
- Domain rules do not depend on Fastify, SQLite, browser state, or UI.
- No AI garment analysis, catalog shopping, recommendations, or wardrobe implementation in this stage.
- Clothing category is not gender identity. Missing answers and skipped/disliked responses are distinct.
- Do not invent image URLs or seed real sessions with test fixtures. Only published, approved content is public.
- Never authorize access by a session ID. Do not log or expose cookie tokens.
- Preserve existing files and uncommitted changes. Use this checkout; no worktrees or sub-agents required.
- Run `cd backend && npm run check` and `npm run build` for relevant backend changes.
