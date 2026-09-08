---
quick_id: 260907-rev
slug: revoke-rpc
date: 2026-09-07
type: quick
status: complete
severity: would-break-production
migration: 198
commits: [0d5490db, 897eadde]
---

# The invitation revoke RPC, and a pointer comment in 197

Written by the orchestrator: the harness refuses subagent writes of report files,
so the executor returned its summary as text. Its full report is in the task
output; this is the durable record.

## Item 1 — `public.workspace_revoke_invitation` (migration 198 §(j))

**The defect.** The DELETE handler issued three PostgREST calls — the invitation
status write, the paired seat write, and one `logWorkspaceAction` — which is three
transactions. Migration 197's `assert_workspace_change_is_audited` demands, at
COMMIT, an audit row whose `created_at` equals `now()` (one value per transaction)
and whose `target_id` is the mutated row's own id. So the audit row landed in the
*third* transaction and could never match the first, and the seat write had no
audit row at all. **Once 197 applies, invitation revocation stops working.**

**Class closed.** Verified after merge: no `.update()` or `.delete()` against
`workspace_invitations` or `workspace_members` remains anywhere in `app/` or
`lib/`. The only route-side writes left on those tables are the two INSERTs in the
issuance handler, which the deferred assertions (all `AFTER UPDATE OF …`) do not
cover.

**Three deviations, each documented at the point of deviation in the SQL:**

1. **An unlocked pre-read of the invitation, then a drift re-check.** Paired seats
   join to the invitation by `(workspace_id, invited_email, role)` — there is no FK
   from a seat to its invitation — so the address and role must be known before
   rank 2 can be named. Locking the invitation first would take rank 4 before rank
   2 and invert LO-1. §(f) set this precedent. The pre-read proves nothing: it is
   re-compared against the locked row, and a drift returns `stale` having mutated
   nothing.

2. **The seat sweep is a loop over one-row statements, not one multi-row UPDATE.**
   The plan said "mutate both rows", but issuance inserts a pending seat per
   invitation with no dedupe and `idx_workspace_members_unique_user` is PARTIAL, so
   it does not constrain the NULL-`user_id` rows an invitation to an address with
   no account produces. Several paired seats can exist; implementing "both rows"
   literally would have silently dropped seats the old code removed.

3. **An owner seat is never touched from this path.** 197's
   `guard_workspace_owner_role_change` returns at its `postgres` exemption *inside*
   a definer function and would therefore **admit** the write, so the exclusion has
   to be explicit. Same reasoning §(f) uses to refuse an owner-role invitation
   rather than trusting that guard.

## Item 2 — the migration 197 pointer comment: LANDED, not blocked

A comment above `assert_workspace_custody_transfer_change_audited` now names 198
§(i) as the re-scope, states the three-facts contradiction forcing it (182's NOT
NULL audit `workspace_id`, 185's nullable transfer `workspace_id`, the
unconditional assertion), and states the consequence without it: every direct
Member-to-Member custody accept, decline and withdraw aborts at COMMIT.

No text-lock blocked it and none was weakened. 162 tests before, 162 after.

## Both logged findings CLOSED by the orchestrator

The executor logged two gaps rather than fixing them — correct, both were outside
its declared scope. Both are now closed, and **both were mutation-proved**:

1. **`raisingRefusalViolation` now covers §(c), §(d) and §(e).** It previously
   covered only §(f), (g), (h) and (j). Those three predate the helper plan 10
   added after finding by mutation that `auditedRefusalViolation` says nothing
   about a `RAISE` between an audit INSERT and its return — which rolls that row
   back, leaving the refusal unaudited while still passing the audit check.
   Nothing was broken (the executor probed all eight refusal codes and every one
   returned null), but the assertion was missing. **Mutation check:** injecting a
   `RAISE` before §(c)'s `forbidden_owner_row` return now fails 1 test.

2. **The 197 pointer comment is now text-locked.** It was unlocked, so a future
   edit could delete it silently — the exact failure item 2 exists to prevent.
   **Mutation check:** removing the phrase fails 1 test.

Both migration files confirmed byte-identical by `shasum -a 256` after every
mutation.

## Verification

| Check | Before | After |
|---|---|---|
| `__tests__/migration-198.test.ts` | 149 | **166** |
| `__tests__/migration-197.test.ts` | 162 | **163** |
| invitations route suite | 5 | **15** |
| full suite | — | **528 suites / 6250 tests** |

25 mutations by the executor, all restored byte-identical, plus 2 by the
orchestrator. One executor mutation initially survived and that was a **finding,
not a nuisance** — its anchor was not unique and the replacement had landed in
§(d), which exposed gap 1 above.

No database connection was opened. Both migrations remain authored-and-unapplied
and push together at plan 17's window.
