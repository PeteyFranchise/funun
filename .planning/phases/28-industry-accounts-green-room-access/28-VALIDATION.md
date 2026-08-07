---
phase: 28
slug: industry-accounts-green-room-access
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-05
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest ^30.4.2 (already in repo) |
| **Config file** | package.json `test` script (Jest) |
| **Quick run command** | `npx jest <changed test file>` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~ (repo suite; measure at Wave 0) |

*Access-gate logic (Green Room account-type gate, industry capability, member_type/capability reconciliation)
and migration text are all unit-testable — mirror `__tests__/migration-061.test.ts` + `lib/buyers/permissions.test.ts`.*

---

## Sampling Rate

- **After every task commit:** `npx jest <changed test file>`
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** full suite green
- **Max feedback latency:** ~60s (quick run)

---

## Per-Task Verification Map

*Planner completes from the PLAN.md task list. High unit-testability: the Antenna-gate fix, the Green Room
account-type gate, and the curator claim→industry repoint are pure/route logic with clear pass/deny cases.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 28-01-01 | 01 | 1 | (planner) | T-28-01 / — | industry account can post an opportunity (gate satisfiable) | unit | `npx jest __tests__/antenna-industry-gate.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test file(s) for the Antenna industry-gate fix + the Green Room account-type gate (Artist ✓ / Industry ✓ / else ✗)
- [ ] Test for the curator claim→Industry-account repoint (no more `role='curator'`)
- [ ] Migration-text test for the role='curator' retirement / any schema change

*Jest already installed — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration push (curator retirement / capability reconciliation) | (planner) | Migrations HUMAN-GATED — never `supabase db push` | Codex push report after review + owner approval |
| Existing claimed `role='curator'` accounts count | (planner) | Needs live DB (owner believes ~0, unverified) | Confirm on live DB before/at the push checkpoint |
| Live Green Room access (industry in, funūn-email blocked) | (planner) | Needs live accounts | Post-push smoke |

*Gate/claim/migration logic is automatable; live-DB confirmation + the push are manual.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
