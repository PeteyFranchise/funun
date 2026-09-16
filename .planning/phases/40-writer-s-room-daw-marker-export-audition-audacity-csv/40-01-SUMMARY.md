---
phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv
plan: 01
subsystem: catalogue
tags: [typescript, jest, csv-injection, filename-sanitization, writer-room]

# Dependency graph
requires:
  - phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor
    provides: "work_version_comments (end_timestamp_ms, needs_reposition, carried_from_version_id) and work_version_pins schema; presentVersionComments() upstream shape"
provides:
  - "ExportMarker: the shared { label, startMs, endMs } shape comments and pins both reduce to"
  - "sanitizeMarkerLabel: delimiter-safe, spreadsheet-injection-safe label normalisation, order-tested"
  - "commentToMarker / pinToMarker: two structurally separate mappers (E-03)"
  - "classifyCommentExport / classifyPinExport: five-way refusal classification with literal sentences (E-11)"
  - "skippedRepositionNote: the success-path skipped-count sentence (E-09)"
  - "exportFilename: E-06's fixed provenance-in-filename shape"
affects: [40-02, 40-03, 40-04, 40-07, 40-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure lib/ serializer module with zero I/O, exactly two imports, no Promise<> — precedent: lib/metadata/cwr.ts"
    - "Refusal-as-data: classification returns a tagged ExportClassification instead of throwing on an empty result"
    - "Control-character normalisation via charCode comparison instead of a regex control-character class, to avoid embedding raw control bytes in source"

key-files:
  created:
    - lib/catalogue/take-export.ts
    - lib/catalogue/take-export.test.ts
  modified: []

key-decisions:
  - "sanitizeMarkerLabel normalises whitespace/control-characters BEFORE checking for a leading formula character, proven by a dedicated ordering test (a leading tab followed by '=' cannot hide the formula character)"
  - "classifyCommentExport and classifyPinExport are two separate functions, not one classifier with a mode argument, per E-03's structural separation requirement"
  - "skippedRepositionCount is carried on the success path (refusalReason 'none'), not only on the all_repositioning refusal path, per E-09"
  - "exportFilename sanitises only the title segment; versionDisplay, kind and ext are codebase-generated and never user text"

patterns-established:
  - "Pattern 1 (shared marker shape, format-specific renderers): comments and pins both reduce to ExportMarker before any of plans 40-02/40-03's renderers see them"
  - "Pattern 2 (refusal is data): ExportClassification is a tagged result with a literal refusalMessage, never a thrown exception, for every one of the five ways an export can produce no markers"

requirements-completed: [E-01, E-04, E-06, E-07, E-08, E-09, E-11, E-14]

coverage:
  - id: D1
    description: "sanitizeMarkerLabel makes every label delimiter-safe and spreadsheet-injection-safe, with a proven normalise-before-formula-check ordering"
    requirement: "E-04"
    verification:
      - kind: unit
        ref: "lib/catalogue/take-export.test.ts#take export: marker shape and label sanitisation"
        status: pass
    human_judgment: false
  - id: D2
    description: "commentToMarker composes the author/carried-version/body label per E-07, E-08, E-14, with endMs represented as exactly null for a point comment"
    requirement: "E-07"
    verification:
      - kind: unit
        ref: "lib/catalogue/take-export.test.ts#take export: marker shape and label sanitisation"
        status: pass
    human_judgment: false
  - id: D3
    description: "pinToMarker renders the 'Pin {m:ss}' label per E-04, with endMs always null"
    requirement: "E-04"
    verification:
      - kind: unit
        ref: "lib/catalogue/take-export.test.ts#take export: marker shape and label sanitisation"
        status: pass
    human_judgment: false
  - id: D4
    description: "classifyCommentExport and classifyPinExport return one of five distinguishable refusal reasons with exact literal sentences, and carry skippedRepositionCount on the success path (E-09, E-11)"
    requirement: "E-11"
    verification:
      - kind: unit
        ref: "lib/catalogue/take-export.test.ts#take export: classification — what is excluded, and why"
        status: pass
    human_judgment: false
  - id: D5
    description: "skippedRepositionNote renders the singular/plural success-path sentence, null at zero"
    requirement: "E-09"
    verification:
      - kind: unit
        ref: "lib/catalogue/take-export.test.ts#take export: classification — what is excluded, and why"
        status: pass
    human_judgment: false
  - id: D6
    description: "exportFilename reproduces E-06's two literal filename examples exactly and safely sanitises a hostile title"
    requirement: "E-06"
    verification:
      - kind: unit
        ref: "lib/catalogue/take-export.test.ts#take export: filename provenance"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-09-15
status: complete
---

# Phase 40 Plan 01: DAW Marker Export — Pure Core Summary

**Pure `lib/catalogue/take-export.ts` module: comments and pins both reduce to one `ExportMarker` shape through a delimiter-safe, formula-injection-guarded label sanitiser, a five-way refusal classifier with literal sentences, and a locked-shape provenance filename builder — zero I/O, exactly two imports.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-15T20:58:00-04:00
- **Completed:** 2026-09-15T21:07:25-04:00
- **Tasks:** 3
- **Files modified:** 2 (both new)

## Accomplishments
- `sanitizeMarkerLabel` collapses every C0 control character and whitespace run to a single space, THEN applies the OWASP formula-injection apostrophe guard — the ordering is proven by a dedicated test showing a leading tab cannot hide a formula character from the check
- `commentToMarker` / `pinToMarker` reduce comments and pins to the shared `ExportMarker` shape through two structurally separate functions (E-03), carrying the carried-version bracket (E-08), the display-name-never-handle rule (E-07/E-14), and the `Pin {m:ss}` label (E-04)
- `classifyCommentExport` / `classifyPinExport` return one of five tagged refusal reasons (`no_comments`, `all_resolved`, `all_repositioning`, `no_pins`, `none`) with exact literal sentences (E-11), and carry `skippedRepositionCount` on the success path too (E-09)
- `exportFilename` reproduces E-06's `Midnight - v3 - comments.txt` example byte-for-byte, sanitising only the title segment against the Windows-reserved character set plus control characters, capping at 80 characters, and falling back to `Untitled`
- 42 exact-string (`toBe`) tests across three `describe` blocks; full repo suite (614 suites, 7438 tests) green; `typecheck:strict` and `lint --max-warnings=0` both clean

## Task Commits

Each task followed a RED → GREEN TDD cycle, committed atomically:

1. **Task 1: The marker shape and the sanitiser that makes a delimited file safe**
   - `834c3aeb` (test) — 14 failing tests for `sanitizeMarkerLabel`, `commentToMarker`, `pinToMarker`
   - `2564c19d` (feat) — implementation; all 14 pass
2. **Task 2: Classification — what is excluded, and the one sentence that says why**
   - `6afb136b` (test) — 16 additional failing tests (30 total) for `classifyCommentExport`, `classifyPinExport`, `skippedRepositionNote`
   - `fbd543b2` (feat) — implementation; all 30 pass
3. **Task 3: The filename that carries provenance and survives an HTTP header**
   - `7c4241ac` (test) — 12 additional failing tests (42 total) for `exportFilename`
   - `fd32db78` (feat) — implementation; all 42 pass

**Plan metadata:** committed separately as part of this SUMMARY (see below).

_No REFACTOR commits were needed — each GREEN implementation matched the plan's decisions on first pass._

## Files Created/Modified
- `lib/catalogue/take-export.ts` — pure, browser-safe serializer core: `ExportMarker`, `sanitizeMarkerLabel`, `commentToMarker`, `pinToMarker`, `ExportRefusalReason`, `ExportClassification`, `classifyCommentExport`, `classifyPinExport`, `skippedRepositionNote`, `exportFilename`. Exactly two imports (`formatTrackTimestamp`, catalogue types); zero `Promise<>` usage; no database, network, or filesystem access.
- `lib/catalogue/take-export.test.ts` — 42 exact-string assertions across three `describe` blocks, following `take-spans.test.ts`'s pure-function convention.

## Decisions Made
- Control-character normalisation is implemented as a `charCodeAt` comparison loop rather than a regex control-character class (`/[ -]/`). An earlier attempt to write the regex literal directly resulted in raw NUL/Unit-Separator bytes being embedded in the source file (a tool-escaping artifact, not a design choice) — the charCode approach is functionally identical, avoids any raw control bytes living in the `.ts` file, and is what shipped.
- `skippedRepositionNote`'s apostrophe-bearing sentences (`wasn't`, `weren't`) are written with double-quoted string literals, matching the existing convention in `lib/sync-library/readiness.ts` for user-facing strings containing an apostrophe.
- The `exportFilename` `kind` parameter is typed as the two-literal union `'comments' | 'my-pins'` inline on the function signature rather than exported as a separate named type, since no other module in this plan needs to reference it independently.

## Deviations from Plan

**1. [Rule 1 - Bug] Fixed a raw-control-byte regex introduced by a tool-escaping artifact**
- **Found during:** Task 1, immediately after first writing `take-export.ts`
- **Issue:** The intended regex `/[ -]/g` was written via the file-authoring tool with the ` `/`` escape sequences pre-decoded into literal raw NUL and Unit-Separator bytes before reaching disk, producing a source file with invisible raw control bytes embedded in a regex character class (functionally correct but fragile — `grep` without `-a` treated the file as binary, and the bytes were invisible/misleading under normal read tools).
- **Fix:** Rewrote the control-character check as an explicit `charCodeAt(i) <= 0x1f` comparison in a loop (`collapseControlCharsToSpace`), eliminating any raw control byte or ambiguous escape sequence from the source file entirely. Applied the same charCode-based approach in `sanitizeFilenameTitle`'s `isHostileFilenameChar` for consistency.
- **Files modified:** `lib/catalogue/take-export.ts`
- **Verification:** `file lib/catalogue/take-export.ts` reports "Unicode text, UTF-8 text" (previously ambiguous); all 42 tests pass; `typecheck:strict` and `lint` clean.
- **Committed in:** `2564c19d` (part of Task 1's feat commit — caught and fixed before that commit was made, not a separate follow-up commit)

---

**Total deviations:** 1 auto-fixed (1 bug, caught pre-commit)
**Impact on plan:** No scope creep — the fix produces the identical intended behavior (a C0 control character becomes a space) through a more robust implementation technique. No test assertions changed as a result.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None — no external service configuration required. This plan introduces no new dependency (confirmed by the plan's own Package Legitimacy Audit note carried from `40-RESEARCH.md`).

## Known Stubs
None. Every exported function is fully implemented and covered by exact-string tests; nothing here is a placeholder.

## Threat Flags
None beyond what the plan's own `<threat_model>` already registers (T-40-01 through T-40-05, T-40-SC) — no new network endpoint, auth path, file access pattern, or schema change was introduced by this plan. All five registered threats are mitigated directly in this module:
- T-40-01/T-40-02 (formula/tab/newline injection) — `sanitizeMarkerLabel`
- T-40-03 (filename header injection / path traversal) — `exportFilename`
- T-40-04 (reply/resolved leakage) — `classifyCommentExport`'s explicit root and resolved filters
- T-40-05 (I/O creep) — import count pinned at exactly 2, verified by acceptance-criteria grep

## Next Phase Readiness
- `lib/catalogue/take-export.ts` is ready to be imported by plans 40-02 (Audacity/CSV renderers) and 40-03 (Audition renderer) — they consume `ExportMarker` and nothing else, per the plan's key-link.
- `classifyCommentExport().refusalMessage` is ready for the comments export route (plan 40-04) to return verbatim in its refusal body.
- `skippedRepositionNote()` is ready for the export control (plan 40-07) to render on the success path.
- No blockers. The Audition format's own byte-level verification (E-12's human-in-the-loop gate) is out of this plan's scope and belongs to plan 40-03/40-08 as noted in the phase's `<verification>` section.

---
*Phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv*
*Plan: 01*
*Completed: 2026-09-15*
