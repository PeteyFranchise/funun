---
phase: 261002-clp
plan: 01
subsystem: clipboard
tags: [react, nextjs, jest, drift-guard, ux-correctness]

requires: []
provides:
  - "lib/clipboard/attempt-copy.ts — attemptCopy()/resolveClipboard(), the one guarded path for any clipboard write under app/ or components/"
  - "A source-scanning drift guard (__tests__/clipboard-call-site-guard.test.ts) that fails CI on a new unguarded navigator.clipboard access"
  - "All 21 pre-existing clipboard call sites migrated onto the helper, each keeping its own failure UX"
affects: [clipboard, PitchPlug, ShareButton, SampleClear-letters, ExportPack, PublicPlaybackView, SelectsPlayer, SelectsBuilder, WorkRoster, IdeasInbox, ArtistInvitesAdmin, StaffAdmin, AuthHealthPanel, ProducerHandoffTimeline, ProducerInbox, QuickInviteModal, PartyPicker, CopyLyricMenu]

tech-stack:
  added: []
  patterns:
    - "Three-outcome clipboard attempt ('copied' | 'unavailable' | 'rejected') instead of a boolean or a throw — preserves per-site failure-mode distinctions that already existed at 5 of 21 sites."
    - "Source-scanning drift guard with comment-stripping classifier (dot-access + quoted-'in' patterns), zero allowlist, non-vacuity floor (>400 files)."

key-files:
  created:
    - lib/clipboard/attempt-copy.ts
    - lib/clipboard/attempt-copy.test.ts
    - __tests__/clipboard-call-site-guard.test.ts
  modified:
    - components/tools/PitchCard.tsx
    - components/tools/PitchPlugForm.tsx
    - components/profile/ShareButton.tsx
    - components/profile/ProfileMoreMenu.tsx
    - components/vault/ToolSidePanel.tsx
    - components/vault/ExportPackPanel.tsx
    - components/vault/PublicPlaybackView.tsx
    - components/selects-player/SelectsPlayer.tsx
    - components/admin/SelectsBuilder.tsx
    - components/admin/ArtistInvitesAdmin.tsx
    - components/admin/StaffAdmin.tsx
    - components/catalogue/WorkRoster.tsx
    - components/catalogue/ProducerInbox.tsx
    - components/catalogue/ProducerHandoffTimeline.tsx
    - components/catalogue/CopyLyricMenu.tsx
    - components/collaborators/QuickInviteModal.tsx
    - components/split-sheets/PartyPicker.tsx
    - components/playbook/AuthHealthPanel.tsx
    - components/ideas/IdeasInbox.tsx

key-decisions:
  - "Return shape is a 3-member union (ClipboardAttempt), not a boolean — collapsing 'no API here' vs 'write failed' would regress 5 sites that already distinguish them."
  - "Member named 'rejected', not 'refused' — per label-integrity-funun, a rejection doesn't establish a refusal cause."
  - "PitchCard's Copy & open SubmitHub no longer opens the tab on a non-'copied' outcome — a tab over an empty clipboard reads as success and strands the user on a third-party site."
  - "resolveClipboard(nav) takes the navigator as an argument so the helper unit-tests under testEnvironment: 'node' with no jsdom and no global mutation."
  - "Drift guard carries zero allowlist entries — the helper lives under lib/, outside the scanned app/+components/ tree, so nothing legitimate needs excluding."

requirements-completed: []

duration: 55min
completed: 2026-10-02
status: complete
---

# Quick Task 261002-clp: Guard every clipboard call site Summary

**Replaced 21 direct `navigator.clipboard` accesses across 18 files with one guarded `attemptCopy()` helper and a zero-allowlist source-scanning drift guard — closing PR #120's un-runnable manual click-test with a structural guarantee instead.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3/3 complete
- **Files modified:** 19 (3 created, 16 existing files touched — some files listed in the plan's `files_modified` were migrated as part of the broader set; the two actually-modified callers of `shareOrCopy` were `ShareButton.tsx` and `ProfileMoreMenu.tsx`)

## Accomplishments

- Built `lib/clipboard/attempt-copy.ts`: `resolveClipboard(nav)` (pure, navigator-as-argument) and `attemptCopy(text, writer?)` returning `'copied' | 'unavailable' | 'rejected'`, never throwing. 8 unit tests green, including the synchronous-throw case (a non-secure-origin TypeError must not escape).
- Built `__tests__/clipboard-call-site-guard.test.ts`: a comment-stripping, string-literal-aware source scanner over `app/` + `components/` with two match patterns (dot-access reaching a `clipboard` member, and the quoted `'clipboard' in navigator` feature check), word-boundary-safe against `event.clipboardData`. Zero allowlist. Committed RED at exactly 27 offender lines across 18 files, matching the plan's pre-verified count.
- Migrated all 21 real call sites onto `attemptCopy()`. Every site keeps its own failure UX (toast, inline message, label flip, or focus-and-select) and its identical success UX — only the failure path changed.
- Corrected two sites the task description had filed as "already handled": `SelectsPlayer.tsx:529` (toast fired unconditionally behind a swallowed `.catch()`) and `PitchPlugForm.tsx:30` (floating, uncaught promise before an unconditional `setCopied`).
- `PitchCard.tsx`'s "Copy & open SubmitHub" button now only opens the tab when the copy outcome is `'copied'`.
- `WorkRoster.tsx`'s comment claiming a "selection fallback" is now true in both directions: on a failed copy the readOnly input is focused directly, not just passively select-on-click.
- `StaffAdmin.tsx` gained a feature-detect arm so a non-secure-origin failure now shows a written message instead of the raw `Cannot read properties of undefined (reading 'writeText')` TypeError string.
- `CopyLyricMenu.tsx` adopted the helper while keeping its selectable-fallback behavior byte-identical (verified: its 5-test static-markup suite stayed green).
- Drift guard: 27 → 17 → 0 offenders across the three task commits. Final state: zero direct `navigator.clipboard` access anywhere under `app/` or `components/`.

## Task Commits

1. **Task 1: Build the helper, unit-test it, commit the drift guard RED** — `55da9b30` (test)
2. **Task 2: Migrate the ten sites whose failure behaviour is wrong today** — `c2f1d4cb` (fix)
3. **Task 3: Migrate the remaining eleven sites, green the guard** — `02d5d73e` (fix)

_Plan metadata (this SUMMARY + STATE.md) is committed separately by the orchestrator, not by this executor run._

## Files Created/Modified

- `lib/clipboard/attempt-copy.ts` — the guarded helper
- `lib/clipboard/attempt-copy.test.ts` — 8 unit tests
- `__tests__/clipboard-call-site-guard.test.ts` — the drift guard, 10 tests (7 classifier truth-table + 1 non-vacuity + 1 offender-list + 1 local-variable-after-resolution check)
- `components/tools/PitchCard.tsx` — CopyButton + new SubmitHubCopyButton (tab gated on 'copied')
- `components/tools/PitchPlugForm.tsx` — copyLink made async, LinkRow gained a `failed` prop
- `components/profile/ShareButton.tsx` — `shareOrCopy`'s third param widened from `onCopied` to `onOutcome: (ClipboardAttempt) => void`
- `components/profile/ProfileMoreMenu.tsx` — caller updated for the new outcome callback
- `components/vault/ToolSidePanel.tsx` — SampleClear letter CopyButton, failure label names the manual-select fallback
- `components/vault/ExportPackPanel.tsx` — signed-URL copyLink, async, failure state added
- `components/vault/PublicPlaybackView.tsx` — copyLink + shareTrack, each gained a failure state
- `components/selects-player/SelectsPlayer.tsx` — `share()` awaits the outcome before choosing the toast string
- `components/admin/SelectsBuilder.tsx` — `copyState` union extended with `'failed'`
- `components/admin/ArtistInvitesAdmin.tsx` — reused existing failure string for both outcomes
- `components/admin/StaffAdmin.tsx` — added missing feature-detect arm inside existing try/catch
- `components/catalogue/WorkRoster.tsx` — visible failure + input focus on fallback
- `components/catalogue/ProducerInbox.tsx` / `ProducerHandoffTimeline.tsx` — explicit feature-detect collapsed into `'unavailable'` arm, strings unchanged
- `components/catalogue/CopyLyricMenu.tsx` — selectable fallback preserved
- `components/collaborators/QuickInviteModal.tsx` / `components/split-sheets/PartyPicker.tsx` — identical mechanical adoption, strings unchanged
- `components/playbook/AuthHealthPanel.tsx` — mapped onto existing `copiedReference`/`copyFailed` state
- `components/ideas/IdeasInbox.tsx` — single-line surgical edit; copy failure now throws into the existing `run()` wrapper, surfaced via its existing visible `error` state

## Decisions Made

- Three-outcome return shape (`'copied' | 'unavailable' | 'rejected'`) over a boolean or a throw.
- `'rejected'`, not `'refused'` (label-integrity-funun: a rejection does not establish a refusal cause).
- `PitchCard:139` does not open the SubmitHub tab unless the copy outcome is `'copied'`.
- `resolveClipboard(nav)` takes the navigator as an argument for jsdom-free unit testing.
- The drift guard carries zero allowlist entries by construction (helper lives outside the scanned tree).

## Deviations from Plan

None — plan executed exactly as written. The two corrections to the originally-reported 23/14/9 split (StaffAdmin:875 already inside a try/catch with a missing-feature-detect defect; SelectsPlayer:529 and PitchPlugForm:30 misfiled as "already handled") were already identified and corrected in the plan's own `<verified_facts>` before this execution began, and this run implements the plan's corrected 21/8/5 classification.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary surface introduced. This is a pure client-side UX-correctness change; no server code touched.

## Verification Gate (full six steps, run against final tree)

1. `npm run security:migrations:verify` — PASS (migrations 214–218 unaffected, out of scope for this change)
2. `npm run typecheck:strict` — clean, 0 errors
3. `npm run lint` — clean, 0 warnings (`--max-warnings=0`)
4. `npm test -- --runInBand` — **640 suites / 7981 tests, all green**
5. `npm audit --omit=dev --audit-level=moderate` — 0 vulnerabilities
6. `npm audit --audit-level=high` — 0 vulnerabilities

Plus the plan's own verification:
- `npx jest __tests__/clipboard-call-site-guard.test.ts` — GREEN, 10/10, zero offenders, zero allowlist entries
- `npx jest lib/clipboard/attempt-copy.test.ts` — GREEN, 8/8, including the synchronous-throw case
- 5 pre-existing untracked `.planning/reviews/` + `.planning/todos/pending/` files confirmed still untracked after all three commits

## Self-Check: PASSED

- `lib/clipboard/attempt-copy.ts` — FOUND
- `lib/clipboard/attempt-copy.test.ts` — FOUND
- `__tests__/clipboard-call-site-guard.test.ts` — FOUND
- Commit `55da9b30` — FOUND in `git log --oneline`
- Commit `c2f1d4cb` — FOUND in `git log --oneline`
- Commit `02d5d73e` — FOUND in `git log --oneline`
- Guard offender count at final commit: 0 (confirmed by direct test run, not by claim)
- `git status --porcelain | grep -E '^\?\? \.planning/(reviews|todos)' | wc -l` → 5 (confirmed)
