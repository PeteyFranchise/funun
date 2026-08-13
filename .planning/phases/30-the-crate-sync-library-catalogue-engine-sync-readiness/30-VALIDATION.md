---
phase: 30
slug: the-crate-sync-library-catalogue-engine-sync-readiness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-12
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — this repo has no unit-test framework; verification is `tsc --noEmit` (types) + Next.js browser-preview + service-role DB round-trips (as used this session) |
| **Config file** | none |
| **Quick run command** | `npx tsc --noEmit` |
| **Full suite command** | `npx tsc --noEmit && npx next build` |
| **Estimated runtime** | ~30–120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit`
- **After every plan wave:** `npx tsc --noEmit && npx next build`; plus browser-preview verification of any observable surface (per CLAUDE.md preview workflow)
- **Before `/gsd-verify-work`:** types green, build green, and the wave's observable behavior confirmed in the preview
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

*Planner fills this from the tasks. Because there is no unit framework, most rows will be `Test Type: manual` (browser-preview / DB round-trip) or `type-check`. Keep no 3 consecutive tasks without SOME automated signal (`tsc`/`build`).*

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|--------|
| 30-01-01 | 01 | 1 | — | — | type-check | `npx tsc --noEmit` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] No unit framework is being introduced by this phase (out of scope). Existing `tsc` + browser-preview verification covers phase behaviors.

*If a testable pure module emerges (e.g. a sync-readiness derivation function or a tag-coercion helper), the planner MAY add a lightweight test harness — but that is a deliberate scope addition, not assumed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Role-aware Crate layers render for staff vs. clean for buyers | — | No unit framework; UI + session-dependent | Load `/sync/catalog` as a buyer (clean) and as a logged-in staff member (layered); confirm staff-only info (rights/readiness/notes/in-progress) shows only for staff |
| Sync Readiness worklist surfaces incomplete tracks + gaps | — | UI + DB state | Seed an incomplete track; confirm it appears in the Sync Library worklist with the exact missing items |
| Gate: incomplete track cannot go live; enters the pipeline | — | DB state machine | Attempt to admit an incomplete track; confirm it routes to Sync Readiness instead of going live |
| AE cannot admit/reject (leadership-only); AE can browse & pull | — | RLS / route gate | As an AE, confirm admit/reject is denied and browse + pull-into-Selects works |

---

## Validation Sign-Off

- [ ] Every task has an automated signal (`tsc`/`build`) OR an explicit manual-verification entry above
- [ ] Sampling continuity: no 3 consecutive tasks without an automated signal
- [ ] Owner-run migrations verified live before dependent tasks (never pushed by an agent)
- [ ] `nyquist_compliant: true` set in frontmatter once the plan's task map is filled

**Approval:** pending
