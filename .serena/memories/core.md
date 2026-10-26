# project-2 core
Korean mobile fashion-coordination web app. Onboarding (style taste) -> base garment (one pants/skirt photo) registration.
- `backend/`: Node API (Fastify + node:sqlite). Details: `mem:backend/core` (modules, DB/file storage, session/security invariants).
- `frontend/`: Lovable-owned UI imported by hand (TanStack Start/React). Details: `mem:frontend/core` (import procedure, local proxy, architecture rules).
- `docs/`: contracts (API.md, GARMENT_API.md, DATA.md, CONTENT.md) + per-task verification records (INT-*, ONB-*).
- Stack/versions: `mem:tech_stack`. Commands (Windows specifics): `mem:suggested_commands`. Style: `mem:conventions`. Done-checks: `mem:task_completion`.

Project-wide invariants (from AGENTS.md):
- Roles: GPT director assigns tasks; Lovable owns screens/design; backend+integration owned by coding agents. Integration agents never re-implement frontend; report frontend defects (repro+files) to director.
- Read docs/API.md, DATA.md, GEMINI_HANDOFF.md before changing API contracts; contract changes need impact/compat report first.
- No AI garment analysis, shopping, recommendations, wardrobe in this stage.
- Clothing category != gender. Missing answer != skipped/disliked.
- Never invent image URLs; only published+approved content is public; test fixtures never seeded into real sessions.
- Never authorize by session ID; never log/expose cookie tokens.
- Work on separate integration branches (`integration/*`), never main; no force-push (Lovable sync).
