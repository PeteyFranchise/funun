---
quick_id: 260906-x8i
slug: bind-p-uid-to-auth-uid-in-migration-193
date: 2026-09-07
type: quick
security: true
status: complete
files_modified:
  - supabase/migrations/193_workspace_column_allowlist_rpcs.sql
  - __tests__/migration-193.test.ts
commits:
  - 96e68838
---

# Bind `p_uid` to `auth.uid()` in the four migration 193 read functions

Closed a read-impersonation hole in the four `SECURITY DEFINER` read functions
of migration 193 by binding the caller-supplied `p_uid` parameter to the real
caller, matching the fix already shipped in migration 194.

## What changed

**`supabase/migrations/193_workspace_column_allowlist_rpcs.sql`** — added
`AND p_uid = (SELECT auth.uid())` to the `WHERE` clause of all four read
functions, immediately after the existing `workspace_project_permission(...)`
conjunct:

| Function | Table | Bind added after old line |
|---|---|---|
| `workspace_read_tracks` | `tracks` | 374 |
| `workspace_read_assets` | `vault_assets` | 409 |
| `workspace_read_documents` | `vault_documents` | 442 |
| `workspace_read_tool_outputs` | `tool_outputs` | 475 |

The line is copied verbatim from `194_workspace_catalogue_rpc.sql` line 299.
A four-line WHY comment sits above the first occurrence, explaining that the
bind exists because these functions are `SECURITY DEFINER` and carry
`GRANT EXECUTE ... TO authenticated`, so a future reader does not delete it as
redundant.

Signatures are unchanged — `p_uid` stays a parameter, as the plan required.

## Why it mattered

Each function took a caller-supplied `p_uid`, forwarded it straight into
`public.workspace_project_permission(p_project_id, p_uid, 'view_summaries')`
without ever checking it against the actual caller, and was executable by any
authenticated role. Over PostgREST that permits:

    select * from workspace_read_tracks('<project-uuid>', '<other-user-uuid>')

returning whatever that OTHER user is permitted to see. `auth.uid()` reads the
request JWT claim rather than the executing role, so it resolves to the true
caller inside a `SECURITY DEFINER` body.

Not currently exploitable: migration 193 is authored and HELD, never applied to
any database, and the D-56 kill switch is off. The fix ships so that switch can
be turned on safely.

## Test change

**`__tests__/migration-193.test.ts`** — added
`expect(block).toContain('AND p_uid = (SELECT auth.uid())')` to the existing
`it.each(READ_FUNCTIONS)` case that asserts the six-hop helper gate, so the bind
is text-locked once per function (4 assertions). `functionBlock` reads the
comment-stripped `sqlOnly` view, so the new WHY comment does not affect it.

## Verification

| Check | Result |
|---|---|
| `npx jest __tests__/migration-193.test.ts` | **60 passed**, 60 total, 1 suite passed |
| `npx tsc --noEmit` | **clean** (exit 0, no output) |
| `grep -c "AND p_uid = (SELECT auth.uid())" .../193_...sql` | **4** |

**Negative control** (applied to a scratch copy, then restored from backup):
removing one of the four binds drops the count to 3 and fails **exactly one**
test, at `__tests__/migration-193.test.ts:328` — the new assertion. This
confirms the text-lock actually bites rather than passing vacuously.

**Regression check:** `__tests__/workspace-structural-exclusions.test.ts` —
149 passed, 149 total. It is the only other suite the migration header names,
and `grep -rln "193_workspace_column_allowlist" __tests__/` confirms no other
test file reads this migration.

## Constraints honored

- No database connection of any kind. No `supabase db push`, `db reset`,
  `migration up`, or `db query`. The tests here are text-lock tests only.
- No `npm run build`; used `npx tsc --noEmit`.
- Never `git add -A`. The two files were staged by explicit path, and
  `git status --short` confirmed exactly two entries before committing.
- Migrations 191, 192, 194 and 195 untouched. The known off-by-one
  `195-196 reserved for Phase 38.0.2` comments were left alone.
- Function signatures unchanged.

## Deviations from Plan

None — the plan executed exactly as written. The negative control and the
`workspace-structural-exclusions` regression run were extra verification, not
scope changes; neither modified a tracked file.

## Known Stubs

None.

## Self-Check: PASSED

- `supabase/migrations/193_workspace_column_allowlist_rpcs.sql` — FOUND, 4 binds
- `__tests__/migration-193.test.ts` — FOUND, assertion present at line 328
- Commit `96e68838` — FOUND in `git log`
- `git diff --diff-filter=D HEAD~1 HEAD` — no deletions
- Commit touches exactly 2 files, 13 insertions, 0 deletions
