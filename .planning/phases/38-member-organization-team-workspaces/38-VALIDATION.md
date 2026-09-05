---
phase: 38
slug: member-organization-team-workspaces
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-05
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `38-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.4.2 (ts-jest 29.4.11) |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest lib/workspaces` (or the specific changed test file) |
| **Full suite command** | `npm test` |
| **Type check** | `npx tsc --noEmit` — **never `npm run build` while a dev server runs** (project rule) |
| **Estimated runtime** | full suite ~several minutes (700+ test files, 3572+ tests at last count) |

---

## Sampling Rate

- **After every task commit:** `npx jest <changed>.test.ts` + `npx tsc --noEmit`
- **After every plan wave:** full `npm test` — report exact suite/test counts green (house convention)
- **Before `/gsd-verify-work`:** Full suite green, `tsc --noEmit` clean, ESLint clean
- **Phase gate (additional, RLS-critical):** a **manual adversarial RLS smoke test against real Postgres** before the human-gated `supabase db push`, mirroring `21-RLS-SMOKE-CHECKLIST.md`
- **Max feedback latency:** ~30 seconds for the targeted quick run

---

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists |
|---|---|---|---|---|
| WS-01, WS-02 | `workspaces` table + unverified state | migration text-assertion | `npx jest __tests__/migration-182.test.ts` | ❌ W0 |
| WS-03, WS-04 | Never-zero-owners + pending-seat invite | unit (pure) + migration text-assertion | `npx jest lib/workspaces/roster.test.ts` | ❌ W0 |
| WS-05, WS-06 | Roster state machine + evidence ladder | unit (pure) | `npx jest lib/workspaces/roster.test.ts` | ❌ W0 |
| WS-07, WS-08 | Permission catalogue, tiers, bundle exclusions | unit (pure) | `npx jest lib/workspaces/permissions.test.ts` | ❌ W0 |
| WS-09..WS-12 | Attachment / catalogue / custody transfer | integration (RLS smoke) + unit | `npx jest __tests__/migration-185.test.ts` | ❌ W0 |
| WS-13, WS-14, WS-16 | URL routing, server resolution, switch | unit (`resolveWorkspaceContext`) + manual UAT | `npx jest lib/workspaces/context.test.ts` | ❌ W0 |
| WS-19 | Rights propose-then-confirm | unit (mirrors `lib/profile/claim-prefill.test.ts`) | `npx jest lib/workspaces/rights-propose.test.ts` | ❌ W0 |
| WS-20 | **Structural payout exclusion** | unit — assert `STRUCTURALLY_EXCLUDED` membership **and** a negative test that no grant path returns true for `manage_payouts` | `npx jest lib/workspaces/permissions.test.ts` | ❌ W0 |
| WS-23 | **RLS workspace branch — no recursion, no escalation** | integration + **manual** adversarial smoke | `npx jest __tests__/migration-185.test.ts` + `supabase db reset && psql` checklist | ❌ W0 |
| WS-24 | Grant subset check at grant **and** use time | unit (pure `isSubsetGrant`) | `npx jest lib/workspaces/grants.test.ts` | ❌ W0 |
| WS-25 | Append-only audit, both-sides visible | migration text-assertion (REVOKE UPDATE/DELETE) + route test | `npx jest lib/workspaces/audit.test.ts` | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/workspaces/permissions.test.ts` — permission catalogue, tiers, bundle + structural exclusions
- [ ] `lib/workspaces/grants.test.ts` — subset-check pure logic
- [ ] `lib/workspaces/roster.test.ts` — relationship state machine
- [ ] `lib/workspaces/context.test.ts` — server-side workspace resolution
- [ ] `lib/workspaces/audit.test.ts` — append-only write-through (mirrors `lib/staff/audit.ts` test shape)
- [ ] `__tests__/migration-182.test.ts` … `migration-187.test.ts` — one per slice migration (universal repo convention: every migration ships a paired string-assertion test)
- [ ] **A written, human-run adversarial RLS smoke checklist for the RLS migration** — horizontal-escalation attempts, mirroring `21-RLS-SMOKE-CHECKLIST.md`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| RLS non-recursion + non-escalation against live Postgres | WS-23 | **This repo has no automated live-Postgres CI.** Jest text-assertions confirm only that the SQL matches what was authored — never that it behaves correctly. Smoke checklists are the house pattern for every prior RLS phase (078, 136). | `supabase db reset`, then run the escalation checklist as each role: member, workspace member without grant, workspace member with grant, revoked member, expired contractor. Confirm each sees exactly its intended rows and no more. |
| In-session workspace switching across tabs | WS-13, WS-16 | No headless browser in this repo | Two tabs, two workspaces, confirm independence and that writes land in the tab's own context |
| Cohort flag isolation | WS-27 | Requires two real accounts | One cohort account, one non-cohort account: confirm identical personal Vault / Writer's Room / Locker / split-sheet behavior |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] **The manual adversarial RLS smoke checklist exists and has been run** — this phase does not pass on green Jest alone
