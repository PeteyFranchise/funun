---
phase: 09-rich-member-profile
plan: 01a
subsystem: testing
tags: [jest, ts-jest, typescript, zod-ready, profile]

# Dependency graph
requires:
  - phase: 08-identity-schema-foundation
    provides: artist_profiles.roles/open_to/featured_project_id columns, ArtistProfile type
provides:
  - Four Wave 0 RED Jest test files defining the contract 09-01b's lib/profile/validate.ts, buildProfileData() extension, and readLyrics() backward-compatibility must satisfy
  - "test": "jest" npm script (previously undefined)
  - TrackLyrics.synced additive field (D-13 forward-compatible timestamped-lyrics shape)
  - OPEN_TO_VALUES exported from types/index.ts as the single source of OpenTo union members
affects: [09-01b, 09-02, 09-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 RED test scaffolding: test files import subjects by real name from modules a later plan creates, proving they exercise not-yet-built code rather than stubbing"
    - "Additive JSONB type extension: new optional fields on tracks.metadata sub-shapes require no migration and no change to the existing defensive-parse reader logic"

key-files:
  created:
    - __tests__/profile-roles-validation.test.ts
    - __tests__/featured-project-validation.test.ts
    - __tests__/profile-load.test.ts
    - __tests__/schema-lyrics.test.ts
  modified:
    - package.json
    - lib/metadata/schema.ts
    - types/index.ts

key-decisions:
  - "This project's ts-jest runs transpile-only (root tsconfig.json sets isolatedModules: true, inherited by ts-jest's inline transform config), so TypeScript type errors do not fail Jest test runs — only unresolvable modules and runtime assertion failures do. schema-lyrics.test.ts's RED/GREEN contract for the additive TrackLyrics.synced field is therefore enforced via `npx tsc --noEmit`, not via Jest, per Task 2's own verify command."
  - "OPEN_TO_VALUES declared as `readonly OpenTo[]` next to the OpenTo union so a future union change that isn't mirrored in the array surfaces as a compile error, not a silent drift."

patterns-established:
  - "Pure-logic validators live in lib/profile/validate.ts (not inline in route handlers) so they are independently unit-testable against fixtures, not the live DB — established by this plan's test contract for 09-01b to fulfill."

requirements-completed: [PROFILE-02, PROFILE-04, PROFILE-05, PROFILE-06]

coverage:
  - id: D1
    description: "Four Wave 0 RED test files exist, import real subjects from the modules 09-01b will build, and fail for the right reason (not stubbed/skipped)"
    verification:
      - kind: unit
        ref: "npx jest __tests__/profile-roles-validation.test.ts __tests__/featured-project-validation.test.ts __tests__/profile-load.test.ts __tests__/schema-lyrics.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "npm test script (\"test\": \"jest\") added to package.json"
    requirement: null
    verification:
      - kind: unit
        ref: "grep -c '\"test\": \"jest\"' package.json"
        status: pass
    human_judgment: false
  - id: D3
    description: "TrackLyrics.synced additive field added; readLyrics()/sanitizeLyrics() logic left byte-identical; legacy plain-text lyrics still parse unchanged"
    requirement: null
    verification:
      - kind: unit
        ref: "__tests__/schema-lyrics.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "OPEN_TO_VALUES exported from types/index.ts as the single source of OpenTo union members"
    requirement: null
    verification:
      - kind: unit
        ref: "grep -c OPEN_TO_VALUES types/index.ts"
        status: pass
    human_judgment: false

duration: ~15min
completed: 2026-07-12
status: complete
---

# Phase 09 Plan 01a: Wave 0 RED Scaffolds + Additive Type Foundation Summary

**Four RED Jest test files defining 09-01b's `lib/profile/validate.ts` and `buildProfileData()` contracts, the `"test": "jest"` npm script, an additive `TrackLyrics.synced` field (D-13), and `OPEN_TO_VALUES` as the single OpenTo enum source**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-12
- **Tasks:** 2
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments
- Scaffolded four Wave 0 RED Jest test files (`profile-roles-validation`, `featured-project-validation`, `profile-load`, `schema-lyrics`) that define the exact contract 09-01b's `lib/profile/validate.ts` (`sanitizeProfileRoles`, `filterOpenTo`, `isFeaturableProjectRow`) and `buildProfileData()` extension must satisfy
- Added the missing `"test": "jest"` npm script to `package.json`
- Extended `TrackLyrics` with an additive, optional `synced` field (D-13 forward-compatible timestamped-lyrics shape) without touching `readLyrics()`/`sanitizeLyrics()` logic
- Exported `OPEN_TO_VALUES` from `types/index.ts` as the single source of `OpenTo` union members, ready for 09-01b's `filterOpenTo()`

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 — four RED test scaffolds + npm test script** - `c5e4b62` (test)
2. **Task 2: Additive TrackLyrics.synced extension + OPEN_TO_VALUES export** - `64ecd2a` (feat)

_No TDD RED/GREEN/REFACTOR gate sequence applies here in the traditional sense — Task 1 itself IS the RED scaffold for 09-01b's future GREEN, and Task 2 is a self-contained additive change verified by its own test file within this same plan._

## Files Created/Modified
- `__tests__/profile-roles-validation.test.ts` - RED: `sanitizeProfileRoles()`/`filterOpenTo()` contract (PROFILE-02, PROFILE-04)
- `__tests__/featured-project-validation.test.ts` - RED: `isFeaturableProjectRow()` contract (PROFILE-05)
- `__tests__/profile-load.test.ts` - RED: `buildProfileData()`'s `placementsCount` option/field contract (PROFILE-06); its `avgReadiness` assertion already passes against the live implementation
- `__tests__/schema-lyrics.test.ts` - Regression test for `readLyrics()` backward compatibility after the additive `synced` field (D-13); GREEN after Task 2
- `package.json` - Added `"test": "jest"` to `scripts`
- `lib/metadata/schema.ts` - `TrackLyrics` gains optional `synced` field; `readLyrics()`/`sanitizeLyrics()` logic unchanged
- `types/index.ts` - `OPEN_TO_VALUES` exported next to the `OpenTo` union, typed `readonly OpenTo[]`

## Decisions Made
- Test fixtures in `schema-lyrics.test.ts` type-annotate against the imported `TrackLyrics` type (rather than using loose `Record<string, unknown>` literals) so the additive-field contract is expressed at the type level, matching the plan's stated D-13 intent, even though this project's ts-jest configuration doesn't enforce that contract at Jest-runtime (see Deviations below — verified instead via `npx tsc --noEmit`).
- `profile-load.test.ts` includes a third test (`placementsCount` null when the option is omitted) beyond the two behaviors named in the plan, to pin down the default value 09-01b's implementation must return — cheap addition that closes an otherwise-unspecified edge in the contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in plan's testing assumption] `schema-lyrics.test.ts`'s RED signal is at the `tsc --noEmit` level, not Jest runtime**
- **Found during:** Task 1 verification (running the four RED test files)
- **Issue:** The plan's `must_haves.truths` state all four Wave 0 test files must "FAIL at RED (unimplemented)" via the Jest run. Empirically, this project's `ts-jest` (via `jest.config.js`'s inline transform config) inherits `isolatedModules: true` from the root `tsconfig.json`, which puts `ts-jest` into transpile-only mode — TypeScript type errors (e.g., referencing `TrackLyrics.synced` before it exists) do NOT fail Jest test runs; only unresolvable modules (`Cannot find module`) and runtime assertion failures do. Confirmed via direct comparison: `npx tsc --noEmit` reported 3 errors in `schema-lyrics.test.ts` referencing the not-yet-added `synced` field (TS2353/TS2339) before Task 2, while `npx jest __tests__/schema-lyrics.test.ts` passed all 3 tests both before and after Task 2, since `readLyrics()`'s runtime logic (which Task 2 explicitly must not modify) already tolerates the extra `synced` key.
- **Fix:** No code change was needed to correct this — it's a property of the existing, unmodified test infrastructure, not a defect this plan introduced. Kept `schema-lyrics.test.ts` as a genuine backward-compatibility regression test (valid and useful on its own terms) and relied on Task 2's own `npx tsc --noEmit` verify step (already specified in the plan) as the actual RED→GREEN gate for the `synced` field's type-level contract. Documented the mechanism explicitly here so the distinction between "Jest-RED" (3 of 4 files: `profile-roles-validation`, `featured-project-validation`, `profile-load`) and "tsc-RED" (`schema-lyrics`) is traceable, rather than silently letting the must_have appear unmet.
- **Files modified:** None beyond the test file already planned (`__tests__/schema-lyrics.test.ts`)
- **Verification:** `npx tsc --noEmit` before Task 2 showed 3 errors scoped to `schema-lyrics.test.ts`'s `synced` references; after Task 2, those 3 errors are gone and only the 3 expected Wave 0 errors from the other not-yet-built files remain (`profile-roles-validation.test.ts` x2, `featured-project-validation.test.ts` x1, `profile-load.test.ts` x3 — deferred to 09-01b)
- **Committed in:** `c5e4b62` (Task 1), `64ecd2a` (Task 2)

---

**Total deviations:** 1 auto-fixed (1 documented infra-mismatch finding, no code defect)
**Impact on plan:** No scope creep. The four RED test files, npm script, additive type extension, and `OPEN_TO_VALUES` export all landed exactly as specified; the deviation is a documentation/verification-interpretation clarification, not a functional change.

## Issues Encountered
None beyond the documented deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 09-01b can now build `lib/profile/validate.ts` (exporting `sanitizeProfileRoles`, `filterOpenTo`, `isFeaturableProjectRow`) against a concrete, already-written test contract, and extend `buildProfileData()`'s options/return shape with `placementsCount`.
- `OPEN_TO_VALUES` is available for 09-01b's `filterOpenTo()` implementation with no further schema work needed.
- `TrackLyrics.synced` is ready for the lyrics slide-up panel work in a later Phase 9 plan (D-08/D-13) with no migration required.
- No blockers.

---
*Phase: 09-rich-member-profile*
*Completed: 2026-07-12*

## Self-Check: PASSED

All 5 claimed files exist on disk; all 3 commit hashes (c5e4b62, 64ecd2a, cfe137f) found in git log.
