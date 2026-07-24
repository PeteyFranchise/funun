---
status: testing
phase: 19-profile-identity-model-cleanup
source: [19-VERIFICATION.md]
started: 2026-07-24
updated: 2026-07-24
---

## Current Test

number: 1
name: Claim pre-fill confirm round trip (R2)
expected: |
  As a new user whose email matches unclaimed collaborator rows carrying rights data
  (pro/ipi/publisher/phone/address), sign up and land on Settings. Blank rights fields are
  pre-filled from the claimed collaborator records, each rendering an "unconfirmed — review"
  badge with named provenance ("We filled this from a credit <inviting artist> added you to").
  Confirming a field persists confirmed:true and the badge disappears. Re-running the claim
  flow (re-login / re-hit /api/claim-collaborators) never overwrites a confirmed or edited value.
awaiting: user response

## Tests

### 1. Claim pre-fill confirm round trip (R2)
expected: A new user whose email matches unclaimed collaborator rows (with rights data) signs up → Settings shows those blank rights fields pre-filled with an "unconfirmed — review" badge + named provenance ("We filled this from a credit <inviting artist> added you to"). Confirming a field persists `confirmed:true` and clears the badge. Re-running the claim (re-login / re-hit `/api/claim-collaborators`) never overwrites a confirmed or edited value.
result: [pending]

### 2. Correction-flag → owner notify → void / guided-apply round trip (R4)
expected: As a claimed user on a FROZEN (esign_pending or executed) split sheet, submit "This info is wrong" from the Contract Locker with a suggested PRO/IPI/publisher/administrator/legal_name value. As the sheet owner, receive BOTH a bell notification and a Resend email carrying the suggested value + a `?stagedFlag=` deep link. The staged panel shows current vs suggested value. For `esign_pending`, "Withdraw signature request" calls the void route and un-freezes the sheet. For `executed`, only a guided pointer to `/split-sheets/new` is shown — no amendment, no PDF/Certificate mutation.
result: [pending]

### 3. Licensee note visual breakpoint on the share view (R5, minor)
expected: A newly generated split-sheet PDF and the `/approve/[token]` share page at the 375px mobile-first breakpoint (across each phase branch: preview / sign / waiting / countered / done) render the licensee note callout legibly and visually distinct from the Guidance Notes callout. (The note's text presence is already proven by the PDF byte-extraction test; this is a visual legibility/placement check only.)
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
