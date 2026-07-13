---
phase: 10-connections-notifications
plan: 02
subsystem: database
tags: [postgres, supabase, rls, trigger, connections, follows, migration]

# Dependency graph
requires:
  - phase: 08-identity-schema-foundation
    provides: connections/follows/blocks tables, no_block() SECURITY DEFINER helper (migration 035/038)
  - phase: 10-connections-notifications
    provides: "Plan 01's buildConnectRequest()/buildRespondTransition() payload builders (TS-layer note-length pre-check that this migration backstops)"
provides:
  - "connections.note TEXT column with a 200-char Postgres CHECK constraint (D-04)"
  - "connections_insert_own policy re-created WITH CHECK including no_block(auth.uid(), addressee_id) — closes the migration-038 gap (Pitfall 2 / T-10-04)"
  - "connections_seed_follows() SECURITY DEFINER trigger (connections_on_accept, AFTER UPDATE) that atomically seeds both follows directions on a pending->accepted transition"
affects: [10-03-connections-notifications-api, 10-04-notification-trigger-wiring, 13-network-tab-trust-safety]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER trigger with SET search_path = '' + fully-qualified public.<table> as the RLS-safe mechanism for cross-party writes the session client cannot legally perform (mirrors no_block()'s search-path-hijack guard)"

key-files:
  created:
    - supabase/migrations/044_connections_note.sql
  modified: []

key-decisions:
  - "Migration 044 pushed live and DB-verified by the human operator via supabase db push + supabase migration list (LOCAL=REMOTE for 001-044), per this project's established schema-push convention (STATE.md Blockers/Concerns log, mirrored from Phases 8/9/15)"
  - "All three DB-level smoke checks were run against the live production database wrapped in explicit `set local role authenticated; set local request.jwt.claims` transactions (not as the SQL Editor's default superuser `postgres` role), since naive inserts as postgres would bypass RLS entirely and produce a false-positive verification"

patterns-established:
  - "Additive-migration DB-level smoke verification: passing-path tests use commit + explicit cleanup DELETE; rejection-path tests (CHECK/RLS violations) use rollback so no residue is left in production tables"

requirements-completed: [CONNECT-02]

coverage:
  - id: D1
    description: "connections.note column added with a 200-char Postgres CHECK constraint, enforced at the DB layer as the hard backstop to Plan 01's TS-layer pre-check"
    requirement: "CONNECT-02"
    verification:
      - kind: manual_procedural
        ref: "Live-DB smoke check (b): 201-char note insert rejected with ERROR 23514 (connections_note_check), rolled back, no residue"
        status: pass
    human_judgment: false
  - id: D2
    description: "connections_insert_own policy closes the no_block() wiring gap left open by migration 038 — a blocked party's connect request is rejected at the DB layer (T-10-04)"
    requirement: "CONNECT-02"
    verification:
      - kind: manual_procedural
        ref: "Live-DB smoke check (c): blocked-party INSERT rejected with ERROR 42501 (RLS policy violation), rolled back, no residue"
        status: pass
    human_judgment: false
  - id: D3
    description: "connections_seed_follows() SECURITY DEFINER trigger seeds both follows directions atomically on accept — the accepting user's own RLS session cannot perform this write (Pitfall 1)"
    requirement: "CONNECT-02"
    verification:
      - kind: manual_procedural
        ref: "Live-DB smoke check (a): pending connection A->B accepted as B; SELECT on follows for both (A,B) and (B,A) returned exactly 2 rows with matching timestamps; passing rows explicitly deleted after commit"
        status: pass
    human_judgment: false
  - id: D4
    description: "Migration 044 applied and confirmed live on the remote database via supabase migration list (LOCAL and REMOTE populated for 044, matching 001-043)"
    requirement: "CONNECT-02"
    verification:
      - kind: manual_procedural
        ref: "Human operator ran supabase db push (via Homebrew Supabase CLI, post supabase login) + supabase migration list; confirmed 044 in both LOCAL and REMOTE columns"
        status: pass
    human_judgment: false

duration: unable to measure end-to-end (spans a human-approval checkpoint pause between sessions); Task 1 authored in ~2min, Task 2 (schema push + smoke verification) executed by the human operator in a separate session
completed: 2026-07-12
status: complete
---

# Phase 10 Plan 02: Connections Note Column, Block-Gap Closure & Auto-Follow-Seed Trigger Summary

**Migration 044 shipped and pushed live: `connections.note` (200-char CHECK), the `no_block()` gap closed on `connections` INSERT (T-10-04), and a `SECURITY DEFINER` trigger that seeds both `follows` directions atomically when a Connect request is accepted — all three confirmed via live-DB smoke checks run under simulated RLS sessions.**

## Performance

- **Started:** 2026-07-12T11:18:16-04:00 (Task 1 commit `1747f87`)
- **Completed:** 2026-07-12 (Task 2 human-verify checkpoint approved)
- **Tasks:** 2 (1 auto + 1 blocking human-verify checkpoint)
- **Files modified:** 1

## Accomplishments
- Authored `supabase/migrations/044_connections_note.sql` — three additive changes in one migration: `note` column + CHECK, `connections_insert_own` re-created with `no_block()`, and the `connections_seed_follows()` / `connections_on_accept` SECURITY DEFINER trigger
- Migration pushed live via `supabase db push`; `supabase migration list` confirms `044` in both LOCAL and REMOTE columns, matching migrations 001-043
- Ran all three DB-level smoke checks against the live production database using two real test accounts, each wrapped in a `set local role authenticated; set local request.jwt.claims` transaction to correctly simulate `auth.uid()` under RLS (avoiding the SQL Editor's default superuser bypass):
  - Auto-follow-seed: accepted a pending connection A->B, confirmed both `(A,B)` and `(B,A)` rows exist in `follows` with matching timestamps
  - Note CHECK: a 201-char note insert was rejected with `23514` (`connections_note_check`)
  - `no_block()` gate: a connect request from a blocked party was rejected with `42501` (RLS policy violation)
- No test residue left in `connections`/`follows`/`blocks` — the passing test's rows were explicitly deleted; the two rejected-insert tests used `rollback`

## Task Commits

Each task was committed atomically:

1. **Task 1: Write migration 044 — note column + no_block() wiring + auto-follow-seed trigger** - `1747f87` (feat)
2. **Task 2: [BLOCKING] Schema push + DB-level smoke verification for migration 044** - checkpoint:human-verify, no code commit (DB-state change only — human operator ran `supabase db push` + live-DB SQL Editor checks; approved 2026-07-12)

**Plan metadata:** (this commit) `docs(10-02): complete plan`

## Files Created/Modified
- `supabase/migrations/044_connections_note.sql` - Adds `connections.note` (200-char CHECK), closes the `no_block()` gap on `connections_insert_own`, and adds the `connections_on_accept` SECURITY DEFINER auto-follow-seed trigger

## Decisions Made
- Confirmed the migration is live via the project's established human-verify convention (schema pushes are never run unattended by CI) — mirrors the Phase 8/9/15 precedent already logged in STATE.md
- DB-level smoke checks were run as `authenticated` (not the SQL Editor's default `postgres` superuser) via explicit `set local role` + `set local request.jwt.claims`, so the RLS policies under test were actually exercised rather than bypassed
- Passing-path smoke test committed and then explicitly cleaned up (deleted); rejection-path smoke tests used `rollback` — no residue left in production tables either way

## Deviations from Plan

None - plan executed exactly as written. Task 2's human-verify checkpoint was approved with all three smoke checks passing as specified in the plan's `<how-to-verify>`.

## Issues Encountered
None.

## User Setup Required

None - no further external service configuration required. The schema push itself (Task 2) was the one manual step this plan required, and it is now complete.

## Next Phase Readiness
- `connections.note`, the `no_block()` gate, and the auto-follow-seed trigger are all live on the remote database — Plan 03 (`app/api/connections/route.ts`, `app/api/notifications/route.ts`) can now be built and type-checked against the real schema, not just local migration files
- The `no_block()` gate on `connections_insert_own` is inert today (no rows in `blocks` yet) but will correctly reject blocked-party connect requests the moment Phase 13 populates that table — no retrofit migration needed
- No blockers identified for Wave 2 continuation (Plans 03+)

## Self-Check: PASSED

`supabase/migrations/044_connections_note.sql` confirmed present on disk. Task 1 commit `1747f87` confirmed in `git log --oneline`. This SUMMARY.md and the plan-metadata commit are the final artifacts for this plan.

---
*Phase: 10-connections-notifications*
*Completed: 2026-07-12*
