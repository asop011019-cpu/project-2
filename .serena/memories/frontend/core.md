# frontend core
- Source of truth is the Lovable project 2e53d734-faa7-4653-9223-694a742cc564; no auto-sync with this repo. Provenance (base Lovable commit) in `frontend/SOURCE.md`; update it on every import.
- Import procedure: Lovable get_diff JSON (base->target). Lovable diffs ignore whitespace-only changes (re-indented lines arrive as context) -> apply with whitespace-insensitive matching against the base commit's files, then run Prettier on touched code files (Lovable output is Prettier-clean). Verify every hunk matched before writing.
- Keep the local `frontend/vite.config.ts` (dev proxy `/api`,`/media` -> BACKEND_URL, default http://127.0.0.1:3001); Lovable's version lacks it.
- Architecture rules are in `frontend/AGENTS.md` (API contract in src/lib/onboarding-api.ts, 401 never auto-resets, server owns style order/position, no mock APIs/fake success, analytics no-op).
- Lockfile is bun.lock but local installs use npm (`npm install --no-package-lock`); never commit an npm lockfile.
- Intro photos for local dev are copied to `public/__l5e/assets-v1/...` (same paths as Lovable asset JSON).
- Cookies ignore ports: a second dev stack on localhost:<other port> shares the 8080 session cookie; use 127.0.0.1:<port> (with matching PUBLIC_ORIGIN) for isolated tests.
