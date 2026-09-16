---
phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv
plan: 02
subsystem: catalogue
tags: [typescript, jest, csv, audacity, csv-injection, writer-room]

# Dependency graph
requires:
  - phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv
    provides: "ExportMarker shape, sanitizeMarkerLabel, commentToMarker/pinToMarker, classifyCommentExport/classifyPinExport, exportFilename (plan 40-01)"
provides:
  - "renderAudacityLabels: Audacity label-track (.txt, tab-delimited, 3 columns, no header) serializer"
  - "renderMarkerCsv: generic CSV serializer with a column-name header row and RFC4180 quoting"
  - "csvField: module-private RFC4180 quoting copy, proven equal to lib/metadata/export.ts's csvCell on quoting only"
  - "a pending todo recording the deliberate non-fix of csvCell's missing formula-injection guard"
affects: [40-04, 40-05, 40-07, 40-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Format-specific renderer module downstream of the shared ExportMarker shape (plan 40-01's Pattern 1) — this module decides HOW a marker is written, never WHAT it says"
    - "Deliberately duplicated (not shared) quoting helper between two CSV-adjacent exporters, proven equal by a test-only cross-import rather than a shared production dependency"

key-files:
  created:
    - lib/catalogue/take-export-formats.ts
    - lib/catalogue/take-export-formats.test.ts
    - .planning/todos/pending/2026-09-15-csv-cell-injection-guard-metadata-export.md
  modified: []

key-decisions:
  - "csvField is a copy of csvCell's RFC4180 quoting rule, not an import — the two exporters (creative notes vs. distributor-bound metadata) must be free to diverge, and the equivalence is enforced by a test-only import of csvCell rather than a shared production dependency"
  - "renderAudacityLabels and renderMarkerCsv import only ExportMarker and formatTrackTimestamp — no import from any Audition-format module, and no shared time-pair helper with it, because Audacity's second column is an end timestamp and Audition's is a duration"
  - "The Audacity renderer performs no re-sanitisation, re-filtering or re-ordering of markers — all three were already decided in plan 40-01, and re-deciding them here is exactly how the three formats would drift apart"
  - "The csvCell formula-injection gap is recorded as a pending todo and deliberately NOT fixed in this phase — lib/metadata/export.ts is untouched, confirmed by a clean git diff --stat"

patterns-established:
  - "Two structurally separate whole-file renderers (renderAudacityLabels, renderMarkerCsv) that both take only ExportMarker[] and return a string — no shared state, no shared time-formatting helper between formats with different second-column semantics"

requirements-completed: [E-13]

coverage:
  - id: D1
    description: "renderAudacityLabels produces a whole Audacity label-track file: start<TAB>end<TAB>label, six-decimal seconds, no header, point markers repeat start in the end column"
    requirement: "E-13"
    verification:
      - kind: unit
        ref: "lib/catalogue/take-export-formats.test.ts#renderAudacityLabels"
        status: pass
    human_judgment: false
  - id: D2
    description: "renderMarkerCsv produces a whole generic-CSV file: Start,End,Marker header, human-readable m:ss/h:mm:ss times, empty End cell for a point marker, RFC4180 quoting via csvField"
    requirement: "E-13"
    verification:
      - kind: unit
        ref: "lib/catalogue/take-export-formats.test.ts#renderMarkerCsv"
        status: pass
    human_judgment: false
  - id: D3
    description: "csvField and csvCell (lib/metadata/export.ts) agree on RFC4180 quoting across a 6-case table, proving the deliberate duplication has not drifted"
    verification:
      - kind: unit
        ref: "lib/catalogue/take-export-formats.test.ts#renderMarkerCsv > csvField agrees with csvCell on quoting"
        status: pass
    human_judgment: false
  - id: D4
    description: "Audacity import against a real audio file confirms label count, range in/out points, and point-marker placement — no Audacity import has been performed anywhere in this phase"
    verification: []
    human_judgment: true
    rationale: "The plan's own <verify><human-check> explicitly requires a real Audacity import, which this agent cannot perform. The format is pinned byte-for-byte against Audacity's own manual and confirmed by exact-string unit tests, but the actual import has not happened."

# Metrics
duration: ~6min (task-commit span; excludes context-reading time)
completed: 2026-09-15
status: complete
---

# Phase 40 Plan 02: DAW Marker Export — Audacity Label Track and Generic CSV Summary

**Two whole-file renderers — `renderAudacityLabels` (tab-delimited `.txt`, six-decimal-second end timestamps, point markers repeat start) and `renderMarkerCsv` (`Start,End,Marker` header, human-readable times, empty End for a point) — built on plan 40-01's `ExportMarker`, with `lib/metadata/export.ts` left byte-identical and its CSV-injection gap recorded as a pending todo instead of silently patched.**

## Performance

- **Duration:** ~6 min (first task commit to last; excludes upfront context-reading time)
- **Started:** 2026-09-15T21:15:39-04:00
- **Completed:** 2026-09-15T21:19:35-04:00
- **Tasks:** 2
- **Files modified:** 3 (all new)

## Accomplishments
- `renderAudacityLabels` renders `start<TAB>end<TAB>label` at six-decimal-second precision, exactly matching Audacity's own manual: a point marker repeats its start in the end column, 0ms renders `0.000000` (never bare `0` or scientific notation), 1ms survives as `0.001000`, and 3661500ms renders `3661.500000` — seconds throughout, never minutes past an hour
- `renderMarkerCsv` renders a `Start,End,Marker` header followed by one row per marker, times via the existing `formatTrackTimestamp` (`1:12`, `1:01:01` past an hour), an empty End cell for a point marker (a CSV has no structural reason to repeat the start the way Audacity does), and RFC4180 quoting via a module-private `csvField`
- `csvField` is a deliberate copy of `csvCell`'s quoting rule from `lib/metadata/export.ts`, not an import — proven equal to `csvCell` on quoting only via a 6-case equivalence table imported test-only, keeping the two exporters free to diverge in production while catching any accidental drift in CI
- The distributor-bound `lib/metadata/export.ts` was read but never edited — `git diff --stat -- lib/metadata/export.ts` is empty — and the CSV-injection gap found there during research is written down as a pending todo rather than silently patched inside an unrelated feature
- 23 exact-string (`toBe`) tests across two `describe` blocks; combined with plan 40-01's 42 tests, `take-export*` suites total 65 passing tests; full repo suite (615 suites, 7461 tests) green; `typecheck:strict`, `lint --max-warnings=0`, and `security:migrations:verify` all clean

## Task Commits

Each task followed a RED → GREEN TDD cycle, committed atomically:

1. **Task 1: The Audacity label track**
   - `7c6ff3d1` (test) — 9 failing tests for `renderAudacityLabels`
   - `db15aec6` (feat) — implementation; all 9 pass
2. **Task 2: The generic CSV, and an explicit decision about the shipped csvCell gap**
   - `878dc975` (test) — 14 additional failing tests (23 total) for `renderMarkerCsv` and the `csvField`/`csvCell` equivalence table
   - `c110ae08` (feat) — implementation, plus the pending todo recording the deliberate csvCell non-fix; all 23 pass

**Plan metadata:** committed separately as part of this SUMMARY (see below).

_No REFACTOR commits were needed — each GREEN implementation matched the plan's decisions on first pass, aside from one test-only fix caught before its GREEN commit (see Deviations)._

## Files Created/Modified
- `lib/catalogue/take-export-formats.ts` — pure, browser-safe renderer module: `renderAudacityLabels`, `renderMarkerCsv`, module-private `csvField`. Exactly two imports (`ExportMarker` type, `formatTrackTimestamp`); no import from or shared helper with any Audition-format module.
- `lib/catalogue/take-export-formats.test.ts` — 23 exact-string assertions across two `describe` blocks, including a 6-case `it.each` equivalence table cross-checking `csvField` against `csvCell`.
- `.planning/todos/pending/2026-09-15-csv-cell-injection-guard-metadata-export.md` — records the finding, the three-part decision not to fix it here, the residual risk, and the suggested fix for whoever picks it up.

## Decisions Made
- `csvField`'s RFC4180 quoting logic is byte-for-byte the same regex/replace pair as `csvCell`'s quoting half (`/[",\n]/` test, `"` doubling) — copied deliberately rather than imported, per the plan's explicit prohibition on sharing production code between the two exporters.
- The Audacity renderer's empty-array short-circuit (`if (markers.length === 0) return ''`) is a dedicated branch rather than relying on `.join('\n') + '\n'` naturally producing `''` for `[]` (it would actually produce `'\n'`, a lone blank line) — this is exactly the guard the plan's action section calls out as necessary.
- `renderMarkerCsv`'s header-plus-rows join (`[header, ...rows].join('\n') + '\n'`) was chosen over building the header as a separate concatenation, so the empty-array case (`[header].join('\n') + '\n'` → `'Start,End,Marker\n'`) falls out of the same code path as the populated case rather than needing its own branch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a test helper that broke on an embedded-newline label**
- **Found during:** Task 2, GREEN phase — one equivalence-table case (a label containing a literal newline) failed after implementing `renderMarkerCsv`
- **Issue:** The equivalence test extracted the rendered data row with `renderMarkerCsv(...).split('\n')`, which is correct for every other case but incorrectly split a row in half when the label itself contained a literal embedded newline inside its RFC4180-quoted field — a bug in the test's extraction logic, not in `renderMarkerCsv` or `csvField`.
- **Fix:** Replaced the `split('\n')` extraction with a slice by known header length and a known single trailing newline, which survives an embedded newline inside the quoted field.
- **Files modified:** `lib/catalogue/take-export-formats.test.ts`
- **Verification:** All 23 tests pass, including the previously-failing embedded-newline case; `typecheck:strict` and `lint` clean.
- **Committed in:** `c110ae08` (part of Task 2's feat commit — caught and fixed before that commit was made, not a separate follow-up commit)

---

**Total deviations:** 1 auto-fixed (1 test-only bug, caught pre-commit)
**Impact on plan:** No production code was affected — the fix corrects a test-extraction bug that would otherwise have produced a false failure against correct production output. No test assertions' expected values changed as a result, only the extraction method.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None — no external service configuration required. This plan introduces no new dependency.

## Known Stubs
None. Both exported renderers are fully implemented and covered by exact-string tests; nothing here is a placeholder. The plan's own `<verification>` section explicitly notes Audacity import itself has not been performed anywhere in this phase — that is a documented scope boundary (see coverage D4), not a stub.

## Threat Flags
None beyond what the plan's own `<threat_model>` already registers (T-40-06 through T-40-09, T-40-SC) — no new network endpoint, auth path, file access pattern, or schema change was introduced by this plan. All registered threats are addressed directly:
- T-40-06 (phantom column / forged label row) — `renderAudacityLabels` adds no escaping of its own by design; the acceptance criterion pinning every line to exactly two tab characters is covered by a dedicated test
- T-40-07 (csvField/csvCell drift) — the 6-case equivalence table
- T-40-08 (silently changing distributor-bound bytes) — deliberately not fixed; `lib/metadata/export.ts` untouched, verified by a clean `git diff --stat`, and recorded in the pending todo
- T-40-09 (provenance leaking into the file) — the CSV's header row is column names only; the Audacity renderer writes no header at all

## Next Phase Readiness
- `lib/catalogue/take-export-formats.ts` is ready for the export routes (plans 40-04, 40-05) to dispatch to by format.
- The pending todo at `.planning/todos/pending/2026-09-15-csv-cell-injection-guard-metadata-export.md` is ready for a future GSD discussion cycle to pick up independently of this phase.
- No blockers. Plan 40-03's Audition renderer remains fully independent — this plan imports nothing from it and shares no time-pair helper with it, satisfying the plan's own prohibition.
- Real-world Audacity import (the plan's `<human-check>`) has not been performed and is called out explicitly in coverage item D4 and the phase's own `<verification>` section as expected to happen at the phase's UAT gate, not as a blocker to this plan's completion.

---
*Phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv*
*Plan: 02*
*Completed: 2026-09-15*

## Self-Check: PASSED

- FOUND: `lib/catalogue/take-export-formats.ts`
- FOUND: `lib/catalogue/take-export-formats.test.ts`
- FOUND: `.planning/todos/pending/2026-09-15-csv-cell-injection-guard-metadata-export.md`
- FOUND commits: `7c6ff3d1`, `db15aec6`, `878dc975`, `c110ae08`
