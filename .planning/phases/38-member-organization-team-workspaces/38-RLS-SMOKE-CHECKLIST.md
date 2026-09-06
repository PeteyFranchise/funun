# 38-11 — Migration 186 RLS Access Smoke Checklist

**Purpose:** A green Jest suite (`__tests__/migration-186.test.ts`,
`__tests__/workspace-structural-exclusions.test.ts`) proves only that the SQL
TEXT matches what was authored and reviewed — it never proves the policies
behave correctly against live Postgres. This repo has no automated live-RLS
test harness; every prior human-gated migration that edited a live policy
(058, 062, 064, 066, 067, 068, 069, 070, 076, and most directly **migration
078**, the pattern this migration extends) has relied on exactly this kind of
manual, human-run checklist at push time. This checklist is a **phase gate,
not a formality** — migration 186 is CONTEXT's risk register's "highest-risk
change in the phase": a bug here grants third parties access to artists'
catalogues platform-wide. Do not skip a row. Do not mark this complete from
memory of how the code should behave — run each check against the live
database.

Run this **after** confirming migrations 182-185 are live and stable and
**after** pushing migration 186 alone (`supabase db push` + `supabase
migration list` LOCAL=REMOTE through 186), per 38-11-PLAN.md's Task 4
blocking checkpoint.

## Prerequisites

- [ ] `supabase migration list` shows LOCAL=REMOTE through **185** BEFORE
      pushing 186 (182-185's own batch, confirmed live and stable first —
      186 must never be pushed in the same run as that batch).
- [ ] `supabase db push` applied for 186 **alone** — no other pending
      migration in the same push.
- [ ] `supabase migration list` now shows LOCAL=REMOTE through **186**.
- [ ] PostgREST schema cache reloaded — migration 186 ends with `NOTIFY
      pgrst, 'reload schema'`. Confirm a fresh authenticated query against
      `workspace_audit_log` returns rows (or an empty array), not a
      schema-cache 404 / "table not found" error.
- [ ] Six distinct test accounts available:
  - **A** — a Member holding a project (the project custodian / subject
    Member a workspace will name on its roster).
  - **B** — a workspace owner (creates the workspace, proposes the roster
    relationship, attaches the project, issues grants).
  - **C** — a workspace member with an operational grant (the person who
    should be able to reach A's attached project through the workspace).
  - **D** — a workspace member with no grant (sees the workspace, cannot
    reach A's project through it).
  - **E** — a former workspace member, membership `status = 'removed'`
    (used for the offboarding/revocation check).
  - **F** — Account F, an unrelated Member with no connection to the
    workspace, A, or any of the above (the "outside the cohort" control —
    must see nothing different before or after 186).

## 1. Inert proposal (acceptance criterion 2)

- [ ] B's workspace proposes a roster relationship naming A
      (`workspace_roster_relationships.state = 'proposed'`). No attachment,
      no grant exists yet.
- [ ] B (owner) sees the proposal in the workspace's roster view.
- [ ] B, C, and D see **none** of A's projects, tracks, assets, documents,
      or tool outputs — the proposal is inert (D-05).
- [ ] A sees the claim naming them (their own roster-relationships row is
      visible per migration 183's `workspace_roster_relationships_select`
      policy).

## 2. Accepted, attached, granted (acceptance criterion 3)

- [ ] A accepts — relationship state becomes `accepted`.
- [ ] B attaches one of A's projects (`workspace_attachments`, live row,
      `detached_at IS NULL`).
- [ ] B issues C an operational grant (e.g. `view_summaries`) scoped to the
      relationship, `project_id` either NULL (relationship-wide) or set to
      the attached project.
- [ ] **C** now sees exactly that one attached project and its
      `tracks`/`vault_assets`/`vault_documents`/`tool_outputs` rows.
- [ ] **C** does NOT see A's OTHER projects (the ones never attached).
- [ ] **D** (no grant) still sees nothing of A's project through the
      workspace.
- [ ] **F** (unrelated) still sees nothing.

## 3. Per-project narrowing (D-20)

- [ ] B attaches a SECOND of A's projects, but does not extend C's grant to
      cover it (grant's `project_id` was set to the FIRST project
      specifically, not NULL/relationship-wide).
- [ ] C sees the FIRST attached project only — the second attached project
      is invisible to C despite being attached to the same workspace.

## 4. Authority gate (acceptance criterion 4)

- [ ] With no agreement evidence attached to the relationship, confirm C
      (holding only an operational grant) CANNOT exercise an authority-tier
      action (e.g. `request_signatures`, `approve_releases`) — the app-level
      `assertMayExercise` refuses it (tier check, not this migration's RLS,
      but confirm the underlying grant issuance also refused an
      authority-tier grant at issue time per D-49).
- [ ] Attach agreement evidence with a declared scope covering the
      authority permission; confirm C can now be granted and can exercise
      it.
- [ ] Set the evidence's `expires_at` into the past; confirm the
      authority-tier action fails again immediately (no cron wait, no
      cache), while C's operational reads (from step 2) continue to
      succeed unaffected.

## 5. Clean-master separation (acceptance criterion 5, custody D-01/D-09)

- [ ] Confirm none of the four system preset bundles
      (`read_only`/`day_to_day`/`full_operational`/`operational_plus_authority`)
      offers `access_clean_masters` — it must be granted individually.
- [ ] Grant `access_clean_masters` individually to C.
- [ ] Confirm the clean-master download still resolves ONLY through the
      existing asset-class-specific accessor (never a new general
      "workspace" accessor) and that using it produces a
      `workspace_audit_log` row (D-40's "every use is logged").
- [ ] Confirm NO preview, evaluation, or pitch surface exposes the clean
      master's original path to C, even after this grant.

## 6. Payout unreachability (acceptance criterion 6, D-42)

- [ ] As C, attempt to read `subscriptions` directly via authenticated
      PostgREST. Expect it to return nothing belonging to A (RLS on
      `subscriptions` is untouched by 186 — this migration adds no branch
      there).
- [ ] As C, attempt to reach any payout-adjacent field through every
      workspace API route (`/api/workspaces/**`). Expect nothing — no route
      exposes `manage_payouts` or `view_tax_information`; they are not
      valid `WorkspacePermission` values at all (D-42, confirmed statically
      by `__tests__/workspace-structural-exclusions.test.ts`).

## 7. Removal and revocation (acceptance criterion 7)

- [ ] Set **E**'s `workspace_members.status` to `'removed'`. Confirm E's
      access to any previously-reachable project stops on the VERY NEXT
      query (no cache, no delay).
- [ ] Have **A** end the roster relationship unilaterally
      (`workspace_roster_relationships.state = 'ended'`, or termination
      date reached). Confirm:
  - [ ] **C**'s access to A's attached project(s) stops immediately.
  - [ ] No `vault_projects` row moved, was copied, or was deleted — the
        project row is unchanged except for what the attachment's own
        detach (if performed) records.
  - [ ] Every `workspace_audit_log` row from steps 2-6 still exists (append-
        only) and remains visible to **both** A (as `subject_member_id`)
        and B/C (as active members of the workspace at the time, per
        `workspace_audit_visible()`).

## 8. Grant subset and re-check (acceptance criterion 9, D-49)

- [ ] Have **C** attempt to issue **D** a grant EXCEEDING C's own resolved
      set (e.g. C holds only `view_summaries`, tries to grant D
      `edit_metadata`). Expect an explicit refusal naming the specific
      permission (`assertGrantIssuable` / `isSubsetGrant`), not a silent
      trim.
- [ ] Reduce **C**'s own grant (revoke `edit_metadata` if C held it, or
      revoke whatever D's grant depended on transitively). Confirm any
      grant D was previously issued that depended on C's now-reduced access
      stops working on the next read — `resolveEffectivePermissions`
      re-derives from live rows on every call, nothing cached.

## 8a. Disable control turns access OFF (D-56 / WS-31)

- [ ] As **C** (able to see an attached project per step 2), confirm the
      catalogue query currently returns the attached project.
- [ ] Run: `UPDATE public.workspace_access_config SET enabled = FALSE,
      disabled_reason = 'checkpoint drill', disabled_at = now() WHERE id;`
- [ ] Re-run C's catalogue query. It MUST return **ZERO** rows for anything
      reached only through the workspace branch.
- [ ] In the SAME disabled state, confirm **F**'s personal Vault, Writer's
      Room, Contract Locker, and split-sheet flows are **completely
      unaffected** — the control governs workspace-derived access only,
      never ownership-based access.
- [ ] Confirm **A** (the project's actual owner) still sees their own
      project normally while the control is disabled.

## 8b. Disable control turns access back ON, and fails closed

- [ ] Run: `UPDATE public.workspace_access_config SET enabled = TRUE,
      disabled_reason = NULL, disabled_at = NULL WHERE id;`
- [ ] Confirm C's catalogue query returns the attached project again.
- [ ] Inside a transaction you WILL roll back: `BEGIN; DELETE FROM
      public.workspace_access_config;`
- [ ] Confirm C's catalogue query returns **ZERO** rows while the config
      row is absent (fail-closed on a missing row — `COALESCE(..., FALSE)`).
- [ ] `ROLLBACK;` and confirm C's access is restored.

## 9. Recursion check (T-38-11-02)

- [ ] Run one ordinary authenticated read against EACH of: `vault_projects`,
      `tracks`, `project_members`, `split_sheets`, `works`. Perform this as
      **every** account (A, B, C, D, E, F), not just one.
- [ ] Any `SQLSTATE 42P17 infinite recursion detected in policy` on ANY of
      these tables, for ANY account, means **STOP AND ROLL BACK
      IMMEDIATELY** — this failure is user-independent and breaks every
      query rewrite through the affected table, not just workspace-derived
      ones.
- [ ] A plain `tracks` INSERT (the readiness-trigger transitive path) still
      succeeds for an owner and for a co-owner/editor project_member,
      confirming `calculate_vault_readiness()`'s internal `UPDATE
      vault_projects` does not interact unexpectedly with the widened
      UPDATE policy.

## 10. Performance measurement (D-48's flagged risk)

- [ ] Attach at least 200 projects to a single test workspace (or use a
      seeded workspace with that scale).
- [ ] Run `EXPLAIN ANALYZE` on a workspace catalogue query (a `SELECT`
      against `vault_projects` scoped to that workspace's attached
      projects, as an active member with a grant).
- [ ] **Record the timing here:**

  ```
  EXPLAIN ANALYZE output / timing:
  (paste or summarize here)
  ```

- [ ] If the plan shows a **sequential scan** on `vault_projects`,
      `workspace_attachments`, `workspace_members`,
      `workspace_roster_relationships`, or `workspace_grants` rather than an
      **index-only lookup** (via `idx_workspace_attachments_project_live`,
      `idx_workspace_grants_covering`, and the migration 182/183 indexes),
      **STOP and revisit the indexes from migrations 184 and 185** before
      rollout — do not ship on an unmeasured assumption.

## 11. No behavioral difference outside the cohort (acceptance criterion 10)

- [ ] As **F**, exercise: personal Vault (create/view/edit a project),
      Writer's Room, Contract Locker (upload/view a document), and split
      sheets (view/edit a split sheet F is a party to).
- [ ] Confirm every one of these flows behaves **exactly as it did before
      186** — no new prompts, no new latency, no visible change of any
      kind. D-52/D-53/D-54/D-55 all require this migration to be
      structurally invisible to anyone outside the workspace cohort.

## Sign-off

- [ ] All rows above pass.
- [ ] `supabase migration list` confirms LOCAL=REMOTE through 186, pushed
      alone (not batched with 182-185).
- [ ] No `SQLSTATE 42P17` observed anywhere in this checklist, for any
      account, against any table.
- [ ] `EXPLAIN ANALYZE` timing from step 10 is recorded above.

**Kill-switch decision (D-56 drill outcomes) — record all three:**

| Drill | Outcome | Notes |
|---|---|---|
| 8a — disabled (`enabled = FALSE`) blocks workspace-derived access, personal access unaffected | [ ] Pass / [ ] Fail | |
| 8b — re-enabled (`enabled = TRUE`) restores access | [ ] Pass / [ ] Fail | |
| 8b — missing config row fails CLOSED inside the rolled-back transaction | [ ] Pass / [ ] Fail | |

**Date run:** ______________
**Run by:** ______________
**Measured `EXPLAIN ANALYZE` timing (step 10):** ______________

Type **"approved"** on the Task 4 checkpoint once every box above is
checked, the timing is recorded, and all three kill-switch drill outcomes
pass — or describe the specific failing row.
