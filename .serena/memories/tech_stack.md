# tech stack
- Backend: Node >=24.19 (ESM, runs .ts directly via type stripping), Fastify, node:sqlite, sharp, @fastify/multipart, zod, TypeScript (tsc build to dist for tests), node:test, Prettier.
- Frontend: TanStack Start + React, Vite 8 via @lovable.dev/vite-tanstack-config (do not add its bundled plugins manually), Tailwind, shadcn/ui, React Query, vitest + Testing Library, ESLint, Prettier. Cloudflare Worker target via nitro on build.
- OS: Windows 10, git core.autocrlf=true (CRLF checkouts).
