---
pr: 39
date: 2026-07-23
branch: codex/phase-11-presence-messaging
base: origin/main
status: issues_found
depth: deep (targeted — split-sheet / e-sign surface)
counts:
  blocker: 2
  warning: 2
  info: 0
  total: 4
---

# PR #39 Review — Split-Sheet / E-Sign Feature (Phases 17–18)

Scope: `lib/split-sheets/**`, `lib/esign/**`, `lib/vault/pdf/**`, `lib/contracts/**`,
`lib/vault/{coverage,readiness-coverage,readiness}.ts`, `app/api/split-sheets/**`,
`app/approve/**`, `app/(artist)/split-sheets/**`, `app/(artist)/contracts/**`,
`components/split-sheets/**`, `components/contracts/**`, `supabase/migrations/062–069`.

Per the assignment, depth was concentrated on: the mint-gate (`partiesMissingLegalName`),
the WR-03 change-summary persistence/render path, split math, coverage/readiness SQL↔TS
parity, the live-identity resolver's frozen/overwrite boundary, and 17↔18 cross-cutting
integration. WR-01/WR-02/WR-04 (already fixed and reviewed) were re-examined only for
whether the *fix itself* introduced a new defect — it did (see BL-01).

Two BLOCKERs survive verification (both are real, reproducible, and neither is already
covered by an existing test). Two WARNINGs are recorded for completeness. Everything
else checked (split redistribution math, coverage/readiness SQL-vs-TS parity, webhook
signature verification and idempotency, DocuSeal spend-gate ordering, attach/detach/
reconcile double-ownership checks, new-recipient cap math) held up under adversarial
tracing and is not re-litigated here.

## Blockers

### BL-01: `partiesActuallyChanged`/`summarizePartyChanges` match parties by name only in production, because the PATCH route never threads party ids through — reintroducing a WR-04-shaped false positive and corrupting the WR-03 change summary

**Files:**
- `app/api/split-sheets/[id]/route.ts:100-113` (PATCH handler — builds `before`/`after`)
- `lib/split-sheets/change-summary.ts:52-56` (`keyOf` — id-when-present, else normalized name)
- `lib/split-sheets/lifecycle.ts:68-73` (`partiesActuallyChanged`, the WR-04 fix, built directly on the same diff)
- `components/split-sheets/SplitSheetBuilder.tsx:294-311` (client payload — never sends `partyId`)

**Defect:** `summarizePartyChanges()` is documented and unit-tested to match parties by
`id` when present, falling back to normalized name only when it isn't. In production,
however, it is *never* given ids: the builder's save payload (`SplitSheetBuilder.tsx:300-311`)
omits `partyId` entirely, and the PATCH route's own `before` snapshot query
(`route.ts:100-103`) selects only `name, split_percentage` — no `id`. So every real
PATCH call falls back to name-only matching, unconditionally.

`partiesActuallyChanged()` (the WR-04 fix committed as `fc3d8af`/`e4832af`) is built
directly on top of this same function. A party whose **display name changes** (e.g. the
initiator corrects a typo in a collaborator's name, or a fast-add party's placeholder
name becomes their real name after they respond) with an **unchanged split** produces a
spurious `removed` + `added` pair (different name ⇒ different key ⇒ no match), which:

1. Makes `partiesActuallyChanged()` return `true` even though nothing about who owns
   what actually changed — re-triggering the exact "material change" false positive
   WR-04 was supposed to eliminate, just via a different input shape than the one WR-04
   fixed (WR-04 fixed "any parties[] present"; this is "parties[] present with only a
   rename").
2. Forces `assertEditable()` into `resetsConsensus: true` on an `approved`/
   `pending_approval` sheet, which deletes every party's `approval_token` and reverts
   the sheet to `draft` — destroying links for parties who already approved, over a
   cosmetic name fix.
3. Persists a **factually wrong** `last_change_summary` (WR-03's own payload) reading
   "X removed (was N%)" / "Y added at N%" for a party who was neither removed nor
   added — shown verbatim to the renamed party on `/approve/[token]` via
   `SplitApprovalView.tsx:549-565`.

Two identically-named parties (plausible: two collaborators who both go by the same
stage/first name) compound this: `afterByKey`/`matchedAfterKeys` in
`change-summary.ts:72-93` key on the same normalized name, so a genuinely new party
sharing a name with an existing one is silently absorbed into the existing match and
never appears as an `added` record at all.

**Concrete failure scenario:** Sheet `approved` with parties Alex (60%) and "Jon" (40%).
Initiator opens the builder, corrects "Jon" → "Jonathan" (no split change), clicks Save.
`before = [{name:"Alex",split:60},{name:"Jon",split:40}]`,
`after = [{name:"Alex",split:60},{name:"Jonathan",split:40}]`. Diff yields
`removed: Jon (was 40%)` + `added: Jonathan at 40%`. `partiesActuallyChanged` → `true` →
consensus resets to `draft`, both parties' approval tokens are destroyed, and
`last_change_summary` persists the false "Jon removed / Jonathan added" story that Jon
(now Jonathan) sees on his *new* approval link, even though his ownership share never
moved.

**Fix:** Thread the persisted `split_sheet_parties.id` through both snapshots: select
`id, name, split_percentage` for `before` in the PATCH route, and have
`SplitSheetBuilder.tsx` include each row's `partyId` (null for a genuinely new row) in
the save payload so `after` carries it too. `keyOf()` in `change-summary.ts` already
supports id-based matching — the route is the only place currently withholding it.

---

### BL-02: The mint-envelope route and the executed-document pipeline use the frozen `split_sheet_parties` columns directly, never the live-identity resolver — contradicting the "live-linked until mint" design and risking both false mint-blocks and stale legal data baked into the executed record

**Files:**
- `app/api/split-sheets/[id]/mint-envelope/route.ts:122-127, 162-173, 249-259` (raw `sheet.split_sheet_parties(*)` read; gate and PDF input both built from it)
- `app/api/webhooks/docuseal/route.ts:152-159` (Certificate of Completion built from the same frozen columns)
- `lib/split-sheets/live-identity.ts:1-93` (`resolvePartyIdentity` — the only consumer is `app/(artist)/split-sheets/[id]/page.tsx:197`)

**Defect:** `lib/split-sheets/live-identity.ts`'s own header states the design intent
explicitly: "for any split-sheet party who is a Funūn user, PRO/IPI/publishing
designee/administrator/legal name stay live-linked to their account... right up until
the sheet is minted for signature (`esign_pending`). The freeze boundary... already
blocks further writes past that point; it IS the snapshot moment, for free." That
implies mint is the moment live values become the permanent record.

In reality, `resolvePartyIdentity()` has exactly one caller in the whole codebase — the
read-only detail page (`[id]/page.tsx`) that renders the builder UI. `mint-envelope/route.ts`
never calls it: it reads `sheet.split_sheet_parties(*)` (the frozen row) directly, uses
raw `p.legal_name` in `partiesMissingLegalName()` (the mint gate, line 162), and uses the
same raw fields to build `agreementParties` (line 249-259) — the actual PDF content sent
to DocuSeal for signature. The completion webhook's Certificate of Completion
(`webhooks/docuseal/route.ts:152-159`) repeats the same pattern.

Consequences, in both directions:

1. **False block:** A party who is a claimed Funūn user with a legal name on file in
   their *current* `artist_profiles`, but whose frozen `split_sheet_parties.legal_name`
   is still null (never explicitly saved back — e.g. a fast-add party who claimed an
   account after being added but before any subsequent builder Save), is shown as
   complete on the detail page (`kind: 'full'`, live-resolved name populated) but is
   rejected by the mint gate with "Every party needs a legal name... Still missing for:
   {name}" — a state the UI told the initiator didn't exist.
2. **Stale legal data on the executed document:** A claimed party who corrects their
   legal name / PRO / IPI in Settings *after* the sheet's frozen row was last written
   (or after the last builder Save) but *before* mint has their **old** values baked
   into the rendered PDF and the DocuSeal signature request — the opposite of "live-
   linked right up until mint." The same stale values are then repeated into the
   Certificate of Completion at execution.

Neither the mint route's own test coverage (`agreement.test.ts`'s
`partiesMissingLegalName` tests) nor `mint-envelope`'s route logic exercises the
resolved-identity path at all — the gap is untested as well as unimplemented.

**Fix:** Before the legal-name gate and before building `agreementParties` in
`mint-envelope/route.ts`, resolve each party through `resolvePartyIdentity()` (the same
claimed-collaborator batch lookup already implemented in `[id]/page.tsx:142-185`) and run
the gate / build the PDF input against the resolved values, not the raw row. Since the
freeze boundary is meant to be the snapshot moment, the mint route should also persist
the resolved values back onto `split_sheet_parties` at mint time so the frozen record
and the executed PDF agree going forward (and the webhook's certificate renderer stays
correct without needing its own resolution pass).

## Warnings

### WR-05: `POST /api/split-sheets/[id]/share` unconditionally mints a new `approval_token` on every call, contradicting its own "sharing early does not burn a second token" contract

**File:** `app/api/split-sheets/[id]/share/route.ts:69-81`

**Issue:** The route's header comment promises link reuse: "Mints (or refreshes) each
party's approval_token/token_expires_at so the SAME durable /approve/[token] link can
later serve as the formal approval link too... sharing early does not burn a second
token." The implementation does not check for an existing `approval_token` before
generating a new one (contrast with `mint-envelope/route.ts:412-416`, which correctly
reuses `party.approval_token` when already set). Every call to `/share` — e.g. the
initiator clicking "share" again after adding a party, or re-sharing to resend a link —
silently invalidates every previously-issued link for every party on the sheet, since
the old token is overwritten and no longer resolves. Anyone who already opened or
bookmarked a share link before a second `/share` call gets a dead link.

**Fix:** Read each party's current `approval_token`/`token_expires_at` first; only
generate a new token when one is absent (mirroring the exact pattern already used in
`mint-envelope/route.ts`), and only refresh `token_expires_at` on already-issued tokens
if that refresh is actually desired.

### WR-06: `mint-envelope` and `share` routes have no caller in the frontend surface shipped in this PR

**Files:** `app/api/split-sheets/[id]/mint-envelope/route.ts`, `app/api/split-sheets/[id]/share/route.ts`

**Issue:** Neither endpoint is referenced from any component in
`components/split-sheets/**` or the `app/(artist)/split-sheets/**` pages in this diff
(confirmed via full-repo grep for the route paths). The builder currently only calls
`POST /api/split-sheets`, `PATCH /api/split-sheets/[id]`, and
`send-for-approval`. This means BL-02 and WR-05 are not yet reachable through the
shipped UI — but it also means this PR is shipping server logic with no exercised path
to it, which should be either wired before merge or explicitly flagged as
not-yet-integrated so reviewers don't assume end-to-end coverage exists.

**Fix:** Confirm whether the mint/share UI wiring is intentionally deferred to a later
PR; if so, note it in the PR description so BL-02/WR-05 are tracked against the PR that
actually wires them in, rather than assumed already covered by this one's review.
