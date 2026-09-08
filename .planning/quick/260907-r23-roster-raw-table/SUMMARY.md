---
quick_id: 260907-r23
slug: r23-roster-raw-table
date: 2026-09-07
type: quick
status: complete
migration: 197
files_modified:
  - supabase/migrations/197_workspace_structural_integrity.sql
  - __tests__/migration-197.test.ts
commits:
  - b99e8806
tests_before: 159
tests_after: 162
---

# Close the R-23 blocked-state leak on the raw roster table

Workspace-side access to the raw `workspace_roster_relationships` table is
removed. `proposed`, `refused` and `blocked` rows are no longer readable by any
workspace role on the raw table; the Member keeps the true state; and the
owner/admin proposal-management surface is served by
`public.workspace_roster_page`, which collapses `blocked` to `refused`.

## The R-12 check — the finding that would have blocked this

**`public.workspace_roster_page` DOES return `proposed` rows to an owner or an
admin. R-12 is intact. Proceeding was correct.**

Read from the function body of
`supabase/migrations/197_workspace_structural_integrity.sql` (post-change lines
1516-1521, the `WHERE` clause inside the
`CREATE OR REPLACE FUNCTION public.workspace_roster_page(` block):

```sql
      r.member_user_id = p_uid
      OR public.is_workspace_owner(r.workspace_id, p_uid)
      OR public.workspace_member_role(r.workspace_id, p_uid) = 'admin'
      OR (
        r.state IN ('accepted', 'ended')
        AND public.workspace_member_role(r.workspace_id, p_uid) IS NOT NULL
      )
```

The owner branch and the admin branch are **not** gated on `state` — only the
fourth branch is. So an owner or an admin reaching this function receives rows
in every state, `proposed` included. The R-12 proposal-management surface
survives the policy change intact, and survives it *with* the R-23 redaction
applied, because the `CASE WHEN r.state = 'blocked' THEN 'refused'` expression
sits on this same read path.

This is now pinned by a new test rather than left as an inspection result —
mutation M3 below proves it fails when the function's owner branch is removed.

## What changed

### supabase/migrations/197_workspace_structural_integrity.sql

**The policy — branches 2 and 3 deleted.** `workspace_roster_relationships_select`
now reads:

```sql
    member_user_id = (SELECT auth.uid())
    OR (
      state IN ('accepted', 'ended')
      AND (SELECT public.workspace_member_role(workspace_id, auth.uid())) IS NOT NULL
    )
```

**The prose — five corrections, so the mechanism is described honestly.** The
file previously presented the `blocked`-to-`refused` collapse as the R-23
mechanism, with the raw-table exposure recorded as an open "residual". After
this change that framing is not merely incomplete, it is actively misleading: a
future reader could conclude the collapse carries T-38-04-05 on its own and
"restore" a policy branch without realising it reopens the leak in full.

1. **Top-header R-23 bullet** — now states "TWO MECHANISMS, NOT ONE" and that
   THE COLLAPSE ALONE NEVER CARRIED THE GUARANTEE, with the reason (RLS is
   row-level; Postgres cannot redact a column through a policy).
2. **Section (i) Part 1** — "FOUR BRANCHES" rewritten to "TWO BRANCHES", plus a
   new subsection recording why the owner and admin branches are gone,
   including the rejected narrower fix (dropping only `blocked` makes absence
   itself the signal) and the R-02 / migration-193 precedent this follows.
3. **Section (i) Part 2 residual paragraph** — the open owner question replaced
   by the decision and its consequence, and by an explicit warning that the
   `CASE` expression never carried the guarantee alone.
4. **The "SAME VISIBILITY BRANCHES AS THE POLICY ABOVE" paragraph** — was a true
   statement that this change makes false. The function is now deliberately
   wider than the policy (four branches vs two), and that gap is the design.
   Rewritten to say so, with a two-way "do not harmonise" warning: narrowing the
   function breaks R-12, widening the policy reopens R-23.
5. **`COMMENT ON FUNCTION public.workspace_roster_page`** — the shipped schema
   comment asserted the WHERE clause "repeats the four visibility branches of
   workspace_roster_relationships_select exactly". That ships into the live
   database as documentation and is now false; corrected to state the deliberate
   widening and why it is safe.

A short amendment note was added under the file's "THE FILE IS NOW CLOSED"
header, recording that this quick task amended section (i) **in place** (no
section added, removed or reordered), so the closure claim stays accurate.

## Deviations from plan

**[Rule 2 — missing critical documentation of a now-mandatory dependency]**
The plan listed the prose targets. I added a sixth consequence the plan did not
name and that is load-bearing for the push:

> `app/api/workspaces/[workspaceId]/roster/route.ts` (line 225) still reads the
> raw table through the RLS-scoped client. Once this policy applies, that GET
> returns **no `proposed` row to an owner** — the proposal-management surface is
> empty until plan 15 repoints it at `workspace_roster_page`.

Plan 09's prose described that repoint as making the surface "collapsed either
way", i.e. cosmetic. It is now **required**. The sequencing already works —
migration 197 pushes at plan 17's joint window together with the TypeScript from
plans 12-16, and plan 15 is inside that set — so there is no window where the
narrowed policy is live against an un-repointed route. But that ordering was
previously incidental and is now a hard constraint, so it is recorded in the
migration prose ("DO NOT APPLY THIS MIGRATION AHEAD OF THAT REPOINT") and locked
by a prose assertion.

Verified no other consumer is affected: every other RLS-scoped read of this
table (`app/api/roster/relationships/route.ts`,
`app/api/settings/permissions/route.ts`,
`app/(artist)/settings/permissions/page.tsx`) filters to
`member_user_id = <caller>` and is therefore served by surviving branch 1. All
remaining call sites use `createServiceClient()`, which is `service_role` and
bypasses RLS entirely.

No Rule 4 (architectural) situations arose. No blocking findings.

## Test suite: 159 to 162

Four assertions **corrected in place** (each named, none deleted):

| # | Test | Correction |
|---|------|-----------|
| 1 | `carries all four visibility branches` to `carries exactly TWO visibility branches` | The branch count is still asserted, just a different count. Strengthened with a `/ OR /g` length check so a third branch cannot be added silently. |
| 2 | `is byte-locked as a whole` | Expected string updated to the two-branch policy. Still the whole statement character-for-character — relaxed in no way. |
| 3 | `wraps every helper call in the recreated policy as a scalar subselect` | The `is_workspace_owner` sample-not-empty line was removed because the policy no longer calls that helper at all. The `workspace_member_role` sample line remains, so the wrap rule is still tested against real content. The removed fact is now held by a stronger negative assertion (new test 5). |
| 4 | `states both consequences...` to `states every consequence...` | Extended with three prose assertions pinning the honest-mechanism claims. |

Three assertions **added**:

5. `has NO owner and NO admin branch — the R-23 raw-table closure itself` — the
   assertion this change exists for. Asserts absence of `is_workspace_owner` and
   `'admin'`, that exactly one `workspace_member_role` call survives (so an owner
   branch cannot hide inside it), and that none of `proposed` / `refused` /
   `blocked` is nameable in the policy.
6. `leaves R-12 to workspace_roster_page, which still returns proposed` — pins
   the pair, so the closure and the surface that makes it survivable cannot rot
   in halves.
7. `records that this reader is DELIBERATELY WIDER than the policy, and why` —
   pins the corrected `COMMENT ON FUNCTION`, and explicitly forbids the stale
   `repeats the four visibility branches` sentence from returning.

## Mutation testing — 5 cycles, each red on the intended assertion

| # | Mutation | Result |
|---|----------|--------|
| M1 | Restore the owner branch to the policy | 3 failed / 159 passed — incl. new test 5 |
| M2 | Restore the admin branch to the policy | 3 failed / 159 passed — incl. new test 5 |
| M3 | Remove the owner branch from `workspace_roster_page` | 2 failed / 160 passed — incl. new test 6, the R-12 guard |
| M4 | Reinstate the stale `repeats the four visibility branches` COMMENT | 1 failed / 161 passed — new test 7 |
| M5 | Soften the `THE COLLAPSE ALONE NEVER CARRIED THE GUARANTEE` prose | 1 failed / 161 passed — corrected test 4 |

After restoring, both files are byte-identical to the pre-mutation state:

```
f98268f0060b6b96f825e13fafb8bd9d040549769b898d344470d39c3efb73c3  supabase/migrations/197_workspace_structural_integrity.sql
bf52d0c07a460207e3c031fa22ba677036a19b31470ceb984729b67165692d31  __tests__/migration-197.test.ts
```

## Verification

- `npx jest __tests__/migration-197.test.ts` — **162 passed / 162** (was 159/159)
- `npx tsc --noEmit` — clean, exit 0
- `git status --short` — only the two intended files staged; no `git add -A` used
- Migration 198, `__tests__/migration-198.test.ts`, and everything under
  `lib/playbook/`, `components/playbook/`, `app/**/playbook/` untouched
- **No database connection of any kind was opened.** No `supabase db push`,
  `db reset`, `migration up` or `db query` was run, including against a scratch
  database. Migration 197 remains authored-but-unapplied.

## Known stubs

None.

## Threat flags

None. The change removes read surface; it adds none.

## Self-Check: PASSED

- `supabase/migrations/197_workspace_structural_integrity.sql` — FOUND (modified)
- `__tests__/migration-197.test.ts` — FOUND (modified)
- `.planning/quick/260907-r23-roster-raw-table/SUMMARY.md` — FOUND (this file)
- Commit `b99e8806` — FOUND in git log
