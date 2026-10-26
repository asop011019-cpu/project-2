# conventions
- Code/comments in English; docs, commit-adjacent reports and user/director communication in Korean.
- Match surrounding style; Prettier formatting in both packages. Frontend TS uses bracket access for env (`process.env["X"]`, noPropertyAccessFromIndexSignature).
- Commits: imperative subject (`feat: import ...`, `docs: record ...`), body explains why + verification, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; repo-local author asop011019-cpu.
- Each integration task gets `docs/<TASK-ID>.md`: branch/base SHA, scope, env/data paths, commands + results table, unverified items.
- Director reports (Reason network to asop011019/fashion-director): one message, <=5 lines: ID/full SHA/link, changed files, commands+results, evidence path, open items. No ack/progress messages.
