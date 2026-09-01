-- 145_writer_room_lyric_snapshots.sql
-- Stage 3 Writer's Room safety: immutable, section-level recovery points.
-- One baseline is captured per editing session rather than per keystroke.

CREATE TABLE public.work_lyric_block_snapshots (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id              UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  block_id             UUID NOT NULL REFERENCES public.lyric_blocks(id) ON DELETE CASCADE,
  capture_key          UUID NOT NULL,
  reason               TEXT NOT NULL CHECK (reason IN ('edit_session_start', 'before_restore')),
  text                 TEXT NOT NULL,
  captured_by_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (block_id, capture_key)
);

CREATE INDEX idx_work_lyric_block_snapshots_block_created
  ON public.work_lyric_block_snapshots (block_id, created_at DESC);

ALTER TABLE public.work_lyric_block_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_lyric_block_snapshots_select
ON public.work_lyric_block_snapshots
FOR SELECT
TO authenticated
USING (
  public.is_work_owner(work_id, auth.uid())
  OR public.work_member_tier(work_id, auth.uid()) IS NOT NULL
);

REVOKE ALL ON TABLE public.work_lyric_block_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, work_id, block_id, reason, text, captured_by_user_id, created_at
) ON public.work_lyric_block_snapshots TO authenticated;

COMMENT ON TABLE public.work_lyric_block_snapshots IS
  'Immutable Writer''s Room lyric recovery points. Captured once per accepted edit session and before a restore; never a keystroke log, authorship assignment, split, or legal consent record.';

-- A tab/session id identifies the browser tab for lock ownership. An edit
-- cycle id identifies one continuous reservation of one section within that
-- tab, so leaving and returning later earns a fresh recovery baseline.
ALTER TABLE public.work_lyric_block_locks
  ADD COLUMN edit_cycle_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE OR REPLACE FUNCTION public.claim_work_lyric_block_lock(
  p_work_id UUID,
  p_block_id UUID,
  p_uid UUID,
  p_session_id UUID,
  p_takeover BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  granted BOOLEAN,
  out_block_id UUID,
  holder_user_id UUID,
  holder_session_id UUID,
  lease_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lock public.work_lyric_block_locks%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.lyric_blocks
    WHERE id = p_block_id AND work_id = p_work_id
  ) THEN
    RAISE EXCEPTION 'lyric_block_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.work_lyric_block_locks AS current_lock (
    block_id, work_id, user_id, session_id, acquired_at, renewed_at, expires_at
  )
  VALUES (
    p_block_id, p_work_id, p_uid, p_session_id, now(), now(), now() + interval '30 seconds'
  )
  ON CONFLICT (block_id) DO UPDATE
    SET work_id = EXCLUDED.work_id,
        user_id = EXCLUDED.user_id,
        session_id = EXCLUDED.session_id,
        edit_cycle_id = CASE
          WHEN current_lock.user_id = EXCLUDED.user_id
           AND current_lock.session_id = EXCLUDED.session_id
           AND current_lock.expires_at > now()
            THEN current_lock.edit_cycle_id
          ELSE gen_random_uuid()
        END,
        acquired_at = CASE
          WHEN current_lock.user_id = EXCLUDED.user_id
           AND current_lock.session_id = EXCLUDED.session_id
           AND current_lock.expires_at > now()
            THEN current_lock.acquired_at
          ELSE now()
        END,
        renewed_at = now(),
        expires_at = now() + interval '30 seconds'
    WHERE current_lock.expires_at <= now()
       OR (
         current_lock.user_id = EXCLUDED.user_id
         AND current_lock.session_id = EXCLUDED.session_id
       )
       OR p_takeover
  RETURNING * INTO v_lock;

  IF FOUND THEN
    RETURN QUERY SELECT TRUE, v_lock.block_id, v_lock.user_id, v_lock.session_id, v_lock.expires_at;
    RETURN;
  END IF;

  SELECT * INTO v_lock
  FROM public.work_lyric_block_locks
  WHERE block_id = p_block_id;

  RETURN QUERY SELECT FALSE, v_lock.block_id, v_lock.user_id, v_lock.session_id, v_lock.expires_at;
END;
$$;

-- RLS proves membership, but before this guard a member could still bypass
-- the section lease by writing lyric_blocks.text directly through PostgREST.
-- Only the approved locked-save, restore and detach functions set this
-- transaction-local capability immediately before their canonical UPDATE.
CREATE OR REPLACE FUNCTION public.enforce_lyric_text_write_path()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_write_mode TEXT;
BEGIN
  v_write_mode := NULLIF(current_setting('funun.lyric_text_write', TRUE), '');
  IF v_write_mode IS NULL OR v_write_mode NOT IN ('locked_save', 'restore', 'detach') THEN
    RAISE EXCEPTION 'lyric_text_write_path_required' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_lyric_text_write_path ON public.lyric_blocks;
CREATE TRIGGER trg_enforce_lyric_text_write_path
  BEFORE UPDATE OF text ON public.lyric_blocks
  FOR EACH ROW
  WHEN (NEW.text IS DISTINCT FROM OLD.text)
  EXECUTE FUNCTION public.enforce_lyric_text_write_path();

-- A linked repeat has no independent editable text until the writer chooses
-- "Detach to vary." Keep that intentional transition available without
-- opening a general direct-text-write bypass.
CREATE OR REPLACE FUNCTION public.detach_lyric_block_with_text(
  p_work_id UUID,
  p_block_id UUID,
  p_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated public.lyric_blocks%ROWTYPE;
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'work_access_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_text IS NULL OR char_length(p_text) > 4000 THEN
    RAISE EXCEPTION 'invalid_lyric_text' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_work_owner(p_work_id, v_uid)
    OR public.work_member_tier(p_work_id, v_uid) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'work_access_required' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('funun.lyric_text_write', 'detach', TRUE);

  UPDATE public.lyric_blocks
  SET text = p_text,
      repeat_of_block_id = NULL,
      author_kind = 'human',
      author_user_id = v_uid
  WHERE id = p_block_id
    AND work_id = p_work_id
    AND repeat_of_block_id IS NOT NULL
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lyric_block_not_repeat' USING ERRCODE = 'P0001';
  END IF;

  RETURN to_jsonb(v_updated);
END;
$$;

-- Keep the existing locked-save signature so clients do not change their
-- save contract. The first real text change for a tab/session captures the
-- section exactly as it stood before that session began changing it.
CREATE OR REPLACE FUNCTION public.save_locked_lyric_block_text(
  p_work_id UUID,
  p_block_id UUID,
  p_session_id UUID,
  p_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lock public.work_lyric_block_locks%ROWTYPE;
  v_current public.lyric_blocks%ROWTYPE;
  v_updated public.lyric_blocks%ROWTYPE;
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'lyric_lock_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_text IS NULL OR char_length(p_text) > 4000 THEN
    RAISE EXCEPTION 'invalid_lyric_text' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_work_owner(p_work_id, v_uid)
    OR public.work_member_tier(p_work_id, v_uid) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'work_access_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_lock
  FROM public.work_lyric_block_locks
  WHERE work_id = p_work_id AND block_id = p_block_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_lock.user_id <> v_uid
     OR v_lock.session_id <> p_session_id
     OR v_lock.expires_at <= now() THEN
    RAISE EXCEPTION 'lyric_lock_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_current
  FROM public.lyric_blocks
  WHERE id = p_block_id
    AND work_id = p_work_id
    AND repeat_of_block_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lyric_block_not_editable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.work_lyric_block_locks
  SET renewed_at = now(), expires_at = now() + interval '30 seconds'
  WHERE block_id = p_block_id;

  IF p_text IS DISTINCT FROM v_current.text THEN
    INSERT INTO public.work_lyric_block_snapshots (
      work_id, block_id, capture_key, reason, text, captured_by_user_id
    )
    VALUES (
      p_work_id, p_block_id, v_lock.edit_cycle_id, 'edit_session_start', v_current.text, v_uid
    )
    ON CONFLICT (block_id, capture_key) DO NOTHING;

    PERFORM set_config('funun.lyric_text_write', 'locked_save', TRUE);

    UPDATE public.lyric_blocks
    SET text = p_text
    WHERE id = p_block_id
      AND work_id = p_work_id
      AND repeat_of_block_id IS NULL
    RETURNING * INTO v_updated;
  ELSE
    v_updated := v_current;
  END IF;

  RETURN to_jsonb(v_updated);
END;
$$;

-- A restore is an ordinary canonical lyric update guarded by the same
-- section lease. Before replacing the current words, preserve them under
-- a fresh key so undoing a restore is always possible.
CREATE OR REPLACE FUNCTION public.restore_locked_lyric_block_snapshot(
  p_work_id UUID,
  p_block_id UUID,
  p_snapshot_id UUID,
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lock public.work_lyric_block_locks%ROWTYPE;
  v_current public.lyric_blocks%ROWTYPE;
  v_snapshot public.work_lyric_block_snapshots%ROWTYPE;
  v_updated public.lyric_blocks%ROWTYPE;
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'lyric_lock_required' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    public.is_work_owner(p_work_id, v_uid)
    OR public.work_member_tier(p_work_id, v_uid) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'work_access_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_lock
  FROM public.work_lyric_block_locks
  WHERE work_id = p_work_id AND block_id = p_block_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_lock.user_id <> v_uid
     OR v_lock.session_id <> p_session_id
     OR v_lock.expires_at <= now() THEN
    RAISE EXCEPTION 'lyric_lock_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_snapshot
  FROM public.work_lyric_block_snapshots
  WHERE id = p_snapshot_id
    AND work_id = p_work_id
    AND block_id = p_block_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lyric_snapshot_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_current
  FROM public.lyric_blocks
  WHERE id = p_block_id
    AND work_id = p_work_id
    AND repeat_of_block_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lyric_block_not_editable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.work_lyric_block_locks
  SET renewed_at = now(), expires_at = now() + interval '30 seconds'
  WHERE block_id = p_block_id;

  IF v_snapshot.text IS DISTINCT FROM v_current.text THEN
    INSERT INTO public.work_lyric_block_snapshots (
      work_id, block_id, capture_key, reason, text, captured_by_user_id
    )
    VALUES (
      p_work_id, p_block_id, gen_random_uuid(), 'before_restore', v_current.text, v_uid
    );

    PERFORM set_config('funun.lyric_restore_snapshot_id', p_snapshot_id::TEXT, TRUE);
    PERFORM set_config('funun.lyric_text_write', 'restore', TRUE);

    UPDATE public.lyric_blocks
    SET text = v_snapshot.text
    WHERE id = p_block_id
      AND work_id = p_work_id
      AND repeat_of_block_id IS NULL
    RETURNING * INTO v_updated;
  ELSE
    v_updated := v_current;
  END IF;

  RETURN to_jsonb(v_updated);
END;
$$;

-- Preserve migration 138's trigger-sourced diary guarantee while making a
-- restore read differently from an ordinary edit. The transaction-local
-- setting exists only around the restore UPDATE above.
CREATE OR REPLACE FUNCTION public.capture_lyric_block_edited()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_restore_snapshot_id TEXT;
  v_write_mode TEXT;
BEGIN
  v_write_mode := NULLIF(current_setting('funun.lyric_text_write', TRUE), '');
  IF v_write_mode = 'detach' THEN
    RETURN NEW;
  END IF;

  v_restore_snapshot_id := NULLIF(
    current_setting('funun.lyric_restore_snapshot_id', TRUE),
    ''
  );

  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    NEW.work_id,
    'lyric_edit',
    COALESCE(auth.uid(), NEW.author_user_id),
    jsonb_strip_nulls(jsonb_build_object(
      'blockId', NEW.id,
      'blockType', NEW.block_type,
      'customLabel', NEW.custom_label,
      'operation', CASE WHEN v_restore_snapshot_id IS NULL THEN 'edited' ELSE 'restored' END,
      'snapshotId', v_restore_snapshot_id
    ))
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_locked_lyric_block_text(uuid, uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_locked_lyric_block_text(uuid, uuid, uuid, text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_work_lyric_block_lock(uuid, uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_work_lyric_block_lock(uuid, uuid, uuid, uuid, boolean)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.detach_lyric_block_with_text(uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detach_lyric_block_with_text(uuid, uuid, text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.restore_locked_lyric_block_snapshot(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_locked_lyric_block_snapshot(uuid, uuid, uuid, uuid)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.capture_lyric_block_edited()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.enforce_lyric_text_write_path()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
