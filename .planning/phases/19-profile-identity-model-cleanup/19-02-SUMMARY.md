---
phase: 19-profile-identity-model-cleanup
plan: 02
subsystem: documents
tags: [react-pdf, split-sheets, esign, pdf-generation, licensee-note]

requires:
  - phase: 17-split-sheet-esign
    provides: lib/split-sheets/agreement.ts (GUIDANCE_NOTES/AGREEMENT_CLAUSES), lib/vault/pdf/split-sheet.tsx renderer, the /approve/[token] read-only share surface, and the ESIGN-15/P17-08 extractPdfText byte-extraction test utility
provides:
  - NOTE_TO_LICENSEES constant (verbatim D-10 wording) in lib/split-sheets/agreement.ts
  - Boxed callout render on newly-generated split-sheet PDFs, beside the Split Breakdown table
  - Identical note rendered on the read-only /approve/[token] share surface (D-11)
  - Byte-extraction test proving the note reaches the real PDF content stream
affects: [phase-20-artist-profiles-rename, split-sheet-pdf-tests]

tech-stack:
  added: []
  patterns:
    - "Shared constant feeding two render surfaces (react-pdf View/Text + React DOM) to guarantee zero wording drift"
    - "Long-hand borderLeftColor/borderLeftWidth styling used (instead of the borderLeft shorthand) specifically to avoid colliding with an existing test's style-based View selector"

key-files:
  created: []
  modified:
    - lib/split-sheets/agreement.ts
    - lib/vault/pdf/split-sheet.tsx
    - lib/vault/pdf/split-sheet.test.ts
    - components/split-sheets/SplitApprovalView.tsx

key-decisions:
  - "Placed NOTE_TO_LICENSEES as its own export, not appended to GUIDANCE_NOTES — D-09 requires it beside the parties/rights block, not at the document foot with the general notes"
  - "Gave the new PDF callout a distinct style (licenseeNoteBox/licenseeNote, long-hand borderLeftColor #D97706) rather than reusing guidanceBox, to avoid colliding with the existing Guidance Notes test's borderLeft-shorthand selector"
  - "Rendered the note inside SplitApprovalView's PageShell (the single component every phase branch renders through) rather than in app/approve/[token]/page.tsx, satisfying D-11 across preview/sign/waiting/countered/done/approve without prop plumbing"

patterns-established:
  - "R5 note-to-licensees pattern: one verbatim constant in lib/split-sheets/agreement.ts, consumed by both the @react-pdf/renderer surface and the React-DOM share surface"

requirements-completed: [R5]

coverage:
  - id: D1
    description: "NOTE_TO_LICENSEES constant added to lib/split-sheets/agreement.ts with the exact verbatim D-10 wording, framed as guidance (no Funun warranty)"
    requirement: R5
    verification:
      - kind: unit
        ref: "lib/vault/pdf/split-sheet.test.ts#renders the R5 licensee note verbatim, in its own boxed callout beside the parties/rights block (not appended to Guidance Notes)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Newly generated split-sheet PDFs render the note as a boxed callout beside the Split Breakdown table, and the note's actual bytes are present in the rendered PDF content stream (not just the component tree)"
    requirement: R5
    verification:
      - kind: unit
        ref: "lib/vault/pdf/split-sheet.test.ts#embeds the R5 licensee note in the rendered PDF bytes, extracted from the real content stream (not just the React tree)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The identical note renders on the read-only /approve/[token] share surface (D-11), imported from the shared constant, with no change to approve/counter/sign behavior"
    requirement: R5
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (clean for components/split-sheets/SplitApprovalView.tsx)"
        status: pass
    human_judgment: true
    rationale: "tsc proves the import/JSX wiring is type-correct but does not visually confirm the callout renders correctly across every PageShell phase branch (preview/sign/waiting/countered/done/approve) at the 375px mobile-first breakpoint this surface targets — a human visual check of the live /approve/[token] page is warranted before this ships to real recipients."

duration: 35min
completed: 2026-07-24
status: complete
---

# Phase 19 Plan 02: R5 Licensee Note Summary

**One shared `NOTE_TO_LICENSEES` constant renders as a distinct boxed callout beside the Split Breakdown table on newly generated split-sheet PDFs, and the identical wording renders on the read-only `/approve/[token]` share surface — proven by a new PDF byte-extraction test, with no code path touching an already-executed document.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-24
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments
- `NOTE_TO_LICENSEES` exported from `lib/split-sheets/agreement.ts` — verbatim D-10 wording, explicitly framed as guidance with the no-warranty clause, kept separate from `GUIDANCE_NOTES` per D-09
- `lib/vault/pdf/split-sheet.tsx` renders the note as its own boxed callout (`licenseeNoteBox`/`licenseeNote` styles) immediately after the Split Breakdown table, before the Agreement section
- New byte-extraction test (`extractPdfText`, the ESIGN-15/P17-08 zlib-based utility) proves the note reaches the actual rendered PDF content stream — not just the pre-render React tree
- `components/split-sheets/SplitApprovalView.tsx` renders the same constant inside `PageShell`, the shared shell every phase branch (`preview`/`sign`/`waiting`/`countered`/`done`/approve) renders through, satisfying D-11's "travels with the record wherever a recipient sees it" without needing per-phase plumbing

## Task Commits

Each task was committed atomically:

1. **Task 1: NOTE_TO_LICENSEES constant + PDF boxed callout + byte assertion** - `409d45e` (feat)
2. **Task 2: Render the note on the read-only share/export surface (D-11)** - `d827836` (feat)

**Plan metadata:** committed with this SUMMARY

## Files Created/Modified
- `lib/split-sheets/agreement.ts` - added `NOTE_TO_LICENSEES` verbatim constant + doc comment explaining why it's not in `GUIDANCE_NOTES`
- `lib/vault/pdf/split-sheet.tsx` - imported the constant, added `licenseeNoteBox`/`licenseeNote` styles, rendered the callout beside the Split Breakdown table
- `lib/vault/pdf/split-sheet.test.ts` - new structural test (callout presence, placement before Agreement, verbatim text) + new byte-extraction test using `extractPdfText`
- `components/split-sheets/SplitApprovalView.tsx` - imported the constant, added a `LicenseeNote` component rendered inside `PageShell` beside the party/split card

## Decisions Made
- **Distinct callout styling, not shared style object:** The plan gave executor discretion to clone `guidanceBox`/`guidanceNote` with a distinct border tint if preferred. I exercised that discretion because reusing the exact `borderLeft` shorthand string would have made the new callout indistinguishable from the existing foot-of-document Guidance Notes callout under the existing test's `find(v => typeof style?.borderLeft === 'string')` selector — since `find()` returns the *first* match in document order and the new callout renders earlier in the tree, reusing the shorthand would have silently broken the pre-existing Guidance Notes test (it would select the wrong box). Using long-hand `borderLeftColor`/`borderLeftWidth` properties instead avoids the collision entirely while still rendering as a visually distinct bordered callout (amber `#D97706` vs. the Guidance Notes' indigo `#818CF8`).
- **Single choke-point placement on the share surface:** Rather than threading a new prop through `app/approve/[token]/page.tsx` into `SplitApprovalView`, I imported `NOTE_TO_LICENSEES` directly inside `SplitApprovalView.tsx` and rendered it in `PageShell` — the one component every phase branch (`preview`, `sign`, `waiting`, `countered`, `done`, and the interactive approve/counter phase) renders through beside the parties/rights card. This is a static string, not request-scoped data, so no server-to-client prop plumbing was needed; `app/approve/[token]/page.tsx` required no change.

## Deviations from Plan

**1. [Rule 1 - adjustment, not a bug] Did not reuse `guidanceBox`/`guidanceNote` styles verbatim; cloned with long-hand border properties**
- **Found during:** Task 1
- **Issue:** The plan's primary suggestion was to reuse the existing `guidanceBox`/`guidanceNote` styles directly, with cloning as a fallback ("executor discretion"). Reusing them directly (same `borderLeft` shorthand string) would have broken the pre-existing "renders exactly the three approved Guidance Notes... inside a callout with the accent border" test, because that test locates its callout box via `find(v => typeof style?.borderLeft === 'string')`, which returns the *first* matching View in document order — and the new licensee callout necessarily renders earlier in the tree (right after the Split Breakdown table, well before the foot-of-document Guidance Notes section).
- **Fix:** Used the plan's explicitly offered fallback — cloned as `licenseeNoteBox`/`licenseeNote` with a distinct border tint (`#D97706`), using long-hand `borderLeftWidth`/`borderLeftColor`/`borderLeftStyle` properties instead of the `borderLeft` shorthand, so the existing test's shorthand-based selector cannot match the new box.
- **Files modified:** `lib/vault/pdf/split-sheet.tsx`
- **Verification:** `npx jest lib/vault/pdf/split-sheet.test.ts` — all 24 tests pass, including the pre-existing Guidance Notes test unchanged and the two new R5 tests.
- **Committed in:** `409d45e` (Task 1 commit)

**2. [Rule 1 - adjustment, not a bug] `app/approve/[token]/page.tsx` left unchanged**
- **Found during:** Task 2
- **Issue:** The plan's `files_modified` frontmatter listed `app/approve/[token]/page.tsx` as a file this plan would touch, anticipating the note might need to be threaded through as a server-fetched prop.
- **Fix:** `NOTE_TO_LICENSEES` is a static, non-request-scoped string, so it is imported directly into the client component (`SplitApprovalView.tsx`) rather than passed as a prop from the server component. No change to `page.tsx` was needed to satisfy D-11.
- **Files modified:** none (confirmed no change required)
- **Verification:** `npx tsc --noEmit` clean; the note renders via `PageShell`, which every phase branch already passes through.

---

**Total deviations:** 2 (both Rule 1 — implementation adjustments to avoid a real test regression and unnecessary prop plumbing; no scope creep, no architectural change)
**Impact on plan:** Both deviations kept the plan's explicit deliverables and acceptance criteria intact while avoiding a self-inflicted test break and unneeded file churn.

## Issues Encountered
None beyond the two deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- R5 (Tier-1 "note to licensees") is complete: verbatim wording on both the PDF and the read-only share surface, proven by a real PDF-bytes assertion.
- The prohibition against mutating/regenerating an already-executed split-sheet PDF/Certificate holds by construction — this plan only touched the forward render path (`renderSplitSheet`/`SplitSheetDocument`) and the live share-view component; no backfill, migration, or regeneration code was introduced.
- A human visual check of `/approve/[token]` across its phase states (see coverage D3 rationale) is recommended before this reaches real recipients, but is not blocking for phase completion — this is a display-only addition with no functional risk.
- Phase 19 requirements R1–R4 (from plans 19-01, and any subsequent plans) are independent of this plan; 19-02 is a self-contained, non-blocking slice.

---
*Phase: 19-profile-identity-model-cleanup*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: `NOTE_TO_LICENSEES` in `lib/split-sheets/agreement.ts`
- FOUND: `NOTE_TO_LICENSEES` in `lib/vault/pdf/split-sheet.tsx`
- FOUND: `extractPdfText` usage in `lib/vault/pdf/split-sheet.test.ts`
- FOUND: `NOTE_TO_LICENSEES` in `components/split-sheets/SplitApprovalView.tsx`
- FOUND: commit `409d45e`
- FOUND: commit `d827836`
- FOUND: `.planning/phases/19-profile-identity-model-cleanup/19-02-SUMMARY.md`
