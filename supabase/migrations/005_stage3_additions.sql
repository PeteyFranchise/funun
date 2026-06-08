-- ─── Stage 3: Complete the Documentation ─────────────────────────────
-- Adds the columns and scoring rules the legal-gate stage needs:
--   • YouTube Content ID tracking (project-level, recommended not required)
--   • per-track sample flagging (drives the SampleClear hard gate)
--   • a sample-clearance cap in the readiness function
--
-- NOTE: numbered 005 — the brief said "002", but 002/003/004 already
-- exist (assets storage, readiness events, track audio). Using 002 would
-- overwrite a shipped migration.

-- ── Schema additions ──────────────────────────────────────────────────
ALTER TABLE vault_projects
  ADD COLUMN IF NOT EXISTS content_id_registered    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS content_id_dismissed_until TIMESTAMPTZ;

ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS has_sample     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sample_details TEXT;

-- ── Readiness function: add the sample-clearance hard cap ─────────────
-- Identical to 001's calculate_vault_readiness, with one addition: if any
-- track is flagged has_sample = true and lacks a signed/verified
-- sample_clearance document, the project score is capped at 70 so it
-- cannot reach the distribution threshold until samples are cleared.
CREATE OR REPLACE FUNCTION calculate_vault_readiness(project_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  score        INTEGER := 0;
  project_type TEXT;
  track_count  INTEGER;
  doc_count    INTEGER;
BEGIN
  SELECT type INTO project_type FROM vault_projects WHERE id = project_uuid;

  -- Snippet: simplified score (sample gate does not apply)
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

  IF EXISTS (SELECT 1 FROM tool_outputs WHERE project_id = project_uuid AND tool_slug = 'royaltyaudit') THEN
    score := score + 10;
  END IF;

  SELECT COUNT(*) INTO doc_count FROM vault_documents
    WHERE project_id = project_uuid AND type = 'hire_right' AND status = 'signed';
  IF doc_count > 0 THEN score := score + 10; END IF;

  IF EXISTS (SELECT 1 FROM tool_outputs WHERE project_id = project_uuid AND tool_slug = 'epkfyi') THEN
    score := score + 10;
  END IF;

  IF EXISTS (SELECT 1 FROM tool_outputs WHERE project_id = project_uuid AND tool_slug IN ('presbit','distroadvisor')) THEN
    score := score + 10;
  END IF;

  score := LEAST(score, 100);

  -- Sample-clearance hard gate: any flagged-but-uncleared sample caps at 70.
  IF EXISTS (
    SELECT 1 FROM tracks t
    WHERE t.project_id = project_uuid
      AND t.has_sample = true
      AND NOT EXISTS (
        SELECT 1 FROM vault_documents d
        WHERE d.track_id = t.id
          AND d.type = 'sample_clearance'
          AND d.status IN ('signed', 'verified')
      )
  ) THEN
    score := LEAST(score, 70);
  END IF;

  RETURN score;
END;
$$ LANGUAGE plpgsql;
