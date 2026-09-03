-- 166_producer_return_loop.sql
-- Receipt and return records extend an immutable producer handoff without
-- mutating it. Both are private creative workflow facts, never approvals.

CREATE TABLE public.work_recording_handoff_receipts (
  handoff_id        UUID PRIMARY KEY REFERENCES public.work_recording_handoffs(id) ON DELETE CASCADE,
  work_id           UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.work_recording_handoff_returns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handoff_id  UUID NOT NULL REFERENCES public.work_recording_handoffs(id) ON DELETE CASCADE,
  work_id     UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  version_id  UUID NOT NULL UNIQUE REFERENCES public.work_versions(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note        TEXT CHECK (note IS NULL OR char_length(note) <= 1000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_work_recording_handoff_returns_handoff
  ON public.work_recording_handoff_returns (handoff_id, created_at DESC);

ALTER TABLE public.work_recording_handoff_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_recording_handoff_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_recording_handoff_receipts_select ON public.work_recording_handoff_receipts
FOR SELECT TO authenticated USING (
  (SELECT public.is_work_owner(work_id, auth.uid()))
  OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
);

CREATE POLICY work_recording_handoff_returns_select ON public.work_recording_handoff_returns
FOR SELECT TO authenticated USING (
  (SELECT public.is_work_owner(work_id, auth.uid()))
  OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
);

REVOKE ALL ON public.work_recording_handoff_receipts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.work_recording_handoff_returns FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.work_recording_handoff_receipts TO authenticated;
GRANT SELECT ON public.work_recording_handoff_returns TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_work_recording_handoff_receipt()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.recipient_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.work_recording_handoffs handoff
    WHERE handoff.id = NEW.handoff_id
      AND handoff.work_id = NEW.work_id
      AND handoff.recipient_user_id = NEW.recipient_user_id
  ) THEN
    RAISE EXCEPTION 'handoff_receipt_must_match_its_recipient' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_work_recording_handoff_receipt() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_validate_work_recording_handoff_receipt
  BEFORE INSERT ON public.work_recording_handoff_receipts
  FOR EACH ROW EXECUTE FUNCTION public.validate_work_recording_handoff_receipt();

CREATE OR REPLACE FUNCTION public.validate_work_recording_handoff_return()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  handoff_row public.work_recording_handoffs%ROWTYPE;
BEGIN
  SELECT * INTO handoff_row
  FROM public.work_recording_handoffs
  WHERE id = NEW.handoff_id;

  IF handoff_row.id IS NULL
    OR NEW.created_by IS NULL
    OR handoff_row.work_id <> NEW.work_id
    OR handoff_row.recipient_user_id IS DISTINCT FROM NEW.created_by THEN
    RAISE EXCEPTION 'handoff_return_must_come_from_its_recipient' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.work_versions version
    WHERE version.id = NEW.version_id
      AND version.work_id = NEW.work_id
      AND version.user_id = NEW.created_by
      AND version.source = 'upload'
      AND version.archived_at IS NULL
      AND version.created_at >= handoff_row.created_at
  ) THEN
    RAISE EXCEPTION 'handoff_return_must_be_a_new_active_upload_by_the_recipient' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_work_recording_handoff_return() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_validate_work_recording_handoff_return
  BEFORE INSERT ON public.work_recording_handoff_returns
  FOR EACH ROW EXECUTE FUNCTION public.validate_work_recording_handoff_return();

ALTER TABLE public.work_diary_events
  DROP CONSTRAINT IF EXISTS work_diary_events_kind_check;
ALTER TABLE public.work_diary_events
  ADD CONSTRAINT work_diary_events_kind_check CHECK (kind IN (
    'version', 'lyric_edit', 'roster', 'sheet', 'ai_entry',
    'rename', 'reorder', 'detach', 'note', 'comment', 'producer_handoff',
    'producer_handoff_received', 'producer_mix_returned'
  ));

CREATE OR REPLACE FUNCTION public.capture_work_recording_handoff_receipt()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    NEW.work_id,
    'producer_handoff_received',
    NEW.recipient_user_id,
    jsonb_build_object('handoffId', NEW.handoff_id)
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.capture_work_recording_handoff_receipt() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_capture_work_recording_handoff_receipt
  AFTER INSERT ON public.work_recording_handoff_receipts
  FOR EACH ROW EXECUTE FUNCTION public.capture_work_recording_handoff_receipt();

CREATE OR REPLACE FUNCTION public.capture_work_recording_handoff_return()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    NEW.work_id,
    'producer_mix_returned',
    NEW.created_by,
    jsonb_strip_nulls(jsonb_build_object(
      'handoffId', NEW.handoff_id,
      'versionId', NEW.version_id,
      'note', NEW.note
    ))
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.capture_work_recording_handoff_return() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_capture_work_recording_handoff_return
  AFTER INSERT ON public.work_recording_handoff_returns
  FOR EACH ROW EXECUTE FUNCTION public.capture_work_recording_handoff_return();

COMMENT ON TABLE public.work_recording_handoff_receipts IS
  'Immutable recipient acknowledgements for private producer handoffs. Not acceptance, approval, delivery or rights consent.';
COMMENT ON TABLE public.work_recording_handoff_returns IS
  'Immutable links from producer handoffs to later room takes uploaded by the addressed recipient. Not master or release state.';

NOTIFY pgrst, 'reload schema';
