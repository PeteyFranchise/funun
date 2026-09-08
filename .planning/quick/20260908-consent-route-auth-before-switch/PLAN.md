---
quick_id: 260908-consent
slug: consent-route-auth-before-switch
date: 2026-09-08
phase_ref: 38.0.1
---

# Consent route: authenticate before consulting the D-56 switch

## The carryover

`.planning/phases/38.0.1-.../38.0.1-ORCHESTRATOR-NOTES.md` §1, held because plan 16
owned this file and was mid-flight. Plan 16 has long since merged.

`openConsentContext` in
`app/api/roster/relationships/[relationshipId]/consent/route.ts` builds a
service-role client and reads the D-56 switch **before** `auth.getUser()`. It is
the lone outlier among five routes using `isWorkspaceAccessEnabled`; the other
four all authenticate first (verified directly, not taken from the note).

The note is explicit that this is **not a vulnerability** — the switch is still
consulted before any workspace work. It is hygiene: consistency, no service-role
DB read for unauthenticated callers, and no disclosure of one global boolean.

## A second defect found while reading

The file's header comment (~line 63) says the check runs before authentication
*"copying `app/api/workspaces/invitations/accept/route.ts`."*

**That is backwards.** `invitations/accept` calls `auth.getUser()` at line 193
and `requireMemberApiAccount` at 195, and consults no switch before either. The
consent route does not copy it — it does the opposite of it. The comment has
been asserting a false precedent for its own ordering, which is exactly the kind
of self-justifying note that makes a reviewer stop looking.

Fixing the code without fixing the comment would leave the file explaining, in
prose, why it does something it no longer does.

## Tasks

1. Rewrite the header comment to state the real rule (auth first, then the
   switch) and record that the old comment's cited precedent was wrong.
2. Move `const service = createServiceClient()` and the
   `isWorkspaceAccessEnabled` 503 block to sit after the `requireMemberApiAccount`
   gate and before `loadRelationship`.
3. Add one test: an unauthenticated caller gets **401, not 503**, while the
   switch is disabled. This is the only behaviour that changes.
4. Mark §1 of the 38.0.1 orchestrator notes DONE (2026-09-08).

## Must not change

- The 503 body, the `ACCESS_DISABLED` constant, or the switch's fail-closed
  behaviour for authenticated callers.
- The four existing tests in `the D-56 kill switch fails every verb closed` —
  all use `memberUser()`, so all stay green untouched. If any of them goes red,
  the move was done wrong.

## Verification

`npx tsc --noEmit` clean; full jest suite green; the new test fails if the
ordering is reverted (mutation-proved).
