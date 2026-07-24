---
phase: 20
slug: profile-table-rename-artist-profiles-to-user-profiles
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-24
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. This is a pure rename: the strongest automated signals are `tsc` (catches every missed `ArtistProfile` type reference) and the full Jest suite (exercises the renamed query paths). The two human-gated migration pushes + the deploy + smoke-test gate are the manual half.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (ts-jest) — existing suites |
| **Config file** | `jest.config.*` (existing) |
| **Quick run command** | `npx jest <changed test path>` |
| **Full suite command** | `npx jest && npx tsc --noEmit && npm run lint` |
| **Estimated runtime** | ~60–120s full suite |

---

## Sampling Rate

- **After every task commit:** `npx tsc --noEmit` (the rename's completeness check) + `npx jest <changed test path>`
- **After every plan wave:** full suite (`npx jest && npx tsc --noEmit && npm run lint`)
- **Before `/gsd-verify-work`:** full suite green + the human smoke-test gate (see Manual-Only)
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

*Populated with task IDs after the planner runs (nyquist audit fills from PLAN.md). Anchor coverage the plan must satisfy:*

| Area | Test Type | Expected automated check |
|------|-----------|--------------------------|
| No missed `from('artist_profiles')` in runtime code | grep assertion | Zero `artist_profiles` string refs under app/lib/components (excluding the compat-view migration + historical migrations + intentional 076/077) |
| No missed `ArtistProfile` type reference | `tsc --noEmit` | Clean after the type → `UserProfile` rename across the ~20 importers |
| Migration 076 correctness | migration read / test | `ALTER TABLE artist_profiles RENAME TO user_profiles`; `CREATE VIEW artist_profiles ... WITH (security_invoker = on)`; the 6 dependent functions `CREATE OR REPLACE`d; column-scoped grants re-issued on the view; `NOTIFY pgrst` |
| Compat view honors RLS (security, not owner-bypass) | migration assertion | The view is created `WITH (security_invoker = on)` — never owner-run |
| Migration 077 correctness | migration read | `DROP VIEW artist_profiles`; nothing else |
| Full suite unchanged post-rename | `npx jest` | 89 suites / 1109 tests still green (rename is behavior-preserving) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Grep-based assertion (test or CI check) that zero unexpected `artist_profiles` references remain in runtime code after the rename (the compat-view migration + historical migrations excepted)
- [ ] Existing Jest + `tsc` + lint infrastructure otherwise covers this phase (behavior-preserving rename)

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| Migration push #1 (076: rename + compat view) | Human-gated `supabase db push` | Pete pushes 076 via Codex; verify LOCAL=REMOTE; confirm `pgrst` reload; confirm the `artist_profiles` view exists WITH security_invoker and old (still-deployed) code keeps working |
| Deploy of the renamed code to production | Vercel deploy | Deploy `main` after 076; new code reads `user_profiles` |
| Smoke-test gate (full set — D-04) | Browser + live DB | After deploy, before push #2: signup on all 3 branches (artist / industry / curator), public profile (`/u/[handle]`, `/r/[projectId]`), a split sheet, a Settings rights save, a metadata/registration read; confirm no errors |
| Migration push #2 (077: drop the compat view) | Human-gated `supabase db push`, after a short soak | Pete pushes 077 once smoke tests pass and warm instances have drained; verify `artist_profiles` view is gone and the app still works |

---

## Validation Sign-Off

- [ ] Every task has `tsc`/jest automated verify or a Wave 0 dependency
- [ ] Zero unexpected `artist_profiles` runtime references (grep gate)
- [ ] The compat view is `security_invoker = on` with grants re-issued
- [ ] Full suite green pre-push
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
