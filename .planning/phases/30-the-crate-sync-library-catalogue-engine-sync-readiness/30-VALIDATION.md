---
phase: 30
slug: the-crate-sync-library-catalogue-engine-sync-readiness
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-12
corrected: 2026-08-13
plans_aligned: 2026-08-13
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> **Correction (2026-08-13):** the repo DOES have a unit-test framework — **Jest 30.4.2 + ts-jest**, `jest.config.js`, `npm test`, and ~502 existing `*.test.ts(x)` files (incl. `lib/**` unit tests + `__tests__/` migration text-tests). An earlier draft wrongly said "no framework." Pure/testable modules in this phase MUST get real Jest unit tests, matching repo convention.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.4.2 + ts-jest 29.x (`"test": "jest"`) |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest <path/to/file.test.ts>` (single file/module) |
| **Full suite command** | `npm test` |
| **Type gate** | `npx tsc --noEmit` (run alongside tests) |
| **Estimated runtime** | single file ~2–10s; full suite longer (502 files) |

---

## Sampling Rate

- **After every task commit:** the relevant `npx jest <file>` for the module touched **+ `npx tsc --noEmit`**
- **After every plan wave:** `npm test` (full suite) + `npx tsc --noEmit` (+ `npx next build` for UI waves)
- **Before `/gsd-verify-work`:** full suite green, types green, and each wave's observable UI/DB behavior confirmed in the Next.js preview
- **Max feedback latency:** ~10s for a single-module run; full suite on wave boundaries

---

## Per-Task Verification Map

*Pure/logic modules → **unit (Jest)**. UI/session/RLS-dependent behavior → **manual (browser preview / DB round-trip)**. Owner-run migrations → **live-verify after push**. Keep no 3 consecutive tasks without an automated signal (jest or tsc). The planner's per-plan `<verify>` blocks are the source of truth; this map summarizes.*

| Area (plan) | Test Type | Command / Method |
|-------------|-----------|------------------|
| Sync Readiness per-track derivation (30-01) | unit | `npx jest lib/sync-library/readiness.test.ts` |
| Inclusion-gate predicate + rights badge (30-01/30-04) | unit | `npx jest` on the gate module |
| Tag vocab + non-destructive merge / coerce (30-02) | unit | `npx jest lib/tagging/*.test.ts` |
| Tag pending→approved transition + auto-confirm-for-approvers (30-02) | unit | `npx jest lib/tagging/tag-merge.test.ts` (proposeStaffRefinement/approvePendingTags/rejectPendingTags/isTagApprover) |
| Worklist shaper (pure) (30-05) | unit | `npx jest` on the shaper |
| AI tag-suggest / tag-propose / tag-approve routes (30-06) | manual + unit | route round-trip (service-role: AE→pending, leadership/A&R→confirm, AE-approve→403) + unit on the transition/coercion |
| Migration 107 + 108 (30-03) | live-verify | OWNER pushes BOTH; agent verifies sync_listings columns + funun_staff 'anr' CHECK live (service-role) |
| Role-aware Crate layers (30-08) | manual | browser preview: buyer clean vs staff layered |
| Sync Library backstage UI + worklist (30-09) | manual | browser preview + DB state |

---

## Wave 0 Requirements

- [ ] `lib/sync-library/readiness.test.ts` — unit stubs for the per-track derivation (30-01)
- [ ] `lib/tagging/*.test.ts` — unit stubs for vocab + merge/coerce (30-02)
- [ ] Reuse existing `jest.config.js` + `ts-jest` — no framework install needed

*Follow the existing test conventions in `lib/**/*.test.ts` and `__tests__/` (see e.g. `lib/buyers/permissions.test.ts`, `lib/staff/*.test.ts`).*

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| Role-aware Crate: staff layers vs. clean buyer view | UI + session-dependent | Load `/sync/catalog` as a buyer (clean) and as logged-in staff (layered); confirm staff-only info (rights/readiness/notes/in-progress) shows only for staff |
| Sync Readiness worklist surfaces incomplete tracks + gaps | UI + DB state | Seed an incomplete track; confirm it appears in the worklist with the exact missing items |
| Gate: incomplete track can't go live; enters pipeline (409, non-terminal) | DB state machine | Attempt to admit an incomplete track; confirm it routes to Sync Readiness, not live, not auto-rejected |
| AE cannot admit/reject (leadership-only); AE can browse & pull | RLS / route gate | As an AE, confirm admit/reject is denied and browse + pull-into-Selects works |
| AE tag proposal requires approval; leadership/A&R auto-confirm; AE cannot approve | RLS / route gate + DB state | As an AE, propose tags → lands `pending` (not live); as leadership/A&R, propose → auto-confirms and approve/reject a pending proposal works; as an AE, approve → 403 |

---

## Validation Sign-Off

- [x] Every pure/logic task has a Jest `<verify>`; every UI/RLS task has a manual entry above — verified in the 30-01/02/05/06/07 plans (Jest) and 30-04/08/09 (round-trip/browser)
- [x] Sampling continuity: no 3 consecutive tasks without an automated signal (jest/tsc)
- [ ] Owner-run migration 107 verified live before dependent tasks (never pushed by an agent) — planned via 30-03's blocking-human gate; confirmed at execution
- [x] `nyquist_compliant: true` set once the plan's `<verify>` blocks all reference Jest or a documented manual method

**Plan verify map (pure/logic → Jest; routes → DB round-trip; UI → browser preview; migration → owner-run live-verify):**
- 30-01 → `npx jest lib/sync-library/readiness.test.ts lib/sync-library/gate.test.ts`
- 30-02 → `npx jest lib/tagging/*.test.ts lib/metadata/descriptors.test.ts`
- 30-05 → `npx jest lib/sync-library/worklist.test.ts` (shaper) + route round-trip
- 30-06 → coercion Jest (30-02) as guard + service-role route round-trip
- 30-07 → `npx jest lib/deals/catalog.test.ts` (pure helpers) + query round-trip + browser
- 30-04 → gate/readiness Jest as guard + DB round-trip (leadership/AE/409)
- 30-03 → owner-run push + live service-role column verify
- 30-08 / 30-09 → browser preview (+ DB state)

**Approval:** plans aligned to Jest 2026-08-13; owner-run migration gate pending at execution
