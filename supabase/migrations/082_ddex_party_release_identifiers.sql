-- ============================================================
-- Funūn — Wave 4 follow-on: Phase 16 GTM Beta Launch & Buyer Portal
-- Migration 082: DDEX party/release identifiers Funūn had no home for
--                 (vault_projects.grid, vault_projects.catalog_number,
--                 user_profiles.isni) + generation prefix/counter storage
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push against the remote database is a human-gated checkpoint
-- (mirrors migrations 058/062/063/064/066-070/075/076/078/080/081's "do
-- not push from an executor agent" convention) — the checkpoint task at
-- the end of plan 16-11 owns the push and `supabase migration list`
-- confirmation. This migration is independent (no FK to buyer tables) but
-- rides in Wave 0's batch push alongside 080/081 per the phase plan.
--
-- Three identifiers that currently have no home, each at its correct
-- DDEX level (D-16d):
--   • vault_projects.grid            — release-level Global Release ID
--   • vault_projects.catalog_number  — release-level label catalog number
--   • user_profiles.isni             — party-level ISNI for the primary
--     recording artist (today ISNI exists only on Performer entries
--     inside track metadata; the artist has nowhere to record their own)
--
-- Plus the prefix + counter storage the generalized generator (16-11
-- Task 4b, lib/metadata/generate.ts) needs, mirroring migration 007's
-- ISRC pattern (isrc_country_code / isrc_registrant_code /
-- isrc_year_counters) rather than inventing a second convention.
--
-- ─── user_profiles.isni GRANT DECISION (T-16-11-2) ──────────────────────
-- user_profiles had table-level SELECT revoked in migration 040 with an
-- explicit re-grant allowlist of "public showcase" columns; isni starts
-- PRIVATE by default (no grant) exactly like every other column added
-- since 040 that wasn't explicitly re-granted.
--
-- Argued decision: ISNI is, in principle, a public-directory identifier —
-- it exists to be looked up. But checking the actual consumers before
-- widening anything (per this task's own instruction):
--   • app/u/[handle]/page.tsx's SELECT list (the public profile route)
--     does not read ANY rights-registry identifier column today — not
--     pro, ipi, publisher, mlc_id, or soundexchange_id. All of those stay
--     server-side/private per 040's original doctrine.
--   • lib/profile/load.ts's buildProfileData() likewise never surfaces
--     any of those columns into the public ProfileData shape.
-- Granting SELECT on isni alone, while every sibling identifier column
-- stays private and unrendered, would be an inconsistent one-off grant
-- with no consuming code path to justify it — a widening with no reader,
-- which is exactly the kind of "accident" this task's instructions warn
-- against. Consistency with the established pattern wins: isni stays
-- PRIVATE, same posture as ipi/mlc_id/soundexchange_id. If a future plan
-- wants ISNI to render on /u/[handle] (a genuine, arguable product
-- decision — ISNI-as-directory-identifier is a real use case), that plan
-- adds the column-level GRANT SELECT alongside the actual UI change that
-- consumes it, not here in isolation. Reviewed at the 082 human-verify
-- checkpoint per this plan's <how-to-verify> step 1.
-- ============================================================

-- ─── vault_projects: release-level identifiers ──────────────────────────
-- No column-level REVOKE is in force on vault_projects (confirmed by
-- reading migrations 001 and 006 — label/publisher/c_line/p_line/etc.
-- carry no column privilege restriction beyond the table's own RLS), so
-- grid and catalog_number follow that table's existing pattern: no new
-- grant statement needed, they inherit the same default privileges as
-- every other vault_projects column.
ALTER TABLE vault_projects
  ADD COLUMN IF NOT EXISTS grid             TEXT,
  ADD COLUMN IF NOT EXISTS catalog_number   TEXT;

-- Provenance (T-16-11-8): identifier id -> 'generated' | 'imported' |
-- 'manual', so a Funūn-minted code is never mistaken for a
-- distributor-assigned one. The track-level equivalent needs no migration
-- — it lives inside tracks.metadata under an identifier_sources key,
-- following the existing metadata-key pattern (composers/lyrics/
-- performers/recording/descriptors).
ALTER TABLE vault_projects
  ADD COLUMN IF NOT EXISTS identifier_sources JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ─── user_profiles: party-level ISNI (PRIVATE — see decision above) ─────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS isni TEXT;

-- ─── user_profiles: ARTIST-held prefixes for self_assign_with_prefix
--       schemes (D-16e/D-16f) ─────────────────────────────────────────
-- All PRIVATE, no SELECT/UPDATE grant to authenticated/anon — exactly
-- migration 040's treatment of isrc_registrant_code/isrc_year_counters.
-- Read/written exclusively via the service-role client after a
-- session-verified ownership check (D-19 pattern), same as the existing
-- ISRC generation route (app/api/vault/[projectId]/tracks/[trackId]/
-- isrc/route.ts).
ALTER TABLE user_profiles
  -- The artist's OWN GS1 company prefix — Funūn holds none of its own
  -- (D-16f), so this is the ONLY path to a generated UPC. No platform
  -- fallback exists or is ever intended for UPC.
  ADD COLUMN IF NOT EXISTS gs1_company_prefix     TEXT,
  -- OPTIONAL artist/label-owned GRid issuer code. Normally null: the
  -- default GRid path is platform-issued (see platform_identifier_config
  -- below). Present only for a label that already holds its own code and
  -- wants to override the platform path.
  ADD COLUMN IF NOT EXISTS grid_issuer_code        TEXT,
  -- The artist's own label prefix, e.g. "FUN". Catalog number has no
  -- issuing body (no_authority per the identifier guide), but generation
  -- still needs a prefix + counter mechanism identical in shape to the
  -- self-assign schemes.
  ADD COLUMN IF NOT EXISTS catalog_number_prefix   TEXT,
  -- Per-scheme sequential counters for the artist's own prefixes,
  -- mirroring isrc_year_counters's shape: { "<scheme>": <last issued> }
  -- (catalog_number and an artist-owned grid_issuer_code override both
  -- draw from here; a platform-issued GRid draws from the GLOBAL counter
  -- below instead — see platform_identifier_config).
  ADD COLUMN IF NOT EXISTS identifier_counters     JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ─── platform_identifier_config: PLATFORM-held GRid state (D-16f) ───────
-- NOT artist data — must not live on user_profiles. A single-row table
-- holding Funūn's OWN GRid issuer code and the GLOBAL release-number
-- counter every platform-issued GRid advances (T-16-11-9). Two artists
-- generating a GRid on the same day must draw from this ONE counter, not
-- a per-artist value — a per-artist counter here is a latent collision
-- bug (two artists' releases colliding under Funūn's issuer code).
--
-- RLS: no policy is defined for authenticated/anon, so with RLS enabled
-- those roles are denied by default even before the REVOKE below runs;
-- the REVOKE/GRANT pair is added anyway for defense-in-depth and to match
-- this repo's explicit-grant convention (migrations 040/056/058/076/080/
-- 081) rather than relying on RLS-default-deny alone. service_role
-- bypasses RLS entirely (as it always does) and is the ONLY writer — the
-- counter is advanced exclusively by the generate-identifier route (16-11
-- Task 4b) under an atomic increment, never by a client.
--
-- CHECK (id = 1) enforces the single-row invariant at the schema level —
-- a second row would fracture the "one global counter" guarantee this
-- table exists to provide.
CREATE TABLE IF NOT EXISTS platform_identifier_config (
  id                  INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Funūn's own registered GRid issuer code. NULL is the correct
  -- pre-registration state (deliberation note, 2026-07-18: Funūn does
  -- NOT register with IFPI yet — a real deal, DDEX delivery, or
  -- distributor conversation triggers registration, plus a dedicated
  -- discussion pass on platform-GRid artist value). Do NOT seed a
  -- placeholder here — a fabricated issuer code would emit invalid GRids
  -- under a non-existent authority (T-16-11-6-adjacent harm). NULL means
  -- GRid generation is simply unavailable until this is configured.
  grid_issuer_code    TEXT,
  -- The GLOBAL counter every platform-issued GRid release number draws
  -- from, regardless of which artist is generating. Advanced only under
  -- an atomic increment / row lock by the service-role generate route.
  grid_release_counter BIGINT NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the single row so the generator route can always UPDATE ... WHERE
-- id = 1 (atomic increment) rather than needing an upsert/insert branch.
INSERT INTO platform_identifier_config (id, grid_issuer_code, grid_release_counter)
VALUES (1, NULL, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE platform_identifier_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON platform_identifier_config FROM PUBLIC, authenticated, anon;
GRANT ALL ON platform_identifier_config TO service_role;

-- ─── Force PostgREST to see the new columns + table ─────────────────────
NOTIFY pgrst, 'reload schema';
