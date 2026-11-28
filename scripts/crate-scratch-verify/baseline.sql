-- Scratch baseline: ONLY the objects migrations 248/251/252/253 reference.
-- This is NOT the production schema and proves nothing about the other 247
-- migrations. It exists so the four under test can actually execute.
-- NO uuid-ossp IN public. An earlier version of this file created it here, and
-- the harness therefore resolved gen_random_uuid() happily while the real apply
-- failed with 42883: on this platform uuid-ossp lives in the `extensions`
-- schema, not `public`. The baseline must not install conveniences production
-- lacks — that is how a harness certifies a migration that cannot run.
--
-- Everything now uses gen_random_uuid(), which is core PostgreSQL since 13.
CREATE SCHEMA IF NOT EXISTS extensions;

-- Supabase-like roles.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE authenticator NOLOGIN;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT);

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.buckets (
  id TEXT PRIMARY KEY, name TEXT, public BOOLEAN,
  file_size_limit BIGINT, allowed_mime_types TEXT[]
);

CREATE TABLE public.vault_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, type TEXT, title TEXT NOT NULL
);

CREATE TABLE public.tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.vault_projects ON DELETE CASCADE NOT NULL,
  title TEXT, audio_file_url TEXT, audio_file_size BIGINT
);

CREATE TABLE public.vault_documents (id UUID PRIMARY KEY DEFAULT gen_random_uuid());

CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY, artist_name TEXT, profile_visibility TEXT
);

CREATE TABLE public.sync_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_project_id UUID NOT NULL REFERENCES public.vault_projects(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  artist_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The FULL column set from 096_sync_library.sql:29-52. An earlier version of
  -- this file carried only the columns the writers read, and migration 248's
  -- grant on admitted_at then failed to apply — the stub-baseline fidelity
  -- problem in miniature, found by running it.
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN (
    'applied','invited','agreement_pending','pending_admit',
    'admitted','rejected','withdrawn','removed'
  )),
  entry_source TEXT NOT NULL DEFAULT 'self_applied' CHECK (entry_source IN ('admin_invited','self_applied')),
  blanket_agreement_document_id UUID REFERENCES public.vault_documents(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  removal_reason TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES auth.users(id),
  admitted_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  removed_by UUID REFERENCES auth.users(id),
  quality_ok BOOLEAN, quality_note TEXT,
  quality_reviewed_by UUID REFERENCES auth.users(id), quality_reviewed_at TIMESTAMPTZ,
  staff_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The partial unique index (096:63-65): one ACTIVE listing per song.
CREATE UNIQUE INDEX sync_listings_active_track_uniq ON public.sync_listings (track_id)
  WHERE status IN ('applied','invited','agreement_pending','pending_admit','admitted');

CREATE TABLE public.license_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_project_id UUID, stage TEXT
);

CREATE TABLE public.buyer_shortlists (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.selects (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.selects_tracks (id UUID PRIMARY KEY DEFAULT gen_random_uuid());

-- Supabase grants service_role broad access on public by default; reproduce
-- that, because the whole point of 248's boundary is taking it away again.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON SCHEMA public TO service_role;

-- ─── PRODUCTION RLS, which the first version of this file omitted ───────
--
-- This omission is why twenty probes passed against a schema that did not
-- resemble production in the one way that mattered. All three legacy tables the
-- writers read have RLS ENABLED with ownership-scoped policies, and the
-- evidence role is NOBYPASSRLS — so without policies of its own it sees NO
-- ROWS, and every writer reports that the listing does not exist.
--
-- auth.uid() does not exist here, so the policies below use a stand-in that
-- behaves the same way for this purpose: it returns NULL, so an ownership
-- comparison is never true, which is exactly the position the evidence role is
-- in when it has no policy of its own.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

ALTER TABLE public.sync_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY sync_listings_select_own ON public.sync_listings
  FOR SELECT USING (artist_user_id = auth.uid());

ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tracks_own ON public.tracks
  USING (auth.uid() = (SELECT user_id FROM public.vault_projects p WHERE p.id = project_id))
  WITH CHECK (auth.uid() = (SELECT user_id FROM public.vault_projects p WHERE p.id = project_id));

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_profiles_own ON public.user_profiles
  FOR SELECT USING (id = auth.uid());

-- ─── Seed data the probes share ─────────────────────────────────────────
-- Seeded HERE rather than in each probe: the spare-track pool below needs the
-- project to exist, and an earlier version put the pool here while the probes
-- created the project, so the baseline aborted and nothing applied.
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('99999999-9999-9999-9999-999999999999');
INSERT INTO public.vault_projects (id, user_id, type, title) VALUES
  ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','single','P');
INSERT INTO public.user_profiles (id, artist_name) VALUES
  ('11111111-1111-1111-1111-111111111111','An Artist');
INSERT INTO public.tracks (id, project_id, title, audio_file_url) VALUES
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','Song','u/p/t.wav');

-- A pool of spare tracks. The probes create many listings, and
-- sync_listings_active_track_uniq permits one ACTIVE listing per track, so each
-- listing needs its own song — exactly as production would.
INSERT INTO public.tracks (project_id, title, audio_file_url)
SELECT '22222222-2222-2222-2222-222222222222', 'Spare ' || g, 'u/p/t.wav'
FROM generate_series(1, 80) g;
