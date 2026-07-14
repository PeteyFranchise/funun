---
phase: 11
slug: presence-messaging
status: complete_pending_human_uat
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-13
updated: 2026-07-13
---

# Phase 11 — Validation Record

Phase 11 implementation is complete from the automated/code/database side. The remaining work is human UAT only: two-session Realtime presence, visual messaging flows, and end-to-end browser confirmation on the deployed preview.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Jest 29.x + TypeScript + Next.js build |
| Config file | `jest.config.js`, `tsconfig.json`, `next.config.mjs` |
| Targeted run command | `npm test -- --runInBand __tests__/dm-send-gate.test.ts __tests__/dm-request-routes-review-fixes.test.ts __tests__/dm-request.test.ts __tests__/dm-unread.test.ts __tests__/presence.test.ts` |
| Full suite command | `npm test -- --runInBand` |
| Static checks | `npm run lint`, `npx tsc --noEmit`, `npm run build` |
| Database check | `npx supabase migration list` |

---

## Sampling Rate

- After pure-helper work: targeted Jest coverage for presence, DM request limits, unread logic, and notification builders.
- After route/UI work: targeted DM/presence suites plus full Jest.
- After review fixes: targeted regression suites, lint, TypeScript, full Jest, build, PR/Vercel checks.
- Max automated feedback latency observed: within a single execution session; no watch-mode commands used.

---

## Automated Verification Map

| Area | Requirement | Verification | Status |
|------|-------------|--------------|--------|
| Presence bucket formatting | PRESENCE-01, PRESENCE-02 | `__tests__/presence.test.ts` | pass |
| DM unread comparison | PRESENCE-03 | `__tests__/dm-unread.test.ts` | pass |
| Cold-message request limits | CONNECT-04 | `__tests__/dm-request.test.ts`, `__tests__/dm-send-gate.test.ts` | pass |
| Connection/direct-message gate | CONNECT-05 | `__tests__/dm-request.test.ts`, `__tests__/dm-send-gate.test.ts` | pass |
| Request accept/decline recipient guards | CONNECT-03 | `__tests__/dm-request-routes-review-fixes.test.ts` | pass |
| Block/declined delivery handling | CONNECT-03 | `__tests__/dm-request-routes-review-fixes.test.ts`, `__tests__/dm-send-gate.test.ts` | pass |
| UUID validation before raw PostgREST filters | CONNECT-03, CONNECT-05 | `__tests__/dm-request-routes-review-fixes.test.ts` | pass |
| Migration 054 schema contract | PRESENCE-01, PRESENCE-02, CONNECT-03, CONNECT-04 | `__tests__/migration-054.test.ts`; remote migration list shows `054` LOCAL=REMOTE | pass |
| Migration 055 RLS update policy | CONNECT-03 | `__tests__/migration-055.test.ts`; remote migration list shows `055` LOCAL=REMOTE | pass |
| Whole app static correctness | All Phase 11 touched surfaces | `npm run lint`, `npx tsc --noEmit`, `npm run build` | pass |
| Whole automated suite | Regression coverage | `npm test -- --runInBand` | pass |
| Deployment preview | Integration smoke | Vercel PR checks on PR #37 | pass |

---

## Review Fix Verification

The adversarial review in `11-REVIEW.md` found 7 issues: CR-01, CR-02, CR-03, WR-01, WR-02, IN-01, and IN-02. `11-REVIEW-FIX.md` records the fixes. The fix commit verifies:

- Requester self-accept and self-decline are blocked atomically in the update filter.
- Blocked and declined delivery returns a silent `403` path instead of persisting new messages.
- Recipient ids are validated as UUIDs before `.or()` filters are built.
- Composer removes optimistic messages when a `200 OK` response lacks a usable message id.
- Thread sort-fallback documentation now matches implementation.

---

## Database Verification

`npx supabase migration list` was run against the linked remote on 2026-07-13. Migrations `054` and `055` are present in both LOCAL and REMOTE columns.

This closes the Plan 03 live database gap: `dm_threads` now has the participant-scoped UPDATE policy required for accept, decline, and block transitions.

---

## Manual-Only UAT Remaining

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Online pill appears/disappears across two active browser sessions | PRESENCE-01 | Requires live Supabase Realtime Presence with two authenticated users | Sign in as User A and User B, open User A profile from User B, confirm Online pill appears while A is active and disappears after A leaves/inactivity |
| DM header shows Active now / Active X ago buckets | PRESENCE-02 | Requires live `last_seen_at` heartbeat and browser timing | Trigger heartbeat as User A, open conversation as User B, confirm status buckets match expected freshness windows |
| Message unread badge clears after opening a thread | PRESENCE-03 | Requires live browser navigation and read-marker write | Send a message, confirm nav/widget unread badge increments, open thread, confirm badge clears |
| Request accept/decline/block round-trip | CONNECT-03 | Requires two live authenticated users and real RLS policies | Send cold request from A to B; as B accept, decline, and block separate seeded requests; confirm UI and API behavior |
| Rate-limit wall and stacked pending cap | CONNECT-04 | Requires seeded or repeated live pending requests | Seed outbound pending requests to the configured limit; confirm composer switches to rate-limit wall and stacked cap messaging |
| Connected members bypass request flow | CONNECT-05 | Requires an accepted connection row | Create accepted connection, send message, confirm direct thread without request quarantine |
| Docked widget persists across navigation | CONNECT-03, PRESENCE-03 | Visual/browser behavior | Open docked widget, navigate between authenticated pages, confirm thread state and unread behavior remain coherent |

---

## Validation Sign-Off

- [x] All Phase 11 plans have automated verification or documented manual-only rationale.
- [x] Wave 0 tests and helpers are complete.
- [x] No watch-mode commands used.
- [x] Security review findings are fixed and regression-tested.
- [x] Migrations 054 and 055 are applied remotely.
- [x] PR #37 Vercel checks pass.
- [ ] Human UAT complete.

**Implementation approval:** complete pending human UAT, 2026-07-13.
