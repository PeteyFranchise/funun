---
phase: 38-member-organization-team-workspaces
plan: 10
subsystem: database
tags: [supabase, postgres, rls, security-definer, migration, workspaces]

# Dependency graph
requires:
  - phase: 38-member-organization-team-workspaces (plan 38-08)
    provides: workspace_grants, workspace_permission_bundles, workspace_member_role() (from 182), workspace_roster_relationships (from 183)
provides:
  - "public.workspace_attachments — the link a workspace reaches a project through (D-23)"
  - "public.workspace_custody_transfers — the two-sided offer/accept custody record (D-29)"
  - "public.workspace_attachment_visible(uuid, uuid) SECURITY DEFINER helper"
  - "public.custody_transfer_visible(uuid, uuid) SECURITY DEFINER helper"
  - "public.guard_custody_transfer_offered_by_holder() BEFORE INSERT trigger"
  - "The (project_id, workspace_id) WHERE detached_at IS NULL covering index migration 186's three-hop helper enters through"
affects: [38-11 (migration 186 — the RLS workspace branch), 38-13 (custody transfer service route), 38-09 (grant-service, sibling plan in this same wave)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive-only migration slice, siblings 182/183/184 already established: write lockdown + SECURITY DEFINER helper pair + scalar-subselect-wrapped SELECT policy"
    - "Detach-is-a-timestamp, never-a-delete convention (D-25), mirroring migration 183's never-revive-a-row posture for roster relationships"
    - "Two-sided state-machine guarded by a BEFORE INSERT trigger, mirroring migration 172's guard_work_graduation_owner_only() shape"

key-files:
  created:
    - supabase/migrations/185_workspace_attachments_custody.sql
    - __tests__/migration-185.test.ts
  modified: []

key-decisions:
  - "workspace_attachment_visible() is visible to an active workspace member OR the project's current custodian, without filtering on detached_at — visibility of the audit trail (including history) is separate from migration 186's live-attachment-only project-access hop"
  - "guard_custody_transfer_offered_by_holder() follows migration 172's plain plpgsql shape (not SECURITY DEFINER) because it only calls the already-authenticated-grantable workspace_member_role() helper, and the only role that can ever reach this trigger is service_role (client INSERT is revoked)"
  - "workspace_custody_transfers.workspace_id uses ON DELETE SET NULL, not CASCADE — a workspace being deleted must never erase the historical record of a custody negotiation it once hosted"

requirements-completed: [WS-09, WS-10, WS-12]

coverage:
  - id: D1
    description: "workspace_attachments table: a workspace reaches a project only through an attachment row; no owner_workspace_id column exists or is ever added to vault_projects (D-23)"
    requirement: "WS-09"
    verification:
      - kind: unit
        ref: "__tests__/migration-185.test.ts#no workspace-ownership column is added to vault_projects (D-23)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Detachment sets detached_at and severs the link only; no DELETE statement against workspace_attachments and no cascade from workspace_members (D-25)"
    requirement: "WS-09"
    verification:
      - kind: unit
        ref: "__tests__/migration-185.test.ts#detachment severs the link only; nothing is deleted (D-25)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Load-bearing partial unique + covering indexes on workspace_attachments for migration 186's three-hop helper, filtered to detached_at IS NULL"
    requirement: "WS-09"
    verification:
      - kind: unit
        ref: "__tests__/migration-185.test.ts#workspace_attachments carries the link columns and the load-bearing indexes (WS-09, D-23)"
        status: pass
    human_judgment: false
  - id: D4
    description: "workspace_custody_transfers: two-sided offer/accept state machine with a four-state CHECK, a self-transfer refusal, and a partial unique one-live-offer-per-project index (D-29)"
    requirement: "WS-12"
    verification:
      - kind: unit
        ref: "__tests__/migration-185.test.ts#custody transfer is structurally two-sided (WS-12, D-29)"
        status: pass
    human_judgment: false
  - id: D5
    description: "guard_custody_transfer_offered_by_holder() BEFORE INSERT trigger makes an offer from anyone but the current holder or an owner/admin of the named workspace impossible, raising insufficient_privilege"
    requirement: "WS-12"
    verification:
      - kind: unit
        ref: "__tests__/migration-185.test.ts#custody transfer is structurally two-sided (WS-12, D-29) > the guard checks offered_by against from_user_id and an active owner/admin role on workspace_id"
        status: pass
    human_judgment: false
  - id: D6
    description: "custody_transfer_visible() keys only on from_user_id/to_user_id/offered_by — a workspace seat alone never reveals a private custody negotiation"
    requirement: "WS-12"
    verification:
      - kind: unit
        ref: "__tests__/migration-185.test.ts#custody_transfer_visible keys only on the three named parties (T-38-10-04)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Both tables write-locked (REVOKE INSERT/UPDATE/DELETE), RLS-enabled, and gated by scalar-subselect-wrapped SELECT policies routed through the two new SECURITY DEFINER helpers"
    requirement: "WS-10"
    verification:
      - kind: unit
        ref: "__tests__/migration-185.test.ts#the helper pair is SECURITY DEFINER, STABLE, and search-path-pinned"
        status: pass
      - kind: unit
        ref: "__tests__/migration-185.test.ts#two-table write lockdown — no client PostgREST write path"
        status: pass
    human_judgment: false
  - id: D8
    description: "Scope guard: no CREATE/DROP POLICY in this file names vault_projects, tracks, vault_assets, vault_documents, or tool_outputs — migration 186's live-policy work did not leak into this additive batch"
    verification:
      - kind: unit
        ref: "__tests__/migration-185.test.ts#scope guard — Slice D policy work (migration 186) does not leak into this migration"
        status: pass
    human_judgment: false
  - id: D9
    description: "Owner pushes migration 185 (batched with 183 and 184) and confirms both custody-guard rejections against the live database"
    human_judgment: true
    rationale: "An executor agent must never run supabase db push in this repo — the standing HUMAN-GATED convention stated verbatim in the headers of migrations 078, 080, 136, 177, 181, 182, 183 and 184. Only the owner, against the real remote database, can confirm supabase migration list shows LOCAL=REMOTE through 185 and that both adversarial insert rejections actually fire."
    verification: []

# Metrics
duration: 25min
completed: 2026-09-05
status: complete
---

# Phase 38 Plan 10: Migration 185 — Workspace Attachments & Record-Custody Transfers Summary

**Authored `workspace_attachments` (the link a workspace reaches a project through) and `workspace_custody_transfers` (the two-sided offer/accept custody record), both write-locked and helper-mediated, with a paired 50-test Jest suite proving D-23/D-25/D-26/D-29 hold structurally — push deferred to the batched 183–185 owner sitting.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-05T00:00:00Z (approx, worktree session)
- **Completed:** 2026-09-05
- **Tasks:** 2 of 3 executed (Task 3 is the blocking owner-push checkpoint, deferred per owner decision)
- **Files modified:** 2 (both new)

## Accomplishments
- `public.workspace_attachments` — the additive-only link table a workspace reaches a project through (D-23), with `detached_at` as the sole detach mechanism (D-25) and a covering `(project_id, workspace_id) WHERE detached_at IS NULL` index explicitly documented as the entry point for migration 186's three-hop project-permission helper.
- `public.workspace_custody_transfers` — the two-sided custody-offer record (D-29): a four-state machine (`offered` → `accepted`/`declined`/`withdrawn`), `CHECK (from_user_id <> to_user_id)`, and a partial unique index limiting a project to one live offer at a time.
- `guard_custody_transfer_offered_by_holder()` — a BEFORE INSERT trigger that raises `insufficient_privilege` unless `offered_by` is the current holder (`from_user_id`) or an active owner/admin of the named `workspace_id`, following migration 172's plain-plpgsql guard shape. This makes a unilateral custody grab structurally impossible even if a future service route forgets to check.
- `workspace_attachment_visible()` and `custody_transfer_visible()` — SECURITY DEFINER, STABLE, `search_path = ''` helpers following migrations 182/183/184's exact convention, each REVOKE'd from PUBLIC/anon/authenticated then GRANT'd EXECUTE to authenticated only, documented as RLS primitives not client RPCs.
- Both tables write-locked (`REVOKE INSERT, UPDATE, DELETE ... FROM authenticated, anon`) and RLS-enabled with SELECT policies wrapped as `(SELECT public.<helper>(...))`.
- `__tests__/migration-185.test.ts` — 50 passing tests covering table shape, the D-23 no-ownership-column guarantee, the D-25 detach-is-not-delete guarantee, the D-29 two-sided state machine and guard, custody-negotiation privacy, write lockdown, helper conventions, and — the load-bearing one — the scope guard proving no policy on any of the five production tables (`vault_projects`, `tracks`, `vault_assets`, `vault_documents`, `tool_outputs`) appears anywhere in this file.
- `npx tsc --noEmit` clean across the whole project.
- Confirmed no duplicate migration numbers in `supabase/migrations/` and that all four Slice A–D migration test suites (182/183/184/185) pass together — 202 tests total.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author migration 185 — attachments and custody transfers** - `caeca14e` (feat)
2. **Task 2: Paired string-assertion test for migration 185** - `2d069386` (test)

**Plan metadata:** pending (this SUMMARY.md commit)

## Files Created/Modified
- `supabase/migrations/185_workspace_attachments_custody.sql` - `workspace_attachments` + `workspace_custody_transfers` tables, two SECURITY DEFINER helpers, one BEFORE INSERT guard trigger, write lockdown, two SELECT policies. Additive only.
- `__tests__/migration-185.test.ts` - 50-test string-assertion suite verifying table shape, D-23/D-25/D-26/D-29 structural guarantees, custody privacy, lockdown, helper conventions, and the scope guard against Slice D policy leakage.

## Decisions Made
- **`workspace_attachment_visible()` does not filter on `detached_at`.** Visibility of the audit-trail row itself (an active workspace member or the project's current custodian can always see the attachment, including a detached one) is a different question from migration 186's live-attachment-only project-access hop, which filters via the `WHERE detached_at IS NULL` index directly. Mirrors migration 183's "history stays visible" posture for roster relationships.
- **`guard_custody_transfer_offered_by_holder()` is plain `LANGUAGE plpgsql` (not `SECURITY DEFINER`)**, matching migration 172's `guard_work_graduation_owner_only()` shape exactly, as the plan's `<read_first>` directed. It only calls `public.workspace_member_role()`, which is already `GRANT EXECUTE TO authenticated`, and the only role that can ever reach an INSERT on this table is `service_role` (client INSERT is revoked in section (c)), so invoker rights are sufficient.
- **`workspace_custody_transfers.workspace_id` is `ON DELETE SET NULL`, not `CASCADE`.** A transfer negotiation is a permanent diary entry (D-29); a workspace being deleted must not erase the historical record of a custody offer it once hosted, even though the workspace context itself becomes unrecoverable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded the `workspace_attachments` table comment to avoid failing its own no-ownership-column test**
- **Found during:** Task 2 (first test run)
- **Issue:** The `COMMENT ON TABLE public.workspace_attachments IS '...'` string (executable SQL, not a `--` line comment, so not stripped by the comment-stripping test harness) originally spelled out the literal identifier `owner_workspace_id` in prose explaining what the table deliberately does NOT have. The test asserting "no `owner_workspace_id` identifier anywhere" in comment-stripped SQL correctly caught this — the literal string appeared in an executable `COMMENT ON TABLE` statement.
- **Fix:** Reworded the table comment to describe the D-23 guarantee in plain words ("vault_projects carries no additional ownership column naming a workspace") without spelling out the specific column name a future migration must never add — mirroring migration 184's own test-file note that "the excluded... assertion... runs against comment-stripped SQL, so the migration's own header/table-comment prose may still describe the rule in plain, category-level words without ever naming either literal value."
- **Files modified:** `supabase/migrations/185_workspace_attachments_custody.sql`
- **Verification:** `npx jest __tests__/migration-185.test.ts` — 50/50 passing after the edit.
- **Committed in:** `caeca14e` (Task 1 commit — the edit landed before the file was ever committed, so no separate fix commit was needed).

---

**Total deviations:** 1 auto-fixed (1 bug, self-caught by the paired test before commit)
**Impact on plan:** Cosmetic wording fix inside a table comment; no schema, policy, or trigger behavior changed. No scope creep.

## Issues Encountered
None beyond the self-caught wording issue above.

## User Setup Required
None - no external service configuration required. Migration push is the CHECKPOINT below, not a user-setup task.

## Next Phase Readiness

**Ready for migration 186 (plan 38-11):** the `(project_id, workspace_id) WHERE detached_at IS NULL` covering index on `workspace_attachments` is in place and explicitly documented as the first hop of migration 186's three-hop project-permission helper. `workspace_attachment_visible()` establishes the naming and shape convention migration 186's own helpers should continue.

**Ready for plan 38-13 (custody transfer service route):** `workspace_custody_transfers` stores the offer/accept diary; the plan's own header states explicitly that the actual `vault_projects.user_id` write happens in that service route on acceptance, never in a trigger here — 38-13 should read this migration's header before implementing.

**Cross-worktree note for 38-09 (sibling plan, same wave):** this plan did not read or depend on `lib/workspaces/grant-service.*`, `lib/workspaces/acting.*`, or `app/api/workspaces/[workspaceId]/grants/route.ts` — those files do not exist yet in this worktree (confirmed via `ls lib/workspaces/`) and this migration has no dependency on them. No stubbing was needed.

**Blocker: none for this plan's own scope.** The blocking item below is the owner's push checkpoint, expected and by design (HUMAN-GATED convention).

---

## CHECKPOINT REACHED

**Type:** human-verify (blocking — `gate="blocking-human"` equivalent; this is a database-push checkpoint, never auto-approved even under `auto_advance`)
**Plan:** 38-10
**Progress:** 2/3 tasks complete (Task 3 is this checkpoint itself)

### Completed Tasks

| Task | Name | Commit | Files |
| ---- | ----------- | ------ | ---------------------------- |
| 1 | Author migration 185 — attachments and custody transfers | `caeca14e` | `supabase/migrations/185_workspace_attachments_custody.sql` |
| 2 | Paired string-assertion test for migration 185 | `2d069386` | `__tests__/migration-185.test.ts` |

### Current Task

**Task 3:** [BLOCKING] Owner reviews and pushes migration 185
**Status:** awaiting owner action — deliberately NOT executed by this agent
**Blocked by:** standing repo-wide rule — an executor agent never runs `supabase db push`, `supabase db reset`, or `supabase migration up` (stated verbatim in the headers of migrations 078, 080, 136, 177, 181, 182, 183, and 184, and restated in this migration's own header).

### Checkpoint Details

**Owner decision (2026-09-05): migrations 183, 184, and 185 are BATCHED into a single owner push sitting before Wave 6.** This plan's Task 3 is the LAST migration in that batch — this SUMMARY's checkpoint section is meant to be read alongside 38-04's (migration 183) and 38-08's (migration 184) checkpoint sections at that one sitting.

**What was built:**
`supabase/migrations/185_workspace_attachments_custody.sql` — `workspace_attachments` (the workspace-to-project link, with a detached-at history convention and the covering index migration 186 will join through) and `workspace_custody_transfers` (the two-sided offer record with a self-transfer refusal and an offered-by guard trigger), both write-locked with helper-mediated SELECT policies. Paired test `__tests__/migration-185.test.ts` is green (50/50), including an assertion that this file changes no policy on any of the five production tables. Additive only.

**How to verify (self-contained — read this section alone, no other file needed):**

An executor agent must NEVER run `supabase db push` in this repo. This is the owner's step, per the convention in the headers of migrations 078, 080, 136, 177, 181, 182, 183, and 184.

1. Read `supabase/migrations/185_workspace_attachments_custody.sql` end to end (299 lines). Confirm by eye that no statement alters `vault_projects` or any of its child tables (`tracks`, `vault_assets`, `vault_documents`, `tool_outputs`).
2. If verifying 183, 184, and 185 in the same batched sitting: confirm `supabase migration list` shows LOCAL = REMOTE through **182** before starting (183 is the first of the three being pushed together).
3. Run `supabase db push` once, applying all three (183, 184, 185) in the same push.
4. Confirm `supabase migration list` now shows LOCAL = REMOTE through **185**.
5. Confirm the schema cache reloaded: an authenticated query against `workspace_attachments` returns an empty array, not a schema-cache error. Repeat against `workspace_custody_transfers`.
6. Smoke the custody guard as the service role:
   - Attempt to INSERT a `workspace_custody_transfers` row where `offered_by` is a third party with no owner or admin seat in the named `workspace_id`. **It must be rejected** with `insufficient_privilege`.
   - Attempt to INSERT a row where `from_user_id` equals `to_user_id`. **It must also be rejected** (the `CHECK (from_user_id <> to_user_id)` constraint fires).
7. Confirm no existing behavior changed: open the personal Sound Vault, a shared project from the Phase 21 "Shared with me" lane, a Writer's Room, and the Contract Locker. Each must behave exactly as before — this migration adds tables but changes no read path on any pre-existing table.

**Migration 186 must NOT be batched with 182–185.** It edits LIVE policies on `vault_projects` and four child tables and gets its own review, its own push, and its own adversarial smoke — this is stated in this migration's own header and in 184's checkpoint section.

**Acceptance criteria:**
- `supabase migration list` reports LOCAL = REMOTE through 185.
- Both rejected inserts in step 6 fail with the expected errors (`insufficient_privilege` for the third-party offer; the CHECK-constraint error for the self-transfer).
- Personal Vault, a Phase 21 shared project, Writer's Room, and Contract Locker all behave exactly as before.

### Awaiting

**Resume signal:** Type "approved" once 185 is live and both custody-guard rejections were observed, or describe what failed.

## Self-Check: PASSED

- FOUND: `supabase/migrations/185_workspace_attachments_custody.sql`
- FOUND: `__tests__/migration-185.test.ts`
- FOUND: commit `caeca14e`
- FOUND: commit `2d069386`
