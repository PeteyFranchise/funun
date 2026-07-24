-- ============================================================
-- Funūn — Wave 2: Rights & Registration Rails (Phase 19: Profile &
-- Identity Model Cleanup)
-- Migration 071: user_profiles data rescue (R1, step 1 of 3)
--
-- Copies any values stranded in the duplicate `user_profiles` table
-- into the canonical `artist_profiles` table, using semantic-blank
-- rules: a value is treated as blank when it is NULL, a trimmed-empty
-- string, or (for mailing_address) the empty JSON object `{}`.
-- Canonical-wins: a meaningful artist_profiles value is NEVER
-- overwritten by a stranded user_profiles value, even when they differ.
--
-- Column mapping (mirrors lib/profile/semantic-blank.ts's
-- RESCUE_FIELD_MAP field-for-field — keep both in sync if either
-- changes):
--   user_profiles.pro             -> artist_profiles.pro             (text)
--   user_profiles.ipi             -> artist_profiles.ipi             (text)
--   user_profiles.publisher       -> artist_profiles.publisher       (text)
--   user_profiles.phone           -> artist_profiles.contact_phone   (text, renamed)
--   user_profiles.mailing_address -> artist_profiles.mailing_address (json,
--     blank-check is `IS NULL OR = '{}'::jsonb`, NEVER `IS NULL` alone —
--     both tables default this column to '{}'::jsonb, not NULL)
--   user_profiles.display_name    -> artist_profiles.artist_name     (text,
--     semantically-equivalent "what shows on the profile" field, not a
--     same-name column)
--   user_profiles.bio             -> artist_profiles.bio             (text)
--
-- This migration performs NO drop and does NOT touch
-- claim_collaborators() or backfill_claimed_collaborators() — rescue
-- only, so a bug here is independently reviewable before anything
-- destructive or function-level happens. Migration 072 re-points both
-- functions; migration 073 drops user_profiles, strictly after this
-- rescue and that re-point (SPEC R1 Prohibitions: MUST NOT drop
-- user_profiles before the data-rescue migration runs, nor before both
-- DB readers are re-pointed).
--
-- An executor agent must NEVER run `supabase db push` for this
-- migration. The live push against the remote database is this
-- phase's blocking human checkpoint (plan 19-07), mirroring migrations
-- 058/062/063/065/066/074's "do not push from an executor agent"
-- convention.
-- ============================================================

DO $$
DECLARE
  v_total_candidates INT := 0; -- pre: user_profiles rows with a matching artist_profiles row
  v_stranded_count    INT := 0; -- pre: of those, rows carrying at least one stranded (non-blank
                                 --      source over blank canonical) field, across any mapped column
  v_rescued_count     INT := 0; -- post: rows actually UPDATEd by the rescue below
BEGIN
  -- ─── Pre-rescue audit counts (SPEC R1 Acceptance line 3) ────────────
  SELECT COUNT(*) INTO v_total_candidates
  FROM public.user_profiles up
  JOIN public.artist_profiles ap ON ap.id = up.id;

  SELECT COUNT(*) INTO v_stranded_count
  FROM public.user_profiles up
  JOIN public.artist_profiles ap ON ap.id = up.id
  WHERE (COALESCE(TRIM(up.pro), '') <> '' AND COALESCE(TRIM(ap.pro), '') = '')
     OR (COALESCE(TRIM(up.ipi), '') <> '' AND COALESCE(TRIM(ap.ipi), '') = '')
     OR (COALESCE(TRIM(up.publisher), '') <> '' AND COALESCE(TRIM(ap.publisher), '') = '')
     OR (COALESCE(TRIM(up.phone), '') <> '' AND COALESCE(TRIM(ap.contact_phone), '') = '')
     OR (up.mailing_address IS NOT NULL AND up.mailing_address <> '{}'::jsonb
         AND (ap.mailing_address IS NULL OR ap.mailing_address = '{}'::jsonb))
     OR (COALESCE(TRIM(up.display_name), '') <> '' AND COALESCE(TRIM(ap.artist_name), '') = '')
     OR (COALESCE(TRIM(up.bio), '') <> '' AND COALESCE(TRIM(ap.bio), '') = '');

  -- ─── Rescue: copy stranded values into blank canonical columns ──────
  -- Canonical-wins per field: a semantically-blank artist_profiles
  -- column is replaced by the stranded user_profiles value; any
  -- meaningful artist_profiles value is left exactly as-is.
  WITH candidates AS (
    SELECT up.id,
      up.pro, up.ipi, up.publisher, up.phone, up.mailing_address,
      up.display_name, up.bio
    FROM public.user_profiles up
    JOIN public.artist_profiles ap ON ap.id = up.id
  )
  UPDATE public.artist_profiles ap SET
    pro = CASE WHEN COALESCE(TRIM(ap.pro), '') = '' THEN c.pro ELSE ap.pro END,
    ipi = CASE WHEN COALESCE(TRIM(ap.ipi), '') = '' THEN c.ipi ELSE ap.ipi END,
    publisher = CASE WHEN COALESCE(TRIM(ap.publisher), '') = '' THEN c.publisher ELSE ap.publisher END,
    contact_phone = CASE WHEN COALESCE(TRIM(ap.contact_phone), '') = '' THEN c.phone ELSE ap.contact_phone END,
    mailing_address = CASE
      WHEN ap.mailing_address IS NULL OR ap.mailing_address = '{}'::jsonb
        THEN COALESCE(c.mailing_address, ap.mailing_address)
      ELSE ap.mailing_address
    END,
    artist_name = CASE WHEN COALESCE(TRIM(ap.artist_name), '') = '' THEN c.display_name ELSE ap.artist_name END,
    bio = CASE WHEN COALESCE(TRIM(ap.bio), '') = '' THEN c.bio ELSE ap.bio END
  FROM candidates c
  WHERE ap.id = c.id
    AND (
      (COALESCE(TRIM(ap.pro), '') = '' AND COALESCE(TRIM(c.pro), '') <> '')
      OR (COALESCE(TRIM(ap.ipi), '') = '' AND COALESCE(TRIM(c.ipi), '') <> '')
      OR (COALESCE(TRIM(ap.publisher), '') = '' AND COALESCE(TRIM(c.publisher), '') <> '')
      OR (COALESCE(TRIM(ap.contact_phone), '') = '' AND COALESCE(TRIM(c.phone), '') <> '')
      OR ((ap.mailing_address IS NULL OR ap.mailing_address = '{}'::jsonb)
          AND c.mailing_address IS NOT NULL AND c.mailing_address <> '{}'::jsonb)
      OR (COALESCE(TRIM(ap.artist_name), '') = '' AND COALESCE(TRIM(c.display_name), '') <> '')
      OR (COALESCE(TRIM(ap.bio), '') = '' AND COALESCE(TRIM(c.bio), '') <> '')
    );

  GET DIAGNOSTICS v_rescued_count = ROW_COUNT;

  -- Audit trail Pete reviews at push time (SPEC R1 Acceptance line 3:
  -- "the rescue migration logs a stranded-value count").
  RAISE NOTICE 'user_profiles rescue: % candidate rows (pre), % rows had at least one stranded value (pre), % rows updated by the rescue (post)',
    v_total_candidates, v_stranded_count, v_rescued_count;
END $$;
