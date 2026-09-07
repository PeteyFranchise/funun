---
quick_id: 260906-x8i
slug: bind-p-uid-to-auth-uid-in-migration-193
date: 2026-09-07
type: quick
security: true
files_modified:
  - supabase/migrations/193_workspace_column_allowlist_rpcs.sql
  - __tests__/migration-193.test.ts
---

# Bind `p_uid` to `auth.uid()` in migration 193's four read functions

## The defect

`supabase/migrations/193_workspace_column_allowlist_rpcs.sql` defines four
`SECURITY DEFINER` functions — `workspace_read_tracks`, `workspace_read_assets`,
`workspace_read_documents`, `workspace_read_tool_outputs`. Each:

- takes a caller-supplied `p_uid UUID` parameter,
- forwards it straight into `public.workspace_project_permission(p_project_id, p_uid, ...)`,
- has `GRANT EXECUTE ... TO authenticated`,
- and **never binds `p_uid` to the actual caller**.

Every `auth.uid()` occurrence elsewhere in that file is inside an RLS *policy*
body — a different section, unrelated to these function bodies.

So any authenticated caller can invoke, over PostgREST:

    select * from workspace_read_tracks('<project-uuid>', '<some-other-users-uuid>')

and receive whatever that other user is permitted to see. This is read
impersonation, and it defeats the purpose of the six-hop helper it calls.

Found by plan 38.0.1-11, which closed the identical issue on its own function
(migration 194, line 299) but correctly did not edit plan 10's file.

## Not currently exploitable

Migration 193 is authored and HELD — it has never been applied to any database.
The D-56 kill switch is also off, which makes `workspace_project_permission`
return FALSE immediately. Neither is a reason to ship it: this phase exists to
make it safe to turn that switch on, and the whole 190-195 set pushes together.

## The change

**1. `supabase/migrations/193_workspace_column_allowlist_rpcs.sql`** — add one
line inside each of the four existing `WHERE` clauses, immediately after the
`public.workspace_project_permission(...)` conjunct (lines ~374, ~409, ~442,
~475). Copy migration 194 line 299 verbatim:

    AND p_uid = (SELECT auth.uid())

`auth.uid()` resolves to the real caller inside a `SECURITY DEFINER` body — it
reads the request's JWT claim, not the executing role — so this is correct here.
Wrap it as a scalar subselect, matching every other helper call in this family.

Do NOT change the signatures. `p_uid` stays a parameter: the functions are
called both directly and from contexts that pass it explicitly, and removing it
would be a wider change than this fix needs.

Add a short comment above the first one explaining WHY the bind exists, so a
future edit does not remove it as redundant.

**2. `__tests__/migration-193.test.ts`** — in the existing per-function case
(the one asserting each function gates every row on the six-hop helper), add:

    expect(block).toContain('AND p_uid = (SELECT auth.uid())')

so the bind is text-locked for all four functions the same way the rest of the
file is.

## Constraints

- **Never** run `supabase db push`, `db reset`, `migration up`, or `db query`.
  No database connection of any kind. Migrations here are human-gated; 190-195
  push together at plan 38.0.1-11's checkpoint.
- Do NOT run `npm run build` (clobbers `.next` under a live dev server). Use
  `npx tsc --noEmit`.
- Never `git add -A` — the user runs parallel sessions. Stage the two files by
  explicit path.
- Touch no other file. In particular do not touch migrations 191, 192, 194 or
  195, and do not "fix" the off-by-one reservation comments in 191-193.

## Verification

- `npx jest __tests__/migration-193.test.ts` — all pass, and the four new
  assertions are among them.
- `npx tsc --noEmit` — clean.
- `grep -c "AND p_uid = (SELECT auth.uid())" supabase/migrations/193_workspace_column_allowlist_rpcs.sql`
  returns 4.

## Done when

All four read functions refuse to act on any uid but the caller's own, and the
test suite would fail if a future edit removed the bind.
