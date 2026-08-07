---
phase: 19
slug: profile-identity-model-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-24
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (ts-jest) — existing suites (e.g. `lib/split-sheets/lifecycle.test.ts`, `live-identity.test.ts`) |
| **Config file** | `jest.config.*` (existing) |
| **Quick run command** | `npx jest <changed test path>` |
| **Full suite command** | `npx jest && npx tsc --noEmit && npm run lint` |
| **Estimated runtime** | ~60–120s full suite |

---

## Sampling Rate

- **After every task commit:** Run `npx jest <changed test path>`
- **After every plan wave:** Run the full suite (`npx jest && npx tsc --noEmit && npm run lint`)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

*Populated after the planner creates task IDs (nyquist audit fills this from PLAN.md). Anchor coverage the plan must satisfy:*

| Area | Requirement | Test Type | Expected automated check |
|------|-------------|-----------|--------------------------|
| Semantic-blank rescue (NULL / `''` / `{}`) | R1 | unit / migration-twin | Rescue over `{}`-address + `''`-PRO fixtures recovers stranded values; canonical-wins |
| Both DB readers re-pointed | R1 | integration | `claim_collaborators` + `backfill_claimed_collaborators` read `artist_profiles` |
| Pre-fill idempotency + no-overwrite | R2 | unit | Re-run never overwrites confirmed/edited/non-blank; most-recent conflict rule |
| Freeze-boundary regression (unchanged) | R3 | unit | Live for draft/pending_approval/approved/countered; frozen at esign_pending/executed |
| No non-owner party/term write | R4 | integration (negative) | RLS + route authorization rejects cross-user writes |
| Note on newly-generated PDF only | R5 | unit | Generated PDF contains the note; executed docs never regenerated |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] New/extended Jest tests for R1 semantic-blank rescue (twin of the migration logic), R2 pre-fill idempotency, R3 freeze-boundary regression, R4 authorization-negative
- [ ] Existing Jest + tsc + lint infrastructure otherwise covers phase requirements

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration push (rescue → re-point → drop) | R1 | Human-gated `supabase db push` (never run by executor) | Pete pushes via Codex; verify LOCAL=REMOTE via `supabase migration list` |
| Settings confirm-and-lock + flag UIs | R2 / R4 | Browser interaction | UAT: claim pre-fill confirm; Locker "this is wrong" flag → owner bell + email |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
