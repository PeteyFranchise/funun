---
phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig
plan: 02
subsystem: lyrics-pad-logic
tags: [pure-functions, jest, tdd, catalogue, lyrics, versions]

# Dependency graph
requires: []
provides:
  - "lib/catalogue/blocks.ts — BLOCK_TYPE_LABELS/VALUES, deriveBlockNumerals(), resolveRepeat(), planDetach(), serializeLyrics(), splitPastedLyric()"
  - "lib/catalogue/versions.ts — deriveVersionNumerals(), latestVersion(), presentVersion()"
affects: [37-04-types-catalogue, 37-07-blocks-api, 37-08-lyrics-pad-ui, 37-10-diary-feed, 37-12-versions-column]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure lib/catalogue/*.ts modules with no I/O, mirroring lib/split-sheets/approval.ts — structural row types declared locally, no shared-types import, so wave-1 plans have zero sibling dependency"
    - "Numeral-by-derivation, never stored: both block section numerals and version vN are computed at read time from position/created_at, never persisted as a column"

key-files:
  created:
    - lib/catalogue/blocks.ts
    - lib/catalogue/blocks.test.ts
    - lib/catalogue/versions.ts
    - lib/catalogue/versions.test.ts
  modified: []

key-decisions:
  - "planDetach() returns { patch, source } rather than mutating in place — 'patch' is the exact field set the detach route should write (text, repeat_of_block_id: null, author_kind: 'human', author_user_id), 'source' is the untouched source row, per the plan's shape requirement for plan 07's detach branch."
  - "resolveRepeat() cycle guard seeds the visited set with the walking block's own id before following the first hop, so a direct self-link (A -> A) is caught on its first lookup instead of requiring a second iteration — verified by a dedicated self-cycle test."
  - "matchSectionHeader() peels bracket/colon/trailing-numeral decorations in a loop until the string stops changing, rather than a fixed strip order — needed because '[Hook]:' combines a bracket and a colon and a single-pass strip (bracket-then-colon) misses it when the bracket isn't the very last character."

requirements-completed: [S-04, S-01, S-02]

coverage:
  - id: D1
    description: "deriveBlockNumerals() derives section numerals from position among same-type siblings, never storage — lone types get no numeral, custom types never number, reorder and delete both renumber correctly"
    requirement: S-04
    verification:
      - kind: unit
        ref: "lib/catalogue/blocks.test.ts#deriveBlockNumerals — RENUMBERING RULE"
        status: pass
    human_judgment: false
  - id: D2
    description: "resolveRepeat() and planDetach() implement the linked-repeat/copy-on-write-detach semantics — repeat resolves source text+author, chains resolve through to the origin, cycles and dangling links never throw"
    requirement: S-04
    verification:
      - kind: unit
        ref: "lib/catalogue/blocks.test.ts#resolveRepeat / planDetach — REPEAT RULE"
        status: pass
    human_judgment: false
  - id: D3
    description: "serializeLyrics() produces tagged and plain 'Copy full lyric' exports, both expanding linked repeats to full text, with no tool name anywhere in the output"
    requirement: S-04
    verification:
      - kind: unit
        ref: "lib/catalogue/blocks.test.ts#serializeLyrics — \"Copy full lyric\" (S-04)"
        status: pass
    human_judgment: false
  - id: D4
    description: "splitPastedLyric() splits a pasted full lyric on blank lines into draft blocks, adopting a recognized section header (bracket/colon/numeral/case tolerant) and defaulting the rest to verse"
    requirement: S-04
    verification:
      - kind: unit
        ref: "lib/catalogue/blocks.test.ts#splitPastedLyric — paste auto-split"
        status: pass
    human_judgment: false
  - id: D5
    description: "deriveVersionNumerals()/latestVersion()/presentVersion() derive vN by creation order (never stored), tiebreak deterministically on id, and present a numeral+label-or-source-description pair"
    requirement: S-01
    verification:
      - kind: unit
        ref: "lib/catalogue/versions.test.ts"
        status: pass
    human_judgment: false

# Metrics
duration: ~25min
completed: 2026-08-30
status: complete
---

# Phase 37 Plan 02: Lyrics-pad pure logic Summary

**Two pure lib/catalogue modules — block section numerals, linked-repeat resolution, copy-on-write detach, tagged/plain "Copy full lyric" exports, paste auto-split, and derived version vN numbering — all computed at read time, never stored.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-30
- **Tasks:** 3 (all `type="auto" tdd="true"`)
- **Files modified:** 4 (all created)

## Accomplishments
- `lib/catalogue/blocks.ts` — `deriveBlockNumerals()` derives section labels from position among same-type siblings (RENUMBERING RULE); `resolveRepeat()` and `planDetach()` implement linked repeats and copy-on-write detach (REPEAT RULE), guarding cycles and dangling links without throwing.
- `serializeLyrics(blocks, 'tagged' | 'plain')` — the two "Copy full lyric" export flavors (S-04), both expanding every linked repeat to full text, with no tool name anywhere in the module or its output.
- `splitPastedLyric(text)` — paste auto-split on blank lines, recognizing section headers tolerant of brackets, casing, trailing colon, and trailing numeral.
- `lib/catalogue/versions.ts` — `deriveVersionNumerals()` derives vN from `created_at` (id-tiebreak deterministic), `latestVersion()` and `presentVersion()` build on that same ordering.
- 40 new Jest tests (32 in `blocks.test.ts`, 8 in `versions.test.ts`), all pure — no jsdom, no mocks beyond plain-object fixtures.

## Task Commits

Each task was committed atomically, green at every commit (never-red constraint honored for the shared parallel-wave checkout):

1. **Task 1: numeral derivation and repeat/detach semantics** - `3257890` (feat)
2. **Task 2: paste auto-split and "Copy full lyric" serializers (S-04)** - `7b286db` (feat)
3. **Task 3: derived vN and version presentation** - `dc5f64a` (feat)

**Plan metadata:** pending (this SUMMARY + STATE/ROADMAP/REQUIREMENTS commit, made after this file is written)

_Note: task-level `tdd="true"` was honored as a local RED→GREEN development discipline (write tests, verify they fail against the not-yet-written implementation, then implement to green) rather than as separate `test(...)` / `feat(...)` git commits — the orchestrator's explicit hard rule for this parallel wave is "never commit red" (three sibling agents share this checkout and read the live jest baseline), which takes precedence over the generic RED-commit convention. Each of the three commits above is a task-boundary commit that is fully green (tests + implementation together) at commit time._

## Files Created/Modified
- `lib/catalogue/blocks.ts` - `BLOCK_TYPE_LABELS`/`BLOCK_TYPE_VALUES`, `deriveBlockNumerals()`, `resolveRepeat()`, `planDetach()`, `serializeLyrics()`, `splitPastedLyric()` — pure, no I/O
- `lib/catalogue/blocks.test.ts` - 32 tests across 5 describe blocks (label vocabulary, RENUMBERING RULE, REPEAT RULE, serializers, paste auto-split)
- `lib/catalogue/versions.ts` - `deriveVersionNumerals()`, `latestVersion()`, `presentVersion()` — pure, no I/O
- `lib/catalogue/versions.test.ts` - 8 tests (ordering, delete-renumber, tiebreak determinism, `latestVersion` empty case, presentation with/without label)

## Decisions Made
- **`planDetach()` return shape:** `{ patch: DetachPatch, source: T | null }` rather than mutating the input block in place. `patch` is the exact field set (`text`, `repeat_of_block_id: null`, `author_kind: 'human'`, `author_user_id`) the detach route should write to the detaching row; `source` is returned as-is (untouched) so a caller can assert nothing on the source changed. This matches the plan's key-link ("`planDetach()` is the shape plan 07's blocks/[blockId] detach branch writes") and keeps the function pure — it never mutates its inputs.
- **Cycle guard seeds `visited` with the walking block's own id up front** (before following the first hop), so `A -> A` is caught on the very first lookup rather than needing a second iteration to detect. Verified with a dedicated self-cycle test in addition to the required chain and mutual-cycle cases.
- **`matchSectionHeader()` peels decorations in a loop until stable**, rather than a single fixed-order strip (bracket → colon → numeral). A combined case like `"[Hook]:"` has a bracket that is NOT the string's last character (the colon is), so a one-pass "strip trailing `]`" step misses it entirely; looping until the string stops changing handles any order/combination of brackets, colon, and trailing numeral.
- **`splitPastedLyric()` groups by explicit line-by-line blank detection** rather than a single `\n\s*\n+` regex split, because `\s` also matches newlines and produces inconsistent grouping across multiple consecutive blank lines and whitespace-only "blank" lines. The line-by-line approach also naturally strips trailing whitespace per line, which is exercised by the Windows-line-ending/trailing-whitespace parity test.

## Deviations from Plan

None — plan executed exactly as written. All `must_haves.truths`, `must_haves.prohibitions`, and the two locked doctrine rules (RENUMBERING RULE, REPEAT RULE) are implemented and covered by dedicated test describe blocks.

## Issues Encountered

One self-corrected test failure during development (not a deviation from the plan, a normal red→green TDD cycle): the initial `matchSectionHeader()` implementation stripped brackets and the trailing colon in a fixed single pass, which failed the `"[Hook]:"` fixture (bracket not adjacent to string end once the colon is present). Fixed by looping the strip until the string stabilizes — all 32 `blocks.test.ts` tests pass afterward. No commit was ever made in the failing state (caught during local `npx jest` verification before staging).

## User Setup Required

None — no external service configuration required. Pure, dependency-free modules.

## Next Phase Readiness

- `deriveBlockNumerals()`, `resolveRepeat()`, `planDetach()`, `serializeLyrics()`, and `splitPastedLyric()` are ready for plan 07 (blocks API routes) and plan 08 (LyricBlockCard / CopyLyricMenu UI) to import directly — the structural `LyricBlockRecord` type is intentionally declared locally in `blocks.ts` and is structurally compatible with plan 04's eventual DB row type, so no rework is expected when plan 04 lands.
- `deriveVersionNumerals()`, `latestVersion()`, and `presentVersion()` are ready for plan 10 (DiaryFeed) and plan 12 (versions column) in the same way, via `WorkVersionRecord`.
- No blockers. Gate results at hand-off: `npx jest` 295/295 suites, 3249/3249 tests green (baseline was ~288 suites at plan start, climbing as sibling wave-1 plans 37-01/37-03/etc. landed concurrently in the same checkout); `npx tsc --noEmit` 0 errors; `npx eslint lib/catalogue/blocks.ts lib/catalogue/blocks.test.ts lib/catalogue/versions.ts lib/catalogue/versions.test.ts --max-warnings=0` clean.

---
*Phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig*
*Completed: 2026-08-30*

## Self-Check: PASSED

All four created files verified present on disk; all three task commit hashes (`3257890`, `7b286db`, `dc5f64a`) verified present in `git log --oneline --all`.
