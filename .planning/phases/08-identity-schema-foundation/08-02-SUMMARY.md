---
phase: 08-identity-schema-foundation
plan: 02
subsystem: database
tags: [postgres, supabase, rls, security-definer, relationship-graph]

requires: []
provides:
  - connections table (mutual request/accept state machine, partial-unique dedup)
  - blocks table (directional storage, blocker-only SELECT visibility)
  - public.no_block(a, b) SECURITY DEFINER helper for RLS block enforcement
  - reserved_handles table + broad system/brand/impersonation seed (D-13/D-14)
affects: [08-04-block-enforcement-wiring, 08-05-schema-push, 09-rich-member-profile, 10-connections-notifications, 13-network-trust-safety]

tech-stack:
  added: []
  patterns:
    - "Partial unique index (WHERE status IN (...)) instead of a plain UNIQUE constraint, so a terminal-status row doesn't permanently block a re-request"
    - "SECURITY DEFINER helper with SET search_path = '' + fully-qualified table references, paired with REVOKE EXECUTE FROM PUBLIC/anon + GRANT ... TO authenticated — used to let RLS policies check the OTHER party's row without granting client-side RPC access"
    - "Directional storage (one row per block) with bidirectionality enforced only inside the read/check helper, never by writing two symmetric rows"

key-files:
  created:
    - supabase/migrations/035_connections_blocks.sql
    - supabase/migrations/037_reserved_handles.sql

key-decisions:
  - "no_block() EXECUTE is revoked from PUBLIC/anon/authenticated then re-granted to authenticated only, per RESEARCH Assumption A2 — it's meant for RLS policy bodies, not client RPC calls, but authenticated needs it grantable for future RLS-embedded calls"
  - "reserved_handles seed list follows the plan's exact D-14 word list (system/brand/impersonation categories) with no additions beyond what the plan specified"

patterns-established:
  - "Migration header banner convention followed: Funūn — Wave N: <name> / Migration NNN: <summary> / Run via: supabase db push"

requirements-completed: []

coverage:
  - id: T1
    description: "Migration 035 creates connections (state machine + partial unique index), blocks (directional + reverse index), and no_block() SECURITY DEFINER helper with correct RLS"
    verification:
      - kind: other
        ref: "grep supabase/migrations/035_connections_blocks.sql for CREATE TABLE connections/blocks, CHECK (status IN (...)), connections_active_pair_uniq partial unique index WHERE status IN ('pending', 'accepted'), idx_blocks_blocked, blocks_select_own USING (blocker_id = auth.uid()), FUNCTION public.no_block(a UUID, b UUID) with SECURITY DEFINER + SET search_path = '', both direction clauses (blocker_id = a AND blocked_id = b) / (blocker_id = b AND blocked_id = a), and ENABLE ROW LEVEL SECURITY on both tables — all present
        status: pass
    human_judgment: true
    rationale: "SQL syntax was checked against migration precedent (012_social_layer.sql for RLS/table shape, RESEARCH.md's fully-specified no_block() code block used verbatim) but this sandbox has no linked Supabase project (no supabase/config.toml), so npx supabase db push --dry-run cannot execute here — consistent with plan 08-01's documented environment limitation. Real push and pg_tables/pg_proc verification is deferred to plan 08-05's blocking push task per this plan's own <verification> section."
  - id: T2
    description: "Migration 037 creates reserved_handles (handle TEXT PRIMARY KEY, reason TEXT), RLS-enabled, read-open, seeded idempotently with system + brand + impersonation words"
    verification:
      - kind: other
        ref: "grep supabase/migrations/037_reserved_handles.sql for CREATE TABLE IF NOT EXISTS reserved_handles (handle TEXT PRIMARY KEY, reason TEXT), ENABLE ROW LEVEL SECURITY, INSERT INTO reserved_handles ... ON CONFLICT DO NOTHING, and seed values 'admin'/'funun'/'spotify'/'soundexchange' — all present"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-07-05
status: complete
---

# Phase 8 Plan 2: Relationship-Graph Schema — Connections, Blocks, no_block(), Reserved Handles Summary

**Migration 035 stands up the `connections` mutual request/accept state machine and the `blocks` table with a `no_block()` SECURITY DEFINER helper that Phases 10/11/13 will consume for free; migration 037 adds a `reserved_handles` lookup table seeded against handle squatting/impersonation.**

## Performance

- **Duration:** 8 min
- **Completed:** 2026-07-05
- **Tasks:** 2 completed
- **Files modified:** 2 (both created)

## Accomplishments

- `connections` table: `requester_id`/`addressee_id` with a `status` state machine (`pending`/`accepted`/`declined`/`withdrawn`), enforced via CHECK. A partial unique index (`connections_active_pair_uniq`, `WHERE status IN ('pending','accepted')`) — not a plain `UNIQUE` — allows a re-request once a prior request reaches a terminal status, per the RESEARCH-recommended edge-case resolution. RLS: either participant can SELECT, only the requester can INSERT as themselves, either participant can UPDATE (actual accept/decline/withdraw transition logic is an API-layer concern for Phase 10). Reuses the `update_updated_at()` trigger from migration 001. An `(addressee_id, status)` index supports "requests to me" lookups.
- `blocks` table: directional storage only (`blocker_id`, `blocked_id` composite PK, `CHECK (blocker_id <> blocked_id)`), with `idx_blocks_blocked` for reverse-direction lookups. RLS restricts `blocks_select_own` to `blocker_id = auth.uid()` — a member can never enumerate who blocked them via direct PostgREST (T-08-03 mitigation). INSERT/DELETE also scoped to the blocker.
- `public.no_block(a, b)` — `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''`, fully-qualified `public.blocks` reference (search-path-hijack mitigation, T-08-04), returns `false` if a block exists in either direction. `EXECUTE` revoked from `PUBLIC`/`anon`/`authenticated` then re-granted only to `authenticated`, with a `COMMENT ON FUNCTION` documenting it's meant for RLS policy bodies, not a client RPC.
- `reserved_handles` table (`handle TEXT PRIMARY KEY, reason TEXT`), RLS-enabled with an open `SELECT USING (true)` policy (no INSERT/UPDATE/DELETE policy — service-role-only growth per D-13), seeded via one idempotent `INSERT ... ON CONFLICT DO NOTHING` covering the plan's exact D-14 word list: system/brand terms (`admin`, `funun`, etc.), well-known music-platform/distributor/PRO brand names (`spotify`, `soundexchange`, `distrokid`, etc.), and impersonation-risk role terms (`artist`, `curator`, `verified`, etc.).

## Task Commits

Each task was committed atomically:

1. **Task 1: Write migration 035 — connections + blocks tables, RLS, no_block() helper** - `e286969` (feat)
2. **Task 2: Write migration 037 — reserved_handles table + seed data** - `3f32750` (feat)

**Plan metadata:** committed alongside this SUMMARY (docs: complete plan)

## Files Created/Modified

- `supabase/migrations/035_connections_blocks.sql` - `connections` + `blocks` tables, RLS policies, partial unique index, `no_block()` SECURITY DEFINER helper
- `supabase/migrations/037_reserved_handles.sql` - `reserved_handles` table, RLS, idempotent seed data

## Decisions Made

- Followed the plan's exact SQL specification (column types, CHECK constraints, policy names) rather than the RESEARCH.md draft's slightly different migration numbering (036 in RESEARCH vs. 035 in this plan) — PLAN.md is the authoritative source for this phase's actual file layout, since migration numbers 035/036 were reassigned across sibling plans in this phase.
- Kept `reserved_handles`'s seed list scoped to exactly the plan's specified words — no additional brand names invented beyond what D-14/the plan text enumerated, to avoid diverging from the reviewed/approved seed set.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written. The only adjustment was formatting `CREATE TABLE IF NOT EXISTS reserved_handles (...)` as a single line (rather than multi-line) so the literal acceptance-criteria grep pattern matches exactly; this is a cosmetic formatting choice, not a behavioral or schema deviation.

## Issues Encountered

- `npx supabase db push --dry-run` (both tasks' specified automated verification) cannot run in this sandbox: there is no `supabase/config.toml` and no linked Supabase project (`Have you set up the project with supabase init?`). This is the same pre-existing environment limitation documented in `08-01-SUMMARY.md`, not something introduced by this plan. In its place, both migration files were manually verified against every acceptance-criteria grep pattern in the plan (all passed — see coverage T1/T2) and against migration precedent (`012_social_layer.sql` for RLS/table shape and idempotent policy pairing, `030`/`031` for header banner and REVOKE/GRANT conventions, RESEARCH.md's fully-specified `no_block()` code block used verbatim). The plan's own `<verification>` section explicitly defers the real push and live `pg_tables`/`pg_proc` checks to plan 08-05's blocking push task, so this does not block plan 08-02 completion.

## User Setup Required

None for this plan. Migrations 035 and 037 will be pushed to the live database as part of plan 08-05's blocking push task (per this plan's own deferred verification note); no other external service configuration required here.

## Next Phase Readiness

- `connections`, `blocks`, `no_block()`, and `reserved_handles` are ready to ship once migrations 035/037 are pushed in plan 08-05.
- Wiring `no_block()` into `wall_posts`/`endorsements`/`dm_threads`/`follows` existing RLS policies (D-15) is explicitly out of this plan's scope — deferred to plan 08-04.
- No blockers. The only open item is the deferred live-DB push (tracked in plan 08-05, not this plan).

---
*Phase: 08-identity-schema-foundation*
*Completed: 2026-07-05*

## Self-Check: PASSED

- FOUND: supabase/migrations/035_connections_blocks.sql
- FOUND: supabase/migrations/037_reserved_handles.sql
- FOUND: e286969 (Task 1 commit)
- FOUND: 3f32750 (Task 2 commit)
