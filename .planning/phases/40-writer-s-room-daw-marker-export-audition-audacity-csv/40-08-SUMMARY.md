---
phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv
plan: 08
subsystem: ui
tags: [react, nextjs, client-component, docs, adobe-audition, tsv]

# Dependency graph
requires:
  - phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv (plan 03)
    provides: "renderAuditionMarkers / auditionTime / auditionDuration in lib/catalogue/take-export-audition.ts, byte-pinned and tested; npm run export:audition-sample --silent for byte-exact stdout"
  - phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv (plan 07)
    provides: "components/catalogue/TakeMarkerExport.tsx's FORMAT_OPTIONS array and __tests__/writer-room-take-marker-export-ui.test.ts's entry-count assertion, both deliberately written to move by one line/one number"
provides:
  - "docs/catalogue/AUDITION-MARKER-FORMAT.md — what is confirmed, what is INFERRED, and an eight-step byte-level procedure (with exact file/od/awk/cmp commands) that settles encoding, line endings, and the range Type literal against a real Audition export"
  - "A third FORMAT_OPTIONS entry ('audition') in components/catalogue/TakeMarkerExport.tsx — all three DAW-named options now offered per E-13"
  - "The UI doctrine test's format-count assertion moved from 2 to 3, with an E-12 comment naming the one-line revert as the documented fallback"
affects: [40-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A house-voice format-reference doc (docs/catalogue/AUDITION-MARKER-FORMAT.md) written for a reader with the real tool open and no memory of the phase, separating CONFIRMED evidence from INFERRED assumptions with the exact commands that convert one into the other"
    - "The npm run-banner gotcha (plan 40-03) documented prominently and ahead of the procedure steps that depend on clean stdout, not buried in a footnote"

key-files:
  created:
    - docs/catalogue/AUDITION-MARKER-FORMAT.md
  modified:
    - components/catalogue/TakeMarkerExport.tsx
    - __tests__/writer-room-take-marker-export-ui.test.ts

key-decisions:
  - "The doc's procedure section repeats the sample script's three marker times verbatim (0:09.000, 1:30.000, and a six-second range from 1:12.000) rather than sending the reader back to scripts/print-audition-sample.ts to find them — the person running the procedure has Audition open, not this repo, at the moment they need the numbers."
  - "The component's replacement comment was iteratively shortened (8 lines to 4 lines) to keep the diff under the plan's fewer-than-12-changed-lines acceptance bound while still naming E-13, the corroboration source, the doc path, and the E-12 fallback in one paragraph."
  - "No line in lib/catalogue/take-export-audition.ts was touched — the serializer, its INFERRED-tagged header comment, and its tests are unchanged by this plan, exactly as the plan's prohibition on speculative serializer changes requires."

patterns-established:
  - "A format-reference doc with a numbered, single-command-per-step verification procedure and an explicit 'if it fails' section naming the cheaper of two remediations first"

requirements-completed: [E-12, E-13]

coverage:
  - id: D1
    description: "docs/catalogue/AUDITION-MARKER-FORMAT.md exists, states the format plainly, names the three corroborating sources, marks the three INFERRED facts (encoding, line endings, range Type literal) with their consequences, and gives an eight-step procedure with exact file/od/awk/cmp commands and the npm --silent gotcha."
    requirement: "E-12"
    verification:
      - kind: other
        ref: "test -f docs/catalogue/AUDITION-MARKER-FORMAT.md && grep -c INFERRED (7) && grep -c export:audition-sample (4)"
        status: pass
      - kind: other
        ref: "npm run lint (--max-warnings=0, clean)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A third, DAW-named 'Audition' option is offered in components/catalogue/TakeMarkerExport.tsx's FORMAT_OPTIONS array; the replacement comment points at the new doc rather than restating it; the diff touches only the two files the plan names and stays under the 12-changed-line bound."
    requirement: "E-13"
    verification:
      - kind: other
        ref: "grep -c \"id: '\" components/catalogue/TakeMarkerExport.tsx (3) / git diff --stat (11 changed lines) / grep -c AUDITION-MARKER-FORMAT (1) / git diff --name-only (exactly the two <files> paths)"
        status: pass
      - kind: unit
        ref: "__tests__/writer-room-take-marker-export-ui.test.ts#the component source > offers exactly three format options"
        status: pass
    human_judgment: false
  - id: D3
    description: "The entry-count assertion in the UI doctrine test moved from 2 to 3 with an E-12 comment naming the fallback; the full quality gate (targeted test, typecheck:strict, lint, full suite, security:migrations:verify, npm audit at both levels) is green."
    requirement: "E-12"
    verification:
      - kind: unit
        ref: "npx jest --testPathPatterns=\"writer-room-take-marker-export-ui\" (10/10 pass)"
        status: pass
      - kind: other
        ref: "npm run typecheck:strict / npm run lint / npm test -- --runInBand (620 suites, 7539 tests) / npm run security:migrations:verify / npm audit --omit=dev --audit-level=moderate / npm audit --audit-level=high — all clean"
        status: pass
    human_judgment: false
  - id: D4
    description: "The eight-step byte-level procedure against a real Adobe Audition install — the release gate that decides whether the shipped Audition option is correct or must be reverted per E-12's fallback."
    verification: []
    human_judgment: true
    rationale: "No Audition instance exists in this environment. Per human_verify_mode: end-of-phase, this check runs at phase verification, not during this plan's execution — it is written into docs/catalogue/AUDITION-MARKER-FORMAT.md section 4 so it can be executed later, by someone else, without this session's context."

# Metrics
duration: ~25min
completed: 2026-09-16
status: complete
---

# Phase 40 Plan 08: Audition Format Documentation and the Third Export Option Summary

**`docs/catalogue/AUDITION-MARKER-FORMAT.md` (an eight-step byte-level verification procedure separating three corroborated facts from three INFERRED ones) plus a third, DAW-named 'Audition' entry in `TakeMarkerExport.tsx`'s format array — the serializer itself is untouched, and E-12's fallback to two formats is a one-line array revert and one test-number revert.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-16T01:58:00Z (approx, worktree session start)
- **Completed:** 2026-09-16T02:23:42Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- Wrote `docs/catalogue/AUDITION-MARKER-FORMAT.md` for a reader with Audition open and no memory of this phase: what Funūn writes (six tab-delimited columns despite the `.csv` extension, `M:SS.mmm` times, Duration-not-End for the third column), how three independent third-party sources corroborate it, and — named plainly, not implied — the three facts (encoding, line endings, the range marker's `Type` literal) that remain INFERRED rather than observed.
- The doc's Section 4 gives eight numbered steps, each with exactly one command or action: build three markers in Audition by hand, export, produce Funūn's bytes with `npm run export:audition-sample --silent` (the plan 40-03 npm-banner gotcha is called out prominently, ahead of the step that depends on it), then `file`, `od -c`, `awk -F'\t'`, and `cmp` the two files, then re-import and confirm the range marker's length. Section 5 names the two remediations in preference order — correct the serializer against real bytes, or delete one array entry and revert one test number.
- Added the third `FORMAT_OPTIONS` entry (`{ id: 'audition', label: 'Audition' }`) to `components/catalogue/TakeMarkerExport.tsx` and replaced the "deliberately absent" comment with what is now true: all three DAW-named options are offered, Audition's shape is third-party-corroborated rather than Adobe-published, and the doc plus E-12's one-line fallback are named directly rather than restated.
- Moved the UI doctrine test's format-count assertion from 2 to 3 with an inline E-12 comment, so the next person to change that number reads why it exists before touching it.
- Confirmed the export routes already dispatch on `'audition'` (plans 40-04/40-05) and that no line in `lib/catalogue/take-export-audition.ts` needed to change — the plan's prohibition against speculative serializer edits held with zero exceptions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write down what is known, what is inferred, and how to tell them apart** - `949b883b` (docs)
2. **Task 2: Offer Audition as its own named option** - `71253809` (feat)

_This plan runs in a wave-5 worktree and does not carry its own plan-metadata commit — the orchestrator updates STATE.md/ROADMAP.md after all wave agents complete, per this plan's parallel-execution instructions._

## Files Created/Modified

- `docs/catalogue/AUDITION-MARKER-FORMAT.md` - New reference document: what's written, how it's corroborated, what's INFERRED, the eight-step verification procedure, and the two ordered remediations if it fails.
- `components/catalogue/TakeMarkerExport.tsx` - Third `FORMAT_OPTIONS` entry (`audition`) plus a rewritten module comment pointing at the new doc; 11 total changed lines.
- `__tests__/writer-room-take-marker-export-ui.test.ts` - Format-count assertion moved from 2 to 3, with an E-12 comment.

## Decisions Made

- Repeated the sample script's exact marker times (`0:09.000`, `1:30.000`, a six-second range from `1:12.000`) directly in the doc's procedure rather than pointing the reader back to `scripts/print-audition-sample.ts` — whoever runs this procedure will have Audition open, not this repository.
- Iteratively shortened the component's replacement comment (an initial 8-line version, then 5, then 4) to keep `git diff --stat` under the plan's fewer-than-12-changed-lines bound while still naming E-13, the corroboration basis, the doc path, and the E-12 fallback.
- Left `lib/catalogue/take-export-audition.ts` completely untouched, including its `INFERRED` comment markers — this plan documents and exposes the existing serializer; it does not correct it, per the plan's explicit prohibition.

## Deviations from Plan

None — plan executed exactly as written. The component diff required two rounds of trimming the replacement comment to satisfy the diff-size acceptance criterion; this is normal drafting within Task 2's own action text, not a deviation from what the task asked for.

## Issues Encountered

None.

## User Setup Required

**The eight-step procedure in `docs/catalogue/AUDITION-MARKER-FORMAT.md` requires a human with Adobe Audition installed.** This is not a code deviation or a deferred task — it is the plan's own designed release gate (T-40-37 in the threat register), deliberately not automatable in this environment. Per `human_verify_mode: end-of-phase`, it runs at phase verification rather than during this plan's execution. Until it runs, the Audition option should be treated as shipped-to-a-branch-and-preview only, per the plan's `<verification>` section — `main` is protected and this reaches production only after the check (or E-12's fallback removal) happens.

## Next Phase Readiness

- The Audition option is structurally complete and gated behind documentation, exactly as E-12 and E-13 require: three named formats, one array entry and one test number standing between the current state and a two-format fallback.
- `docs/catalogue/AUDITION-MARKER-FORMAT.md` is ready to be executed by whoever performs the phase's end-of-phase human verification — no further context from this session is required to run it.
- If the procedure finds a mismatch, Section 5 of the doc names the two remediations in order: correct `lib/catalogue/take-export-audition.ts` against real bytes (informed by the diff, not guessed), or remove the one `FORMAT_OPTIONS` entry and revert the one test number. Both paths leave the serializer and its tests in the tree.
- No blockers for plan 40-09 or subsequent phase-verification work. This plan's own scope — the array entry, the test number, and the document — is fully addressed.

---
*Phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv*
*Completed: 2026-09-16*

## Self-Check: PASSED

- FOUND: `docs/catalogue/AUDITION-MARKER-FORMAT.md`
- FOUND: `components/catalogue/TakeMarkerExport.tsx`
- FOUND: `__tests__/writer-room-take-marker-export-ui.test.ts`
- FOUND: `.planning/phases/40-writer-s-room-daw-marker-export-audition-audacity-csv/40-08-SUMMARY.md`
- FOUND commits: `949b883b`, `71253809`
