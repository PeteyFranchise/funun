-- DRAFT ONLY — DO NOT APPLY.
-- Assign a migration number only after Claude's concurrent Phase 38 work is
-- reconciled. This file is intentionally outside supabase/migrations.
-- HUMAN-GATED: repository owner must review and explicitly apply.

ALTER TABLE public.playbook_entries
  DROP CONSTRAINT IF EXISTS playbook_entries_entry_type_check;

ALTER TABLE public.playbook_entries
  ADD CONSTRAINT playbook_entries_entry_type_check
  CHECK (entry_type IN ('sop', 'topic', 'document'));

ALTER TABLE public.playbook_entries
  DROP CONSTRAINT IF EXISTS playbook_entries_status_check;

ALTER TABLE public.playbook_entries
  ADD CONSTRAINT playbook_entries_status_check
  CHECK (status IN ('draft_pending', 'published', 'archived', 'superseded'));

ALTER TABLE public.playbook_entries
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS draft_author_id UUID REFERENCES auth.users,
  ADD COLUMN IF NOT EXISTS draft_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS draft_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'native',
  ADD COLUMN IF NOT EXISTS source_path TEXT,
  ADD COLUMN IF NOT EXISTS source_hash TEXT,
  ADD COLUMN IF NOT EXISTS draft_source_hash TEXT,
  ADD COLUMN IF NOT EXISTS adopted_at TIMESTAMPTZ;

ALTER TABLE public.playbook_entries
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_interval_days INTEGER,
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reviewed_by UUID REFERENCES auth.users ON DELETE SET NULL;

UPDATE public.playbook_entries
SET slug = COALESCE(
  NULLIF(
    trim(BOTH '-' FROM regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g')),
    ''
  ),
  'entry'
) || '-' || left(id::text, 8)
WHERE slug IS NULL;

UPDATE public.playbook_entries
SET draft_author_id = COALESCE(draft_author_id, author_id),
    draft_updated_at = COALESCE(draft_updated_at, updated_at, created_at),
    draft_version = GREATEST(draft_version, 1)
WHERE draft_content IS NOT NULL;

UPDATE public.playbook_entries
SET owner_id = COALESCE(owner_id, author_id)
WHERE owner_id IS NULL;

-- Migration 130 temporarily used status=draft_pending for proposed edits to
-- already-published content. Preserve that live content while keeping the
-- proposed revision pending in draft_content.
UPDATE public.playbook_entries
SET status = 'published'
WHERE status = 'draft_pending'
  AND content <> '{}'::jsonb
  AND draft_content IS NOT NULL;

ALTER TABLE public.playbook_entries
  ALTER COLUMN slug SET NOT NULL;

ALTER TABLE public.playbook_entries
  ADD CONSTRAINT playbook_entries_source_kind_check
  CHECK (source_kind IN ('native', 'adopted_markdown'));

ALTER TABLE public.playbook_entries
  ADD CONSTRAINT playbook_entries_revision_positive_check
  CHECK (revision_number > 0);

ALTER TABLE public.playbook_entries
  ADD CONSTRAINT playbook_entries_draft_version_nonnegative_check
  CHECK (draft_version >= 0);

ALTER TABLE public.playbook_entries
  ADD CONSTRAINT playbook_entries_review_interval_check
  CHECK (review_interval_days IS NULL OR review_interval_days BETWEEN 1 AND 730);

CREATE UNIQUE INDEX IF NOT EXISTS idx_playbook_entries_room_slug
  ON public.playbook_entries (room_id, slug);

CREATE UNIQUE INDEX IF NOT EXISTS idx_playbook_entries_adopted_source
  ON public.playbook_entries (source_path)
  WHERE source_kind = 'adopted_markdown' AND source_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_playbook_entries_room_sort
  ON public.playbook_entries (room_id, sub_group_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_playbook_entries_pending_drafts
  ON public.playbook_entries (room_id, draft_author_id, draft_updated_at DESC)
  WHERE draft_content IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_playbook_entries_review_due
  ON public.playbook_entries (review_due_at, id)
  WHERE status = 'published' AND owner_id IS NOT NULL AND review_due_at IS NOT NULL;

ALTER TABLE public.playbook_sub_groups
  ADD CONSTRAINT playbook_sub_groups_id_room_unique UNIQUE (id, room_id);

ALTER TABLE public.playbook_entries
  ADD CONSTRAINT playbook_entries_subgroup_same_room_fk
  FOREIGN KEY (sub_group_id, room_id)
  REFERENCES public.playbook_sub_groups (id, room_id)
  ON DELETE SET NULL (sub_group_id);

CREATE TABLE public.playbook_entry_revisions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id           UUID NOT NULL REFERENCES public.playbook_entries(id) ON DELETE CASCADE,
  revision_number    INTEGER NOT NULL CHECK (revision_number > 0),
  title              TEXT NOT NULL,
  content            JSONB NOT NULL,
  source_hash        TEXT,
  created_by         UUID REFERENCES auth.users,
  approved_by        UUID REFERENCES auth.users,
  publication_action TEXT NOT NULL CHECK (
    publication_action IN ('initial_publish', 'publish_revision', 'archive', 'supersede', 'restore')
  ),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, revision_number)
);

ALTER TABLE public.playbook_entry_revisions ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_entry_revisions FROM authenticated, anon;

CREATE TABLE public.playbook_entry_game_plan_links (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id           UUID NOT NULL REFERENCES public.playbook_entries(id) ON DELETE CASCADE,
  member_template_id UUID NOT NULL REFERENCES public.member_game_plan_templates(id) ON DELETE CASCADE,
  relationship_kind  TEXT NOT NULL DEFAULT 'reference'
                     CHECK (relationship_kind IN ('reference', 'required_reading')),
  created_by         UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, member_template_id)
);

CREATE INDEX IF NOT EXISTS idx_playbook_game_plan_links_template
  ON public.playbook_entry_game_plan_links (member_template_id, entry_id);

ALTER TABLE public.playbook_entry_game_plan_links ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_entry_game_plan_links FROM authenticated, anon;

CREATE TABLE public.playbook_review_reminders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id      UUID NOT NULL REFERENCES public.playbook_entries(id) ON DELETE CASCADE,
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_due_at TIMESTAMPTZ NOT NULL,
  notified_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, owner_id, review_due_at)
);

ALTER TABLE public.playbook_review_reminders ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_review_reminders FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.enqueue_due_playbook_review_reminders(p_limit INTEGER DEFAULT 100)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  queued_count INTEGER := 0;
BEGIN
  IF p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 500' USING ERRCODE = '22023';
  END IF;

  WITH due_entries AS (
    SELECT entry.id, entry.owner_id, entry.review_due_at, entry.title, entry.slug, room.key AS room_key
    FROM public.playbook_entries entry
    JOIN public.playbook_rooms room ON room.id = entry.room_id
    WHERE entry.status = 'published'
      AND entry.owner_id IS NOT NULL
      AND entry.review_due_at IS NOT NULL
      AND entry.review_due_at <= now()
      AND NOT EXISTS (
        SELECT 1
        FROM public.playbook_review_reminders reminder
        WHERE reminder.entry_id = entry.id
          AND reminder.owner_id = entry.owner_id
          AND reminder.review_due_at = entry.review_due_at
      )
    ORDER BY entry.review_due_at, entry.id
    LIMIT p_limit
  ), claimed AS (
    INSERT INTO public.playbook_review_reminders (entry_id, owner_id, review_due_at)
    SELECT id, owner_id, review_due_at
    FROM due_entries
    ON CONFLICT (entry_id, owner_id, review_due_at) DO NOTHING
    RETURNING id, entry_id, owner_id, review_due_at
  ), inserted_notifications AS (
    INSERT INTO public.notifications (user_id, type, title, body, link, data)
    SELECT
      claimed.owner_id,
      'playbook_review_due',
      'Playbook review due: ' || due.title,
      'Review the published guidance and either confirm it remains current or propose an update.',
      '/admin/playbook/' || due.room_key || '/' || due.slug,
      jsonb_build_object(
        'playbookEntryId', claimed.entry_id,
        'reviewDueAt', claimed.review_due_at,
        'reviewReminderId', claimed.id
      )
    FROM claimed
    JOIN due_entries due ON due.id = claimed.entry_id
    RETURNING id
  )
  SELECT count(*)::INTEGER INTO queued_count FROM inserted_notifications;

  RETURN queued_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_due_playbook_review_reminders(INTEGER)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_due_playbook_review_reminders(INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.set_playbook_entry_metadata(
  p_entry_id UUID,
  p_owner_id UUID,
  p_review_due_at TIMESTAMPTZ,
  p_review_interval_days INTEGER,
  p_template_links JSONB,
  p_actor_id UUID,
  p_mark_reviewed BOOLEAN DEFAULT false
)
RETURNS public.playbook_entries
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  updated_entry public.playbook_entries;
BEGIN
  IF jsonb_typeof(COALESCE(p_template_links, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'template links must be an array' USING ERRCODE = '22023';
  END IF;

  UPDATE public.playbook_entries
  SET owner_id = p_owner_id,
      review_interval_days = p_review_interval_days,
      review_due_at = CASE
        WHEN p_mark_reviewed AND p_review_interval_days IS NOT NULL
          THEN now() + make_interval(days => p_review_interval_days)
        ELSE p_review_due_at
      END,
      last_reviewed_at = CASE WHEN p_mark_reviewed THEN now() ELSE last_reviewed_at END,
      last_reviewed_by = CASE WHEN p_mark_reviewed THEN p_actor_id ELSE last_reviewed_by END
  WHERE id = p_entry_id
  RETURNING * INTO updated_entry;

  IF updated_entry.id IS NULL THEN
    RAISE EXCEPTION 'Playbook entry not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.playbook_entry_game_plan_links WHERE entry_id = p_entry_id;

  INSERT INTO public.playbook_entry_game_plan_links (
    entry_id, member_template_id, relationship_kind, created_by
  )
  SELECT
    p_entry_id,
    parsed.template_id,
    parsed.relationship_kind,
    p_actor_id
  FROM jsonb_to_recordset(COALESCE(p_template_links, '[]'::jsonb)) AS parsed(
    template_id UUID,
    relationship_kind TEXT
  );

  RETURN updated_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.set_playbook_entry_metadata(UUID, UUID, TIMESTAMPTZ, INTEGER, JSONB, UUID, BOOLEAN)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.set_playbook_entry_metadata(UUID, UUID, TIMESTAMPTZ, INTEGER, JSONB, UUID, BOOLEAN)
  TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_playbook_entry_publication()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' THEN
      NEW.published_at := COALESCE(NEW.published_at, now());
      NEW.revision_number := 1;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'published'
     AND (
       OLD.status IS DISTINCT FROM 'published'
       OR OLD.title IS DISTINCT FROM NEW.title
       OR OLD.content IS DISTINCT FROM NEW.content
     ) THEN
    -- A restored archived/superseded entry has already been published before, so
    -- restoring it must create the next immutable revision rather than collide
    -- with its last published revision number.
    NEW.revision_number := OLD.revision_number + CASE WHEN OLD.published_at IS NOT NULL THEN 1 ELSE 0 END;
    NEW.published_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prepare_playbook_entry_publication ON public.playbook_entries;
CREATE TRIGGER prepare_playbook_entry_publication
  BEFORE INSERT OR UPDATE ON public.playbook_entries
  FOR EACH ROW EXECUTE FUNCTION public.prepare_playbook_entry_publication();

CREATE OR REPLACE FUNCTION public.capture_playbook_entry_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  action_name TEXT;
BEGIN
  IF NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'published'
     AND OLD.title IS NOT DISTINCT FROM NEW.title
     AND OLD.content IS NOT DISTINCT FROM NEW.content THEN
    RETURN NEW;
  END IF;

  action_name := CASE
    WHEN TG_OP = 'INSERT' THEN 'initial_publish'
    WHEN OLD.status IN ('archived', 'superseded') THEN 'restore'
    WHEN OLD.status IS DISTINCT FROM 'published' THEN 'initial_publish'
    ELSE 'publish_revision'
  END;

  INSERT INTO public.playbook_entry_revisions (
    entry_id,
    revision_number,
    title,
    content,
    source_hash,
    created_by,
    approved_by,
    publication_action
  ) VALUES (
    NEW.id,
    NEW.revision_number,
    NEW.title,
    NEW.content,
    NEW.source_hash,
    COALESCE(NEW.approved_by, NEW.author_id),
    NEW.approved_by,
    action_name
  )
  ON CONFLICT (entry_id, revision_number) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_playbook_entry_revision ON public.playbook_entries;
CREATE TRIGGER capture_playbook_entry_revision
  AFTER INSERT OR UPDATE ON public.playbook_entries
  FOR EACH ROW EXECUTE FUNCTION public.capture_playbook_entry_revision();

INSERT INTO public.playbook_entry_revisions (
  entry_id,
  revision_number,
  title,
  content,
  source_hash,
  created_by,
  approved_by,
  publication_action,
  created_at
)
SELECT
  id,
  revision_number,
  title,
  content,
  source_hash,
  COALESCE(approved_by, author_id),
  approved_by,
  'initial_publish',
  COALESCE(published_at, updated_at, created_at)
FROM public.playbook_entries
WHERE status = 'published'
ON CONFLICT (entry_id, revision_number) DO NOTHING;

UPDATE public.playbook_entries
SET published_at = COALESCE(published_at, updated_at, created_at)
WHERE status = 'published' AND published_at IS NULL;

COMMENT ON TABLE public.playbook_entry_revisions IS
  'Immutable published-version history for Playbook entries. Service-role reads occur only after room authorization.';

COMMENT ON COLUMN public.playbook_entries.draft_author_id IS
  'Author of the currently pending revision. Draft bodies are returned only to this author and room approvers.';

COMMENT ON COLUMN public.playbook_entries.status IS
  'Lifecycle of the published entry. A published row stays published while draft_content holds a pending revision.';

COMMENT ON TABLE public.playbook_entry_game_plan_links IS
  'Approved connections from Playbook doctrine to reusable Member CRM Gameplan templates. Service-role access follows room authorization.';

COMMENT ON TABLE public.playbook_review_reminders IS
  'Idempotency ledger for one in-app owner reminder per Playbook entry, owner and exact review due time. Service role only.';

NOTIFY pgrst, 'reload schema';
