-- 226_track_metadata_atomic_asset_merge.sql
-- Closes audit finding M-02: concurrent stems and instrumental writes silently
-- dropped each other's entry. Adds creative-asset bookkeeping only; alters no
-- authorship, credits, splits, rights, approvals, delivery state, or membership.

-- ─── The defect ──────────────────────────────────────────────────────────
-- Four call sites (stems POST/DELETE, instrumental POST/DELETE) each did a
-- read-modify-write of the WHOLE `tracks.metadata` column: SELECT the object,
-- spread it in JavaScript, UPDATE the column back. With no version predicate
-- and no lock, two requests that read the same object both wrote their own
-- copy of it, and the second silently erased the first one's key.
--
-- The uploaded file survived in Storage; only the reference to it vanished. So
-- the asset became orphaned and invisible while the UI showed state that
-- contradicted what had just been uploaded, and nothing errored.
--
-- ─── Why a merge rather than a compare-and-swap ──────────────────────────
-- `tracks` already has a BEFORE UPDATE trigger maintaining `updated_at`
-- (migration 001), so an optimistic CAS was available without any migration.
-- It was rejected deliberately: stems and instrumental touch DIFFERENT keys,
-- and a CAS would make them conflict and retry over a collision that has no
-- reason to exist. `||` merges at the top level, so both writes simply
-- succeed. The right fix removes the contention rather than detecting it.
--
-- ─── SECURITY INVOKER, deliberately ──────────────────────────────────────
-- These run as the caller so the existing RLS on `tracks` still applies. The
-- ownership predicate inside each statement is a second, independent gate, not
-- redundant narrowing — the same posture plan 40-05 took with private pins.

-- ─── (1) set — merge one asset key ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_track_metadata_asset(
  p_track_id   UUID,
  p_project_id UUID,
  p_key        TEXT,
  p_value      JSONB
)
RETURNS public.tracks
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_row public.tracks;
BEGIN
  -- An allowlist, not a passthrough. Without it this would be an arbitrary
  -- metadata write primitive reachable by any authenticated caller, which is a
  -- far larger surface than the defect being fixed.
  IF p_key NOT IN ('stems', 'instrumental') THEN
    RAISE EXCEPTION 'track_metadata_key_not_allowed' USING ERRCODE = '22023';
  END IF;

  IF p_value IS NULL OR jsonb_typeof(p_value) <> 'object' THEN
    RAISE EXCEPTION 'track_metadata_value_must_be_object' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tracks
  SET metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(p_key, p_value)
  WHERE id = p_track_id
    AND project_id = p_project_id
    AND user_id = auth.uid()
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'track_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_track_metadata_asset(UUID, UUID, TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_track_metadata_asset(UUID, UUID, TEXT, JSONB)
  TO authenticated;

-- ─── (2) clear — remove one asset key ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.clear_track_metadata_asset(
  p_track_id   UUID,
  p_project_id UUID,
  p_key        TEXT
)
RETURNS public.tracks
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_row public.tracks;
BEGIN
  IF p_key NOT IN ('stems', 'instrumental') THEN
    RAISE EXCEPTION 'track_metadata_key_not_allowed' USING ERRCODE = '22023';
  END IF;

  -- `-` removes exactly this key and leaves every sibling untouched, which is
  -- the whole point: the old DELETE path rewrote the entire object and could
  -- erase a key a concurrent request had just added.
  UPDATE public.tracks
  SET metadata = COALESCE(metadata, '{}'::JSONB) - p_key
  WHERE id = p_track_id
    AND project_id = p_project_id
    AND user_id = auth.uid()
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'track_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_track_metadata_asset(UUID, UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_track_metadata_asset(UUID, UUID, TEXT)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
