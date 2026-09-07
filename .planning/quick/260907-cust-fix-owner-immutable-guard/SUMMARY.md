---
quick_id: 260907-cust
slug: fix-owner-immutable-guard
date: 2026-09-07
type: quick
severity: production-bug
status: complete
migration: 196
subsystem: database-authorization
tags: [custody-transfer, rls, triggers, vault_projects, migration-139, migration-190]
requires:
  - migration 190 (transfer_vault_project_custody, applied 2026-09-07)
provides:
  - migration 196 (guard_owner_immutable custody exemption, authored, awaiting owner push)
affects:
  - public.vault_projects custody transfer
key-files:
  created:
    - supabase/migrations/196_owner_immutable_guard_custody_exemption.sql
    - __tests__/migration-196.test.ts
  modified:
    - .planning/ROADMAP.md
metrics:
  tasks: 3
  files_created: 2
  files_modified: 1
  tests: 24 passed / 24 total
---

# Quick 260907-cust: Custody transfer blocked by migration 139 guard — Summary

Migration 196 gives migration 139's shared `guard_owner_immutable()` trigger function the
same structural custody exemption migration 190 already grants, scoped by `TG_TABLE_NAME`
to `public.vault_projects` alone, so the sanctioned two-sided custody RPC can finally run
while `public.works` keeps its absolute, unexempted guard.

## What was wrong

`public.guard_owner_immutable()` (migration 139) is a `BEFORE UPDATE ... FOR EACH ROW`
trigger installed on **both** `public.works` and `public.vault_projects`. It refused any
`user_id` change with no exemption of any kind.

`public.transfer_vault_project_custody()` (migration 190) is a `SECURITY DEFINER` function
whose entire job is to change `vault_projects.user_id`. Migration 190 exempts
`current_user = 'postgres'` in its own guard precisely so that function can do its work
(D-PF-01, owner-resolved 2026-09-06). Migration 139 predates that and was never taught the
same exemption, so 139's guard fired and refused the very statement 190 exists to permit.
Confirmed on production 2026-09-07:

    42501: ownership is immutable; user_id cannot be changed by update

Custody transfer had therefore never worked. The pre-190 route did a raw `UPDATE`, which 139
blocked; the post-190 route calls the RPC, which 139 also blocked. The missing-function
defect fixed earlier the same day was real but was only the outer layer.

**Root cause** is a factually wrong claim in migration 139's own header, which described the
future transfer path as "a SECURITY DEFINER function owned by the table owner, which this
trigger does not fire against". `SECURITY DEFINER` changes the *effective user* used for
permission checks (and therefore what `current_user` reports); it does **not** bypass
triggers. A `BEFORE UPDATE` row trigger fires on an `UPDATE` issued inside such a function
exactly as it does anywhere else. 139's design intent was right; its stated mechanism was
not. Migration 196 supplies the mechanism 139 assumed it already had.

## Why static analysis missed it

Migration 190's text-lock suite is green, its function exists, and the route calls it
correctly. The Part A structural probe confirmed a trigger matching `%user_id_immutable%`
was present and enabled — that pattern matched **190's** trigger and never saw 139's
differently-named one. Only Part B, executing the real RPC, surfaced it. This is recorded in
migration 196's header and in its test file's opening limitation note.

## The fix

`CREATE OR REPLACE FUNCTION public.guard_owner_immutable()` only. The guard condition
becomes:

```sql
IF NEW.user_id IS DISTINCT FROM OLD.user_id
   AND NOT (TG_TABLE_NAME = 'vault_projects' AND current_user IN ('postgres')) THEN
```

Both halves of the exemption must hold:

- **`TG_TABLE_NAME = 'vault_projects'`** — the function body is shared by two triggers, so a
  blanket exemption would silently weaken `works` too. `public.works` has no sanctioned
  ownership-transfer path (no equivalent RPC, no D-29 two-sided flow, no offer/accept
  representation), so its ownership stays immutable to **everyone**, owner and superuser
  alike.
- **`current_user IN ('postgres')`** — mirrors migration 190 verbatim. True only inside a
  call to `transfer_vault_project_custody()` (that function's `SECURITY DEFINER` owner),
  never for an ordinary `authenticated`, `anon` or `service_role` statement. The rule is
  structural, not a role allow-list: "only this one function's execution context, and only
  on this one table", per D-PF-01.

**Neither trigger is dropped, recreated, altered or re-pointed** — both keep firing, on both
tables; only the shared body they call is replaced. `works` is not touched anywhere.
Migration 190's `guard_vault_projects_user_id_immutable()` is left alone and keeps guarding
`vault_projects` independently, so after this migration both triggers admit exactly the same
single execution context — `vault_projects.user_id` remains immutable to every ordinary
caller, refused by two independent guards rather than one.

The `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` is restated because
`CREATE OR REPLACE` preserves existing grants; re-issuing it is idempotent and keeps the file
self-contained if replayed against a fresh database.

## Test: the TG_TABLE_NAME scoping is text-locked, and the lock was proven to bite

`__tests__/migration-196.test.ts` (24 tests) follows migration 190's text-lock style. Per the
task's explicit requirement, it does not merely assert "an exemption exists" — it locks the
**entire guard condition verbatim**, plus four independent structural assertions:

- `TG_TABLE_NAME` is compared to exactly one table literal, `'vault_projects'`
- no `TG_TABLE_NAME IN (...)` form (a second way to widen table scope)
- no `TG_TABLE_NAME <> ...` / `!=` form (which would exempt every future table)
- the word `works` appears nowhere in the guard function body, in any form

**Mutation-verified:** removing the `TG_TABLE_NAME` conjunct (widening the exemption to
`works`) fails 3 tests. The migration was restored from backup and re-verified green
afterwards.

Negative structural guarantees also assert the file creates/drops no trigger, no policy, no
`WITH CHECK`, no `ALTER TABLE`, issues no DML or DDL against `works`, and does not redefine
migration 190's functions.

## Deviations from Plan

**1. [Rule 3 - Blocking] Test assertions rewritten to survive header line-wrapping**

- **Found during:** first test run (3 of 24 failing)
- **Issue:** Two header assertions matched against the raw file, so 79-column line wrapping
  inside comment blocks broke phrase matches. Separately,
  `expect(sql).not.toMatch(/WITH CHECK/i)` tripped on the `COMMENT ON FUNCTION` **string
  literal**, which quotes migration 139's prose verbatim including "passes WITH CHECK against
  the value they just wrote" — documentation inside a string, not a clause the migration
  executes.
- **Fix:** Added a `prose` helper (strips comment markers, collapses whitespace) for all
  header assertions, and an `executable` view with the `COMMENT` statement removed for the
  "no policy / no check clause" assertions. Both are documented inline with the reason. No
  assertion was weakened in substance — the header checks were made *stronger* (each now
  asserts an additional phrase), and the `WITH CHECK` check now runs against both
  `executable` and the guard block.
- **Files modified:** `__tests__/migration-196.test.ts`
- **Commit:** 65090435

**2. [Rule 2 - Missing critical info] ROADMAP off-by-one note extended to off-by-two**

- **Found during:** ROADMAP ledger update
- **Issue:** The prose under the LIVE LEDGER explained that migrations 191/192/193 carry a
  stale numbering range, "off by one, because plan 15 claimed 195". Claiming 196 made that
  note itself stale — a reader following it would now collide on 196 as well.
- **Fix:** Updated to "off by TWO", naming both claimants, and noted that migration 190's
  header carries the same stale range and is likewise not edited (it is already applied).
  Migrations 191, 192 and 193 were **not** edited, per the task constraint.
- **Files modified:** `.planning/ROADMAP.md`
- **Commit:** d02406be

## Constraints honoured

- **No database connection of any kind.** No `supabase db push`, `db reset`, `migration up`
  or `db query` was run. Migration 196 is HUMAN-GATED and awaits the owner's push.
- **No `npm run build`.** Verified with `npx tsc --noEmit`.
- **No `@typescript-eslint/*` eslint-disable directive** anywhere. `npx eslint` on the new
  test file exits 0.
- **No blanket staging.** All three commits staged declared files by explicit path.
- Migrations 191, 192, 193 untouched. `public.works` untouched. Neither of migration 139's
  triggers dropped or recreated.

## Verification

| Check | Result |
|---|---|
| `npx jest __tests__/migration-196.test.ts` | **24 passed / 24 total**, 1 suite passed |
| `npx jest` on 196 + 190 together | **49 passed / 49 total**, 2 suites passed (190 not regressed) |
| `npx tsc --noEmit` | **exit 0**, no output |
| `npx eslint __tests__/migration-196.test.ts` | **exit 0** |
| Mutation test (drop `TG_TABLE_NAME` conjunct) | **3 failed / 21 passed** — lock confirmed effective; file restored |

## Still open — owner action required

Migration 196 is **authored, not applied**. Custody transfer remains broken in production
until the owner pushes it. The behavioural proof — a real two-sided custody transfer
completing end to end, and a direct client `UPDATE` still being refused — is an owner-run
check after push, not this suite. A text-lock test proves what the SQL *says*; it cannot
prove the trigger fires correctly in a live Postgres, and that exact limitation is how this
bug reached production in the first place.

## Known Stubs

None.

## Threat Flags

None. This migration narrows nothing and widens exactly one execution context on one table;
`public.works` gains no new surface, and `vault_projects` custody remains guarded by two
independent triggers admitting the same single `SECURITY DEFINER` context.

## Self-Check: PASSED
