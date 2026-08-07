---
phase: 18
slug: split-sheet-home
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-22
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> **Scope note:** this covers the identity/collaborator REPLAN only — the new
> identity-foundation plan plus the rewritten living-draft (18-01) and Locker
> (18-02) plans. 18-03 (attachment) and 18-04 (readiness) are NOT being
> replanned; their existing validation stands unchanged and is out of scope here.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x (ts-jest, transpile-only) |
| **Config file** | `jest.config.js` (root) |
| **Quick run command** | `npx jest lib/split-sheets/live-identity.test.ts lib/split-sheets/redistribute.test.ts lib/split-sheets/change-summary.test.ts lib/split-sheets/phase.test.ts lib/contracts/locker-attention.test.ts` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | ~60–90 seconds (full suite; baseline 64 suites / 684 tests) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

Task IDs below are indicative — the planner assigns final plan/task numbering.
The identity-foundation plan runs in wave 1; the rewritten living-draft plan
depends on it (wave 2); the rewritten Locker plan depends on both living-draft
and the untouched attachment plan (wave 3).

| Area | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| Migration 066 (collaborators.legal_name + status, artist_profiles.legal_name_locked_at) string-assert | foundation | 1 | HOME-02/03 (§2/§6) | T-schema | Additive columns; server-owned writes preserved; RLS/column-grant posture matches migration 040 | unit | `npx jest __tests__/migration-066.test.ts` | ❌ W0 | ⬜ pending |
| Live-identity resolver — overwrite pre-mint, frozen post-`esign_pending`, reads `artist_profiles` not `user_profiles` | foundation | 1 | HOME-03 (§1) | T-access-control | Resolver invoked server-side only; reads scoped by verified `collaborators.claimed_by`, never a client-supplied id | unit | `npx jest lib/split-sheets/live-identity.test.ts` | ❌ W0 | ⬜ pending |
| Settings legal-name confirm-and-lock (`legal_name_locked_at` set once) | foundation | 1 | HOME-02 (§2) | T-tampering | Lock write scoped to session user's own `artist_profiles` row | unit + manual | `npx jest` (route test) + manual Settings check | ❌ W0 | ⬜ pending |
| Fast-add party (email/phone only) saves; `name` placeholder satisfies NOT NULL; validation rejects neither-email-nor-phone | living-draft | 2 | HOME-03 (§4) | T-input-validation | Server allowlist (`sanitizeParty`/`sanitizeCollaborator`) gains no unvalidated field | unit + manual | `npx jest components/split-sheets` (new) | ❌ W0 | ⬜ pending |
| Auto-included party 1 on mount (create AND edit), legal name read-only, no remove control | living-draft | 2 | HOME-02/03 (§9) | — | N/A | unit + manual | `npx jest components/split-sheets` (new) | ❌ W0 | ⬜ pending |
| New separate fast picker; `CollaboratorPicker.tsx` unchanged → MetadataStudio ComposerEditor unaffected | living-draft | 2 | HOME-03 | T-tampering | Shared picker untouched by construction; regression is structural, not behavioral | manual | manual MetadataStudio composer-credit check | ❌ W0 | ⬜ pending |
| §7 recipient advanced-info on `/approve/[token]` flows through overwrite resolver | living-draft | 2 | HOME-04/05 | T-access-control | Recipient may correct only their own party row on the token they hold | unit + manual | `npx jest lib/split-sheets/phase.test.ts` + manual | ❌ W0 | ⬜ pending |
| Redistribute totals exactly 100.000 across 1–12 parties, both modes | living-draft | 2 | HOME-03 | — | N/A | unit | `npx jest lib/split-sheets/redistribute.test.ts` | ❌ W0 | ⬜ pending |
| Consensus reset: a live-identity-only update produces NO change record (P18-09) | living-draft | 2 | HOME-05 | T-repudiation | Diff runs on FROZEN `split_sheet_parties` values, not live-resolved values | unit | `npx jest lib/split-sheets/change-summary.test.ts` | ❌ W0 | ⬜ pending |
| Locker per-party 3-state (invited/opened/signed) derives from `approval_status` + `first_viewed_at` — zero new schema | locker | 3 | HOME-06 | — | N/A | unit | `npx jest lib/contracts/locker-attention.test.ts` | ❌ W0 | ⬜ pending |
| Locker draft-visibility, per-viewer soft hide, documented block exception | locker | 3 | HOME-07/08 | T-18-07/08/10 | Draft filtered to initiator in derivation; hide is per-caller non-destructive; block exception documented at query | unit | `npx jest __tests__/locker-hide-route.test.ts lib/contracts/locker-attention.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `__tests__/migration-066.test.ts` — string-assert the new identity migration (new)
- [ ] `lib/split-sheets/live-identity.test.ts` — new resolver module, no prior coverage
- [ ] `components/split-sheets/*` component test (or documented manual check) for the auto-seeded, read-only party-1 row — no `SplitSheetBuilder` test exists today
- [ ] `lib/split-sheets/change-summary.test.ts` — add the case: a live-identity-only update must NOT appear as a change/reset trigger (P18-09)
- [ ] `lib/contracts/locker-attention.test.ts` — add the case: 3-state per-party label from `approval_status` + `first_viewed_at`
- [ ] Regression guard (automated or documented manual) for `MetadataStudio`'s `ComposerEditor` picker — none exists today

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MetadataStudio composer-credit picker still works after the split-sheet picker split | HOME-03 | No automated test references `CollaboratorPicker`/`ComposerEditor`; the "separate widget" choice makes regression structurally unlikely but it must still be eyeballed | Open Metadata Studio for a track, add a composer credit via the picker, confirm the full identity form still appears and saves |
| First-time user can set and lock their legal name in Settings, then create a split sheet with party 1 read-only-populated | HOME-02 (§2) | Cross-surface flow (Settings → split-sheet builder) spanning a DB write and a read-time resolver | In Settings, confirm-and-lock legal name; open the split-sheet builder; confirm party 1 shows the locked legal name read-only with live PRO/IPI |
| A co-writer signing via the emailed link (no account) flips their roster status to confirmed | HOME-03 (§6) | The "either signup OR sheet-response, whichever first" trigger's response path can't be exercised without a real token round-trip | Quick-add a co-writer by email; have them approve via `/approve/[token]`; confirm their roster entry reads "confirmed" |
| DB push for migration 066 applied and verified | HOME-02/03 | Live schema push is human-gated per project convention (blocking checkpoint) | Apply migration 066 via Supabase CLI; confirm the 3 columns exist and no data was lost |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
