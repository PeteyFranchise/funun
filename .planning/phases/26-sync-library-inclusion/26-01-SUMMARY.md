---
phase: 26-sync-library-inclusion
plan: 01
subsystem: database
tags: [postgres, supabase, rls, migrations, sync-library]

# Dependency graph
requires: []
provides:
  - "sync_listings table: per-song sync-library admission state machine (8-state CHECK), partial unique active-track index, staff curation-queue index, RLS select_own policy, column-lockdown REVOKE doctrine"
  - "capability_grants extended: capability='sync_library', source IN ('admin_invited','self_applied')"
  - "vault_documents.type extended: 'blanket_agreement'"
  - "Live database schema through migration 096 — LOCAL=REMOTE confirmed"
affects: [26-02-sync-library-domain-core, 26-03, 26-04, 26-05, 26-06, sync-library-wave-2]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DROP CONSTRAINT IF EXISTS / re-ADD for widening an existing CHECK constraint — never edit a landed migration in place (mirrors migration 081's vault_documents.type precedent)"
    - "Partial unique index for an 'active' state predicate (mirrors capability_grants_active_uniq, migration 042) — terminal statuses fall outside the WHERE clause, allowing re-submission without manual cleanup"
    - "Column-lockdown doctrine (REVOKE INSERT/UPDATE/DELETE FROM authenticated,anon; REVOKE SELECT FROM anon) + RLS select_own — all writes route through service-role API routes, never direct PostgREST"

key-files:
  created:
    - supabase/migrations/096_sync_library.sql
  modified: []

key-decisions:
  - "sync_listings is SONG-LEVEL (per track_id), not project-level — a buyer licenses one song at a time, and submission is batched-but-per-song-admitted (26-CONTEXT.md OQ#1/OQ#2)"
  - "entry_source ('admin_invited'|'self_applied') is curation-queue metadata only — both paths converge on the same staff admit/reject gate, not a separate flow"
  - "removed is a distinct terminal status from withdrawn — staff leadership-only takedown of an already-admitted song vs. the artist's own withdrawal, each with its own actor/timestamp/reason columns"
  - "No DB trigger mutates vault_projects.is_public from sync_listings — admission must not overload is_public (RESEARCH Pitfall 2), so is_public remains driven only by its existing owners"

patterns-established:
  - "Human-gated migration checkpoint: agent authors + structurally verifies the .sql file, commits it, and STOPS at a checkpoint:human-verify(gate=blocking) task; the owner runs `supabase db push` via Codex and confirms LOCAL=REMOTE before any dependent plan proceeds"

requirements-completed: [SYNCLIB-01, SYNCLIB-02]

coverage:
  - id: D1
    description: "Migration 096 creates sync_listings with the 8-state CHECK, partial unique active-track index, curation-queue index, RLS + column-lockdown"
    requirement: "SYNCLIB-01"
    verification:
      - kind: unit
        ref: "node -e structural grep assertion (CREATE TABLE sync_listings, sync_listings_active_track_uniq, ENABLE ROW LEVEL SECURITY, sync_listings_select_own, REVOKE INSERT UPDATE DELETE ON sync_listings) — executed during Task 1"
        status: pass
      - kind: manual_procedural
        ref: "Owner smoke test via Codex: `select count(*) from sync_listings` returned 0 (table exists, not a missing-relation error)"
        status: pass
    human_judgment: false
  - id: D2
    description: "capability_grants CHECK constraints widened to accept capability='sync_library' with source IN ('admin_invited','self_applied'), migration 042 left unedited"
    requirement: "SYNCLIB-02"
    verification:
      - kind: manual_procedural
        ref: "Owner smoke test via Codex: capability_grants accepted capability='sync_library' with both source='self_applied' and source='admin_invited' — no check violation"
        status: pass
    human_judgment: false
  - id: D3
    description: "vault_documents.type widened to accept 'blanket_agreement', migration 081 left unedited"
    verification:
      - kind: manual_procedural
        ref: "Owner smoke test via Codex: inserting a vault_documents row with type='blanket_agreement' raised no 23514 check_violation"
        status: pass
    human_judgment: false
  - id: D4
    description: "Migration 096 pushed live and confirmed LOCAL=REMOTE through 096"
    verification:
      - kind: manual_procedural
        ref: "Owner ran `supabase db push` via Codex; `supabase migration list` confirmed LOCAL=REMOTE parity through 096"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-08-08
status: complete
---

# Phase 26 Plan 01: Sync-Library Schema Foundation Summary

**Migration 096 establishes the sync_listings per-song admission state machine, extends capability_grants with a sync_library capability (admin_invited/self_applied sources), and widens vault_documents.type for blanket_agreement — authored, structurally verified, pushed live by the owner via Codex, and confirmed LOCAL=REMOTE.**

## Performance

- **Duration:** ~25 min (across two sessions — authoring/commit, then a pause for the human-gated push, then finalization)
- **Tasks:** 2/2 complete
- **Files modified:** 1 (net-new)

## Accomplishments
- `sync_listings` table live: per-song (`track_id`) admission state machine with 8 statuses (`applied`, `invited`, `agreement_pending`, `pending_admit`, `admitted`, `rejected`, `withdrawn`, `removed`), audit columns (`decided_by`/`decided_at`, `removed_by`/`removed_at`, etc.), partial unique index enforcing one active listing per song, and a staff curation-queue index.
- `capability_grants` extended (DROP/re-ADD CHECKs, migration 042 untouched) to accept the `sync_library` capability sourced from either `admin_invited` or `self_applied`.
- `vault_documents.type` widened (DROP/re-ADD CHECK, migration 081 untouched) to accept `blanket_agreement`, giving the artist→Funūn blanket-agreement e-sign flow a home in Contract Locker.
- RLS + column-lockdown applied to `sync_listings` (owner-only SELECT, all writes REVOKEd from `authenticated`/`anon`) — mirrors the standing `capability_grants` doctrine (migration 042) so every write must route through a service-role API route in Wave 2.
- Migration pushed live by the owner via Codex; LOCAL=REMOTE parity confirmed through 096, and all three smoke tests (table exists, `blanket_agreement` insert, `sync_library` grant insert with both new source values) passed with no check-constraint violations. Test rows cleaned up.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author migration 096 — sync_listings + capability_grants extension + vault_documents.type widening** - `694ecdb` (feat)
2. **Task 2: [BLOCKING] Human-gated schema push — apply migration 096 + confirm live** - no code commit (human action via Codex `supabase db push`; confirmed by owner report, see Deviations/Issues below)

**Plan metadata:** (this commit)

## Files Created/Modified
- `supabase/migrations/096_sync_library.sql` - Creates `sync_listings`, extends `capability_grants` CHECKs, widens `vault_documents.type`

## Decisions Made
- Followed the plan's exact schema spec verbatim (columns, CHECK values, index names, RLS policy name) — no schema deviation from `26-01-PLAN.md`.
- Confirmed constraint auto-naming (`capability_grants_capability_check`, `capability_grants_source_check`) matches Postgres's default `<table>_<column>_check` convention by reading migration 042's unnamed inline CHECKs, so the DROP/re-ADD in migration 096 targets the correct existing constraint names.

## Deviations from Plan

None - plan executed exactly as written. The human-gated checkpoint (Task 2) is not a deviation — it is the plan's designed mandatory gate, executed as specified: the agent authored and structurally verified the migration, then stopped; the owner reviewed, ran `supabase db push` via Codex, confirmed `supabase migration list` shows LOCAL=REMOTE through 096, and ran the three smoke tests specified in the plan's `<how-to-verify>` — all passed. This summary was written by a continuation agent after the coordinator relayed the owner's "pushed" confirmation and smoke-test results.

## Issues Encountered
None. The push and all three smoke tests (table existence, `blanket_agreement` insert, `sync_library`/`admin_invited`/`self_applied` grant insert) passed on the first attempt, per the owner's report relayed by the coordinator.

## User Setup Required
None further - the one required external action (pushing migration 096 to the live Supabase project) is complete. `sync_listings` is live, `capability_grants` and `vault_documents.type` are widened, and LOCAL=REMOTE parity holds through 096.

## Next Phase Readiness
Wave 2 (plans 26-03 through 26-06, and the parallel 26-02 domain-core plan already landed on this branch) can now read/write `sync_listings`, insert `capability_grants` rows with `capability='sync_library'`, and insert `vault_documents` rows with `type='blanket_agreement'` against the live database without a 23514 check_violation or a missing-relation error. No blockers.

---
*Phase: 26-sync-library-inclusion*
*Completed: 2026-08-08*

## Self-Check: PASSED
- FOUND: supabase/migrations/096_sync_library.sql
- FOUND: .planning/phases/26-sync-library-inclusion/26-01-SUMMARY.md
- FOUND commit: 694ecdb
