---
phase: 10
slug: connections-notifications
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-12
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.4.2 + ts-jest 29.4.11 |
| **Config file** | `jest.config.js` (root) — ts-jest preset, `@/*` path alias mapped |
| **Quick run command** | `npx jest __tests__/<file>.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~1-2 seconds (existing suite is small, pure-function unit tests) |

**Gap:** No supertest/msw/API-mocking or Playwright/Cypress infrastructure exists in this project. Precedent (`__tests__/capability-grant.test.ts`) mocks `@/lib/supabase/server`'s `createServiceClient()` chain and asserts on call arguments — no live DB in the test environment. Anything requiring actual Postgres RLS/trigger evaluation is a manual/DB-level check, not a Jest test.

---

## Sampling Rate

- **After every task commit:** `npx jest __tests__/<relevant-file>.test.ts`
- **After every plan wave:** `npm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green; RLS/trigger-dependent items (accept-seeds-both-follows, unread-COUNT correctness, `no_block()` wiring on `connections` INSERT) verified manually against the live/staging DB per this project's established migration-verification convention
- **Max feedback latency:** ~2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-0X-0X | TBD | TBD | CONNECT-01 | — | Follow triggers a `new_follower` notification with correct type + actor snapshot fields | unit | `npx jest __tests__/notification-triggers.test.ts -t "new_follower"` | ❌ W0 | ⬜ pending |
| 10-0X-0X | TBD | TBD | CONNECT-02 | V4 | Connect request/accept/decline/withdraw payload builders enforce correct state transitions; `note` length validated (≤200 chars) before DB write | unit | `npx jest __tests__/connections.test.ts` | ❌ W0 | ⬜ pending |
| 10-0X-0X | TBD | TBD | CONNECT-02 | V4 | Accepting a connection seeds `follows` rows in both directions via the `SECURITY DEFINER` trigger (not the session client) | manual (DB trigger, no live DB in Jest) | `supabase db push`, then manually accept a request in a seeded environment and confirm 2 rows via `SELECT * FROM follows WHERE ...` | N/A — DB-level check | ⬜ pending |
| 10-0X-0X | TBD | TBD | NOTIF-01 | — | Each of the 6 phase-owned notification types (new follower, connection request, connection accepted, release comment, endorsement received, wall post received) produces a correctly-shaped payload via its `buildXNotification()` pure function | unit | `npx jest __tests__/notification-triggers.test.ts` | ❌ W0 | ⬜ pending |
| 10-0X-0X | TBD | TBD | NOTIF-02 | V4 | Unread-count query excludes read rows and is scoped to `auth.uid()` (never a cached/denormalized counter) | manual (RLS-dependent COUNT, no live DB in Jest) | Seed 3 unread + 2 read notifications for a test user; confirm bell badge shows 3 | N/A — RLS-dependent | ⬜ pending |
| 10-0X-0X | TBD | TBD | NOTIF-03 | V4 | Mark-all-read PATCH updates only the caller's own unread rows | unit (mocked service client) | `npx jest __tests__/notifications-api.test.ts` | ❌ W0 | ⬜ pending |
| 10-0X-0X | TBD | TBD | Pitfall 2 | V4 | `connections` INSERT is rejected when either party has blocked the other (`no_block()` wiring closes the D-15 gap) | manual (RLS-dependent, no live DB in Jest) | Seed a block row between two test users; attempt a Connect request from the blocked party via the API; confirm rejection | N/A — RLS-dependent | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — plan/wave/task IDs finalized once the planner assigns them.*

---

## Wave 0 Requirements

- [ ] `__tests__/connections.test.ts` — covers CONNECT-02 (request/respond/withdraw payload building, note validation)
- [ ] `__tests__/notification-triggers.test.ts` — covers CONNECT-01/NOTIF-01 (per-type `buildXNotification()` pure functions)
- [ ] `__tests__/notifications-api.test.ts` — covers NOTIF-03 (mark-all-read mutation scoping)

*No fixture/mock infra gap — `capability-grant.test.ts`'s `jest.mock('@/lib/supabase/server', ...)` pattern is directly reusable.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Accept seeds both `follows` directions | CONNECT-02 | DB trigger (`SECURITY DEFINER`), no live Postgres in Jest | Push migration, accept a connect request between two seeded test accounts, confirm 2 `follows` rows exist (both directions) |
| Unread badge count accuracy | NOTIF-02 | RLS-scoped COUNT query against live data, not mockable meaningfully | Seed a mix of read/unread notifications for a test user; confirm the bell badge number matches the unread count exactly |
| `no_block()` wiring on `connections` INSERT | CONNECT-02 (Pitfall 2) | RLS policy evaluation requires a live Postgres session | Seed a block between two users; attempt a Connect request from the blocked party; confirm the INSERT is rejected |
| Realtime bell subscription liveness (no channel leakage) | D-12/D-13 | Requires an actual browser session with Supabase Realtime, not unit-testable | Navigate across several authenticated routes without a full reload; confirm no `TooManyChannels` error in console and the badge still updates live on a new notification |
| Notification panel UI (dropdown, mark-all-read, inline accept/decline) | NOTIF-03, D-08/D-09/D-10/D-11 | No browser/E2E runner (Playwright/Cypress) exists in this project | Open the bell dropdown, confirm recent notifications list, click mark-all-read and confirm badge clears, click inline Accept/Decline on a connection-request row and confirm state updates in place |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
