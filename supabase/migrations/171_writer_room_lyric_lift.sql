-- Migration 171: Writer's Room Lyric Lift
--
-- A room member can ask Funūn to transcribe an uploaded recording, review a
-- timestamped section draft, and explicitly apply that draft to Lyric Blocks.
-- Nothing in this migration interprets transcription as authorship: imported
-- blocks are human-source lyrics with author_user_id NULL until the room names
-- the actual writer. The source recording + draft-to-block links preserve how
-- the words entered the pad without putting an upload owner on the split sheet.
--
-- HUMAN-GATED PUSH. Codex authors and tests this migration; the owner applies it.

CREATE TABLE public.work_lyric_lifts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id               UUID NOT NULL REFERENCES public.works ON DELETE CASCADE,
  version_id            UUID NOT NULL REFERENCES public.work_versions ON DELETE CASCADE,
  requested_by          UUID NOT NULL REFERENCES auth.users,
  status                TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued', 'processing', 'review', 'failed', 'applied', 'discarded')),
  job_id                UUID REFERENCES public.jobs ON DELETE SET NULL,
  language              TEXT,
  raw_transcript        TEXT,
  timed_segments        JSONB NOT NULL DEFAULT '[]'::jsonb,
  transcription_model   TEXT,
  alignment_model       TEXT,
  structure_model       TEXT,
  error_message         TEXT,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  applied_at            TIMESTAMPTZ,
  applied_by            UUID REFERENCES auth.users,
  discarded_at          TIMESTAMPTZ,
  discarded_by          UUID REFERENCES auth.users,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(timed_segments) = 'array')
);

CREATE INDEX idx_work_lyric_lifts_work_created
  ON public.work_lyric_lifts (work_id, created_at DESC);

CREATE UNIQUE INDEX work_lyric_lifts_one_open_per_work
  ON public.work_lyric_lifts (work_id)
  WHERE status IN ('queued', 'processing', 'review');

CREATE TRIGGER work_lyric_lifts_updated_at
  BEFORE UPDATE ON public.work_lyric_lifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.work_lyric_lift_sections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lift_id               UUID NOT NULL REFERENCES public.work_lyric_lifts ON DELETE CASCADE,
  position              INTEGER NOT NULL CHECK (position >= 0 AND position < 200),
  block_type            TEXT NOT NULL
                        CHECK (block_type IN ('verse', 'pre_chorus', 'chorus', 'bridge',
                                              'intro', 'outro', 'hook', 'custom')),
  custom_label          TEXT,
  text                  TEXT NOT NULL DEFAULT '' CHECK (char_length(text) <= 20000),
  start_ms              INTEGER NOT NULL DEFAULT 0 CHECK (start_ms >= 0),
  end_ms                INTEGER NOT NULL DEFAULT 0 CHECK (end_ms >= start_ms),
  confidence            NUMERIC(4, 3) CHECK (confidence >= 0 AND confidence <= 1),
  needs_review          BOOLEAN NOT NULL DEFAULT false,
  included              BOOLEAN NOT NULL DEFAULT true,
  repeat_of_section_id  UUID,
  updated_by            UUID REFERENCES auth.users,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_lyric_lift_sections_position_unique
    UNIQUE (lift_id, position) DEFERRABLE INITIALLY IMMEDIATE,
  UNIQUE (id, lift_id),
  CHECK (repeat_of_section_id IS NULL OR repeat_of_section_id <> id),
  CHECK (
    (block_type = 'custom' AND custom_label IS NOT NULL AND char_length(trim(custom_label)) > 0)
    OR (block_type <> 'custom' AND custom_label IS NULL)
  )
);

ALTER TABLE public.work_lyric_lift_sections
  ADD CONSTRAINT work_lyric_lift_sections_repeat_same_lift
  FOREIGN KEY (repeat_of_section_id, lift_id)
  REFERENCES public.work_lyric_lift_sections (id, lift_id)
  ON DELETE SET NULL (repeat_of_section_id);

CREATE INDEX idx_work_lyric_lift_sections_lift_position
  ON public.work_lyric_lift_sections (lift_id, position);

CREATE TRIGGER work_lyric_lift_sections_updated_at
  BEFORE UPDATE ON public.work_lyric_lift_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Immutable provenance: which reviewed draft section produced which canonical
-- Lyric Block. This is evidence of import, never a writer credit.
CREATE TABLE public.work_lyric_lift_block_links (
  lift_id       UUID NOT NULL REFERENCES public.work_lyric_lifts ON DELETE CASCADE,
  section_id    UUID NOT NULL REFERENCES public.work_lyric_lift_sections ON DELETE RESTRICT,
  block_id      UUID NOT NULL REFERENCES public.lyric_blocks ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (section_id, block_id),
  UNIQUE (block_id)
);

ALTER TABLE public.work_lyric_lifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_lyric_lift_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_lyric_lift_block_links ENABLE ROW LEVEL SECURITY;

-- Drafts contain private lyrics. Every read/write goes through a route that
-- first proves Writer's Room membership; browsers never address these tables.
REVOKE ALL ON public.work_lyric_lifts FROM authenticated, anon;
REVOKE ALL ON public.work_lyric_lift_sections FROM authenticated, anon;
REVOKE ALL ON public.work_lyric_lift_block_links FROM authenticated, anon;

-- Applies the reviewed draft atomically. `empty_only` is the default for an
-- empty pad. `append` is the only option when lyrics already exist: there is
-- deliberately no replace mode, so Lyric Lift cannot erase human work.
CREATE OR REPLACE FUNCTION public.apply_work_lyric_lift(
  p_lift_id UUID,
  p_actor_id UUID,
  p_mode TEXT DEFAULT 'empty_only'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lift public.work_lyric_lifts%ROWTYPE;
  v_section public.work_lyric_lift_sections%ROWTYPE;
  v_existing_count INTEGER;
  v_position INTEGER;
  v_created_block_id UUID;
  v_repeat_block_id UUID;
  v_imported_count INTEGER := 0;
BEGIN
  IF p_mode NOT IN ('empty_only', 'append') THEN
    RAISE EXCEPTION 'mode must be empty_only or append'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_lift
  FROM public.work_lyric_lifts
  WHERE id = p_lift_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lyric Lift not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_work_owner(v_lift.work_id, p_actor_id)
     AND public.work_member_tier(v_lift.work_id, p_actor_id) IS NULL THEN
    RAISE EXCEPTION 'Writer''s Room access is required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Lost-response retries return the original result instead of duplicating it.
  IF v_lift.status = 'applied' THEN
    SELECT count(*)::INTEGER INTO v_imported_count
    FROM public.work_lyric_lift_block_links
    WHERE lift_id = p_lift_id;
    RETURN v_imported_count;
  END IF;

  IF v_lift.status <> 'review' THEN
    RAISE EXCEPTION 'Lyric Lift is not ready to apply' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  SELECT count(*)::INTEGER INTO v_existing_count
  FROM public.lyric_blocks
  WHERE work_id = v_lift.work_id;

  IF p_mode = 'empty_only' AND v_existing_count > 0 THEN
    RAISE EXCEPTION 'Lyrics were added while this draft was open; choose append to keep them'
      USING ERRCODE = 'serialization_failure';
  END IF;

  SELECT COALESCE(max(position), -1) + 1 INTO v_position
  FROM public.lyric_blocks
  WHERE work_id = v_lift.work_id;

  -- The existing diary trigger reads auth.uid() for a service-role insert.
  -- Supply only the action actor in the transaction-local request claim; the
  -- block's author_user_id remains NULL because action and authorship differ.
  PERFORM set_config('request.jwt.claim.sub', p_actor_id::TEXT, true);

  FOR v_section IN
    SELECT *
    FROM public.work_lyric_lift_sections
    WHERE lift_id = p_lift_id AND included = true
    ORDER BY position
  LOOP
    v_repeat_block_id := NULL;
    IF v_section.repeat_of_section_id IS NOT NULL THEN
      SELECT block_id INTO v_repeat_block_id
      FROM public.work_lyric_lift_block_links
      WHERE lift_id = p_lift_id
        AND section_id = v_section.repeat_of_section_id;
    END IF;

    INSERT INTO public.lyric_blocks (
      work_id,
      block_type,
      custom_label,
      position,
      text,
      author_kind,
      author_user_id,
      performers,
      repeat_of_block_id
    ) VALUES (
      v_lift.work_id,
      v_section.block_type,
      v_section.custom_label,
      v_position,
      CASE WHEN v_repeat_block_id IS NULL THEN v_section.text ELSE '' END,
      'human',
      NULL,
      '[]'::jsonb,
      v_repeat_block_id
    )
    RETURNING id INTO v_created_block_id;

    INSERT INTO public.work_lyric_lift_block_links (lift_id, section_id, block_id)
    VALUES (p_lift_id, v_section.id, v_created_block_id);

    v_position := v_position + 1;
    v_imported_count := v_imported_count + 1;
  END LOOP;

  IF v_imported_count = 0 THEN
    RAISE EXCEPTION 'Choose at least one lyric section to add'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.work_lyric_lifts
  SET status = 'applied',
      applied_at = now(),
      applied_by = p_actor_id,
      error_message = NULL
  WHERE id = p_lift_id;

  RETURN v_imported_count;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_work_lyric_lift(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_work_lyric_lift(UUID, UUID, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.apply_work_lyric_lift(UUID, UUID, TEXT) IS
  'Atomically appends approved Lyric Lift sections to Lyric Blocks. Never replaces existing lyrics and never treats the uploader or approver as the writer. Service role only after route-level room authorization.';

CREATE OR REPLACE FUNCTION public.reorder_work_lyric_lift_sections(
  p_lift_id UUID,
  p_actor_id UUID,
  p_order JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_work_id UUID;
  v_status TEXT;
  v_count INTEGER;
BEGIN
  IF jsonb_typeof(p_order) <> 'array' OR jsonb_array_length(p_order) = 0
     OR jsonb_array_length(p_order) > 200 THEN
    RAISE EXCEPTION 'order must be a non-empty array with at most 200 entries'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT work_id, status INTO v_work_id, v_status
  FROM public.work_lyric_lifts
  WHERE id = p_lift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lyric Lift not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status <> 'review' THEN
    RAISE EXCEPTION 'Only a review-ready Lyric Lift can be reordered'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF NOT public.is_work_owner(v_work_id, p_actor_id)
     AND public.work_member_tier(v_work_id, p_actor_id) IS NULL THEN
    RAISE EXCEPTION 'Writer''s Room access is required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*)::INTEGER INTO v_count
  FROM public.work_lyric_lift_sections
  WHERE lift_id = p_lift_id;

  IF jsonb_array_length(p_order) <> v_count
     OR (SELECT count(DISTINCT item.id) FROM jsonb_to_recordset(p_order) AS item(id UUID, position INTEGER)) <> v_count
     OR (SELECT count(DISTINCT item.position) FROM jsonb_to_recordset(p_order) AS item(id UUID, position INTEGER)) <> v_count
     OR (SELECT min(item.position) FROM jsonb_to_recordset(p_order) AS item(id UUID, position INTEGER)) <> 0
     OR (SELECT max(item.position) FROM jsonb_to_recordset(p_order) AS item(id UUID, position INTEGER)) <> v_count - 1
     OR (SELECT count(*)
         FROM jsonb_to_recordset(p_order) AS item(id UUID, position INTEGER)
         JOIN public.work_lyric_lift_sections section ON section.id = item.id
         WHERE section.lift_id = p_lift_id) <> v_count THEN
    RAISE EXCEPTION 'order must name every draft section exactly once with contiguous positions'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SET CONSTRAINTS work_lyric_lift_sections_position_unique DEFERRED;
  UPDATE public.work_lyric_lift_sections AS section
  SET position = item.position,
      updated_by = p_actor_id
  FROM jsonb_to_recordset(p_order) AS item(id UUID, position INTEGER)
  WHERE section.id = item.id AND section.lift_id = p_lift_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_work_lyric_lift_sections(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_work_lyric_lift_sections(UUID, UUID, JSONB)
  TO service_role;

NOTIFY pgrst, 'reload schema';
