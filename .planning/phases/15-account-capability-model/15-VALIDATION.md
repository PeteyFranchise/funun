---
phase: 15
slug: account-capability-model
status: draft
nyquist_compliant: false
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

*Populated by the planner from actual PLAN.md tasks — this table is a placeholder until PLAN.md files exist.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | D-01/D-02 (instant grant) | T-15-01 | Instant industry→artist grant inserts `'approved'` row, no admin path | unit | `npx jest __tests__/capability-grant.test.ts -t "instant grant"` | ❌ W0 | ⬜ pending |
| 15-01-02 | 01 | 1 | D-01/D-02 (pending request) | T-15-01 | Artist→industry request inserts `'pending'` row, no access until approved | unit | `npx jest __tests__/capability-grant.test.ts -t "pending request"` | ❌ W0 | ⬜ pending |
| 15-01-03 | 01 | 1 | D-01 (dedup) | T-15-02 | Duplicate pending/approved request for same (profile, capability) rejected by partial unique index | integration (live/test DB) | manual `supabase db push` + direct SQL insert test | ❌ W0 | ⬜ pending |
| 15-0X-0X | TBD | TBD | D-14 (enforcement) | T-15-01 (Pitfall 1) | `hasCapability()` returns false for a `'pending'`-only grant | unit | `npx jest __tests__/capability-check.test.ts` | ❌ W0 | ⬜ pending |
| 15-0X-0X | TBD | TBD | D-08 (nav hiding) | — | `ArtistNav` hides Antenna Post section when `capabilities` lacks `'industry'` | manual/visual | none — no component-test infra exists in this repo | N/A | ⬜ pending |

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
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — planner will finalize the Per-Task Verification Map against actual PLAN.md tasks
