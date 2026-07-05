---
phase: 08-identity-schema-foundation
plan: 01
subsystem: database
tags: [postgres, supabase, tsvector, full-text-search, triggers, typescript]

requires: []
provides:
  - artist_profiles.member_type discriminant column (unified member-identity model root)
  - artist_profiles.search_vector generated tsvector column + GIN index (people-search substrate for Phase 12)
  - D-16 featured-spotlight integrity triggers (check_featured_project_is_public, clear_featured_if_unpublished)
  - ArtistProfile TypeScript type extended with member_type/search_vector
affects: [09-rich-member-profile, 12-discovery-people-search, 08-05-schema-push]

tech-stack:
  added: []
  patterns:
    - "Generated STORED tsvector column using two-arg to_tsvector('english', ...) form (single-arg form is not IMMUTABLE-valid for a GENERATED column)"
    - "coalesce(array_to_string(arr, ' '), '') guard — array_to_string() returns NULL (not '') when its array argument is NULL, which would otherwise NULL out an entire || concatenation"

key-files:
  created:
    - supabase/migrations/034_member_identity_wave4.sql
  modified:
    - types/index.ts
    - lib/profile/load.ts
    - "app/(artist)/settings/page.tsx"

key-decisions:
  - "vault_projects' published-status column is confirmed as `is_public` (migration 001) — matches the RESEARCH skeleton verbatim, no correction needed"
  - "the four already-live migration-010 showcase columns (banner_url, pronouns, open_to, featured_project_id) are re-asserted via ADD COLUMN IF NOT EXISTS no-ops purely to document the full Phase 8 identity set in one migration file — no data or type risk"
  - "search_vector's array_to_string() calls are each wrapped in coalesce(..., '') — a bug in the RESEARCH skeleton's illustrative SQL where a NULL genres or industry_roles array would NULL out the entire generated column via the || operator, silently breaking search for that profile"

patterns-established:
  - "Migration header banner convention followed: Funūn — Wave N: <name> / Migration NNN: <summary> / Run via: supabase db push"

requirements-completed: []

coverage:
  - id: D1
    description: "Migration 034 adds member_type (TEXT, CHECK artist|industry, NOT NULL DEFAULT 'artist') to artist_profiles"
    verification:
      - kind: other
        ref: "grep supabase/migrations/034_member_identity_wave4.sql for member_type TEXT NOT NULL DEFAULT 'artist' and CHECK (member_type IN ...)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Migration 034 adds search_vector GENERATED ALWAYS AS STORED tsvector column (two-arg to_tsvector form, coalesced array_to_string flattening) plus idx_artist_profiles_search_vector GIN index"
    verification:
      - kind: other
        ref: "grep supabase/migrations/034_member_identity_wave4.sql for search_vector tsvector, GENERATED ALWAYS AS, to_tsvector('english',, array_to_string(genres, array_to_string(industry_roles, USING GIN (search_vector), idx_artist_profiles_search_vector — all present; no bare single-arg to_tsvector( call found"
        status: pass
    human_judgment: false
  - id: D3
    description: "Migration 034 adds D-16 featured-spotlight integrity: check_featured_project_is_public() BEFORE INSERT/UPDATE trigger on artist_profiles, clear_featured_if_unpublished() AFTER UPDATE trigger on vault_projects.is_public"
    verification:
      - kind: other
        ref: "grep supabase/migrations/034_member_identity_wave4.sql for both function/trigger names — present, verbatim from RESEARCH Code Examples"
        status: pass
    human_judgment: true
    rationale: "SQL syntax was reviewed against migration precedent (010, 020, 022, 033) and matches the RESEARCH skeleton, but this sandbox has no linked Supabase project (no supabase/config.toml) so `npx supabase db push --dry-run` cannot execute here — no autonomous DB-level proof the SQL applies cleanly. The real push and `\\d artist_profiles` / pg_indexes verification is explicitly deferred to plan 08-05's blocking push task per this plan's own <verification> section."
  - id: D4
    description: "ArtistProfile TypeScript type extended with member_type ('artist' | 'industry') and search_vector (string | null)"
    verification:
      - kind: other
        ref: "npx tsc --noEmit exits 0 after adding the two fields and updating two DEMO_PROFILE mock literals (lib/profile/load.ts, app/(artist)/settings/page.tsx)"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-04
status: complete
---

# Phase 8 Plan 1: Identity Schema — member_type, search_vector, Featured-Spotlight Integrity Summary

**Migration 034 adds the two genuinely-new Wave 4 identity columns (`member_type`, generated `search_vector` tsvector + GIN index) and the D-16 featured-spotlight integrity triggers to `artist_profiles`/`vault_projects`; `ArtistProfile` type extended to match.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-04T23:23:00-04:00 (approx.)
- **Completed:** 2026-07-04T23:36:00-04:00
- **Tasks:** 2 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- Migration `034_member_identity_wave4.sql` written: `member_type` discriminant column (the root of Wave 4's unified member-identity model — no parallel `industry_profiles` table), generated `search_vector` tsvector column with GIN index for Phase 12 people-search, and the two D-16 triggers preventing a private-draft `vault_project` from ever leaking through a profile's Featured spotlight.
- `ArtistProfile` TypeScript type extended with `member_type` and `search_vector`, keeping the hand-maintained type in sync with the new columns.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write migration 034 — member_type, search_vector, GIN index, featured-spotlight integrity triggers** - `21a60a3` (feat)
2. **Task 2: Extend ArtistProfile type with member_type and search_vector** - `e7003b2` (feat)

**Plan metadata:** committed alongside this SUMMARY (docs: complete plan)

## Files Created/Modified
- `supabase/migrations/034_member_identity_wave4.sql` - member_type + search_vector + GIN index + D-16 featured-spotlight integrity triggers
- `types/index.ts` - ArtistProfile type gains `member_type: 'artist' | 'industry'` and `search_vector: string | null`
- `lib/profile/load.ts` - DEMO_PROFILE mock literal updated with the two new required fields (Rule 3 blocking-fix)
- `app/(artist)/settings/page.tsx` - DEMO_PROFILE mock literal updated with the two new required fields (Rule 3 blocking-fix)

## Decisions Made
- Confirmed `vault_projects`' publish-status column is `is_public` (migration 001) by grepping the schema before writing the trigger — matches the RESEARCH skeleton exactly, no naming correction needed.
- Kept the four already-live migration-010 showcase columns (`banner_url`, `pronouns`, `open_to`, `featured_project_id`) as `ADD COLUMN IF NOT EXISTS` no-ops in migration 034, per plan instructions, purely for self-documentation of the full identity column set.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Guarded `array_to_string()` against NULL array arguments in the `search_vector` generated expression**
- **Found during:** Task 1
- **Issue:** The RESEARCH.md Code Examples skeleton (and this plan's action text) composed `search_vector` via `array_to_string(genres, ' ') || ...` and `array_to_string(industry_roles, ' ') || ...` without a coalesce guard. Both `genres` (migration 022) and `industry_roles` (migration 021) are `TEXT[]` columns that are nullable in practice (`DEFAULT '{}'` but no `NOT NULL` constraint). `array_to_string()` returns `NULL` — not `''` — when its array argument is `NULL`, and `NULL || anything` is `NULL`, which would silently NULL out the entire generated `search_vector` for any profile whose `genres` or `industry_roles` had been explicitly set to `NULL`, breaking search for that profile with no error surfaced.
- **Fix:** Wrapped each `array_to_string(...)` call in `coalesce(..., '')` in the generated column expression.
- **Files modified:** `supabase/migrations/034_member_identity_wave4.sql`
- **Commit:** `21a60a3` (part of Task 1 commit)

**2. [Rule 3 - Blocking] Updated two `DEMO_PROFILE` mock literals to satisfy the extended `ArtistProfile` type**
- **Found during:** Task 2
- **Issue:** `npx tsc --noEmit` failed with `TS2739` in `lib/profile/load.ts` and `app/(artist)/settings/page.tsx` — both files construct a full `ArtistProfile` object literal for `NEXT_PUBLIC_VAULT_DEMO` mode, and both were now missing the newly-required `member_type`/`search_vector` fields.
- **Fix:** Added `member_type: 'artist'` and `search_vector: null` to both `DEMO_PROFILE` literals.
- **Files modified:** `lib/profile/load.ts`, `app/(artist)/settings/page.tsx`
- **Commit:** `e7003b2` (part of Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 3)
**Impact on plan:** Both fixes necessary for correctness (search_vector null-out bug) and for the plan's own acceptance criteria (`tsc --noEmit` exits 0). No scope creep — no new features, no architectural changes.

## Issues Encountered

- `npx supabase db push --dry-run` (Task 1's specified automated verification) cannot run in this sandbox: there is no `supabase/config.toml` and no linked Supabase project (`Have you set up the project with supabase init?`). This is a pre-existing environment limitation, consistent with prior phases (e.g. `06-01-SUMMARY.md`), not something introduced by this plan. In its place, the migration SQL was manually verified against: (a) every acceptance-criteria grep pattern in the plan (all passed — see coverage D1/D2/D3), and (b) direct comparison against migration precedent (010, 020, 022, 033 header/ADD COLUMN conventions) and the RESEARCH.md Code Examples skeleton (verbatim except the Rule 1 coalesce fix above). The plan's own `<verification>` section explicitly defers the real push and live `\d artist_profiles` / `pg_indexes` check to plan 08-05's blocking push task, so this does not block plan 08-01 completion.

## User Setup Required

None for this plan. Migration 034 will be pushed to the live database as part of plan 08-05's blocking push task (per this plan's own deferred verification note); no other external service configuration required here.

## Next Phase Readiness

- `member_type` and `search_vector` (plus the D-16 integrity triggers) are ready to ship once migration 034 is pushed in plan 08-05.
- `ArtistProfile` type is in sync with the new columns, unblocking any Phase 8 plan or Phase 9 UI work that needs to read/write `member_type`/`search_vector` in application code ahead of the live push.
- No blockers. The only open item is the deferred live-DB push (tracked in plan 08-05, not this plan).

---
*Phase: 08-identity-schema-foundation*
*Completed: 2026-07-04*

## Self-Check: PASSED

- FOUND: supabase/migrations/034_member_identity_wave4.sql
- FOUND: types/index.ts
- FOUND: .planning/phases/08-identity-schema-foundation/08-01-SUMMARY.md
- FOUND: 21a60a3 (Task 1 commit)
- FOUND: e7003b2 (Task 2 commit)
