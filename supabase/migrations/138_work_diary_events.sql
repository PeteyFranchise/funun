-- ============================================================
-- Funūn — Phase 37.1 "The Songwriter" (My Catalogue)
-- Migration 138: public.work_diary_events — the auto-captured timeline of a
--                song (CAT-Q1) — the capture triggers that fill it, and
--                public.reorder_lyric_blocks(), the atomic block-reorder RPC
--                that emits exactly one diary event per drag.
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (the standing convention since migrations 058/062/063/064/066/067/070/078,
-- restated in migration 134's own header). This file is authored and
-- text-tested (__tests__/migration-138.test.ts) but must not be applied
-- automatically. The live push is the 37-01 Task 4 blocking checkpoint and
-- the owner performs it. Do NOT edit migrations 001-134 (already landed).
--
-- ─── RLS DOCTRINE FOR THIS TABLE: READ-ONLY TO EVERY CLIENT ──────────────
-- The diary gets ONE policy — SELECT, for a work's owner or any of its
-- members through migration 136's helper pair — and a REVOKE of INSERT,
-- UPDATE and DELETE from authenticated and anon. There is deliberately no
-- UPDATE policy and no DELETE policy anywhere in this phase, and none may be
-- added.
--
-- WHY: A DIARY ENTRY IS EVIDENCE. The citation on an AI entry and the
-- timestamp on a hum are only worth something if nobody — including the
-- artist, including a collaborator, including a future route written in a
-- hurry — can go back and edit or remove them afterwards. The doctrine's
-- when-in-doubt rule turns on "can you point to the human version that
-- existed before the tool touched it", and the diary is the arbiter of that
-- question; an editable arbiter is not an arbiter. Writes arrive from the
-- SECURITY DEFINER triggers in section (2), which run as the function owner
-- and are unaffected by a revoke aimed at client roles, and — for the single
-- 'note' kind — from a service-role route.
--
-- ─── THE ANTI-PATTERN THIS TABLE EXISTS TO AVOID (RESEARCH Pitfall 1) ────
-- This codebase already has something called an activity feed, and it is the
-- wrong thing to reuse here. That table is a PUBLIC wall feed (its SELECT
-- policy is literally `USING (true)`), it has a closed four-value kind enum
-- (placement / release / readiness / other) that cannot express any of the
-- nine kinds below, and its emitter in lib/social/activity-emit.ts is
-- explicitly best-effort: it swallows its own errors by design and is
-- allowed to drop events silently. Every one of those three properties is
-- the exact opposite of what the doctrine asks for here — private, typed,
-- and never dependent on discipline. The RENDER COMPONENT of that feed is
-- worth copying (plan 10's DiaryFeed reuses its icon-badge + body +
-- relative-timestamp shape); its table and its emit helper are not. Nothing
-- in app/api/works/** may import that emitter.
--
-- UUID DEFAULTS: gen_random_uuid(), never uuid_generate_v4() — uuid-ossp
-- lives in the `extensions` schema and is not on the migration session's
-- search_path (migration 078's header records the rule).
-- ============================================================

-- ─── (1) work_diary_events ───────────────────────────────────────────────
-- payload is typed per kind and read back through lib/catalogue/diary.ts
-- (plan 04). It is JSONB rather than a wide sparse table because the nine
-- kinds share almost no fields, and because a tenth kind must never require
-- a migration to a table whose whole purpose is to be an append-only record.
--
-- actor_user_id is nullable. It is NULL only where a write genuinely has no
-- resolvable human actor — see section (3)'s note on the reorder RPC. Every
-- trigger below resolves the actor from the changed row's own actor column
-- where the row carries one, so attribution survives a service-role write
-- that has no JWT subject.
CREATE TABLE public.work_diary_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id       UUID REFERENCES public.works ON DELETE CASCADE NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN (
                  'version', 'lyric_edit', 'roster', 'sheet', 'ai_entry',
                  'rename', 'reorder', 'detach', 'note'
                )),
  actor_user_id UUID REFERENCES auth.users,
  payload       JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_work_diary_events_work_id
  ON public.work_diary_events (work_id, created_at DESC);

ALTER TABLE public.work_diary_events ENABLE ROW LEVEL SECURITY;

-- The one and only policy on this table. Same owner-or-member condition the
-- content tables use in migration 136, through the same helper pair, wrapped
-- as scalar subselects for the same 42P17 reason.
CREATE POLICY "work_diary_events_select_owner_or_member" ON public.work_diary_events
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_work_owner(work_id, auth.uid()))
    OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
  );

REVOKE INSERT, UPDATE, DELETE ON public.work_diary_events FROM authenticated, anon;

COMMENT ON TABLE public.work_diary_events IS
  'Phase 37.1 CAT-Q1: the auto-captured, append-only timeline of one work. Readable by the work''s owner and members; NOT writable, updatable or deletable by any client role. Rows arrive from the SECURITY DEFINER capture triggers in migration 138 and, for kind ''note'' only, from a service-role route. An entry is evidence — an AI citation and a hum timestamp are only worth something if they cannot be edited after the fact.';

-- ─── (2) The capture triggers ────────────────────────────────────────────
-- CAT-Q1, verbatim: auto-capture "never depends on discipline". That is a
-- DATABASE-TIER guarantee, not an application convention, so capture lives
-- here — where it fires regardless of which route performed the write,
-- including routes that have not been written yet. Migration 013's
-- emit_readiness_milestone() is this codebase's own precedent for the shape.
--
-- Each function below inserts EXACTLY ONE row and is SECURITY DEFINER with
-- SET search_path = '' plus fully-qualified public. references, matching
-- every DEFINER function in this codebase since migration 034.
--
-- THE ONE DELIBERATE EXCEPTION: kind 'note' has no trigger. A note is a
-- free-standing annotation ("Ben wrote verse 2") with no underlying row to
-- fire from, so plan 06's notes route inserts it directly through the
-- service role. It is the only app-authored diary kind and it must stay the
-- only one — the moment a second kind is written from app code, the
-- never-depends-on-discipline guarantee becomes a convention again.
--
-- ON CADENCE: the lyric-edit trigger fires per SAVED UPDATE, not per
-- keystroke. The pad debounces before it PATCHes, so what lands in the diary
-- is section-level history ("Ben added Verse 2"), not a wall of "lyrics
-- changed". Nothing here throttles; the client's debounce is the cadence,
-- and the trigger simply records what was actually written.
--
-- ON ACTOR RESOLUTION: where the changed row carries its own actor column
-- (work_versions.user_id, ai_entries.created_by, work_members.added_by) that
-- column IS the actor and is used directly, because those rows are written
-- by service-role routes that set it from an already-proven session user. A
-- block INSERT is the same case: the row's author_user_id IS the person who
-- just wrote it. For the block EDIT, REMOVE, DETACH and RENAME events, whose
-- rows carry no "who touched it last" column, the actor is taken from the
-- request's own JWT subject via auth.uid() — schema-qualified, so SET
-- search_path = '' is fully respected — falling back to the row's author or
-- owner when the write came through a service-role client that has no
-- subject. Preferring the JWT there is what makes a collaborator's edit of
-- somebody else's verse attribute to the collaborator rather than to the
-- verse's author.

-- (2a) A new recording. Actor is the row's own user_id: whoever made THIS
-- take, which may be a collaborator rather than the work's owner.
CREATE OR REPLACE FUNCTION public.capture_work_version_event()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    NEW.work_id,
    'version',
    NEW.user_id,
    jsonb_build_object(
      'versionId', NEW.id,
      'source', NEW.source,
      'label', NEW.label
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_work_version ON public.work_versions;
CREATE TRIGGER trg_capture_work_version
  AFTER INSERT ON public.work_versions
  FOR EACH ROW EXECUTE FUNCTION public.capture_work_version_event();

-- (2b) A block appears. The payload names the block's IDENTITY and TYPE, and
-- never a numeral — "Verse 2" is derived at render time from position among
-- same-type siblings, so a diary entry written today still reads correctly
-- after tomorrow's reorder (RENUMBERING RULE).
CREATE OR REPLACE FUNCTION public.capture_lyric_block_added()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    NEW.work_id,
    'lyric_edit',
    COALESCE(NEW.author_user_id, auth.uid()),
    jsonb_build_object(
      'blockId', NEW.id,
      'blockType', NEW.block_type,
      'customLabel', NEW.custom_label,
      'operation', 'added'
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_lyric_block_added ON public.lyric_blocks;
CREATE TRIGGER trg_capture_lyric_block_added
  AFTER INSERT ON public.lyric_blocks
  FOR EACH ROW EXECUTE FUNCTION public.capture_lyric_block_added();

-- (2c) A block's content or heading changes. The column list plus the WHEN
-- guard together mean an UPDATE that touches only position (a reorder) or
-- only repeat_of_block_id (a detach) does NOT land here — those have their
-- own kinds, and double-logging one action is how a diary becomes noise.
CREATE OR REPLACE FUNCTION public.capture_lyric_block_edited()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    NEW.work_id,
    'lyric_edit',
    COALESCE(auth.uid(), NEW.author_user_id),
    jsonb_build_object(
      'blockId', NEW.id,
      'blockType', NEW.block_type,
      'customLabel', NEW.custom_label,
      'operation', 'edited'
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_lyric_block_edited ON public.lyric_blocks;
CREATE TRIGGER trg_capture_lyric_block_edited
  AFTER UPDATE OF text, block_type, custom_label ON public.lyric_blocks
  FOR EACH ROW
  WHEN (
    NEW.text IS DISTINCT FROM OLD.text
    OR NEW.block_type IS DISTINCT FROM OLD.block_type
    OR NEW.custom_label IS DISTINCT FROM OLD.custom_label
  )
  EXECUTE FUNCTION public.capture_lyric_block_edited();

-- (2d) A block is removed. Returns OLD, as an AFTER DELETE trigger must.
CREATE OR REPLACE FUNCTION public.capture_lyric_block_removed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    OLD.work_id,
    'lyric_edit',
    COALESCE(auth.uid(), OLD.author_user_id),
    jsonb_build_object(
      'blockId', OLD.id,
      'blockType', OLD.block_type,
      'customLabel', OLD.custom_label,
      'operation', 'removed'
    )
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_lyric_block_removed ON public.lyric_blocks;
CREATE TRIGGER trg_capture_lyric_block_removed
  AFTER DELETE ON public.lyric_blocks
  FOR EACH ROW EXECUTE FUNCTION public.capture_lyric_block_removed();

-- (2e) "Detach to vary" — a linked repeat becomes its own block (REPEAT
-- RULE). This is an AUTHORSHIP event, not a formatting one: from this moment
-- the row carries its own author instead of inheriting the source's, so it
-- gets its own diary kind rather than hiding inside a lyric_edit. The WHEN
-- guard fires only on the non-null -> null transition, which is exactly the
-- detach; re-pointing a repeat at a different source is not one.
CREATE OR REPLACE FUNCTION public.capture_lyric_block_detached()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    NEW.work_id,
    'detach',
    COALESCE(auth.uid(), NEW.author_user_id),
    jsonb_build_object(
      'blockId', NEW.id,
      'blockType', NEW.block_type,
      'detachedFromBlockId', OLD.repeat_of_block_id
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_lyric_block_detached ON public.lyric_blocks;
CREATE TRIGGER trg_capture_lyric_block_detached
  AFTER UPDATE OF repeat_of_block_id ON public.lyric_blocks
  FOR EACH ROW
  WHEN (OLD.repeat_of_block_id IS NOT NULL AND NEW.repeat_of_block_id IS NULL)
  EXECUTE FUNCTION public.capture_lyric_block_detached();

-- (2f) Somebody joins the song. Actor is added_by — who did the inviting —
-- not the person added, because the diary records actions and the invitee
-- has not acted yet.
CREATE OR REPLACE FUNCTION public.capture_work_member_event()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    NEW.work_id,
    'roster',
    NEW.added_by,
    jsonb_build_object(
      'memberId', NEW.id,
      'tier', NEW.tier,
      'collaboratorId', NEW.collaborator_id,
      'memberUserId', NEW.user_id
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_work_member ON public.work_members;
CREATE TRIGGER trg_capture_work_member
  AFTER INSERT ON public.work_members
  FOR EACH ROW EXECUTE FUNCTION public.capture_work_member_event();

-- (2g) An AI entry is filed. The CITATION STRING itself goes into the
-- payload, not just the entry's id. That is the whole point of CAT-Q3's
-- audit trail: the plain-words receipt the artist agreed to is recorded at
-- the moment they agreed to it, on a row nobody can edit afterwards.
CREATE OR REPLACE FUNCTION public.capture_ai_entry_event()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    NEW.work_id,
    'ai_entry',
    NEW.created_by,
    jsonb_build_object(
      'entryId', NEW.id,
      'level', NEW.level,
      'component', NEW.component,
      'mode', NEW.mode,
      'citation', NEW.citation,
      'humanSourceVersionId', NEW.human_source_version_id
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_ai_entry ON public.ai_entries;
CREATE TRIGGER trg_capture_ai_entry
  AFTER INSERT ON public.ai_entries
  FOR EACH ROW EXECUTE FUNCTION public.capture_ai_entry_event();

-- (2h) The song is renamed (RENAME RULE — the title is presentation, the
-- work's identity is its id, so a rename is a recorded event and never a
-- new row). Both the old and the new title go into the payload: "Untitled"
-- becoming a real name is the moment a song stops being a sketch, and the
-- diary should be able to show it.
CREATE OR REPLACE FUNCTION public.capture_work_rename_event()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    NEW.id,
    'rename',
    COALESCE(auth.uid(), NEW.user_id),
    jsonb_build_object(
      'previousTitle', OLD.title,
      'title', NEW.title
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_work_rename ON public.works;
CREATE TRIGGER trg_capture_work_rename
  AFTER UPDATE OF title ON public.works
  FOR EACH ROW
  WHEN (NEW.title IS DISTINCT FROM OLD.title)
  EXECUTE FUNCTION public.capture_work_rename_event();

-- (2i) A party is added to a split sheet that governs a work.
--
-- THIS TRIGGER IS ATTACHED TO A TABLE THE EXISTING SPLIT-SHEET BUILDER
-- WRITES ON EVERY SAVE, so it is written to be a strict no-op for everything
-- that is not a Phase 37 work. The function looks the parent sheet up and
-- RETURNS EARLY unless that sheet carries a work link — which is NULL for
-- every split sheet that exists today (migration 137 adds the column
-- nullable and backfills nothing) and for every non-work sheet created
-- later. The only sheets that reach the INSERT are ones a work created.
--
-- It reads split_sheets directly rather than through a join in the INSERT so
-- the early return is explicit and cheap: one indexed primary-key lookup,
-- then nothing.
CREATE OR REPLACE FUNCTION public.capture_split_sheet_party_event()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_work_id   UUID;
  v_initiator UUID;
BEGIN
  SELECT sheet.work_id, sheet.initiator_user_id
    INTO v_work_id, v_initiator
  FROM public.split_sheets AS sheet
  WHERE sheet.id = NEW.split_sheet_id;

  IF v_work_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    v_work_id,
    'sheet',
    COALESCE(auth.uid(), v_initiator),
    jsonb_build_object(
      'sheetId', NEW.split_sheet_id,
      'partyId', NEW.id,
      'name', NEW.name,
      'collaboratorId', NEW.collaborator_id,
      'operation', 'party_added'
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_split_sheet_party ON public.split_sheet_parties;
CREATE TRIGGER trg_capture_split_sheet_party
  AFTER INSERT ON public.split_sheet_parties
  FOR EACH ROW EXECUTE FUNCTION public.capture_split_sheet_party_event();

-- Every capture function above is trigger-internal. None is invoked from an
-- RLS policy body and none is useful called bare, so all follow migration
-- 070/079's revoke-only posture rather than migration 136 section (3)'s
-- grant-back posture.
REVOKE EXECUTE ON FUNCTION public.capture_work_version_event()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.capture_lyric_block_added()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.capture_lyric_block_edited()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.capture_lyric_block_removed()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.capture_lyric_block_detached()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.capture_work_member_event()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.capture_ai_entry_event()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.capture_work_rename_event()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.capture_split_sheet_party_event()   FROM PUBLIC, anon, authenticated;

-- ─── (3) reorder_lyric_blocks — one drag, one transaction, one event ─────
-- Modelled directly on migration 127's reorder_launchpad_checklist(), which
-- is already proven correct under concurrent load: validate the payload's
-- shape, take a SHARE ROW EXCLUSIVE table lock, prove the payload names every
-- current row exactly once, then apply all positions in ONE set-based UPDATE
-- and raise a serialization failure if the row count drifted underneath.
-- Scoped to p_work_id throughout, so a payload naming another work's blocks
-- updates nothing and then fails the count check.
--
-- WHY THE DIARY EVENT IS EMITTED FROM INSIDE THIS FUNCTION, NOT FROM A
-- PER-ROW TRIGGER ON position: a set-based update of N blocks would fire a
-- row trigger N times and bury the diary under one entry per block for a
-- single drag. ONE DRAG IS ONE EVENT. That is also why section (2c)'s edit
-- trigger carries an explicit column list — a reorder must not surface as
-- eight "lyrics changed" lines either.
--
-- WHY THIS LIVES IN 138 AND NOT IN 137, where 37-RESEARCH.md sketched it:
-- the body inserts into public.work_diary_events, and putting it in the
-- later file keeps the migration set free of a forward reference to a table
-- that does not exist yet. Migration order is not a filing convenience here;
-- it is the thing that makes one push apply cleanly.
--
-- ON ATTRIBUTION: actor_user_id resolves from the request's JWT subject.
-- Plan 07's route calls this RPC through the service role (the only role it
-- is granted to), which has no subject, so the reorder event's actor is
-- normally NULL. That is accepted rather than worked around: a reorder moves
-- no authorship and settles no money — position is presentation, and the
-- blocks' own author_user_id values, which the reorder never touches, remain
-- the record of who wrote what. Widening the signature to carry an actor
-- would be a route-supplied identity claim on an append-only evidence table,
-- which is a worse trade than a null actor on a formatting event.
CREATE OR REPLACE FUNCTION public.reorder_lyric_blocks(
  p_work_id UUID,
  p_order   JSONB
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_length   INT;
  v_expected INT;
  v_updated  INT;
BEGIN
  IF p_work_id IS NULL THEN
    RAISE EXCEPTION 'work id is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'array' THEN
    RAISE EXCEPTION 'order must be an array' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_length := jsonb_array_length(p_order);
  IF v_length > 200 THEN
    RAISE EXCEPTION 'order may contain at most 200 items' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_order) AS entry
    WHERE jsonb_typeof(entry) <> 'object'
      OR jsonb_typeof(entry -> 'id') IS DISTINCT FROM 'string'
      OR (entry ->> 'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      OR jsonb_typeof(entry -> 'position') IS DISTINCT FROM 'number'
      OR (entry ->> 'position') !~ '^(0|[1-9][0-9]{0,2})$'
      OR (entry ->> 'position')::INT < 0
      OR (entry ->> 'position')::INT > 199
  ) THEN
    RAISE EXCEPTION 'order contains an invalid block id or position'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF (
    SELECT count(DISTINCT lower(entry ->> 'id'))
    FROM jsonb_array_elements(p_order) AS entry
  ) <> v_length THEN
    RAISE EXCEPTION 'order contains duplicate block ids' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_length > 0 AND (
    SELECT count(DISTINCT (entry ->> 'position')::INT) <> v_length
      OR min((entry ->> 'position')::INT) <> 0
      OR max((entry ->> 'position')::INT) <> v_length - 1
    FROM jsonb_array_elements(p_order) AS entry
  ) THEN
    RAISE EXCEPTION 'positions must be unique and contiguous from zero'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Blocks concurrent block mutations between the completeness check and the
  -- set-based update. The RPC itself is one database transaction.
  LOCK TABLE public.lyric_blocks IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*) INTO v_expected
  FROM public.lyric_blocks AS block
  WHERE block.work_id = p_work_id;

  IF v_expected <> v_length OR EXISTS (
    SELECT 1
    FROM public.lyric_blocks AS block
    WHERE block.work_id = p_work_id
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_order) AS entry
        WHERE (entry ->> 'id')::UUID = block.id
      )
  ) THEN
    RAISE EXCEPTION 'order must contain every current block of this work exactly once'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.lyric_blocks AS block
  SET "position" = requested."position"
  FROM jsonb_to_recordset(p_order) AS requested(id UUID, "position" INT)
  WHERE block.id = requested.id
    AND block.work_id = p_work_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'blocks changed during reorder'
      USING ERRCODE = 'serialization_failure';
  END IF;

  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    p_work_id,
    'reorder',
    auth.uid(),
    jsonb_build_object('blockCount', v_updated)
  );

  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.reorder_lyric_blocks(UUID, JSONB) IS
  'Applies a whole-work lyric block reorder in one transaction and emits exactly one ''reorder'' diary event for it. Validates shape, uniqueness and contiguity, takes a SHARE ROW EXCLUSIVE lock on lyric_blocks, and requires the payload to name every current block of the work exactly once. The only writer of lyric_blocks.position in bulk. service_role only — the caller is plan 07''s route, which has already proved work membership through work_member_tier().';

-- Migration 127's exact grant posture. The only caller is plan 07's reorder
-- route, which resolves the caller's tier on this work BEFORE calling — so
-- there is no reason for an authenticated client to hold this function, and
-- a very good reason not to: called directly it would reshuffle any work.
REVOKE ALL ON FUNCTION public.reorder_lyric_blocks(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_lyric_blocks(UUID, JSONB) TO service_role;

-- ─── (4) Schema-cache reload ─────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
