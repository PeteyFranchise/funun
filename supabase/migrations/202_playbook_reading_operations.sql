-- ============================================================
-- Funūn — Playbook Reading Operations
-- Migration 202 — HUMAN-GATED; DO NOT APPLY AUTOMATICALLY
--
-- DEPENDS ON migration 201. Promoted and text-tested only.
-- The repository owner must explicitly apply this
-- migration after 201; agents must not apply it automatically.
-- ============================================================

BEGIN;

CREATE TABLE public.playbook_reading_assignments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id          UUID NOT NULL REFERENCES public.playbook_entries(id) ON DELETE CASCADE,
  target_kind       TEXT NOT NULL CHECK (target_kind IN ('user', 'role')),
  target_user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  target_role       TEXT CHECK (target_role IN (
    'leadership', 'ae', 'bd', 'anr', 'it', 'legal', 'tms', 'accounting', 'marketing'
  )),
  required_revision INTEGER NOT NULL CHECK (required_revision > 0),
  required          BOOLEAN NOT NULL DEFAULT true,
  due_at             TIMESTAMPTZ,
  assigned_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (target_kind = 'user' AND target_user_id IS NOT NULL AND target_role IS NULL)
    OR (target_kind = 'role' AND target_user_id IS NULL AND target_role IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_playbook_reading_assignment_active_user
  ON public.playbook_reading_assignments (entry_id, target_user_id)
  WHERE target_kind = 'user' AND revoked_at IS NULL;

CREATE UNIQUE INDEX idx_playbook_reading_assignment_active_role
  ON public.playbook_reading_assignments (entry_id, target_role)
  WHERE target_kind = 'role' AND revoked_at IS NULL;

CREATE INDEX idx_playbook_reading_assignments_entry
  ON public.playbook_reading_assignments (entry_id, due_at)
  WHERE revoked_at IS NULL;

CREATE TRIGGER playbook_reading_assignments_updated_at
  BEFORE UPDATE ON public.playbook_reading_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.playbook_reading_assignments ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_reading_assignments FROM authenticated, anon;

CREATE TABLE public.playbook_reading_acknowledgements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id      UUID NOT NULL REFERENCES public.playbook_reading_assignments(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  revision_number     INTEGER NOT NULL CHECK (revision_number > 0),
  acknowledged_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, user_id, revision_number)
);

CREATE INDEX idx_playbook_reading_ack_user
  ON public.playbook_reading_acknowledgements (user_id, acknowledged_at DESC);

ALTER TABLE public.playbook_reading_acknowledgements ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_reading_acknowledgements FROM authenticated, anon;

COMMENT ON TABLE public.playbook_reading_assignments IS
  'Internal Team Member reading assignments by person or staff role. Gameplan required reading remains authoritative in playbook_entry_game_plan_links.';

COMMENT ON TABLE public.playbook_reading_acknowledgements IS
  'Revision-specific record that a Team Member says they read Playbook guidance. It is not a signature, agreement, approval, or legal consent.';

CREATE TABLE public.playbook_reading_reminders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id      UUID NOT NULL REFERENCES public.playbook_reading_assignments(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  revision_number     INTEGER NOT NULL CHECK (revision_number > 0),
  reminder_kind       TEXT NOT NULL CHECK (reminder_kind IN ('due_soon', 'overdue')),
  notified_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, user_id, revision_number, reminder_kind)
);

ALTER TABLE public.playbook_reading_reminders ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_reading_reminders FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.enqueue_playbook_reading_reminders(p_limit INTEGER DEFAULT 200)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  queued_count INTEGER := 0;
BEGIN
  IF p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 500' USING ERRCODE = '22023';
  END IF;

  -- Migration 207 owns activation. Until its complete schema exists, reminders
  -- fail closed without creating cron noise or touching either write table.
  IF pg_catalog.to_regclass('public.playbook_feature_controls') IS NULL
     OR pg_catalog.to_regclass('public.playbook_feature_cohort_grants') IS NULL
     OR pg_catalog.to_regclass('public.playbook_beta_cohorts') IS NULL
     OR pg_catalog.to_regclass('public.playbook_beta_cohort_members') IS NULL THEN
    RETURN 0;
  END IF;

  WITH candidates AS (
    SELECT
      assignment.id AS assignment_id,
      staff.user_id,
      assignment.required_revision,
      CASE WHEN assignment.due_at <= now() THEN 'overdue' ELSE 'due_soon' END AS reminder_kind,
      entry.title,
      room.key AS room_key,
      entry.slug,
      assignment.due_at
    FROM public.playbook_reading_assignments assignment
    JOIN public.playbook_entries entry ON entry.id = assignment.entry_id
    JOIN public.playbook_rooms room ON room.id = entry.room_id
    JOIN public.funun_staff staff ON (
      (assignment.target_kind = 'user' AND assignment.target_user_id = staff.user_id)
      OR (
        assignment.target_kind = 'role'
        AND (
          assignment.target_role = ANY(staff.staff_roles)
          OR (COALESCE(array_length(staff.staff_roles, 1), 0) = 0 AND assignment.target_role = staff.staff_role)
        )
      )
    )
    WHERE assignment.revoked_at IS NULL
      AND assignment.required
      AND assignment.due_at IS NOT NULL
      AND assignment.due_at <= now() + interval '48 hours'
      AND entry.status = 'published'
      AND EXISTS (
        SELECT 1
        FROM public.playbook_feature_controls control
        JOIN public.playbook_feature_cohort_grants feature_grant
          ON feature_grant.feature_key = control.feature_key
         AND feature_grant.revoked_at IS NULL
        JOIN public.playbook_beta_cohorts cohort
          ON cohort.id = feature_grant.cohort_id
         AND cohort.status = 'active'
        JOIN public.playbook_beta_cohort_members cohort_member
          ON cohort_member.cohort_id = cohort.id
         AND cohort_member.user_id = staff.user_id
         AND cohort_member.revoked_at IS NULL
         AND (cohort_member.expires_at IS NULL OR cohort_member.expires_at > now())
        WHERE control.feature_key = 'reading_reminders'
          AND control.enabled
          AND NOT control.emergency_disabled
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.playbook_reading_acknowledgements acknowledgement
        WHERE acknowledgement.assignment_id = assignment.id
          AND acknowledgement.user_id = staff.user_id
          AND acknowledgement.revision_number >= assignment.required_revision
      )
    ORDER BY assignment.due_at, assignment.id, staff.user_id
    LIMIT p_limit
  ), claimed AS (
    INSERT INTO public.playbook_reading_reminders (
      assignment_id, user_id, revision_number, reminder_kind
    )
    SELECT assignment_id, user_id, required_revision, reminder_kind
    FROM candidates
    ON CONFLICT (assignment_id, user_id, revision_number, reminder_kind) DO NOTHING
    RETURNING id, assignment_id, user_id, revision_number, reminder_kind
  ), inserted_notifications AS (
    INSERT INTO public.notifications (user_id, type, title, body, link, data)
    SELECT
      claimed.user_id,
      'playbook_reading_due',
      CASE
        WHEN claimed.reminder_kind = 'overdue' THEN 'Playbook reading overdue: ' || candidate.title
        ELSE 'Playbook reading due soon: ' || candidate.title
      END,
      'Read and acknowledge revision ' || claimed.revision_number || ' in your Playbook learning queue.',
      '/admin/playbook/' || candidate.room_key || '/' || candidate.slug,
      jsonb_build_object(
        'assignmentId', claimed.assignment_id,
        'revisionNumber', claimed.revision_number,
        'reminderKind', claimed.reminder_kind,
        'dueAt', candidate.due_at
      )
    FROM claimed
    JOIN candidates candidate
      ON candidate.assignment_id = claimed.assignment_id
     AND candidate.user_id = claimed.user_id
     AND candidate.required_revision = claimed.revision_number
     AND candidate.reminder_kind = claimed.reminder_kind
    RETURNING id
  )
  SELECT count(*)::INTEGER INTO queued_count FROM inserted_notifications;

  RETURN queued_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_playbook_reading_reminders(INTEGER)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_playbook_reading_reminders(INTEGER)
  TO service_role;

COMMENT ON TABLE public.playbook_reading_reminders IS
  'Idempotency ledger: at most one due-soon and one overdue notice per assignment, Team Member and required revision.';


NOTIFY pgrst, 'reload schema';

COMMIT;
