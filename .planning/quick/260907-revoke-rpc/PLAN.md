---
quick_id: 260907-rev
slug: revoke-rpc
date: 2026-09-07
type: quick
severity: would-break-production
migration: 198
files_modified:
  - supabase/migrations/198_workspace_transactional_rpcs.sql
  - __tests__/migration-198.test.ts
  - app/api/workspaces/[workspaceId]/invitations/route.ts
  - app/api/workspaces/[workspaceId]/invitations/route.test.ts
  - supabase/migrations/197_workspace_structural_integrity.sql
---

# The invitation revoke path, and a pointer comment in 197

## Item 1 — invitation revocation breaks when 197 applies (found by plan 14)

`app/api/workspaces/[workspaceId]/invitations/route.ts` still performs two
route-side consequential writes, each in its **own** transaction:

- `.update({ status: 'revoked' })` on `workspace_invitations` (~line 287)
- `.update({ status: 'removed' })` on the paired `workspace_members` seat (~line 297)

Migration 197's `assert_workspace_change_is_audited` requires an audit row with
`created_at = now()` **in the same transaction**. A PostgREST update from a route
is its own transaction, so the first write's audit row lands in a different one
and cannot match, and the second has **no audit row at all**. Both abort at
COMMIT. **Invitation revocation stops working.**

Verified independently: a repo-wide grep for route-side status writes found these
two as the only remaining consequential writers outside the RPCs. Closing this
closes the class.

**Add `public.workspace_revoke_invitation(...)` to migration 198**, stamped from
the established skeleton — lock, revalidate after the lock, mutate **both rows**,
audit **both**, one transaction. It mutates two tables, so LO-1's ranked order
applies: `workspaces`(1) → `workspace_members`(2) → `workspace_invitations`(4).
Then repoint the route handler onto it and delete both raw updates.

Every rule the other seven RPCs follow applies here:
- `SECURITY DEFINER SET search_path = ''`, revoked from `PUBLIC`/`anon`/
  `authenticated`, granted to `service_role` only.
- **`FOR NO KEY UPDATE`, never `FOR UPDATE`** (LO-2), and do not write the phrase
  `key column` in a comment above a lock unless it genuinely justifies a stronger
  mode — that phrase silently pre-authorises `FOR UPDATE` at that site.
- **Authority refusals are outcome codes, not `RAISE`** — a `RAISE` rolls back the
  audit row written moments earlier. Validation errors may raise. Both
  `auditedRefusalViolation` **and** plan 10's `raisingRefusalViolation` must cover
  the new function.
- Every audit row's `target_id` is the mutated row's own id, or 197's deferred
  triggers abort at COMMIT.
- Do not touch `vault_projects.user_id`.

Section (i) already re-created one constraint trigger under 198's own name; follow
that precedent if this function needs the same treatment, and do not edit 197's
trigger definitions.

## Item 2 — a pointer comment in migration 197

197 installs `assert_workspace_custody_transfer_change_audited` as an
**unconditional** `FOR EACH ROW` constraint trigger. That is wrong for one row
class and 198 §(i) re-scopes it with a `WHEN` clause, because three facts cannot
all hold: `workspace_audit_log.workspace_id` is NOT NULL (182),
`workspace_custody_transfers.workspace_id` is nullable (185), and the assertion
fires unconditionally. Without the re-scope, **every direct Member-to-Member
custody accept, decline and withdraw aborts at COMMIT** — the current route
included.

The re-scope is correct and stays in 198. But 197 currently says nothing about it,
so a reader of 197 alone sees a trigger that appears to fire on every custody row
and has no way to learn otherwise.

**Add a comment beside that trigger in 197** naming migration 198 §(i), the reason
(the NOT NULL / nullable mismatch), and that the two must be read together.
**Comment only — change no SQL behaviour in 197.**

197 has 162 text-lock tests. If any assertion blocks even a comment addition,
**stop and report it** rather than weakening the assertion; a pointer comment is
not worth loosening a lock that has caught real bugs.

## Constraints

- **NEVER** run `supabase db push`, `db reset`, `migration up`, or `db query`. No
  database connection. 197 and 198 are authored-but-unapplied and push together at
  plan 17's joint window.
- **The D-56 kill switch stays OFF.**
- Do not touch anything under `lib/playbook/`, `components/playbook/`,
  `app/**/playbook/` — another workstream is live in this tree, and its files may
  transiently fail `tsc` while it edits. If `tsc` reports an error in a playbook
  file, that is not yours: re-run, and report it rather than fixing it.
- Never `git add -A`. Stage by explicit path.
- Do NOT run `npm run build`; use `npx tsc --noEmit`. Never add an eslint-disable
  naming a `@typescript-eslint/*` rule. Unused imports are a lint error.
- Jest reads its argument as a REGEX — escape brackets in paths.

## Verification

- `npx jest __tests__/migration-198.test.ts` (currently 149) and
  `npx jest __tests__/migration-197.test.ts` (currently 162) — report actual numbers.
- The invitations route suite, brackets escaped.
- `npx tsc --noEmit` clean **of non-playbook errors**.
- **Prove the new negative assertions can fail** by mutation; restore byte-identical
  via `shasum -a 256`. This file has had 58+ mutation cycles across four plans.

## Done when

Invitation revocation works through one audited transaction, no route-side
consequential write remains on either table, and a reader of migration 197 alone
learns that its custody assertion is re-scoped by 198.
