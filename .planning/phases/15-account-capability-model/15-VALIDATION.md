---
phase: 15
slug: account-capability-model
status: finalized
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-07
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.4.2 + ts-jest 29.4.11 |
| **Config file** | `jest.config.js` (root) |
| **Quick run command** | `npx jest __tests__/capability-*.test.ts` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | ~2-5 seconds (small suite; currently 1 pre-existing test file) |

---

## Sampling Rate

- **After every task commit:** Run `npx jest __tests__/capability-*.test.ts` (fast, pure-function subset)
- **After every plan wave:** Run `npx jest` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green; RLS/partial-unique-index behavior needs a manual `supabase db push` + direct SQL verification pass (no automated Postgres-integration test harness exists in this project — consistent with Phase 8's own migration-push verification gap)
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

*Finalized by the planner against the actual PLAN.md tasks (2026-07-07).*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-T1 | 01 | 1 | D-01/D-02 | T-15-01 | Wave 0 RED: grant/check test files fail-to-import until code exists | unit | `npx jest __tests__/capability-grant.test.ts __tests__/capability-check.test.ts` | ❌ W0 (this task creates them) | ⬜ pending |
| 15-01-T2a | 01 | 1 | D-02 (instant grant) | T-15-01 | Instant industry→artist grant inserts `'approved'` row, no admin path | unit | `npx jest __tests__/capability-grant.test.ts -t "instant grant"` | ✅ after T1 | ⬜ pending |
| 15-01-T2b | 01 | 1 | D-02 (pending request) | T-15-05 | Artist→industry request inserts `'pending'` row, no access until approved | unit | `npx jest __tests__/capability-grant.test.ts -t "pending request"` | ✅ after T1 | ⬜ pending |
| 15-01-T2c | 01 | 1 | D-14 (enforcement) | T-15-01 | `hasCapability()` returns false for a `'pending'`-only grant | unit | `npx jest __tests__/capability-check.test.ts` | ✅ after T1 | ⬜ pending |
| 15-01-T3 | 01 | 1 | D-01/D-12 (dedup + backfill) | T-15-02/T-15-04 | Partial unique index rejects duplicate; backfill lands one grant per member_type | integration (live/test DB) | manual `supabase db push` + direct SQL (checkpoint task) | ❌ W0 | ⬜ pending |
| 15-02-T1 | 02 | 2 | D-02 (asymmetric gate) | T-15-05/T-15-08 | request route derives identity from session; validates capability/role_slugs | source assertion + tsc | grep (no body profile_id) + `npx tsc --noEmit` | n/a | ⬜ pending |
| 15-02-T2 | 02 | 2 | D-14 (route guard) | T-15-06/T-15-07 | approve route verifyAdmin-first; opportunities POST 403 without industry capability | unit + source | `npx jest __tests__/capability-route-guard.test.ts` + grep hasCapability | ❌ W0 (this task creates it) | ⬜ pending |
| 15-03-T1 | 03 | 2 | D-08 (nav hiding) | T-15-10/T-15-11 | ArtistNav hides artist rooms when capability absent; capabilities read server-side | source + manual/visual | grep `requiresCapability`/`visibleItems` + manual load | N/A (no component-test infra) | ⬜ pending |
| 15-03-T2 | 03 | 2 | D-05/D-06/D-07/D-09 | T-15-12 | (industry) layout deleted; routes relocated (URLs stable); CapabilityCta POSTs request | source + manual | `test ! -f app/(industry)/layout.tsx` + manual nav check | n/a | ⬜ pending |
| 15-04-T1/T2 | 04 | 3 | D-03/D-11 | T-15-13/T-15-14 | Admin queue lists pending requests; approve/deny wired to approve route; per-page is_admin gate | source + manual | grep admin gate + `/api/capabilities/approve/` + manual approve flow | n/a | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `__tests__/capability-grant.test.ts` — covers instant-grant and pending-request insert behavior (pure function, mockable service client)
- [ ] `__tests__/capability-check.test.ts` — covers `hasCapability()` status filtering

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `capability_grants` RLS + partial unique index enforce dedup at the DB level | D-01 | No local Supabase test-DB harness exists to automate RLS/constraint verification (pre-existing project-wide gap, also hit by Phase 8) | Push migration to a real/linked Supabase project; attempt two concurrent inserts for the same (profile_id, capability) with status in ('pending','approved'); confirm the second fails with a unique-constraint violation |
| `ArtistNav` conditional rendering (hide-when-absent, D-08) | D-08 | No React Testing Library / component-test framework exists in this repo | Manually load the app as an industry-only account and confirm Vault/Launchpad/PitchPlug/Contract Locker are absent; load as artist-only and confirm Antenna has no Post/Manage-postings section |
| Column-privilege lockdown on `capability_grants` (Pitfall 2) | D-14 / project doctrine | Requires a live database with the migration applied | As the `authenticated` role via direct PostgREST, attempt `UPDATE capability_grants SET status='approved'` on a pending row; confirm `42501 permission denied` or RLS rejection |
| Server-side capability check on opportunity-posting routes (D-14) | D-14 | Requires two live authenticated sessions to confirm an artist-only account is rejected | As an artist-only account, POST to `/api/antenna/opportunities`; confirm 403/401 (not the pre-existing zero-check behavior) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized 2026-07-07 — Per-Task Verification Map mapped to the 4 PLAN.md files (10 tasks). Every code-producing task has an `<automated>` verify (jest or tsc/grep source assertion); DB-level RLS/unique-index/backfill behavior and nav-visibility remain manual per the pre-existing project-wide gaps (no Postgres-integration harness, no component-test framework — same gaps Phase 8 documented).
