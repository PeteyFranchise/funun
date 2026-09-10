-- HUMAN-GATED MIGRATION — DO NOT APPLY AUTOMATICALLY.
-- Depends on Playbook migrations 201 and 202. Migration 203 is permanently
-- retired; the owner must run the Playbook pre-apply gate before application.

BEGIN;

CREATE TABLE public.playbook_review_rounds (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id               UUID NOT NULL REFERENCES public.playbook_entries(id) ON DELETE CASCADE,
  room_id                UUID NOT NULL REFERENCES public.playbook_rooms(id) ON DELETE CASCADE,
  target_kind            TEXT NOT NULL CHECK (target_kind IN ('draft', 'published')),
  target_revision_number INTEGER NOT NULL CHECK (target_revision_number > 0),
  target_draft_version   INTEGER CHECK (target_draft_version IS NULL OR target_draft_version > 0),
  content_snapshot       JSONB NOT NULL,
  status                 TEXT NOT NULL CHECK (status IN (
                           'awaiting_review', 'changes_requested', 'ready_for_rereview',
                           'approved', 'declined', 'superseded'
                         )),
  submitted_by           UUID NOT NULL REFERENCES auth.users(id),
  previous_round_id      UUID REFERENCES public.playbook_review_rounds(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by             UUID REFERENCES auth.users(id),
  decided_at             TIMESTAMPTZ,
  CHECK (
    (target_kind = 'draft' AND target_draft_version IS NOT NULL)
    OR (target_kind = 'published' AND target_draft_version IS NULL)
  ),
  UNIQUE (entry_id, target_kind, target_revision_number, target_draft_version)
);

CREATE INDEX idx_playbook_review_rounds_queue
  ON public.playbook_review_rounds (room_id, status, created_at DESC);
CREATE INDEX idx_playbook_review_rounds_entry
  ON public.playbook_review_rounds (entry_id, created_at DESC);

CREATE TABLE public.playbook_review_threads (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id               UUID NOT NULL REFERENCES public.playbook_entries(id) ON DELETE CASCADE,
  room_id                UUID NOT NULL REFERENCES public.playbook_rooms(id) ON DELETE CASCADE,
  review_round_id        UUID NOT NULL REFERENCES public.playbook_review_rounds(id) ON DELETE RESTRICT,
  target_kind            TEXT NOT NULL CHECK (target_kind IN ('draft', 'published')),
  target_revision_number INTEGER NOT NULL CHECK (target_revision_number > 0),
  target_draft_version   INTEGER CHECK (target_draft_version IS NULL OR target_draft_version > 0),
  anchor_kind            TEXT NOT NULL CHECK (anchor_kind IN ('overall', 'heading', 'list_item')),
  anchor_index           INTEGER CHECK (anchor_index IS NULL OR anchor_index >= 0),
  anchor_label           TEXT CHECK (anchor_label IS NULL OR char_length(anchor_label) <= 240),
  feedback_kind          TEXT NOT NULL CHECK (feedback_kind IN ('suggestion', 'requested_change')),
  status                 TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'addressed', 'resolved')),
  created_by             UUID NOT NULL REFERENCES auth.users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by            UUID REFERENCES auth.users(id),
  resolved_at            TIMESTAMPTZ,
  addressed_by           UUID REFERENCES auth.users(id),
  addressed_at           TIMESTAMPTZ,
  CHECK (
    (target_kind = 'draft' AND target_draft_version IS NOT NULL)
    OR (target_kind = 'published' AND target_draft_version IS NULL)
  ),
  CHECK (
    (anchor_kind = 'overall' AND anchor_index IS NULL)
    OR (anchor_kind <> 'overall' AND anchor_index IS NOT NULL AND anchor_label IS NOT NULL)
  ),
  CHECK (
    (status = 'open' AND resolved_by IS NULL AND resolved_at IS NULL AND addressed_by IS NULL AND addressed_at IS NULL)
    OR (status = 'addressed' AND resolved_by IS NULL AND resolved_at IS NULL AND addressed_by IS NOT NULL AND addressed_at IS NOT NULL)
    OR (status = 'resolved' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX idx_playbook_review_threads_entry_open
  ON public.playbook_review_threads (entry_id, status, feedback_kind, created_at DESC);
CREATE INDEX idx_playbook_review_threads_author
  ON public.playbook_review_threads (created_by, created_at DESC);

CREATE TABLE public.playbook_review_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES public.playbook_review_threads(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 4000),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_playbook_review_messages_thread
  ON public.playbook_review_messages (thread_id, created_at, id);

CREATE TABLE public.playbook_review_mentions (
  message_id UUID NOT NULL REFERENCES public.playbook_review_messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX idx_playbook_review_mentions_user
  ON public.playbook_review_mentions (user_id, created_at DESC);

CREATE TABLE public.playbook_review_events (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  thread_id  UUID NOT NULL REFERENCES public.playbook_review_threads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'replied', 'addressed', 'resolved', 'reopened')),
  actor_id   UUID NOT NULL REFERENCES auth.users(id),
  details    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_playbook_review_events_thread
  ON public.playbook_review_events (thread_id, created_at, id);

CREATE TABLE public.playbook_review_round_events (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  round_id   UUID NOT NULL REFERENCES public.playbook_review_rounds(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN (
               'created', 'changes_requested', 'resubmitted', 'approved', 'declined', 'superseded', 'decision_summary'
             )),
  actor_id   UUID NOT NULL REFERENCES auth.users(id),
  details    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_playbook_review_round_events_round
  ON public.playbook_review_round_events (round_id, created_at, id);

ALTER TABLE public.playbook_review_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_review_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_review_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_review_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_review_round_events ENABLE ROW LEVEL SECURITY;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_review_rounds FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_review_threads FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_review_messages FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_review_mentions FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_review_events FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_review_round_events FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.prevent_playbook_review_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Playbook review history is append-only';
END;
$$;

CREATE TRIGGER protect_playbook_review_messages
  BEFORE UPDATE OR DELETE ON public.playbook_review_messages
  FOR EACH ROW EXECUTE FUNCTION public.prevent_playbook_review_history_mutation();
CREATE TRIGGER protect_playbook_review_mentions
  BEFORE UPDATE OR DELETE ON public.playbook_review_mentions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_playbook_review_history_mutation();
CREATE TRIGGER protect_playbook_review_events
  BEFORE UPDATE OR DELETE ON public.playbook_review_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_playbook_review_history_mutation();
CREATE TRIGGER protect_playbook_review_round_events
  BEFORE UPDATE OR DELETE ON public.playbook_review_round_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_playbook_review_history_mutation();

CREATE OR REPLACE FUNCTION public.protect_playbook_review_round_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Playbook review rounds cannot be deleted'; END IF;
  IF ROW(
    NEW.entry_id, NEW.room_id, NEW.review_round_id, NEW.target_kind, NEW.target_revision_number,
    NEW.target_draft_version, NEW.content_snapshot, NEW.submitted_by,
    NEW.previous_round_id, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.entry_id, OLD.room_id, OLD.review_round_id, OLD.target_kind, OLD.target_revision_number,
    OLD.target_draft_version, OLD.content_snapshot, OLD.submitted_by,
    OLD.previous_round_id, OLD.created_at
  ) THEN RAISE EXCEPTION 'Playbook review round snapshot is immutable'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_playbook_review_round_identity
  BEFORE UPDATE OR DELETE ON public.playbook_review_rounds
  FOR EACH ROW EXECUTE FUNCTION public.protect_playbook_review_round_identity();

CREATE OR REPLACE FUNCTION public.protect_playbook_review_thread_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Playbook review threads cannot be deleted'; END IF;
  IF ROW(
    NEW.entry_id, NEW.room_id, NEW.target_kind, NEW.target_revision_number,
    NEW.target_draft_version, NEW.anchor_kind, NEW.anchor_index,
    NEW.anchor_label, NEW.feedback_kind, NEW.created_by, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.entry_id, OLD.room_id, OLD.target_kind, OLD.target_revision_number,
    OLD.target_draft_version, OLD.anchor_kind, OLD.anchor_index,
    OLD.anchor_label, OLD.feedback_kind, OLD.created_by, OLD.created_at
  ) THEN RAISE EXCEPTION 'Playbook review thread identity is immutable'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_playbook_review_thread_identity
  BEFORE UPDATE OR DELETE ON public.playbook_review_threads
  FOR EACH ROW EXECUTE FUNCTION public.protect_playbook_review_thread_identity();

CREATE OR REPLACE FUNCTION public.create_playbook_review_thread(
  p_entry_id UUID,
  p_room_id UUID,
  p_actor_id UUID,
  p_target_kind TEXT,
  p_target_revision_number INTEGER,
  p_target_draft_version INTEGER,
  p_anchor_kind TEXT,
  p_anchor_index INTEGER,
  p_anchor_label TEXT,
  p_feedback_kind TEXT,
  p_body TEXT,
  p_mentioned_user_ids UUID[] DEFAULT '{}'::uuid[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry public.playbook_entries;
  v_round_id UUID;
  v_thread_id UUID;
  v_message_id UUID;
BEGIN
  SELECT * INTO v_entry FROM public.playbook_entries WHERE id = p_entry_id AND room_id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found in this room'; END IF;
  IF p_target_revision_number <> v_entry.revision_number THEN RAISE EXCEPTION 'This entry changed; refresh before reviewing'; END IF;
  IF p_target_kind = 'draft' AND (v_entry.draft_content IS NULL OR p_target_draft_version <> v_entry.draft_version) THEN
    RAISE EXCEPTION 'This draft changed; refresh before reviewing';
  END IF;
  IF p_target_kind = 'published' AND p_target_draft_version IS NOT NULL THEN
    RAISE EXCEPTION 'Published review cannot target a draft version';
  END IF;

  INSERT INTO public.playbook_review_rounds (
    entry_id, room_id, target_kind, target_revision_number, target_draft_version,
    content_snapshot, status, submitted_by
  ) VALUES (
    p_entry_id, p_room_id, p_target_kind, p_target_revision_number, p_target_draft_version,
    CASE WHEN p_target_kind = 'draft' THEN v_entry.draft_content ELSE v_entry.content END,
    CASE WHEN p_feedback_kind = 'requested_change' THEN 'changes_requested' ELSE 'awaiting_review' END,
    COALESCE(v_entry.draft_author_id, v_entry.author_id, p_actor_id)
  )
  ON CONFLICT (entry_id, target_kind, target_revision_number, target_draft_version)
  DO UPDATE SET status = CASE
    WHEN EXCLUDED.status = 'changes_requested' AND playbook_review_rounds.status IN ('awaiting_review', 'ready_for_rereview')
      THEN 'changes_requested'
    ELSE playbook_review_rounds.status
  END
  RETURNING id INTO v_round_id;

  IF NOT EXISTS (SELECT 1 FROM public.playbook_review_round_events WHERE round_id = v_round_id) THEN
    INSERT INTO public.playbook_review_round_events (round_id, event_type, actor_id)
    VALUES (v_round_id, 'created', p_actor_id);
  END IF;
  IF p_feedback_kind = 'requested_change' THEN
    INSERT INTO public.playbook_review_round_events (round_id, event_type, actor_id)
    VALUES (v_round_id, 'changes_requested', p_actor_id);
  END IF;

  INSERT INTO public.playbook_review_threads (
    entry_id, room_id, review_round_id, target_kind, target_revision_number, target_draft_version,
    anchor_kind, anchor_index, anchor_label, feedback_kind, created_by
  ) VALUES (
    p_entry_id, p_room_id, v_round_id, p_target_kind, p_target_revision_number, p_target_draft_version,
    p_anchor_kind, p_anchor_index, NULLIF(trim(p_anchor_label), ''), p_feedback_kind, p_actor_id
  ) RETURNING id INTO v_thread_id;

  INSERT INTO public.playbook_review_messages (thread_id, body, created_by)
  VALUES (v_thread_id, trim(p_body), p_actor_id) RETURNING id INTO v_message_id;

  INSERT INTO public.playbook_review_mentions (message_id, user_id)
  SELECT v_message_id, mentioned_id FROM unnest(COALESCE(p_mentioned_user_ids, '{}'::uuid[])) mentioned_id
  WHERE mentioned_id <> p_actor_id ON CONFLICT DO NOTHING;

  INSERT INTO public.playbook_review_events (thread_id, event_type, actor_id, details)
  VALUES (v_thread_id, 'created', p_actor_id, jsonb_build_object('message_id', v_message_id));
  RETURN v_thread_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reply_to_playbook_review_thread(
  p_thread_id UUID,
  p_actor_id UUID,
  p_body TEXT,
  p_mentioned_user_ids UUID[] DEFAULT '{}'::uuid[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_message_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.playbook_review_threads WHERE id = p_thread_id) THEN
    RAISE EXCEPTION 'Review thread not found';
  END IF;
  INSERT INTO public.playbook_review_messages (thread_id, body, created_by)
  VALUES (p_thread_id, trim(p_body), p_actor_id) RETURNING id INTO v_message_id;
  INSERT INTO public.playbook_review_mentions (message_id, user_id)
  SELECT v_message_id, mentioned_id FROM unnest(COALESCE(p_mentioned_user_ids, '{}'::uuid[])) mentioned_id
  WHERE mentioned_id <> p_actor_id ON CONFLICT DO NOTHING;
  INSERT INTO public.playbook_review_events (thread_id, event_type, actor_id, details)
  VALUES (p_thread_id, 'replied', p_actor_id, jsonb_build_object('message_id', v_message_id));
  RETURN v_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_playbook_review_thread(
  p_thread_id UUID,
  p_actor_id UUID,
  p_expected_status TEXT,
  p_new_status TEXT
)
RETURNS public.playbook_review_threads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_thread public.playbook_review_threads;
BEGIN
  IF p_new_status NOT IN ('open', 'addressed', 'resolved') OR p_expected_status = p_new_status THEN
    RAISE EXCEPTION 'Invalid review status transition';
  END IF;
  UPDATE public.playbook_review_threads
  SET status = p_new_status,
      resolved_by = CASE WHEN p_new_status = 'resolved' THEN p_actor_id ELSE NULL END,
      resolved_at = CASE WHEN p_new_status = 'resolved' THEN now() ELSE NULL END,
      addressed_by = CASE
        WHEN p_new_status = 'addressed' THEN p_actor_id
        WHEN p_new_status = 'open' THEN NULL
        ELSE addressed_by
      END,
      addressed_at = CASE
        WHEN p_new_status = 'addressed' THEN now()
        WHEN p_new_status = 'open' THEN NULL
        ELSE addressed_at
      END
  WHERE id = p_thread_id AND status = p_expected_status
  RETURNING * INTO v_thread;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review thread changed; refresh and try again'; END IF;
  INSERT INTO public.playbook_review_events (thread_id, event_type, actor_id)
  VALUES (p_thread_id, CASE
    WHEN p_new_status = 'resolved' THEN 'resolved'
    WHEN p_new_status = 'addressed' THEN 'addressed'
    ELSE 'reopened'
  END, p_actor_id);
  RETURN v_thread;
END;
$$;

CREATE OR REPLACE FUNCTION public.resubmit_playbook_review_round(
  p_entry_id UUID,
  p_actor_id UUID,
  p_previous_round_id UUID,
  p_expected_draft_version INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry public.playbook_entries;
  v_previous public.playbook_review_rounds;
  v_new_round_id UUID;
BEGIN
  SELECT * INTO v_entry FROM public.playbook_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR v_entry.draft_content IS NULL THEN RAISE EXCEPTION 'Draft is no longer available'; END IF;
  IF p_actor_id IS DISTINCT FROM v_entry.author_id
     AND p_actor_id IS DISTINCT FROM v_entry.draft_author_id THEN
    RAISE EXCEPTION 'Only the draft author can resubmit';
  END IF;
  IF v_entry.draft_version <> p_expected_draft_version THEN RAISE EXCEPTION 'This draft changed; refresh before resubmitting'; END IF;
  SELECT * INTO v_previous FROM public.playbook_review_rounds
    WHERE id = p_previous_round_id AND entry_id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Previous review round not found'; END IF;
  IF v_previous.status NOT IN ('changes_requested', 'ready_for_rereview') THEN
    RAISE EXCEPTION 'That review round cannot be resubmitted';
  END IF;
  IF v_entry.draft_version <= COALESCE(v_previous.target_draft_version, 0) THEN
    RAISE EXCEPTION 'Save a newer draft before resubmitting';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.playbook_review_threads
    WHERE review_round_id = v_previous.id AND feedback_kind = 'requested_change' AND status = 'open'
  ) THEN RAISE EXCEPTION 'Mark every requested change addressed before resubmitting'; END IF;

  UPDATE public.playbook_review_rounds SET status = 'superseded', decided_by = p_actor_id, decided_at = now()
  WHERE id = v_previous.id;
  INSERT INTO public.playbook_review_round_events (round_id, event_type, actor_id)
  VALUES (v_previous.id, 'superseded', p_actor_id);

  INSERT INTO public.playbook_review_rounds (
    entry_id, room_id, target_kind, target_revision_number, target_draft_version,
    content_snapshot, status, submitted_by, previous_round_id
  ) VALUES (
    v_entry.id, v_entry.room_id, 'draft', v_entry.revision_number, v_entry.draft_version,
    v_entry.draft_content, 'ready_for_rereview', p_actor_id, v_previous.id
  ) RETURNING id INTO v_new_round_id;
  INSERT INTO public.playbook_review_round_events (round_id, event_type, actor_id, details)
  VALUES (v_new_round_id, 'resubmitted', p_actor_id, jsonb_build_object('previous_round_id', v_previous.id));
  RETURN v_new_round_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_playbook_review_round(
  p_entry_id UUID,
  p_actor_id UUID,
  p_target_draft_version INTEGER,
  p_decision TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_round_id UUID;
BEGIN
  IF p_decision NOT IN ('approved', 'declined') THEN RAISE EXCEPTION 'Invalid review decision'; END IF;
  SELECT id INTO v_round_id FROM public.playbook_review_rounds
  WHERE entry_id = p_entry_id AND target_kind = 'draft' AND target_draft_version = p_target_draft_version
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  UPDATE public.playbook_review_rounds
  SET status = p_decision, decided_by = p_actor_id, decided_at = now()
  WHERE id = v_round_id;
  INSERT INTO public.playbook_review_round_events (round_id, event_type, actor_id)
  VALUES (v_round_id, p_decision, p_actor_id);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_playbook_review_decision_summary(
  p_entry_id UUID,
  p_actor_id UUID,
  p_target_draft_version INTEGER,
  p_summary TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_round_id UUID;
BEGIN
  IF char_length(trim(p_summary)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Review summary must be between 1 and 2000 characters';
  END IF;
  SELECT id INTO v_round_id FROM public.playbook_review_rounds
  WHERE entry_id = p_entry_id AND target_kind = 'draft' AND target_draft_version = p_target_draft_version
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  INSERT INTO public.playbook_review_round_events (round_id, event_type, actor_id, details)
  VALUES (v_round_id, 'decision_summary', p_actor_id, jsonb_build_object('summary', trim(p_summary)));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_playbook_review_round_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_round_id UUID;
BEGIN
  IF OLD.draft_content IS NOT NULL
     AND NEW.draft_content IS NULL
     AND NEW.content IS DISTINCT FROM OLD.content
     AND NEW.approved_by IS NOT NULL THEN
    SELECT id INTO v_round_id FROM public.playbook_review_rounds
    WHERE entry_id = NEW.id AND target_kind = 'draft' AND target_draft_version = OLD.draft_version
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      UPDATE public.playbook_review_rounds
      SET status = 'approved', decided_by = NEW.approved_by, decided_at = now()
      WHERE id = v_round_id;
      INSERT INTO public.playbook_review_round_events (round_id, event_type, actor_id)
      VALUES (v_round_id, 'approved', NEW.approved_by);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER complete_playbook_review_round_after_approval
  AFTER UPDATE ON public.playbook_entries
  FOR EACH ROW EXECUTE FUNCTION public.complete_playbook_review_round_on_approval();

REVOKE ALL ON FUNCTION public.prevent_playbook_review_history_mutation() FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.protect_playbook_review_round_identity() FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.protect_playbook_review_thread_identity() FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.complete_playbook_review_round_on_approval() FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.create_playbook_review_thread(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, TEXT, INTEGER, TEXT, TEXT, TEXT, UUID[]) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.reply_to_playbook_review_thread(UUID, UUID, TEXT, UUID[]) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.transition_playbook_review_thread(UUID, UUID, TEXT, TEXT) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.resubmit_playbook_review_round(UUID, UUID, UUID, INTEGER) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.complete_playbook_review_round(UUID, UUID, INTEGER, TEXT) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.record_playbook_review_decision_summary(UUID, UUID, INTEGER, TEXT) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_playbook_review_thread(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, TEXT, INTEGER, TEXT, TEXT, TEXT, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.reply_to_playbook_review_thread(UUID, UUID, TEXT, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_playbook_review_thread(UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.resubmit_playbook_review_round(UUID, UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_playbook_review_round(UUID, UUID, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_playbook_review_decision_summary(UUID, UUID, INTEGER, TEXT) TO service_role;

COMMENT ON TABLE public.playbook_review_threads IS
  'Revision-bound Playbook review discussions. Suggestions are advisory; requested changes remain explicit without silently blocking approval.';
COMMENT ON TABLE public.playbook_review_events IS
  'Append-only audit history for review-thread creation, replies, resolution, and reopening.';
COMMENT ON TABLE public.playbook_review_rounds IS
  'Immutable content snapshots and explicit workflow state for each Playbook review round.';

COMMIT;
