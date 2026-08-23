-- Migration 127: apply full Launchpad checklist reorders transactionally

CREATE OR REPLACE FUNCTION public.reorder_launchpad_checklist(
  p_order JSONB
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_length INT;
  v_expected INT;
  v_updated INT;
BEGIN
  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'array' THEN
    RAISE EXCEPTION 'order must be an array' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_length := jsonb_array_length(p_order);
  IF v_length > 200 THEN
    RAISE EXCEPTION 'order may contain at most 200 items' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_order) AS entry
    WHERE jsonb_typeof(entry) <> 'object'
      OR jsonb_typeof(entry -> 'key') IS DISTINCT FROM 'string'
      OR (entry ->> 'key') !~ '^[a-z0-9_]+$'
      OR char_length(entry ->> 'key') > 100
      OR jsonb_typeof(entry -> 'sort_order') IS DISTINCT FROM 'number'
      OR (entry ->> 'sort_order') !~ '^(0|[1-9][0-9]{0,2})$'
      OR (entry ->> 'sort_order')::INT < 0
      OR (entry ->> 'sort_order')::INT > 199
  ) THEN
    RAISE EXCEPTION 'order contains an invalid key or position'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF (
    SELECT count(DISTINCT entry ->> 'key')
    FROM jsonb_array_elements(p_order) AS entry
  ) <> v_length THEN
    RAISE EXCEPTION 'order contains duplicate keys' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_length > 0 AND (
    SELECT count(DISTINCT (entry ->> 'sort_order')::INT) <> v_length
      OR min((entry ->> 'sort_order')::INT) <> 0
      OR max((entry ->> 'sort_order')::INT) <> v_length - 1
    FROM jsonb_array_elements(p_order) AS entry
  ) THEN
    RAISE EXCEPTION 'positions must be unique and contiguous from zero'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Blocks concurrent checklist mutations between the completeness check and
  -- the set-based update. The RPC itself is one database transaction.
  LOCK TABLE public.launchpad_checklist_items IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*) INTO v_expected
  FROM public.launchpad_checklist_items;

  IF v_expected <> v_length OR EXISTS (
    SELECT 1
    FROM public.launchpad_checklist_items AS item
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_order) AS entry
      WHERE entry ->> 'key' = item.key
    )
  ) THEN
    RAISE EXCEPTION 'order must contain every current checklist item exactly once'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.launchpad_checklist_items AS item
  SET sort_order = requested.sort_order
  FROM jsonb_to_recordset(p_order) AS requested(key TEXT, sort_order INT)
  WHERE item.key = requested.key;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'checklist changed during reorder'
      USING ERRCODE = 'serialization_failure';
  END IF;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_launchpad_checklist(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_launchpad_checklist(JSONB) TO service_role;
