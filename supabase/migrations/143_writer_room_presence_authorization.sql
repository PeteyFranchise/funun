-- 143_writer_room_presence_authorization.sql
-- Private Realtime Presence for the Writer's Room. Presence is creative,
-- ephemeral context only; legal and approval data never uses this channel.

CREATE OR REPLACE FUNCTION public.writer_room_topic_work_id(p_topic TEXT)
RETURNS UUID
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_topic ~ '^writers-room:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}:presence$'
      THEN split_part(p_topic, ':', 2)::uuid
    ELSE NULL
  END
$$;

REVOKE EXECUTE ON FUNCTION public.writer_room_topic_work_id(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.writer_room_topic_work_id(text) TO authenticated;

COMMENT ON FUNCTION public.writer_room_topic_work_id(text) IS
  'Returns the work UUID from a strictly shaped Writer''s Room Presence topic, or NULL. Used only by realtime.messages RLS policies.';

DROP POLICY IF EXISTS writer_room_presence_receive ON realtime.messages;
CREATE POLICY writer_room_presence_receive
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  extension = 'presence'
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
DROP POLICY IF EXISTS writer_room_presence_send ON realtime.messages;
CREATE POLICY writer_room_presence_send
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  extension = 'presence'
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
