-- Migration 126: serialize Selects reaction cap enforcement per track

CREATE OR REPLACE FUNCTION public.enforce_selects_reaction_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Transaction-scoped and keyed by track: concurrent inserts for this track
  -- cannot all observe the same pre-insert count. Unrelated tracks proceed.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.selects_track_id::TEXT, 0)
  );

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
