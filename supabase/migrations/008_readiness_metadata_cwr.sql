-- ─── Readiness score: reflect the Metadata Studio work ───────────────
-- The 0–100 vault_readiness_score still rewarded two legacy tool outputs
-- (royaltyaudit, presbit/distroadvisor) for the "PRO registration" and
-- "metadata" buckets — neither of which the new Metadata Studio produces.
-- Re-point those two buckets at signals the Studio actually creates, so
-- capturing composers/splits and ISWCs moves the score:
--
--   • metadata          → every track has composers whose splits total 100%
--   • pro_registration  → at least one track has an ISWC captured (lean to
--                         "present", not full CWR-readiness, so the score
--                         isn't gated on PRO affiliation the artist may lack)
--
-- Everything else is unchanged. tracks already triggers a recompute on
-- INSERT/UPDATE/DELETE, and both signals live on the tracks row (iswc column,
-- composers in metadata JSONB), so no new triggers are needed.

CREATE OR REPLACE FUNCTION calculate_vault_readiness(project_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  score        INTEGER := 0;
  project_type TEXT;
  track_count  INTEGER;
  doc_count    INTEGER;
BEGIN
  SELECT type INTO project_type FROM vault_projects WHERE id = project_uuid;

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

  SELECT COUNT(*) INTO doc_count FROM vault_documents
    WHERE project_id = project_uuid AND type = 'split_sheet' AND status = 'signed';
  IF doc_count > 0 THEN score := score + 15; END IF;

  IF EXISTS (SELECT 1 FROM vault_documents WHERE project_id = project_uuid AND type = 'copyright_registration') THEN
    score := score + 15;
  END IF;

  IF EXISTS (SELECT 1 FROM tracks WHERE project_id = project_uuid AND isrc IS NOT NULL) THEN
    score := score + 10;
  END IF;

  -- PRO registration proxy: at least one track has an ISWC captured.
  IF EXISTS (
    SELECT 1 FROM tracks
    WHERE project_id = project_uuid AND iswc IS NOT NULL AND iswc <> ''
  ) THEN
    score := score + 10;
  END IF;

  SELECT COUNT(*) INTO doc_count FROM vault_documents
    WHERE project_id = project_uuid AND type = 'hire_right' AND status = 'signed';
  IF doc_count > 0 THEN score := score + 10; END IF;

  IF EXISTS (SELECT 1 FROM tool_outputs WHERE project_id = project_uuid AND tool_slug = 'epkfyi') THEN
    score := score + 10;
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

  RETURN LEAST(score, 100);
END;
$$ LANGUAGE plpgsql;
