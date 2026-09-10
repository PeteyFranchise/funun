-- ============================================================
-- Funūn — Playbook Operational v1 (Releases 27–31)
-- Migration 207 — HUMAN-GATED; DO NOT APPLY AUTOMATICALLY
--
-- DEPENDS ON migrations 201, 202, 204, 205, and 206. The owner must run the
-- Playbook pre-apply gate and approve the complete chain before application.
-- ============================================================

BEGIN;

-- R27: explicit cohort rollout. Features default OFF and an emergency
-- disable wins over every other setting. No opaque percentage rollout.
CREATE TABLE public.playbook_feature_controls (
  feature_key TEXT PRIMARY KEY CHECK (feature_key ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  label TEXT NOT NULL CHECK (char_length(trim(label)) BETWEEN 1 AND 180),
  enabled BOOLEAN NOT NULL DEFAULT false,
  emergency_disabled BOOLEAN NOT NULL DEFAULT true,
  disabled_reason TEXT CHECK (disabled_reason IS NULL OR char_length(disabled_reason) <= 2000),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.playbook_feature_controls (feature_key, label)
VALUES
  ('review_reminders', 'Playbook Doctrine Review Reminders'),
  ('reading_reminders', 'Playbook Required Reading Reminders'),
  ('sla_inbox', 'Playbook Inbox & SLA Center'),
  ('dependency_map', 'Doctrine Dependency Map'),
  ('simulations', 'Training Simulations & Certification'),
  ('operational_integrations', 'CRM & Workspace Integration')
ON CONFLICT (feature_key) DO NOTHING;

CREATE TABLE public.playbook_beta_cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_key TEXT NOT NULL UNIQUE CHECK (cohort_key ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  label TEXT NOT NULL CHECK (char_length(trim(label)) BETWEEN 1 AND 180),
  description TEXT NOT NULL CHECK (char_length(trim(description)) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','closed','archived')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.playbook_beta_cohort_members (
  cohort_id UUID NOT NULL REFERENCES public.playbook_beta_cohorts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by UUID NOT NULL REFERENCES auth.users(id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (cohort_id, user_id)
);

CREATE TABLE public.playbook_feature_cohort_grants (
  feature_key TEXT NOT NULL REFERENCES public.playbook_feature_controls(feature_key) ON DELETE CASCADE,
  cohort_id UUID NOT NULL REFERENCES public.playbook_beta_cohorts(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (feature_key, cohort_id)
);

CREATE TABLE public.playbook_feature_control_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  feature_key TEXT REFERENCES public.playbook_feature_controls(feature_key) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('enabled','disabled','emergency_disabled','emergency_cleared','cohort_granted','cohort_revoked','member_added','member_revoked')),
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  cohort_id UUID REFERENCES public.playbook_beta_cohorts(id) ON DELETE SET NULL,
  subject_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (event_type IN ('member_added','member_revoked') OR feature_key IS NOT NULL)
);

-- R28: SLAs describe expectations. Inbox rows are derived at read time from
-- their authoritative tables and are never copied to a shadow task table.
CREATE TABLE public.playbook_sla_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_kind TEXT NOT NULL CHECK (work_kind IN ('reading','learning','feedback','workflow','exception','incident','simulation')),
  room_id UUID REFERENCES public.playbook_rooms(id) ON DELETE CASCADE,
  severity INTEGER CHECK (severity IS NULL OR severity BETWEEN 1 AND 4),
  acknowledge_minutes INTEGER NOT NULL CHECK (acknowledge_minutes BETWEEN 1 AND 525600),
  resolve_minutes INTEGER NOT NULL CHECK (resolve_minutes BETWEEN 1 AND 5256000),
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (resolve_minutes >= acknowledge_minutes)
);

CREATE UNIQUE INDEX playbook_sla_rules_scope_unique
  ON public.playbook_sla_rules (work_kind, room_id, severity) NULLS NOT DISTINCT;

-- R29: source doctrine is always revision-pinned. Targets are polymorphic
-- by design because they include both Playbook tables and external systems.
CREATE TABLE public.playbook_doctrine_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entry_id UUID NOT NULL REFERENCES public.playbook_entries(id) ON DELETE CASCADE,
  source_revision_number INTEGER NOT NULL CHECK (source_revision_number > 0),
  dependency_kind TEXT NOT NULL CHECK (dependency_kind IN ('required','reference','automation','training','policy_overlay')),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('entry','learning_path','workflow_template','simulation','crm_surface','workspace_surface','integration')),
  target_id TEXT NOT NULL CHECK (char_length(trim(target_id)) BETWEEN 1 AND 180),
  target_label TEXT NOT NULL CHECK (char_length(trim(target_label)) BETWEEN 1 AND 300),
  target_href TEXT CHECK (target_href IS NULL OR target_href ~ '^/'),
  target_room_id UUID REFERENCES public.playbook_rooms(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_entry_id, source_revision_number, target_kind, target_id, dependency_kind)
);

-- R30: simulations teach; only a human reviewer can issue certification.
CREATE TABLE public.playbook_simulation_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.playbook_rooms(id) ON DELETE CASCADE,
  source_entry_id UUID NOT NULL REFERENCES public.playbook_entries(id) ON DELETE RESTRICT,
  source_revision_number INTEGER NOT NULL CHECK (source_revision_number > 0),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 180),
  description TEXT NOT NULL CHECK (char_length(trim(description)) BETWEEN 1 AND 4000),
  scenario JSONB NOT NULL,
  passing_score INTEGER NOT NULL DEFAULT 80 CHECK (passing_score BETWEEN 1 AND 100),
  certificate_valid_days INTEGER CHECK (certificate_valid_days IS NULL OR certificate_valid_days BETWEEN 1 AND 3650),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE TABLE public.playbook_simulation_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES public.playbook_simulation_scenarios(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('user','role')),
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  target_role TEXT CHECK (target_role IN ('leadership','ae','bd','anr','it','legal','tms','accounting','marketing')),
  due_at TIMESTAMPTZ,
  assigned_by UUID NOT NULL REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  CHECK ((target_kind='user' AND target_user_id IS NOT NULL AND target_role IS NULL) OR (target_kind='role' AND target_user_id IS NULL AND target_role IS NOT NULL))
);

CREATE TABLE public.playbook_simulation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.playbook_simulation_assignments(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL REFERENCES public.playbook_simulation_scenarios(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  responses JSONB NOT NULL,
  self_reflection TEXT CHECK (self_reflection IS NULL OR char_length(self_reflection) <= 8000),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','passed','remediation','failed')),
  score INTEGER CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  review_note TEXT CHECK (review_note IS NULL OR char_length(review_note) <= 8000),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE public.playbook_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES public.playbook_simulation_scenarios(id) ON DELETE RESTRICT,
  source_revision_number INTEGER NOT NULL CHECK (source_revision_number > 0),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL UNIQUE REFERENCES public.playbook_simulation_attempts(id) ON DELETE RESTRICT,
  issued_by UUID NOT NULL REFERENCES auth.users(id),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT CHECK (revocation_reason IS NULL OR char_length(revocation_reason) <= 4000)
);

CREATE TABLE public.playbook_simulation_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scenario_id UUID NOT NULL REFERENCES public.playbook_simulation_scenarios(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES public.playbook_simulation_assignments(id) ON DELETE SET NULL,
  attempt_id UUID REFERENCES public.playbook_simulation_attempts(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('published','assigned','submitted','passed','remediation','failed','certified','certificate_revoked')),
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 8000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Review, certification, and event recording must succeed or fail together.
CREATE OR REPLACE FUNCTION public.review_playbook_simulation_attempt(
  p_attempt_id UUID,
  p_actor_id UUID,
  p_score INTEGER,
  p_needs_remediation BOOLEAN,
  p_note TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  attempt_row RECORD;
  next_status TEXT;
  certificate_id UUID;
  certificate_expires_at TIMESTAMPTZ;
BEGIN
  SELECT a.id, a.user_id, a.scenario_id, s.passing_score,
         s.certificate_valid_days, s.source_revision_number
  INTO attempt_row
  FROM public.playbook_simulation_attempts a
  JOIN public.playbook_simulation_scenarios s ON s.id = a.scenario_id
  WHERE a.id = p_attempt_id AND a.status = 'submitted'
  FOR NO KEY UPDATE OF a;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending simulation attempt not found'; END IF;

  next_status := CASE WHEN p_needs_remediation THEN 'remediation'
                      WHEN p_score >= attempt_row.passing_score THEN 'passed'
                      ELSE 'failed' END;
  UPDATE public.playbook_simulation_attempts
  SET status = next_status, score = p_score, reviewer_id = p_actor_id,
      review_note = p_note, reviewed_at = now()
  WHERE id = p_attempt_id;

  IF next_status = 'passed' THEN
    certificate_expires_at := CASE WHEN attempt_row.certificate_valid_days IS NULL THEN NULL
      ELSE now() + make_interval(days => attempt_row.certificate_valid_days) END;
    INSERT INTO public.playbook_certifications
      (scenario_id, source_revision_number, user_id, attempt_id, issued_by, expires_at)
    VALUES
      (attempt_row.scenario_id, attempt_row.source_revision_number, attempt_row.user_id,
       p_attempt_id, p_actor_id, certificate_expires_at)
    RETURNING id INTO certificate_id;
  END IF;

  INSERT INTO public.playbook_simulation_events
    (scenario_id, attempt_id, event_type, actor_id, note)
  VALUES
    (attempt_row.scenario_id, p_attempt_id,
     CASE WHEN next_status = 'passed' THEN 'certified' ELSE next_status END,
     p_actor_id, p_note);

  RETURN jsonb_build_object('status', next_status, 'certificateId', certificate_id);
END;
$$;
REVOKE ALL ON FUNCTION public.review_playbook_simulation_attempt(UUID, UUID, INTEGER, BOOLEAN, TEXT) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.review_playbook_simulation_attempt(UUID, UUID, INTEGER, BOOLEAN, TEXT) TO service_role;

-- R31: links are references, not copies. They bind an operational workflow
-- to a real Funūn record while keeping the source record's own ACL authoritative.
CREATE TABLE public.playbook_operational_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id UUID NOT NULL REFERENCES public.playbook_workflow_runs(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.playbook_rooms(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('member_onboarding','client_partner','deal','release','workspace','buyer_brief','call_log')),
  entity_id TEXT NOT NULL CHECK (char_length(trim(entity_id)) BETWEEN 1 AND 180),
  entity_label TEXT NOT NULL CHECK (char_length(trim(entity_label)) BETWEEN 1 AND 300),
  entity_href TEXT NOT NULL CHECK (entity_href ~ '^/'),
  linked_by UUID NOT NULL REFERENCES auth.users(id),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unlinked_at TIMESTAMPTZ,
  UNIQUE (workflow_run_id, entity_type, entity_id)
);

CREATE TABLE public.playbook_operational_link_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  link_id UUID NOT NULL REFERENCES public.playbook_operational_links(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('linked','unlinked','workflow_completed')),
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.link_playbook_operational_record(
  p_workflow_run_id UUID,
  p_room_id UUID,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_entity_label TEXT,
  p_entity_href TEXT,
  p_actor_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE link_id UUID;
BEGIN
  INSERT INTO public.playbook_operational_links
    (workflow_run_id, room_id, entity_type, entity_id, entity_label, entity_href,
     linked_by, linked_at, unlinked_at)
  VALUES
    (p_workflow_run_id, p_room_id, p_entity_type, p_entity_id, p_entity_label,
     p_entity_href, p_actor_id, now(), NULL)
  ON CONFLICT (workflow_run_id, entity_type, entity_id)
  DO UPDATE SET entity_label = EXCLUDED.entity_label, entity_href = EXCLUDED.entity_href,
                linked_by = EXCLUDED.linked_by, linked_at = now(), unlinked_at = NULL
  RETURNING id INTO link_id;
  INSERT INTO public.playbook_operational_link_events (link_id, event_type, actor_id)
  VALUES (link_id, 'linked', p_actor_id);
  RETURN link_id;
END;
$$;
REVOKE ALL ON FUNCTION public.link_playbook_operational_record(UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.link_playbook_operational_record(UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;

CREATE INDEX idx_playbook_cohort_members_active ON public.playbook_beta_cohort_members (user_id, cohort_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_playbook_feature_grants_active ON public.playbook_feature_cohort_grants (feature_key, cohort_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_playbook_sla_active ON public.playbook_sla_rules (work_kind, room_id) WHERE active;
CREATE INDEX idx_playbook_dependency_source ON public.playbook_doctrine_dependencies (source_entry_id, active);
CREATE INDEX idx_playbook_dependency_target ON public.playbook_doctrine_dependencies (target_kind, target_id, active);
CREATE INDEX idx_playbook_sim_assignment_user ON public.playbook_simulation_assignments (target_user_id, due_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_playbook_sim_assignment_role ON public.playbook_simulation_assignments (target_role, due_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_playbook_sim_attempt_review ON public.playbook_simulation_attempts (status, submitted_at) WHERE status = 'submitted';
CREATE INDEX idx_playbook_certification_user ON public.playbook_certifications (user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_playbook_operational_entity ON public.playbook_operational_links (entity_type, entity_id) WHERE unlinked_at IS NULL;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'playbook_feature_controls','playbook_beta_cohorts','playbook_beta_cohort_members',
    'playbook_feature_cohort_grants','playbook_feature_control_events','playbook_sla_rules',
    'playbook_doctrine_dependencies','playbook_simulation_scenarios','playbook_simulation_assignments',
    'playbook_simulation_attempts','playbook_certifications','playbook_simulation_events',
    'playbook_operational_links','playbook_operational_link_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, authenticated, anon', table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.prevent_playbook_operational_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Playbook operational history is append-only'; END;
$$;

REVOKE ALL ON FUNCTION public.prevent_playbook_operational_event_mutation()
  FROM PUBLIC, authenticated, anon;

CREATE TRIGGER protect_playbook_feature_events BEFORE UPDATE OR DELETE ON public.playbook_feature_control_events FOR EACH ROW EXECUTE FUNCTION public.prevent_playbook_operational_event_mutation();
CREATE TRIGGER protect_playbook_simulation_events BEFORE UPDATE OR DELETE ON public.playbook_simulation_events FOR EACH ROW EXECUTE FUNCTION public.prevent_playbook_operational_event_mutation();
CREATE TRIGGER protect_playbook_operational_link_events BEFORE UPDATE OR DELETE ON public.playbook_operational_link_events FOR EACH ROW EXECUTE FUNCTION public.prevent_playbook_operational_event_mutation();

NOTIFY pgrst, 'reload schema';

COMMIT;
