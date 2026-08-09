---
phase: 27-artist-invite-only-onboarding
plan: 04
subsystem: auth
tags: [supabase, postgres-trigger, plpgsql, jest, ts-jest, twin-parity]

# Dependency graph
requires:
  - phase: 27-artist-invite-only-onboarding (plan 01)
    provides: "supabase/migrations/097_artist_invites_and_waitlist.sql (artist_invites/artist_waitlist tables, email_has_account() RPC) and lib/invites/schema.ts (status/source vocabulary)"
provides:
  - "The server-authoritative artist-signup invite gate (migration 098) — the real, unbypassable boundary (D-02)"
  - "lib/invites/allowlist.ts — isArtistEmailAllowed()/emailHasExistingAccount(), the TS twin the pre-check UX route (27-06) will reuse"
  - "lib/invites/invite-fixtures.ts — the shared twin-parity scenario table anchoring both the TS test and the migration-content test"
affects: [27-06-check-invite-route, 27-11-migration-push-checkpoint]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PL/pgSQL migration-content assertion test (no live DB) for a trigger-body gate, mirroring migrations 054-087's established convention"
    - "Shared TS fixture table imported by both a unit test and a migration-content test to guard SQL<->TS predicate drift"
    - "Fake Supabase query-builder mocks that apply real email/status/expiry filtering (not just trusting `expected`) for genuine behavioral coverage"

key-files:
  created:
    - lib/invites/allowlist.ts
    - lib/invites/allowlist.test.ts
    - lib/invites/invite-fixtures.ts
    - supabase/migrations/098_artist_signup_gate.sql
    - __tests__/migration-098-gate.test.ts
  modified: []

key-decisions:
  - "Gate placed as the first statement inside handle_new_user()'s default/artist branch only, after the curator/buyer/industry RETURN NEW blocks — never a separate BEFORE INSERT trigger (RESEARCH Pattern 1)."
  - "isArtistEmailAllowed() uses .ilike('email', trimmed) with no wildcards as the case-insensitive TS mirror of the SQL LOWER(email) = LOWER(email) match."
  - "Migration 098 is TEXT/test only in this plan — never `supabase db push` from an agent; the live push is plan 27-11's human-gated blocking task."

patterns-established:
  - "Twin-parity fixture table (lib/invites/invite-fixtures.ts) as the single source of truth consumed by both a Jest unit test and a migration-content structural test — the mitigation for RESEARCH Pitfall 3 (SQL<->TS drift)."

requirements-completed: [INVITE-01, INVITE-02]

coverage:
  - id: D1
    description: "isArtistEmailAllowed() TS predicate mirrors the SQL gate — collaborator match OR pending/unexpired invite match, case-insensitive, denies expired/accepted invites"
    requirement: "INVITE-02"
    verification:
      - kind: unit
        ref: "lib/invites/allowlist.test.ts#isArtistEmailAllowed (all 6 fixture scenarios + empty-email guard)"
        status: pass
    human_judgment: false
  - id: D2
    description: "emailHasExistingAccount() routes through the service-role email_has_account RPC, never a client query, fail-closed on RPC error"
    requirement: "INVITE-02"
    verification:
      - kind: unit
        ref: "lib/invites/allowlist.test.ts#emailHasExistingAccount"
        status: pass
    human_judgment: false
  - id: D3
    description: "Migration 098 gates the artist branch only — curator/buyer/industry branches reproduced byte-for-byte from migration 086, unreachable by the new gate"
    requirement: "INVITE-01"
    verification:
      - kind: unit
        ref: "__tests__/migration-098-gate.test.ts#SCOPE and #PLACEMENT (RESEARCH Pitfall 1)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Uninvited signup raises 'not_invited' (ERRCODE P0001) before any INSERT, rolling back the whole transaction; admitted signup marks the matching artist_invites row accepted (exception-isolated) before the unchanged user_profiles/subscriptions inserts and claim_collaborators() call"
    requirement: "INVITE-01"
    verification:
      - kind: unit
        ref: "__tests__/migration-098-gate.test.ts#raises with ERRCODE P0001, #accept-marking UPDATE is exception-isolated, #claim_collaborators() unchanged"
        status: pass
    human_judgment: false
  - id: D5
    description: "SQL <-> TS twin-parity: both sides checked against the same shared fixture table, no independent drift"
    requirement: "INVITE-02"
    verification:
      - kind: unit
        ref: "__tests__/migration-098-gate.test.ts#twin-parity (describe.each over INVITE_ALLOWLIST_SCENARIOS)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Live enforcement (actual uninvited-reject / invited-admit / owner-unaffected smoke against a real DB) — this plan is structural/unit-only by design"
    verification: []
    human_judgment: true
    rationale: "Migration 098 is intentionally TEXT/test-only per its header (HUMAN-GATED — never `supabase db push` from an agent). Live smoke verification is plan 27-11's blocking checkpoint, run by the owner via Codex after human review of the push."

duration: 35min
completed: 2026-08-09
status: complete
---

# Phase 27 Plan 04: Server-Authoritative Invite Gate Summary

**Migration 098 gates `handle_new_user()`'s artist branch on `artist_invites`/`collaborators` membership (RAISE EXCEPTION rolls back the whole signup transaction on the uninvited path), with a TypeScript twin (`isArtistEmailAllowed`) and a shared fixture table that anchors a migration-content test proving both sides can't silently drift.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-09T00:00:00Z (approx — sequential main-tree execution, no worktree timestamp)
- **Completed:** 2026-08-09
- **Tasks:** 3/3
- **Files modified:** 5 created, 0 modified

## Accomplishments
- The real, unbypassable boundary (D-02): migration 098 re-defines `handle_new_user()` with the curator/buyer/industry branches reproduced verbatim from migration 086, and a new gate as the first statement inside the default (artist) branch only — an uninvited email's `RAISE EXCEPTION 'not_invited'` rolls back the entire transaction, leaving no `auth.users` row and no `user_profiles` row.
- The admitted path marks the matching `artist_invites` row `accepted` (exception-isolated, so a mark-accepted failure can never roll back a legitimate signup) before the unchanged `user_profiles`/`subscriptions` inserts and `claim_collaborators()` call — claim now only ever runs for admitted signups by construction.
- `lib/invites/allowlist.ts` exports `isArtistEmailAllowed()` (the TS mirror the 27-06 pre-check route will reuse) and `emailHasExistingAccount()` (routes through the service-role `email_has_account` RPC from migration 097, fail-closed on error).
- `lib/invites/invite-fixtures.ts` is the single twin-parity anchor: 6 scenarios (collaborator-only, pending-invite, expired-invite, accepted-invite, no-match, mixed-case) consumed by both `lib/invites/allowlist.test.ts` (drives the real TS predicate against a fake service client that applies genuine email/status/expiry filtering) and `__tests__/migration-098-gate.test.ts` (structural presence assertions against the SQL text, since Jest cannot execute PL/pgSQL).
- The migration-content test's placement assertion is a real regression guard: it fails if the gate is ever moved before the industry branch's `RETURN NEW`, proving RESEARCH Pitfall 1 (gate scoped too broadly) is caught automatically.

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/invites/allowlist.ts (TS predicate) + shared fixture table** - `0cde50a` (feat)
2. **Task 2: Migration 098 — handle_new_user() artist-branch invite gate** - `b45962e` (feat)
3. **Task 3: migration-098-gate.test.ts — placement assertion + twin-parity guard** - `c835e70` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/invites/allowlist.ts` - `isArtistEmailAllowed()` / `emailHasExistingAccount()`, the TS twin of the SQL gate predicate
- `lib/invites/allowlist.test.ts` - drives the predicate against every fixture scenario with a fake service client that applies real filtering
- `lib/invites/invite-fixtures.ts` - `INVITE_ALLOWLIST_SCENARIOS`, the shared twin-parity anchor
- `supabase/migrations/098_artist_signup_gate.sql` - `handle_new_user()` re-defined with the artist-branch invite gate + accept-marking (TEXT/test only, not pushed)
- `__tests__/migration-098-gate.test.ts` - placement + scope + twin-parity structural assertions against the migration text

## Decisions Made
- Followed RESEARCH Pattern 1 exactly: gate is the first statement inside the default (artist) branch, after all three role-specific `RETURN NEW` blocks, never a second `BEFORE INSERT` trigger.
- `isArtistEmailAllowed()`'s case-insensitive email match uses `.ilike('email', trimmed)` with no wildcard characters — the closest Supabase-js equivalent to the SQL side's `LOWER(email) = LOWER(email)`, since no wildcards makes `ilike` behave as case-insensitive exact match.
- The migration-content test's index lookups had to search from `CREATE OR REPLACE FUNCTION public.handle_new_user()` onward rather than the whole file — the migration's own header-comment prose mentions the string `RAISE EXCEPTION 'not_invited'` for documentation purposes, which would otherwise make `indexOf` match the comment instead of the real code (caught and fixed during Task 3's own test run — see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Migration-content test's `indexOf` matched the header-comment prose instead of the real gate code**
- **Found during:** Task 3, first test run (`npx jest __tests__/migration-098-gate.test.ts`)
- **Issue:** Migration 098's own WHY/WHAT header comment documents the gate using the literal string `RAISE EXCEPTION 'not_invited'` (for human readability). `migration.indexOf("RAISE EXCEPTION 'not_invited'")` with no start offset matched that comment occurrence (near the top of the file) instead of the actual code inside the function body (much further down), making the PLACEMENT and SCOPE assertions fail with wildly wrong indices.
- **Fix:** Computed a `functionBodyStart` index at `CREATE OR REPLACE FUNCTION public.handle_new_user()` and searched for the gate string starting from there (`migration.indexOf("RAISE EXCEPTION 'not_invited'", functionBodyStart)`), then reused that single `gateIdx` constant across all tests instead of re-deriving it per-test.
- **Files modified:** `__tests__/migration-098-gate.test.ts`
- **Verification:** All 14 tests in the file pass; `npm test` (full 152-suite/1781-test run) green.
- **Committed in:** `c835e70` (Task 3 commit — fixed before first commit, not a follow-up)

---

**Total deviations:** 1 auto-fixed (1 bug in the test itself, caught by its own first run)
**Impact on plan:** No scope creep — the fix was entirely inside the test file being authored in Task 3, required for the test to correctly exercise its own PLACEMENT/SCOPE assertions against migration 098's real structure.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None — no external service configuration required. Migration 098 is TEXT/test only in this plan; it is NOT pushed to any Supabase environment. The live `supabase db push` + smoke test (uninvited rejected, invited admitted, owner unaffected) is plan 27-11's human-gated blocking checkpoint, run by the owner via Codex.

## Next Phase Readiness
- `lib/invites/allowlist.ts`'s `isArtistEmailAllowed()`/`emailHasExistingAccount()` are ready for plan 27-06's `POST /api/signup/check-invite` pre-check route to import directly (per RESEARCH Pattern 2).
- Migration 098 is drafted and structurally test-guarded but not pushed — plan 27-11 must confirm the owner's bootstrap artist account / `artist_invites` seed row exists (RESEARCH Pitfall 2 — bootstrap self-lockout) before pushing, per its own blocking-checkpoint scope.
- Full test suite (`npm test`) and `npm run build` both green after this plan; no regressions introduced.

---
*Phase: 27-artist-invite-only-onboarding*
*Completed: 2026-08-09*

## Self-Check: PASSED

All 5 created files verified present on disk; all 3 task commits (`0cde50a`, `b45962e`, `c835e70`) verified present in `git log`.
