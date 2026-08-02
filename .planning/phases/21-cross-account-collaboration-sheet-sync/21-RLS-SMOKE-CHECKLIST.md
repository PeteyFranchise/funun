# 21-01 — Migration 078 RLS Access Smoke Checklist

**Purpose:** Manual, human-run access-matrix verification for migration 078
(`project_members` + the RLS rewrite on `vault_projects` and its four child
tables). This repo has no automated live-RLS test harness — every prior
human-gated migration (058, 062, 064, 066, 067, 068, 069, 070, 076) has
relied on exactly this kind of manual checklist at push time
(21-RESEARCH.md, Validation Architecture).

Run this **after** confirming Phase 20's 076/077 are live and **after**
pushing migration 078 (`supabase db push` + `supabase migration list`
LOCAL=REMOTE through 078), per 21-01-PLAN.md Task 3.

## Prerequisites

- [ ] `supabase migration list` shows LOCAL=REMOTE through **077** (Phase
      20's 20-03/20-04) BEFORE pushing 078.
- [ ] `supabase db push` applied; `supabase migration list` now shows
      LOCAL=REMOTE through **078**.
- [ ] PostgREST schema cache reloaded — migration 078 ends with
      `NOTIFY pgrst, 'reload schema'`. Confirm a fresh authenticated query
      against `project_members` returns rows (or an empty array), not a
      schema-cache 404 / "table not found" error.
- [ ] At least two distinct test accounts available: **Account A** (will
      own a project) and **Account B** (will be granted membership on
      Account A's project). A third **Account C** (non-member) is needed
      for the negative-access rows below.

## Backfill check

- [ ] For every pre-existing `vault_projects` row, an `owner`
      `project_members` row exists with matching `project_id`/`user_id`.
      Spot-check: `SELECT COUNT(*) FROM vault_projects` should equal
      `SELECT COUNT(*) FROM project_members WHERE role = 'owner'` (assuming
      no project already had a manually-inserted owner row before the
      backfill ran — expected to be true pre-078, since no write path to
      `project_members` existed before this migration).

## Access matrix — `vault_projects`

Grant Account B a role on one of Account A's projects via a direct
`INSERT INTO project_members (project_id, user_id, role, added_by) VALUES
(...)` (service-role / SQL console — no client route exists yet; that is
expected per 21-01-PLAN.md's Planner Decision #2).

| Role tested | SELECT (sees project) | UPDATE (edits project) | DELETE (deletes project) |
|---|---|---|---|
| Owner (Account A, no membership row needed beyond backfill) | [ ] Yes | [ ] Yes | [ ] Yes |
| Co-owner (Account B, `role='co-owner'`) | [ ] Yes | [ ] Yes | [ ] **No** (expect RLS-filtered 0 rows / no-op) |
| Editor (Account B, `role='editor'`) | [ ] Yes | [ ] Yes | [ ] **No** |
| Viewer (Account B, `role='viewer'`) | [ ] Yes | [ ] **No** (expect RLS-filtered 0 rows / no-op) | [ ] **No** |
| Non-member (Account C, no `project_members` row) | [ ] **No** (project absent from Account C's authenticated SELECT) | [ ] **No** | [ ] **No** |

## Access matrix — child tables

Repeat for **each** of `tracks`, `vault_assets`, `vault_documents`,
`tool_outputs`, using a row already attached to Account A's test project
(`project_id` set, not a standalone/unattached row):

| Role tested | SELECT (sees the child row) | Write (UPDATE the child row) |
|---|---|---|
| Owner | [ ] Yes | [ ] Yes |
| Co-owner | [ ] Yes | [ ] Yes |
| Editor | [ ] Yes | [ ] Yes |
| Viewer | [ ] Yes (visibility only) | [ ] **No** |
| Non-member | [ ] **No** | [ ] **No** |

- [ ] `tracks` — matrix above passes
- [ ] `vault_assets` — matrix above passes
- [ ] `vault_documents` — matrix above passes
- [ ] `tool_outputs` — matrix above passes

### Nullable-`project_id` fallback (vault_documents / tool_outputs only)

- [ ] A standalone `vault_documents` row (`project_id IS NULL`,
      `user_id = Account A`) is still visible and writable by Account A
      after 078 (the nullable fallback clause preserves pre-existing
      unattached-row access).
- [ ] Same check for a standalone `tool_outputs` row.
- [ ] Account B (no ownership of that standalone row) CANNOT see or write
      it, confirming the nullable fallback did not accidentally widen
      access to unattached rows beyond their own creator.

## `project_members` table itself

- [ ] Account A (owner) can SELECT the full membership list for their
      project (sees Account B's row too).
- [ ] Account B, if granted `co-owner`, can also SELECT the full list.
- [ ] Account B, if granted `editor` or `viewer`, sees **only their own
      row** in `project_members` — not other members' rows (least-privilege
      per 21-RESEARCH.md Open Question 2).
- [ ] No authenticated role (owner, co-owner, editor, viewer, non-member)
      can INSERT, UPDATE, or DELETE a `project_members` row directly via
      PostgREST — expect `42501 insufficient_privilege` on any attempted
      client write. (Writes are REVOKEd in 078(b); the only writers are the
      owner backfill and Plan 21-02's SECURITY DEFINER auto-membership
      trigger.)

## Recursion / stability check

- [ ] Every authenticated SELECT against `vault_projects`, `project_members`,
      `tracks`, `vault_assets`, `vault_documents`, and `tool_outputs`
      succeeds without a `42P17 infinite recursion detected in policy`
      error — for EVERY role tested above, not just the owner.
- [ ] A plain `tracks` INSERT (the readiness-trigger transitive path that
      broke pre-064) still succeeds for an editor-role member, confirming
      `calculate_vault_readiness()`'s `UPDATE vault_projects` (migration 070,
      SECURITY DEFINER) does not hit the widened UPDATE policy in an
      unexpected way.

## Sign-off

- [ ] All rows above pass.
- [ ] `supabase migration list` confirms LOCAL=REMOTE through 078.
- [ ] No `42P17` observed anywhere in this checklist.

Type **"approved"** on the Task 3 checkpoint once every box above is
checked, or describe the specific failing matrix cell.
