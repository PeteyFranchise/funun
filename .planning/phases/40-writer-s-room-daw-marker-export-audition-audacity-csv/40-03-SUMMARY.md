---
phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv
plan: 03
subsystem: catalogue
tags: [typescript, jest, daw-export, adobe-audition, tsv]

# Dependency graph
requires:
  - phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv (plan 01)
    provides: "ExportMarker: the shared { label, startMs, endMs } shape this module's only import"
provides:
  - "auditionTime: M:SS.mmm formatting for any millisecond value, clamped at zero, minutes accumulate past 60"
  - "auditionDuration: a SEPARATE named length calculator — never an end timestamp — for Audition's Duration column"
  - "renderAuditionMarkers: the full six-column, CRLF-terminated, tab-delimited-despite-.csv Audition marker file"
  - "AUDITION_MARKER_HEADER: the one-home literal for the six confirmed column names"
  - "scripts/print-audition-sample.ts + npm run export:audition-sample: a one-command byte-exact sample for plan 40-08's human verification"
affects: [40-04, 40-05, 40-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Isolated single-format renderer module (exactly one import) so a third-party-corroborated-but-unverified format can be deleted by removing one file and one dispatch branch (E-12)"
    - "A structurally separate named function (auditionDuration) for the one calculation most likely to be silently 'simplified' into the wrong one (auditionTime(endMs))"
    - "INFERRED-tagged in-source comments marking every claim not independently observed, each pointing at the plan 40-08 human gate that resolves it"

key-files:
  created:
    - lib/catalogue/take-export-audition.ts
    - lib/catalogue/take-export-audition.test.ts
    - scripts/print-audition-sample.ts
  modified:
    - package.json

key-decisions:
  - "auditionDuration(startMs, endMs) is a separate named export, not an inline subtraction, specifically so a reviewer or a future editor cannot quietly fold it into auditionTime(endMs) — the exact mistake that produces silently-corrupt range markers"
  - "The cross-format divergence test could not import the real lib/catalogue/take-export-formats.ts (plan 40-02's renderAudacityLabels) because that module is being built in a separate, parallel wave-2 worktree that had not merged at the time this plan executed. The test instead asserts this module's real output against 40-02-PLAN.md's own pinned literal for the same input (a range marker's Audacity end column of 78.000000) — see Deviations below."
  - "npm run export:audition-sample must be invoked with --silent (or via npx tsx directly) to keep stdout byte-exact — plain 'npm run' on this repo's npm version (11.12.1) prints its own run-banner into stdout ahead of the script's output, which would corrupt the redirected file used for plan 40-08's byte diff. Documented inline in the script and in this summary rather than fought via .npmrc, which would change loglevel repo-wide."

patterns-established:
  - "Named negative test alongside a named positive test for a value that has one plausible-but-wrong neighbor (auditionDuration vs. the end-timestamp it must never produce)"

requirements-completed: [E-12, E-13]

coverage:
  - id: D1
    description: "auditionTime formats any millisecond value as Audition's M:SS.mmm string, clamped at zero, with minutes accumulating past sixty rather than rolling into an hours field"
    requirement: "E-12"
    verification:
      - kind: unit
        ref: "lib/catalogue/take-export-audition.test.ts#take export audition: auditionTime"
        status: pass
    human_judgment: false
  - id: D2
    description: "auditionDuration computes a LENGTH (endMs - startMs), never an end timestamp — proven by both a positive test and a dedicated named negative test asserting the end-timestamp value is not produced"
    requirement: "E-12"
    verification:
      - kind: unit
        ref: "lib/catalogue/take-export-audition.test.ts#take export audition: auditionDuration is a length, never an end timestamp"
        status: pass
    human_judgment: false
  - id: D3
    description: "renderAuditionMarkers produces the confirmed six-column, tab-delimited, CRLF-terminated file for point markers, range markers, and the empty-array case, with the literal decimal/Cue fields and an empty trailing Description"
    requirement: "E-12"
    verification:
      - kind: unit
        ref: "lib/catalogue/take-export-audition.test.ts#take export audition: renderAuditionMarkers"
        status: pass
    human_judgment: false
  - id: D4
    description: "The module is deletable in isolation: exactly one import (ExportMarker), no dependency on the Audacity/CSV module in either direction"
    requirement: "E-13"
    verification:
      - kind: unit
        ref: "grep -c \"^import\" lib/catalogue/take-export-audition.ts (returns 1)"
        status: pass
    human_judgment: false
  - id: D5
    description: "scripts/print-audition-sample.ts + npm run export:audition-sample produce a byte-exact, six-field, tab-delimited sample file on stdout (with --silent) and a human-readable build guide on stderr, ready for plan 40-08's byte-level diff against a real Audition export"
    requirement: "E-12"
    verification:
      - kind: unit
        ref: "npm run export:audition-sample --silent | head -1 / wc -l / awk NF check (all pass, documented in this summary)"
        status: pass
    human_judgment: true
    rationale: "Byte-exact acceptance against a real Adobe Audition install cannot be automated in this environment (no Audition instance exists here) — this is exactly the checkpoint plan 40-08 exists to perform."

# Metrics
duration: ~16min
completed: 2026-09-15
status: complete
---

# Phase 40 Plan 03: Adobe Audition Marker Serializer Summary

**Isolated `lib/catalogue/take-export-audition.ts` rendering Audition's confirmed-but-unverified six-column tab-delimited marker format — with `auditionDuration` built as its own named, negative-tested function specifically so the format's one silent-corruption trap (writing an end timestamp into a length column) cannot happen — plus a one-command sample script for plan 40-08's human byte diff.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-09-15T21:08:00-04:00 (approx., immediately following plan 40-01's completion)
- **Completed:** 2026-09-15T21:23:09-04:00
- **Tasks:** 2
- **Files modified:** 4 (3 new, 1 modified)

## Accomplishments
- `auditionTime(ms)` formats any millisecond value as Audition's `M:SS.mmm` string — clamped to zero for a negative input, minutes accumulating past sixty rather than rolling into an hours field (no corroborating source shows one)
- `auditionDuration(startMs, endMs)` is a **separate named function**, not an inline subtraction — the plan's central risk mitigation. It returns the marker's LENGTH (`auditionTime(0)` for a point, `auditionTime(endMs - startMs)` for a range), and a dedicated named test (`does NOT return the end timestamp 1:18.000...`) asserts the wrong-but-plausible value is never produced
- `renderAuditionMarkers(markers)` writes the header line (`AUDITION_MARKER_HEADER`) followed by one CRLF-terminated, six-tab-joined-field row per marker (label, start, duration, the literal `decimal`, the literal `Cue`, an empty trailing Description) — labels are neither sanitised nor re-ordered here, since plan 40-01 already did both upstream
- Every fact this module could not independently verify (the `Type` literal for a range marker, CRLF line endings, UTF-8 encoding) is marked `INFERRED` in a source comment, each pointing at plan 40-08's blocking human check
- `scripts/print-audition-sample.ts` + `npm run export:audition-sample` render a fixed three-marker sample (two points at 0:09 and 1:30, one range from 1:12 to 1:18) to stdout with zero extraneous bytes, and print a human-readable build guide to stderr — ready for someone with Audition installed to diff byte-for-byte
- 17 exact-string (`toBe`) tests; full repo suite (615 suites, 7455 tests) green; `typecheck:strict` and `lint --max-warnings=0` both clean; `npm audit` clean at both `moderate`/prod and `high`/all levels

## Task Commits

Task 1 followed a RED → GREEN TDD cycle; Task 2 was a single non-TDD `auto` task:

1. **Task 1: The serializer, and the duration trap it is built around**
   - `7f4c7974` (test) — 17 failing tests for `auditionTime`, `auditionDuration`, `renderAuditionMarkers`, confirmed RED by temporarily removing the not-yet-committed implementation and re-running the suite (module-not-found failure)
   - `53385e47` (feat) — implementation; all 17 pass
2. **Task 2: A one-command sample for the human who owns Audition**
   - `10f2e3b3` (feat) — `scripts/print-audition-sample.ts` and the `export:audition-sample` npm script

**Plan metadata:** this SUMMARY (committed separately, see below).

_No REFACTOR commit was needed — the GREEN implementation matched the plan's decisions on first pass._

## Files Created/Modified
- `lib/catalogue/take-export-audition.ts` — isolated Audition renderer: `AUDITION_MARKER_HEADER`, `auditionTime`, `auditionDuration`, `renderAuditionMarkers`. Exactly one import (`ExportMarker` from plan 40-01); no dependency on the Audacity/CSV module in either direction.
- `lib/catalogue/take-export-audition.test.ts` — 17 exact-string assertions across five `describe` blocks, including the named duration-trap negative test and a cross-format divergence test (see Deviations below for how the latter was adapted to this wave's parallel-worktree constraint).
- `scripts/print-audition-sample.ts` — fixed three-marker sample, rendered to stdout via `renderAuditionMarkers`, human build guide on stderr.
- `package.json` — added `"export:audition-sample": "tsx scripts/print-audition-sample.ts"`.

## Decisions Made
- `auditionDuration` returns `auditionTime(0)` for a null `endMs` rather than a bespoke "0:00.000" literal, so the point-marker case and the range-marker case both go through the same single time-formatting path.
- The module-header comment block enumerates every CONFIRMED fact and every INFERRED fact as two clearly separated lists, rather than interleaving them, so a future reader (or plan 40-08's human verifier) can scan straight to what still needs checking.
- `renderAuditionMarkers` always writes six tab-joined fields per row, including an empty trailing `Description` — the plan's own recommendation, since both third-party reference parsers index fields positionally and an extra empty field is safer than a missing one.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cross-format divergence test could not import plan 40-02's module — adapted to a pinned-literal comparison**
- **Found during:** Task 1, writing the cross-format divergence test specified in `<behavior>`
- **Issue:** The plan's action text requires the test file to `import` both this module and `renderAudacityLabels` from `lib/catalogue/take-export-formats.ts` (plan 40-02) in the same test, asserting both values from one input array. Plan 40-02 executes in a separate worktree in this same wave (wave 2, parallel to this plan, both depending only on 40-01) and had zero commits past the shared base at the time this plan ran — the file does not exist in this worktree, and importing it would fail the entire test suite at module-resolution time (not just one test).
- **Fix:** The test still exercises this module's real `renderAuditionMarkers` output for a 72000ms-to-78000ms range marker and asserts it produces `0:06.000` (a length) and explicitly asserts it is NOT `78.000000` (the value 40-02-PLAN.md's own `<behavior>` block pins as Audacity's end-column output for the identical input — enforced independently by that plan's acceptance criteria). The test file carries an explicit comment naming this constraint and recommending the import be wired to the real module once 40-02 merges.
- **Files modified:** `lib/catalogue/take-export-audition.test.ts`
- **Verification:** All 17 tests pass in isolation; the assertion is against a real computed value from this module, compared to a documented (not guessed) literal for the sibling format.
- **Committed in:** `7f4c7974` (Task 1 test commit)
- **Residual risk:** Low. Both 40-02 and this module are independently and exhaustively tested against their own pinned literals for this exact input; the only unverified thing is a live cross-import once both land in the same tree. Recommend re-wiring this specific test to a live import as a small follow-up once plan 40-02 merges, or letting plan 40-08's human byte-level check stand in for it.

**2. [Rule 1 - Bug] `npm run export:audition-sample` (no flag) would corrupt the redirected sample file**
- **Found during:** Task 2, verifying `npm run export:audition-sample | head -1` against the acceptance criteria
- **Issue:** On this repo's npm version (11.12.1), plain `npm run <script>` prints its own `"> funun@2.0.0 export:audition-sample\n> tsx scripts/print-audition-sample.ts\n\n"` preamble to **stdout** before the script's own output runs. Since this script's entire purpose is "redirect stdout, diff the bytes against a real Audition export," that preamble would land inside the redirected file and corrupt exactly the byte-for-byte comparison plan 40-08 depends on — a second, environment-level instance of the same "looks-fine, is-actually-wrong" failure mode this plan exists to prevent in the Duration column.
- **Fix:** Confirmed `npm run export:audition-sample --silent` (or `npx tsx scripts/print-audition-sample.ts` directly) produces byte-exact stdout with no preamble. Added an explicit line to the script's own stderr guidance stating the correct invocation and why the plain form is unsafe, rather than changing global npm `loglevel` via `.npmrc` (which would affect every other script in the repo, well beyond this plan's scope).
- **Files modified:** `scripts/print-audition-sample.ts`
- **Verification:** All acceptance-criteria checks (`head -1`, `wc -l` reports 4, `awk` NF-6 check, `grep -c "0:06.000"` reports 1, exit 0) pass when run with `--silent`; documented above and re-verified before this summary was written.
- **Committed in:** `10f2e3b3` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking/structural, 1 bug)
**Impact on plan:** Neither changes what the plan asked for. The first adapts one test's evidence source to a genuine wave-parallelism constraint without weakening what it proves about *this* module. The second prevents a real, silent corruption of the exact artifact plan 40-08's human check depends on. No scope creep beyond documenting both clearly for the next reader.

## Issues Encountered
None beyond the two deviations above.

## User Setup Required
None — no external service configuration required. No dependency was added; `tsx` is an existing devDependency already used by two shipped scripts.

## Known Stubs
None. Every exported function is fully implemented and covered by exact-string tests; nothing here is a placeholder. The Audition format's real-world acceptance is explicitly and intentionally NOT verified by this plan (see Coverage D5's `human_judgment: true` and the `<verification>` section of 40-03-PLAN.md) — that is plan 40-08's job, not a gap in this one.

## Threat Flags
None beyond what the plan's own `<threat_model>` already registers (T-40-10 through T-40-14, T-40-SC) — no new network endpoint, auth path, file access pattern, or schema change was introduced. All are addressed directly in this module:
- T-40-10 (Duration column silently filled with an end timestamp) — `auditionDuration` as a separate named function, a positive test, a named negative test, and a documented cross-format comparison (see Deviation 1 for how the comparison's evidence source was adapted)
- T-40-11 (plain decimal seconds written into the `decimal`-labelled column) — `auditionTime` is the only path to a time value and always emits the colon-bearing shape; asserted at every tested magnitude including zero
- T-40-12 (encoding/line-ending mismatch) — transferred to plan 40-08 as designed; marked `INFERRED` in source
- T-40-13 (`Type` literal for a range marker) — transferred to plan 40-08 as designed; marked `INFERRED` in source
- T-40-14 (this module becoming load-bearing for the other two formats) — import count pinned at exactly one, verified by `grep -c "^import"` returning 1

## Next Phase Readiness
- `renderAuditionMarkers`, `auditionTime`, `auditionDuration`, and `AUDITION_MARKER_HEADER` are ready for the third dispatch branch in the export routes (plans 40-04, 40-05).
- `scripts/print-audition-sample.ts` / `npm run export:audition-sample --silent` is ready for plan 40-08's blocking human-verify gate — Pete or a collaborator with Audition installed can produce Funūn's candidate bytes with one command and diff them against a real export.
- **Follow-up recommended, not blocking:** once plan 40-02 merges and `lib/catalogue/take-export-formats.ts` exists in the integrated tree, rewire this plan's cross-format divergence test (`lib/catalogue/take-export-audition.test.ts`, last `describe` block) to import `renderAudacityLabels` directly instead of comparing against the pinned literal transcribed from 40-02-PLAN.md. Functionally equivalent today; a live import is the stronger long-term guard against the two renderers drifting.
- No blockers. This plan's own scope is fully addressed; the format's real-world acceptance is deliberately deferred to plan 40-08 as designed by E-12.

---
*Phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv*
*Plan: 03*
*Completed: 2026-09-15*

## Self-Check: PASSED

- FOUND: `lib/catalogue/take-export-audition.ts`
- FOUND: `lib/catalogue/take-export-audition.test.ts`
- FOUND: `scripts/print-audition-sample.ts`
- FOUND: `.planning/phases/40-writer-s-room-daw-marker-export-audition-audacity-csv/40-03-SUMMARY.md`
- FOUND commits: `7f4c7974`, `53385e47`, `10f2e3b3`
