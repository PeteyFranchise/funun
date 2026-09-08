---
quick_id: 260908-consent
slug: consent-route-auth-before-switch
status: complete
date: 2026-09-08
phase_ref: 38.0.1
---

# Summary

## Delivered

- `openConsentContext` now authenticates before consulting D-56.
  Order: `createApiClient` → `auth.getUser` → `requireMemberApiAccount` →
  `createServiceClient` → `isWorkspaceAccessEnabled` → `loadRelationship`.
- Header comment rewritten (see below).
- Two tests added, both mutation-proved.
- 38.0.1 orchestrator notes §1 marked DONE.

## The second defect

The header comment justified switch-first as *"copying
`app/api/workspaces/invitations/accept/route.ts`."* **That was false.** That
route calls `auth.getUser()` at line 193 and `requireMemberApiAccount` at 195,
consulting no switch before either — as do the other three routes using the
helper. This file was the lone outlier among five while its comment claimed to
be following them.

Fixing the code alone would have left the file explaining, in prose, why it
does something it no longer does — and left the false precedent available to
anyone who later wondered why the order changed. The comment now states the
real rule and records that its own cited precedent was wrong.

## Why the new tests were necessary

All four pre-existing kill-switch tests use `memberUser()`. They pass under
**either** ordering, so the suite could never have caught this. Mutation
confirmed it: reverting to switch-first fails exactly the two new tests and
none of the four old ones.

## Scope honoured

Not a vulnerability, and not described as one. The switch was always consulted
before any workspace work. What changed: an unauthenticated caller no longer
triggers a service-role client and DB read, and no longer learns whether
workspace access is enabled.

## Gate

`npx tsc --noEmit` clean. Full suite 6330/6330 (540 suites).
