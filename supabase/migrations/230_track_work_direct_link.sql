-- ============================================================
-- Funūn — work→track eligibility resolution, Slice 1 (261004-wtl)
-- Migration 230: tracks.work_id — the direct, queryable link from a
--                 released track back to the Catalogue work that produced
--                 it, a one-time backfill from the existing Song Passport
--                 chain, and graduate_song_passport_to_release() writing
--                 it atomically going forward.
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (the standing convention since migrations 058/062/063/064/066/067/070/078,
-- restated as recently as 135's and 229's own headers). This file is
-- authored and text-tested
-- (__tests__/migration-230-track-work-direct-link.test.ts) but must not be
-- applied automatically. The live push, the drift-detection query, and the
-- backfill-coverage count are the owner's Task 4 checkpoint in
-- 261004-wtl-PLAN.md. Do NOT edit migrations 001-229 (already landed).
--
-- ─── WHY THIS MIGRATION EXISTS ───────────────────────────────────────────
-- Funūn stores a song twice. The writing side (public.works, migration 135)
-- carries the AI-disclosure facts (ai_entries) a Crate advance must check.
-- The release side (public.tracks, migration 001) is what a sync submission
-- actually licenses. The only existing bridge, works.graduated_project_id,
-- resolves to a PROJECT — and a project can hold several tracks (an EP, an
-- album, or a work graduated a second time after its master designation was
-- superseded — see "cardinality" below). So "which AI disclosure belongs to
-- which released track" has no per-track answer today whenever a project
-- holds more than one track. That blocks the owner's decision
-- (.planning/deliberations/2026-10-04-owner-decisions-submissions-and-gate-0.md
-- §5/§7/§10) that advancing a song into The Crate is rights-bearing: the
-- advance must enforce eligibility, and it cannot enforce what it cannot
-- resolve per track.
--
-- ─── THIS DOES NOT REVERSE A PRIOR DECISION ──────────────────────────────
-- Migration 135's "WHAT IS DELIBERATELY ABSENT FROM public.works" comment
-- (135_works_core.sql:99-121) refuses exactly two things: (a) a reverse
-- pointer from works to split_sheets (135:101-110), and (b) an
-- artist-facing labels column (135:112-120). A work→track link is named in
-- neither refusal, and no other migration in the corpus considers and
-- rejects one (confirmed by the 2026-10-04 deliberation,
-- .planning/deliberations/2026-10-04-work-to-track-eligibility-resolution.md
-- §1, which grepped every "DELIBERATELY"/"on purpose" comment touching
-- works/tracks/vault_projects/song_passport_*). This is an unaddressed gap,
-- not a reversed decision.
--
-- ─── DIRECTION: tracks.work_id, NOT works.graduated_track_id ────────────
-- graduate_song_passport_to_release() (154:199-313, reproduced below with
-- two surgical changes) is already structured so that a work's SECOND
-- graduation — after its master designation is superseded and a new one
-- designated — inserts a SECOND track into the SAME project
-- (154:274-295). That proves the real cardinality is one work to MANY
-- tracks, not one-to-one. A singular column on works
-- (works.graduated_track_id) could only ever name one track, silently
-- losing every earlier graduation's track the moment a work graduates a
-- second time. Putting the pointer on tracks, where each row can carry
-- exactly one work_id, has no such loss — it is the only direction that
-- survives the one-to-many case this codebase already produces.
--
-- ─── THE THREE OWNER CONSTRAINTS (§10 of the 2026-10-04 owner-decisions
-- doc), restated here in this migration's own words ───────────────────────
--
-- 1. NULL MEANS "WE DO NOT KNOW" — NEVER "NO WORK." Legacy uploads
--    (app/api/vault/[projectId]/tracks/route.ts, still the live
--    track-creation path for ordinary EP/album uploads) have nothing to
--    recover: they were never connected to a work and this migration must
--    not invent a connection for them. They stay NULL, and a NULL must
--    route a future reader to "cannot determine, check by hand" — never to
--    a confident negative ("no AI-provenance disqualifier"). Making that
--    structurally impossible rather than merely documented is
--    lib/catalogue/track-work-link.ts's job (261004-wtl Task 2); this
--    migration's job is to make sure the column itself is never writable
--    by a path that could fabricate a false non-NULL value — see the
--    REVOKE below.
-- 2. WRITTEN IN THE SAME TRANSACTION AS GRADUATION, FROM THE SAME FACTS AS
--    THE CHAIN. Two records of one truth can drift apart; written
--    atomically from the one v_work row the function already loaded, they
--    structurally cannot. The chain (song_passport_release_links) stays
--    authoritative — this column is a denormalised shortcut to it, never a
--    second source of truth. A disagreement between the two is a BUG to
--    detect, not a tie to break; see "DETECTING DRIFT" at the end of this
--    file.
-- 3. THE BACKFILL IS PARTIAL, AND SAYS SO. Only tracks that already have a
--    song_passport_release_links row (every Song-Passport-graduated track)
--    get filled, from that chain, keyed by track_id. Every legacy upload —
--    confirmed the only path to public.tracks until Song Passport
--    graduation existed — has no such row and is left NULL. Nothing here
--    guesses from title, project, or date.
-- ============================================================

-- ─── (1) The column, the index, the comment ──────────────────────────────
-- Nullable, FK to works, ON DELETE SET NULL — matching
-- works.graduated_project_id's own ON DELETE SET NULL direction (135:84):
-- deleting the composition must never corrupt the release that came from
-- it, even though no shipped surface can delete a graduated work today
-- (confirmed by the 2026-10-04 deliberation: no DELETE handler exists for
-- works/[workId], and the only works.delete() call in the codebase,
-- app/api/works/route.ts:141, is a same-request creation rollback that
-- fires before a work has graduated).
ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS work_id UUID REFERENCES public.works(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tracks_work_id ON public.tracks (work_id);

COMMENT ON COLUMN public.tracks.work_id IS
  'The Catalogue work (public.works) that produced this track, if known. NULL means "we do not know" and MUST NEVER be read as "no work" or "no AI-provenance disqualifier" -- a future reader of a NULL work_id routes to "cannot determine, check by hand" (owner decision, .planning/deliberations/2026-10-04-owner-decisions-submissions-and-gate-0.md §7/§10), never to a confident negative. Written exactly twice: this migration''s one-time backfill (partial, by design -- see migration 230''s header), and graduate_song_passport_to_release() going forward, from the same v_work row it already loaded and validated. The column-level REVOKE below is what enforces client-write-lockdown, not app-code discipline alone.';

-- ─── (2) Lock the write path ──────────────────────────────────────────────
-- tracks' write RLS policy (tracks_write_project_owner_or_editor,
-- 193_workspace_column_allowlist_rpcs.sql:159-178) is FOR ALL, row-level
-- only -- keyed on project ownership/editor membership. It does not and
-- cannot restrict which COLUMNS a permitted writer may set. Column-level
-- privilege is the only mechanism that closes that gap, and this codebase
-- already uses it once for exactly this reason
-- (REVOKE SELECT (stripe_connect_account_id) ON public.user_profiles FROM
-- authenticated, anon; -- 084_stripe_connect_payouts.sql:70). Applied here
-- to INSERT/UPDATE instead of SELECT, for the same reason: without it, any
-- project owner or editor could point their OWN track's work_id at an
-- ARBITRARY work (including one they do not own -- the FK only checks
-- existence, not ownership) to fabricate AI-provenance eligibility for a
-- decision that licenses the master.
REVOKE INSERT (work_id), UPDATE (work_id) ON public.tracks FROM authenticated, anon;

-- ─── (3) The backfill — partial, by design ───────────────────────────────
-- One hop: song_passport_release_links.track_id -> song_passport_release_
-- links.passport_id -> song_passports.id -> song_passports.work_id.
-- Nothing re-derived; song_passports.work_id is NOT NULL UNIQUE
-- (151_song_passport_foundation.sql:16), so this is unambiguous for every
-- track that has a release-links row.
--
-- Idempotent: the `t.work_id IS NULL` guard means re-running this UPDATE
-- (e.g. if migration 230 is ever re-applied against a database that
-- already ran it) touches zero additional rows.
--
-- Keyed by track_id, not by project: a project holding several tracks
-- where the chain resolves only some of them is handled correctly by
-- construction. The untouched siblings simply have no
-- song_passport_release_links row and stay NULL -- they are not "close
-- enough" guesses from being in the same project, they are genuinely
-- unresolved.
--
-- Every legacy-upload track (the still-live app/api/vault/[projectId]/
-- tracks/route.ts path, which never references works and has no work_id
-- key in its INSERT payload) has no song_passport_release_links row and is
-- therefore left NULL on purpose here. This UPDATE's own WHERE clause is
-- the proof: it can only ever set work_id on a row that has a matching
-- chain entry to set it FROM.
UPDATE public.tracks t
SET work_id = sp.work_id
FROM public.song_passport_release_links link
JOIN public.song_passports sp ON sp.id = link.passport_id
WHERE t.id = link.track_id
  AND t.work_id IS NULL;

-- ─── (4) graduate_song_passport_to_release() — write it atomically, going
-- forward ──────────────────────────────────────────────────────────────
-- Reproduced VERBATIM from 154_song_passport_master_graduation.sql:199-318
-- with exactly two surgical textual changes and no others:
--   (a) `, work_id` appended to the INSERT INTO public.tracks (...) column
--       list, immediately after `metadata`.
--   (b) `, v_work.id` appended to the matching VALUES (...) list,
--       immediately after the closing parenthesis of the
--       jsonb_build_object(...) call.
-- No identifier, condition, comment, or the trailing REVOKE EXECUTE/GRANT
-- EXECUTE pair is altered -- they are reissued exactly as 154 has them
-- (service_role only), matching this codebase's established "restate the
-- grant posture after every CREATE OR REPLACE" convention (the same
-- pattern this repo uses for green_room_can_view_post and others).
--
-- Why this one-line change satisfies the atomicity constraint (owner
-- constraint 2, above): by the time this function reaches the tracks
-- INSERT, v_work has already been loaded FOR UPDATE OF work and already
-- validated (v_work.id IS NOT NULL AND v_work.user_id = p_actor_user_id)
-- at the top of the function body. Reusing v_work.id here is not a new
-- read, introduces no second write, and opens no window in which the
-- column and the chain could disagree -- both are written from the same
-- row inside the same INSERT statement, in the same transaction as every
-- other write this function makes.
CREATE OR REPLACE FUNCTION public.graduate_song_passport_to_release(
  p_passport_id UUID,
  p_master_designation_id UUID,
  p_actor_user_id UUID,
  p_release_title TEXT
)
RETURNS TABLE(vault_project_id UUID, track_id UUID, created BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_work public.works%ROWTYPE;
  v_master public.song_passport_master_designations%ROWTYPE;
  v_version public.work_versions%ROWTYPE;
  v_project_id UUID;
  v_track_id UUID;
  v_title TEXT;
  v_release_date DATE;
  v_label TEXT;
  v_upc TEXT;
  v_isrc TEXT;
  v_lyrics TEXT;
BEGIN
  SELECT work.* INTO v_work
  FROM public.works work
  JOIN public.song_passports passport ON passport.work_id = work.id
  WHERE passport.id = p_passport_id
  FOR UPDATE OF work;
  IF v_work.id IS NULL OR v_work.user_id <> p_actor_user_id THEN
    RAISE EXCEPTION 'Only the song owner may create its Release Report' USING ERRCODE = '42501';
  END IF;

  SELECT designation.* INTO v_master
  FROM public.song_passport_master_designations designation
  WHERE designation.id = p_master_designation_id
    AND designation.passport_id = p_passport_id;
  IF v_master.id IS NULL THEN RAISE EXCEPTION 'Master designation not found' USING ERRCODE = 'P0002'; END IF;

  SELECT link.vault_project_id, link.track_id INTO v_project_id, v_track_id
  FROM public.song_passport_release_links link
  WHERE link.passport_id = p_passport_id
    AND link.master_designation_id = p_master_designation_id;
  IF v_project_id IS NOT NULL THEN
    RETURN QUERY SELECT v_project_id, v_track_id, FALSE;
    RETURN;
  END IF;

  SELECT version.* INTO v_version FROM public.work_versions version WHERE version.id = v_master.work_version_id;
  v_title := COALESCE(NULLIF(BTRIM(p_release_title), ''), v_work.title);

  SELECT value.value_jsonb #>> '{}' INTO v_release_date
  FROM public.song_passport_field_heads head JOIN public.song_passport_values value ON value.id = head.current_value_id
  WHERE head.passport_id = p_passport_id AND head.field_key = 'release_date' LIMIT 1;
  SELECT value.value_jsonb #>> '{}' INTO v_label
  FROM public.song_passport_field_heads head JOIN public.song_passport_values value ON value.id = head.current_value_id
  WHERE head.passport_id = p_passport_id AND head.field_key = 'label_name' LIMIT 1;
  SELECT value.value_jsonb #>> '{}' INTO v_upc
  FROM public.song_passport_field_heads head JOIN public.song_passport_values value ON value.id = head.current_value_id
  WHERE head.passport_id = p_passport_id AND head.field_key = 'upc' LIMIT 1;
  SELECT value.value_jsonb #>> '{}' INTO v_isrc
  FROM public.song_passport_field_heads head JOIN public.song_passport_values value ON value.id = head.current_value_id
  WHERE head.passport_id = p_passport_id AND head.field_key = 'isrc' LIMIT 1;
  SELECT value.value_jsonb #>> '{}' INTO v_lyrics
  FROM public.song_passport_field_heads head JOIN public.song_passport_values value ON value.id = head.current_value_id
  WHERE head.passport_id = p_passport_id AND head.field_key = 'lyrics' LIMIT 1;

  IF v_work.graduated_project_id IS NULL THEN
    INSERT INTO public.vault_projects (
      user_id, title, type, status, release_date, vault_readiness_score,
      upc, label, is_public
    ) VALUES (
      p_actor_user_id, v_title, 'single', 'in_progress', v_release_date,
      0, v_upc, v_label, FALSE
    ) RETURNING id INTO v_project_id;
    UPDATE public.works SET graduated_project_id = v_project_id WHERE id = v_work.id;
  ELSE
    v_project_id := v_work.graduated_project_id;
    IF NOT EXISTS (SELECT 1 FROM public.vault_projects project WHERE project.id = v_project_id AND project.user_id = p_actor_user_id) THEN
      RAISE EXCEPTION 'The linked Release Report is not controlled by this owner' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.tracks (
    project_id, user_id, title, track_number, duration_seconds, isrc,
    audio_file_url, audio_file_size, lyrics, metadata, work_id
  ) VALUES (
    v_project_id, p_actor_user_id, v_work.title,
    COALESCE((SELECT MAX(track.track_number) + 1 FROM public.tracks track WHERE track.project_id = v_project_id), 1),
    v_version.duration_seconds, v_isrc, v_version.audio_path,
    v_version.audio_size, v_lyrics,
    jsonb_build_object(
      'song_passport_id', p_passport_id,
      'song_passport_snapshot_id', v_master.approval_snapshot_id,
      'master_designation_id', v_master.id,
      'source_work_version_id', v_version.id
    ), v_work.id
  ) RETURNING id INTO v_track_id;

  INSERT INTO public.song_passport_release_links (
    passport_id, master_designation_id, approval_snapshot_id,
    vault_project_id, track_id, mapping, created_by
  ) VALUES (
    p_passport_id, v_master.id, v_master.approval_snapshot_id,
    v_project_id, v_track_id,
    jsonb_build_object(
      'release_title', v_title, 'release_date', v_release_date,
      'label_name', v_label, 'upc', v_upc, 'isrc', v_isrc,
      'audio_path', v_version.audio_path, 'source_unchanged', TRUE
    ),
    p_actor_user_id
  );

  RETURN QUERY SELECT v_project_id, v_track_id, TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.graduate_song_passport_to_release(UUID, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_song_passport_to_release(UUID, UUID, UUID, TEXT)
  TO service_role;

-- ─── (5) DETECTING DRIFT ──────────────────────────────────────────────────
-- A disagreement between tracks.work_id and the song_passport_release_links
-- chain can only ever indicate a BUG introduced after this migration -- not
-- a legitimate disagreement -- because from this point forward both the
-- chain and the column are written from the same v_work row inside the
-- same INSERT statement, for every graduation. Run this read-only query at
-- any time after the push; zero rows is healthy:
--
--   SELECT t.id AS track_id, t.work_id AS track_work_id, sp.work_id AS chain_work_id
--   FROM public.tracks t
--   JOIN public.song_passport_release_links link ON link.track_id = t.id
--   JOIN public.song_passports sp ON sp.id = link.passport_id
--   WHERE t.work_id IS DISTINCT FROM sp.work_id;
--
-- Also run, once, right after push, to record the backfill's real
-- coverage (this plan could not determine it in advance -- no production
-- database access from the planning or execution session):
--
--   SELECT COUNT(*) FILTER (WHERE work_id IS NOT NULL) AS linked,
--          COUNT(*) FILTER (WHERE work_id IS NULL) AS unresolved
--   FROM public.tracks;
--
-- As a sanity check on the REVOKE above: a direct authenticated-client
-- `UPDATE tracks SET work_id = '<any-uuid>' WHERE id = '<a track you own>'`
-- must be rejected with a permission error, not silently accepted.
NOTIFY pgrst, 'reload schema';
