---
phase: 38-member-organization-team-workspaces
plan: 08
subsystem: database
tags: [supabase, postgres, rls, migration, security-definer, workspaces, permissions, grants]

# Dependency graph
requires: ["38-01", "38-03"]
provides:
  - "supabase/migrations/184_workspace_permissions_grants.sql — public.workspace_grants (one row per granted permission, CHECK list mirroring WORKSPACE_PERMISSION_VALUES, three load-bearing indexes) and public.workspace_permission_bundles (four seeded editable system presets), with RLS, write lockdown, column-level lockdown, the workspace_grant_visible_to_member SECURITY DEFINER helper, and two non-recursive SELECT policies"
  - "__tests__/migration-184.test.ts — the paired string-assertion test locking the migration's shape, the catalogue-drift gate, the D-42 structural-exclusion gate, and the D-40 bundle-exclusion gate"
affects: [38-09, 38-10, 38-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER helper (identifier-as-parameter, STABLE, SET search_path = '') — reapplied from migrations 182/183 for the grant-to-member visibility predicate"
    - "Column-level REVOKE/GRANT allowlist (migration 080 §(g) convention) applied to a new table, withholding granted_by/revoked_by administrative columns from authenticated"
    - "Structural exclusion via a separate TypeScript union (STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES) mirrored as an absent-by-construction SQL CHECK list, rather than a permission that defaults to false"
    - "Normalized one-row-per-permission grant storage instead of a JSONB set, to make the subset check a set-difference query and per-permission audit natural (D-19, D-49, D-50)"

key-files:
  created:
    - supabase/migrations/184_workspace_permissions_grants.sql
    - __tests__/migration-184.test.ts
  modified: []

key-decisions:
  - "The permission CHECK clause is written as a single-line literal list (not the plan action block's multi-line sketch) so the migration test's checkClause() helper — which joins WORKSPACE_PERMISSION_VALUES with ', ' — can assert byte-identical containment. A multi-line CHECK list is semantically identical SQL but fails a straight substring assertion; the test convention established in migrations 182/183 assumes single-line CHECK clauses, so 184 conforms rather than inventing a new comparison technique."
  - "workspace_grants carries no member-identity column of its own (the member is reached only through relationship_id), so workspace_grant_visible_to_member(p_grant_id, p_uid) joins workspace_grants -> workspace_roster_relationships inside a SECURITY DEFINER body, exactly mirroring migration 183's workspace_agreement_evidence_visible() shape for the same reason (evidence has no workspace_id of its own either)."
  - "The D-42 structural-exclusion table comment describes the excluded capabilities by category ('payout-processing capabilities and tax-information capabilities') rather than by literal identifier, per the plan's explicit instruction not to write either excluded capability's literal value anywhere in migration 184.sql, including in comments. The test file (which must import and assert against the literal STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES array) is the one place those two strings appear, exactly as the plan's <!-- planner-discipline-allow --> markers authorize."
  - "granted_by and revoked_by are withheld from authenticated at the column level (migration 080 §(g) convention) rather than merely row-scoped by RLS — administrative attribution metadata that the D-50 both-sides audit log already discloses correctly, so this table does not need to duplicate that disclosure surface (T-38-08-06, accepted risk per the plan's own threat register)."

requirements-completed: [WS-07, WS-08, WS-20, WS-24]

coverage:
  - id: D1
    description: "workspace_grants stores one row per granted permission, keyed on (workspace, relationship, project, permission), so a grant is a set difference and an audit row can name the exact permission relied on"
    requirement: "WS-07"
    verification:
      - kind: unit
        ref: "__tests__/migration-184.test.ts — 'both tables exist with row level security and gen_random_uuid() defaults', 'the three load-bearing indexes migration 186 depends on exist'"
        status: pass
    human_judgment: false
  - id: D2
    description: "The permission CHECK constraint list is byte-identical to WORKSPACE_PERMISSION_VALUES, so an excluded capability name is not storable in the column at all"
    requirement: "WS-20"
    verification:
      - kind: unit
        ref: "__tests__/migration-184.test.ts — 'workspace_grants.permission matches WORKSPACE_PERMISSION_VALUES byte-for-byte', 'payout/tax capabilities are structurally unstorable (D-42)'"
        status: pass
    human_judgment: true
    human_judgment_note: "The live-Postgres smoke — attempting to insert a payout-capability grant and confirming CHECK-constraint rejection — is the owner's Task 3 checkpoint step 6, deferred to the batched 183-185 push."
  - id: D3
    description: "A grant attaches to the member-workspace relationship by default and may be narrowed per project via a nullable project_id"
    requirement: "WS-07"
    verification:
      - kind: unit
        ref: "__tests__/migration-184.test.ts — table-shape describe block asserting workspace_grants columns, incl. relationship_id and project_id nullability by construction (no NOT NULL on either)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Preset bundles are stored data, editable per workspace, and no seeded bundle names a bundle-excluded permission"
    requirement: "WS-08"
    verification:
      - kind: unit
        ref: "__tests__/migration-184.test.ts — 'no seeded system bundle names a bundle-excluded permission (D-40)', 'each seeded bundle equals the exported WORKSPACE_PERMISSION_BUNDLES array for its key'"
        status: pass
    human_judgment: false
  - id: D5
    description: "Grant tables carry the same write lockdown as every other membership table, with column-level lockdown withholding administrative columns"
    requirement: "WS-24"
    verification:
      - kind: unit
        ref: "__tests__/migration-184.test.ts — 'two-table write lockdown — no client PostgREST write path', 'workspace_grants column-level SELECT lockdown withholds administrative columns'"
        status: pass
    human_judgment: false

# Metrics
duration: 30min
completed: 2026-09-05
status: complete
---

# Phase 38 Plan 08: Migration 184 — Workspace Permissions & Grants Summary

**Migration 184 ships Slice C's storage — `workspace_grants` (one row per granted permission, CHECK list byte-identical to the TypeScript catalogue, three load-bearing indexes for migration 186's hot path) and `workspace_permission_bundles` (four editable system presets, none naming a bundle-excluded permission) — plus the `workspace_grant_visible_to_member` SECURITY DEFINER helper, authored and text-tested, awaiting the batched 183-185 owner push.**

## Performance

- **Duration:** ~30 min (context reading — permissions.ts, grants.ts, types.ts, migrations 182/183, migration-182/183 tests, migration 080 §(g), migration-136 test, 38-CONTEXT.md decisions/permission_matrix — plus authoring and verification)
- **Tasks:** 2 of 3 (Task 3 is the blocking human checkpoint, correctly not executed)
- **Files modified:** 2 (both new)

## Accomplishments

- `supabase/migrations/184_workspace_permissions_grants.sql`:
  - `workspace_grants`: `id`, `workspace_id` NOT NULL, `relationship_id` nullable (workspace-wide grant when unset), `project_id` nullable (narrows/widens per project, D-20), `permission` TEXT NOT NULL CHECK'd against the complete 19-value literal list mirroring `WORKSPACE_PERMISSION_VALUES` in catalogue order, `source` (`'bundle'` | `'individual'`), `granted_by`/`granted_at`/`revoked_at`/`revoked_by`.
  - Three indexes: a `UNIQUE ... NULLS NOT DISTINCT WHERE revoked_at IS NULL` partial index on `(workspace_id, relationship_id, project_id, permission)` so two relationship-wide (`project_id IS NULL`) grants for the same permission correctly collide; a covering index on `(workspace_id, permission, project_id) WHERE revoked_at IS NULL` for migration 186's per-row helper; an index on `(relationship_id) WHERE revoked_at IS NULL`.
  - `workspace_permission_bundles`: `workspace_id` nullable (NULL = system preset), `key`, `label`, `permissions` JSONB, `is_system`, two partial unique indexes (`(workspace_id, key) WHERE workspace_id IS NOT NULL` and `(key) WHERE workspace_id IS NULL`), an `update_updated_at()` trigger.
  - Four system bundles seeded (`read_only`, `day_to_day`, `full_operational`, `operational_plus_authority`) with `ON CONFLICT (key) WHERE workspace_id IS NULL DO NOTHING` for idempotency — each `permissions` array is exactly the list `WORKSPACE_PERMISSION_BUNDLES` exports for that key; none names `access_clean_masters`, `view_private_rights_identifiers`, or `view_earnings` (D-40).
  - Write lockdown on both tables; column-level `REVOKE SELECT ... FROM authenticated, anon` + `GRANT SELECT` on `workspace_grants` withholding `granted_by`/`revoked_by` (migration 080 §(g) convention).
  - `public.workspace_grant_visible_to_member(p_grant_id, p_uid)` — a new SECURITY DEFINER helper (grants carry no member-identity column of their own) joining `workspace_grants -> workspace_roster_relationships` to let the named Member see exactly which permissions a workspace holds over them (D-50), mirroring migration 183's `workspace_agreement_evidence_visible()` shape.
  - Two non-recursive SELECT policies: `workspace_grants_select` (any active workspace member, OR the Member on the other side of the grant's relationship); `workspace_permission_bundles_select` (system bundles readable by every authenticated caller, workspace bundles by that workspace's active members).
  - Table comment on `workspace_grants` states the D-42 structural exclusion in plain, category-level words ("payout-processing capabilities and tax-information capabilities") — the two literal excluded values (`manage_payouts`, `view_tax_information`) never appear anywhere in this file, including in comments, per the plan's explicit instruction.
- `__tests__/migration-184.test.ts` — 50 tests: table shape/RLS/PK; the catalogue-drift gate (CHECK clause built from imported `WORKSPACE_PERMISSION_VALUES`); the D-42 structural-exclusion gate (iterates `STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES`, asserts absence from comment-stripped SQL, and asserts an empty intersection with the CHECK list); the D-40 bundle-exclusion gate (iterates every seeded bundle, asserts `isBundleExcluded` false for each named permission); the seed-agreement gate (each seeded array equals its exported array exactly, via a bundle-permission extractor parsing the JSONB literal out of the INSERT); the three index gates; the write and column-level lockdown; the helper's SECURITY DEFINER/STABLE/search-path declaration and REVOKE/GRANT pair; the unwrapped-helper-call guard; the scope guard (no `ALTER TABLE ... vault_projects`, no `... tracks`, no three-hop helper defined here); and housekeeping (numbering, `gen_random_uuid()`, single trailing `NOTIFY`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Author migration 184 — grants and bundles** - `a6cdd359` (feat)
2. **Task 2: Paired string-assertion test for migration 184, including catalogue-drift and bundle-exclusion gates** - `3e43af13` (test)
3. **Task 3: [BLOCKING] Owner reviews and pushes migration 184** - NOT EXECUTED, per this plan's explicit `<CRITICAL_DO_NOT_PUSH>` instruction and the owner's 2026-09-05 decision to batch 183, 184 and 185 into a single push sitting before Wave 6.

**Plan metadata:** committed with this SUMMARY (worktree mode — orchestrator finalizes STATE.md/ROADMAP.md after merge)

## Files Created/Modified

- `supabase/migrations/184_workspace_permissions_grants.sql` — the two Slice C tables, write + column-level lockdown, the grant-visibility helper, two SELECT policies, four seeded system bundles, schema-cache reload
- `__tests__/migration-184.test.ts` — the paired string-assertion test

## Verification Performed

- `npx jest __tests__/migration-184.test.ts`: **PASS** — 50/50 tests
- `npx tsc --noEmit`: **PASS** — clean, no errors
- `ls supabase/migrations | grep -oE '^[0-9]+' | sort -n | uniq -d`: **PASS** — no collisions
- Manual review confirmed neither `manage_payouts` nor `view_tax_information` appears anywhere in the raw migration file (not merely the comment-stripped SQL) — the test file is the only place those literal strings are asserted, importing them from `STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES`.

## Cross-Worktree Verification (per this wave's hazard note)

Read the real shipped files rather than guessing any symbol owned by an earlier plan — this plan's biggest cross-worktree exposure, since its test imports directly from `lib/workspaces/permissions.ts` and `lib/workspaces/grants.ts`:

- `lib/workspaces/permissions.ts` (38-01) — confirmed `WORKSPACE_PERMISSION_VALUES` is exactly the 19-value array in the order reproduced in the migration's CHECK list; confirmed `PERMISSION_TIER`, `WORKSPACE_PERMISSION_BUNDLES` (four keys: `read_only`, `day_to_day`, `full_operational`, `operational_plus_authority`, each built by spreading the prior tier plus new permissions), `isBundleExcluded` (excludes exactly `access_clean_masters`, `view_private_rights_identifiers`, `view_earnings`), and `STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES` (`manage_payouts`, `view_tax_information`, deliberately NOT members of `WorkspacePermission`) by reading the file directly, not from memory or the plan prose.
- `lib/workspaces/grants.ts` (38-01) — confirmed `isSubsetGrant`/`assertGrantIsIssuable`'s existing shape to understand how `workspace_grants` rows will be consumed by plan 38-09's issuance route, without needing to alter or stub either function (this plan owns storage only).
- `lib/workspaces/types.ts` (38-01) — confirmed no additional `*_VALUES` union is needed for this migration beyond what `permissions.ts` already exports.
- `supabase/migrations/182_workspaces_foundation.sql` and `183_workspace_roster_relationships.sql` (38-03, 38-04) — read in full for header style, lockdown posture, the `workspace_member_role`/`is_workspace_owner` helper signatures this migration's policies call, and the `workspace_agreement_evidence_visible()` pattern this plan's own helper mirrors (a child table with no `workspace_id` of its own).
- `supabase/migrations/080_buyer_orgs_members.sql` §(g) (lines 218-233) — read directly for the column-level `REVOKE SELECT` / `GRANT SELECT (cols)` convention before writing `workspace_grants`' column lockdown.
- `__tests__/migration-182.test.ts`, `__tests__/migration-183.test.ts`, `__tests__/migration-136.test.ts` (lines 180-260) — read for the comment-stripping technique, the `checkClause()` builder, and the unwrapped-helper-call collection pattern this plan's test reuses verbatim.
- No symbol was guessed or stubbed. Nothing this plan depends on was found missing.

This plan does not own or touch `lib/workspaces/invitations.*` (38-06's territory) or `lib/workspaces/roster-service.*` (38-07's territory) — no cross-worktree write conflict of the kind Wave 2's 38-03 encountered with `WORKSPACE_OWNER_FLOOR_MESSAGE`, because migration 184 and its test introduce no new TypeScript-side constant a sibling plan must also export byte-identically; every symbol this plan's test imports was already shipped and stable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CHECK clause reformatted to a single line to match the test-convention substring assertion**
- **Found during:** Task 2 (writing the paired test, then running it against Task 1's migration)
- **Issue:** The plan's `<action>` prose for Task 1 sketches the CHECK list wrapped across multiple lines for readability. The migration-182/183 test convention (`checkClause()`) builds the expected string as a single-line, comma-space-joined literal and asserts `sql.toContain(...)` — a multi-line CHECK clause is semantically identical SQL but fails that substring containment check because of the embedded newlines and indentation.
- **Fix:** Rewrote the `permission` column's `CHECK (...)` clause onto a single line in the migration file, matching migrations 182 and 183's established single-line CHECK convention exactly.
- **Files modified:** `supabase/migrations/184_workspace_permissions_grants.sql`
- **Verification:** `npx jest __tests__/migration-184.test.ts` — the catalogue-agreement test passed after the change; re-ran the full suite (50/50 green).
- **Committed in:** `a6cdd359` (part of Task 1's commit — caught and fixed before Task 1 was first committed, so no separate fix commit was needed)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 — formatting/bug, no logic or scope change)
**Impact on plan:** Purely cosmetic SQL formatting to satisfy an established test convention; no change to columns, constraints, indexes, policies, or seeded data. No scope creep.

## Issues Encountered

None beyond the routine worktree git-command-complexity guard, which was satisfied by running single-purpose `git` commands rather than compound shell expressions, and the CHECK-clause formatting fix documented above.

## User Setup Required

None for Tasks 1-2. Task 3 requires the owner's action at the batched 183-185 sitting — see "CHECKPOINT REACHED" below.

## Next Phase Readiness

- Migration 184's SQL and its paired test are both authored and structurally verified. It is NOT yet pushed to any database (correctly — this is a human-gated migration, executor agents never run `supabase db push`).
- Plan 38-09 (grant issuance/revocation routes) and migration 186 (plan 38-11's three-hop RLS branch, which reads `workspace_grants` through the covering index this migration ships) both depend on migration 184 being live before their own work can be pushed or verified against a real database.
- No stubs. No threat-surface additions beyond what this plan's own `<threat_model>` already registers — all eight threats (T-38-08-01 through T-38-08-08) are mitigated by the authored SQL and asserted by the migration test, except T-38-08-08 (package installs), which is accepted with no new package proposed.

## Self-Check: PASSED

Both created files verified present on disk:
- `FOUND: supabase/migrations/184_workspace_permissions_grants.sql`
- `FOUND: __tests__/migration-184.test.ts`

Both commit hashes verified present in `git log`:
- `FOUND: a6cdd359`
- `FOUND: 3e43af13`

---

## CHECKPOINT REACHED

**Type:** human-verify (gate: blocking)
**Plan:** 38-08
**Progress:** 2/3 tasks complete (Task 3 is this checkpoint itself)

### Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Author migration 184 — grants and bundles | `a6cdd359` | `supabase/migrations/184_workspace_permissions_grants.sql` |
| 2 | Paired string-assertion test for migration 184, including catalogue-drift and bundle-exclusion gates | `3e43af13` | `__tests__/migration-184.test.ts` |

### Current Task

**Task 3:** [BLOCKING] Owner reviews and pushes migration 184
**Status:** DEFERRED — not executed by this agent, per the plan's `<CRITICAL_DO_NOT_PUSH>` instruction and the owner's 2026-09-05 decision to batch 183, 184 and 185 into a single push sitting before Wave 6.
**Blocked by:** requires the project owner's `supabase db push`, performed once alongside migrations 183 and 185 at the batched sitting — not before.

### Checkpoint Details

`supabase/migrations/184_workspace_permissions_grants.sql` creates two new tables (`workspace_grants`, `workspace_permission_bundles`), a two-table write lockdown, column-level lockdown on `workspace_grants`, one new SECURITY DEFINER helper (`workspace_grant_visible_to_member`), two non-recursive SELECT policies, and four seeded system bundles. Paired test `__tests__/migration-184.test.ts` is green (50/50) against the real, already-shipped `lib/workspaces/permissions.ts`. Additive only — nothing pre-existing (including migrations 182's and 183's live/authored tables and helpers) is altered.

**What the owner will need to verify at the batched 183-185 sitting (for 184 specifically):**

1. Read `supabase/migrations/184_workspace_permissions_grants.sql` end to end. Pay particular attention to the `permission` CHECK list — confirm by eye that it contains no payout, tax, or earnings-payment capability.
2. Confirm `supabase migration list` shows LOCAL = REMOTE through **183** before pushing (or through 182 if 183 is pushed in the same batched sitting).
3. Run `supabase db push` (batched with 183 and 185 per the owner's own decision).
4. Confirm `supabase migration list` now shows LOCAL = REMOTE through **184** (and 183, 185).
5. Confirm the schema cache reloaded: an authenticated query against `workspace_permission_bundles` returns the four seeded system rows.
6. Smoke the structural exclusion directly in SQL as the service role: attempt to insert a `workspace_grants` row whose `permission` is a payout capability name. It must be rejected by the CHECK constraint, not silently stored.
7. Confirm no existing behavior changed: personal Vault, Writer's Room and Contract Locker load as before.

Migration 186 must **not** be batched with 183-185 — it is the only file in this phase editing already-live RLS policies.

### Awaiting

The project owner's review of `supabase/migrations/184_workspace_permissions_grants.sql` at the batched 183-185 sitting, and the `supabase db push` + verification steps above. Type "approved" once `supabase migration list` shows 184 (with 183/185) live and the excluded-capability insert was rejected, or describe what failed.

---
*Phase: 38-member-organization-team-workspaces*
*Completed: 2026-09-05*
