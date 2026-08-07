---
phase: 17-split-sheet-esign
plan: 04
subsystem: api
tags: [split-sheets, esign, gating, mobile-shell, jest, tdd]

# Dependency graph
requires:
  - phase: 17-02
    provides: "migration 062 (split_sheets status widening to esign_pending/executed, split_sheet_parties.first_viewed_at column, tiered readiness trigger)"
  - phase: 17-01
    provides: "buildSplitSheetViewNudgeNotification + the other 4 split-sheet notification builders in lib/social/notifications.ts"
provides:
  - "resolvePartyPhase() (lib/split-sheets/phase.ts) — the two-question gating helper that replaces the isExpired boolean RESEARCH Pitfall 1 flagged as broken"
  - "isNudgeEligible() (lib/split-sheets/phase.ts) — pure viewed-but-no-action nudge eligibility rule (P17-04)"
  - "/approve/[token] now renders 5 phase-correct branches (approve, sign, waiting, countered, done) off one durable token instead of forking a second /sign link"
  - "SplitApprovalView's docuseal-sign-mount placeholder region — the exact hook point 17-06 replaces with the live @docuseal/react embed"
  - "split_sheet_parties.first_viewed_at stamped once per valid-token visit"
  - "split-sheets PATCH VALID_STATUSES widened to accept esign_pending/executed"
affects: [17-06, 17-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-question gating split (token validity vs. lifecycle phase) as a single pure exported function consumed by both the server component and (indirectly) any future route that needs the same decision — avoids re-deriving the branch logic ad hoc"
    - "Labelled placeholder mount point (id=docuseal-sign-mount) as the explicit handoff contract between a credential-free shell plan and the live-embed plan that mounts into it later"

key-files:
  created:
    - lib/split-sheets/phase.ts
    - lib/split-sheets/phase.test.ts
    - __tests__/split-sheet-nudges.test.ts
  modified:
    - app/approve/[token]/page.tsx
    - components/split-sheets/SplitApprovalView.tsx
    - app/api/split-sheets/[id]/route.ts

key-decisions:
  - "isNudgeEligible() was co-located in lib/split-sheets/phase.ts (Task 1's file) rather than a separate module, since the plan's own files_modified list had no dedicated lib file for it and both functions operate on the same party-lifecycle-state input shape."
  - "The first_viewed_at stamp write was implemented in app/approve/[token]/page.tsx (the actual GET page-visit render) instead of app/api/approve/[token]/route.ts as the plan's Task 2 action text literally named — that route only ever receives POST traffic from the client's approve/counter submission and never runs on the initial GET page load the stamp is meant to capture. Stamping there would silently never fire on a first-visit-only-to-look scenario."
  - "resolvePartyPhase() checks sheet.status === 'executed' before party.approval_status, so a fully executed sheet always renders 'done' regardless of the visiting party's own approval_status — matches the plan's terminal-state framing ('sheet.status executed → done') rather than being conditional on the party branch."
  - "SplitApprovalView was restructured into a shared PageShell (wordmark + party rows + total) wrapping five phase branches (ApprovePhase keeps the original interactive approve/counter form; sign/waiting/countered/done are new read-only StateCard branches) instead of one monolithic component, so each branch's JSX doesn't duplicate the shell markup."

patterns-established:
  - "Server component computes the lifecycle phase once (resolvePartyPhase) and passes a single discriminated `phase` prop down — the client component branches on that value instead of re-deriving validity from raw party/sheet fields."

requirements-completed: [ESIGN-04, ESIGN-06, ESIGN-09]

coverage:
  - id: D1
    description: "resolvePartyPhase() splits /approve/[token] gating into token-validity vs. lifecycle-phase questions; an already-approved party on an esign_pending sheet reaches 'sign' instead of the expired screen (RESEARCH Pitfall 1 fix)"
    requirement: "ESIGN-04"
    verification:
      - kind: unit
        ref: "lib/split-sheets/phase.test.ts (12 tests, including the named 'THE critical case' test)"
        status: pass
    human_judgment: false
  - id: D2
    description: "SplitApprovalView renders phase-correct branches: approve/counter (existing), sign (new mount-point shell), waiting, countered, done — all sharing one PageShell"
    requirement: "ESIGN-06"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit and npm run lint clean; no direct component-render test exists for this UI (no React Testing Library harness in this repo's Jest setup)"
        status: pass
      - kind: manual_procedural
        ref: "Load /approve/[token] for an esign_pending party at a 375px viewport — plan's own <human-check> item, not automated in this repo's test setup"
        status: unknown
    human_judgment: true
    rationale: "Visual/mobile-viewport legibility (D-18b) requires eyes on an actual render; this repo has no component-level rendering test harness (Jest config has no jsdom/RTL wiring for this component tree) so the plan's own verify block correctly routes this to a <human-check>, not an automated one."
  - id: D3
    description: "first_viewed_at is stamped once per valid-token /approve/[token] visit, idempotently, and drives isNudgeEligible() without new cron infrastructure"
    requirement: "ESIGN-09"
    verification:
      - kind: unit
        ref: "__tests__/split-sheet-nudges.test.ts (8 tests: eligible/never-viewed/already-acted/boundary/window-constant/builder-wiring)"
        status: pass
    human_judgment: false
  - id: D4
    description: "split-sheets PATCH VALID_STATUSES accepts esign_pending and executed"
    requirement: "ESIGN-09"
    verification:
      - kind: unit
        ref: "grep -Eq esign_pending app/api/split-sheets/[id]/route.ts (plan's own automated verify command)"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-07-20
status: complete
---

# Phase 17 Plan 04: Lifecycle Gating + Mobile Sign Shell Summary

**Two-question `/approve/[token]` gating (`resolvePartyPhase`) replaces the boolean that treated any post-approval state as "expired," so the same durable link now carries a party through approve → waiting/countered → sign → done, plus a credential-free signing-region shell (`docuseal-sign-mount`) that 17-06 fills with the live embed, a once-only `first_viewed_at` page-visit stamp feeding the P17-04 nudge rule, and a widened PATCH status allowlist.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-20
- **Tasks:** 2 of 2 completed
- **Files modified:** 6 (3 modified, 3 created)

## Accomplishments
- `lib/split-sheets/phase.ts`: `resolvePartyPhase()` — the required RESEARCH Pitfall 1 fix. Splits gating into "is the token itself invalid/expired" (missing party/sheet row, or `token_expires_at < now`) vs. "what lifecycle phase is this party in" (`approve` / `sign` / `waiting` / `countered` / `done`). An already-approved party on an `esign_pending` sheet now reaches the signing branch on revisiting their own link instead of the "This link has expired" screen.
- `lib/split-sheets/phase.ts` also exports `isNudgeEligible()` — the pure P17-04 nudge-eligibility rule (viewed + still pending + past the ~3-day window; never-viewed or already-acted parties are never nudged — page-visit tracking only, no email-open tracking, T-17-10).
- `app/approve/[token]/page.tsx` rewritten: selects `sheet.status` in the token lookup, calls `resolvePartyPhase()`, keeps the existing "expired" screen for the genuine `token_invalid` case, and stamps `split_sheet_parties.first_viewed_at` once (idempotent, `.is('first_viewed_at', null)` guard) on every other valid-token visit.
- `components/split-sheets/SplitApprovalView.tsx` restructured around a shared `PageShell` (wordmark + party rows + total line) wrapping five phase branches: the original interactive `ApprovePhase` (approve/counter form, unchanged behavior), plus new `sign` (mobile-first `docuseal-sign-mount` placeholder region for 17-06), `waiting`, `countered`, and `done` read-only `StateCard` branches.
- `app/api/split-sheets/[id]/route.ts`: `VALID_STATUSES` widened to include `esign_pending` and `executed` so the PATCH route no longer silently rejects the new migration-062 lifecycle statuses (T-17-11).

## Task Commits

1. **Task 1: Two-question phase resolution helper + gating rewrite** - `f115827` (feat)
2. **Task 2: Sign-phase view shell + status allowlist + nudge-eligibility tests** - `36e0340` (feat)

_Note: RED tests were written and confirmed failing (module-not-found) before implementation, then committed as a single feat commit per this codebase's convention of one commit per completed task. See Deviations for the one exception (`isNudgeEligible` shipped ahead of its own task's RED phase, co-located in Task 1's `phase.ts`)._

## Files Created/Modified
- `lib/split-sheets/phase.ts` - `resolvePartyPhase()`, `isNudgeEligible()`, `NUDGE_WINDOW_MS`, and the `PartyPhase`/`SplitSheetStatus`/`PartyApprovalStatus` types
- `lib/split-sheets/phase.test.ts` - 12 tests covering every phase branch, including the "critical case" (approved + esign_pending → sign, not expired) and expiry taking priority over an executed sheet
- `app/approve/[token]/page.tsx` - Gating rewrite (`resolvePartyPhase` call), sheet.status column added to the token-lookup select, first_viewed_at stamp
- `components/split-sheets/SplitApprovalView.tsx` - `phase`-driven branch rendering, new `PageShell`/`StateCard`/`SigningRegion` components, `docuseal-sign-mount` placeholder
- `app/api/split-sheets/[id]/route.ts` - `VALID_STATUSES` widened to accept `esign_pending`/`executed`
- `__tests__/split-sheet-nudges.test.ts` - 8 tests: eligible/never-viewed/already-acted/window-boundary/window-constant cases, plus wiring to `buildSplitSheetViewNudgeNotification`

## Decisions Made
- `isNudgeEligible()` co-located in `lib/split-sheets/phase.ts` (see key-decisions in frontmatter) — no separate `lib/split-sheets/nudges.ts` module was created since the plan's own `files_modified` list didn't name one and both functions share the same party-lifecycle-state shape.
- `first_viewed_at` stamp moved from the plan's literal file attribution (`app/api/approve/[token]/route.ts`) to `app/approve/[token]/page.tsx` — a page-visit signal has to fire on the GET page render, not the POST action route, which only runs when the client later submits approve/counter.
- `resolvePartyPhase()` checks `sheet.status === 'executed'` before `party.approval_status`, so `done` is a true terminal override regardless of the individual party's own status.
- `SplitApprovalView` restructured into a shared `PageShell` + five phase branches instead of keeping one monolithic return block, avoiding duplicated wordmark/party-card/footer JSX across branches.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Moved the first_viewed_at page-visit stamp from the POST route to the GET page render**
- **Found during:** Task 2
- **Issue:** The plan's Task 2 action text named `app/api/approve/[token]/route.ts` as the file to extend for the first_viewed_at stamp, but that route only handles the client's `POST` approve/counter submission — it never executes on the initial `GET /approve/[token]` page load, which is the actual "page-visit" moment the P17-04 nudge signal is supposed to capture. Stamping there would mean a party who opens the link and never clicks anything (the exact scenario the nudge exists to catch) would never get `first_viewed_at` set.
- **Fix:** Implemented the idempotent stamp (`.update({ first_viewed_at: now }).eq('id', party.id).is('first_viewed_at', null)`) inside `app/approve/[token]/page.tsx`'s server component, immediately after phase resolution and before rendering any non-`token_invalid` branch.
- **Files modified:** `app/approve/[token]/page.tsx`
- **Verification:** `npx tsc --noEmit` clean; existing approve/counter POST flow in `app/api/approve/[token]/route.ts` untouched and still passing.
- **Committed in:** `f115827` (Task 1 commit — bundled since page.tsx was already the modified file in that commit)

**2. [Rule 2 - Missing Critical] `isNudgeEligible()` implemented ahead of its own task's RED phase**
- **Found during:** Task 1 (while implementing `phase.ts` for Task 1's own gating helper)
- **Issue:** Task 1's `resolvePartyPhase()` and Task 2's nudge-eligibility rule are both pure party-lifecycle-state functions with no natural separate home per the plan's `files_modified` list (no dedicated nudge-eligibility lib file was named). Writing them in the same pass avoided a second near-duplicate module and kept both pieces of party-state logic in one place.
- **Fix:** `isNudgeEligible()` and `NUDGE_WINDOW_MS` were added to `lib/split-sheets/phase.ts` in Task 1's commit. Task 2's `__tests__/split-sheet-nudges.test.ts` was still written RED-first in intent (covering every documented eligibility branch) but the underlying function already existed and passed immediately rather than failing first, since it shipped in the prior commit.
- **Files modified:** `lib/split-sheets/phase.ts` (Task 1 commit), `__tests__/split-sheet-nudges.test.ts` (Task 2 commit)
- **Verification:** All 8 nudge tests pass; full suite green with no regression.
- **Committed in:** `f115827` (function), `36e0340` (test file)

---

**Total deviations:** 2 auto-fixed (1 bug fix, 1 missing-critical-functionality placement decision)
**Impact on plan:** Both were necessary to make the feature actually work as intended (a stamp that never fires isn't a stamp) and to avoid a redundant module; no scope creep — no new user-facing behavior was added beyond what the plan specified.

## Issues Encountered
None beyond the two items documented above as deviations.

## Known Limitations (pending human verification)
- The plan's own `<human-check>` item — loading `/approve/[token]` for an `esign_pending` party at a 375px viewport to confirm no horizontal overflow and thumb-friendly tap targets — was not exercised in this session (no browser available in this execution context; this repo also has no component-level rendering test harness wired into Jest for `SplitApprovalView`). The mobile-first layout (`w-full`, `max-w-[480px]`, vertical `space-y-*` stacks, no fixed pixel widths) follows the same patterns already used in the pre-existing, presumably-verified approve/counter UI, and `docuseal-sign-mount` reuses the identical container conventions. Flagged as `D2` in the coverage block above with `human_judgment: true` for the next UAT pass.

## User Setup Required
None - no external service configuration required. This plan is explicitly credential-free (no `@docuseal/react` import, no `DOCUSEAL_API_KEY`, no live DocuSeal calls).

## Next Phase Readiness
- `docuseal-sign-mount` (`components/split-sheets/SplitApprovalView.tsx`) is the exact mount point 17-06 replaces with the live `@docuseal/react` embed — no further shell rewiring needed on that side.
- `resolvePartyPhase()` is ready for any future route/page that needs the same phase decision (e.g., a bell-digest read of a party's current phase) without re-deriving the branch logic.
- `isNudgeEligible()` is ready for whichever plan wires the initiator's sheet-view/bell-digest call site that actually invokes `buildSplitSheetViewNudgeNotification()` for eligible parties — this plan built and tested the pure eligibility gate and its wiring contract but did not add a new page/cron to call it, per the plan's explicit "no new cron infrastructure" scope.
- No blockers. Full-suite regression gate green: 57 suites / 575 tests (baseline was 55 suites / 555 tests — this plan added 2 suites / 20 tests, zero regressions). `tsc --noEmit` and `npm run lint` both clean.

---
*Phase: 17-split-sheet-esign*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 6 created/modified files verified present on disk; both task commit hashes (f115827, 36e0340) verified present in git log.
