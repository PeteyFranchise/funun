-- ============================================================
-- Funūn — Wave 4: The Green Room (Phase 18: Split-Sheet Home)
-- Migration 068: coverage-based split-sheet readiness (P18-14/P18-15/P18-16).
-- Run via: supabase db push
--
-- Fixes calculate_vault_readiness()'s split-sheet branch, which currently
-- fails in the dangerous direction: signedOf('split_sheet') on the TS side
-- (and the equivalent project-wide MIN over split_sheets on this side)
-- asks whether the project's split-sheet DOCUMENTS/SHEETS are all signed,
-- not whether every one of the project's SONGS has one. A 5-track EP with
-- ONE signed sheet reads complete at 15/15 today — four undocumented
-- songs, fully green (18-CONTEXT finding 4, this phase's single most
-- consequential finding, and live today).
--
-- This migration redefines calculate_vault_readiness() (previously
-- migration 016, redefined in 062) so the split-sheet branch computes
-- coverage across the project's own TRACKS via split_sheet_attachments
-- (18-03/migration 067), taking the minimum tier across the tracks that
-- need a sheet. EVERY other scoring branch is preserved BYTE-IDENTICAL to
-- migration 062 — this is a derivation change to one branch only, not a
-- points/registry change (the item stays 15 points in READINESS_ITEMS).
--
-- P18-15 (settled, 18-CONTEXT.md): EVERY track needs a split sheet,
-- including songs written by a single person — there is no acknowledgment
-- escape hatch, and none is built here. The absence of a split sheet is
-- not proof of sole authorship; it is absence of proof.
--
-- P18-16 (settled, supersedes an earlier MIN-only draft): points are
-- PROPORTIONAL to coverage; status still requires ALL tracks covered.
-- When every needing track has at least one attached sheet, the score is
-- the pessimistic MIN across their tiers (unchanged from the pre-068
-- project-wide semantic, now computed per track). When at least one
-- needing track has NO sheet attached at all, MIN alone would score a
-- 5-track EP with 4 executed sheets at 0/15 — unable to distinguish "done
-- nothing" from "nearly done" — so points become the ROUND(AVG(...))
-- tier across every needing track instead (an uncovered track
-- contributes 0), while a project only reaches the full 15 when every
-- track individually is at the top tier.
--
-- This is the SAME rule lib/vault/readiness-coverage.ts's coverageTier()
-- implements — neither derivation is the source of truth,
-- lib/vault/coverage-fixtures.ts is, and both are asserted against it
-- (__tests__/migration-068.test.ts is a structural proxy; the executable
-- half of the parity is the human spot-check at this plan's blocking
-- checkpoint).
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push against the remote database is this plan's blocking
-- human checkpoint (Task 4), mirroring migrations 058/062/063/065/066/067's
-- "do not push from an executor agent" convention. This migration also
-- changes scores users can already see — a project reading complete on
-- split sheets today may read warning afterwards. That is the correction
-- described in design section 6 item 6, but it needs a deliberate human
-- sign-off before it ships, not a silent push.
-- ============================================================

create or replace function public.calculate_vault_readiness(project_uuid uuid)
returns integer
language plpgsql
as $function$
DECLARE
  score          INTEGER := 0;
  project_type   TEXT;
  dist           TEXT;
  track_count    INTEGER;
  doc_count      INTEGER;
  coverage_tier  INTEGER;
BEGIN
  SELECT type, distributor INTO project_type, dist FROM vault_projects WHERE id = project_uuid;

  -- Snippet: simplified score (unchanged)
  IF project_type = 'snippet' THEN
    IF EXISTS (SELECT 1 FROM vault_assets WHERE project_id = project_uuid AND type IN ('lyric_card','snippet_visual')) THEN
      score := score + 40;
    END IF;
    IF EXISTS (SELECT 1 FROM tool_outputs WHERE project_id = project_uuid AND tool_slug = 'dropready') THEN
      score := score + 30;
    END IF;
    IF EXISTS (SELECT 1 FROM tool_outputs WHERE project_id = project_uuid AND tool_slug = 'soundbait') THEN
      score := score + 30;
    END IF;
    RETURN score;
  END IF;

  -- All other types: full score
  SELECT COUNT(*) INTO track_count FROM tracks WHERE project_id = project_uuid;
  IF track_count > 0 THEN score := score + 10; END IF;

  IF EXISTS (SELECT 1 FROM vault_assets WHERE project_id = project_uuid AND type = 'cover_art') THEN
    score := score + 10;
  END IF;

  -- Split sheets: legacy wet-sign-upload path (AM-1 universal fallback,
  -- unchanged — wins outright regardless of coverage) OR the new
  -- coverage-based tier across every track that needs a sheet (P18-14).
  SELECT COUNT(*) INTO doc_count FROM vault_documents
    WHERE project_id = project_uuid AND type = 'split_sheet' AND status = 'signed';

  -- track_tiers: one row per track this project has (P18-15 — EVERY
  -- track needs a sheet, so this is a LEFT JOIN from tracks, not an
  -- aggregate over split_sheet_attachments alone; an aggregate over the
  -- attachments would silently skip exactly the uncovered tracks whose
  -- absence is the point). A track's own tier is the BEST (max) of every
  -- sheet attached to it via split_sheet_attachments — mirrors
  -- readiness-coverage.ts's trackTier(). Only track-specific attachments
  -- (split_sheet_attachments.track_id IS NOT NULL) count toward a
  -- track's own coverage; a whole-release (track_id IS NULL) attachment
  -- is a separate, project-level fact and does not by itself document
  -- any individual song.
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
    FROM tracks t
    LEFT JOIN split_sheet_attachments sa
      ON sa.track_id = t.id AND sa.vault_project_id = project_uuid
    LEFT JOIN split_sheets ss
      ON ss.id = sa.split_sheet_id
    WHERE t.project_id = project_uuid
    GROUP BY t.id
  )
  SELECT
    CASE
      -- Every needing track has SOME attached sheet: the pessimistic
      -- MIN across their tiers (unchanged pre-068 semantic, now per
      -- track rather than per project).
      WHEN COUNT(*) FILTER (WHERE tier = 0) = 0 THEN MIN(tier)
      -- At least one needing track has NO sheet at all: proportional
      -- credit (P18-16) rather than a MIN that would collapse to 0.
      ELSE ROUND(AVG(tier))::INTEGER
    END
  INTO coverage_tier
  FROM track_tiers;
  -- A project with zero tracks yields an empty track_tiers set, so
  -- MIN(tier) over zero rows is NULL — the same "no coverage signal at
  -- all" outcome readiness-coverage.ts's coverageTier() returns for an
  -- empty needing set, falling through to the legacy branch below rather
  -- than being treated as zero.

  IF doc_count > 0 THEN
    score := score + 15; -- legacy wet-sign-upload path, unchanged
  ELSIF coverage_tier IS NOT NULL THEN
    score := score + coverage_tier; -- coverage-based tier (P18-14/15/16)
  END IF;

  IF EXISTS (SELECT 1 FROM vault_documents WHERE project_id = project_uuid AND type = 'copyright_registration') THEN
    score := score + 15;
  END IF;

  IF EXISTS (SELECT 1 FROM tracks WHERE project_id = project_uuid AND isrc IS NOT NULL) THEN
    score := score + 10;
  END IF;

  -- PRO registration proxy: at least one track has an ISWC captured. (trimmed 10 -> 5)
  IF EXISTS (
    SELECT 1 FROM tracks
    WHERE project_id = project_uuid AND iswc IS NOT NULL AND iswc <> ''
  ) THEN
    score := score + 5;
  END IF;

  SELECT COUNT(*) INTO doc_count FROM vault_documents
    WHERE project_id = project_uuid AND type = 'hire_right' AND status = 'signed';
  IF doc_count > 0 THEN score := score + 10; END IF;

  -- EPK generated (a promo asset). (trimmed 10 -> 5)
  IF EXISTS (SELECT 1 FROM tool_outputs WHERE project_id = project_uuid AND tool_slug = 'epkfyi') THEN
    score := score + 5;
  END IF;

  -- Metadata captured: every track has composers whose splits total 100%.
  IF track_count > 0 AND NOT EXISTS (
    SELECT 1 FROM tracks t
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

-- Recompute every project's score so the new weighting takes effect immediately.
update vault_projects set vault_readiness_score = calculate_vault_readiness(id);
