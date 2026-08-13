---
phase: 30-the-crate-sync-library-catalogue-engine-sync-readiness
plan: 03
subsystem: database
tags: [supabase, postgres, migrations, rls, staff-roles, sync-library]

requires:
  - phase: 26-sync-library-inclusion
    provides: sync_listings table + admission state machine (migration 096)
  - phase: 25-funun-team-accounts-ae
    provides: funun_staff table + staff_role CHECK + lib/admin/staff-role.ts (migration 089)
provides:
  - "DRAFTED (not applied) migration 107: additive quality_ok/quality_note/quality_reviewed_by/quality_reviewed_at/staff_notes columns on sync_listings"
  - "DRAFTED (not applied) migration 108: funun_staff.staff_role CHECK widened to add 'anr'"
  - "lib/admin/staff-role.ts StaffRole union + ALL_STAFF_ROLES + getStaffRole recognize 'anr' (shipped live, no gate)"
  - "components/admin/StaffAdmin.tsx + TeamDirectory.tsx STAFF_ROLE_LABELS updated for the widened StaffRole (compile-required, tsc green)"
affects: [30-04, 30-05, 30-06, 30-07]

tech-stack:
  added: []
  patterns:
    - "Owner-run migration drafting: HUMAN-GATED header banner, additive-only ALTER TABLE / DROP+ADD CONSTRAINT, agent never executes supabase db push"
    - "New columns on an RLS-enabled table inherit the table's REVOKE + policy automatically — no per-column grant/policy statements needed"

key-files:
  created:
    - supabase/migrations/107_sync_listings_quality_review.sql
    - supabase/migrations/108_anr_staff_role.sql
  modified:
    - lib/admin/staff-role.ts
    - components/admin/StaffAdmin.tsx
    - components/admin/TeamDirectory.tsx

key-decisions:
  - "Migration 107 is additive-columns-only on sync_listings; sync_listings.status and its CHECK are untouched — incomplete stays a computed readiness signal, never a stored status (30-CONTEXT.md prohibition)."
  - "Migration 108 widens ONLY funun_staff.staff_role's CHECK (DROP/ADD pattern from migration 096), adding 'anr' alongside leadership/ae/bd."
  - "lib/admin/staff-role.ts ships live in this commit (not gated) — getStaffRole reads only app_metadata, never the DB, so recognizing 'anr' is safe before migration 108 is applied; no funun_staff row can hold 'anr' until then."
  - "StaffAdmin.tsx's create-staff dropdown (STAFF_ROLE_VALUES) deliberately still excludes 'anr' until migration 108 is owner-applied, to prevent leadership submitting a create the DB CHECK would reject; the label map (STAFF_ROLE_LABELS) was updated because it is an exhaustive Record<StaffRole,string> and tsc requires it."
  - "Neither migration was executed. The agent did not run supabase db push. Task 3 (blocking-human checkpoint) and Task 4 (live verification) are PENDING — this plan is NOT complete."

requirements-completed: [CRATE-09, CRATE-10]

coverage:
  - id: D1
    description: "Migration 107 drafted: additive sync_listings quality-review + staff-notes columns, owner-run banner, no status/CHECK change."
    requirement: CRATE-09
    verification:
      - kind: manual_procedural
        ref: "Read back supabase/migrations/107_sync_listings_quality_review.sql; grep confirms HUMAN-GATED banner and no status/CHECK ALTER"
        status: pass
    human_judgment: false
  - id: D2
    description: "Migration 108 drafted: funun_staff.staff_role CHECK widened to add 'anr', owner-run banner, no other schema change."
    requirement: CRATE-10
    verification:
      - kind: manual_procedural
        ref: "Read back supabase/migrations/108_anr_staff_role.sql; grep confirms HUMAN-GATED banner and DROP/ADD CONSTRAINT shape"
        status: pass
    human_judgment: false
  - id: D3
    description: "lib/admin/staff-role.ts StaffRole union + ALL_STAFF_ROLES + getStaffRole recognize 'anr'; tsc --noEmit green across the codebase."
    requirement: CRATE-10
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: unit
        ref: "lib/admin/gate.test.ts (13 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Migrations 107 + 108 are applied to the live database and confirmed via a service-role round-trip."
    verification: []
    human_judgment: true
    rationale: "Owner-run migration doctrine — the agent must never execute supabase db push. This deliverable is PENDING the blocking-human checkpoint (Task 3) and the live-verification task (Task 4), neither of which has run yet."

duration: ~35min
completed: 2026-08-13
status: blocked
---

# Phase 30 Plan 03: Owner-Run Migration Drafts — Sync Quality Columns + A&R Role Summary

**Drafted (not applied) migration 107 (sync_listings quality-review + staff-notes columns) and migration 108 (funun_staff.staff_role CHECK widened to add 'anr'), plus the paired lib/admin/staff-role.ts + label-map code change — both migrations are BLOCKED on the owner's push; this plan is NOT complete.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-13T04:33:00Z
- **Completed (drafting only):** 2026-08-13T05:09:00Z
- **Tasks:** 2 of 4 executed (Task 1, Task 2); Task 3 (blocking-human checkpoint) reached and STOPPED per plan; Task 4 (live verification) not run.
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Drafted `supabase/migrations/107_sync_listings_quality_review.sql` — five additive nullable columns on `sync_listings` (`quality_ok`, `quality_note`, `quality_reviewed_by`, `quality_reviewed_at`, `staff_notes`), each with a `COMMENT ON COLUMN`, RLS/REVOKE inheritance reaffirmed in a comment (no new grant/policy statements needed), `NOTIFY pgrst, 'reload schema';` at the end. No change to `sync_listings.status` or its CHECK.
- Drafted `supabase/migrations/108_anr_staff_role.sql` — `DROP CONSTRAINT` / `ADD CONSTRAINT` widening `funun_staff.staff_role`'s CHECK to admit `'anr'` alongside `leadership`/`ae`/`bd`, mirroring migration 096's constraint-widen convention. `COMMENT ON CONSTRAINT` records the DISPLAY-COPY doctrine (migration 089) and A&R's narrow tag-approval-only authority.
- Updated `lib/admin/staff-role.ts`: `StaffRole` union, `ALL_STAFF_ROLES`, and `getStaffRole` now recognize `'anr'`. Ships live (not gated) — pure, app_metadata-only, no DB dependency.
- Fixed two Rule-3 blocking compile errors surfaced by widening `StaffRole`: `components/admin/StaffAdmin.tsx` and `components/admin/TeamDirectory.tsx` each declare `STAFF_ROLE_LABELS: Record<StaffRole, string>` (exhaustive) — added an `'anr': 'A&R'` entry to both so `tsc --noEmit` stays green.
- Neither migration was applied. No `supabase db push` was run by the agent.

## Task Commits

Each task was committed atomically:

1. **Task 1: Draft migration 107 — sync_listings quality-review + staff-notes columns** - `728e221` (feat)
2. **Task 2: Draft migration 108 (A&R role CHECK widen) + StaffRole code change** - `19fb6c8` (feat)
3. **Task 3: OWNER-RUN gate — owner applies migrations 107 + 108** - NOT STARTED (blocking-human checkpoint; agent stopped here as required)
4. **Task 4: Live verification of migrations 107 + 108** - NOT STARTED (depends on Task 3)

**Plan metadata:** this SUMMARY.md commit (pending — see below)

## Files Created/Modified

- `supabase/migrations/107_sync_listings_quality_review.sql` - DRAFTED, NOT APPLIED. Additive quality-review + staff-notes columns on `sync_listings`.
- `supabase/migrations/108_anr_staff_role.sql` - DRAFTED, NOT APPLIED. Widens `funun_staff.staff_role` CHECK to add `'anr'`.
- `lib/admin/staff-role.ts` - `StaffRole` union / `ALL_STAFF_ROLES` / `getStaffRole` now include `'anr'`. Live code change, no DB dependency.
- `components/admin/StaffAdmin.tsx` - `STAFF_ROLE_LABELS` gains `'anr': 'A&R'` (compile-required); `STAFF_ROLE_VALUES` (create-staff dropdown) deliberately left WITHOUT `'anr'` until migration 108 is live.
- `components/admin/TeamDirectory.tsx` - `STAFF_ROLE_LABELS` gains `'anr': 'A&R'` (compile-required; read-only directory, no write-path risk).

## Decisions Made

- **Additive-only migration 107:** No touch to `sync_listings.status`/CHECK — incomplete stays a computed readiness signal per 30-CONTEXT.md's explicit prohibition, never a stored status value.
- **Migration 108 scope:** Only the `funun_staff.staff_role` CHECK is widened; no other schema change bundled in.
- **`lib/admin/staff-role.ts` ships live, unlike the migrations:** `getStaffRole` is a pure app_metadata reader with no DB dependency, so recognizing `'anr'` in the TypeScript union carries zero live risk — no `funun_staff` row can hold `'anr'` until migration 108 is applied.
- **StaffAdmin.tsx's `STAFF_ROLE_LABELS` vs `STAFF_ROLE_VALUES`:** the label map (`Record<StaffRole,string>`) required an `'anr'` entry to keep the codebase compiling (TypeScript exhaustiveness on the widened union), but the create-staff dropdown array (`STAFF_ROLE_VALUES`, a plain array with no exhaustiveness requirement) was deliberately left without `'anr'` — offering it there before migration 108 lands would let a leadership user submit a staff-create that the live DB CHECK constraint would reject with a 500. This will be revisited once the owner confirms migration 108 is pushed.
- **`components/admin/StaffAdmin.tsx` and `components/admin/TeamDirectory.tsx` are outside this plan's `files_modified` frontmatter list** but were touched as a Rule 3 (auto-fix blocking issue) deviation — see below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed tsc compile errors in two files not listed in the plan's `files_modified`**
- **Found during:** Task 2 (StaffRole union widening)
- **Issue:** Widening `StaffRole` to include `'anr'` broke `tsc --noEmit`: `components/admin/StaffAdmin.tsx` and `components/admin/TeamDirectory.tsx` each declare `STAFF_ROLE_LABELS: Record<StaffRole, string>` — an exhaustive map — so both errored with `TS2741: Property 'anr' is missing`. The plan's Task 2 action text explicitly anticipated this ("add an 'anr' entry to any staff-role label map that exists"), but the plan's YAML `files_modified` frontmatter only listed the three primary files.
- **Fix:** Added `anr: 'A&R'` to both `STAFF_ROLE_LABELS` maps. Left `StaffAdmin.tsx`'s separate `STAFF_ROLE_VALUES` array (the create-staff dropdown's option list) unchanged/without `'anr'`, since that array has no compile-time exhaustiveness requirement and offering `'anr'` there before migration 108 lands would risk a runtime DB-CHECK rejection.
- **Files modified:** `components/admin/StaffAdmin.tsx`, `components/admin/TeamDirectory.tsx`
- **Verification:** `npx tsc --noEmit` exits 0; `npx jest lib/admin/gate.test.ts` — 13/13 pass.
- **Committed in:** `19fb6c8` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking compile fix)
**Impact on plan:** Necessary to keep the codebase compiling after the StaffRole union widen; no scope creep beyond the plan's own stated intent for the label map. No functional/UI change beyond the display label and the deliberate omission from the create-staff dropdown.

## Issues Encountered

None beyond the tsc compile fix documented above.

## User Setup Required

**BLOCKING — this plan cannot be marked complete without owner action.** See "Next Steps for the Owner" below. This mirrors migrations 080/081/089/090/096/106's standing owner-run convention — no `USER-SETUP.md` was generated; the checkpoint IS the user-setup step.

## Next Phase Readiness

- **NOT ready for 30-04/30-05/30-06/30-07.** Those plans consume `quality_ok` (the gate's qualityOk signal) and the `'anr'` StaffRole (the 30-06 tag-approval gate `requireStaff(['leadership','anr'])`) — both require migrations 107 and 108 to be LIVE, not just drafted.
- Once the owner pushes both migrations and confirms, re-run (or continue) this plan's Task 4 (live verification) to confirm the columns/CHECK are live via a service-role round-trip before starting 30-04+.

---
*Phase: 30-the-crate-sync-library-catalogue-engine-sync-readiness*
*Completed: 2026-08-13 (drafting only — migration push PENDING owner checkpoint)*

## Self-Check: PASSED

- FOUND: supabase/migrations/107_sync_listings_quality_review.sql
- FOUND: supabase/migrations/108_anr_staff_role.sql
- FOUND: lib/admin/staff-role.ts
- FOUND: components/admin/StaffAdmin.tsx
- FOUND: components/admin/TeamDirectory.tsx
- FOUND: .planning/phases/30-the-crate-sync-library-catalogue-engine-sync-readiness/30-03-SUMMARY.md
- FOUND commit: 728e221 (Task 1: migration 107)
- FOUND commit: 19fb6c8 (Task 2: migration 108 + StaffRole widen)
