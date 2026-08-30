---
phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d
plan: 01
subsystem: profile
tags: [typescript, handles, display-name, next.js, jest]

# Dependency graph
requires: []
provides:
  - "lib/handles/validate.ts — the single handle-format authority (isValidHandle, normalizeHandleForCompare, handleFormatError)"
  - "lib/profile/display-name.ts — profileDisplayTitle()/profileHandleSubtitle() pure derivation, D-11/D-12 compliant"
  - "lib/profile/load.ts no longer fabricates 'Unnamed artist'"
  - "components/profile/ProfileView.tsx renders @handle beneath the title and fixes handle-aware avatar initials"
affects: [36-03, 36-04, 36-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Small pure-function validator module styled after lib/metadata/identifiers.ts (no schema library, named exports, section-header comments)"
    - "Display-title derivation as a pure function taking only the fields it's allowed to read, keeping legal-name columns structurally unreachable from public rendering"

key-files:
  created:
    - lib/handles/validate.ts
    - lib/handles/validate.test.ts
    - lib/profile/display-name.ts
    - lib/profile/display-name.test.ts
  modified:
    - lib/profile/load.ts
    - __tests__/profile-load.test.ts
    - components/profile/ProfileView.tsx

key-decisions:
  - "handleFormatError() gives specific per-reason messages (too short/long, edge separator, bad characters) rather than one generic string, matching the D-05 note that this string is reused by the signup field, settings form, and API routes in later plans"
  - "profileHandleSubtitle() takes the already-resolved title (not the raw artist name) so ProfileView can call it with only the ProfileData it already holds"

patterns-established:
  - "profileDisplayTitle()/profileHandleSubtitle() is the shared display-name derivation — future plans that touch profile rendering should call these rather than re-deriving a title"

requirements-completed: [D-04, D-05, D-11, D-12]

coverage:
  - id: D1
    description: "isValidHandle() accepts maya-reyes and MayaReyes, rejects out-of-range lengths and edge/consecutive separators"
    requirement: "D-05"
    verification:
      - kind: unit
        ref: "lib/handles/validate.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "normalizeHandleForCompare() lowercases for comparison only; nothing in this plan lowercases on write"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "lib/handles/validate.test.ts#normalizeHandleForCompare"
        status: pass
    human_judgment: false
  - id: D3
    description: "A profile with an artist name renders the name as title with @handle beneath; a nameless profile renders @handle as the title; buildProfileData() never fabricates a placeholder"
    requirement: "D-11"
    verification:
      - kind: unit
        ref: "lib/profile/display-name.test.ts, __tests__/profile-load.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "The display-title derivation reads only artist_name and handle — no legal-name column is referenced"
    requirement: "D-12"
    verification:
      - kind: unit
        ref: "grep -c 'legal_first_name' lib/profile/display-name.ts (returns 0)"
        status: pass
    human_judgment: false
  - id: D5
    description: "ProfileView renders the @handle subtitle line and derives correct avatar initials for a handle-only title"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit; grep -c 'profileHandleSubtitle' components/profile/ProfileView.tsx (returns 2)"
        status: pass
    human_judgment: false

duration: ~15min
completed: 2026-08-30
status: complete
---

# Phase 36 Plan 01: Handle Format Authority + Profile Display-Title Derivation Summary

**`lib/handles/validate.ts` (isValidHandle/normalizeHandleForCompare/handleFormatError) and `lib/profile/display-name.ts` (profileDisplayTitle/profileHandleSubtitle) replace the `artist_name || 'Unnamed artist'` fallback and give the rest of Phase 36 one shared format rule.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-30T05:15:00Z (approx)
- **Completed:** 2026-08-30T05:29:14Z
- **Tasks:** 3
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments
- One shared handle-format authority (`lib/handles/validate.ts`) that accepts `maya-reyes` and `MayaReyes`, rejects every edge-separator/out-of-range case, and exposes a single actionable error-message function for later plans (signup field, settings form, PATCH/availability routes) to reuse
- `lib/profile/display-name.ts`'s pure `profileDisplayTitle()`/`profileHandleSubtitle()` derivation, wired into `buildProfileData()` — a nameless profile's title is now `@handle`, never a fabricated stand-in, and the legal-name columns are structurally unreachable from this code path
- `components/profile/ProfileView.tsx` renders the `@handle` line beneath the header title and computes correct avatar initials (`MR`) for a handle-only title instead of the previous `@` character

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/handles/validate.ts — the single handle-format authority (D-04, D-05)** - `b56fe3f` (feat)
2. **Task 2: lib/profile/display-name.ts + wire into buildProfileData (D-11, D-12)** - `77eafbb` (feat)
3. **Task 3: Render the @handle line under the profile title (D-11)** - `5a2cc58` (feat)

_All three tasks were TDD-style: test file written alongside the implementation, both landed in the same commit per task (tests were never red against a committed implementation — they were authored and verified together before each commit)._

## Files Created/Modified
- `lib/handles/validate.ts` - `isValidHandle()`, `normalizeHandleForCompare()`, `handleFormatError()`, `HANDLE_MIN_LENGTH`/`HANDLE_MAX_LENGTH` constants
- `lib/handles/validate.test.ts` - 17 tests covering every behavior case in the plan
- `lib/profile/display-name.ts` - `profileDisplayTitle()`, `profileHandleSubtitle()`
- `lib/profile/display-name.test.ts` - 8 tests covering the pure functions
- `lib/profile/load.ts` - line 126's `profile.artist_name || 'Unnamed artist'` replaced with `profileDisplayTitle({ artistName: profile.artist_name, handle: profile.handle })`
- `__tests__/profile-load.test.ts` - extended with 2 new `buildProfileData()` cases (nameless-with-handle, nameless-without-handle, including an explicit `/unnamed/i` non-match assertion)
- `components/profile/ProfileView.tsx` - imports and renders `profileHandleSubtitle()` beneath the title; `initials()` strips a leading `@` and splits on whitespace/hyphen/underscore/dot

## Decisions Made
- `handleFormatError()` returns a distinct message per rejection reason (length vs. edge-separator vs. bad-character) rather than one generic string, since the plan states this string is the one the signup field, settings form, and API routes will all surface in later waves — worth getting the message granularity right now rather than revisiting it in plan 03/04.
- No deviation from the plan's exact function signatures or file layout.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment in `lib/profile/display-name.ts` tripped the plan's own verify gate**
- **Found during:** Task 2, running the plan's stated verify command `grep -c 'legal_first_name' lib/profile/display-name.ts | grep -qx 0`
- **Issue:** My first draft of the D-12-boundary section-header comment spelled out the four legal-name column identifiers literally (`legal_first_name/legal_middle_name/legal_last_name/legal_name_suffix`) to document what the module must never read. The plan's own automated verify gate greps for exactly that literal string with no distinction between code and comments, so the comment itself failed the gate — an ironic self-defeat of a comment meant to prove the boundary.
- **Fix:** Reworded the comment to describe the boundary in prose ("the four contract-only legal-name fields on the profile row (first, middle, last, suffix)") without using the literal snake_case column identifiers. The D-12 boundary is unchanged — the module still reads only `artistName`/`handle`/`title` — only the comment's wording changed.
- **Files modified:** `lib/profile/display-name.ts`
- **Verification:** `grep -c 'legal_first_name' lib/profile/display-name.ts` returns `0`; `npx tsc --noEmit` and `npx jest lib/profile/display-name.test.ts __tests__/profile-load.test.ts` both still pass after the edit.
- **Committed in:** `77eafbb` (part of Task 2's commit — caught and fixed before committing, so no separate fix commit was needed)

---

**Total deviations:** 1 auto-fixed (1 bug — a comment tripping its own literal-string verify gate)
**Impact on plan:** No scope creep; no behavior change. The fix was purely to comment wording so the plan's own automated gate (as literally specified) passes while still documenting the D-12 boundary accurately.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `lib/handles/validate.ts` is ready for plan 03 (PATCH route), plan 04 (availability route + signup field), and plan 06 (the D-09 hard gate) to import without writing a second copy of the format regex.
- `lib/profile/display-name.ts` is the shared derivation any later profile-rendering work should call rather than re-deriving a title.
- Did not touch `supabase/migrations/` or `__tests__/migration-*.test.ts` — confirmed a `supabase/migrations/133_handle_identity.sql` file appeared as untracked during this session (created by the parallel 36-02 plan) and was left completely alone, per wave discipline.
- Full suite: 3020/3020 passing (baseline 2993 + 27 new tests from this plan). `npx tsc --noEmit` clean. `npm run lint -- --max-warnings=0` clean. `npm run build` was never run.

---
*Phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d*
*Completed: 2026-08-30*

## Self-Check: PASSED

All 7 created/modified source files and the SUMMARY.md itself verified present on disk; all 3 task commit hashes (`b56fe3f`, `77eafbb`, `5a2cc58`) verified present in `git log`.
