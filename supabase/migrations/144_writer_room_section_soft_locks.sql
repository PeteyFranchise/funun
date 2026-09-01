-- 144_writer_room_section_soft_locks.sql
-- Stage 2 Writer's Room collaboration: server-authoritative lyric-section
-- leases plus private broadcast authorization for canonical invalidations.

CREATE TABLE public.work_lyric_block_locks (
  block_id     UUID PRIMARY KEY REFERENCES public.lyric_blocks(id) ON DELETE CASCADE,
  work_id      UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id   UUID NOT NULL,
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  renewed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_work_lyric_block_locks_work_expiry
  ON public.work_lyric_block_locks (work_id, expires_at);

ALTER TABLE public.work_lyric_block_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.work_lyric_block_locks FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.work_lyric_block_locks IS
  'Ephemeral 30-second Writer''s Room lyric-section leases. Server-only capability state; not authorship, rights, splits or legal consent.';

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
        acquired_at = CASE
          WHEN current_lock.user_id = EXCLUDED.user_id
           AND current_lock.session_id = EXCLUDED.session_id
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

CREATE OR REPLACE FUNCTION public.release_work_lyric_block_lock(
  p_work_id UUID,
  p_block_id UUID,
  p_uid UUID,
  p_session_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.work_lyric_block_locks
  WHERE work_id = p_work_id
    AND block_id = p_block_id
    AND user_id = p_uid
    AND session_id = p_session_id;
  RETURN FOUND;
END;
$$;

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

  UPDATE public.work_lyric_block_locks
  SET renewed_at = now(), expires_at = now() + interval '30 seconds'
  WHERE block_id = p_block_id;

  UPDATE public.lyric_blocks
  SET text = p_text
  WHERE id = p_block_id
    AND work_id = p_work_id
    AND repeat_of_block_id IS NULL
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lyric_block_not_editable' USING ERRCODE = 'P0001';
  END IF;

  RETURN to_jsonb(v_updated);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_work_lyric_block_lock(uuid, uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_work_lyric_block_lock(uuid, uuid, uuid, uuid, boolean)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_work_lyric_block_lock(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_work_lyric_block_lock(uuid, uuid, uuid, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.save_locked_lyric_block_text(uuid, uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_locked_lyric_block_text(uuid, uuid, uuid, text)
  TO authenticated;

DROP POLICY IF EXISTS writer_room_presence_receive ON realtime.messages;
DROP POLICY IF EXISTS writer_room_presence_send ON realtime.messages;
DROP POLICY IF EXISTS writer_room_live_receive ON realtime.messages;
CREATE POLICY writer_room_live_receive
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  extension IN ('presence', 'broadcast')
  AND (
    (SELECT public.is_work_owner(
      (SELECT public.writer_room_topic_work_id(realtime.topic())),
      auth.uid()
    ))
    OR (SELECT public.work_member_tier(
      (SELECT public.writer_room_topic_work_id(realtime.topic())),
      auth.uid()
    )) IS NOT NULL
  )
);

DROP POLICY IF EXISTS writer_room_live_send ON realtime.messages;
CREATE POLICY writer_room_live_send
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  extension IN ('presence', 'broadcast')
  AND (
    (SELECT public.is_work_owner(
      (SELECT public.writer_room_topic_work_id(realtime.topic())),
      auth.uid()
    ))
    OR (SELECT public.work_member_tier(
      (SELECT public.writer_room_topic_work_id(realtime.topic())),
      auth.uid()
    )) IS NOT NULL
  )
);

NOTIFY pgrst, 'reload schema';
