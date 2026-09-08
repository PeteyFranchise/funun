---
quick_id: 260907-r23
slug: r23-roster-raw-table
date: 2026-09-07
type: quick
migration: 197
files_modified:
  - supabase/migrations/197_workspace_structural_integrity.sql
  - __tests__/migration-197.test.ts
---

# Close the R-23 blocked-state leak on the raw roster table

## The decision (owner, 2026-09-07)

Migration 197 collapses `blocked` → `refused` in `workspace_roster_page`, but
`workspace_roster_relationships_select` still admits owners and admins to the
**raw row**, where `state = 'blocked'` is plainly readable. RLS cannot redact a
single column, so an owner querying PostgREST with their own JWT defeats
T-38-04-05 — "a workspace must never enumerate who blocked it."

Plan 09 proposed excluding `blocked` from those branches. **The owner chose the
stronger option instead**, and for a reason worth recording: if `blocked` rows
vanish while `refused` rows remain visible, *absence itself* becomes the signal.
An owner who proposed to someone and now sees no row learns the same fact. That
narrows the channel without closing it.

**Decision: remove workspace-side access to the raw table entirely.** All
workspace-facing roster reads go through `public.workspace_roster_page`, which
already collapses the state.

This is exactly the move 38.0.1 made for `tracks`, `vault_assets`,
`vault_documents` and `tool_outputs` (R-02 / migration 193): remove the branch,
provide a function. Same shape, same reasoning, and the function already exists.

## The change

In `197_workspace_structural_integrity.sql`, in
`CREATE POLICY "workspace_roster_relationships_select"`, **delete branches 2 and
3** — the bare `is_workspace_owner(...)` and `workspace_member_role(...) = 'admin'`
disjuncts.

What remains:

```sql
    member_user_id = (SELECT auth.uid())          -- the Member's own view: TRUTH
    OR (
      state IN ('accepted', 'ended')              -- workspace raw view: no
      AND (SELECT public.workspace_member_role(workspace_id, auth.uid())) IS NOT NULL
    )
```

Consequences to verify and document, not to work around:

- The Member keeps the true state, including `blocked`. Unchanged.
- The workspace can still reach `accepted` and `ended` rows raw. Those carry no
  block signal.
- `proposed`, `refused` and `blocked` rows are no longer raw-readable by the
  workspace **at all** — so absence is uniform across all three and tells nobody
  anything.
- **R-12 interaction — check this explicitly.** R-12 requires a `proposed`
  relationship to be visible to the named Member *and* the owner/admin
  proposal-management surface. Removing branches 2 and 3 takes `proposed` out of
  the raw view. **Confirm `workspace_roster_page` returns `proposed` rows to an
  owner or admin.** If it does not, R-12 is broken by this change and you must
  say so loudly rather than proceed — that is a blocking finding, not a detail.

Update the header prose so it states the mechanism honestly: the collapse is not
the only defence; the raw path is closed.

## Constraints

- **NEVER** run `supabase db push`, `db reset`, `migration up`, or `db query`. No
  database connection of any kind. Migration 197 is authored-but-unapplied and is
  pushed at plan 17's joint window with 198.
- Do NOT touch migration 198 or `__tests__/migration-198.test.ts`.
- Do NOT touch anything under `lib/playbook/`, `components/playbook/`,
  `app/**/playbook/` — another workstream is live in this tree.
- Expect unrelated modified/untracked files in `git status`. **Never `git add -A`.**
- Do NOT run `npm run build`; use `npx tsc --noEmit`. Never add an eslint-disable
  naming a `@typescript-eslint/*` rule.

## Verification

- `npx jest __tests__/migration-197.test.ts` — report actual numbers. The suite is
  at 159 tests; existing assertions about the policy will need updating, and each
  update must be a deliberate correction you name in the SUMMARY, not a deletion.
- `npx tsc --noEmit` clean.
- **Prove the new policy shape can fail:** restore either deleted branch, watch the
  new assertion go red, remove it again, confirm the file is byte-identical by
  `shasum -a 256`. 39 mutation cycles were run on this file already; hold that bar.

## Done when

No workspace-side role can read a `blocked`, `refused` or `proposed` roster row
from the raw table; the Member still sees the truth; and `workspace_roster_page`
is confirmed to serve the owner/admin proposal-management surface R-12 requires.
