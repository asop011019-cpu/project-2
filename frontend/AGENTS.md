<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules

- The base-garment onboarding API contract lives in `src/lib/onboarding-api.ts`: same-origin `/api`, `credentials: "include"`, `X-Onboarding-Request: 1` header on mutations only, and never set `Content-Type` manually on FormData requests. Why: the backend rejects requests missing the header and relies on the browser-set multipart boundary.
- A 401 (SESSION_REQUIRED) must never trigger automatic session recreation or deletion; the UI keeps user input and only calls `resetSession()` (DELETE then POST session) after the user explicitly confirms "새로 시작". Why: the backend returns 401 for stale cookies and does not auto-initialize; silently resetting would discard the user's saved garment.
- Client-side image checks in `src/lib/image-check.ts` (format sniffing, 10MiB, 40M pixels, HEIC/animation rejection) are advisory only — the server is the final authority. Why: the contract states the backend makes the final validation decision.
- No runtime mock APIs, demo save success, or new databases: when the backend is unreachable the UI must show an honest connection-error state while keeping photo selection and form editing usable. Why: required by the GAR-002 brief; fake success would misrepresent integration status.
- `/` is the style onboarding (`src/components/onboarding`), `/garment` is the base-garment screen; onboarding navigates to `/garment` only after `POST /session/complete` succeeds. Why: onboarding must precede garment registration and completion is server-gated.
- Onboarding style-response order comes only from `SessionView.activeStyleOrder`; static `onboarding-catalog.ts` is a labelled preview fallback and must never enable responses. Why: the server owns publishable content and order.
- Onboarding prev/next navigation persists via `putPosition` and moves only after the server SessionView returns (`currentStyleId`); no optimistic moves. Why: server owns position and restore.
- Intro selection happens after client mount and uses only the uploaded intro assets; the reusable onboarding component accepts an intro flag set by the index route. Why: SSR remains deterministic and existing isolated flow tests stay focused on onboarding.
- Site identity, crawler output and share metadata derive from `src/lib/site.ts`; public origin is configured with VITE_SITE_URL and indexing requires explicit VITE_ALLOW_INDEXING. Why: preview URLs and unapproved deployment settings must not leak into search metadata.
- Gesture interpretation is a pure function in `src/lib/swipe.ts`; swipe and buttons share the existing response mutation. Why: thresholds can be tested without introducing a second persistence path.
- Stage transitions use the isolated `useCurtain` hook with reduced-motion bypass and timer cleanup; no transition may invent an API success. Why: presentation remains independent of session authority.
- Visitor events go only through the no-op `track` adapter until an analytics provider is approved. Why: no external visitor data is sent by this implementation.
