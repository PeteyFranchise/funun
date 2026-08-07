---
phase: 25
slug: funun-team-accounts-ae
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-05
---

# Phase 25 — Validation Strategy

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

*Precedent test files: `lib/buyers/permissions.test.ts`, `lib/dashboard/next-moves.test.ts`, `__tests__/migration-061.test.ts`.*

---

## Sampling Rate

- **After every task commit:** Run `npx jest <changed test file>`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 seconds (quick run)

---

## Per-Task Verification Map

*Planner completes this from the PLAN.md task list. Staff-RBAC has strong unit-testability
(pure `requireStaff(role, allowed)` / capability checks) — mirror `lib/buyers/permissions.test.ts`.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | (planner) | T-25-01 / — | staff role gate denies non-staff | unit | `npx jest lib/admin/gate.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test file(s) for the staff role gate — stubs mirroring `lib/buyers/permissions.test.ts`
- [ ] Any shared fixtures for staff-principal auth (mock `app_metadata` roles)

*Jest already installed — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration push (staff schema, `ae_user_id`, `staff_audit_log`) | (planner) | Migrations are HUMAN-GATED — never run `supabase db push` | Codex push report after review + owner approval |
| RLS/service-role enforcement on live DB | (planner) | Needs live Supabase | Verify service-role-only writes hold post-push |

*Staff-RBAC logic itself is automatable; only DB-push + live RLS confirmation are manual.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
