-- ============================================================
-- 013 — Readiness-milestone activity event
-- The readiness score is recalculated by DB triggers (migration 003), so
-- the app can't cleanly emit a milestone from request code. This trigger
-- fires a 'readiness' activity event the moment a project crosses into
-- deal-ready (>= 80). SECURITY DEFINER so the insert bypasses RLS (the
-- recalc may run outside the owner's auth context).
-- Idempotent. Run via: supabase db push (or the management query API).
-- ============================================================

CREATE OR REPLACE FUNCTION emit_readiness_milestone() RETURNS trigger AS $$
BEGIN
  IF NEW.vault_readiness_score >= 80
     AND (OLD.vault_readiness_score IS NULL OR OLD.vault_readiness_score < 80) THEN
    INSERT INTO activity_events (profile_id, kind, body, data)
    VALUES (
      NEW.user_id,
      'readiness',
      'Hit readiness ' || NEW.vault_readiness_score || ' on “' || NEW.title ||
        '” — now deal-ready and visible to supervisors.',
      jsonb_build_object('projectId', NEW.id, 'score', NEW.vault_readiness_score)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_readiness_milestone ON vault_projects;
CREATE TRIGGER trg_readiness_milestone
  AFTER UPDATE OF vault_readiness_score ON vault_projects
  FOR EACH ROW EXECUTE FUNCTION emit_readiness_milestone();
