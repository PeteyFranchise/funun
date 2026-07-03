---
phase: 07
slug: social-campaign-planner
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-02
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None detected in project (`package.json` has no test runner) |
| **Config file** | None |
| **Quick run command** | Manual verification only |
| **Full suite command** | `npm run build` (TypeScript compile + `next lint` as proxy) |
| **Estimated runtime** | ~30-60 seconds (build) |

No automated test infrastructure exists anywhere in this project (confirmed identically in Phase 5 and Phase 6's research). Nyquist validation for Phase 7 is manual/smoke verification against each requirement's acceptance criteria, same convention as Phases 5 and 6.

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Full manual smoke test of all 7 SOCIAL requirements touched by that wave
- **Before `/gsd-verify-work`:** All 7 SOCIAL acceptance criteria verified
- **Max feedback latency:** ~60 seconds (build time; no automated test suite to bound further)

---

## Per-Task Verification Map

Task IDs are assigned during planning (`07-XX-PLAN.md`). Until then, this table is keyed by requirement — the planner threads each row's Test Type/Command into the owning task's `<acceptance_criteria>` and updates the Task ID column.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | SOCIAL-01 | Slot/campaign PATCH re-verifies ownership (IDOR) | Artist toggles active platforms per project/campaign; selection persists and is editable anytime (D-01) | manual-smoke | In `/launchpad/{projectId}`, toggle platform checkboxes before/after generating a calendar, verify persistence and scoped regeneration of only the added platform's slots | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-02 | — | Genre-based nudge badges surfaced advisory-only; none pre-checked (D-09) | manual-smoke | Set a project/profile genre matching a `platform-nudges.ts` entry, verify badge text on the correct platform checkboxes; verify none are pre-selected | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-03 | Auth on generation endpoint; AI output validated before save (data-integrity) | One-click generates a 4-week, week/platform-structured calendar from release + collaborator data | manual-smoke | Click generate on a project with release data + ≥1 collaborator on file, verify calendar renders all 4 weeks with slots only for selected platforms; verify malformed/truncated AI JSON surfaces a clear regeneration error instead of a silently partial save | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-04 | — | Each slot shows caption/hook + content-type tag + suggested week | manual-smoke | Visually inspect generated slots for all three fields present and non-empty across multiple platforms/weeks | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-05 | Preview-then-accept never silently overwrites (D-10); standalone runs isolated from slot writes (D-11) | DropReady/SoundBait work both inline (slot) and standalone (tools view); standalone doesn't mutate slots unless explicitly saved | manual-smoke | Run standalone DropReady/SoundBait from Launchpad tools view, verify no calendar slot changes; use "Save to calendar" picker, verify target slot updates only after explicit confirm; run inline slot "Generate caption/hook", verify preview requires "Use this" click before the slot changes | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-06 | Slot PATCH ownership re-check (IDOR) | Checkbox completion persists per project; checkbox toggle independent of edit panel | manual-smoke | Check off a slot, reload page, verify checked state persists; verify checkbox click doesn't open the edit/preview panel (mirrors `ChecklistItem`'s `stopPropagation`) | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SOCIAL-07 | CSV formula-injection posture (accepted low-risk, see RESEARCH.md Security Domain) | CSV export downloads with correct 4 columns/format, content-type-aware Image URL, respects platform/week subset (D-18) | manual-smoke | Export a subset (one platform, two weeks), open the CSV, verify header casing (`Text`,`Image URL`,`Tags`,`Posting Time`), `Posting Time` format is `YYYY-MM-DD HH:mm` (no ISO `T`/`Z`), `Image URL` blank for non-image slot types, `Tags` = "platform, content type"; if a Buffer test account is available, attempt an actual bulk-upload with the exported file | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] No test framework needed — `npm run build` is the proxy gate (matches Phase 5/6 convention)
- [ ] Manual test checklist document to be created during Wave 0 of execution, listing the 7-requirement walkthrough above
- [ ] Before the CSV-export task is marked done, confirm the `Posting Time` formatter is exercised against at least one slot per platform (RESEARCH.md Pitfall 3 — Buffer silently ignores ISO 8601 timestamps)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Platform selection + scoped regeneration | SOCIAL-01 | No test framework in project | Toggle platforms in `/launchpad/{projectId}`, verify persistence; add a platform after a calendar exists, verify only that platform's slots regenerate and other slots (incl. manual edits) are untouched |
| Genre → platform nudge badges | SOCIAL-02 | No test framework in project | Set a genre with a known nudge-map entry, verify advisory badge appears on ranked platforms only, nothing pre-checked |
| AI calendar generation | SOCIAL-03 | No test framework; depends on live `ANTHROPIC_API_KEY` | Generate a calendar for a project with real release + collaborator data, verify 4 weeks populated across selected platforms only, verify graceful error (not partial save) on malformed AI JSON |
| Calendar slot content fields | SOCIAL-04 | No test framework in project | Inspect several slots across platforms for caption/hook + content-type tag + week |
| DropReady/SoundBait inline + standalone wiring | SOCIAL-05 | No test framework in project | Standalone run must not touch calendar; inline "Generate caption/hook" must require explicit "Use this" before the slot's caption changes; "Save to calendar" picker from a standalone run must target the correct platform/week/slot |
| Completion tracking | SOCIAL-06 | No test framework in project | Toggle a slot's checkbox, reload, verify persisted state; verify checkbox doesn't trigger the detail/edit panel |
| Buffer-compatible CSV export | SOCIAL-07 | No test framework; real Buffer import verification requires an external Buffer account | Export a platform/week subset, verify exact column headers/casing, `YYYY-MM-DD HH:mm` posting-time format, content-type-aware Image URL population, and platform+content-type Tags; cross-check against RESEARCH.md's "Buffer CSV Export Format" section |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
