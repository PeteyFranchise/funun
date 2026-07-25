---
phase: 20-profile-table-rename-artist-profiles-to-user-profiles
plan: 02
subsystem: database
tags: [supabase, typescript, rename, jest, regression-guard]

# Dependency graph
requires:
  - phase: 20-profile-table-rename-artist-profiles-to-user-profiles (plan 01)
    provides: migrations 076 (rename + compat view) and 077 (drop compat view), authored but not yet pushed
provides:
  - Every `.from('artist_profiles')` query-string literal repointed to `user_profiles` across ~87 runtime + test call sites
  - `ArtistProfile` TypeScript type renamed to `UserProfile` across `types/index.ts` and all ~20 importers
  - `__tests__/rename/no-artist-profiles-refs.test.ts` — durable grep regression guard against reintroduction
affects: [20-profile-table-rename-artist-profiles-to-user-profiles (plan 03 - cutover/deploy ordering)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Grep-based regression guard test (execFileSync, not shell string) scoped to runtime dirs only, excluding supabase/ and __tests__/ to avoid self-tripping on legitimate historical references"

key-files:
  created:
    - __tests__/rename/no-artist-profiles-refs.test.ts
  modified:
    - types/index.ts
    - 86 other app/lib/components/middleware.ts files (`.from()` call sites)
    - 18 other app/lib/components files (`ArtistProfile` type importers)
    - 8 test files (mock table-name literals/keys: block-enforcement, capability-grant, dm-send-gate, green-room-discover, green-room-feed-api, green-room-placements-admin, profile-privacy-api, trust-safety-reports)

key-decisions:
  - "Left prose comments mentioning artist_profiles unchanged (per plan instruction) even where they document a since-renamed call site — comments are documentation, not completeness-gated"
  - "Left migration-content assertion tests unchanged (migration-054/055/057/058/063/066, claim-collaborators-rpc) — they read and assert against immutable historical migration file text, which legitimately still says artist_profiles"
  - "Left lib/trust-safety/reports.ts's locally-scoped ArtistProfileVisRow type name unchanged — it's an incidental local identifier, not an import of the renamed types/index.ts type, and the plan's word-boundary rename correctly does not match it"

patterns-established:
  - "Regression-guard test pattern for symbol renames: execFileSync + argv array (never a shell string) to avoid quoting issues, grep exit-1-on-no-matches treated as the passing case"

requirements-completed: [D-03]

coverage:
  - id: D1
    description: "Every `.from('artist_profiles')` query-string literal renamed to `user_profiles` in runtime + test code"
    requirement: "D-03"
    verification:
      - kind: unit
        ref: "grep -rn \"['\"]artist_profiles['\"]\" app lib components types middleware.ts --include='*.ts' --include='*.tsx' returns zero matches"
        status: pass
      - kind: unit
        ref: "npx jest (89 -> 90 suites, 1109 -> 1111 tests, all green)"
        status: pass
    human_judgment: false
  - id: D2
    description: "`ArtistProfile` TypeScript type renamed to `UserProfile`, all ~20 importers compile clean"
    requirement: "D-03"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (clean)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Durable grep regression guard added and verified to fail-on-reintroduction"
    requirement: "D-03"
    verification:
      - kind: unit
        ref: "__tests__/rename/no-artist-profiles-refs.test.ts (2 tests, both pass); manually verified fail-on-reintroduction by temporarily appending a `.from('artist_profiles')` line to middleware.ts, confirmed test failure with file:line surfaced, then reverted"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-07-25
status: complete
---

# Phase 20 Plan 02: Mechanical Rename (artist_profiles -> user_profiles) Summary

**Renamed the `ArtistProfile` type to `UserProfile` and all 87 `.from('artist_profiles')` query-string literals to `user_profiles` across the codebase, plus a durable grep regression guard — zero behavior change, full suite green.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-25T04:27:46Z
- **Completed:** 2026-07-25T04:33:37Z
- **Tasks:** 3
- **Files modified:** 89 (88 modified + 1 new test file)

## Accomplishments
- `types/index.ts` now exports `UserProfile` (the name freed by Phase 19); all ~20 importers across `app/`, `lib/`, `components/` switched to `import type { UserProfile } from '@/types'`
- All 86 non-test `.from('artist_profiles')` call sites across `app/`, `lib/`, `middleware.ts` repointed to `.from('user_profiles')`
- 8 test files' mock table-name literals/keys repointed to match the renamed call sites they exercise
- New `__tests__/rename/no-artist-profiles-refs.test.ts` guards against reintroduction of either the old query string or the old type name in runtime code, permanently

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename the ArtistProfile type to UserProfile across types/index.ts and all importers** - `a8df8bb` (feat)
2. **Task 2: Rename every artist_profiles query-string literal to user_profiles across runtime + test code** - `3722a47` (feat)
3. **Task 3: Add a durable grep regression guard test** - `db1ab55` (test)

## Files Created/Modified
- `types/index.ts` - `ArtistProfile` type renamed to `UserProfile`, self-references updated
- `app/api/profile/route.ts`, `app/(artist)/settings/page.tsx`, `app/u/[handle]/page.tsx`, `app/profile/page.tsx`, `components/profile/ProfileForm.tsx`, `lib/profile/load.ts`, `lib/tools/*.ts` (7 files), 4 more app/api route files - importer switch to `UserProfile`
- 65 files under `app/`, `lib/`, `components/`, `middleware.ts` - `.from('artist_profiles')` → `.from('user_profiles')`
- `__tests__/block-enforcement.test.ts`, `capability-grant.test.ts`, `dm-send-gate.test.ts`, `green-room-discover.test.ts`, `green-room-feed-api.test.ts`, `green-room-placements-admin.test.ts`, `profile-privacy-api.test.ts`, `trust-safety-reports.test.ts` - mock table-name literals/keys repointed
- `__tests__/rename/no-artist-profiles-refs.test.ts` - new durable regression guard (2 tests: zero quoted `artist_profiles` literals, zero `ArtistProfile` type tokens, in runtime dirs only)

## Decisions Made
- Left prose comments mentioning `artist_profiles` unchanged (e.g. "never select('*') on artist_profiles") per the plan's explicit instruction — these are documentation, not query strings, and rewriting them was out of scope for this mechanical rename.
- Left the 7 migration-content assertion test files (`migration-054/055/057/058/063/066.test.ts`, `claim-collaborators-rpc.test.ts`) completely unchanged — they `readFileSync` and assert against the literal text of immutable historical migration files (034-073), which legitimately still contain `artist_profiles` since those migrations are never edited.
- Left `lib/trust-safety/reports.ts`'s local `ArtistProfileVisRow` type name unchanged — it's a locally-scoped type unrelated to the imported `types/index.ts` type, and the plan's word-boundary (`\bArtistProfile\b`) rename correctly does not match a substring inside a longer identifier.

## Deviations from Plan

None - plan executed exactly as written. All three tasks matched their `<action>` and `<verify>` blocks; no Rule 1-4 auto-fixes were needed since this was a pure mechanical find/replace against passing infrastructure.

## Issues Encountered

First `git commit` attempt for Task 2 failed with a bash heredoc quoting error (unrelated to file content — a shell escaping issue in the commit message construction). Resolved by using multiple `-m` flags instead of a single heredoc-quoted message; no code or test changes were affected.

## User Setup Required

None - no external service configuration required. This plan is authored-but-not-deployed: the renamed code reads `user_profiles`, which only exists in the live database once migration 076 (authored in plan 20-01) is pushed by the human. That ordering is enforced by plan 20-03, not this plan.

## Next Phase Readiness
- Code-side rename is complete and behavior-preserving: `tsc --noEmit` clean, `npx jest` fully green (90 suites / 1111 tests, up from 89/1109 with the new guard test), `npm run lint` clean.
- SAFETY REMINDER (carried from the plan): this code must NOT deploy to production until migration 076 has landed against the live database — deploying it earlier would 404 every `user_profiles` read. Plan 20-03 owns that cutover ordering (076 push → deploy → smoke tests → 077 push).
- Ready for 20-03 (cutover) once the human pushes migration 076.

## Self-Check: PASSED
