# Pass 3 — factual-claim verification (2026-10-04)

The third adversarial pass, over every `file:line` claim in the Phase 50 plan and its three
deliberations. **Read this before building any Phase 50 slice** — several citations the plan
rests on are stale, and two comments in shipped code are false.

---

## The load-bearing fact HOLDS

**Incomplete splits structurally BLOCK admission** — they do not merely badge it. Verified end to
end: `lib/sync-library/readiness.ts:47-54` defines the split-sheet item, `SYNC_RIGHTS_KEYS`
(`:318-323`) includes it, `isSyncRightsClear` requires every applicable rights item complete, and
`app/api/sync-library/admin/[listingId]/route.ts:266-301` returns **HTTP 409 before** the
admitted-status update at `:304-313`. A route test leaving split sheets pending expects 409 and
passes.

So the owner's §5 decision — accepted songs stay visible and pitchable, routed to contact — is
**currently impossible**, not merely unimplemented. The re-plan's severity assessment is correct.

**Related distinction, load-bearing:** `lib/sync-library/gate.ts:41-54` produces the *contact*
rights badge, but **the badge is not the admission decision**. It must never be cited as evidence
that incomplete rights can pass admission.

---

## TWO FALSE COMMENTS IN SHIPPED CODE

Both are `label-integrity-funun` instances. The code is correct; the comments are not. Queued as
a separate fix.

### `lib/catalogue/ai-entries.ts:273-278`

Claims receipt strings are **stored on the `ai_entries` row**. False:
`app/api/works/[workId]/ai-entries/route.ts:183-203` persists **only `receipt.citation`**; the
full receipt including the Crate verdict is returned to the caller (`:214-219`) and never
written; `135_works_core.sql:273-290` defines the table with **no verdict column**.

A reader concludes a prior eligibility verdict is recoverable from storage. It is not — every
consumer must recompute it. Phase 50's enforcement work depends on knowing that.

### `lib/sync-library/gate.ts:1-16`

Claims `rightsClear` comes from `computeStage3().canContinue`. False: the admin route derives it
through `isSyncRightsClear(syncItems)` and carries an explicit comment at `:280-282` saying this
is **deliberately not** `canContinue`.

The stale comment points maintainers at the wrong authority and would reintroduce the
sample-clearance behaviour the route excludes on purpose.

---

## A WRONG AUTHORISATION MODEL in the work→track deliberation

`2026-10-04-work-to-track-eligibility-resolution.md` describes migration 172's trigger
(`:12,27`) as an audit that **only logs** a change. False: `172_audit_integrity_hardening.sql:6-28`
defines `guard_work_graduation_owner_only`, which **raises an exception** on unauthorised
graduation changes.

Misclassifying enforcement as passive logging produces an incorrect authorisation model — and
that document informed migration 230, which shipped tonight. **Migration 230 and 231 are
themselves verified and correct**; the reasoning record behind them has a hole worth correcting
before anyone builds on it.

---

## STALE CITATIONS — correct before building

Most of these went stale *because of merges made the same day*. Not planner error; the ground
moved underneath them.

| Plan claims | Actually true on main |
|---|---|
| Slice 1 modifies migration **098**'s signup trigger | **214 is the live definition** (`214_verified_invite_claim_hardening.sql:43-160`); 105 and 133 are lineage. Building from 098 discards provision-intent, handle and token-bound invite-claim behaviour on a `SECURITY DEFINER` function |
| Migration 230 unapplied/unmerged; no `tracks.work_id`; no resolver | 230 **landed**; the column, index, backfill and replaced graduation function all exist; `lib/catalogue/track-work-link.ts` exists. **231** is the pending human-applied migration |
| Migration ceiling is 227 | Main contains **230 and 231** |
| Passport chain is read **only forward** | Migration 230 reads it **in reverse** (`:123-151`) and persists the result |
| Selects accepts unadmitted tracks (`persistence.ts:196-235`) | **Closed** — `:194-213` checks for an admitted `sync_listings` row; `:244-264` refuses insert and reactivation |
| A&R authorisation is unmerged future work | **Merged** — the admin route authorises leadership and A&R |
| `LEGAL_TRANSITIONS` already models the two-stage review **exactly** | It contains one staff gate. It has **no** accepted-for-review / listening / passed states. Treating it as an exact model collapses separate consent, review and licensing decisions into one machine |

---

## Confirmed as stated

`/admin/sync-library` never queries `ai_entries` — so admission **cannot** enforce AI-provenance
eligibility today, and `resolveTrackAiProvenance` has no production caller. Crate eligibility is
not persisted. Nothing persists arrival origin at signup. No outbound SMS exists anywhere.
`vault_projects.is_public`'s policy has no `TO` clause and so binds ordinary staff sessions
(service-role bypasses RLS, so "every role" would overstate it). Migration 135's
"deliberately absent" comment does not refuse a work→track link.

---

## Honestly unverifiable from the repository

- **"`tracks` has carried an ambient grant since migration 001."** Migration 001 contains no
  GRANT/REVOKE for `tracks`, and the grant demonstrably existed when 230 was checked — but the
  exact chronology needs privilege history, not a checkout. **The conclusion that 230's REVOKE
  protected nothing is unaffected.**
- Production application state of 230/231 — repository evidence is strong, but it is not a query
  of the production migration table.
- Any claim about the proportion of legacy versus graduated tracks.
