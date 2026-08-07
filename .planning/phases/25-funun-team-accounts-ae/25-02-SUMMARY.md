---
phase: 25-funun-team-accounts-ae
plan: 02
subsystem: staff-write-through-infra
tags: [audit, notifications, staff, rbac]
dependency-graph:
  requires:
    - "lib/admin/gate.ts's getStaffRole/requireStaff (25-01)"
  provides:
    - "logStaffAction(service, args) — unconditional, non-throwing audit write-through for staff_audit_log"
    - "resolveLeadRecipient(org, leadershipFallbackId) — pure AE/leadership-fallback resolver"
    - "buildAeAssignedNotification(args) — pure createNotification-compatible payload builder"
    - "buildLeadRoutedNotification(args) — pure createNotification-compatible payload builder"
  affects:
    - lib/staff/audit.ts
    - lib/staff/notifications.ts
tech-stack:
  added: []
  patterns:
    - "Write-through audit helper mirrors createNotification's service-client-first-arg, { ok, error } non-throwing shape"
    - "Pure notification-payload builders (no client, no I/O) mirroring lib/deals/notifications.ts, feeding createNotification at the call site"
key-files:
  created:
    - lib/staff/audit.ts
    - lib/staff/audit.test.ts
    - lib/staff/notifications.ts
    - lib/staff/notifications.test.ts
  modified: []
decisions:
  - "logStaffAction is the ONE write-through call every staff write (25-04, 25-05) will invoke — centralizes D-04's audit requirement into a single code-review surface instead of scattering .insert() calls across routes"
  - "logStaffAction never throws — mirrors createNotification's { ok, error } convention; the caller decides whether a log failure blocks the primary write (D-04 prefers never blocking on a log error)"
  - "Notification builders reuse the existing notifications table + createNotification (no new table/queue) — notifications.type is unconstrained TEXT so 'ae_assigned'/'lead_routed' need no migration"
  - "Phase 23's buyer-signup lead-routing call site (resolveLeadRecipient + buildLeadRoutedNotification invoked after a new Client Partner org is created) is documented in-file, not wired — that mutation has not landed yet. 25-05 wires buildAeAssignedNotification after an AE (re)assignment write instead, since that call site exists in this phase."
  - "buildAeAssignedNotification/buildLeadRoutedNotification link to /admin/client-partners/{orgId} (the company's own admin surface), not the list view, per the plan's behavior spec"
metrics:
  duration: ~10min
  completed: 2026-08-06
status: complete
---

# Phase 25 Plan 02: Staff Audit Trail + Lead-Routing Notification Builders Summary

Shipped the two write-through helpers every staff write depends on: `logStaffAction()` (D-04's unconditional
audit trail) and `resolveLeadRecipient()` + two pure notification builders (ROADMAP goal deliverable #4 —
lead/work routing), both landing in Wave 1 so Wave 2 staff routes (25-04, 25-05) can call them directly.

## What Was Built

### Task 1: `lib/staff/audit.ts` — `logStaffAction()`

- `logStaffAction(service: SupabaseClient, args: { actorId, action, targetType, targetId?, changes? })`:
  inserts one row into `staff_audit_log` mapping `actor_id`/`action`/`target_type`/`target_id`/`changes`,
  with `targetId` defaulting to `null` and `changes` defaulting to `{}` when omitted.
- Mirrors `createNotification`'s exact shape: service client is the first argument, return is
  `{ ok: !error, error: error?.message }`, never throws.
- Called unconditionally — a no-op/idempotent edit (empty `changes`) still produces exactly one insert
  (D-04's "audit even idempotent actions" discipline, mirroring `grantOrRevokeVerification`).
- `staff_audit_log` itself (the zero-RLS/REVOKE-ALL table) is authored in 25-03; this plan's tests mock the
  service client's `from('staff_audit_log').insert()` call rather than hitting a live table.

### Task 2: `lib/staff/notifications.ts` — `resolveLeadRecipient()` + pure builders

- `resolveLeadRecipient(org, leadershipFallbackId)`: returns `org?.ae_user_id ?? leadershipFallbackId` — an
  unassigned company still routes to leadership, never to nobody.
- `buildAeAssignedNotification({ recipientId, orgId, orgName, actorId })`: returns a
  `createNotification`-compatible payload (`userId`, `type: 'ae_assigned'`, `title` naming the company,
  `link: /admin/client-partners/{orgId}`, `data`, `actorId`).
- `buildLeadRoutedNotification({ recipientId, orgId, orgName, actorId? })`: same shape,
  `type: 'lead_routed'`.
- Both builders are pure — no Supabase client, no I/O, calling twice with identical args returns
  structurally equal objects (proven in tests via `toEqual`).
- **Phase 23 hook (documented, not wired):** the buyer-signup lead-routing call site — a new Client Partner
  (`buyer_orgs`) row created → `resolveLeadRecipient()` → `createNotification(service,
  buildLeadRoutedNotification(...))` as a best-effort side effect immediately after the signup mutation —
  belongs to Phase 23 (buyer onboarding), which has not yet executed. This plan ships the pure builder and
  documents the intended call site in a file comment; 25-05 is the first real call site, wiring
  `buildAeAssignedNotification()` after an AE (re)assignment write.

## Deviations from Plan

None — plan executed exactly as written. Both tasks followed the RED/GREEN TDD flow: a failing test
(module-not-found) committed first, then the minimal implementation committed second, both green.

## Verification Results

- `npx jest lib/staff/audit.test.ts lib/staff/notifications.test.ts` — 2 suites, 12 tests, all green.
- `npx tsc --noEmit` — clean.
- `npx eslint lib/staff/audit.ts lib/staff/audit.test.ts lib/staff/notifications.ts lib/staff/notifications.test.ts --max-warnings=0` — clean.
- Full repo suite (`npm test`) — 123 suites / 1484 tests, all green (no regressions; up from 121/1472 in
  25-01, consistent with the 2 new suites / 12 new tests added here).

## Known Stubs

None — both modules are fully implemented per their `must_haves`; no data flows to UI in this plan (pure
lib helpers only, no route/UI wiring in Wave 1).

## Threat Flags

None new. This plan closes T-25-03 (repudiation — audit write path), T-25-14 (tampering — changes payload
provenance), and T-25-15 (information disclosure — lead-routing recipient) from the plan's own threat model
by construction: `logStaffAction` is the single unconditional write-through (T-25-03); `changes` is whatever
the caller passes (the server-side sanitized update object, never raw request body — enforced at the
call-site routes in 25-04/25-05, not here); `resolveLeadRecipient` only ever returns `ae_user_id` or the
caller-supplied leadership fallback id, never a client-chosen recipient (T-25-15). No new network endpoints,
auth paths, or schema changes were introduced by this plan.

## Self-Check: PASSED

- FOUND: lib/staff/audit.ts
- FOUND: lib/staff/audit.test.ts
- FOUND: lib/staff/notifications.ts
- FOUND: lib/staff/notifications.test.ts
- FOUND commit 1e6e477 (test: audit RED — logStaffAction)
- FOUND commit e891dbd (feat: audit GREEN — logStaffAction)
- FOUND commit 5ae84f2 (test: notifications RED — resolveLeadRecipient + builders)
- FOUND commit 4b64c54 (feat: notifications GREEN — resolveLeadRecipient + builders)
