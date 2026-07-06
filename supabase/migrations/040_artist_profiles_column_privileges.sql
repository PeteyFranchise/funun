-- ============================================================
-- Funūn — Wave 4: Identity & Schema Foundation
-- Migration 040: artist_profiles column-privilege lockdown (D-10/D-11)
-- Retroactive PII fix — ships with the D-19 companion code fix in the
-- same plan (08-05).
-- Run via: supabase db push
-- ============================================================

-- artist_profiles has had a `FOR SELECT USING (true)` RLS policy since
-- migration 001 with ZERO column-level REVOKE/GRANT ever applied to it
-- (confirmed via `grep -rn "REVOKE\|GRANT " supabase/migrations/` — the
-- only prior column-privilege migration, 031, targets `curators` and
-- `pitch_history`, never `artist_profiles`). Supabase's default schema
-- bootstrap grants blanket column-level SELECT/UPDATE to `authenticated`/
-- `anon` on any RLS-enabled table with a matching policy. That means
-- legal_first_name, legal_middle_name, legal_last_name, legal_name_suffix,
-- contact_phone, mailing_address, pro, ipi, publisher, mlc_id, and
-- soundexchange_id — all real PII / rights data added in migrations 020
-- and 021 — are readable TODAY by any authenticated or anon caller via
-- direct PostgREST, regardless of what the Next.js app-layer selects.
-- This is a live, pre-existing CRITICAL-1-class exposure unrelated to
-- Wave 4 that happens to live in the exact table this phase is already
-- migrating (D-10).
--
-- This migration follows migration 031's exact REVOKE/GRANT pattern:
-- revoke the blanket grant, then re-grant only the columns each role
-- legitimately needs via direct PostgREST. service_role is completely
-- unaffected — it bypasses RLS and column grants entirely, so every
-- server-side write in this app (all owner self-service paths, once
-- switched to createServiceClient() per this plan's Task 2 companion
-- fix) continues to work unchanged. Only direct PostgREST access using
-- an `authenticated`/`anon` JWT is now column-restricted.
--
-- IMPORTANT — deploy ordering (D-19): this migration MUST ship in the
-- same release as the full companion code fix. Postgres fails the WHOLE
-- query on a `SELECT *` against a column-restricted table, not just the
-- restricted columns — so every remaining `.select('*')`/bare `.select()`
-- against artist_profiles using the session-bound (authenticated-role)
-- client would 500 the instant this migration lands. The full companion
-- fix set (CR-01/CR-02 Phase 8 code review fixes) covers:
--   app/u/[handle]/page.tsx
--   app/(artist)/settings/page.tsx
--   app/profile/page.tsx
--   app/api/profile/route.ts
--   app/api/tools/pitchplug/route.ts
--   app/api/tools/[slug]/route.ts
--   app/api/vault/[projectId]/documents/generate/route.ts
--   app/api/launchpad/[projectId]/campaigns/route.ts
--   app/api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/generate/route.ts
--   app/(artist)/vault/[projectId]/rights/page.tsx
--   app/api/vault/[projectId]/tracks/[trackId]/isrc/route.ts
--   app/api/benchmarks/route.ts

-- ─── SELECT ──────────────────────────────────────────────────────────
-- PUBLIC set (D-11): the 6 pre-existing "showcase" columns (migration
-- 010), the identity/rights-registry columns that have always rendered
-- on the public profile (career_stage, industry_roles, genres,
-- monthly_listeners, total_streams, spotify/social handles), the two
-- genuinely new Wave 4 columns (member_type, search_vector), and TWO
-- legacy public fields discovered during Task 2's buildProfileData()
-- audit that are NOT in the D-11-drafted list but are consumed directly
-- by the public profile renderer and were always publicly readable
-- before this migration: `genre` (legacy single-genre TEXT, superseded
-- by the `genres` array but still read for the profile's `tags` display)
-- and `sound_identity` (JSONB mood-tag data, also feeds `tags`). Omitting
-- either would silently blank part of the public profile's tag list —
-- see 08-05-SUMMARY.md "Deviations" for detail. Both are non-sensitive
-- (genre/mood metadata, not PII) so including them does not weaken D-10's
-- security intent.
REVOKE SELECT ON artist_profiles FROM authenticated, anon;
GRANT SELECT (
  id, artist_name, genre, genres, sound_identity, location, bio, career_stage,
  instagram_handle, threads_handle, tiktok_handle, spotify_url,
  monthly_listeners, total_streams, industry_roles, handle,
  member_type, pronouns, banner_url, open_to, featured_project_id,
  search_vector, avatar_url, verified, roles, is_public,
  created_at, updated_at,
  -- claimed_at is a non-PII timestamp sentinel used by middleware.ts to
  -- short-circuit the collaborator-claim flow (Phase 4 D-02). Without this
  -- grant the middleware's SELECT on claimed_at returns 42501, ap is null,
  -- and /api/claim-collaborators is never fired for new signups (CR-03 fix).
  claimed_at
) ON artist_profiles TO authenticated, anon;

-- ─── UPDATE ──────────────────────────────────────────────────────────
-- Owner-editable public columns only. member_type and verified are NOT
-- owner-updatable (member_type is set once at account creation; verified
-- is admin-manual per D-09/Phase 13 deferral). search_vector is
-- maintained exclusively by a BEFORE INSERT/UPDATE trigger (034) and is
-- deliberately left out of the UPDATE grant so no client can overwrite
-- it directly via PostgREST. is_public
-- toggling continues to work exactly as it does today (it was already
-- in the app's own update paths, and remains grantable here). `genre`
-- is a legacy read-only display field not present in EDITABLE_FIELDS so
-- it is intentionally left out of the UPDATE grant.
-- NOTE: `sound_identity` IS written by app/api/benchmarks/route.ts but
-- that route uses createServiceClient() (bypasses column grants entirely),
-- so no authenticated UPDATE grant is needed — service_role always has
-- full access. Only the SELECT grant for sound_identity is required here.
REVOKE UPDATE ON artist_profiles FROM authenticated;
GRANT UPDATE (
  artist_name, genres, location, bio, career_stage,
  instagram_handle, threads_handle, tiktok_handle, spotify_url,
  monthly_listeners, industry_roles, handle, pronouns, banner_url,
  open_to, featured_project_id, roles
) ON artist_profiles TO authenticated;

-- ─── PRIVATE columns: no grant at all for authenticated/anon ────────
-- legal_first_name, legal_middle_name, legal_last_name, legal_name_suffix,
-- contact_phone, mailing_address, pro, ipi, publisher, mlc_id,
-- soundexchange_id. These are PII / rights-registry fields readable and
-- writable only by the owner, and only via the service-role path
-- (createServiceClient(), which bypasses RLS and column grants entirely)
-- after an explicit auth.uid() === id ownership check performed first
-- with the session-bound client — never by another authenticated user or
-- anon caller via direct PostgREST (see this plan's Task 2 companion
-- fix and CR-01/CR-02 code review fixes). isrc_country_code,
-- isrc_registrant_code, and isrc_year_counters are likewise left with no
-- authenticated/anon grant: they are read and written exclusively by
-- app/api/vault/[projectId]/tracks/[trackId]/isrc/route.ts via the
-- service-role client (CR-02 fix), so no grant is needed for them.
