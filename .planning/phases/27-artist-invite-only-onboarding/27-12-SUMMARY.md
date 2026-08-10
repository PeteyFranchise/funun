# 27-12 — Cutover corrective: non-artist provisioning exemption (migration 104)

**Status:** built + hardened through THREE Codex review rounds (round 1
DO-NOT-SHIP → 4 HIGH; round 2 SHIP-WITH-FIXES → MEDIUM + LOWs; round 3
SHIP-WITH-FIXES → 1 HIGH in the curator-claim compensation). Unit-tested (170
suites / 2017 tests) + typechecked (0 errors). NOT yet pushed. Awaiting Codex
re-confirm → app deploy → re-cutover with a live smoke.

## What went wrong at the 27-11 cutover

Migrations 097–103 were pushed to production. Smoke lanes (a) uninvited
artist rejected, (b) invited artist admitted, (c) existing account signs in
— all PASS. Lane **(d) non-artist (buyer) creation — FAIL.**

**Root cause:** this Supabase instance applies `app_metadata` *after* the
`auth.users` INSERT, so `handle_new_user()` cannot read `app_metadata.role`
/ `staff_role` at trigger time. Every non-artist admin-provisioned account
(buyer/staff/industry/curator) has always fallen through to the DEFAULT
(artist) branch — the `create*Account` helpers document this and reconcile
the row *after* `createUser()` returns. Before the gate that was benign. The
098/099 gate turned the fall-through into `RAISE 'not_invited'`, aborting
`createUser()` for every non-artist lane. Static review + Jest could not
catch this — it is only observable against the real GoTrue INSERT timing.
The 098/099 "staff_role branch" (Fix-1) had the same blind spot: it also
relied on `app_metadata` being visible at INSERT, so it never fired either.

**Also found:** `/api/signup/check-invite` returns 404 in prod — the Phase
27 application code was never deployed (commits are local-only), so the DB
gate went live without its UX. This is a sequencing error (DB before app).

**Immediate action taken:** the gate was rolled back via docs/BREAK-GLASS.md
Layer 3 (restore `handle_new_user()` to migration 086's pre-gate body).
Verified: `SELECT position('not_invited' in prosrc) … = 0`. Production is
back to its known-good pre-Phase-27 state; all lanes create normally.

## The fix (migration 104 + helpers)

The gate now exempts an admin-provisioned account only on TWO independent,
un-forgeable signals — **both required, every gap fails CLOSED:**

1. **A single-use, expiring provision-intent.** `account_provision_intents` is
   a NEW service-role-only table (zero RLS policies + `REVOKE ALL`). Each
   `create*Account` helper (`lib/accounts/provisionIntent.ts`,
   `createUserWithProvisionIntent`) generates a random UUID, inserts the row
   under that id BEFORE `createUser()`, and passes the id back through
   `user_metadata.provision_intent` (user_metadata IS visible at INSERT). The
   trigger consumes EXACTLY that row — by id, same email, unexpired (15-min
   TTL) — then it's gone; cleanup is by id (never email). anon/authenticated
   can neither read a valid id nor write a row, and a stale row is inert
   (unguessable id + expiry). This makes the intent **attempt-bound**, not a
   reusable email flag (HIGH-1).
2. **`email_confirmed_at IS NOT NULL`** at INSERT — every helper passes
   `email_confirm:true`, so admin accounts arrive confirmed. A self-serve
   `signUp`/OTP is always unconfirmed at INSERT and cannot pre-confirm. Kept as
   an independent second factor (defense in depth).

Why both / every gap fails CLOSED:
- No / wrong / expired intent id → no match → invite gate runs.
- Email confirmation disabled someday → self-serve becomes confirmed, but
  still has no valid intent id → gate runs.
- A self-serve signup racing the brief intent window → it is unconfirmed AND
  doesn't know the id, so the trigger's `DELETE` (gated behind
  `email_confirmed_at`, matched by id) neither exempts it nor burns the admin's
  pending intent.

`claim_collaborators()` runs ONLY for a genuine self-serve artist (guarded by
`NOT v_admin_provisioned`) — an exempted non-artist account must never claim
artist collaborator rows (HIGH-2). The curator/buyer/staff/industry
`app_metadata` branches are kept byte-for-byte as defense-in-depth. Default
provisioning (user_profiles + subscriptions) runs for both admitted paths;
buyer/staff delete it, industry updates it, exactly as their helpers already do.

## Files

- `supabase/migrations/104_artist_gate_provision_intent.sql` — table + gate
  redefinition (supersedes 098/099's function body; those stay as history).
- `lib/accounts/provisionIntent.ts` — `createUserWithProvisionIntent` wrapper.
- `lib/buyers/createBuyerAccount.ts`, `lib/staff/createStaffAccount.ts`,
  `lib/industry/createIndustryMember.ts` (`provisionIndustryAccount`, which
  also serves the curator-claim path) — call the wrapper.
- Tests: `__tests__/migration-104-gate.test.ts` (structural + executable
  behavioral model incl. fail-closed/race-safe cases),
  `lib/accounts/provisionIntent.test.ts`; updated mocks in
  `__tests__/buyer-account-reconcile.test.ts`,
  `lib/staff/createStaffAccount.test.ts`,
  `__tests__/industry-member-capability.test.ts`,
  `__tests__/adversarial-review-fixes.test.ts`.
- `docs/BREAK-GLASS.md` — corrected to reflect the real exemption mechanism
  (intent + confirmed, not the app_metadata branches); Layer 2 raw-SQL path
  updated; Layer 3 restore now points to a NEW forward migration (HIGH-4).
- `app/api/curators/claim/[token]/route.ts` — comment corrected (LOW-1).

Verification: 170 suites / 2014 tests pass; `tsc --noEmit` = 0 errors;
`git diff --check` clean.

## Codex round 1 — remediation (DO-NOT-SHIP → resolved)

Independent review found 0 blockers, 4 HIGH, 3 MEDIUM, 1 LOW. Dispositions:

- **HIGH-1 (reusable intents)** — FIXED. Intent is now attempt-bound (its
  random UUID id is the single-use token, passed via user_metadata), expiring
  (15-min TTL), consumed by exact id, and cleaned up by id with the result
  inspected (no silent swallow of a failed cleanup).
- **HIGH-2 (non-artists claim collaborator rows)** — FIXED.
  `claim_collaborators()` is guarded by `NOT v_admin_provisioned`; exempted
  lanes never claim. Test asserts the guard + the behavioral model.
- **HIGH-3 (ghost staff on failed compensation)** — FIXED. Staff compensation
  clears `staff_role` FIRST, then deletes, CHECKING every result; a cleanup
  that didn't land throws a distinct "manual intervention — privileged user may
  remain" error. Buyer/industry compensation made checked too.
- **HIGH-4 (Layer 3 can't restore 104)** — FIXED. Runbook now says to restore
  via a NEW forward migration (or raw paste of 104's body), never to reapply
  098/099.
- **MEDIUM-1 (email not normalized to createUser)** — FIXED. Wrapper passes the
  normalized email to `createUser`; test asserts it.
- **MEDIUM-3 (industry link failure orphans account)** — FIXED.
  `createIndustryMember` compensates (checked delete) on `generateLink` failure.
- **LOW-1 (stale comments)** — FIXED in `createStaffAccount.ts` +
  curator-claim route.
- **MEDIUM-2 (tests are simulations, not real Postgres/GoTrue)** — ACCEPTED,
  not fixed in this pass. Codex scoped it MEDIUM (not a ship-gate). The bug
  class is precisely what a static test can't catch, so the **mandatory live
  cutover smoke** (below) is the acceptance gate for it. A local-Supabase
  integration harness is recommended as a durable follow-up (own task).

## Codex round 2 — re-review (SHIP-WITH-FIXES → resolved)

Re-review confirmed all 4 round-1 HIGH as CONFIRMED-FIXED; 0 blockers, 0 new
HIGH. New findings, all resolved:

- **MEDIUM (new) — curator-claim CAS orphan.** If
  `app/api/curators/claim/[token]/route.ts` created a NEW industry account and
  the subsequent curator claim UPDATE then failed, the account was left alive
  (recoverable into unclaimed industry access). FIXED: on the new-account path a
  hard `claimError` now compensates with a checked `deleteUser`. A zero-row
  result is deliberately NOT deleted — that means a concurrent claim already
  linked the SAME account via the Duplicate→fallback path (email is unique, so a
  racing request reuses the account), so deleting would destroy a live account.
  Tests cover both (error → delete; zero-rows → no delete).
- **LOW (new) — cleanup "inspected" claim was false.** The wrapper's finally
  said the cleanup result was inspected but `void`'d it. FIXED: comment now
  honestly describes best-effort cleanup of an inert (id-bound + expiring) row
  and why it must not fail an already-created account; added a resolved-`{error}`
  test alongside the thrown-error one.
- **LOW (new) — subordinate delete results not folded into cleanupFailed.** Left
  best-effort ON PURPOSE (comments corrected to say so): funun_staff /
  buyer_members rows are non-authoritative and cascade on the auth deleteUser
  (ON DELETE CASCADE), so folding them into the alarm would false-fire on the
  common success path. cleanupFailed tracks only the authoritative role-clear +
  auth-delete.
- **LOW (new) — stale top comments** in createBuyerAccount.ts /
  createIndustryMember.ts. FIXED.

MEDIUM-2 (integration harness) unchanged: accepted, covered by the mandatory
live smoke; local-Supabase harness remains a follow-up.

## Codex round 3 — final confirm (SHIP-WITH-FIXES → resolved)

Confirmed items 2/3/4 from round 2. Item 1 (curator-claim compensation) was
NOT-CONFIRMED — a real **HIGH**: my round-2 "delete the account on a hard
claimError" was not concurrency-safe. A hard transport error does NOT prove the
account is orphaned — the UPDATE may have committed (response lost) or a
concurrent fallback may have linked the SAME account — so deleting could destroy
a live account.

FIXED (`app/api/curators/claim/[token]/route.ts`): the new-account path NEVER
deletes now. On an ambiguous claim error it re-attempts the IDEMPOTENT claim
once — which lands the claim, or no-ops because the row is already linked to
this account (our earlier commit or a concurrent reuse of userId); both are
success. Only a second transport failure returns 500 for manual reconciliation,
still without deleting. No schema change. Tests
(`__tests__/curator-claim-industry.test.ts`): retry-succeeds→200/no-delete;
error-twice→500/no-delete; zero-rows→410/no-delete. The full atomic
lease-before-provision (Codex's "preferred") is noted as a follow-up — the retry
eliminates the delete-race (the actual HIGH) without adding another migration to
this cutover.

## Re-cutover plan (corrected sequencing)

1. Independent (Codex) RE-review of the hardened migration 104 + helpers + tests.
2. **Deploy the app code first** (`/gsd-ship` → merge → Vercel) so the
   invite UI / waitlist / `check-invite` route are live.
3. Push migration 104 (human-run, Supabase CLI/dashboard).
4. **Live smoke as the acceptance gate** — the regression this fixes is only
   observable at runtime: create a real buyer, staff, industry, and curator
   account against prod and confirm each succeeds, PLUS re-run the artist
   lanes (uninvited rejected / invited admitted / existing signs in). A
   static test cannot substitute for this.

Break-glass Layer 3 (docs/BREAK-GLASS.md) remains available to reopen
instantly if the re-cutover smoke regresses.
