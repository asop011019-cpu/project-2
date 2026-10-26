# task completion
- Backend change: `npm.cmd run typecheck` + `npm.cmd test` in backend/. `npm run check` stops at format:check on Windows CRLF checkouts (environmental); 1 symlink test fails with EPERM without admin (environmental).
- Frontend import/change: in frontend/ `npx vitest run`, `npx tsc --noEmit`, `npx eslint .` (expect 0 errors; 6 pre-existing react-refresh warnings in shadcn ui files).
- Integration: verify in a real browser against the real Node backend + isolated DB; record in `docs/<TASK-ID>.md`.
- Don't re-run identical checks on unchanged code/deps/env; reuse prior evidence.
- Commit + push the integration branch, then report to the director (see `mem:conventions`).
