---
phase: 09-rich-member-profile
plan: 01b
subsystem: api
tags: [zod, supabase, postgrest, nextjs, profile]

# Dependency graph
requires:
  - phase: 09-01a
    provides: The four Wave 0 RED Jest tests (profile-roles-validation, featured-project-validation, profile-load) whose exact import names/assertions this plan's exports must satisfy
provides:
  - "lib/profile/validate.ts: ProfileRoleSchema, sanitizeProfileRoles(), filterOpenTo(), isFeaturableProjectRow() pure validators"
  - "PATCH /api/profile EDITABLE_FIELDS extended with pronouns/roles/open_to/avatar_url/banner_url/featured_project_id/allow_resharing, each field-validated"
  - "buildProfileData() placementsCount option threaded through ProfileData and app/u/[handle]/page.tsx's Promise.all"
  - "supabase/migrations/043_profile_allow_resharing.sql (NOT yet pushed to remote — blocked on Task 4 checkpoint)"
affects: [09-02, 09-03, 09-04, 09-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sanitize() in app/api/profile/route.ts made async, taking (body, service, userId) — enables a service-client DB pre-check (featured_project_id ownership/is_public) inside the same allowlist loop, returning a discriminated { update } | { error, status } result instead of a bare object"
    - "Pure validators (isFeaturableProjectRow, sanitizeProfileRoles, filterOpenTo) extracted to lib/profile/validate.ts and unit-tested against fixture data, decoupled from the live DB — the route only does I/O (the fetch) then calls the pure predicate"

key-files:
  created:
    - lib/profile/validate.ts
    - supabase/migrations/043_profile_allow_resharing.sql
  modified:
    - app/api/profile/route.ts
    - lib/profile/load.ts
    - components/profile/ProfileView.tsx
    - app/u/[handle]/page.tsx

key-decisions:
  - "isFeaturableProjectRow() returns 'ok' | 'not-found' | 'rejected-not-public' (hyphenated), not the PLAN.md action text's 'ok' | 'not_found' | 'not_public' (underscored) — the RED test __tests__/featured-project-validation.test.ts asserts the hyphenated strings literally; the test is the authoritative contract per this plan's read_first instruction, so the test's exact strings were implemented"
  - "sanitizeProfileRoles() always returns ProfileRole[] (never null) — PLAN.md's action text says 'or null when invalid', but __tests__/profile-roles-validation.test.ts asserts [] for every invalid-input case (unknown slug, empty/overlong custom label, non-array payload), never null; implemented to satisfy the RED test exactly"
  - "Migration 043's column type is written lowercase 'boolean' (not the repo's usual uppercase BOOLEAN convention seen in migrations 010/034) because the plan's own automated <verify> grep for Task 3 is case-sensitive for the literal string 'allow_resharing boolean'"

requirements-completed: [PROFILE-02, PROFILE-04, PROFILE-05, PROFILE-06]  # Migration 043 confirmed live on REMOTE (Task 4 checkpoint approved)

coverage:
  - id: D1
    description: "lib/profile/validate.ts exports ProfileRoleSchema/sanitizeProfileRoles/filterOpenTo/isFeaturableProjectRow satisfying 09-01a's two RED test files"
    requirement: "PROFILE-02"
    verification:
      - kind: unit
        ref: "__tests__/profile-roles-validation.test.ts"
        status: pass
      - kind: unit
        ref: "__tests__/featured-project-validation.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "PATCH /api/profile allowlist extended with 7 new fields, each validated; featured_project_id pre-check returns friendly 404/400, not a raw trigger exception"
    requirement: "PROFILE-05"
    verification:
      - kind: other
        ref: "grep -c \"featured_project_id must reference\" app/api/profile/route.ts (returns 0)"
        status: pass
    human_judgment: true
    rationale: "No integration test exercises the live PATCH handler end-to-end (auth + service-client DB round trip); confirmed by code inspection + unit tests of the underlying pure validators only"
  - id: D3
    description: "buildProfileData() derives placementsCount from a passed option; app/u/[handle]/page.tsx sources it via an activity_events COUNT query added to the existing Promise.all"
    requirement: "PROFILE-06"
    verification:
      - kind: unit
        ref: "__tests__/profile-load.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Migration 043 (artist_profiles.allow_resharing boolean, public-read GRANT SELECT) pushed live to the remote database"
    requirement: "PROFILE-05"
    verification:
      - kind: other
        ref: "npx supabase migration list (043 populated in both LOCAL and REMOTE columns, matching migrations 001-042)"
        status: pass
    human_judgment: true
    rationale: "BLOCKING checkpoint (Task 4) — operator ran `supabase db push` against production. Independently re-confirmed via `npx supabase migration list`: 043 shows LOCAL=REMOTE, matching every prior migration row's format."

duration: ~15min (Tasks 1-3) + operator push time (Task 4)
completed: 2026-07-12
status: complete
---

# Phase 9 Plan 01b: Profile validators, PATCH allowlist, placements stat, migration 043 Summary

**Zod-validated roles/open_to/featured_project_id branches added to PATCH /api/profile, placementsCount threaded through buildProfileData via an activity_events COUNT, and migration 043 (allow_resharing) authored and pushed live to the remote database — plan complete.**

## Performance

- **Duration:** ~15 min (Tasks 1-3) + operator push time (Task 4)
- **Tasks:** 4 of 4 completed (Task 4 blocking checkpoint approved — operator ran `supabase db push`, confirmed via `npx supabase migration list`)
- **Files modified:** 6 (1 new validator module, 1 new migration, 4 extended source files)

## Accomplishments

- `lib/profile/validate.ts` created, exporting the four pure validators 09-01a's RED tests import (`ProfileRoleSchema`, `sanitizeProfileRoles`, `filterOpenTo`, `isFeaturableProjectRow`) — both RED test files (`profile-roles-validation.test.ts`, `featured-project-validation.test.ts`) now GREEN.
- `app/api/profile/route.ts`'s `EDITABLE_FIELDS` grown from 22 to 29 fields (`pronouns`, `roles`, `open_to`, `avatar_url`, `banner_url`, `featured_project_id`, `allow_resharing`), each with a dedicated `sanitize()` branch; `featured_project_id` pre-checks ownership + `is_public` via the service client before writing, returning "Release not found" (404) or "Only public releases can be featured — publish it first." (400) instead of letting migration 034's DB trigger exception reach the client raw.
- `buildProfileData()` gained a `placementsCount` options-bag input (default `null`), passed through to `ProfileData`; `app/u/[handle]/page.tsx`'s existing `Promise.all` gained a fourth query counting `activity_events` rows with `kind='placement'` for the profile — `profile-load.test.ts` now GREEN.
- Migration `043_profile_allow_resharing.sql` created: `artist_profiles.allow_resharing boolean NOT NULL DEFAULT true`, with a public-read `GRANT SELECT (allow_resharing)` in the same migration (migration-031/040 column-privilege rule), no `REVOKE` (not private data).
- Full Jest suite (58 tests, 8 suites) and `npx tsc --noEmit` both clean after Task 3.

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/profile/validate.ts validators + PATCH /api/profile allowlist extension (GREEN)** - `ec2aaca` (feat)
2. **Task 2: buildProfileData placements + u/[handle] placements query (GREEN)** - `1f5d393` (feat)
3. **Task 3: Migration 043 — allow_resharing column with column-privilege lockdown** - `e23b331` (feat)
4. **Task 4: [BLOCKING] Push migration 043 to the remote database** - Operator ran `supabase db push`; confirmed live via `npx supabase migration list` (043 populated LOCAL+REMOTE)

_Note: TDD tasks may have multiple commits (test → feat → refactor). Here, Tasks 1-2 were `tdd="true"` but the RED tests already existed from 09-01a, so this plan's commits are the GREEN step only — no separate RED commit was needed in this plan._

## Files Created/Modified

- `lib/profile/validate.ts` - New: `ProfileRoleSchema` (Zod discriminated union), `sanitizeProfileRoles()`, `filterOpenTo()`, `isFeaturableProjectRow()`
- `app/api/profile/route.ts` - `EDITABLE_FIELDS` extended; `sanitize()` made async, takes `(body, service, userId)`, returns `{ update } | { error, status }`; new branches for `roles`/`open_to`/`allow_resharing`/`featured_project_id`
- `lib/profile/load.ts` - `buildProfileData()` options bag gained `placementsCount?: number | null`, passed through to the return value
- `components/profile/ProfileView.tsx` - `ProfileData` type gained `placementsCount: number | null` (type only — no render change; Plan 05 owns the Stats-card row)
- `app/u/[handle]/page.tsx` - `Promise.all` gained a 4th query (`activity_events` COUNT where `kind='placement'`); `placementsCount` threaded into the `buildProfileData()` call; DEMO branch sets `placementsCount = 1` to match its one `kind: 'placement'` mock activity item
- `supabase/migrations/043_profile_allow_resharing.sql` - New: `allow_resharing boolean NOT NULL DEFAULT true` + public-read `GRANT SELECT`

## Decisions Made

- `isFeaturableProjectRow()`'s return-value strings follow the RED test exactly (`'not-found'` / `'rejected-not-public'` / `'ok'`), not PLAN.md's prose description (`'not_found'` / `'not_public'` / `'ok'`) — the test file is the binding contract per this plan's `read_first` instruction ("this task's exports MUST satisfy their import names and assertions exactly").
- `sanitizeProfileRoles()` always returns an array, never `null`, for the same reason — every invalid-input case in the RED test expects `[]`, not `null`. The function signature is typed `ProfileRole[]` (not `ProfileRole[] | null` as PLAN.md's action text suggested) since that's what the implementation actually does; `route.ts`'s `roles` branch assigns the result directly rather than skip-on-null (dead code was avoided rather than kept for a codepath that never triggers).
- Migration 043's `allow_resharing boolean` column-type keyword is written lowercase to satisfy the plan's own case-sensitive automated verify grep (`grep -c "allow_resharing boolean"`), diverging from the repo's usual uppercase `BOOLEAN` SQL style seen in migrations 010/034. Not a functional difference (Postgres type keywords are case-insensitive).
- `sanitize()` in `app/api/profile/route.ts` was changed from a synchronous pure function to an async function taking the service client and `userId` as parameters, so the `featured_project_id` ownership + `is_public` pre-check (a DB read) can run inside the same allowlist loop and short-circuit with a friendly error before any write is attempted. `PATCH` now creates the service client before calling `sanitize()` (previously created after) — no functional change to the write path itself.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `isFeaturableProjectRow` / `sanitizeProfileRoles` return-value contract corrected to match the actual RED tests, not PLAN.md's prose**
- **Found during:** Task 1
- **Issue:** PLAN.md's task description said `isFeaturableProjectRow` returns `'ok' | 'not_found' | 'not_public'` and `sanitizeProfileRoles` returns `ProfileRole[] | null`. The actual RED test files from 09-01a (`__tests__/featured-project-validation.test.ts`, `__tests__/profile-roles-validation.test.ts`) assert `'not-found'`/`'rejected-not-public'` (hyphenated) and `[]` (never `null`) respectively.
- **Fix:** Implemented to match the RED tests literally, since those are the binding, machine-checked contract; PLAN.md's prose was imprecise.
- **Files modified:** `lib/profile/validate.ts`, `app/api/profile/route.ts`
- **Verification:** `npx jest __tests__/profile-roles-validation.test.ts __tests__/featured-project-validation.test.ts` — 11/11 pass
- **Committed in:** `ec2aaca`

---

**Total deviations:** 1 auto-fixed (Rule 1 — plan-prose/test-contract mismatch, resolved in favor of the test)
**Impact on plan:** No scope creep. The actual behavior shipped is what 09-01a's RED tests require; only the return-value string casing/nullability differs from PLAN.md's descriptive text, not from the tested contract.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

**Complete.** Task 4 of this plan was a BLOCKING checkpoint (`type="checkpoint:human-verify" gate="blocking"`, `autonomous: false`): the operator ran `supabase db push` from the repo root, applying migration 043 to the remote database (project ref `wgfjakfiyeewzfuxkgyo`). This agent did not run the push itself — per explicit instruction, this was operator-executed as a real production schema migration.

## Next Phase Readiness

**Plan complete.** All 4 tasks done, committed, and verified:
- Tasks 1-3: 58/58 Jest tests pass, `tsc --noEmit` clean, all acceptance-criteria greps pass.
- Task 4: Operator ran `supabase db push`; independently re-confirmed via `npx supabase migration list` — migration 043 shows LOCAL and REMOTE both populated, matching every migration 001-042's row format.

**Downstream impact:** Plans 09-02 through 09-05 all depend on this plan's DB/API layer (they write to the new profile fields, read `allow_resharing`, and render `placementsCount`) — all are now unblocked.

---
*Phase: 09-rich-member-profile*
*Status: Complete — all 4 tasks done, migration 043 confirmed live on remote*

## Self-Check: PASSED

All 6 created/modified files confirmed present on disk; all 4 commit hashes (`ec2aaca`, `1f5d393`, `e23b331`, `f407c98`) confirmed present in `git log --oneline --all`.
