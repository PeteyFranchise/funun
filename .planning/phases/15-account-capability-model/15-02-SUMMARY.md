---
phase: 15-account-capability-model
plan: "02"
subsystem: capability-routes
tags: [api, capabilities, tdd, admin-gate, d-14-enforcement, capability-model]
status: complete
dependency_graph:
  requires:
    - "Plan 01 — capability_grants table, grantCapability()/requestCapability() (lib/capabilities/grant.ts), hasCapability()/isValidCapability() (lib/capabilities/check.ts)"
  provides:
    - "POST /api/capabilities/request — D-02 asymmetric gate (artist instant, industry pending)"
    - "POST /api/capabilities/approve/[grantId] — admin-gated approve/deny with D-11 badge auto-attach"
    - "D-14 server-side enforcement: POST /api/antenna/opportunities requires an approved 'industry' capability"
  affects:
    - "Plan 03 — CapabilityCta component POSTs to /api/capabilities/request"
    - "Plan 04 — admin approval queue POSTs to /api/capabilities/approve/[grantId]"
tech_stack:
  added: []
  patterns:
    - "Session-derived identity only — never a client-supplied profile_id (mirrors createIndustryMember.ts's ownership model, T-15-05/T-15-06)"
    - "verifyAdmin() as the literal first statement, before any DB read (T-05-02 doctrine, mirrors /api/admin/members)"
    - "Approve-route target read from the loaded DB row, not the request body — prevents self-approval (T-15-06)"
key_files:
  created:
    - "app/api/capabilities/request/route.ts"
    - "app/api/capabilities/approve/[grantId]/route.ts"
  modified:
    - "app/api/antenna/opportunities/route.ts"
decisions:
  - "Request route validates capability + role_slugs via isValidCapability()/isValidRoleSlugList(), mirroring admin/members' allowlist body-parse pattern exactly — no new validation style introduced"
  - "Approve route keeps the existing industry_profiles lookup in opportunities/route.ts in place rather than removing it — the D-14 hasCapability() check is additive, closing the pre-existing zero-check gap without touching working logic that still supplies industry_profile_id for the insert"
  - "DuplicateCapabilityRequestError maps to 409 in the request route, matching the DuplicateIndustryMemberError convention from Plan 01/createIndustryMember.ts"
metrics:
  duration: "~10 minutes (across two sessions — Task 1 completed before a weekly agent-limit interruption; Task 2 completed and verified on resume)"
  completed_date: "2026-07-12"
  tasks_completed: 2
  files_changed: 3
---

# Phase 15 Plan 02: Capability Request/Approve Routes + D-14 Enforcement Summary

Two new API routes and one hardened existing route turn Plan 01's data model into a working, server-enforced capability system: `POST /api/capabilities/request` implements D-02's asymmetric gate, `POST /api/capabilities/approve/[grantId]` gives admins a decision endpoint with D-11 badge auto-attach, and `POST /api/antenna/opportunities` gains the D-14 `hasCapability()` check that was the whole reason this phase flagged a real, pre-existing security gap during research.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Capability route-guard tests | `65fea25` | `__tests__/capability-route-guard.test.ts` |
| 1 (GREEN) | Capability request route — D-02 asymmetric gate | `b9a803f` | `app/api/capabilities/request/route.ts` |
| 2 (GREEN) | Admin approve route + D-14 opportunities enforcement | `22cad56` | `app/api/capabilities/approve/[grantId]/route.ts`, `app/api/antenna/opportunities/route.ts` |

**Session note:** Task 1 completed and committed before this plan's execution hit a weekly agent-usage limit mid-Task-2. Task 2's two files (`approve/[grantId]/route.ts`, the `opportunities/route.ts` edit) existed uncommitted in the working tree on resume — inspected, verified against the plan's exact acceptance criteria, confirmed passing (`tsc` clean, `jest` 11/11), and committed as-is with no rework needed.

## Key Artifacts

### `POST /api/capabilities/request`

```typescript
export async function POST(request: Request)
```

- Derives the acting user from `auth.getUser()` — never reads `profile_id`/`profileId` from the request body (T-15-05: client-supplied-id elevation-of-privilege).
- Validates `capability` via `isValidCapability()`, `role_slugs` via `isValidRoleSlugList()` (from `lib/industry/roleMapping.ts`).
- Delegates to `requestCapability({ profileId: user.id, capability, roleSlugs })` (Plan 01).
- Returns `201` with `{ grantId, status }` on success, `409` on `DuplicateCapabilityRequestError`, `400` on invalid input, `401` unauthenticated.

### `POST /api/capabilities/approve/[grantId]`

```typescript
export async function POST(
  request: Request,
  { params }: { params: Promise<{ grantId: string }> }
)
```

- First statement: `verifyAdmin()` — `403`-equivalent for non-admins before any DB read (T-05-02 doctrine).
- Validates `decision` is `'approve' | 'deny'` (`400` otherwise).
- Loads the grant row by `grantId`; `404` if absent, `409` if `status !== 'pending'` (T-15-09 double-decide prevention).
- **Approve:** flips `status → 'approved'`, records `decided_at`/`decided_by`, then attaches the pre-picked badge via `mapSlugsToProfileRoles(grant.role_slugs)` written to `artist_profiles.roles` (D-11 — the badge was chosen at request time, no new input needed here).
- **Deny:** flips `status → 'denied'`, records `decided_at`/`decided_by`, no badge write.
- Target `profile_id` always comes from the loaded grant row, never the request body (T-15-06 — a non-admin cannot self-approve their own pending request even if they guessed a `grantId`).

### D-14 enforcement — `app/api/antenna/opportunities/route.ts`

Added immediately after the existing `401` auth check, before the `industry_profiles` lookup:

```typescript
if (!(await hasCapability(user.id, 'industry'))) {
  return NextResponse.json(
    { error: 'Only accounts with industry access can post opportunities' },
    { status: 403 }
  )
}
```

This closes the exact gap RESEARCH.md's Pitfall 1 flagged: before this plan, any authenticated account — artist or industry — could POST an opportunity with zero capability check; the `(industry)`/`(artist)` route-group split was nav-only. Nav-hiding (Plan 03) remains a UI convenience; this is now the actual permission boundary (T-15-07).

## TDD Gate Compliance

- RED gate: `65fea25` — `test(15-02)` commit — route-guard tests written against `hasCapability()`'s pending-only-returns-false invariant and `isValidCapability()`'s input guard, both already implemented by Plan 01, so these were characterization tests confirming the boundary Plan 02's routes depend on, not a red-to-green cycle on new production code in this file.
- GREEN gate: `b9a803f` (request route) + `22cad56` (approve route + D-14 enforcement) — all 11 tests pass throughout.

## Verification Status

| Check | Status | Notes |
|-------|--------|-------|
| `npx jest __tests__/capability-route-guard.test.ts` | PASS | 11/11 green |
| `npx tsc --noEmit` | PASS | Zero errors project-wide |
| Request route: no `body.profile_id`/`body.profileId` read | PASS | Confirmed via read — identity derived from `auth.getUser()` only |
| Request route: `isValidCapability`/`requestCapability` present | PASS | Both imported and called |
| Approve route: `verifyAdmin()` is the first statement | PASS | Precedes the `params` await and any DB read |
| Approve route: 404 absent / 409 non-pending | PASS | Confirmed in source |
| `hasCapability(user.id, 'industry')` present in opportunities route, before insert | PASS | Confirmed via diff — inserted right after the 401 check |
| Badge auto-attach on approve (D-11) | PASS | `mapSlugsToProfileRoles(grant.role_slugs)` written to `artist_profiles.roles` |

## Deviations from Plan

### Manual-Only item resolved as automated (informational)

The plan anticipated the route-level 403 boundary might need to be recorded as Manual-Only (per 15-VALIDATION.md) if it couldn't be cleanly unit-tested without a full request harness. In practice, `__tests__/capability-route-guard.test.ts` tests the underlying `hasCapability()` invariant directly (mocking the service client), which is the actual boundary the route's `if` statement depends on — this is the plan's own documented fallback ("test `hasCapability()` itself... mirrors 15-01's check test"), so no Manual-Only entry is needed for this item. The two-session, cross-tenant version of this same check (a real artist-only account hitting the live route) remains a manual verification per 15-VALIDATION.md, unchanged.

No other deviations — plan executed exactly as written across both sessions.

## Known Stubs

None — all three routes are fully wired to Plan 01's real `capability_grants` table and helper functions. No placeholder logic.

## Threat Flags

All Plan 02 threat model entries mitigated:

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-15-05: client-supplied `profile_id` on the request route | Identity always derived from `auth.getUser()`; body never read for this | MITIGATED |
| T-15-06: non-admin self-approving a pending request | `verifyAdmin()` first-line gate; target `profile_id` from the loaded DB row | MITIGATED |
| T-15-07: artist-only account posting an opportunity via direct POST | `hasCapability(user.id, 'industry')` server-side 403 | MITIGATED |
| T-15-08: malformed `capability`/`role_slugs`/`decision` body | `isValidCapability`, `isValidRoleSlugList`, literal `'approve'|'deny'` check — all reject with 400 | MITIGATED |
| T-15-09: double-deciding a grant | 409 when `status !== 'pending'`; `decided_by`/`decided_at` recorded | MITIGATED |

## Self-Check: PASSED

- [x] `app/api/capabilities/request/route.ts` — found
- [x] `app/api/capabilities/approve/[grantId]/route.ts` — found
- [x] `app/api/antenna/opportunities/route.ts` — modified, D-14 check present
- [x] `__tests__/capability-route-guard.test.ts` — found, 11/11 passing
- [x] Commits `65fea25`, `b9a803f`, `22cad56` — all found in git log
- [x] `npx tsc --noEmit` — zero errors (confirmed on resume)
- [x] `npx jest __tests__/capability-route-guard.test.ts` — 11/11 green (confirmed on resume)
