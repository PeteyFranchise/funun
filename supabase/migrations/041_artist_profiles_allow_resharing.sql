-- ============================================================
-- Funūn — Wave 4: Rich Member Profile
-- Migration 041: artist_profiles.allow_resharing (Phase 9 D-07)
-- Artist-controlled toggle that lets visitors reshare an already-
-- public release from the public player (/r/[projectId]). Default
-- off, so nothing changes for existing artists until they opt in.
-- Run via: supabase db push
-- ============================================================

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS allow_resharing BOOLEAN NOT NULL DEFAULT FALSE;

-- Migration 040 replaced artist_profiles' blanket column grants with an
-- explicit column-scoped GRANT SELECT to authenticated/anon. A new column
-- added after that lockdown has NO grant, so the public player page
-- (app/r/[projectId]/page.tsx uses the session/anon-role client) would get
-- a 42501 the moment it selects allow_resharing. Grant SELECT so the flag
-- is readable exactly where the visitor-reshare gate is evaluated.
GRANT SELECT (allow_resharing) ON artist_profiles TO authenticated, anon;

-- No UPDATE grant: the toggle is written through app/api/profile/route.ts,
-- which performs the mutation on createServiceClient() after verifying
-- ownership via the session client (service_role bypasses RLS and column
-- grants entirely). This mirrors migration 040's reasoning for every
-- service-written column — the authenticated role never writes it directly
-- via PostgREST, so it needs no UPDATE privilege.
