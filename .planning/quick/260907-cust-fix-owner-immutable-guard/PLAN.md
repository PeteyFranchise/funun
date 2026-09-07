---
quick_id: 260907-cust
slug: fix-owner-immutable-guard
date: 2026-09-07
type: quick
severity: production-bug
migration: 196
files_modified:
  - supabase/migrations/196_owner_immutable_guard_custody_exemption.sql
  - __tests__/migration-196.test.ts
---

# Custody transfer is blocked by migration 139's guard

## The bug, found by Part B behavioural verification 2026-09-07

`public.transfer_vault_project_custody()` — the sanctioned, SECURITY DEFINER,
two-sided custody path from migration 190 — **cannot complete**. Executing it
raises:

    42501: ownership is immutable; user_id cannot be changed by update

That message comes from `public.guard_owner_immutable()` (migration 139), a
`BEFORE UPDATE` row trigger on `public.vault_projects` that refuses ANY
`user_id` change with **no exemption of any kind**.

Migration 190's own guard, `guard_vault_projects_user_id_immutable()`, exempts
`current_user = 'postgres'` precisely so the SECURITY DEFINER function can do
its work (decision D-PF-01, owner-resolved 2026-09-06). Migration 139 predates
that and has no equivalent.

**Migration 139's comment states the assumption that is wrong:**

> "a SECURITY DEFINER function owned by the table owner, which this trigger
> does not fire against"

`SECURITY DEFINER` changes the effective user for permission checks. It does
**not** bypass triggers. A `BEFORE UPDATE` row trigger fires on an update issued
inside such a function exactly as it does anywhere else.

## Impact

Custody transfer has never worked. The pre-190 route did a raw `UPDATE`, which
139 also blocked; the current route calls the RPC, which 139 also blocks. The
missing-function defect fixed earlier today was real but was only the outer
layer.

Static analysis could not see this. Migration 190's text-lock tests pass, the
function exists, the route calls it correctly, and Part A confirmed a trigger
named `%user_id_immutable%` is present and enabled — that check matched 190's
trigger and never saw 139's differently-named one.

## The fix

`guard_owner_immutable()` is SHARED by two triggers: one on `public.works` and
one on `public.vault_projects`. A blanket exemption would weaken `works`, which
has no sanctioned transfer path and must keep its absolute guard.

So make the exemption table-specific, using `TG_TABLE_NAME`:

```sql
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     AND NOT (TG_TABLE_NAME = 'vault_projects' AND current_user IN ('postgres')) THEN
    RAISE EXCEPTION 'ownership is immutable; user_id cannot be changed by update'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
```

`CREATE OR REPLACE FUNCTION` only — do NOT drop or recreate either trigger, and
do not touch `works`.

The header must:
- state that this is a production bug found by behavioural verification, with
  the date;
- correct migration 139's claim that triggers do not fire inside SECURITY
  DEFINER functions, naming it as the root cause;
- record that `works` deliberately keeps the absolute guard;
- explain that the exemption is structural, not a role allow-list: it permits
  one function's execution context, mirroring migration 190's wording verbatim
  where it applies.

## Migration numbering

Take **196**. It was reserved for Phase 38.0.2, which has no phase directory and
no authored files. Phase 38.0.2 shifts to 197-198 and Phase 38.2 to 199-200.
Update the LIVE LEDGER table under Phase 38.0.1 in `.planning/ROADMAP.md`, which
is the authoritative record. Do NOT edit the numbering comments inside
migrations 191, 192 or 193 — they are text-locked and already documented as
off-by-one.

## Constraints

- **Never** run `supabase db push`, `db reset`, `migration up`, or `db query`.
  No database connection. This migration is HUMAN-GATED like every other.
- Do NOT run `npm run build`. `tsc --noEmit` only.
- Never `git add -A`. Stage declared files by explicit path.
- Never add an eslint-disable naming a `@typescript-eslint/*` rule — this
  project extends only `next/core-web-vitals` and it breaks `next build`.

## Verification

- `npx jest __tests__/migration-196.test.ts` — report actual numbers.
- `npx tsc --noEmit` clean.
- The text-lock test must assert the `TG_TABLE_NAME = 'vault_projects'` scoping
  explicitly, so a future edit cannot widen the exemption to `works` silently.

## Done when

The sanctioned custody RPC can move `vault_projects.user_id`, a direct client
UPDATE still cannot, and `works` ownership stays immutable to everyone.
