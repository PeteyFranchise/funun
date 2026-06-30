---
phase: 5
slug: launchpad-checklist
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-30
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (no test runner detected in project) |
| **Config file** | none |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run build` (TypeScript compile + lint as proxy) |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Full manual smoke test of all 5 LAUNCH acceptance criteria
- **Before `/gsd-verify-work`:** All 5 LAUNCH success criteria verified in browser
- **Max feedback latency:** ~15 seconds (build) + manual spot-check

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | LAUNCH-01 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 05-01-02 | 01 | 1 | LAUNCH-01 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 05-02-01 | 02 | 1 | LAUNCH-02 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 05-02-02 | 02 | 1 | LAUNCH-02, LAUNCH-03 | T-05-01 | Artist can only read own progress rows (RLS enforced) | manual-smoke | Visit `/launchpad/{projectId}` as two users | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 2 | LAUNCH-03 | — | Unapproved tips never surfaced to artists | manual-smoke | Verify `tip_approved=false` items absent from TipPanel | ❌ W0 | ⬜ pending |
| 05-04-01 | 04 | 2 | LAUNCH-04 | T-05-01 | Completion persists per user per project (not shared) | manual-smoke | Check item, reload, verify state | ❌ W0 | ⬜ pending |
| 05-05-01 | 05 | 3 | LAUNCH-05 | T-05-02 | Admin CRUD gated by `is_admin` in app_metadata | manual-smoke | Attempt CRUD as non-admin; verify 403 | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No test framework exists in this project. All phase validation is manual smoke testing.

- [ ] Manual smoke checklist created for each LAUNCH requirement (see Manual-Only Verifications below)
- [ ] `npm run build` passes with zero TypeScript errors before each wave merge

*Wave 0 installs no test framework — manual verification is the established project pattern.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Artist sees per-project Launchpad room with week-grouped checklist | LAUNCH-01 | No test framework | Visit `/launchpad/{projectId}` as authenticated artist; verify sections visible |
| Internal tool items navigate in-app; external items open new tab | LAUNCH-02 | UI interaction | Click action CTA on one internal and one external item; verify behavior |
| Approved tips appear in TipPanel; unapproved do not surface | LAUNCH-03 | DB state dependency | Set `tip_approved=false` on an item; verify panel shows no tip body |
| Checkbox completion persists across page reload | LAUNCH-04 | Session persistence | Check an item; hard reload; verify checked state preserved |
| Admin can CRUD items at `/admin/checklist` with drag reorder | LAUNCH-05 | UI interaction + auth | Perform add/edit/delete/drag as admin; verify changes appear on artist page |
| Non-admin cannot access `/admin/*` routes or admin API endpoints | LAUNCH-05 | Auth boundary | Access `/admin/checklist` without `is_admin`; expect redirect or 403 |
| Artist cannot read/write another artist's progress | LAUNCH-04 | RLS enforcement | Verify RLS blocks cross-user progress reads in Supabase Studio |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s (build ~15s + manual spot-check)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
