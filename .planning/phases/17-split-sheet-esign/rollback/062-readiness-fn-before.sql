CREATE OR REPLACE FUNCTION public.calculate_vault_readiness(project_uuid uuid)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  score        INTEGER := 0;
  project_type TEXT;
  dist         TEXT;
  track_count  INTEGER;
  doc_count    INTEGER;
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

  SELECT COUNT(*) INTO doc_count FROM vault_documents
    WHERE project_id = project_uuid AND type = 'split_sheet' AND status = 'signed';
  IF doc_count > 0 THEN score := score + 15; END IF;

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
$function$
