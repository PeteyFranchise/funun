-- Scratch baseline: ONLY the objects migrations 248/251/252/253 reference.
-- This is NOT the production schema and proves nothing about the other 247
-- migrations. It exists so the four under test can actually execute.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Supabase-like roles.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE authenticator NOLOGIN;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), email TEXT);

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.buckets (
  id TEXT PRIMARY KEY, name TEXT, public BOOLEAN,
  file_size_limit BIGINT, allowed_mime_types TEXT[]
);

CREATE TABLE public.vault_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID, type TEXT, title TEXT NOT NULL
);

CREATE TABLE public.tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.vault_projects ON DELETE CASCADE NOT NULL,
  title TEXT, audio_file_url TEXT, audio_file_size BIGINT
);

CREATE TABLE public.vault_documents (id UUID PRIMARY KEY DEFAULT uuid_generate_v4());

CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY, artist_name TEXT, profile_visibility TEXT
);

CREATE TABLE public.sync_listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vault_project_id UUID NOT NULL REFERENCES public.vault_projects(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  artist_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'applied',
  entry_source TEXT NOT NULL DEFAULT 'self_applied',
  quality_ok BOOLEAN, quality_note TEXT,
  quality_reviewed_by UUID, quality_reviewed_at TIMESTAMPTZ, staff_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
