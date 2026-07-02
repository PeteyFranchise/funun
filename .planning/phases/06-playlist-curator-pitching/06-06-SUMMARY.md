---
phase: 06-playlist-curator-pitching
plan: 06
subsystem: api
tags: [nextjs, svix, webhooks, supabase, resend, curator-pitching, react-client-components]

# Dependency graph
requires:
  - phase: 06-01
    provides: curators/pitch_history tables (RLS-enabled), Curator/PitchHistory/PitchStatus types, svix dependency
  - phase: 06-04
    provides: response_token generation at send time (lib/curators/tokens.ts generateResponseToken), lib/notifications createNotification reuse pattern
provides:
  - "lib/webhooks/resend-verify.ts -- verifyResendWebhook(), the first webhook signature-verification wrapper in this codebase"
  - "POST /api/webhooks/resend -- svix-verified Resend bounce webhook, flips curators.email_valid=false on a hard bounce"
  - "POST /api/pitch/accept/[token], decline/[token], unsubscribe/[token] -- public token-authenticated curator response routes"
  - "app/pitch/accept|decline|unsubscribe/[token]/page.tsx -- public curator-facing response pages"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Webhook routes read request.text() before any JSON.parse, verify the signature against the raw bytes, and only JSON.parse after verification succeeds -- breaks the request.json()-first convention every other route in this app follows, deliberately (RESEARCH Pitfall 2)"
    - "Public token-authenticated response routes (no session) read a response_token generated elsewhere (06-04) and resolve it one-time via a status !== 'pending' guard -> 410 on replay"
    - "Public dynamic-segment pages are 'use client' components using next/navigation's useParams() rather than a server-page + client-island split, since this project is pinned to React 18.3 (no use() hook to unwrap an async params Promise in a client component)"

key-files:
  created:
    - lib/webhooks/resend-verify.ts
    - app/api/webhooks/resend/route.ts
    - app/api/pitch/accept/[token]/route.ts
    - app/api/pitch/decline/[token]/route.ts
    - app/api/pitch/unsubscribe/[token]/route.ts
    - app/pitch/accept/[token]/page.tsx
    - app/pitch/decline/[token]/page.tsx
    - app/pitch/unsubscribe/[token]/page.tsx
  modified: []

key-decisions:
  - "Public accept/decline/unsubscribe pages are single-file 'use client' components using useParams() instead of the server-page + client-island split used by 06-05's /curators/claim/[token] -- this project is pinned to React 18.3.1, which does not export the use() hook needed to unwrap an async params Promise inside a Client Component, and useParams() is the documented Next.js 15 alternative that works on any React 18.x"

requirements-completed: [PITCH-06]

coverage:
  - id: D1
    description: "Signature-verified Resend bounce webhook reads the raw body before parsing, verifies via svix against RESEND_WEBHOOK_SECRET before any DB write, returns 503 when unconfigured and 400 on an invalid signature, and flips curators.email_valid=false on a verified HardBounce"
    requirement: "PITCH-06"
    verification:
      - kind: unit
        ref: "grep -Eq 'request.text\\(\\)' app/api/webhooks/resend/route.ts; grep -v '^\\s*//' app/api/webhooks/resend/route.ts | grep -c 'request.json()' == 0; grep -Eq 'email_valid' && grep -Eq 'HardBounce' app/api/webhooks/resend/route.ts; grep -Eq 'Webhook|svix' && grep -Eq '503|RESEND_WEBHOOK_SECRET' lib/webhooks/resend-verify.ts; npm run build (tail) -- no type errors"
        status: pass
    human_judgment: true
    rationale: "No test framework exists in this project (confirmed in CLAUDE.md). The behavior block was implemented and verified via the plan's own grep-based checks plus a full build. A live signed-payload exercise (svix's local test-signing helper, or a real Resend hard-bounce) against a running dev server + real Supabase session was not performed in this sandbox -- RESEND_WEBHOOK_SECRET is also unset in this environment (D-22), so the 503-unconfigured path is the only path exercisable end-to-end here."
  - id: D2
    description: "Curators accept, decline (with optional reason), and unsubscribe via one-time response_token links; accept/decline notify the artist via createNotification (in-app + email); unsubscribe sets do_not_pitch without deleting the curator"
    requirement: "PITCH-06"
    verification:
      - kind: unit
        ref: "grep -Eq response_token && grep -Eq \"status !== 'pending'|410\" app/api/pitch/accept/[token]/route.ts; grep -Eq createNotification in both accept and decline routes; grep -Eq decline_reason app/api/pitch/decline/[token]/route.ts; grep -Eq do_not_pitch app/api/pitch/unsubscribe/[token]/route.ts; npm run build (tail) -- no type errors"
        status: pass
    human_judgment: true
    rationale: "No test framework exists in this project. Verified via the plan's grep-based checks and a full build (including that /pitch/accept/[token], /pitch/decline/[token], /pitch/unsubscribe/[token] all compile as dynamic routes). A live click-through of each link (accept once, click again to see 'already responded to', decline with/without a reason, unsubscribe idempotency, and cross-checking 06-04's send route now skipping a do_not_pitch curator) was not exercised in this sandbox -- no running dev server or browser session available."
  - id: D3
    description: "Public accept/decline/unsubscribe pages reuse the (auth) centered shell, are outside middleware.ts's isProtected list, and match the locked copy/interaction contracts (bare-click accept, optional-reason decline with aria-label, unsubscribe confirmation)"
    verification:
      - kind: unit
        ref: "grep -q 'the artist has been notified' && grep -q 'already responded to' app/pitch/accept/[token]/page.tsx; grep -q 'Let the artist know why' && grep -Eq aria-label app/pitch/decline/[token]/page.tsx; grep -q 'still appear in the curator directory' app/pitch/unsubscribe/[token]/page.tsx; npm run build (tail) -- no type errors, all three routes register"
        status: pass
    human_judgment: true
    rationale: "No test framework exists in this project. Copy/accessibility greps and a full build (route registration, no type errors) were verified automatically. A full manual smoke -- opening each link in a browser, confirming keyboard-activation of the accept button, confirming the neutral (non-accent) Decline button styling renders, and confirming the empty-textarea-and-click IS the skip -- was not exercised in this sandbox."

# Metrics
duration: ~20min
completed: 2026-07-02
status: complete
---

# Phase 06 Plan 06: Bounce Webhook + Curator Response Links Summary

**First webhook route in the codebase (svix-verified Resend bounce handler that flips `curators.email_valid=false`) plus token-authenticated accept/decline/unsubscribe response links with artist notifications, closing out PITCH-06**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-02T02:15:00Z (approx.)
- **Completed:** 2026-07-02T02:36:53Z
- **Tasks:** 3 (all `type="auto"`; Task 1 flagged `tdd="true"` in the plan, implemented against its `<behavior>` block since no test framework exists in this project)
- **Files modified:** 8 (all created, 0 modified)

## Accomplishments
- `lib/webhooks/resend-verify.ts` wraps svix's `Webhook.verify()` against `RESEND_WEBHOOK_SECRET`, returning `{ ok:false, status:503 }` when unconfigured and `{ ok:false, status:400 }` on an unverifiable signature — never a best-effort accept
- `app/api/webhooks/resend/route.ts` is the first webhook route in this codebase: it calls `request.text()` **before** any JSON parsing (the raw-body-first rule every other route in this app deliberately does NOT follow), verifies the svix signature before any DB write, and flips `curators.email_valid=false` on a verified `email.bounced` `HardBounce` event (tolerant of both `data.bounce.type` and `data.bounce_type` shapes, per the unconfirmed Resend field-nesting noted in RESEARCH)
- `app/api/pitch/accept/[token]/route.ts` and `decline/[token]/route.ts` load a `pitch_history` row by `response_token` (generated once, at send time, by 06-04 — this plan only reads and resolves it), 404 on an invalid token, 410 on a non-`pending` status (one-time-use guard, T-06-03), update status + `responded_at` (+ optional `decline_reason`, trimmed and capped at 500 chars, on decline), and notify the artist via `createNotification` (in-app + email, D-14) reusing the exact Antenna-match email-resolution pattern (`service.auth.admin.getUserById()`)
- `app/api/pitch/unsubscribe/[token]/route.ts` resolves the pitch's `curator_id` from the token and sets `curators.do_not_pitch=true` (D-20) — the curator is never deleted, stays browsable in the directory, and is idempotent (safe to click twice)
- `app/pitch/accept/[token]/page.tsx`, `decline/[token]/page.tsx`, `unsubscribe/[token]/page.tsx` are public pages reusing the `(auth)` centered `max-w-sm` shell: accept is a bare-click confirmation, decline has a skippable `aria-label`'d reason textarea with a neutral (`bg-white text-black`) Decline action, unsubscribe shows the verbatim do-not-pitch confirmation copy — all three sit under `/pitch`, which is intentionally absent from `middleware.ts`'s `isProtected` list

## Task Commits

Each task was committed atomically:

1. **Task 1: svix verify wrapper + Resend bounce webhook route** - `e5feda8` (feat)
2. **Task 2: Accept / Decline / Unsubscribe token response API routes** - `b6dc159` (feat)
3. **Task 3: Public accept / decline / unsubscribe pages** - `b0791de` (feat)

**Plan metadata:** committed alongside this SUMMARY (docs: complete plan)

## Files Created/Modified
- `lib/webhooks/resend-verify.ts` - `verifyResendWebhook()`, `ResendWebhookEvent` type
- `app/api/webhooks/resend/route.ts` - svix-verified Resend bounce webhook (POST)
- `app/api/pitch/accept/[token]/route.ts` - accept token response route (POST)
- `app/api/pitch/decline/[token]/route.ts` - decline token response route (POST, optional reason)
- `app/api/pitch/unsubscribe/[token]/route.ts` - unsubscribe token response route (POST)
- `app/pitch/accept/[token]/page.tsx` - public bare-click accept confirmation page
- `app/pitch/decline/[token]/page.tsx` - public optional-reason decline page
- `app/pitch/unsubscribe/[token]/page.tsx` - public unsubscribe confirmation page

## Decisions Made
- The three public pages are single-file `'use client'` components using `next/navigation`'s `useParams()` hook to read the dynamic `[token]` segment, rather than mirroring 06-05's `/curators/claim/[token]` server-page + client-island (`ClaimPage` + `ClaimButton`) split. React is pinned to `^18.3.0` in this project (confirmed via `package.json` and `node_modules/react/package.json` — `18.3.1` installed), and React's `use()` hook for unwrapping an async `params` Promise inside a Client Component was only added in React 19. `useParams()` is the documented Next.js 15 App Router alternative that works on any React 18.x client component and requires no Promise-unwrapping at all. This also kept the interactive state (idle/loading/done/expired/error) and the plan's locked copy strings inside the single `page.tsx` file the plan's `<files>` list and automated verification greps expect, rather than splitting them into a separate component file the greps wouldn't see.

## Deviations from Plan

None — plan executed exactly as written. The `useParams()` vs. server+client-island choice above is an implementation detail within Task 3's `<action>` ("bare-click confirmation... reuse the (auth) centered shell"), not a deviation from any locked requirement, artifact path, or behavior — all three plan-specified files exist at their exact locked paths with the exact locked copy.

## Issues Encountered
None. `npm run build` compiled cleanly after every task, and all three new dynamic page routes (`/pitch/accept/[token]`, `/pitch/decline/[token]`, `/pitch/unsubscribe/[token]`) and the webhook route (`/api/webhooks/resend`) register correctly in the build output. This project has no test framework (confirmed in `CLAUDE.md`), so Task 1's `tdd="true"` flag was satisfied via the plan's own `<behavior>` block, grep-based automated verification, and a full build — matching the established pattern from prior Phase 6 plans (06-04) that hit the same constraint.

## User Setup Required

`RESEND_WEBHOOK_SECRET` remains unset in this environment (per 06-01's `user_setup` frontmatter — the webhook endpoint must be created in the Resend Dashboard first, which itself depends on `pitch.funun.studio` being live). Until it's set, `/api/webhooks/resend` returns 503 gracefully (D-22) rather than crashing or silently accepting unverified payloads. No other new environment variables were introduced by this plan — `PITCH_FROM_EMAIL` (06-04's dependency) is a separate, already-documented open item.

## Next Phase Readiness
- PITCH-06 (bounce detection) is fully closed by this plan; the genre-drift half of PITCH-06 was already delivered upstream by 06-02 (admin) and 06-05 (curator self-serve edit), per this plan's `<success_criteria>`.
- This is the final plan of Phase 6 (Playlist Curator Pitching, PITCH-01 through PITCH-08) — all requirements are now implemented: curator directory + filtering (06-02/06-03), pitch composer + send (06-04), curator claim + self-serve portal (06-05), and bounce/response-link handling (this plan).
- Remaining open items are all infrastructure/credentials, not code: `pitch.funun.studio` DNS/warmup + `RESEND_WEBHOOK_SECRET` + `PITCH_FROM_EMAIL` (D-22), and `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`/`YOUTUBE_API_KEY` for the weekly reach-signal refresh (D-23) — all already documented in prior plans' `user_setup` frontmatter and all degrade gracefully per the established no-op-when-unconfigured convention.
- No blockers for closing out Phase 6 or moving to Phase 7 (Social Campaign Planner).

---
*Phase: 06-playlist-curator-pitching*
*Completed: 2026-07-02*
