---
phase: 17-split-sheet-esign
plan: 08
subsystem: pdf
tags: [react-pdf, fonts, noto-sans, unicode, i18n, testing, zlib]

# Dependency graph
requires: []
provides:
  - "Shared, single-registration Unicode PDF font module (lib/vault/pdf/fonts.ts) all three renderers import"
  - "Vendored, license-compliant Noto Sans (SIL OFL) static TTFs with SHA256-recorded provenance"
  - "Unicode-safe split-sheet.tsx, credits-sheet.tsx, metadata-sheet.tsx renderers"
  - "extractPdfText() test helper for exact-string Unicode assertions against real rendered PDF bytes"
  - "Fixed dangling 'Prepared by' label when initiatorName is absent/empty/whitespace"
affects: [17-06, 17-09, 17-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single shared font-registration module (lib/vault/pdf/fonts.ts) — all PDF renderers import it, never call Font.register directly"
    - "Font weight expressed via fontWeight (400/700) on one family, never a separate bold family name"
    - "Test-only PDF byte decoding (extract-pdf-text.ts) using only Node built-in zlib, no new dependency"

key-files:
  created:
    - assets/fonts/NotoSans-Regular.ttf
    - assets/fonts/NotoSans-Bold.ttf
    - assets/fonts/OFL.txt
    - assets/fonts/PROVENANCE.md
    - lib/vault/pdf/fonts.ts
    - lib/vault/pdf/fonts.test.ts
    - lib/vault/pdf/test-utils/extract-pdf-text.ts
    - __tests__/pdf-unicode.test.ts
    - types/fontkit.d.ts
  modified:
    - lib/vault/pdf/split-sheet.tsx
    - lib/vault/pdf/credits-sheet.tsx
    - lib/vault/pdf/metadata-sheet.tsx
    - lib/vault/pdf/split-sheet.test.ts
    - next.config.mjs
    - .eslintrc.json

key-decisions:
  - "Vendored Noto Sans from the official notofonts.github.io repository (fonts/NotoSans/hinted/ttf/) rather than google/fonts — same upstream release, identical SHA256 either mirror"
  - "Replaced the uncovered warning glyph (U+26A0, no glyph in Noto Sans or standard-14) with plain covered text '— does not total 100%' instead of adding a symbols font"
  - "initiatorName changed from required string to optional/nullable to make the absent/empty/whitespace case a first-class type, not a caller convention"
  - "Added types/fontkit.d.ts ambient declaration (Rule 3 — fontkit ships no .d.ts of its own; tsc --noEmit failed on direct import from the test suite)"
  - "Added 'root: true' to .eslintrc.json (Rule 3 — nested-worktree lint resolution picked up the main checkout's .eslintrc.json too, causing a duplicate @next/eslint-plugin-next plugin-resolution conflict)"

patterns-established:
  - "Font.register happens exactly once, in lib/vault/pdf/fonts.ts, guarded by a module-level idempotency flag and a fail-fast Error naming the missing absolute path"
  - "A glyph-coverage guard test scans renderer source for fontFamily literals and non-ASCII string content, failing loudly on any future revert to a standard-14 font"

requirements-completed: [ESIGN-15]

coverage:
  - id: D1
    description: "registerFunuunPdfFonts() registers Noto Sans (regular 400 + bold 700) once, is idempotent, and fails fast with a named path when a font file is missing"
    requirement: "ESIGN-15"
    verification:
      - kind: unit
        ref: "lib/vault/pdf/fonts.test.ts#registerFunuunPdfFonts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Vendored Noto Sans TTFs are static (no fvar table), correctly identified by fontkit (family/subfamily), and cover every required non-ASCII codepoint including c-acute and u-macron"
    requirement: "ESIGN-15"
    verification:
      - kind: unit
        ref: "lib/vault/pdf/fonts.test.ts#vendored Noto Sans font files"
        status: pass
    human_judgment: false
  - id: D3
    description: "All three renderers (split-sheet, credits-sheet, metadata-sheet) use PDF_FONT_FAMILY exclusively; no uncovered non-ASCII literal remains in any renderer source"
    requirement: "ESIGN-15"
    verification:
      - kind: unit
        ref: "lib/vault/pdf/fonts.test.ts#glyph coverage guard — all three PDF renderer sources"
        status: pass
    human_judgment: false
  - id: D4
    description: "A split sheet with no initiator name (absent/null/empty/whitespace) renders the header label alone with no dangling 'Prepared by' clause; presence renders the full clause"
    requirement: "ESIGN-15"
    verification:
      - kind: unit
        ref: "lib/vault/pdf/split-sheet.test.ts#renders the header label alone with no dangling preparer clause when initiatorName is $label"
      - kind: unit
        ref: "lib/vault/pdf/split-sheet.test.ts#names the preparer when initiatorName is present"
        status: pass
    human_judgment: false
  - id: D5
    description: "A rendered split sheet, credits sheet, and metadata sheet all extract 'Nikola Jokić' / 'José Muñoz' / 'Funūn' verbatim from the real PDF bytes, and embed a Noto Sans subset base-font rather than standard-14 Helvetica"
    requirement: "ESIGN-15"
    verification:
      - kind: unit
        ref: "__tests__/pdf-unicode.test.ts#split sheet — Unicode regression"
        status: pass
      - kind: unit
        ref: "__tests__/pdf-unicode.test.ts#credits sheet — Unicode regression"
        status: pass
      - kind: unit
        ref: "__tests__/pdf-unicode.test.ts#metadata sheet — Unicode regression"
        status: pass
    human_judgment: false
  - id: D6
    description: "Post-deploy: a generated split sheet and credits sheet on the live app render 'Funūn' and a non-Latin-1 collaborator name correctly, proving outputFileTracingIncludes actually shipped the fonts into the serverless bundle"
    verification: []
    human_judgment: true
    rationale: "Cannot be observed locally — the failure mode this guards against (fonts present in git checkout, absent from the deployed serverless bundle) only manifests after a real Vercel deploy. Plan explicitly calls this out as a human-check."

# Metrics
duration: 22min
completed: 2026-07-20
status: complete
---

# Phase 17 Plan 08: Unicode-Safe PDF Rendering Summary

**Vendored Noto Sans (SIL OFL) behind a single shared registration module, switched all three PDF renderers off standard-14 Helvetica, and proved with byte-level extraction that "Nikola Jokić" and "Funūn" now survive rendering verbatim.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-07-20T09:04:00Z (approx., font download)
- **Completed:** 2026-07-20T09:24:00Z
- **Tasks:** 3
- **Files modified:** 15 (9 created, 6 modified)

## Accomplishments

- Vendored static, license-verified Noto Sans Regular/Bold TTFs (SIL OFL) with SHA256-recorded provenance in `assets/fonts/PROVENANCE.md`, and the required `OFL.txt` license text alongside them.
- `lib/vault/pdf/fonts.ts` — the single place `Font.register()` is ever called for Funūn's PDF layer. Idempotent, fails loudly (named absolute path) if a font file is missing at registration time rather than silently falling back to the corrupting standard-14 path.
- `next.config.mjs` now declares `outputFileTracingIncludes` for `app/api/**` so the vendored fonts ship into the deployed serverless bundle, not just the local git checkout.
- All three renderers (`split-sheet.tsx`, `credits-sheet.tsx`, `metadata-sheet.tsx`) import `registerFunuunPdfFonts()` and use `PDF_FONT_FAMILY` in every `StyleSheet`; bold is now `fontWeight: 700` on the same family, never a separate `Helvetica-Bold` name.
- Fixed the shipped-bug's second finding: `initiatorName` is now optional/nullable and trimmed — a split sheet with no initiator renders `Split Sheet` alone, never a dangling `Split Sheet · Prepared by ` with nothing after it.
- Replaced the uncovered warning-triangle glyph (`⚠`, U+26A0 — no glyph in Noto Sans *or* the old standard-14 fonts, so it was already silently dropped) with plain covered text: `— does not total 100%`.
- Built `extractPdfText()` — a test-only helper that decodes @react-pdf/renderer's actual Identity-H / Type0 / ToUnicode-CMap output structure directly from the raw PDF bytes using only Node's built-in `zlib`, with no new dependency.
- `__tests__/pdf-unicode.test.ts` renders real buffers through all three renderers and proves `Nikola Jokić`, `José Muñoz`, and the `Funūn` footer all extract byte-for-byte intact, plus a structural check that each renderer embeds a Noto Sans subset base-font (e.g. `ABCDEF+NotoSans-Regular`) rather than `Helvetica`.
- `lib/vault/pdf/fonts.test.ts` adds a glyph-coverage guard that scans all three renderer sources for `fontFamily` values and non-ASCII string literals, failing loudly if a future contributor reverts to a hardcoded family name or introduces an uncovered character.

## Task Commits

Each task was committed atomically:

1. **Task 1: Vendor Noto Sans with provenance + single shared font-registration module** — `18d1419` (feat)
2. **Task 2: Move all three renderers onto the registered family + fix the dangling initiator label** — `a4bc63a` (fix)
3. **Task 3: Exact-string Unicode regression proof across all three renderers** — `003fd1f` (test)

**Plan metadata:** (this commit) — docs: complete plan

## Files Created/Modified

- `assets/fonts/NotoSans-Regular.ttf` — vendored static Noto Sans Regular, verified with fontkit (family/subfamily/no-fvar/glyph coverage)
- `assets/fonts/NotoSans-Bold.ttf` — vendored static Noto Sans Bold, same verification
- `assets/fonts/OFL.txt` — SIL Open Font License text (license-required to travel with the font)
- `assets/fonts/PROVENANCE.md` — source URL, retrieval date, SHA256, fontkit-reported identity per file
- `lib/vault/pdf/fonts.ts` — `registerFunuunPdfFonts()`, `PDF_FONT_FAMILY`, `PDF_FONT_FILES`, `assertFontFileExists()`
- `lib/vault/pdf/fonts.test.ts` — font-identity assertions + idempotency/fail-fast tests + cross-renderer glyph-coverage guard
- `lib/vault/pdf/split-sheet.tsx` — registers fonts, uses `PDF_FONT_FAMILY`, fixes dangling preparer label
- `lib/vault/pdf/credits-sheet.tsx` — registers fonts, uses `PDF_FONT_FAMILY`, replaces uncovered warning glyph
- `lib/vault/pdf/metadata-sheet.tsx` — registers fonts, uses `PDF_FONT_FAMILY`
- `lib/vault/pdf/split-sheet.test.ts` — new dangling-label coverage (absent/null/empty/whitespace initiator)
- `lib/vault/pdf/test-utils/extract-pdf-text.ts` — test-only Identity-H/ToUnicode CMap decoder (zlib only)
- `__tests__/pdf-unicode.test.ts` — exact-string Unicode regression suite across all three renderers
- `next.config.mjs` — `outputFileTracingIncludes` for `app/api/**` so fonts ship into the serverless bundle
- `types/fontkit.d.ts` — ambient module declaration (fontkit ships no `.d.ts`)
- `.eslintrc.json` — `"root": true` (nested-worktree lint config bleed fix)

## Decisions Made

- Sourced Noto Sans from the official `notofonts/notofonts.github.io` repository rather than `google/fonts` — both are acceptable per the plan; the notofonts.github.io mirror was used first and its SHA256 matched a `google/fonts` OFL.txt fetch identically, confirming both mirrors serve the same upstream release.
- Kept the em-dash-based warning text (`— does not total 100%`) rather than reintroducing any symbol glyph, per the plan's explicit instruction not to add a second font family for one symbol.
- Widened `initiatorName`'s type to `string | null | undefined` rather than requiring callers to always pass an empty string — makes "no initiator" a representable, tested state instead of a convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `types/fontkit.d.ts` ambient declaration**
- **Found during:** Task 1 verification (`npx tsc --noEmit`)
- **Issue:** `fontkit`'s package.json has no `types`/`typings` field and ships no `.d.ts` files. `@react-pdf/types` re-exports fontkit's types from an already-built `.d.ts` (invisible to `tsc` under `skipLibCheck`), but `lib/vault/pdf/fonts.test.ts` imports `fontkit` directly and `tsc --noEmit` failed with TS7016 (`Could not find a declaration file for module 'fontkit'`).
- **Fix:** Added a minimal ambient `declare module 'fontkit'` covering exactly the surface this codebase calls (`openSync`, `Font.familyName`, `.subfamilyName`, `.tables`, `.hasGlyphForCodePoint`).
- **Files modified:** `types/fontkit.d.ts` (new)
- **Verification:** `npx tsc --noEmit` clean.
- **Committed in:** `18d1419` (Task 1 commit)

**2. [Rule 3 - Blocking] Added `"root": true` to `.eslintrc.json`**
- **Found during:** Task 1 verification (`npm run lint`)
- **Issue:** This agent executes from inside a nested git worktree at `.claude/worktrees/<id>/`, physically located inside the main checkout's directory tree. Without `root: true`, ESLint's config cascade walked up past the worktree root and picked up the main checkout's `.eslintrc.json` too, loading `@next/eslint-plugin-next` from two different `node_modules` resolutions and failing with "ESLint couldn't determine the plugin uniquely."
- **Fix:** Added `"root": true` to `.eslintrc.json`, stopping upward config lookup at the project root. No behavior change for the main checkout (it has no parent `.eslintrc.json` to merge with); fixes lint for any nested-worktree execution.
- **Files modified:** `.eslintrc.json`
- **Verification:** `npm run lint` clean, both in the worktree and structurally unchanged for the main checkout.
- **Committed in:** `18d1419` (Task 1 commit)

**3. [Rule 1 - Bug] Fixed a ligature-decoding bug in `extractPdfText()` before it could hide a false pass**
- **Found during:** Task 3, while manually validating the CMap-decoding approach against a real rendered buffer
- **Issue:** The initial `beginbfchar` entry regex required the destination hex group to contain no whitespace, but multi-unit ligature entries (e.g. `<0039><0066 0069>` mapping one CID to "fi") have an embedded space between UTF-16BE code units. Those entries silently failed to match and dropped out of the map, corrupting extraction of any word containing an "fi" ligature (`Confidential` extracted as `Condential`) — which would have been a false-negative risk masking a real extraction bug as a passing test.
- **Fix:** Widened the destination-hex capture group to allow embedded whitespace before splitting into code units.
- **Files modified:** `lib/vault/pdf/test-utils/extract-pdf-text.ts`
- **Verification:** Manual scratch-test decode confirmed `Confidential` (with the ligature) now extracts correctly; full regression suite passes.
- **Committed in:** `003fd1f` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 3 blocking, 1 Rule 1 bug)
**Impact on plan:** All three fixes were required to complete verification as specified (tsc/lint gates) or to prevent a false-passing test from masking a real extraction defect. No scope creep — no renderer behavior changed beyond what the plan specified.

## Issues Encountered

- **Worktree cwd drift (self-caught, no lasting impact):** Early in execution, several Bash calls used an absolute path to the main checkout (`/Users/peterzora/Desktop/funun`) instead of the assigned worktree root, which created `assets/fonts/` in the main checkout before any commit. Caught immediately via the `Write` tool's worktree-isolation guard; the accidentally-created files were untracked and were deleted from the main checkout before any further work. All subsequent commands used the correct worktree-rooted absolute path. No commits were made outside the worktree.
- **No `node_modules` in the fresh worktree:** Ran `npm ci --no-audit --no-fund` (795 packages) to make `jest`/`tsc`/`eslint`/`fontkit` available for verification — required for every task's verify block to run at all, not scoped to any single task.

## Shipped-bug disclosure (per plan's verification section)

Every credits sheet and metadata sheet Funūn has generated to date carries the corrupted brand string (`Funkn` instead of `Funūn`), and any collaborator whose legal name contains a non-Latin-1 character (Polish, Czech, Croatian, Serbian, Turkish, Baltic, Vietnamese, and non-Latin scripts generally) has had that name corrupted on a previously generated document — `ć` silently dropped, other diacritics mangled. No backfill of previously generated PDFs is planned; every document regenerates from live database state on its next export, and this fix ensures all future exports render correctly.

## User Setup Required

None — no external service configuration required. The one manual step is the plan's built-in human-check (see Next Phase Readiness below), which requires an actual Vercel deploy and cannot be performed from this execution context.

## Next Phase Readiness

- All three PDF renderers now correctly embed Unicode-capable fonts; ESIGN-15 is closed pending the one human-check below.
- **Outstanding human-check (not automatable from this context):** After the next deploy, generate one split sheet and one credits sheet from the deployed app and confirm the footer reads `Funūn` and a non-Latin-1 collaborator name renders intact. This is the only check that proves `outputFileTracingIncludes` actually shipped `assets/fonts/*.ttf` into the Vercel serverless bundle — it cannot be observed locally, since `process.cwd()` in local dev already resolves to the repo root regardless of the Next.js config.
- This plan is independent of 17-06 (mint route) and 17-09 (legal-grade rebuild) — `renderSplitSheet` is not yet wired into any route (17-06 is still incomplete), so this fix ships ahead of any live envelope minting, exactly as the plan intended.
- Full test suite: 61 suites / 629 tests passing (baseline before this plan: 59 suites / 589 tests — 2 new suites, 40 new tests, zero regressions).

---
*Phase: 17-split-sheet-esign*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 10 created/modified files confirmed present on disk; all 3 task commits (`18d1419`, `a4bc63a`, `003fd1f`) confirmed in git log.
