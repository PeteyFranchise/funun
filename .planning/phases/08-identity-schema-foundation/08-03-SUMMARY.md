---
phase: 08-identity-schema-foundation
plan: 03
subsystem: database
tags: [postgres, supabase, realtime, rls, notifications, dm]

# Dependency graph
requires:
  - phase: 08-identity-schema-foundation (plan 01/02)
    provides: member-identity schema (034), connections/blocks/reserved_handles schema (035/037) already landed in this working tree
provides:
  - notifications table extended with actor_id/actor_name/actor_avatar_url denormalized snapshot columns
  - notifications added to the supabase_realtime publication (idempotent guard)
  - dm_thread_reads table with owner-only RLS for DM unread-count tracking
affects: [phase-10-connections-notifications, phase-11-presence-messaging]

# Tech tracking
tech-stack:
  added: []
  patterns: ["idempotent supabase_realtime ADD TABLE guard via pg_publication_tables (mirrors migration 014)"]

key-files:
  created:
    - supabase/migrations/036_notifications_dm_reads.sql
  modified: []

key-decisions:
  - "No GRANT/REVOKE touched on notifications — only ADD COLUMN and the idempotent realtime publication guard, per RESEARCH Pitfall 6 (broad SELECT revoke would silently break realtime delivery)"

patterns-established:
  - "Realtime publication membership added via a DO $$ block checking pg_publication_tables before ALTER PUBLICATION ... ADD TABLE, reused verbatim from migration 014's dm_messages precedent"

requirements-completed: []

coverage:
  - id: D1
    description: "notifications table carries actor_id (UUID), actor_name (TEXT), actor_avatar_url (TEXT) columns added via ADD COLUMN IF NOT EXISTS, and no GRANT/REVOKE statements were added against notifications"
    verification:
      - kind: other
        ref: "grep supabase/migrations/036_notifications_dm_reads.sql for 'ADD COLUMN IF NOT EXISTS actor_id/actor_name/actor_avatar_url' and confirm no REVOKE/GRANT statement lines are present — all present/absent as required"
        status: pass
    human_judgment: true
    rationale: "SQL was checked against migration precedent (009 for existing notifications shape, 014 for the exact idempotent publication guard) but this sandbox has no linked Supabase project (no supabase/config.toml), so npx supabase db push --dry-run cannot execute here — same pre-existing environment limitation documented in 08-01-SUMMARY.md and 08-02-SUMMARY.md. Real push and pg_publication_tables/\\d dm_thread_reads verification is deferred to plan 08-05's blocking push task per this plan's own <verification> section."
  - id: D2
    description: "dm_thread_reads table exists with (thread_id, user_id) composite PK, last_read_at TIMESTAMPTZ, RLS enabled, and a member can SELECT only their own rows"
    verification:
      - kind: other
        ref: "grep supabase/migrations/036_notifications_dm_reads.sql for CREATE TABLE IF NOT EXISTS dm_thread_reads, PRIMARY KEY (thread_id, user_id), last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(), ENABLE ROW LEVEL SECURITY, and dm_thread_reads_select_own USING (user_id = auth.uid()) — all present"
        status: pass
    human_judgment: true
    rationale: "Same environment limitation as D1 — dry-run cannot execute in this sandbox; verified via grep against acceptance criteria and migration 012 precedent for the dm_threads FK target (id UUID PK), deferred live verification to plan 08-05."

duration: 6min
completed: 2026-07-05
status: complete
---

# Phase 8 Plan 3: Notifications & DM Reads Schema Summary

**Migration 036 adds notifications actor-snapshot columns, idempotently enrolls notifications in the supabase_realtime publication, and creates dm_thread_reads for DM unread tracking**

## Performance

- **Duration:** 6 min
- **Tasks:** 1 completed
- **Files modified:** 1

## Accomplishments
- `notifications` gained `actor_id`/`actor_name`/`actor_avatar_url` denormalized snapshot columns (Phase 10 bell renders "X followed you" without a join)
- `notifications` is added to the `supabase_realtime` publication via an idempotent `pg_publication_tables` guard mirrored from migration 014
- `dm_thread_reads` table created with `(thread_id, user_id)` composite PK, `last_read_at TIMESTAMPTZ`, RLS enabled, and owner-only SELECT/INSERT/UPDATE policies (powers Phase 11 DM unread badges)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write migration 036 — notifications actor columns + realtime publication + dm_thread_reads** - `d6f923a` (feat)

**Plan metadata:** (pending — final commit below)

## Files Created/Modified
- `supabase/migrations/036_notifications_dm_reads.sql` - Adds notifications actor-snapshot columns, idempotent realtime publication membership, and the dm_thread_reads table with owner-only RLS

## Decisions Made
- No GRANT/REVOKE statements were added to notifications — this migration is purely additive (ADD COLUMN + idempotent publication guard), per RESEARCH Pitfall 6 and the plan's key_links constraint

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

`npx supabase db push --dry-run` cannot execute in this sandbox — there is no `supabase/config.toml` / linked Supabase project (`Have you set up the project with supabase init?`). This is the same pre-existing environment limitation documented in `08-01-SUMMARY.md` and `08-02-SUMMARY.md`, not something introduced by this plan. In its place, the migration file was manually verified against every acceptance-criteria grep pattern in the plan (all passed — see coverage D1/D2) and against migration precedent (`009_antenna_notifications.sql` for the existing notifications shape/RLS, `014_dm_realtime.sql` for the exact idempotent publication guard, `012_social_layer.sql` for the `dm_threads.id` FK target). The plan's own `<verification>` section explicitly defers the real push and live `pg_publication_tables`/`\d dm_thread_reads` checks to plan 08-05's blocking push task, so this does not block plan 08-03 completion.

## User Setup Required

None for this plan. Migration 036 will be pushed to the live database as part of plan 08-05's blocking push task (per this plan's own deferred verification note); no other external service configuration required here.

## Next Phase Readiness
- `notifications` actor-snapshot columns and realtime publication membership, plus `dm_thread_reads`, are ready to ship once migration 036 is pushed in plan 08-05
- Phase 10's notification emit path (writing `actor_id`/`actor_name`/`actor_avatar_url` on insert) and Phase 11's DM widget unread-count read/upsert against `dm_thread_reads` are unblocked once the push lands
- No blockers. The only open item is the deferred live-DB push (tracked in plan 08-05, not this plan)

---
*Phase: 08-identity-schema-foundation*
*Completed: 2026-07-05*

## Self-Check: PASSED

- FOUND: supabase/migrations/036_notifications_dm_reads.sql
- FOUND: d6f923a (Task 1 commit)
