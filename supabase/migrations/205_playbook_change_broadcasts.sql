-- ============================================================
-- Funūn — Internal Playbook Change Broadcasts
-- Migration 205 — HUMAN-GATED; DO NOT APPLY AUTOMATICALLY
--
-- DEPENDS ON Playbook migrations 201, 202, and 204. Migration 203 is
-- permanently retired. The owner must run the Playbook pre-apply gate.
-- ============================================================

BEGIN;

CREATE TABLE public.playbook_change_broadcasts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id              UUID NOT NULL REFERENCES public.playbook_entries(id) ON DELETE CASCADE,
  room_id               UUID NOT NULL REFERENCES public.playbook_rooms(id) ON DELETE CASCADE,
  revision_number       INTEGER NOT NULL CHECK (revision_number > 0),
  headline              TEXT NOT NULL CHECK (char_length(trim(headline)) BETWEEN 1 AND 180),
  change_summary        TEXT NOT NULL CHECK (char_length(trim(change_summary)) BETWEEN 1 AND 2000),
  why_it_matters        TEXT NOT NULL CHECK (char_length(trim(why_it_matters)) BETWEEN 1 AND 2000),
  action_required       TEXT CHECK (action_required IS NULL OR char_length(trim(action_required)) BETWEEN 1 AND 2000),
  priority              TEXT NOT NULL DEFAULT 'standard'
                        CHECK (priority IN ('standard', 'important', 'urgent')),
  audience_kind         TEXT NOT NULL CHECK (audience_kind IN ('all_team', 'role', 'user')),
  target_role           TEXT CHECK (target_role IN (
                          'leadership', 'ae', 'bd', 'anr', 'it', 'legal',
                          'tms', 'accounting', 'marketing'
                        )),
  target_user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  effective_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  reading_required      BOOLEAN NOT NULL DEFAULT false,
  reading_due_at        TIMESTAMPTZ,
  published_by          UUID NOT NULL REFERENCES auth.users(id),
  published_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (audience_kind = 'all_team' AND target_role IS NULL AND target_user_id IS NULL)
    OR (audience_kind = 'role' AND target_role IS NOT NULL AND target_user_id IS NULL)
    OR (audience_kind = 'user' AND target_role IS NULL AND target_user_id IS NOT NULL)
  ),
  CHECK (NOT reading_required OR action_required IS NOT NULL)
);

CREATE INDEX idx_playbook_change_broadcasts_feed
  ON public.playbook_change_broadcasts (published_at DESC, id);
CREATE INDEX idx_playbook_change_broadcasts_room
  ON public.playbook_change_broadcasts (room_id, published_at DESC);
CREATE INDEX idx_playbook_change_broadcasts_role
  ON public.playbook_change_broadcasts (target_role, published_at DESC)
  WHERE audience_kind = 'role';
CREATE INDEX idx_playbook_change_broadcasts_user
  ON public.playbook_change_broadcasts (target_user_id, published_at DESC)
  WHERE audience_kind = 'user';
CREATE UNIQUE INDEX idx_playbook_change_broadcast_all_team_unique
  ON public.playbook_change_broadcasts (entry_id, revision_number)
  WHERE audience_kind = 'all_team';
CREATE UNIQUE INDEX idx_playbook_change_broadcast_role_unique
  ON public.playbook_change_broadcasts (entry_id, revision_number, target_role)
  WHERE audience_kind = 'role';
CREATE UNIQUE INDEX idx_playbook_change_broadcast_user_unique
  ON public.playbook_change_broadcasts (entry_id, revision_number, target_user_id)
  WHERE audience_kind = 'user';

CREATE TABLE public.playbook_change_broadcast_reads (
  broadcast_id UUID NOT NULL REFERENCES public.playbook_change_broadcasts(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (broadcast_id, user_id)
);

CREATE INDEX idx_playbook_change_broadcast_reads_user
  ON public.playbook_change_broadcast_reads (user_id, read_at DESC);

ALTER TABLE public.playbook_change_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_change_broadcast_reads ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.playbook_change_broadcasts FROM PUBLIC, authenticated, anon;
REVOKE ALL PRIVILEGES ON TABLE public.playbook_change_broadcast_reads FROM PUBLIC, authenticated, anon;

CREATE OR REPLACE FUNCTION public.prevent_playbook_change_broadcast_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Published Playbook change broadcasts are append-only';
END;
$$;

CREATE TRIGGER protect_playbook_change_broadcast_history
  BEFORE UPDATE OR DELETE ON public.playbook_change_broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_playbook_change_broadcast_mutation();

COMMENT ON TABLE public.playbook_change_broadcasts IS
  'Internal-only, revision-linked Playbook updates. Visibility requires both Team Member identity and room access.';
COMMENT ON TABLE public.playbook_change_broadcast_reads IS
  'Per-Team-Member discovery state for internal Playbook updates; not an acknowledgement, signature, or consent record.';

CREATE OR REPLACE FUNCTION public.publish_playbook_change_broadcast(
  p_entry_id UUID,
  p_room_id UUID,
  p_revision_number INTEGER,
  p_headline TEXT,
  p_change_summary TEXT,
  p_why_it_matters TEXT,
  p_action_required TEXT,
  p_priority TEXT,
  p_audience_kind TEXT,
  p_target_role TEXT,
  p_target_user_id UUID,
  p_effective_at TIMESTAMPTZ,
  p_reading_required BOOLEAN,
  p_reading_due_at TIMESTAMPTZ,
  p_published_by UUID,
  p_recipient_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_broadcast_id UUID;
  v_recipient_id UUID;
  v_entry public.playbook_entries;
BEGIN
  SELECT * INTO v_entry
  FROM public.playbook_entries
  WHERE id = p_entry_id AND room_id = p_room_id
  FOR UPDATE;
  IF NOT FOUND OR v_entry.status <> 'published' THEN
    RAISE EXCEPTION 'Published Playbook entry not found in this room';
  END IF;
  IF v_entry.revision_number <> p_revision_number THEN
    RAISE EXCEPTION 'This entry changed; refresh before publishing its update';
  END IF;

  INSERT INTO public.playbook_change_broadcasts (
    entry_id, room_id, revision_number, headline, change_summary, why_it_matters,
    action_required, priority, audience_kind, target_role, target_user_id,
    effective_at, reading_required, reading_due_at, published_by
  ) VALUES (
    p_entry_id, p_room_id, p_revision_number, trim(p_headline), trim(p_change_summary),
    trim(p_why_it_matters), NULLIF(trim(p_action_required), ''), p_priority,
    p_audience_kind, p_target_role, p_target_user_id, p_effective_at,
    p_reading_required, p_reading_due_at, p_published_by
  ) RETURNING id INTO v_broadcast_id;

  FOREACH v_recipient_id IN ARRAY COALESCE(p_recipient_ids, '{}'::UUID[]) LOOP
    IF p_reading_required THEN
      INSERT INTO public.playbook_reading_assignments (
        entry_id, target_kind, target_user_id, target_role, required_revision,
        required, due_at, assigned_by
      ) VALUES (
        p_entry_id, 'user', v_recipient_id, NULL, p_revision_number,
        true, p_reading_due_at, p_published_by
      )
      ON CONFLICT (entry_id, target_user_id)
        WHERE target_kind = 'user' AND revoked_at IS NULL
      DO UPDATE SET
        required_revision = EXCLUDED.required_revision,
        required = true,
        due_at = EXCLUDED.due_at,
        assigned_by = EXCLUDED.assigned_by,
        updated_at = now();
    END IF;

    IF v_recipient_id <> p_published_by THEN
      INSERT INTO public.notifications (user_id, type, title, body, link, data, actor_id)
      VALUES (
        v_recipient_id,
        'playbook_change_broadcast',
        CASE WHEN p_priority = 'urgent' THEN 'Urgent Playbook update: ' ELSE 'Playbook update: ' END || trim(p_headline),
        trim(p_change_summary),
        '/admin/playbook/updates?update=' || v_broadcast_id::TEXT || '#update-' || v_broadcast_id::TEXT,
        jsonb_build_object(
          'broadcastId', v_broadcast_id,
          'entryId', p_entry_id,
          'revisionNumber', p_revision_number,
          'readingRequired', p_reading_required
        ),
        p_published_by
      );
    END IF;
  END LOOP;

  RETURN v_broadcast_id;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_playbook_change_broadcast_mutation() FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.publish_playbook_change_broadcast(
  UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID,
  TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ, UUID, UUID[]
) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.publish_playbook_change_broadcast(
  UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID,
  TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ, UUID, UUID[]
) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
