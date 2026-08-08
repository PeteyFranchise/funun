---
phase: 26
slug: sync-library-inclusion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-07
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest (already installed; project convention — see `__tests__/`) |
| **Config file** | `jest.config.*` / `package.json` (existing) |
| **Quick run command** | `npx jest <changed test file>` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | ~13 seconds (full suite; 135 suites / 1600+ tests as of Phase 23) |

---

## Sampling Rate

- **After every task commit:** Run `npx jest <changed test file>`
- **After every plan wave:** Run `npx jest` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~13 seconds

---

## Per-Task Verification Map

> Populated during planning — one row per task once `PLAN.md` files exist. Every task that ships
> server logic (submission, admission, removal, agreement, catalogue gate) gets a colocated or
> `__tests__/` unit test, matching the Phase 23/25/28 route-test precedent.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _pending_ | — | — | — | — | — | — | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing jest infrastructure covers all phase requirements — no framework install needed. New route/lib
  tests are added per-plan alongside the code they cover (no separate Wave 0).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live DocuSeal blanket-agreement signing round-trip | agreement e-sign | Requires the live DocuSeal sandbox + webhook delivery (external) | Submit a song, sign the agreement via the embed, confirm the webhook advances the listing to pending-admit |
| Catalogue admission visibility | admission gate | Requires the public `/sync/catalog` render against real admitted data | Admit a song, confirm it appears in Browse the Catalogue and a withdrawn/removed one disappears |
