---
phase: 9
slug: rich-member-profile
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-12
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.4.2 + ts-jest 29.4.11 |
| **Config file** | `jest.config.js` (root) — `testEnvironment: 'node'`, `@/*` path mapping configured |
| **Quick run command** | `npx jest __tests__/<file>.test.ts` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | ~1 second (4 existing files today) |

**Gap:** `package.json` has no `"test"` script defined — every existing test file runs via a raw `npx jest` invocation. Existing tests are unit-level (pure function testing); there is no supertest/msw/API-mocking or Playwright/Cypress infrastructure in this project.

---

## Sampling Rate

- **After every task commit:** `npx jest __tests__/<relevant-file>.test.ts`
- **After every plan wave:** `npx jest` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green; human verification required for upload/playback/share flows (see Manual-Only below)
- **Max feedback latency:** ~1 second

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-0X-0X | TBD | TBD | PROFILE-02 | V5 | `roles` array validation accepts valid preset/custom shapes, rejects malformed ones | unit | `npx jest __tests__/profile-roles-validation.test.ts` | ❌ W0 | ⬜ pending |
| 09-0X-0X | TBD | TBD | PROFILE-04 | V5 | `open_to` filter rejects unknown enum strings | unit | `npx jest __tests__/profile-roles-validation.test.ts` | ❌ W0 | ⬜ pending |
| 09-0X-0X | TBD | TBD | PROFILE-05 | V4 | Featured-project pre-check rejects non-owned / non-public project IDs before hitting the DB trigger | unit | `npx jest __tests__/featured-project-validation.test.ts` | ❌ W0 | ⬜ pending |
| 09-0X-0X | TBD | TBD | PROFILE-06 | — | `buildProfileData()` correctly derives `placementsCount` and `avgReadiness` from fixture inputs | unit | `npx jest __tests__/profile-load.test.ts` | ❌ W0 | ⬜ pending |
| 09-0X-0X | TBD | TBD | D-13 | — | `readLyrics()` still parses legacy plain-text lyrics after the additive `synced` field is introduced | unit | `npx jest __tests__/schema-lyrics.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — plan/wave/task IDs finalized once the planner assigns them.*

---

## Wave 0 Requirements

- [ ] `__tests__/profile-roles-validation.test.ts` — covers PROFILE-02, PROFILE-04 (roles/open_to sanitize validation)
- [ ] `__tests__/featured-project-validation.test.ts` — covers PROFILE-05
- [ ] `__tests__/profile-load.test.ts` — covers PROFILE-06 (`buildProfileData()` extension)
- [ ] `__tests__/schema-lyrics.test.ts` — covers D-13 backward-compatibility
- [ ] Add `"test": "jest"` to `package.json` scripts

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Avatar/banner upload UX | PROFILE-09 | No browser/E2E runner (Playwright/Cypress) exists in this project | As the profile owner, upload a banner and avatar image, confirm preview + persisted URL render correctly on reload |
| Public player gating + audio playback | D-01, D-02 | Audio playback cannot be meaningfully unit-tested | Load `/r/[projectId]` for a public project as a signed-out visitor; confirm stream-only playback, no master/stems toggle, no metadata table |
| Share visibility toggle (native OS share sheet / clipboard fallback) | D-05, D-07 | Native OS share sheet cannot be triggered or asserted in a Jest/Node test environment | Toggle `allow_resharing` off/on as owner; confirm Share affordance appears/disappears for a visitor; trigger Share on a device with and without Web Share API support, confirm clipboard fallback + toast |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
