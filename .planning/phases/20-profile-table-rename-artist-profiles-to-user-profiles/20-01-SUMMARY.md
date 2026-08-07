---
phase: 20-profile-table-rename-artist-profiles-to-user-profiles
plan: 01
subsystem: database
tags: [postgres, supabase, rls, security-invoker, rename, migrations]

# Dependency graph
requires:
  - phase: 19-profile-identity-model-cleanup
    provides: freed the `user_profiles` relation name (migration 073 dropped the old duplicate table) and the claim_collaborators()/backfill_claimed_collaborators() repoint-to-artist_profiles precedent (migration 072) this plan's function bodies follow
provides:
  - "Migration 076: ALTER TABLE artist_profiles RENAME TO user_profiles + CREATE OR REPLACE for the 6 functions whose bodies reference the table + a security_invoker=on compat view + column-scoped GRANTs + NOTIFY pgrst"
  - "Migration 077: DROP VIEW IF EXISTS public.artist_profiles + NOTIFY pgrst, precondition-gated on D-04 (smoke-test) and D-05 (soak)"
affects: [20-02, 20-03, 20-04, any future phase touching the profile table]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PG15 security_invoker=on compat view for zero-downtime table renames (first use of this clause in this repo)"
    - "Column-scoped GRANT re-issuance on a view (views do not inherit base-table grants)"

key-files:
  created:
    - supabase/migrations/076_rename_artist_profiles_to_user_profiles.sql
    - supabase/migrations/077_drop_artist_profiles_compat_view.sql
  modified: []

key-decisions:
  - "Included migration 058's profile_visibility/open_to_visibility columns in the view's SELECT grant list, beyond the plan task's literal 040/043/054 wording, after direct grep confirmed 058 is a real 4th grant-extending migration (RESEARCH.md's own prose cites 040/043/054/058 as the cumulative set) — omitting it would have broken the public profile route's read of those two columns through the view during the deploy gap"
  - "handle_new_user() preserved with no SET search_path clause (its current live body genuinely has none) rather than adding one, since the task instructs verbatim-copy-except-table-name, not introducing new hardening not present in the source"
  - "Added one RE-POINTED comment per function (near its first table reference) rather than one per every individual line, following migration 072's own established commenting density for this exact repoint pattern"

requirements-completed: [D-01]

coverage:
  - id: D1
    description: "Migration 076 authored: OID-preserving rename, 6 repointed SECURITY DEFINER functions, security_invoker=on compat view, column-scoped grants (no blanket GRANT ALL), defensive service_role grant, NOTIFY pgrst"
    requirement: "D-01"
    verification:
      - kind: other
        ref: "static grep assertions (Task 1 <verify> block): ALTER TABLE RENAME present, CREATE VIEW ... WITH (security_invoker = on) present, >=6 CREATE OR REPLACE FUNCTION blocks, NOTIFY pgrst present, never-db-push header line present, no blanket GRANT ALL to authenticated/anon"
        status: pass
    human_judgment: true
    rationale: "Live-DB correctness (grant parity against information_schema.role_column_grants, security_invoker actually taking effect, function repoints not breaking signup/Green Room queries) cannot be verified without pushing to the remote database — that push is this phase's human-gated checkpoint (plan 20-03), by design. Static file assertions only prove the file's shape, not runtime behavior."
  - id: D2
    description: "Migration 077 authored: single DROP VIEW IF EXISTS public.artist_profiles + NOTIFY pgrst, gated by a header precondition citing D-04 (smoke-test gate) and D-05 (soak)"
    requirement: "D-01"
    verification:
      - kind: other
        ref: "static grep assertions (Task 2 <verify> block): DROP VIEW IF EXISTS public.artist_profiles present, NOTIFY pgrst present, D-04 and D-05 referenced, no ALTER TABLE statement"
        status: pass
    human_judgment: true
    rationale: "This migration's correctness (dropping the view at the right time, after the real smoke-test/soak gates have actually passed in production) is inherently a live-deploy, human-gated decision (plan 20-04) — no static check can confirm the precondition was genuinely satisfied at push time."

# Metrics
duration: ~20min
completed: 2026-07-25
status: complete
---

# Phase 20 Plan 01: Author Rename Migrations Summary

**Authored (not pushed) migrations 076 and 077: the zero-downtime `artist_profiles` -> `user_profiles` rename via an OID-preserving `ALTER TABLE RENAME`, a `security_invoker=on` compatibility view, 6 repointed `SECURITY DEFINER` functions, and exact column-scoped grants — plus the follow-up view drop, both gated for human-run `supabase db push`.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-25T04:23:58Z
- **Tasks:** 2/2
- **Files modified:** 2 (both new files)

## Accomplishments
- Migration 076 (`076_rename_artist_profiles_to_user_profiles.sql`): `ALTER TABLE artist_profiles RENAME TO user_profiles`, `CREATE OR REPLACE FUNCTION` for `handle_new_user` (both industry and default/artist INSERT branches), `clear_featured_if_unpublished`, `green_room_post_matches_custom_audience`, `green_room_can_view_post`, `claim_collaborators`, and `backfill_claimed_collaborators` — each repointed from `public.artist_profiles` to `public.user_profiles` with `SECURITY DEFINER`/`SET search_path`/`LANGUAGE` clauses preserved byte-for-byte from their current live bodies.
- `CREATE VIEW artist_profiles WITH (security_invoker = on) AS SELECT * FROM user_profiles` — the RLS-preserving compat view, first use of `security_invoker` in this repo.
- Column-scoped `GRANT SELECT`/`GRANT UPDATE` on the view reproducing the exact cumulative grant history from migrations 040 (base lists), 043 (`allow_resharing`), 054 (`last_seen_at`), and 058 (`profile_visibility`, `open_to_visibility`) — verified via direct grep of every `ON artist_profiles TO` statement in the migration history, not estimation. No blanket `GRANT ALL` to `authenticated`/`anon`. A defensive `GRANT ALL ... TO service_role` was added per RESEARCH Assumption A1.
- `claim_collaborators`/`backfill_claimed_collaborators` CREATE OR REPLACE blocks add **no** new `GRANT EXECUTE` line, preserving migration 075's service_role-only lockdown.
- Migration 077 (`077_drop_artist_profiles_compat_view.sql`): `DROP VIEW IF EXISTS public.artist_profiles;` + `NOTIFY pgrst, 'reload schema';`, with a header precondition block explicitly citing D-04 (smoke-test gate) and D-05 (soak period).
- Both files carry the "An executor agent must NEVER run `supabase db push`" header line; no `supabase db push` was run.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author migration 076** - `26405db` (feat)
2. **Task 2: Author migration 077** - `ad257c6` (feat)

_Note: this plan is purely file authorship — no separate metadata commit was needed beyond this SUMMARY's own commit._

## Files Created/Modified
- `supabase/migrations/076_rename_artist_profiles_to_user_profiles.sql` - the rename + view + function repoints + grants + NOTIFY
- `supabase/migrations/077_drop_artist_profiles_compat_view.sql` - the view drop, gated on D-04/D-05

## Decisions Made
- Folded migration 058's `profile_visibility`/`open_to_visibility` columns into the view's SELECT grant list. The plan Task 1 action text literally names only migrations 040/043/054, but RESEARCH.md's own prose repeatedly cites "040/043/054/058" as the cumulative grant-extending set, and a direct `grep -rn "ON artist_profiles TO" supabase/migrations/` confirmed 058 genuinely adds `GRANT SELECT (profile_visibility, open_to_visibility) ON artist_profiles TO authenticated, anon;`. Omitting it would have left the compat view unable to serve those two columns to old code during the deploy gap — a correctness bug under Deviation Rule 1, not scope creep.
- Preserved `handle_new_user()`'s existing lack of a `SET search_path = ''` clause rather than adding one — the task instructs a verbatim body copy with only the table identifier changed; introducing new hardening not present in the current live function would be an undocumented behavior change outside this plan's scope.
- Used one `-- RE-POINTED (Phase 20)` comment per function (at its first table reference) rather than one per individual changed line, matching migration 072's own commenting density for the identical repoint pattern (072 repoints many `artist_profiles` references per function with a single leading comment, not one per line).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/Correctness] Included migration 058's grant columns in the view's SELECT list**
- **Found during:** Task 1 (authoring migration 076's GRANT block)
- **Issue:** The plan Task 1 action text's literal wording only names migrations 040/043/054 as the source of the view's column-scoped grants. A full grep of the migration history showed migration 058 also grants `SELECT (profile_visibility, open_to_visibility) ON artist_profiles TO authenticated, anon` — a real, currently-live grant this plan's own RESEARCH.md repeatedly cites as part of the cumulative set (040/043/054/058). Omitting it from the view would have produced `42501 permission denied` for those two columns for any old code (e.g. the public profile route) reading them through the compat view during the deploy gap.
- **Fix:** Added `profile_visibility, open_to_visibility` to the view's `GRANT SELECT` column list, with an inline comment documenting the source (migration 058) and the `[ASSUMED ... verify at 20-03 push checkpoint]` caveat carried over from RESEARCH.md Open Question 1.
- **Files modified:** `supabase/migrations/076_rename_artist_profiles_to_user_profiles.sql`
- **Verification:** Confirmed via `grep -rn -B2 "ON artist_profiles TO" supabase/migrations/*.sql` that exactly four migrations (040, 043, 054, 058) grant against this table, with zero others.
- **Committed in:** `26405db` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 correctness fix)
**Impact on plan:** Strictly additive correctness fix inside the exact mechanism (the view's GRANT list) the plan already specified as in-scope. No architectural change, no scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. The two authored migration files require a human-run `supabase db push` at the plan 20-03 (migration 076) and plan 20-04 (migration 077) checkpoints, per this phase's human-gated migration protocol — that push is intentionally NOT part of this plan's scope.

## Next Phase Readiness
- Both migration files are authored, statically verified (all Task 1/Task 2 `<verify>` grep assertions pass), and committed. `git status` on `supabase/migrations/` shows only the two new files — no historical migration was edited.
- Ready for plan 20-02 (the TypeScript symbol rename: `.from('artist_profiles')` -> `.from('user_profiles')` and `ArtistProfile` -> `UserProfile` across ~97 runtime files), which can proceed independently of the live DB push since it's a code-only change gated on `tsc --noEmit` (D-03).
- The live-DB correctness of migration 076 (grant parity against `information_schema.role_column_grants`, `security_invoker` actually enforcing RLS through the view, the 6 function repoints not breaking signup/Green Room queries) is NOT yet verified — that is plan 20-03's human-gated push checkpoint, by design.
- Open item carried forward to the 20-03 checkpoint (RESEARCH.md Open Question 1): re-verify the view's exact column grant lists against a live `information_schema.role_column_grants` query for `table_name = 'artist_profiles'` before pushing 076, as a belt-and-suspenders check against this plan's migration-file-based reconstruction.

---
*Phase: 20-profile-table-rename-artist-profiles-to-user-profiles*
*Completed: 2026-07-25*

## Self-Check: PASSED

- FOUND: supabase/migrations/076_rename_artist_profiles_to_user_profiles.sql
- FOUND: supabase/migrations/077_drop_artist_profiles_compat_view.sql
- FOUND: .planning/phases/20-profile-table-rename-artist-profiles-to-user-profiles/20-01-SUMMARY.md
- FOUND commit: 26405db
- FOUND commit: ad257c6
