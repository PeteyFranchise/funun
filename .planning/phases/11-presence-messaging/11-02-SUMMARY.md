---
phase: 11-presence-messaging
plan: "02"
subsystem: database
tags: [postgres, supabase, migration, rls, column-privileges]

# Dependency graph
requires:
  - phase: 11-presence-messaging
    provides: 11-01's formatPresenceStatus/countRecentRequests/isConnected/hasUnread consume the columns this migration adds
provides:
  - dm_threads.status (TEXT, default 'direct', CHECK direct|pending|declined) — message-request state machine
  - dm_threads.requester_id (UUID, nullable FK to auth.users) — rate-limit direction + Requests-section split
  - artist_profiles.last_seen_at (TIMESTAMPTZ, nullable) with column-scoped GRANT SELECT to authenticated/anon
  - dm_threads_pending_idx partial index on (requester_id, created_at) WHERE status='pending'
affects:
  - 11-03-PLAN.md (send-gate reads/writes status + requester_id; heartbeat route writes last_seen_at)
  - 11-04-PLAN.md (PresenceTracker reads last_seen_at via presence render)
  - 11-05-PLAN.md (ThreadList/RequestView read status + requester_id)
  - 11-06-PLAN.md (ProfilePresenceDot reads last_seen_at)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Column-privilege doctrine (migration-040): new columns on a REVOKE-locked table get zero grant by default — must add an explicit column-scoped GRANT SELECT, never a table-level GRANT"
    - "Idempotent migrations: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS throughout"

key-files:
  created:
    - supabase/migrations/054_dm_request_status_presence.sql
    - __tests__/migration-054.test.ts
  modified: []

key-decisions:
  - "DEFAULT 'direct' on dm_threads.status grandfathers all pre-Phase-11 threads as direct conversations — the connection gate applies only to NEW thread starts (D-DISCRETION)"
  - "No UPDATE grant on last_seen_at for authenticated — only the service-role heartbeat route (Plan 03) writes it, preventing a member from forging their own 'Active now' via direct PostgREST (T-11-04)"
  - "dm_threads RLS (dmt_insert_participant + no_block()) left untouched — the connection gate lives in the API layer (Plan 03), not RLS"

patterns-established:
  - "Partial index ordering: a CREATE INDEX referencing a column added earlier in the same file must come after that column's ADD COLUMN statement — Postgres runs a migration file as one batch and rolls back the whole thing on a mid-file error"

requirements-completed: [PRESENCE-01, PRESENCE-02, CONNECT-03, CONNECT-04]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "dm_threads.status column exists with correct CHECK constraint and DEFAULT 'direct', grandfathering existing threads"
    requirement: CONNECT-03
    verification:
      - kind: unit
        ref: "__tests__/migration-054.test.ts"
        status: pass
      - kind: manual_procedural
        ref: "operator: SELECT column_name FROM information_schema.columns WHERE table_name='dm_threads' AND column_name IN ('status','requester_id') — 2 rows confirmed live"
        status: pass
    human_judgment: false
  - id: D2
    description: "dm_threads.requester_id column exists, nullable FK to auth.users, for rate-limit direction and Requests-section split"
    requirement: CONNECT-04
    verification:
      - kind: unit
        ref: "__tests__/migration-054.test.ts"
        status: pass
      - kind: manual_procedural
        ref: "operator: same information_schema check as D1 — 2 rows confirmed live"
        status: pass
    human_judgment: false
  - id: D3
    description: "artist_profiles.last_seen_at column exists with column-scoped GRANT SELECT to authenticated/anon, no table-level grant, no UPDATE grant"
    requirement: PRESENCE-01
    verification:
      - kind: unit
        ref: "__tests__/migration-054.test.ts"
        status: pass
      - kind: manual_procedural
        ref: "operator: SELECT has_column_privilege('authenticated','artist_profiles','last_seen_at','SELECT') — returned t"
        status: pass
    human_judgment: false
  - id: D4
    description: "Migration 054 pushed live and confirmed present in both LOCAL and REMOTE via supabase migration list"
    requirement: PRESENCE-02
    verification:
      - kind: manual_procedural
        ref: "operator: npx supabase migration list — 054 populated in both LOCAL and REMOTE columns"
        status: pass
    human_judgment: false

# Metrics
duration: checkpoint-spanning
completed: 2026-07-13
status: complete
---

# Phase 11 Plan 02: DM Request Status + Presence Schema Summary

**Migration 054 adds dm_threads.status/requester_id (message-request state machine) and artist_profiles.last_seen_at (presence, column-privilege-locked), pushed and verified live on Supabase**

## Performance

- **Duration:** checkpoint-spanning (blocking human push required)
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Authored `supabase/migrations/054_dm_request_status_presence.sql`: `dm_threads.status` (default `'direct'`, CHECK `direct|pending|declined`), `dm_threads.requester_id` (nullable FK to `auth.users`), partial index `dm_threads_pending_idx`, and `artist_profiles.last_seen_at` with column-scoped `GRANT SELECT` per the migration-040 doctrine
- Content-assertion test `__tests__/migration-054.test.ts` (9 tests) confirms all required DDL fragments present and the columnless-GRANT negative assertion (no table-level `GRANT SELECT ON artist_profiles`)
- Migration pushed live via `supabase db push` and independently verified: `npx supabase migration list` shows 054 in both LOCAL and REMOTE; both operator-run column spot-checks passed

## Task Commits

1. **Task 1: Author migration 054 + content-assertion test** - `57d249e` (feat)
2. **Fix: reorder requester_id column before its index** - `c0d0dd3` (fix)
3. **Task 2: [BLOCKING] Push migration 054 and verify LOCAL=REMOTE** - operator-run, no code commit (checkpoint)

## Files Created/Modified

- `supabase/migrations/054_dm_request_status_presence.sql` — additive schema migration
- `__tests__/migration-054.test.ts` — migration-content assertion test (9 tests)

## Decisions Made

- Grandfathering all existing `dm_threads` rows as `'direct'` via `DEFAULT 'direct'` rather than backfilling — the connection gate is a forward-only rule (D-DISCRETION)
- No `UPDATE` grant on `last_seen_at` for `authenticated` — mirrors migration 040's `sound_identity` rationale; only the service-role heartbeat writes it

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Correctness] Migration failed on first live push — index referenced a not-yet-existing column**

- **Found during:** Task 2 (operator ran `supabase db push`)
- **Issue:** `CREATE INDEX dm_threads_pending_idx ON dm_threads (requester_id, ...)` was ordered before the `ALTER TABLE ... ADD COLUMN IF NOT EXISTS requester_id` statement in the same file. `supabase db push` sends the whole migration as one batch; Postgres hit `42703 column "requester_id" does not exist` on the index statement and rolled back the entire migration — nothing landed on remote.
- **Fix:** Moved the `ADD COLUMN requester_id` statement ahead of the `CREATE INDEX` statement that references it.
- **Files modified:** `supabase/migrations/054_dm_request_status_presence.sql`
- **Verification:** `npm test -- --testPathPatterns=migration-054` still 9/9 pass (order-independent string assertions); `supabase db push --dry-run` confirmed nothing had partially landed before the fix; re-run of `supabase db push` after the fix applied cleanly; `npx supabase migration list` confirmed 054 in LOCAL+REMOTE; both column spot-checks passed live.
- **Committed in:** `c0d0dd3`

---

**Total deviations:** 1 auto-fixed (1 correctness/ordering bug caught by the live push itself — build/Jest could not have caught this since both are DB-agnostic)
**Impact on plan:** Necessary correctness fix; no scope creep. Confirms the plan's own rationale for treating the push as a mandatory blocking checkpoint rather than a build-time check.

## Issues Encountered

Migration ordering bug (see Deviations above) — resolved same session, no scope change.

## User Setup Required

Completed as part of this plan's blocking checkpoint: operator ran `supabase db push` (with DB password) and `npx supabase migration list`, and confirmed both column spot-checks live. No further setup required.

## Next Phase Readiness

- Wave 3 (11-03, 11-04) unblocked: `dm_threads.status`/`requester_id` and `artist_profiles.last_seen_at` exist live with correct privileges
- No blockers

## Self-Check: PASSED

- `supabase/migrations/054_dm_request_status_presence.sql` exists: FOUND
- `__tests__/migration-054.test.ts` exists: FOUND
- Task 1 commit exists in git log: `57d249e` — FOUND
- Fix commit exists in git log: `c0d0dd3` — FOUND
- `npm test -- --testPathPatterns=migration-054`: 9/9 pass — CONFIRMED
- `npx supabase migration list` shows 054 in LOCAL and REMOTE — CONFIRMED (operator + independent re-check)
- Column spot-checks (`information_schema.columns`, `has_column_privilege`) — CONFIRMED by operator

---
*Phase: 11-presence-messaging*
*Completed: 2026-07-13*
