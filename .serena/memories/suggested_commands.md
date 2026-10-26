# commands (Windows)
- PowerShell blocks npm.ps1 and .ps1 scripts (execution policy): use `npm.cmd`, and pass env via `node --env-file=<file>` instead of scripts.
- Ctrl-C on an npm.cmd process leaves a "일괄 작업을 끝내시겠습니까 (Y/N)?" prompt; close/reopen the terminal tab.
- Backend (in backend/): `npm.cmd run dev` (watch, reads backend/.env), `node --env-file=data/<task>/.env src/server.ts` (isolated stack), `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run catalog:import -- <json>`.
- Frontend (in frontend/): `npm.cmd run dev -- --host localhost --port 8080 --strictPort` (main local stack; open http://localhost:8080 exactly, 127.0.0.1:8080 fails origin check), `npx vitest run`, `npx tsc --noEmit` (run inside frontend/, otherwise npx fetches a bogus `tsc` package), `npx eslint .`, `npx prettier --check <files>`.
- Find who serves a port: PowerShell `Get-NetTCPConnection -LocalPort 8080 -State Listen` + `Get-CimInstance Win32_Process -Filter "ProcessId=<pid>"`.
- Push: `GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=Never git push` (GCM device login already stored).
