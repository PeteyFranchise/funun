---
phase: 27-artist-invite-only-onboarding
plan: 05
subsystem: email
tags: [resend, email-templates, transactional-email, can-spam, html-escaping]

# Dependency graph
requires:
  - phase: 27-artist-invite-only-onboarding (27-02)
    provides: lib/email/esc.ts shared HTML-escape helper
provides:
  - artistInviteEmail() — founding-member invite template (A)
  - artistSpotOpenedEmail() — per-person waitlist conversion template (B)
  - artistReopenedEmail() — commercial reopen broadcast template (C), with mandatory unsubscribe link
affects: [27-08 (Team Console routes that send A/B/C), 27-11 (owner copy sign-off launch gate)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-template email module shape: { subject, html, text } consumed by lib/email/index.ts sendEmail()"
    - "Personal/transactional templates (A/B) omit unsubscribe; commercial broadcast template (C) mandates it in both html and text (D-19/CAN-SPAM)"

key-files:
  created:
    - lib/email/artistInvite.ts
    - lib/email/artistSpotOpened.ts
    - lib/email/artistReopened.ts
    - lib/email/artist-emails.test.ts
  modified: []

key-decisions:
  - "All three templates import esc() from lib/email/esc.ts (27-02) — no re-derived escaper, per RESEARCH 'Don't Hand-Roll'"
  - "Plain-text fallback interpolates raw (unescaped) values since HTML-escaping is meaningless outside an HTML context — esc() is applied only inside the html string"

patterns-established:
  - "Branded transactional email pattern: light bg (#FFFFFF), small dark-ink Funūn wordmark header, brand-gradient CTA (linear-gradient(105deg,#818CF8 0%,#D946EF 100%)), dual HTML+text body — the bar future branded emails in this codebase should match"

requirements-completed: [INVITE-10]

coverage:
  - id: D1
    description: "artistInviteEmail() — founding-member invite template (A): dual body, gradient CTA, conditional inviter-name line, esc()-escaped interpolation"
    requirement: "INVITE-10"
    verification:
      - kind: unit
        ref: "lib/email/artist-emails.test.ts#artistInviteEmail (template A)"
        status: pass
    human_judgment: false
  - id: D2
    description: "artistSpotOpenedEmail() — per-person waitlist conversion template (B): dual body, gradient CTA, no unsubscribe"
    requirement: "INVITE-10"
    verification:
      - kind: unit
        ref: "lib/email/artist-emails.test.ts#artistSpotOpenedEmail (template B)"
        status: pass
    human_judgment: false
  - id: D3
    description: "artistReopenedEmail() — commercial reopen broadcast template (C): dual body, gradient CTA, mandatory unsubscribe link in both html and text"
    requirement: "INVITE-10"
    verification:
      - kind: unit
        ref: "lib/email/artist-emails.test.ts#artistReopenedEmail (template C)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Final visual/copy sign-off for all three templates — owner sign-off is a launch gate tracked in 27-11, not resolved by this structural plan"
    verification: []
    human_judgment: true
    rationale: "27-CONTEXT D-17 and 27-UI-SPEC explicitly defer final copy/visual approval to an owner sign-off checkpoint tracked in 27-11; this plan ships the structural contract only"

duration: ~15min
completed: 2026-08-09
status: complete
---

# Phase 27 Plan 05: Branded Transactional Email Templates Summary

**Three branded Funūn transactional email templates (founding-member invite, per-person spot-opened, commercial reopen broadcast) with dual HTML+text bodies, brand-gradient CTAs, shared esc() escaping, and a D-19-correct transactional/commercial unsubscribe split.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-08-09T06:51:22Z
- **Tasks:** 2 completed
- **Files modified:** 4 (all new)

## Accomplishments
- `artistInviteEmail()` (template A) — founding-member invite, states who invited the recipient when known, no unsubscribe (transactional)
- `artistSpotOpenedEmail()` (template B) — per-person waitlist→invite conversion notice (D-13a), references the waiting list, no unsubscribe (transactional)
- `artistReopenedEmail()` (template C) — commercial reopen broadcast (D-13b/D-15), carries a mandatory unsubscribe link in both HTML and plain-text bodies (D-19/CAN-SPAM, T-27-12)
- All three: light (#FFFFFF) background, dark-ink Funūn wordmark header, brand-gradient CTA button (`linear-gradient(105deg,#818CF8 0%,#D946EF 100%)`), dual HTML+text bodies, and `esc()` (from 27-02's `lib/email/esc.ts`) applied to every interpolated user-supplied value
- `lib/email/artist-emails.test.ts` — 17 tests covering subject contracts, non-empty dual bodies, inviter-name presence/absence, HTML-escaping of untrusted values, gradient-CTA presence, and the unsubscribe-link presence/absence split across all three templates

## Task Commits

Each task was committed atomically:

1. **Task 1: artistInvite.ts — founding-member invite (template A) + spot-opened (template B)** - `439f833` (feat)
2. **Task 2: artistReopened.ts — reopen broadcast (template C) + tests** - `ce3d403` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `lib/email/artistInvite.ts` - `artistInviteEmail({ inviterName?, actionLink })` → `{ subject, html, text }` (template A)
- `lib/email/artistSpotOpened.ts` - `artistSpotOpenedEmail({ actionLink })` → `{ subject, html, text }` (template B)
- `lib/email/artistReopened.ts` - `artistReopenedEmail({ actionLink, unsubscribeLink })` → `{ subject, html, text }` (template C, mandatory unsubscribe)
- `lib/email/artist-emails.test.ts` - 17 tests: subject contracts, dual-body presence, inviter-name handling, esc() escaping, unsubscribe presence/absence split, gradient CTA

## Decisions Made
- Plain-text fallbacks interpolate raw (unescaped) values — `esc()` is an HTML-context escaper and is applied only inside each template's `html` string, matching the existing `industryInvite.ts`/`staffInvite.ts`/`esc.ts` convention (escaping plain text would incorrectly literal-ize `&`/`<`/`>`/`"` characters that need no escaping outside HTML).
- Task 1's plan-specified verify command (`npm test -- lib/email/artist-emails.test.ts`) targets a test file that Task 2 creates — this is expected plan sequencing (the shared test file covers all three templates together); Task 1 was verified via `tsc --noEmit` type-checking plus manual review, and the full suite was run and confirmed green immediately after Task 2 created the test file.

## Deviations from Plan

None - plan executed exactly as written. (See "Decisions Made" above for a note on verify-command sequencing across Task 1/Task 2, which is expected plan structure, not a deviation.)

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. (Copy/visual sign-off for these templates is a separate owner launch-gate checkpoint tracked in 27-11, not an environment/service setup item.)

## Next Phase Readiness
- All three templates are ready for 27-08 (Team Console routes) to import and call with real `actionLink`/`unsubscribeLink`/`inviterName` values.
- Final copy/visual sign-off remains outstanding per D-17 — tracked as a launch-gate checkpoint in 27-11, not resolved here.

---
*Phase: 27-artist-invite-only-onboarding*
*Completed: 2026-08-09*

## Self-Check: PASSED

All 4 created files verified present on disk; both task commits (439f833, ce3d403) verified in git log.
