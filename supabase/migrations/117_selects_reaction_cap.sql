-- Migration 117: hard cap on reactions per Selects track (audit #6)
--
-- A leaked Selects share link let anyone POST /api/selects/[token]/react with a
-- fresh client-supplied viewer_key each time — each a new (selects_track_id,
-- viewer_key) row — so a single leaked token could inflate the buyer-facing
-- reaction analytics and grow selects_reactions without bound. The route now
-- rate-limits reactions (audit #7 limiter, per token + per IP), which slows any
-- single/broad flood; this adds a DB-level BACKSTOP that bounds total rows per
-- track regardless of source, because an app-level pre-insert count is racy
-- across serverless instances.
--
-- Cap is generous: a Selects is a curated, small-audience share — legit distinct
-- reactors per track are a handful. 500 is orders of magnitude above real use,
-- so it never blocks a genuine viewer while stopping unbounded growth.
--
-- HUMAN-GATED PUSH.

CREATE OR REPLACE FUNCTION public.enforce_selects_reaction_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.selects_reactions
    WHERE selects_track_id = NEW.selects_track_id;

  IF v_count >= 500 THEN
    RAISE EXCEPTION 'selects reaction cap reached for track %', NEW.selects_track_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_selects_reaction_cap() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS selects_reaction_cap ON public.selects_reactions;
CREATE TRIGGER selects_reaction_cap
  BEFORE INSERT ON public.selects_reactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_selects_reaction_cap();
