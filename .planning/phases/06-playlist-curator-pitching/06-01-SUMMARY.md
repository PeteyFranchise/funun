---
phase: 06-playlist-curator-pitching
plan: 01
subsystem: database
tags: [supabase, postgres, rls, migration, typescript, svix, industry-roles]

# Dependency graph
requires:
  - phase: 05-launchpad-checklist
    provides: shared /launchpad/[projectId] route and RLS-after-CREATE-TABLE convention (CVE-2025-48757)
provides:
  - "curators directory table (RLS-enabled, platform CHECK, claim/reach/moderation columns)"
  - "pitch_history log table (RLS-enabled, uniq_curator_track_pitch invariant)"
  - "handle_new_user() curator branch — curator role signups skip artist_profiles/subscriptions"
  - "Curator, PitchHistory, CuratorPlatform, PitchStatus TypeScript types"
  - "playlist_curator industry role slug"
  - "svix dependency for future webhook signature verification"
affects: [06-02-admin-curator-crud, 06-03-artist-curator-directory, 06-04-pitch-composer-send, 06-05-curator-claim-portal, 06-06-bounce-webhook]

# Tech tracking
tech-stack:
  added: [svix]
  patterns:
    - "ALTER TABLE ... ENABLE ROW LEVEL SECURITY immediately after each CREATE TABLE (CVE-2025-48757 convention)"
    - "handle_new_user() extended via CREATE OR REPLACE FUNCTION, not a new trigger — early RETURN NEW branch for non-artist account types (role-gated in app_metadata, not client-forgeable)"
    - "DB-level UNIQUE constraint as duplicate-send backstop (uniq_curator_track_pitch), enforced independent of app-layer checks"

key-files:
  created:
    - supabase/migrations/030_curators_pitch_history.sql
  modified:
    - types/index.ts
    - lib/industry-roles.ts
    - package.json
    - package-lock.json
    - .planning/STATE.md
    - .planning/ROADMAP.md

key-decisions:
  - "svix approved for install despite [SUS] heuristic flag — 5-year-old official-org package (github.com/svix/svix-webhooks), ~4.88M weekly downloads; the flag fired on release recency, not package age"
  - "Migration 030 applied by the user directly (via their own authenticated supabase db push or Dashboard SQL Editor) since this sandbox has no Supabase CLI credentials and .env.local is intentionally not readable here — verified via explicit user confirmation rather than autonomous re-query, per the resume instructions for this checkpoint"

patterns-established:
  - "Curator-role auth accounts are identified by app_metadata.role='curator' (service-role-only writable) and short-circuit the standard artist-account triggers"

requirements-completed: [PITCH-08]

coverage:
  - id: D1
    description: "curators and pitch_history tables exist in the live Supabase DB with RLS enabled, the platform/status CHECK constraints, and the uniq_curator_track_pitch uniqueness invariant"
    requirement: "PITCH-03"
    verification:
      - kind: manual_procedural
        ref: "User confirmed migration 030 applied successfully via their own `supabase db push` / Dashboard SQL Editor session ('success with supabase')"
        status: pass
    human_judgment: true
    rationale: "This sandbox has no Supabase CLI credentials and .env.local is intentionally not readable here (respecting the sandbox boundary set in the resume instructions), so the live-DB state cannot be re-verified autonomously. The user's explicit confirmation is the authoritative signal per the checkpoint resolution instructions for this run."
  - id: D2
    description: "handle_new_user() returns early for curator-role signups, skipping artist_profiles/subscriptions/claim_collaborators inserts"
    requirement: "PITCH-05"
    verification:
      - kind: unit
        ref: "grep -Eq 'role.{0,20}curator.*RETURN NEW|IF .*curator.* THEN' supabase/migrations/030_curators_pitch_history.sql"
        status: pass
    human_judgment: false
  - id: D3
    description: "Curator, PitchHistory, CuratorPlatform, PitchStatus TypeScript types are importable and match migration 030 columns"
    verification:
      - kind: unit
        ref: "npm run build (tail -5) — no type errors"
        status: pass
    human_judgment: false
  - id: D4
    description: "svix installed without a resend version bump; Playlist Curator selectable in Settings as slug playlist_curator"
    requirement: "PITCH-08"
    verification:
      - kind: unit
        ref: "node -e check: package.json has svix dependency and resend still ^4.x; grep -c playlist_curator lib/industry-roles.ts"
        status: pass
    human_judgment: false

# Metrics
duration: ~5min active build (Tasks 2-4) + separate resume session to close Task 5 checkpoint
completed: 2026-07-02
status: complete
---

# Phase 06 Plan 01: Curators + Pitch History Data Foundation Summary

**Migration 030 (curators + pitch_history tables, RLS, uniq_curator_track_pitch, curator-branched handle_new_user()) pushed to the live Supabase DB by the user; svix installed and Playlist Curator role added**

## Performance

- **Duration:** ~5 min active build for Tasks 2-4 (2026-07-01 13:41-13:45 ET); Task 5 resumed and closed in a separate session on 2026-07-02 after the user applied the migration themselves
- **Started:** 2026-07-01T17:41:22Z
- **Completed:** 2026-07-02T01:27:53Z (Task 5 close-out)
- **Tasks:** 5 (1 human-verify gate, 3 auto, 1 blocking human-action gate)
- **Files modified:** 6 (migration file, types/index.ts, lib/industry-roles.ts, package.json, package-lock.json, plus STATE.md/ROADMAP.md doc updates)

## Accomplishments
- `curators` and `pitch_history` tables live in the production Supabase database, both with RLS enabled immediately after `CREATE TABLE` (CVE-2025-48757 convention)
- `handle_new_user()` now branches on `app_metadata.role='curator'` and returns early, so curator magic-link accounts never acquire `artist_profiles`/`subscriptions` rows
- `uniq_curator_track_pitch UNIQUE (curator_id, track_id)` DB-level constraint in place as the backstop for the duplicate-pitch-send guard (PITCH-03)
- `Curator`, `PitchHistory`, `CuratorPlatform`, `PitchStatus` TypeScript types exported from `types/index.ts`, ready for every downstream Phase 6 plan
- `svix` installed (5-year-old official Svix package, ~4.88M weekly downloads) without touching the pinned `resend@^4.0.0`
- "Playlist Curator" (`playlist_curator`) is a selectable industry role in Settings (PITCH-08)

## Task Commits

Each task was committed atomically:

1. **Task 1: Verify svix package legitimacy before install** - checkpoint:human-verify, user approved (no code commit — verification only)
2. **Task 2: Install svix and add the Playlist Curator industry role** - `4caf7ed` (feat)
3. **Task 3: Write migration 030 — curators + pitch_history tables, RLS, uniqueness, handle_new_user curator branch** - `326eb4d` (feat)
4. **Task 4: Add Curator and PitchHistory TypeScript types** - `fed785e` (feat)
5. **Task 5: Push migration 030 to the live database** - no code commit (infra action); blocker recorded in `6b0741c`, resolved in this session's plan-metadata commit — user applied the migration via their own authenticated `supabase db push` / Dashboard SQL Editor session and confirmed success

**Plan metadata:** committed alongside this SUMMARY (docs: complete plan)

## Files Created/Modified
- `supabase/migrations/030_curators_pitch_history.sql` - curators + pitch_history tables, RLS policies, uniq_curator_track_pitch constraint, handle_new_user() curator branch
- `types/index.ts` - Curator, PitchHistory, CuratorPlatform, PitchStatus types
- `lib/industry-roles.ts` - added `playlist_curator` / "Playlist Curator" to the Business role group
- `package.json`, `package-lock.json` - added `svix` dependency (resend stays pinned `^4.0.0`)
- `.planning/STATE.md` - blocker note cleared, position advanced
- `.planning/ROADMAP.md` - Phase 6 Wave 1 plan progress updated

## Decisions Made
- svix approved for install: the `[SUS]` heuristic flag fired on a recent publish date, not package age — the package is 5 years old, from the official `svix/svix-webhooks` GitHub org, with ~4.88M weekly downloads. Verdict preserved per protocol (never silently auto-overridden) but approved after human review of the evidence in Task 1.
- Migration 030 was applied to the live database by the user directly, not by this executor. This sandbox has no Supabase CLI credentials (`npx supabase db push`/`migration list` both fail — no `supabase/config.toml`, no linked project, no access token) and `.env.local` is intentionally not readable in this sandbox. Per the checkpoint resolution instructions for this resume, the user's explicit confirmation ("success with supabase") is treated as authoritative closure of Task 5 rather than re-blocking on autonomous re-verification.

## Deviations from Plan

None — plan executed exactly as written. Task 5's `<human-check>` step (confirm tables + RLS via the Supabase dashboard) was satisfied by the user directly rather than relayed back through this executor's own dashboard inspection, which is the expected outcome for a `checkpoint:human-action`/`gate="blocking"` task in a sandbox without live-DB credentials.

## Issues Encountered
- Supabase CLI in this sandbox has no linked project (`supabase/config.toml` absent) and no access token, so `supabase db push` and `supabase migration list` both fail immediately with clear, unambiguous errors — consistent with the blocker recorded in the prior session. No autonomous verification path exists in this environment; closure relies on the user's explicit confirmation as instructed for this resume.

## User Setup Required

None for this plan's DB/type work — already completed by the user (migration push). Note the plan's `user_setup` frontmatter documents Resend pitch-domain and Spotify/YouTube reach-signal credentials needed by *later* Phase 6 plans (06-02, 06-04); those are unrelated to this plan's completion and remain open for their respective plans.

## Next Phase Readiness
- `curators` and `pitch_history` tables, RLS, and the uniqueness invariant are live — 06-02 (admin curator CRUD) and 06-03 (artist-facing directory) can now read/write against real tables instead of a false-positive build-only verification state.
- `Curator`/`PitchHistory`/`CuratorPlatform`/`PitchStatus` types are importable for all downstream plans.
- `handle_new_user()` curator branch is live, so 06-05 (curator claim → magic-link account) will not accidentally create artist rows for curator signups.
- No blockers remain for Wave 2 (06-02) to begin.

---
*Phase: 06-playlist-curator-pitching*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: .planning/phases/06-playlist-curator-pitching/06-01-SUMMARY.md
- FOUND: supabase/migrations/030_curators_pitch_history.sql
- FOUND: commit 4caf7ed (feat(06-01): install svix and add Playlist Curator industry role)
- FOUND: commit 326eb4d (feat(06-01): write migration 030 for curators and pitch_history tables)
- FOUND: commit fed785e (feat(06-01): add Curator and PitchHistory TypeScript types)
