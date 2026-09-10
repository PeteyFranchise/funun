-- ============================================================
-- Funūn — Playbook Enablement Platform (Releases 17–26)
-- CANDIDATE migration 206
--
-- DEPENDS ON candidates 201, 202, 204, and 205. Migration 200 is taken
-- and migration 203 is permanently retired. HUMAN-GATED:
-- do not move into supabase/migrations or apply until the owner
-- reconciles the production migration ledger and approves it.
-- ============================================================

BEGIN;

-- R17: private training media. Browser upload uses a server-created signed
-- upload URL; playback always passes through a room-authorized server route.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('playbook-media', 'playbook-media', false, 524288000, ARRAY['video/mp4', 'video/webm'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE public.playbook_media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.playbook_rooms(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 180),
  caption TEXT CHECK (caption IS NULL OR char_length(caption) <= 1000),
  transcript TEXT CHECK (transcript IS NULL OR char_length(transcript) <= 50000),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('video/mp4', 'video/webm')),
  size_bytes BIGINT NOT NULL CHECK (size_bytes BETWEEN 1 AND 524288000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed', 'archived')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at TIMESTAMPTZ
);

-- R19: learning paths pin every doctrine step to a revision.
CREATE TABLE public.playbook_learning_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.playbook_rooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 180),
  description TEXT NOT NULL CHECK (char_length(trim(description)) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE TABLE public.playbook_learning_path_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id UUID NOT NULL REFERENCES public.playbook_learning_paths(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  entry_id UUID NOT NULL REFERENCES public.playbook_entries(id) ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  label TEXT NOT NULL CHECK (char_length(trim(label)) BETWEEN 1 AND 180),
  knowledge_prompt TEXT CHECK (knowledge_prompt IS NULL OR char_length(knowledge_prompt) <= 1000),
  UNIQUE (path_id, sort_order)
);

CREATE TABLE public.playbook_learning_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id UUID NOT NULL REFERENCES public.playbook_learning_paths(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('user', 'role')),
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  target_role TEXT CHECK (target_role IN ('leadership','ae','bd','anr','it','legal','tms','accounting','marketing')),
  due_at TIMESTAMPTZ,
  assigned_by UUID NOT NULL REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  CHECK ((target_kind='user' AND target_user_id IS NOT NULL AND target_role IS NULL) OR (target_kind='role' AND target_user_id IS NULL AND target_role IS NOT NULL))
);

CREATE TABLE public.playbook_learning_step_completions (
  step_id UUID NOT NULL REFERENCES public.playbook_learning_path_steps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (step_id, user_id)
);

CREATE TABLE public.playbook_knowledge_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID NOT NULL REFERENCES public.playbook_learning_path_steps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (char_length(trim(response)) BETWEEN 1 AND 4000),
  self_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- R20: feedback is a reader-to-owner improvement channel, not a shadow edit.
CREATE TABLE public.playbook_reader_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES public.playbook_entries(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.playbook_rooms(id) ON DELETE CASCADE,
  revision_number INTEGER CHECK (revision_number IS NULL OR revision_number > 0),
  feedback_kind TEXT NOT NULL CHECK (feedback_kind IN ('question','outdated','suggestion','missing_doctrine')),
  body TEXT NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 4000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','resolved','declined')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE public.playbook_reader_feedback_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  feedback_id UUID NOT NULL REFERENCES public.playbook_reader_feedback(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created','triaged','assigned','replied','resolved','declined','reopened')),
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- R22: minimal cost and source ledger for grounded internal answers.
CREATE TABLE public.playbook_assistant_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL CHECK (char_length(trim(question)) BETWEEN 2 AND 1000),
  answer TEXT NOT NULL CHECK (char_length(answer) <= 12000),
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_entry_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  model TEXT,
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  status TEXT NOT NULL CHECK (status IN ('answered','no_answer','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- R23: approved doctrine becomes revision-pinned runnable work.
CREATE TABLE public.playbook_workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.playbook_rooms(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES public.playbook_entries(id) ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 180),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.playbook_workflow_template_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.playbook_workflow_templates(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  label TEXT NOT NULL CHECK (char_length(trim(label)) BETWEEN 1 AND 500),
  required BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (template_id, sort_order)
);

CREATE TABLE public.playbook_workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.playbook_workflow_templates(id) ON DELETE RESTRICT,
  context_type TEXT NOT NULL CHECK (char_length(trim(context_type)) BETWEEN 1 AND 80),
  context_id TEXT NOT NULL CHECK (char_length(trim(context_id)) BETWEEN 1 AND 180),
  context_label TEXT NOT NULL CHECK (char_length(trim(context_label)) BETWEEN 1 AND 300),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  started_by UUID NOT NULL REFERENCES auth.users(id),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.playbook_workflow_run_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.playbook_workflow_runs(id) ON DELETE CASCADE,
  template_step_id UUID NOT NULL REFERENCES public.playbook_workflow_template_steps(id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  required BOOLEAN NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','skipped','blocked')),
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  UNIQUE (run_id, template_step_id)
);

-- R24: exceptions are explicit, expiring decisions with append-only events.
CREATE TABLE public.playbook_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.playbook_entries(id) ON DELETE RESTRICT,
  room_id UUID NOT NULL REFERENCES public.playbook_rooms(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 180),
  rationale TEXT NOT NULL CHECK (char_length(trim(rationale)) BETWEEN 1 AND 4000),
  scope TEXT NOT NULL CHECK (char_length(trim(scope)) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','declined','expired','revoked')),
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  decision_note TEXT CHECK (decision_note IS NULL OR char_length(decision_note) <= 4000)
);

CREATE TABLE public.playbook_exception_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exception_id UUID NOT NULL REFERENCES public.playbook_exceptions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('requested','approved','declined','expired','revoked','commented')),
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- R25: incident mode activates doctrine without rewriting it.
CREATE TABLE public.playbook_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.playbook_rooms(id) ON DELETE RESTRICT,
  runbook_entry_id UUID REFERENCES public.playbook_entries(id) ON DELETE SET NULL,
  runbook_revision_number INTEGER CHECK (runbook_revision_number IS NULL OR runbook_revision_number > 0),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 240),
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 4),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','monitoring','resolved','closed')),
  summary TEXT NOT NULL CHECK (char_length(trim(summary)) BETWEEN 1 AND 4000),
  commander_id UUID NOT NULL REFERENCES auth.users(id),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  postmortem_due_at TIMESTAMPTZ
);

CREATE TABLE public.playbook_incident_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.playbook_incidents(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(trim(label)) BETWEEN 1 AND 1000),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','cancelled')),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.playbook_incident_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id UUID NOT NULL REFERENCES public.playbook_incidents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('opened','status_changed','task_added','task_changed','note','escalated','resolved','postmortem_added')),
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 8000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- R26: controlled translations and staff-local display preferences.
CREATE TABLE public.playbook_entry_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.playbook_entries(id) ON DELETE CASCADE,
  source_revision_number INTEGER NOT NULL CHECK (source_revision_number > 0),
  locale TEXT NOT NULL CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','published','retired')),
  translated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  UNIQUE (entry_id, source_revision_number, locale)
);

CREATE TABLE public.playbook_glossary_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term TEXT NOT NULL,
  definition TEXT NOT NULL CHECK (char_length(trim(definition)) BETWEEN 1 AND 4000),
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  room_id UUID REFERENCES public.playbook_rooms(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (term, locale, room_id)
);

CREATE TABLE public.playbook_user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  timezone TEXT NOT NULL DEFAULT 'UTC' CHECK (char_length(timezone) BETWEEN 1 AND 80),
  reduced_motion BOOLEAN NOT NULL DEFAULT false,
  high_contrast BOOLEAN NOT NULL DEFAULT false,
  captions_preferred BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_playbook_learning_assignments_user ON public.playbook_learning_assignments (target_user_id, due_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_playbook_learning_assignments_role ON public.playbook_learning_assignments (target_role, due_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_playbook_feedback_queue ON public.playbook_reader_feedback (room_id, status, created_at DESC);
CREATE INDEX idx_playbook_workflow_runs_owner ON public.playbook_workflow_runs (owner_id, status, started_at DESC);
CREATE INDEX idx_playbook_exceptions_queue ON public.playbook_exceptions (room_id, status, expires_at);
CREATE INDEX idx_playbook_incidents_active ON public.playbook_incidents (severity, started_at DESC) WHERE status IN ('active','monitoring');
CREATE INDEX idx_playbook_assistant_usage ON public.playbook_assistant_runs (user_id, created_at DESC);

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'playbook_media_assets','playbook_learning_paths','playbook_learning_path_steps',
    'playbook_learning_assignments','playbook_learning_step_completions','playbook_knowledge_attempts',
    'playbook_reader_feedback','playbook_reader_feedback_events','playbook_assistant_runs',
    'playbook_workflow_templates','playbook_workflow_template_steps','playbook_workflow_runs',
    'playbook_workflow_run_tasks','playbook_exceptions','playbook_exception_events',
    'playbook_incidents','playbook_incident_tasks','playbook_incident_events',
    'playbook_entry_translations','playbook_glossary_terms','playbook_user_preferences'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE SELECT, INSERT, UPDATE, DELETE ON public.%I FROM authenticated, anon', table_name);
  END LOOP;
END $$;

-- Append-only history tables remain immutable even to accidental service code.
CREATE OR REPLACE FUNCTION public.prevent_playbook_enablement_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Playbook enablement history is append-only'; END;
$$;

CREATE TRIGGER protect_playbook_feedback_events BEFORE UPDATE OR DELETE ON public.playbook_reader_feedback_events FOR EACH ROW EXECUTE FUNCTION public.prevent_playbook_enablement_event_mutation();
CREATE TRIGGER protect_playbook_exception_events BEFORE UPDATE OR DELETE ON public.playbook_exception_events FOR EACH ROW EXECUTE FUNCTION public.prevent_playbook_enablement_event_mutation();
CREATE TRIGGER protect_playbook_incident_events BEFORE UPDATE OR DELETE ON public.playbook_incident_events FOR EACH ROW EXECUTE FUNCTION public.prevent_playbook_enablement_event_mutation();

REVOKE ALL ON FUNCTION public.prevent_playbook_enablement_event_mutation() FROM PUBLIC, authenticated, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
