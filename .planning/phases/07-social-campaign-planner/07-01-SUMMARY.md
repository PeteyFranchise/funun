---
phase: 07-social-campaign-planner
plan: 01
subsystem: database
tags: [supabase, postgres, rls, jsonb, typescript]

# Dependency graph
requires:
  - phase: 06-playlist-pitching
    provides: RLS denormalized-owner-column pattern (pitch_history, migration 030), partial-unique-index pattern (migration 032)
provides:
  - social_campaigns table (RLS-secured, one-active-per-project invariant enforced at the DB layer)
  - lib/launchpad/campaigns.ts typed JSONB read/sanitize layer (readPosts/sanitizeSlotEdit) — the sole access path for social_campaigns.posts
  - lib/launchpad/platform-nudges.ts genre-to-platform advisory resolver
affects: [07-02, 07-03, 07-04, 07-05, 07-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "JSONB array-of-objects read/sanitize split (readPosts/sanitizeSlotEdit), mirrors lib/metadata/schema.ts's readComposers/sanitizeComposers"
    - "Denormalized user_id RLS column on a project-child table, mirrors pitch_history (migration 030)"
    - "Partial unique index as DB-level invariant backstop, mirrors migration 032"
    - "Genre resolver with profile-slug-preferred + free-text-alias-fallback + graceful-empty-on-no-match, mirrors lib/benchmarks/engine.ts's GENRE_FACTORS lookup"

key-files:
  created:
    - supabase/migrations/033_social_campaigns.sql
    - lib/launchpad/campaigns.ts
    - lib/launchpad/platform-nudges.ts
  modified: []

key-decisions:
  - "Migration 033 applied to the live Supabase DB by the user directly via Dashboard SQL Editor (executor sandbox has no Supabase CLI credentials — established Phase 6 convention for migration 030)"
  - "hip_hop_rap's platform ranking corrected from the RESEARCH.md source table's 'TikTik' typo to 'tiktok' per plan instruction"
  - "getPlatformNudges/getPlatformNudgeRationale share one internal resolveNudge() helper to keep the profile-slug-first, free-text-alias-fallback, empty-on-no-match resolution logic in one place"

patterns-established:
  - "lib/launchpad/campaigns.ts is the ONLY read/write path for social_campaigns.posts — downstream routes (07-03, 07-04) must import readPosts()/sanitizeSlotEdit(), never touch raw JSONB"

requirements-completed: [SOCIAL-01, SOCIAL-02, SOCIAL-04, SOCIAL-06]

coverage:
  - id: D1
    description: "social_campaigns table live with RLS (auth.uid() = user_id), a partial unique index enforcing at most one active campaign per project, a project index, and an updated_at trigger"
    requirement: "SOCIAL-01"
    verification:
      - kind: manual_procedural
        ref: "User applied supabase/migrations/033_social_campaigns.sql via Supabase Dashboard SQL Editor and confirmed table/RLS/indexes present (Task 1 checkpoint, resume-signal: 'applied')"
        status: pass
    human_judgment: false
  - id: D2
    description: "lib/launchpad/campaigns.ts exports Platform/ContentType/SocialPost/SocialCampaign types, PLATFORM_VALUES/PLATFORM_LABELS/CONTENT_TYPE_VALUES/CONTENT_TYPE_LABELS, readPosts() (drops rows failing platform/content_type/week enum validation), and sanitizeSlotEdit() (allowlists caption/posting_time/completed only, never a posts array)"
    requirement: "SOCIAL-04"
    verification:
      - kind: unit
        ref: "manual node verification (temp compile) — readPosts([{platform:'tiktok',content_type:'text',week:2,...}, {platform:'linkedin',content_type:'text',week:5}]) returns exactly 1 row (invalid platform+week row dropped)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit — clean, no errors in campaigns.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "sanitizeSlotEdit() allowlist-only behavior: passing {posts:[...], is_active:false, caption, completed, posting_time} returns only caption (truncated to 2200 chars)/completed/posting_time (only if Date.parse succeeds) — never posts or is_active"
    requirement: "SOCIAL-06"
    verification:
      - kind: unit
        ref: "manual node verification (temp compile) — sanitizeSlotEdit({posts:[1,2,3], is_active:false, caption:'x'.repeat(3000), completed:true, posting_time:'not-a-date'}) returned {caption: <2200 chars>, completed: true} only, no posts/is_active/posting_time keys"
        status: pass
    human_judgment: false
  - id: D4
    description: "lib/launchpad/platform-nudges.ts exports GENRE_PLATFORM_NUDGES (20 genre slugs), GENRE_ALIASES, getPlatformNudges()/getPlatformNudgeRationale() — profile-slug-preferred, free-text+alias fallback, empty list (not an error) on no match"
    requirement: "SOCIAL-02"
    verification:
      - kind: unit
        ref: "manual node verification (temp compile) — getPlatformNudges(['hip_hop_rap'], null) -> ['tiktok','x','instagram']; getPlatformNudges(null, 'R&B') -> rnb_soul's list via alias; getPlatformNudges(null, 'zzz-unknown-genre') -> []"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit — clean, no errors in platform-nudges.ts"
        status: pass
    human_judgment: false

duration: ~15min (Tasks 2-3 this session; Task 1 completed in a prior session before the checkpoint pause)
completed: 2026-07-03
status: complete
---

# Phase 07 Plan 01: Social Campaign Data Foundation Summary

**social_campaigns table (RLS + one-active-per-project partial unique index) plus lib/launchpad/campaigns.ts (typed JSONB read/sanitize) and lib/launchpad/platform-nudges.ts (genre-to-platform advisory resolver) — the storage and type foundation every Phase 7 route/component builds on**

## Performance

- **Duration:** ~15 min (Tasks 2-3; Task 1 + its checkpoint pause were a prior session)
- **Completed:** 2026-07-03T05:48:47Z
- **Tasks:** 3 (1 checkpoint:human-verify + 2 auto)
- **Files modified:** 3 (1 migration, 2 new lib files)

## Accomplishments
- `social_campaigns` table live on the Supabase DB with denormalized-owner RLS (`auth.uid() = user_id`), a partial unique index enforcing exactly one active campaign per project at the DB layer, and an `updated_at` trigger reusing the existing `update_updated_at()` function
- `lib/launchpad/campaigns.ts` provides the typed `readPosts()`/`sanitizeSlotEdit()` JSONB safety layer — the sole read/write path for `social_campaigns.posts`, mirroring `lib/metadata/schema.ts`'s composer pattern
- `lib/launchpad/platform-nudges.ts` provides a defensive genre-to-ranked-platform-list resolver (20 genre slugs, alias fallback for free-text genre input, graceful empty-list degradation on no match)

## Task Commits

Each task was committed atomically:

1. **Task 1: Author migration 033 and confirm DB application** - `268589e` (feat) — completed in a prior session; checkpoint resumed this session with user confirmation ("applied")
2. **Task 2: Create lib/launchpad/campaigns.ts** - `7edba17` (feat)
3. **Task 3: Create lib/launchpad/platform-nudges.ts** - `086f3eb` (feat)

**Plan metadata:** (pending — final docs commit follows this SUMMARY)

## Files Created/Modified
- `supabase/migrations/033_social_campaigns.sql` - `social_campaigns` table, RLS policy, one-active-per-project partial unique index, project index, `updated_at` trigger
- `lib/launchpad/campaigns.ts` - `Platform`/`ContentType`/`SocialPost`/`SocialCampaign` types, `PLATFORM_VALUES`/`PLATFORM_LABELS`/`CONTENT_TYPE_VALUES`/`CONTENT_TYPE_LABELS`, `readPosts()`, `sanitizeSlotEdit()`
- `lib/launchpad/platform-nudges.ts` - `PlatformNudge` type, `GENRE_PLATFORM_NUDGES` (20 genre slugs), `GENRE_ALIASES`, `getPlatformNudges()`, `getPlatformNudgeRationale()`

## Decisions Made
- Migration 033 applied to the live Supabase DB by the user directly (executor sandbox has no Supabase CLI credentials — same established convention as migration 030 in Phase 6)
- Corrected the RESEARCH.md source table's "TikTik" typo to "tiktok" in `hip_hop_rap`'s platform ranking, per the plan's explicit instruction
- `getPlatformNudges()` and `getPlatformNudgeRationale()` share a single internal `resolveNudge()` helper so the profile-slug-preferred → free-text/alias-fallback → empty-on-no-match resolution logic lives in exactly one place

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Behavior assertions from the plan's acceptance criteria (enum-invalid row dropping, allowlist-only sanitize output, genre/alias resolution, graceful empty on no match) were manually verified via a temporary out-of-tree TypeScript compile + Node execution (not committed — no test framework exists in this project per CLAUDE.md, and this phase does not introduce one). All temp artifacts were removed after verification.

## User Setup Required

None beyond the already-completed Task 1 checkpoint — migration 033 is confirmed applied to the live Supabase DB.

## Next Phase Readiness
- `social_campaigns` table, `lib/launchpad/campaigns.ts`, and `lib/launchpad/platform-nudges.ts` are ready for Plan 02 (AI calendar generation) and all downstream Phase 7 plans (07-03 through 07-06), which must import `readPosts()`/`sanitizeSlotEdit()` rather than touching raw JSONB, and `getPlatformNudges()`/`getPlatformNudgeRationale()` for the platform selector's advisory badges (07-05)
- No blockers identified

---
*Phase: 07-social-campaign-planner*
*Completed: 2026-07-03*

## Self-Check: PASSED

All created files verified present on disk (supabase/migrations/033_social_campaigns.sql, lib/launchpad/campaigns.ts, lib/launchpad/platform-nudges.ts, this SUMMARY.md). All task commits (268589e, 7edba17, 086f3eb) and the summary commit (8cff16a) verified present in git log.
