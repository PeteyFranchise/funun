---
phase: 06
slug: playlist-curator-pitching
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-01
---

# Phase 06 — Validation Strategy

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

No automated test infrastructure exists anywhere in this project (confirmed identically in Phase 5's research). Nyquist validation for Phase 6 is manual/smoke verification against each requirement's acceptance criteria, same convention as Phase 5.

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Full manual smoke test of all 8 PITCH requirements touched by that wave
- **Before `/gsd-verify-work`:** All 8 PITCH acceptance criteria verified
- **Max feedback latency:** ~60 seconds (build time; no automated test suite to bound further)

---

## Per-Task Verification Map

Task IDs are assigned during planning (`06-XX-PLAN.md`). Until then, this table is keyed by requirement — the planner threads each row's Test Type/Command into the owning task's `<acceptance_criteria>` and updates the Task ID column.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | PITCH-01 | — | Directory browses/filters by genre + platform; each card shows genre focus + 90-day response rate | manual-smoke | Visit `/curators`, toggle filters, verify list updates | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PITCH-02 | Server-side re-validation of 150-word/note gate | Composer enforces 150-word limit + non-empty note before Send activates; sent email contains player link + unsubscribe | manual-smoke | Compose a pitch in `/launchpad/{projectId}`, verify Send stays disabled under either gate, verify email content post-send (or via Resend dry-run/log if domain not yet live) | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PITCH-03 | DB unique constraint (curator_id, track_id) | Pitch history recorded per project; duplicate curator+track send blocked | manual-smoke | Send a pitch, attempt to re-select the same curator+track, verify UI disables it and API rejects it | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PITCH-04 | — | Response rate = (accepted+declined)/total, last 90 days, shown per curator | manual-smoke | Seed a few `pitch_history` rows with varied `status`/`sent_at`, verify displayed percentage | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PITCH-05 | 256-bit token, one-time-use, 72h expiry | Curator claim link creates account; explicit-click only; 72h expiry; one-time use | manual-smoke | Trigger a claim email (or manually generate a token), click, verify account creation; re-click same link, verify rejection | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PITCH-06 | Svix signature verification; CRON_SECRET auth | Hard bounce → `email_valid=false`; genre-focus edit past threshold → drift flag | manual-smoke | POST a manually-signed test payload to `/api/webhooks/resend` (svix test-signing helper), verify DB update; edit a curator's genre tags in admin, verify drift badge appears | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PITCH-07 | `verifyAdmin()` independent re-check | Admin can add/edit/flag-inactive/review-claimed | manual-smoke | Full CRUD walkthrough at `/admin/curators` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PITCH-08 | — | "Playlist Curator" appears as an industry role option | manual-smoke | Visit Settings, confirm the option renders and saves | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] No test framework needed — `npm run build` is the proxy gate (matches Phase 5 convention)
- [ ] A manually-signed svix test payload (or use of Svix's local test-signing helper) should be prepared before implementing `/api/webhooks/resend`, since a live hard bounce cannot be triggered until `pitch.funun.studio` warmup completes (RESEARCH.md Pitfall 4)
- [ ] Manual test checklist document to be created during Wave 0 of execution, listing the 8-requirement walkthrough above

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Curator directory browse/filter | PITCH-01 | No test framework in project | Visit `/curators`, toggle genre/platform filters, verify list updates and response-rate column renders |
| Pitch composer gating + send | PITCH-02 | No test framework; live send depends on unconfigured `pitch.funun.studio` domain | Compose pitch, verify Send disabled under 150-word/empty-note gates; verify graceful no-op or successful send depending on env config |
| Duplicate-send guard | PITCH-03 | No test framework in project | Re-select an already-pitched curator+track pair, verify UI disables option and API rejects direct POST |
| Response rate calculation | PITCH-04 | No test framework in project | Seed varied `pitch_history` rows, verify displayed percentage matches (accepted+declined)/total over last 90 days |
| Curator claim flow | PITCH-05 | No test framework; requires token generation + email flow | Generate/trigger a claim token, click through account creation, confirm re-use of the same link is rejected |
| Bounce webhook + genre drift | PITCH-06 | No test framework; live bounce not triggerable until domain warmup completes | Send manually-signed svix test payload to `/api/webhooks/resend`, verify `email_valid` flips; edit genre tags past threshold, verify drift badge |
| Admin curator CRUD | PITCH-07 | No test framework in project | Full add/edit/flag-inactive/claim-review walkthrough at `/admin/curators` |
| Industry role addition | PITCH-08 | No test framework in project | Visit Settings, confirm "Playlist Curator" option renders and persists on save |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
