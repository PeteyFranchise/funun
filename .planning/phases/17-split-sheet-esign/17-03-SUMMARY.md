---
phase: 17-split-sheet-esign
plan: 03
subsystem: documents
tags: [react-pdf, docuseal, split-sheets, pdf-rendering, jest, babel]

requires:
  - phase: 17-split-sheet-esign (Wave 0/1, migration 018)
    provides: split_sheets/split_sheet_parties schema, lib/split-sheets/approval.ts SplitSheetParty type
provides:
  - "lib/vault/pdf/split-sheet.tsx: SplitSheetDocument + renderSplitSheet(input) -> Buffer via renderToBuffer"
  - "partyRoleTag(index): deterministic, DocuSeal-safe per-party role identifier (Party1, Party2, ...)"
  - "A working Jest transform path for @react-pdf/renderer (and its ESM-only dependency tree) — first exercised by this plan, reusable by any future PDF-renderer test"
affects: [17-06 (mint route consumes renderSplitSheet + partyRoleTag), 17-04, 17-05, 17-07]

tech-stack:
  added: []
  patterns:
    - "PDF renderer precedent (credits-sheet.tsx / metadata-sheet.tsx) extended to a third document type; same StyleSheet/header/footer scaffolding"
    - "Literal DocuSeal text-tag embedded directly in @react-pdf/renderer output text (no separate field-mapping step) — the renderer IS the template-only guardrail"
    - "Jest testing of @react-pdf/renderer output via manual React-element-tree walking (call composite component functions with their props, recurse into props.children for host elements) instead of react-test-renderer"

key-files:
  created:
    - lib/vault/pdf/split-sheet.tsx
    - lib/vault/pdf/split-sheet.test.ts
    - jest.babel-plugins.js
  modified:
    - jest.config.js

key-decisions:
  - "partyRoleTag(index) = `Party${index + 1}` — simple, deterministic, alphanumeric, matches DocuSeal's documented role-tag syntax exactly; the mint route (17-06) must map submitters[] to this same function to keep tags and submitters in sync."
  - "pro/role are read as PRO/ComposerRole with a fallback to the raw stored string (or an em dash) rather than a hard cast — split_sheet_parties.pro/role are free-text TEXT columns even though the only producer (SplitSheetBuilder.tsx) currently constrains them via PRO_VALUES/ComposerRole dropdowns; this keeps the renderer defensive against legacy/out-of-range values without crashing."
  - "jest.config.js gained a scoped transformIgnorePatterns exception + babel-jest (next/babel preset) for exactly the @react-pdf/renderer ESM dependency subtree (react-pdf/*, yoga-layout, fontkit, color-string, etc.) plus a small custom Babel plugin (jest.babel-plugins.js) shimming yoga-layout's `import.meta.url` WASM-loader reference to its CJS equivalent. No new npm packages were installed — next/babel and @babel/core were already present as transitive deps. This was required because @react-pdf/renderer's entire tree is 'type': 'module' with no CJS build, and this plan's test is the first one in the codebase to import it."

requirements-completed: [ESIGN-02]

coverage:
  - id: D1
    description: "renderSplitSheet(input) renders a real PDF buffer (valid %PDF- header) server-side from split-sheet party state, never from a client-supplied file."
    requirement: ESIGN-02
    verification:
      - kind: unit
        ref: "lib/vault/pdf/split-sheet.test.ts#renderSplitSheet > returns a non-empty Buffer with a valid PDF header"
        status: pass
      - kind: unit
        ref: "lib/vault/pdf/split-sheet.test.ts#renderSplitSheet > renders successfully with a single party and no project attached (standalone sheet)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every party row renders name, role, PRO, IPI (or em dash), and split % — matching the credits-sheet column layout."
    requirement: ESIGN-02
    verification:
      - kind: unit
        ref: "lib/vault/pdf/split-sheet.test.ts#SplitSheetDocument > renders a row and a role-tagged signature field for every party"
        status: pass
      - kind: unit
        ref: "lib/vault/pdf/split-sheet.test.ts#SplitSheetDocument > shows an em dash for a party with no IPI"
        status: pass
    human_judgment: false
  - id: D3
    description: "Each party gets a signature line rendered as a literal DocuSeal text-tag bound to partyRoleTag(index), and partyRoleTag is exported, deterministic, and unique per index — the only path to a DocuSeal template is Funūn's own renderer."
    requirement: ESIGN-02
    verification:
      - kind: unit
        ref: "lib/vault/pdf/split-sheet.test.ts#partyRoleTag > is deterministic for the same index"
        status: pass
      - kind: unit
        ref: "lib/vault/pdf/split-sheet.test.ts#partyRoleTag > is unique per index"
        status: pass
      - kind: unit
        ref: "lib/vault/pdf/split-sheet.test.ts#partyRoleTag > produces DocuSeal-safe identifiers (alphanumeric, no spaces)"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-07-20
status: complete
---

# Phase 17 Plan 03: Split-Sheet PDF Renderer Summary

**Server-side @react-pdf/renderer split-sheet document (name/role/PRO/IPI/split% per party) with literal DocuSeal signature text-tags, cloning the credits-sheet.tsx precedent — plus the Jest transform infrastructure needed to test @react-pdf/renderer's ESM-only tree for the first time in this codebase.**

## Performance

- **Duration:** 40 min
- **Completed:** 2026-07-20
- **Tasks:** 1 (TDD: RED then GREEN)
- **Files modified:** 4 (2 created for the renderer, 1 created + 1 modified for test infra)

## Accomplishments
- `lib/vault/pdf/split-sheet.tsx` renders a branded, per-party split-sheet PDF (header, party table with name/role/PRO/IPI/split%, total-splits line with over/under warning, per-party signature block, Funūn confidential footer) entirely from server-side `SplitSheetParty[]` state — no client-supplied file, no new dependency.
- Every party's signature line carries a literal DocuSeal PDF-API text tag (`{{Signature;role=PartyN;type=signature}}`) bound to `partyRoleTag(index)`, which is exported so the mint route (17-06) can map `submitters[].role` to the identical tag.
- `renderSplitSheet(input)` returns a real PDF `Buffer` via `renderToBuffer` — verified against the actual `%PDF-` magic bytes, not a stub.
- Established a reusable Jest transform path for `@react-pdf/renderer` (and its whole ESM-only dependency tree), unblocking any future test of `credits-sheet.tsx`/`metadata-sheet.tsx`/other PDF renderers.

## Task Commits

Each task was committed atomically:

1. **Task 1: Split-sheet PDF document + stable per-party role-tag helper** - `7a58b63` (feat) — includes the RED test file, the GREEN implementation, and the jest.config.js/jest.babel-plugins.js test-infra fix in one commit (the infra fix was a hard blocker discovered while turning RED green, not separable without leaving the suite unable to run).

_TDD note: RED was confirmed (`Cannot find module './split-sheet'`) before implementation began; GREEN was reached after the test-infra blocker (below) was resolved. Both stages happened before the single commit above, matching this plan's `tdd="true"` task but landing as one commit since the infra fix was inseparable from reaching green._

**Plan metadata:** pending final `docs(17-03)` commit (this SUMMARY + STATE/ROADMAP/REQUIREMENTS updates), created after this file.

## Files Created/Modified
- `lib/vault/pdf/split-sheet.tsx` - `SplitSheetDocument`, `partyRoleTag`, `renderSplitSheet` — the split-sheet PDF renderer.
- `lib/vault/pdf/split-sheet.test.ts` - Unit tests: PDF buffer validity, `partyRoleTag` determinism/uniqueness/DocuSeal-safety, per-party row + signature-tag wiring, IPI em-dash fallback.
- `jest.config.js` - Added a scoped `transformIgnorePatterns` exception + `babel-jest` (`next/babel` preset) transform entry for the `@react-pdf/renderer` ESM dependency subtree; added `jsx: 'react-jsx'` to the existing ts-jest tsconfig override (first `.tsx` file ever imported by a test).
- `jest.babel-plugins.js` - Custom Babel plugin shimming `import.meta.url` (used by `yoga-layout`'s WASM loader) to its CommonJS equivalent (`require('url').pathToFileURL(__filename).href`). Kept in its own file rather than inline because babel-jest's cache-key serialization rejects an in-memory function reference on a warm/full-suite run.

## Decisions Made
- `partyRoleTag(index) = \`Party${index + 1}\`` for simplicity and guaranteed DocuSeal-safety (alphanumeric, no spaces/punctuation).
- PRO/role display resolves through `PRO_LABELS`/`COMPOSER_ROLE_LABELS` with a fallback to the raw stored text (or em dash) rather than throwing or silently dropping unrecognized values — `split_sheet_parties.pro`/`.role` are `TEXT` columns without a DB-level enum constraint, even though today's only writer (`SplitSheetBuilder.tsx`) constrains them via dropdowns.
- Reused `SplitSheetParty` from `lib/split-sheets/approval.ts` as the party input type rather than defining a duplicate local type, per the plan's data-shape reference — `approval.ts` is not one of the 17-01-owned files this plan was told to avoid touching (envelopes.ts, notification builders, provider.ts), and it was only imported (read), never modified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `jsx: 'react-jsx'` to ts-jest's tsconfig override in jest.config.js**
- **Found during:** Task 1 (first `npx jest` run against split-sheet.test.ts)
- **Issue:** `split-sheet.tsx` is the first `.tsx` file ever imported by a Jest test in this codebase. ts-jest's tsconfig override in `jest.config.js` had no `jsx` compiler option, so JSX syntax passed through untranspiled, producing `SyntaxError: Unexpected token '<'`.
- **Fix:** Added `jsx: 'react-jsx'` (React 18 automatic runtime) to the existing ts-jest tsconfig override.
- **Files modified:** `jest.config.js`
- **Verification:** `npx jest lib/vault/pdf/split-sheet.test.ts` progressed past the parse error.
- **Committed in:** `7a58b63`

**2. [Rule 3 - Blocking] Added a scoped ESM transform (babel-jest + next/babel) for @react-pdf/renderer's dependency tree**
- **Found during:** Task 1, after fixing (1) above
- **Issue:** `@react-pdf/renderer` and its full dependency tree (`@react-pdf/*`, `yoga-layout`, `fontkit`, `color-string`/`color-name`, `jay-peg`, `linebreak`, `png-js`, etc.) ship pure ESM (`"type": "module"`, no CJS build). Jest's default `transformIgnorePatterns` skips `node_modules` entirely, so `import`/`export` syntax in these packages failed to parse under the project's commonjs ts-jest output. No test in this codebase had previously imported `@react-pdf/renderer`, so this gap was latent.
- **Fix:** Added a `transformIgnorePatterns` exception plus a `babel-jest` transform entry (using the already-installed `next/babel` preset) scoped to exactly the known ESM PDF-dependency package names — every other `node_modules` package continues to be required untransformed, unchanged. No new npm packages were installed.
- **Files modified:** `jest.config.js`
- **Verification:** Iteratively resolved each newly-surfaced ESM import error (`color-string` → `color-name` was the only additional nested dependency discovered); full suite run confirmed no other package needed adding.
- **Committed in:** `7a58b63`

**3. [Rule 3 - Blocking] Shimmed `import.meta.url` for yoga-layout's WASM loader**
- **Found during:** Task 1, after fixing (2) above
- **Issue:** `yoga-layout` (the flex-layout engine `@react-pdf/layout` depends on) references `import.meta.url` in its Emscripten-generated WASM loader to locate itself. `next/babel`'s commonjs transform leaves `import.meta` syntax untouched (it's valid-but-different ESM syntax, not part of the modules-to-commonjs rewrite), so Node's commonjs loader still threw `SyntaxError: Cannot use 'import.meta' outside a module`. No import-meta transform plugin was already installed.
- **Fix:** Wrote a small custom Babel plugin (`jest.babel-plugins.js`) that replaces `import.meta` with an equivalent object literal (`{ url: require('url').pathToFileURL(__filename).href }`) — the same rewrite bundlers apply automatically for this exact case. Referenced by resolvable file path (not an inline function) in `jest.config.js`'s babel-jest `plugins` array, because babel-jest's cache-key serialization rejected an in-memory function reference (`.plugins[0] must be a string, object, function`) on a warm/full-suite `npx jest` run, even though it worked on a cold single-file run.
- **Files modified:** `jest.babel-plugins.js` (new), `jest.config.js`
- **Verification:** `npx jest` (full suite, cache cleared) — 48 passed suites / 462 passed tests (baseline 47/455 + this plan's 1 suite/7 tests), zero regressions, confirmed on a second clean run.
- **Committed in:** `7a58b63`

---

**Total deviations:** 3 auto-fixed (all Rule 3 — blocking test-infrastructure gaps required to make the plan's own `<verify>` block pass; none touched application/business logic).
**Impact on plan:** All three fixes were necessary to reach GREEN on the task's own mandated test file and were confined to Jest test-infrastructure config, never application logic. No scope creep into 17-01/17-02/17-04..07's owned files. `lib/split-sheets/approval.ts` was imported (read-only) for its `SplitSheetParty` type, per this plan's explicit instruction, and not modified.

## Issues Encountered
None beyond the deviations documented above — all were resolved within this task's fix budget.

## User Setup Required
None - no external service configuration required. This plan is entirely credential-free (no DocuSeal API calls).

## Next Phase Readiness
- `renderSplitSheet` and `partyRoleTag` are ready for 17-06's mint route to import and call directly — `submitters[].role` must be built with the same `partyRoleTag(index)` function to keep DocuSeal's submitter roles aligned with the PDF's embedded text tags.
- The Jest ESM-transform infrastructure added here (jest.config.js + jest.babel-plugins.js) is now available to any future test of `credits-sheet.tsx`, `metadata-sheet.tsx`, or other `@react-pdf/renderer` consumers without further setup.
- No blockers for downstream plans in this phase.

---
*Phase: 17-split-sheet-esign*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: lib/vault/pdf/split-sheet.tsx
- FOUND: lib/vault/pdf/split-sheet.test.ts
- FOUND: jest.babel-plugins.js
- FOUND: commit 7a58b63
