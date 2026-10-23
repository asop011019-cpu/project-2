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

## Design skills

- For onboarding UI, read root `DESIGN.md`. The latest brief requires a light neutral photo-first interface; Spotify inspiration and the prior dark design are archived references only. Product requirements and API semantics take precedence.
- Project design skills live in `.agents/skills/`; installation sources and checks are recorded in `.agents/DESIGN_SKILLS.md` and `.agents/skill-provenance/manifest.json`.
- Project requirements and explicit user instructions take precedence over skill guidance.
- Use either `frontend-design` or `hallmark` as the primary guide for a requested design direction, rather than combining competing directions.
- Use `ui-ux-pro-max` for UX/design-system references, `emil-design-eng` for interaction, motion and UI polish, and `web-design-guidelines` for accessibility/usability review after implementation.
- Installing a skill does not authorize redesigning the app. Limit design changes to requested screens/components, preserve existing behavior and data/API connections, and review the final diff.
- Do not assume Claude-specific slash commands, hooks or tools work in Codex. Use the installed Codex skill and available equivalent tools; report unavailable checks honestly.
