---
phase: 28-industry-accounts-green-room-access
plan: 02
subsystem: green-room-access-control
tags: [green-room, access-control, member_type, industry-accounts, broken-access-control]
dependency-graph:
  requires:
    - "28-01: member_type/capability_grants lockstep (this plan reads only member_type, which 28-01 now keeps in sync)"
  provides:
    - "App-layer Green Room account-type gate: greenRoomViewerGate() / greenRoomPosterGate() (lib/green-room/access.ts)"
    - "createGreenRoomPost() rejects a non-artist/non-industry principal or a Funun-staff email before any DB write"
    - "GET /api/green-room/feed rejects a non-member before loadGreenRoomFeed runs"
  affects:
    - lib/green-room/post-write.ts
    - app/api/green-room/feed/route.ts
tech-stack:
  added: []
  patterns:
    - "Pure-predicate gate functions (greenRoomViewerGate/greenRoomPosterGate) tested without a Supabase mock, mirroring __tests__/capability-route-guard.test.ts"
    - "Result-object convention: GreenRoomGateResult = {ok:true} | {ok:false,error,status}, matching lib/green-room/post-write.ts's existing ValidationResult shape"
    - "Inert/forward-safe feature stub: isFununStaffPrincipal() is an email-domain heuristic standing in for the unshipped Phase 25 funun_staff table"
key-files:
  created:
    - lib/green-room/access.ts
    - __tests__/green-room-account-gate.test.ts
  modified:
    - lib/green-room/post-write.ts
    - app/api/green-room/feed/route.ts
    - __tests__/green-room-feed-api.test.ts
    - __tests__/green-room-posts-api.test.ts
decisions:
  - "Gate reads member_type only (never an independent capability_grants read) — matches lib/green-room/discover.ts's existing convention and avoids a fourth disagreeing gate (RESEARCH Anti-Pattern), per the plan's locked source-of-truth decision"
  - "Gate placed inside createGreenRoomPost()/the feed route handler (service + route layer), not inside loadGreenRoomFeed() itself, so the 403 path stays out of the feed query's try/catch 500 handler"
  - "FUNUN_STAFF_EMAIL_DOMAINS is a plain constant with no import of any funun_staff/team_members symbol — Phase 25 has zero runtime code, so the INDUSTRY-07 block is inert until that table ships"
  - "Did not touch app/api/green-room/posts/route.ts — createGreenRoomPost() already returns the Result the route surfaces, so the 403 path required no route change (per plan explicit instruction)"
metrics:
  duration: ~5min
  completed: 2026-08-06
status: complete
---

# Phase 28 Plan 02: Green Room Account-Type Gate Summary

Added the app-layer half of the Green Room's locked access matrix (Artist ✓ / Industry ✓ / else ✗) via a new `lib/green-room/access.ts` module, closing the broken-access-control gap where any authenticated session — including a future buyer or Funūn-staff session — could read or post to the Green Room.

## What Was Built

**Task 1 — Failing unit tests (RED):**
- `__tests__/green-room-account-gate.test.ts` — pure-predicate coverage (no Supabase mock) for `greenRoomViewerGate()`, `greenRoomPosterGate()`, and `isFununStaffPrincipal()`, importing the not-yet-created `@/lib/green-room/access` module. Confirmed RED: module did not resolve.

**Task 2 — `lib/green-room/access.ts` (INDUSTRY-02 / INDUSTRY-07):**
- `GreenRoomGateResult` type and `GREEN_ROOM_MEMBER_TYPES = ['artist','industry']` — the two admitted lanes.
- `FUNUN_STAFF_EMAIL_DOMAINS = ['funun.studio']` — an explicitly documented inert/forward-safe stand-in for the unshipped `funun_staff` table (Phase 25 has zero runtime code, confirmed by the RESEARCH's Runtime State Inventory grep).
- `isFununStaffPrincipal(email)` — true only when the email's domain matches a known staff domain (case-insensitive); false for null/empty/other domains.
- `greenRoomViewerGate({ memberType })` — ok only for `'artist'`/`'industry'`; else a 403 with a clear "open to Artist and Industry accounts" message.
- `greenRoomPosterGate({ memberType, email })` — runs the viewer gate, then additionally blocks a Funūn-staff email with a distinct message (INDUSTRY-07).
- `loadGreenRoomPrincipal(supabase, userId)` — reads `member_type` from `user_profiles` (`maybeSingle`) and the caller's email from `supabase.auth.getUser()` in parallel; returns nulls for a buyer/no-profile principal.
- Confirmed GREEN, `tsc --noEmit` clean.

**Task 3 — Wired the gates into the write and read paths (INDUSTRY-02):**
- `createGreenRoomPost()` (`lib/green-room/post-write.ts`) now calls `loadGreenRoomPrincipal` + `greenRoomPosterGate` **before** `validateGreenRoomPostInput` and any DB write; a failing gate returns the same `{ok:false,error,status:403}` Result shape the route already maps to HTTP.
- `GET /api/green-room/feed` (`app/api/green-room/feed/route.ts`) now runs `loadGreenRoomPrincipal` + `greenRoomViewerGate` immediately after resolving `user`, returning `NextResponse.json({error},{status:403})` **before** tab/cursor parsing and `loadGreenRoomFeed()` — keeping the 403 out of the feed query's 500 catch block.
- `app/api/green-room/posts/route.ts` was **not modified** — it already surfaces whatever Result `createGreenRoomPost()` returns, so the new 403 path required no route-level change (explicit plan instruction, verified).
- Existing test mocks (`__tests__/green-room-feed-api.test.ts`, `__tests__/green-room-posts-api.test.ts`) needed the new `user_profiles`/`auth.getUser()` reads the gate performs — updated their Supabase mocks accordingly, and added explicit new-coverage tests for the non-member-403 and Funūn-staff-email-403 paths at both the route and service level.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Existing `__tests__/green-room-feed-api.test.ts` and `__tests__/green-room-posts-api.test.ts` broke against pre-existing mocks that lacked `supabase.from('user_profiles')`/`supabase.auth.getUser()`**
- **Found during:** Task 3, running the full suite after wiring the gate.
- **Issue:** Four pre-existing tests (three in `green-room-feed-api.test.ts`, three `createGreenRoomPostActual(...)` calls in `green-room-posts-api.test.ts`) passed a bare `{ from }`/`{ auth }` mock object that didn't support the new `loadGreenRoomPrincipal()` reads, so they threw `TypeError: supabase.from is not a function` (or `Unexpected table: user_profiles`) once the gate was wired in.
- **Fix:** Added a `mockUserProfilesFrom()` helper (feed test) and a `greenRoomTestClient()` helper + `user_profiles` branch in the `from` dispatcher (posts test) so each pre-existing test's mocked principal passes the gate and exercises the logic below it, matching the tests' original intent. Also added net-new tests for the 403 paths at both layers (feed route: non-member before `loadGreenRoomFeed`; post-write: non-member and Funūn-staff-email before any DB write) per the plan's explicit acceptance criteria.
- **Files modified:** `__tests__/green-room-feed-api.test.ts`, `__tests__/green-room-posts-api.test.ts`.
- **Commit:** `be45ae2`

Or: no other deviations — plan executed exactly as written otherwise.

## Manual-Only Verification (per 28-RESEARCH.md's Validation Architecture)

No Next.js request harness exists in this repo, so live HTTP behavior is recorded here for a human to execute, and will be re-verified at Plan 28-05's post-push smoke test (the RLS backstop migration):

| Scenario | Expected | Status |
|----------|----------|--------|
| Live artist account reads/posts to the Green Room | 200, post created | Not yet executed — requires a live artist account |
| Live industry account reads/posts to the Green Room | 200, post created | Not yet executed — requires a live approved-industry account |
| A buyer session (no `user_profiles` row) hits `GET /api/green-room/feed` or `POST /api/green-room/posts` | 403 | Not yet executed — requires a live buyer session |
| A `@funun.studio` account attempts to post | 403 with the Funūn-staff message | Not yet executed — requires a live `@funun.studio` test account |

## Verification Results

- `npx jest __tests__/green-room-account-gate.test.ts __tests__/green-room-feed-api.test.ts __tests__/green-room-posts-api.test.ts` — 3 suites / 34 tests, all GREEN.
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (0 warnings, `--max-warnings=0`).
- `npm run test` (full suite) — 111 suites / 1407 tests, all GREEN (no regressions).

## TDD Gate Compliance

All three tasks were `tdd="true"`. Git log confirms the gate sequence:
1. `test(28-02): add failing tests for Green Room account-type gate` (RED) — commit `658bf9c`
2. `feat(28-02): create lib/green-room/access.ts gate + principal loader` (GREEN, Task 2) — commit `081326a`
3. `feat(28-02): wire Green Room account-type gate into post + feed routes` (GREEN, Task 3) — commit `be45ae2`

No REFACTOR commit was needed — no cleanup pass was warranted after GREEN.

## Requirements

`INDUSTRY-02` and `INDUSTRY-07` are provisional IDs per the plan's own frontmatter note — no Phase 28 section exists yet in `.planning/REQUIREMENTS.md` (same pre-existing registration gap already logged for Phases 16/22/23/28-01 in STATE.md). `requirements mark-complete` was not run against these provisional IDs; registration is deferred to a future `/gsd-docs-update` pass per the established project convention, not fixed by this executor.

## Known Stubs

None. `FUNUN_STAFF_EMAIL_DOMAINS` is an intentional, documented placeholder for the unshipped Phase 25 `funun_staff` table (not a stub in the "prevents the plan's goal" sense) — the gate it powers (INDUSTRY-07) is fully functional today against the one domain (`funun.studio`) and will be swapped for a real lookup once Phase 25 ships, per the module's own doc comment.

## Threat Flags

None — every threat surface this plan touches (`T-28-02-01`, `T-28-02-02`, `T-28-02-03`) was already registered in `28-02-PLAN.md`'s own `<threat_model>` and is mitigated as designed; no new surface was introduced beyond what the plan specified.

## Self-Check: PASSED

- `lib/green-room/access.ts` — FOUND, exports match plan spec.
- `lib/green-room/post-write.ts` — FOUND, `createGreenRoomPost()` runs the poster gate first.
- `app/api/green-room/feed/route.ts` — FOUND, viewer gate runs before `loadGreenRoomFeed()`.
- `__tests__/green-room-account-gate.test.ts` — FOUND, 10/10 tests green.
- `__tests__/green-room-feed-api.test.ts` — FOUND, updated + green.
- `__tests__/green-room-posts-api.test.ts` — FOUND, updated + green.
- Commit `658bf9c` — FOUND in `git log --oneline`.
- Commit `081326a` — FOUND in `git log --oneline`.
- Commit `be45ae2` — FOUND in `git log --oneline`.
