-- ============================================================
-- Funūn — Phase 37.3 Song Passport, Slice 7
-- Migration 156: cohort rollout, value-free telemetry and operating SOP
-- HUMAN-GATED; additive to applied migrations 150–155.
-- ============================================================

CREATE TABLE public.song_passport_cohorts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  work_id         UUID REFERENCES public.works(id) ON DELETE CASCADE,
  stage           TEXT NOT NULL DEFAULT 'pilot' CHECK (stage IN ('internal', 'pilot', 'general')),
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  flags           JSONB NOT NULL DEFAULT '{}',
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at         TIMESTAMPTZ,
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (account_user_id IS NOT NULL OR work_id IS NOT NULL),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE UNIQUE INDEX idx_song_passport_cohort_account
  ON public.song_passport_cohorts (account_user_id, stage)
  WHERE account_user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_song_passport_cohort_work
  ON public.song_passport_cohorts (work_id, stage)
  WHERE work_id IS NOT NULL;
CREATE TRIGGER song_passport_cohorts_updated_at
  BEFORE UPDATE ON public.song_passport_cohorts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.song_passport_operation_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id   UUID NOT NULL REFERENCES public.song_passports(id) ON DELETE CASCADE,
  work_id       UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  operation     TEXT NOT NULL,
  entity_id     UUID NOT NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome       TEXT NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'failure')),
  context       JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.song_passport_operation_events IS
  'Value-free operational telemetry. Never store lyrics, names, identifiers, shares, contract terms, addresses, recipient emails or other Passport field contents here.';

CREATE INDEX idx_song_passport_operation_health
  ON public.song_passport_operation_events (operation, outcome, created_at DESC);
CREATE INDEX idx_song_passport_operation_work
  ON public.song_passport_operation_events (work_id, created_at DESC);

CREATE TABLE public.song_passport_pilot_incidents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id     UUID REFERENCES public.song_passports(id) ON DELETE SET NULL,
  work_id         UUID REFERENCES public.works(id) ON DELETE SET NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  category        TEXT NOT NULL CHECK (category IN ('authorization', 'privacy', 'source_mutation', 'silent_overwrite', 'export', 'graduation', 'availability', 'support')),
  summary         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'mitigating', 'resolved', 'accepted')),
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  owner_user_id   UUID REFERENCES auth.users(id),
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER song_passport_pilot_incidents_updated_at
  BEFORE UPDATE ON public.song_passport_pilot_incidents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Success telemetry is generated from ledger inserts, never from user field
-- contents. Failed requests remain in Sentry/server logs because a failed DB
-- transaction cannot reliably write its own failure event.
CREATE OR REPLACE FUNCTION public.capture_song_passport_operation()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row JSONB := to_jsonb(NEW);
  v_passport_id UUID := (v_row ->> 'passport_id')::UUID;
  v_work_id UUID;
  v_actor_user_id UUID;
  v_operation TEXT;
BEGIN
  SELECT passport.work_id INTO v_work_id
  FROM public.song_passports passport WHERE passport.id = v_passport_id;
  v_actor_user_id := COALESCE(
    (v_row ->> 'created_by')::UUID,
    (v_row ->> 'actor_user_id')::UUID,
    (v_row ->> 'designated_by')::UUID,
    (v_row ->> 'requested_by')::UUID
  );
  v_operation := CASE TG_TABLE_NAME
    WHEN 'song_passport_values' THEN 'fact_revision'
    WHEN 'song_passport_snapshots' THEN 'snapshot_created'
    WHEN 'song_passport_reconciliation_issues' THEN 'reconciliation_queued'
    WHEN 'song_passport_master_designations' THEN 'master_designated'
    WHEN 'song_passport_release_links' THEN 'release_graduated'
    WHEN 'song_passport_artifacts' THEN 'artifact_generated'
    WHEN 'song_passport_custody_events' THEN 'custody_event_recorded'
    WHEN 'song_passport_retention_requests' THEN 'retention_requested'
    ELSE 'passport_operation'
  END;
  INSERT INTO public.song_passport_operation_events (
    passport_id, work_id, operation, entity_id, actor_user_id, outcome, context
  ) VALUES (
    v_passport_id, v_work_id, v_operation, NEW.id, v_actor_user_id, 'success',
    jsonb_build_object('source_table', TG_TABLE_NAME)
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.capture_song_passport_operation()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER capture_song_passport_value_operation AFTER INSERT ON public.song_passport_values
  FOR EACH ROW EXECUTE FUNCTION public.capture_song_passport_operation();
CREATE TRIGGER capture_song_passport_snapshot_operation AFTER INSERT ON public.song_passport_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.capture_song_passport_operation();
CREATE TRIGGER capture_song_passport_reconciliation_operation AFTER INSERT ON public.song_passport_reconciliation_issues
  FOR EACH ROW EXECUTE FUNCTION public.capture_song_passport_operation();
CREATE TRIGGER capture_song_passport_master_operation AFTER INSERT ON public.song_passport_master_designations
  FOR EACH ROW EXECUTE FUNCTION public.capture_song_passport_operation();
CREATE TRIGGER capture_song_passport_release_operation AFTER INSERT ON public.song_passport_release_links
  FOR EACH ROW EXECUTE FUNCTION public.capture_song_passport_operation();
CREATE TRIGGER capture_song_passport_artifact_operation AFTER INSERT ON public.song_passport_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.capture_song_passport_operation();
CREATE TRIGGER capture_song_passport_custody_operation AFTER INSERT ON public.song_passport_custody_events
  FOR EACH ROW EXECUTE FUNCTION public.capture_song_passport_operation();
CREATE TRIGGER capture_song_passport_retention_operation AFTER INSERT ON public.song_passport_retention_requests
  FOR EACH ROW EXECUTE FUNCTION public.capture_song_passport_operation();

ALTER TABLE public.song_passport_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_passport_operation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_passport_pilot_incidents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.song_passport_cohorts FROM authenticated, anon;
REVOKE ALL ON public.song_passport_operation_events FROM authenticated, anon;
REVOKE ALL ON public.song_passport_pilot_incidents FROM authenticated, anon;

-- Publish a dated successor SOP in The Playbook. The doctrine remains; this
-- entry explains how the team operates the now-built, feature-gated system.
WITH company_room AS (
  SELECT id FROM public.playbook_rooms WHERE key = 'company-wide'
), standards_group AS (
  SELECT subgroup.id
  FROM public.playbook_sub_groups subgroup
  JOIN company_room room ON room.id = subgroup.room_id
  WHERE subgroup.key = 'standards-and-doctrine'
)
INSERT INTO public.playbook_entries (room_id, sub_group_id, entry_type, title, content, status)
SELECT
  room.id,
  subgroup.id,
  'sop',
  'Song Passport Pilot Operations v1.1 — Support, Rollout and Claims',
  jsonb_build_object('items', to_jsonb(ARRAY[
    'Capability status: Phase 37.3 is built behind server and cohort controls. Production use begins with named pilot works after migrations, environment gates and acceptance checks are complete.',
    'Enablement: emergency kill switch wins; global enablement exposes the feature to authorized works; pilot enablement exposes only active account/work cohort rows. Never use a browser flag for authority.',
    'Pilot cohort: at minimum one solo work, one multi-writer work and one legacy/released work. Exercise two contributors, three recordings, one conflict, one post-confirmation profile change, one graduation, one export and one custody correction.',
    'Support first response: preserve the work/passport/action identifiers and timestamp; do not request lyrics, legal names, shares, contracts or master files in an ordinary ticket. Escalate only the minimum evidence required.',
    'Stop-ship incidents: any unauthorized read/write, private-field leak, original-source mutation, silent overwrite, false recipient-acceptance state or orphaned custody evidence. Activate the kill switch and stop cohort expansion.',
    'Recovery: preserve append-only values, snapshots, receipts and custody events. Disable writes/exports before considering data repair. Corrections create successors and never rewrite evidence.',
    'Metrics: discovery inserts versus conflicts, confirmed facts, approvals, master designations, graduations, artifact success, custody events and retention requests. Telemetry stores identifiers and operation states—not field values.',
    'Current claim: Song Passport keeps versioned song, contributor, recording and release facts together; shows where facts came from; supports scoped review/approval; links an exact master to a Release Report; and creates snapshot-bound JSON, sidecar or eligible MP3 delivery copies with hashes and generation receipts.',
    'Required limitation: a generation receipt does not mean a distributor, DSP, society or recipient received or accepted the package. Non-MP3 masters use sidecars. Partner transmission and acknowledgment remain Phase 37.5.',
    'Do not claim: automatic DDEX identity embedded in audio, DDEX certification, universal zero-entry distributor delivery, certified direct partner delivery, automatic rights adjudication, legal advice or proof that a custody record establishes title.',
    'Claims review: public copy must cite production evidence and name the boundary. Planned standards validation and partner integrations stay labelled roadmap or partner exploration until UAT and real acknowledgments exist.'
  ]::TEXT[])),
  'published'
FROM company_room room CROSS JOIN standards_group subgroup
WHERE NOT EXISTS (
  SELECT 1 FROM public.playbook_entries entry
  WHERE entry.room_id = room.id
    AND entry.title = 'Song Passport Pilot Operations v1.1 — Support, Rollout and Claims'
);

NOTIFY pgrst, 'reload schema';
