---
phase: 33
slug: the-playbook-shell-it-team-monitoring-dashboard-read-only-v1
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-17
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (ts-jest / next jest) |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest <pattern>` (e.g. `npx jest playbook`) |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–90 seconds (94 existing test files) |

---

## Sampling Rate

- **After every task commit:** Run `npx jest <pattern>` scoped to the touched area
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

> Populated during planning / execution once PLAN.md tasks exist. Anchors below reflect the Validation Architecture in `33-RESEARCH.md`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | REQ-TBD | T-33-01 / — | IT room + dashboard reject non-`leadership`/`it` staff (redirect/404) | unit | `npx jest playbook` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | REQ-TBD | — | `it` role recognized by `getStaffRole()` + gated by `requireStaff(['leadership','it'])` | unit | `npx jest staff-role` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | REQ-TBD | — | Doc pages render committed `.md` content (source-of-truth, no duplication) | unit | `npx jest playbook-docs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `__tests__/playbook-role-gate.test.ts` — IT-room `requireStaff(['leadership','it'])` gate + role-conditional Rail 2 visibility (D-02, D-06)
- [ ] `__tests__/staff-role-it.test.ts` — `'it'` present in `StaffRole` union + `ALL_STAFF_ROLES` + recognized by `getStaffRole()` (D-01)
- [ ] `__tests__/playbook-docs-render.test.ts` — the 4 doc pages render their `docs/observability/*.md` source (page→file map, D-10)

*Framework already installed (jest, 94 existing test files) — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `docs/observability/*.md` files resolve at runtime on Vercel (not just locally) | D-10 | Runtime file-tracing behavior differs between `next dev` and the deployed serverless bundle | After `next build`, inspect `.next/server/**/*.nft.json` for the doc paths; verify the deployed IT doc pages render content (not a 500/empty) — see `33-RESEARCH.md` deployment-risk finding |
| App Health tile + banner reflect real `/api/health` posture | D-07 | Live-signal surface; deterministic test can assert wiring but real posture is environment-dependent | Load the dashboard while `/api/health` is 200 (healthy chip) and force a 503 (degraded banner/tile) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
