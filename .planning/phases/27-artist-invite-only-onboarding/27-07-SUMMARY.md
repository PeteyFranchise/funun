---
phase: 27-artist-invite-only-onboarding
plan: 07
subsystem: api
tags: [nextjs, rate-limiting, turnstile, supabase, jest, waitlist]

# Dependency graph
requires:
  - phase: 27-artist-invite-only-onboarding
    provides: "27-01: artist_waitlist table (migration 097) + lib/invites/schema.ts sanitizeWaitlistEntry()"
  - phase: 27-artist-invite-only-onboarding
    provides: "27-02: lib/security/rate-limit.ts createRateLimiter()/getClientIp() + lib/security/turnstile.ts verifyTurnstileToken()"
provides:
  - "POST /api/waitlist — public D-11/D-12 waitlist capture (rate-limit + Turnstile + sanitizer) with D-19 auto-resubscribe on rejoin"
  - "POST /api/waitlist/resubscribe — public D-19 token-scoped re-opt-in, IDOR-safe (unsubscribe_token only)"
affects: [27-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Select-by-email + branch (update/insert) as the auto-resubscribe upsert substitute where the DB's uniqueness is a functional index (LOWER(email)) rather than a plain-column unique constraint PostgREST's on_conflict can target"

key-files:
  created:
    - app/api/waitlist/route.ts
    - app/api/waitlist/route.test.ts
    - app/api/waitlist/resubscribe/route.ts
    - app/api/waitlist/resubscribe/route.test.ts
  modified: []

key-decisions:
  - "Implemented the D-19 auto-resubscribe 'upsert' as select-by-email then branch (update existing row / insert new row), not a literal single-statement ON CONFLICT, because artist_waitlist's uniqueness (migration 097) is a functional UNIQUE INDEX on LOWER(email), not a plain-column unique constraint — PostgREST's on_conflict merge parameter only accepts column names, not expressions, so it cannot target that index through the service-role JS client. sanitizeWaitlistEntry() always lowercases email before it reaches this route, so a plain .eq('email', ...) select reliably finds the same row the functional index would match. A race guard (23505 on insert -> retry as update) covers the concurrent-submit edge case."
  - "Neutral 200 { ok: true } response for both routes on all non-rate-limited, non-captcha-failed paths — never reveals whether an email was already on the waitlist (mirrors sync/register's account-enumeration-avoidance discipline) or whether a resubscribe token existed beyond the binary 200/404."

patterns-established:
  - "Public write routes needing the D-19-style 'find-or-create + clear a status flag' behavior against a functional-index-uniqueness table should follow the select-then-branch pattern here rather than assuming PostgREST upsert(onConflict) works against any DB-level uniqueness constraint."

requirements-completed: [INVITE-07, INVITE-12]

coverage:
  - id: D1
    description: "POST /api/waitlist captures {email,name,note} behind ip+email rate-limit and fail-closed Turnstile verification, upserting artist_waitlist with a neutral response"
    requirement: "INVITE-07"
    verification:
      - kind: unit
        ref: "app/api/waitlist/route.test.ts — 'captures a new waitlist entry behind captcha + rate-limit and returns a neutral success', 'returns 429 after the ip rate-limit threshold is exceeded', 'returns 429 after the email rate-limit threshold is exceeded'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Turnstile verification failure rejects with 400 BEFORE any DB write (fail-closed) — createServiceClient is never invoked on the captcha-fail path"
    requirement: "INVITE-07"
    verification:
      - kind: unit
        ref: "app/api/waitlist/route.test.ts — 'rejects before any DB write when Turnstile verification fails (fail-closed)'"
        status: pass
    human_judgment: false
  - id: D3
    description: "Invalid email is rejected 400 via sanitizeWaitlistEntry before Turnstile/DB are ever touched; mass-assignment keys (status/id/unsubscribed_at) never reach the insert payload"
    requirement: "INVITE-07"
    verification:
      - kind: unit
        ref: "app/api/waitlist/route.test.ts — 'returns 400 on an invalid email and never calls Turnstile or the DB', 'drops extra keys via the sanitizeWaitlistEntry allowlist (mass-assignment defense)'"
        status: pass
    human_judgment: false
  - id: D4
    description: "Re-submitting the waitlist form for an existing email clears unsubscribed_at (auto-resubscribe, D-19)"
    requirement: "INVITE-12"
    verification:
      - kind: unit
        ref: "app/api/waitlist/route.test.ts — 'clears unsubscribed_at on the conflict path (auto-resubscribe, D-19)'"
        status: pass
    human_judgment: false
  - id: D5
    description: "POST /api/waitlist/resubscribe clears unsubscribed_at for the row matching unsubscribe_token; unknown/missing token returns a generic 404; the route never filters on id or email (IDOR-safe, T-27-05); ip rate-limited"
    requirement: "INVITE-12"
    verification:
      - kind: unit
        ref: "app/api/waitlist/resubscribe/route.test.ts — all 5 tests ('clears unsubscribed_at for a row matching the token', 'returns a generic 404 for an unknown token', 'returns 404 for a missing token without touching the DB', 'never accepts a row id or email as the resubscribe key (IDOR-safe, T-27-05)', 'returns 429 after the ip rate-limit threshold is exceeded')"
        status: pass
    human_judgment: false
  - id: D6
    description: "Both routes compile cleanly under tsc --noEmit and npm run build (route manifest includes /api/waitlist and /api/waitlist/resubscribe)"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (clean); npm run build (both routes listed in output)"
        status: pass
    human_judgment: false

# Metrics
duration: ~20min
completed: 2026-08-09
status: complete
---

# Phase 27 Plan 07: Public Waitlist Submit + Resubscribe API Routes Summary

**POST /api/waitlist (rate-limit + fail-closed Turnstile + sanitizeWaitlistEntry allowlist, D-19 auto-resubscribe via select-then-branch) and POST /api/waitlist/resubscribe (IDOR-safe token-scoped re-opt-in)**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2
- **Files modified:** 4 (all new)

## Accomplishments
- `app/api/waitlist/route.ts` — public POST, no session gate: ip+email rate limits (shared limiter from 27-02), fail-closed Turnstile verification strictly before any DB call, `sanitizeWaitlistEntry()` field allowlist (27-01), and a select-by-email/branch upsert substitute that clears `unsubscribed_at` on the existing-row path (D-19 auto-resubscribe on rejoin)
- `app/api/waitlist/resubscribe/route.ts` — public POST, ip rate-limited, clears `unsubscribed_at` for the row matching `unsubscribe_token` only (never id/email — T-27-05 IDOR mitigation), generic 404 on unknown/missing token
- Both routes tested (7 + 5 tests, all TDD RED→GREEN), full repo suite verified green (155 suites / 1810 tests), `tsc --noEmit` clean, `npm run build` clean with both routes present in the route manifest

## Task Commits

Each task was committed atomically:

1. **Task 1: POST /api/waitlist — captcha + rate-limited upsert with auto-resubscribe** — `db74819` (test, RED) → `4a87133` (feat, GREEN)
2. **Task 2: POST /api/waitlist/resubscribe — token-scoped re-opt-in** — `67881d5` (test, RED) → `fb4e58a` (feat, GREEN)

## TDD Gate Compliance

Both tasks were `tdd="true"`. Gate sequence verified in git log:
- Task 1: RED `db74819 test(27-07): add failing test for POST /api/waitlist` (module-not-found failure, confirmed before implementation existed) → GREEN `4a87133 feat(27-07): implement POST /api/waitlist ...` (7/7 tests pass)
- Task 2: RED `67881d5 test(27-07): add failing test for POST /api/waitlist/resubscribe` → GREEN `fb4e58a feat(27-07): implement POST /api/waitlist/resubscribe ...` (5/5 tests pass)
- REFACTOR: not needed for either task, no commit

## Files Created/Modified
- `app/api/waitlist/route.ts` — public waitlist capture route
- `app/api/waitlist/route.test.ts` — 7 tests (valid submit, captcha-fail short-circuit, invalid email, ip/email 429s, auto-resubscribe conflict path, mass-assignment allowlist)
- `app/api/waitlist/resubscribe/route.ts` — public resubscribe route
- `app/api/waitlist/resubscribe/route.test.ts` — 5 tests (valid token, unknown token 404, missing token 404, IDOR-safety, ip 429)

## Decisions Made
- **Auto-resubscribe implemented as select-then-branch, not a literal `ON CONFLICT`.** 27-RESEARCH's illustrative SQL (`ON CONFLICT (email_lower) DO UPDATE ...`) assumed a plain-column conflict target, but migration 097 (27-01) built `artist_waitlist`'s uniqueness as a functional `UNIQUE INDEX ON (LOWER(email))`, not a unique constraint on the `email` column itself. Postgres's `ON CONFLICT` syntax can target an expression index in raw SQL, but PostgREST's `on_conflict` query parameter (what `supabase-js`'s `.upsert()` generates) only accepts plain column names — it cannot express `ON CONFLICT (LOWER(email))` through the service-role JS client. Since `sanitizeWaitlistEntry()` always lowercases the email before this route ever sees it (27-01), a plain `SELECT ... WHERE email = <lowercased>` reliably finds the same row the functional index would match; the route selects first, then updates (clearing `unsubscribed_at`, matching D-19) or inserts. A `23505` unique-violation on insert (a genuine race between two concurrent submits for the same email) falls back to a retry-select + update rather than erroring, so the losing request still ends in the correct auto-resubscribed state. This reaches the exact same final DB state as the RESEARCH sketch; it is an implementation-detail adaptation to the actual schema, not a behavior deviation from any `must_haves` truth or acceptance criterion.
- **200, not 201, for both routes' success response.** The plan's acceptance criteria allowed either ("201/200 success"); 200 was chosen since both routes primarily represent a state-toggle/upsert on an existing resource concept (a waitlist membership), not resource creation in the REST sense, and both existing-row and new-row paths return the identical response — matching the "neutral response" requirement (never reveal via status code whether the row was new or existing).

## Deviations from Plan

None — plan executed exactly as written. The select-then-branch upsert implementation (see Decisions Made) is a necessary technical adaptation to migration 097's actual functional-index schema (which this plan's `files_modified` list does not include and could not modify) rather than a deviation from the plan's `must_haves` or acceptance criteria — every literal `must_haves.truths` line and `acceptance_criteria` bullet is satisfied by the tests above.

## Issues Encountered

None beyond the schema/PostgREST `on_conflict` limitation resolved via the select-then-branch pattern documented above.

## User Setup Required

None triggered by this plan directly. `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` are read by `verifyTurnstileToken()` (imported, not newly wired) — provisioning happens at the 27-11 checkpoint per the phase's established sequencing; without them, `verifyTurnstileToken` fails closed (returns `false`), so the waitlist route safely rejects all submissions rather than opening to abuse until the keys are set.

## Next Phase Readiness

- `POST /api/waitlist` and `POST /api/waitlist/resubscribe` are ready for 27-09's signup/unsubscribe pages to call directly — no further route work needed for the D-11/D-12/D-19 waitlist capture + resubscribe flows.
- Migration 097 (and 098, when written) still needs the phase's human-gated `supabase db push` + live smoke test (27-11) before either route is truly load-bearing against a live database — unchanged from 27-01's status.
- No blockers for 27-08/27-09.

---
*Phase: 27-artist-invite-only-onboarding*
*Completed: 2026-08-09*

## Self-Check: PASSED

All 4 created files verified present on disk; all 4 task/gate commits (db74819, 4a87133, 67881d5, fb4e58a) verified present in git log.
