-- ============================================================
-- Funūn — Wave 4: The Green Room (Phase 17 hardening follow-ups)
-- Migration 070: readiness SECURITY DEFINER + TRUNCATE/TRIGGER privilege sweep
--
-- Two Phase-17 "Open follow-ups" (.planning/phases/17-split-sheet-esign/
-- 17-RESUME-HERE.md), audited in 17-HARDENING-DRAFT.md:
--
--   Item 1 — TRUNCATE/TRIGGER sweep. Migrations 042/056/057/058 revoked only
--     INSERT/UPDATE/DELETE (and SELECT where applicable) on five socially-
--     exposed tables; none touched TRUNCATE or TRIGGER, so Supabase's default
--     full-table grant to authenticated/anon left both standing. TRUNCATE
--     bypasses RLS entirely — the same class of gap migration 062 found and
--     closed for esign_envelopes/esign_envelope_signers. This goes one step
--     past 062's own pattern by also revoking TRIGGER (defense-in-depth).
--
--   Item 2 — calculate_vault_readiness() is SECURITY INVOKER while it reads
--     split_sheets (and six other tables). Any future RLS on those tables can
--     re-arm the 42P17 recursion that broke the vault write path 2026-07-20
--     (see migration 064 and .planning/debug/split-sheet-rls-recursion.md).
--     Flipping to SECURITY DEFINER + SET search_path = '' closes that class
--     permanently. Item 2b: a DEFINER function callable by anon/authenticated
--     via direct PostgREST RPC becomes an RLS-bypassing readiness oracle for
--     ANY project_uuid — so its EXECUTE grant is revoked in the SAME breath
--     (no app code calls it directly; every use is trigger-internal, which
--     does not require a role-level EXECUTE grant). Mirrors migration 064's
--     EXECUTE lockdown of is_split_sheet_initiator/is_split_sheet_party.
--
-- SAFE + reversible: REVOKE of an ungranted privilege is a no-op (Postgres
-- does not error), and the function redefinition is byte-identical to
-- migration 068's body EXCEPT `security definer` + `set search_path = ''` +
-- schema-qualifying every table reference (required once search_path is
-- emptied — this repo's established DEFINER convention: 034/035/037/044/
-- 057/059/060/064/066). No scoring branch, value, or logic changed, so no
-- vault_readiness_score recompute is needed (access-control change only).
--
-- Deliberately NOT included (flagged in 17-HARDENING-DRAFT.md, out of this
-- follow-up's scope — need their own decision): item 1b (dm_threads/
-- dm_messages residual DELETE-from-authenticated + untouched anon grants)
-- and item 3 (artist_profiles residual anon UPDATE / both-role INSERT).
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push is a human-gated checkpoint (mirrors migrations 058/062/063/
-- 066/067/068/069). Before applying, spot-check a few vault_readiness_score
-- values before/after (the "no recompute needed" reasoning is sound but was
-- not verified against live data), and confirm no UI surface calls
-- calculate_vault_readiness as a direct RPC.
-- ============================================================

-- ─── Item 1: TRUNCATE / TRIGGER privilege sweep ──────────────────────────
REVOKE TRUNCATE, TRIGGER ON capability_grants     FROM authenticated, anon;
REVOKE TRUNCATE, TRIGGER ON green_room_placements FROM authenticated, anon;
REVOKE TRUNCATE, TRIGGER ON reports               FROM authenticated, anon;
REVOKE TRUNCATE, TRIGGER ON dm_threads            FROM authenticated, anon;
REVOKE TRUNCATE, TRIGGER ON dm_messages           FROM authenticated, anon;

-- ─── Item 2: calculate_vault_readiness → SECURITY DEFINER ────────────────
-- Byte-identical to migration 068's body; only the security clause,
-- search_path, and public.-qualification of every table reference differ.
CREATE OR REPLACE FUNCTION public.calculate_vault_readiness(project_uuid uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  score          INTEGER := 0;
  project_type   TEXT;
  dist           TEXT;
  track_count    INTEGER;
  doc_count      INTEGER;
  coverage_tier  INTEGER;
BEGIN
  SELECT type, distributor INTO project_type, dist FROM public.vault_projects WHERE id = project_uuid;

  -- Snippet: simplified score (unchanged)
  IF project_type = 'snippet' THEN
    IF EXISTS (SELECT 1 FROM public.vault_assets WHERE project_id = project_uuid AND type IN ('lyric_card','snippet_visual')) THEN
      score := score + 40;
    END IF;
    IF EXISTS (SELECT 1 FROM public.tool_outputs WHERE project_id = project_uuid AND tool_slug = 'dropready') THEN
      score := score + 30;
    END IF;
    IF EXISTS (SELECT 1 FROM public.tool_outputs WHERE project_id = project_uuid AND tool_slug = 'soundbait') THEN
      score := score + 30;
    END IF;
    RETURN score;
  END IF;

  -- All other types: full score
  SELECT COUNT(*) INTO track_count FROM public.tracks WHERE project_id = project_uuid;
  IF track_count > 0 THEN score := score + 10; END IF;

  IF EXISTS (SELECT 1 FROM public.vault_assets WHERE project_id = project_uuid AND type = 'cover_art') THEN
    score := score + 10;
  END IF;

  -- Split sheets: legacy wet-sign-upload path (AM-1 universal fallback,
  -- unchanged — wins outright regardless of coverage) OR the new
  -- coverage-based tier across every track that needs a sheet (P18-14).
  SELECT COUNT(*) INTO doc_count FROM public.vault_documents
    WHERE project_id = project_uuid AND type = 'split_sheet' AND status = 'signed';

  -- track_tiers: one row per track this project has (P18-15 — EVERY
  -- track needs a sheet, so this is a LEFT JOIN from tracks, not an
  -- aggregate over split_sheet_attachments alone). A track's own tier is
  -- the BEST (max) of every sheet attached to it via split_sheet_attachments
  -- — mirrors readiness-coverage.ts's trackTier(). Only track-specific
  -- attachments (split_sheet_attachments.track_id IS NOT NULL) count toward
  -- a track's own coverage.
  WITH track_tiers AS (
    SELECT
      t.id AS track_id,
      COALESCE(MAX(
        CASE ss.status
          WHEN 'executed'         THEN 15
          WHEN 'esign_pending'    THEN 10
          WHEN 'approved'         THEN 10
          WHEN 'countered'        THEN 5
          WHEN 'pending_approval' THEN 5
          ELSE 0 -- 'draft'
        END
      ), 0) AS tier
    FROM public.tracks t
    LEFT JOIN public.split_sheet_attachments sa
      ON sa.track_id = t.id AND sa.vault_project_id = project_uuid
    LEFT JOIN public.split_sheets ss
      ON ss.id = sa.split_sheet_id
    WHERE t.project_id = project_uuid
    GROUP BY t.id
  )
  SELECT
    CASE
      -- Every needing track has SOME attached sheet: the pessimistic MIN
      -- across their tiers.
      WHEN COUNT(*) FILTER (WHERE tier = 0) = 0 THEN MIN(tier)
      -- At least one needing track has NO sheet at all: proportional
      -- credit (P18-16) rather than a MIN that would collapse to 0.
      ELSE ROUND(AVG(tier))::INTEGER
    END
  INTO coverage_tier
  FROM track_tiers;
  -- A project with zero tracks yields an empty track_tiers set, so
  -- MIN(tier) over zero rows is NULL — falls through to the legacy branch.

  IF doc_count > 0 THEN
    score := score + 15; -- legacy wet-sign-upload path, unchanged
  ELSIF coverage_tier IS NOT NULL THEN
    score := score + coverage_tier; -- coverage-based tier (P18-14/15/16)
  END IF;

  IF EXISTS (SELECT 1 FROM public.vault_documents WHERE project_id = project_uuid AND type = 'copyright_registration') THEN
    score := score + 15;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tracks WHERE project_id = project_uuid AND isrc IS NOT NULL) THEN
    score := score + 10;
  END IF;

  -- PRO registration proxy: at least one track has an ISWC captured. (trimmed 10 -> 5)
  IF EXISTS (
    SELECT 1 FROM public.tracks
    WHERE project_id = project_uuid AND iswc IS NOT NULL AND iswc <> ''
  ) THEN
    score := score + 5;
  END IF;

  SELECT COUNT(*) INTO doc_count FROM public.vault_documents
    WHERE project_id = project_uuid AND type = 'hire_right' AND status = 'signed';
  IF doc_count > 0 THEN score := score + 10; END IF;

  -- EPK generated (a promo asset). (trimmed 10 -> 5)
  IF EXISTS (SELECT 1 FROM public.tool_outputs WHERE project_id = project_uuid AND tool_slug = 'epkfyi') THEN
    score := score + 5;
  END IF;

  -- Metadata captured: every track has composers whose splits total 100%.
  IF track_count > 0 AND NOT EXISTS (
    SELECT 1 FROM public.tracks t
    WHERE t.project_id = project_uuid
      AND COALESCE((
        SELECT ROUND(SUM((c ->> 'split')::numeric), 2)
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(t.metadata -> 'composers') = 'array'
               THEN t.metadata -> 'composers'
               ELSE '[]'::jsonb END
        ) c
      ), 0) <> 100
  ) THEN
    score := score + 10;
  END IF;

  -- Distributor selected — the hard "ready to upload" gate. (+10)
  IF dist IS NOT NULL AND dist <> '' THEN
    score := score + 10;
  END IF;

  RETURN LEAST(score, 100);
END;
$function$;

-- ─── Item 2b: close the direct-RPC readiness oracle ──────────────────────
-- With SECURITY DEFINER above, an unrestricted EXECUTE would let any
-- anon/authenticated caller RPC this with any project_uuid and read the
-- true, RLS-bypassed score for a project they don't own. No app code calls
-- it directly (every use is trigger-internal). Revoke, no re-grant.
REVOKE EXECUTE ON FUNCTION public.calculate_vault_readiness(uuid) FROM PUBLIC, anon, authenticated;
