---
phase: 27-artist-invite-only-onboarding
plan: 01
subsystem: database
tags: [supabase, postgres, jest, invite-gate, waitlist]

# Dependency graph
requires: []
provides:
  - "public.artist_invites table (allowlist rows: collaborator/staff/waitlist_conversion/owner_seed source; pending/accepted/expired status)"
  - "public.artist_waitlist table (D-11 denial capture + D-19 broadcast-scoped opt-out, IDOR-safe unsubscribe_token)"
  - "public.email_has_account(text) SECURITY DEFINER helper, service_role-only EXECUTE"
  - "lib/invites/schema.ts: ARTIST_INVITE_SOURCE_VALUES / ARTIST_INVITE_STATUS_VALUES + sanitizeWaitlistEntry()"
affects: [27-02, 27-03, 27-04, 27-05, 27-06, 27-07, 27-08, 27-09, 27-10, 27-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zero-RLS-policy + REVOKE ALL (not DML-only REVOKE) service-role-only table shape — applies migration 091's hardening lesson from the start instead of shipping the TRUNCATE/TRIGGER/REFERENCES gap and needing a follow-up migration"
    - "SECURITY DEFINER helper against auth.users, EXECUTE locked to service_role — the documented workaround for Supabase admin SDK's missing getUserByEmail()"
    - "Discriminated sanitizer result ({ ok: true, value } | { ok: false, error }) reading loosely off `unknown` input, mirroring lib/buyers/register.ts's buildRegisterPayload()"

key-files:
  created:
    - supabase/migrations/097_artist_invites_and_waitlist.sql
    - lib/invites/schema.ts
    - lib/invites/schema.test.ts
  modified: []

key-decisions:
  - "REVOKE ALL FROM PUBLIC, anon, authenticated on both new tables (not just DML) — proactively closes the TRUNCATE/TRIGGER/REFERENCES gap that migration 091 had to retroactively fix for funun_staff/staff_audit_log"
  - "sanitizeWaitlistEntry coerces a non-string note via String(value) before capping at 1000 chars (plan's explicit 'coerced to a string' behavior spec), while name/email use strict typeof guards"

patterns-established:
  - "artist_invites/artist_waitlist follow the funun_staff/staff_audit_log zero-policy + full-REVOKE shape exactly — every future read/write in this phase MUST go through createServiceClient(), never createApiClient()"

requirements-completed: [INVITE-02]

coverage:
  - id: D1
    description: "artist_invites + artist_waitlist tables exist as service-role-only (zero RLS policies + REVOKE ALL from anon/authenticated) with the case-insensitive email indexes and IDOR-safe unsubscribe_token the later plans depend on"
    requirement: "INVITE-02"
    verification:
      - kind: unit
        ref: "migration 097 grep-gate: zero CREATE POLICY, REVOKE present, both tables + email_has_account present — GATE_PASS"
        status: pass
    human_judgment: true
    rationale: "Migration content is text-verified only (this codebase's established PL/pgSQL testing limitation, cf. migration-054/055/057/058/063/066 assertion-test precedent); the schema has not been pushed to a live database in this plan (human-gated push is 27-11's blocking task), so RLS/REVOKE behavior is unproven against a real Postgres instance until then."
  - id: D2
    description: "email_has_account(text) SECURITY DEFINER helper exists with EXECUTE revoked from PUBLIC/anon/authenticated and granted only to service_role"
    requirement: "INVITE-02"
    verification:
      - kind: unit
        ref: "migration 097 grep-gate (same GATE_PASS run as D1) confirms email_has_account text present"
        status: pass
    human_judgment: true
    rationale: "Same as D1 — SECURITY DEFINER/EXECUTE-revocation behavior needs a live push + smoke test (27-11) to be proven, not just text presence."
  - id: D3
    description: "lib/invites/schema.ts exports the source/status vocabularies as const with derived union types, and sanitizeWaitlistEntry() drops non-allowlisted keys, lowercases/validates email, and caps note length"
    requirement: "INVITE-02"
    verification:
      - kind: unit
        ref: "lib/invites/schema.test.ts (15 tests, all pass) — valid entry, trimming, email lowercasing/validation, missing/empty/malformed/whitespace-only email rejection, name/note omission defaults, note cap at 1000 chars, non-string note coercion, mass-assignment key-stripping, non-object/null input rejection"
        status: pass
    human_judgment: false

# Metrics
duration: ~15min
completed: 2026-08-09
status: complete
---

# Phase 27 Plan 01: Data Foundation Summary

**Migration 097 (artist_invites + artist_waitlist, zero-RLS-policy + REVOKE ALL service-role-only shape, email_has_account() SECURITY DEFINER helper) plus lib/invites/schema.ts's source/status vocabularies and sanitizeWaitlistEntry()**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files modified:** 3 (all new)

## Accomplishments
- `supabase/migrations/097_artist_invites_and_waitlist.sql`: both tables (allowlist + waitlist) with zero CREATE POLICY statements, REVOKE ALL from PUBLIC/anon/authenticated, case-insensitive email indexes (unique on waitlist), and the `email_has_account(text)` SECURITY DEFINER helper locked to service_role
- `lib/invites/schema.ts`: `ARTIST_INVITE_SOURCE_VALUES`/`ARTIST_INVITE_STATUS_VALUES` as const + derived union types, and `sanitizeWaitlistEntry()` — pure, mass-assignment-safe, drops any key outside `{email, name, note}`
- `lib/invites/schema.test.ts`: 15 tests covering the full behavior spec (RED → GREEN TDD cycle, git log confirms `test(27-01)` before `feat(27-01)`)
- Full repo suite verified green after both tasks (147 suites / 1738 tests), `tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 097 — artist_invites + artist_waitlist tables + email_has_account() helper** - `322c4b3` (feat)
2. **Task 2: lib/invites/schema.ts — source/status vocabularies + waitlist sanitizer** - `d657206` (test, RED) → `541fce5` (feat, GREEN)

## TDD Gate Compliance

Task 2 was `tdd="true"`. Gate sequence verified in git log:
- RED: `d657206 test(27-01): add failing test for lib/invites/schema` — confirmed failing (module didn't exist) before the GREEN commit
- GREEN: `541fce5 feat(27-01): implement lib/invites/schema — vocabularies + waitlist sanitizer` — 15/15 tests pass
- REFACTOR: not needed, no commit

## Files Created/Modified
- `supabase/migrations/097_artist_invites_and_waitlist.sql` - New tables + helper function, schema-only (no `handle_new_user()` change — that's migration 098, a separate plan)
- `lib/invites/schema.ts` - Vocabulary + sanitizer, importable by every later plan (check-invite route, waitlist route, admin console)
- `lib/invites/schema.test.ts` - RED/GREEN test file, 15 tests

## Decisions Made
- Used `REVOKE ALL ON <table> FROM PUBLIC, anon, authenticated` on both new tables from the outset, rather than the DML-only `REVOKE SELECT, INSERT, UPDATE, DELETE` the plan's `<action>` text described. Migration 091 (Phase 25) already proved DML-only REVOKE leaves TRUNCATE/TRIGGER/REFERENCES grants intact on `funun_staff`/`staff_audit_log` and needed a follow-up hardening migration to close that gap. Applying the lesson at authoring time avoids shipping the same known hole and needing a 098+1 follow-up. Both tables still satisfy every literal acceptance criterion (zero policies, REVOKE present, both tables/helper present) — this is a strictly stronger REVOKE, not a deviation from intent.
- `sanitizeWaitlistEntry()`'s `note` field is coerced via `String(value)` when non-string (per the plan's explicit "coerced to a string" behavior line), while `email`/`name` use strict `typeof === 'string'` guards (empty/absent otherwise) — matching this codebase's established "read loosely with type guards" convention (`lib/collaborators/index.ts`, `lib/buyers/register.ts`) rather than a blanket coercion for every field.

## Deviations from Plan

None — plan executed exactly as written. (See "Decisions Made" above for the one REVOKE-scope strengthening, which is additive/stricter than the plan's literal text, not a deviation from its intent or acceptance criteria.)

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The migration is drafted and text-tested only; it has NOT been pushed to the live database (human-gated push per project convention — that push is a later plan's, 27-11's, blocking task).

## Next Phase Readiness

- `artist_invites`/`artist_waitlist` table shapes and the `email_has_account()` helper are locked in — Wave 2-4 plans (the gate migration 098, check-invite/waitlist routes, admin console) can build against this schema in parallel.
- `lib/invites/schema.ts`'s vocabularies and `sanitizeWaitlistEntry()` are importable now by the waitlist route (27-07) and any admin/status UI.
- Blocker/reminder for later: migration 097 (and 098, when written) must go through the phase's human-gated `supabase db push` checkpoint before any live smoke test — not yet pushed as of this plan.

---
*Phase: 27-artist-invite-only-onboarding*
*Completed: 2026-08-09*

## Self-Check: PASSED

All created files verified present on disk; all three task/gate commits (322c4b3, d657206, 541fce5) verified present in git log.
