---
phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1
plan: 02
subsystem: database
tags: [supabase, postgres, migration, rbac, staff-role]

# Dependency graph
requires:
  - phase: 30-the-crate-sync-library
    provides: "108_anr_staff_role.sql — the owner-run migration template this plan mirrors verbatim"
provides:
  - "supabase/migrations/114_it_staff_role.sql — owner-run CHECK-widen adding 'it' to funun_staff.staff_role"
affects: [33-01, 33-06, 33-08, playbook, it-team-room, rbac]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Owner-run migration convention (never `supabase db push` from an agent) — mirrors migrations 080/081/089/090/096/106/108"
    - "DROP CONSTRAINT IF EXISTS / ADD CONSTRAINT convention (migration 096) for widening a CHECK without editing a landed migration"

key-files:
  created:
    - supabase/migrations/114_it_staff_role.sql
  modified: []

key-decisions:
  - "Migration 114 authored to the exact 108_anr_staff_role.sql template shape (header comment block, DROP/ADD CONSTRAINT, COMMENT ON CONSTRAINT, NOTIFY pgrst) per D-01"
  - "Task 2 (owner-run `supabase db push` apply) is DEFERRED per plan's explicit decoupling — the checkpoint's own resume-signal offers 'defer' as a valid path, and the plan states code verification (33-01's StaffRole union) passes green without this migration applied, mirroring the anr/108 precedent"

patterns-established: []

requirements-completed: [PLAYBOOK-01]

coverage:
  - id: D1
    description: "supabase/migrations/114_it_staff_role.sql widens funun_staff.staff_role CHECK to admit 'it' alongside leadership/ae/bd/anr"
    requirement: "PLAYBOOK-01"
    verification:
      - kind: other
        ref: "test -f supabase/migrations/114_it_staff_role.sql && grep -q \"'leadership', 'ae', 'bd', 'anr', 'it'\" ... && grep -q \"NOTIFY pgrst\" ... (automated grep verification per plan)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Owner applies migration 114 via `supabase db push` and confirms LOCAL=REMOTE parity through 114"
    verification: []
    human_judgment: true
    rationale: "Owner-run action explicitly excluded from agent execution (repo standing convention: no agent-run `supabase db push`). Plan's checkpoint resume-signal supports deferring this step; recorded here as a pending owner action, not blocking."

# Metrics
duration: ~10min
completed: 2026-08-17
status: complete
---

# Phase 33 Plan 02: Owner-run migration 114 (it staff_role) Summary

**Authored `supabase/migrations/114_it_staff_role.sql`, mirroring the `anr`/108 template exactly, to widen the `funun_staff.staff_role` CHECK to admit `'it'` — owner-run apply left as a deferred, non-blocking checkpoint.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 1 of 2 (Task 1 executed and committed; Task 2 is an owner-run checkpoint, deferred)
- **Files modified:** 1

## Accomplishments
- Authored `supabase/migrations/114_it_staff_role.sql` verbatim to the `108_anr_staff_role.sql` template shape: header comment block (WHY/WHAT/threat note/HUMAN-GATED disclaimer referencing D-01), `DROP CONSTRAINT IF EXISTS` / `ADD CONSTRAINT` widening the CHECK to `('leadership', 'ae', 'bd', 'anr', 'it')`, a `COMMENT ON CONSTRAINT` documenting the widen and `it`'s narrow (read-only) authority, and `NOTIFY pgrst, 'reload schema';`
- Confirmed no landed migration (080-113) was modified — only 114 is new
- Automated verification passed: file exists, CHECK list correct, `NOTIFY pgrst` present

## Task Commits

Each task was committed atomically:

1. **Task 1: Author migration 114_it_staff_role.sql from the 108 template** - `6b8110d` (feat)
2. **Task 2: Owner applies migration 114 (`supabase db push`)** - DEFERRED (checkpoint, not executed by this agent — see below)

## Files Created/Modified
- `supabase/migrations/114_it_staff_role.sql` - Owner-run migration widening `funun_staff.staff_role` CHECK to admit `'it'` alongside `leadership`/`ae`/`bd`/`anr`

## Decisions Made
- Followed the plan's explicit instruction: an agent must never run `supabase db push` (repo standing convention, precedent migrations 080/081/089/090/096/106/108). Task 2's checkpoint offers a "defer" resume-signal path, which this execution takes — the migration is authored and committed, and the owner-run apply is left as an open, non-blocking deployment prerequisite.
- No architectural deviations: migration mirrors the 108 template shape exactly, per plan instruction.

## Deviations from Plan

None - plan executed exactly as written. Task 1 completed and committed normally; Task 2 (owner-run checkpoint) is deferred per the plan's own documented decoupling between code verification and the owner-run apply.

## Issues Encountered

None. The migration file was authored, verified via the plan's automated grep checks, and committed without incident.

## Owner Checkpoint — DEFERRED (open action)

**Task 2: Owner applies migration 114 (`supabase db push`)** — this is a **deployment prerequisite**, not a code-verification blocker. It does NOT gate build/tsc/jest for the rest of Phase 33 (33-01's `it` code union in `lib/admin/staff-role.ts` is designed to verify green without this migration applied — no `funun_staff` row can hold `'it'` until the owner assigns it, mirroring the `anr`/108 precedent).

**What the owner needs to do, when ready:**
1. Review `supabase/migrations/114_it_staff_role.sql` (sign off on the CHECK list + comment).
2. Apply it via the normal flow: `supabase db push` (non-TTY hint: set `SUPABASE_ACCESS_TOKEN`), or the Codex `supabase db push` flow used for 108/110-113.
3. Confirm parity: `supabase migration list` shows LOCAL=REMOTE through 114.

This is recorded as an **open owner checkpoint** — execution of Phase 33 continues without waiting on it, per the plan's explicit design.

## User Setup Required

**Deployment prerequisite (deferred, non-blocking):** Owner must run `supabase db push` to apply migration 114 before assigning the `it` staff_role to any `funun_staff` account. See "Owner Checkpoint — DEFERRED" section above for exact steps.

## Next Phase Readiness
- Migration 114 is authored and committed; safe to apply at the owner's convenience, independent of the rest of Phase 33's code verification.
- No blockers for downstream plans (33-01, 33-06, 33-08) — they depend on the code-side `StaffRole` union (33-01), not on this migration being applied.

---
*Phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1*
*Completed: 2026-08-17*

## Self-Check: PASSED

- FOUND: `supabase/migrations/114_it_staff_role.sql`
- FOUND: `.planning/phases/33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1/33-02-SUMMARY.md`
- FOUND commit: `6b8110d`
- FOUND commit: `239652d`
