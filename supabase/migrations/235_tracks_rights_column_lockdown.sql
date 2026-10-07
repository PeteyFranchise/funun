-- 235_tracks_rights_column_lockdown.sql
--
-- Pass 6 C-2: project EDITORS can rewrite rights and royalty inputs on tracks.
--
-- Migration 193's `tracks_write_project_owner_or_editor` is a single FOR ALL
-- policy granting owner, co-owner AND editor whole-row INSERT, UPDATE and
-- DELETE (193:167-178). The row holds credited writers and producers,
-- featuring artists, mixing and mastering engineers, the ISRC, the metadata
-- JSONB carrying composer and split facts, and `user_id`. Migration 231
-- guards `work_id` and nothing else. Application allowlists do not constrain
-- a direct PostgREST write.
--
-- So an editor can today rewrite another person's credited writers, change
-- split-bearing metadata or identifiers, reassign the row's owner, or delete
-- the track outright. In a rights product that is a money bug, not a
-- permissions nit.
--
-- OWNER DECISION 2026-10-06 — what an editor may change
--
-- Asked directly, the owner chose "working material only": an editor helps
-- make the record, they do not decide who owns it.
--
--   editor MAY change  title, track_number, duration_seconds, audio_file_url,
--                      audio_file_size, bpm, key_signature, explicit, lyrics,
--                      has_sample, sample_details
--   editor MAY NOT     isrc, writers, producers, featuring_artists,
--                      mixing_engineer, mastering_engineer, metadata,
--                      project_id
--   nobody client-side user_id (row ownership is never reassigned by a client)
--   editor MAY NOT     DELETE
--
-- Owner and co-owner retain everything except `user_id`. `work_id` is
-- untouched here -- migration 231 already restricts it to the service role,
-- and widening or narrowing it is not this migration's business.
--
-- The owner also ruled on deletion of tracks that already carry an ISRC or
-- credited writers: owners keep the power to delete for now, with
-- archive-instead deliberately deferred pending beta feedback. Recorded in
-- .planning/todos/pending/2026-10-06-track-delete-vs-archive.md. Editors lose
-- DELETE either way, which closes the collaborator-accident case regardless
-- of how that decision later lands.
--
-- BLAST RADIUS -- verified, not assumed
--
-- Every track-write route in the application scopes its query with
-- `.eq('user_id', user.id)`: track creation (tracks/route.ts:40-62), the
-- PATCH (tracks/[trackId]/route.ts:126-140), both audio paths
-- (audio/route.ts:65-114, audio/complete/route.ts:37-85), the ISRC route and
-- the identifier generator. The track-creation route additionally requires
-- the caller to own the project.
--
-- So an editor has NO working track-write path today -- the permissive
-- FOR ALL policy is reachable only by a direct PostgREST call, which is
-- exactly the attack Pass 6 describes. Nothing this migration forbids is
-- something the product currently does. The editor-writable column list
-- above is therefore a forward commitment: it says what an editor may be
-- given when editor track-editing is actually built, so that feature starts
-- on the right side of the boundary instead of inheriting a FOR ALL.
--
-- The owner-scoped routes all land on the v_full_authority branch and are
-- unaffected, including the two audio routes that legitimately write
-- `metadata.master` while uploading.

-- WHY A TRIGGER AND NOT COLUMN GRANTS
--
-- Migration 230 attempted exactly that shape for a different table and
-- shipped a control that did nothing: a column-level REVOKE is a silent
-- no-op while the role still holds the privilege at table level. Migration
-- 231 replaced it with a trigger and that trigger is behaviourally verified.
-- This migration follows 231, not 230.
--
-- RLS cannot express "this column did not change" -- a policy sees the
-- candidate row, not the delta -- so per-column protection has to live in a
-- BEFORE UPDATE trigger. What RLS CAN express is per-command authority, so
-- the FOR ALL policy is split into explicit INSERT / UPDATE / DELETE policies
-- and DELETE simply stops naming editors.
--
-- NULL DISCIPLINE -- the mistake migration 233 made and 234 fixed
--
-- `project_member_role()` returns NULL for a non-member, and NULL compared
-- with `=` yields NULL, not FALSE. `IF a AND NOT b THEN` is skipped entirely
-- when b is NULL, which is how 233's guard came to be inert in production
-- while every structural check passed. Every boolean below is therefore
-- forced non-NULL at the point of assignment with COALESCE, and the
-- behavioural probes at the foot of this file exist to prove the guard
-- actually refuses rather than merely being present.

-- ─── (1) The per-column guard ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tracks_guard_rights_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  -- auth.role() reads request.jwt.claims, a property of the CONNECTION.
  -- NULL covers a direct database session (the owner via `supabase db push`,
  -- the SQL editor, a migration's own backfill) -- the same admin trust tier
  -- this table's migrations already operate at. 'service_role' covers server
  -- workflows such as graduate_song_passport_to_release(). Identical
  -- reasoning to migrations 231 and 234.
  v_role TEXT := (SELECT auth.role());
  v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role';
  v_uid UUID := (SELECT auth.uid());
  -- COALESCE, not a bare comparison: project_member_role() returns NULL for a
  -- non-member and is_project_owner() can return NULL, and a NULL here would
  -- propagate into the IF condition below and silently disable the guard.
  -- That is precisely migration 233's defect.
  v_full_authority BOOLEAN := COALESCE(
    (SELECT public.is_project_owner(OLD.project_id, v_uid)), FALSE
  ) OR COALESCE(
    (SELECT public.project_member_role(OLD.project_id, v_uid)) = 'co-owner', FALSE
  );
  v_protected_changed BOOLEAN;
BEGIN
  IF v_privileged THEN
    RETURN NEW;
  END IF;

  -- Row ownership is never reassigned by any client caller, owner included.
  -- user_id is the provenance anchor every downstream rights record reads
  -- back through; a client that can move it can forge authorship.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'tracks.user_id cannot be reassigned by a client; it is the row''s provenance anchor'
      USING ERRCODE = '42501';
  END IF;

  IF v_full_authority THEN
    RETURN NEW;
  END IF;

  -- Everything below applies only to a project EDITOR (or any other
  -- non-owner, non-co-owner caller RLS has already admitted to this row).
  v_protected_changed :=
       NEW.isrc               IS DISTINCT FROM OLD.isrc
    OR NEW.writers            IS DISTINCT FROM OLD.writers
    OR NEW.producers          IS DISTINCT FROM OLD.producers
    OR NEW.featuring_artists  IS DISTINCT FROM OLD.featuring_artists
    OR NEW.mixing_engineer    IS DISTINCT FROM OLD.mixing_engineer
    OR NEW.mastering_engineer IS DISTINCT FROM OLD.mastering_engineer
    OR NEW.metadata           IS DISTINCT FROM OLD.metadata
    OR NEW.project_id         IS DISTINCT FROM OLD.project_id;

  IF v_protected_changed THEN
    RAISE EXCEPTION 'tracks: credits, identifiers, split-bearing metadata and project assignment can only be changed by the project owner or a co-owner (attempted change to one of isrc, writers, producers, featuring_artists, mixing_engineer, mastering_engineer, metadata, project_id)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tracks_guard_rights_columns() IS
  'BEFORE UPDATE guard on public.tracks (migration 235) closing Pass 6 C-2. Rejects any change to isrc, writers, producers, featuring_artists, mixing_engineer, mastering_engineer, metadata or project_id by a caller who is not the project owner, a co-owner, the service role, or a direct database session -- and rejects a change to user_id by ANY client caller including the owner. Owner decision 2026-10-06: an editor may change working material (title, lyrics, audio, bpm, key, explicit, track_number, duration, sample flags) and nothing that carries a credit, an identifier or a split. work_id is deliberately not handled here; migration 231 already restricts it to the service role.';

REVOKE EXECUTE ON FUNCTION public.tracks_guard_rights_columns() FROM PUBLIC, anon, authenticated;

-- Name sorts after migration 231's tracks_guard_work_id_write, so work_id is
-- adjudicated first. The two are independent -- neither relies on the other's
-- verdict -- and ordering is noted only so a future reader is not surprised
-- by which error surfaces when a caller violates both at once.
DROP TRIGGER IF EXISTS tracks_guard_rights_columns ON public.tracks;

CREATE TRIGGER tracks_guard_rights_columns
  BEFORE UPDATE ON public.tracks
  FOR EACH ROW
  EXECUTE FUNCTION public.tracks_guard_rights_columns();

COMMENT ON TRIGGER tracks_guard_rights_columns ON public.tracks IS
  'Enforces migration 235''s per-column authority split on tracks. Protection does not depend on tracks'' grant state, so it cannot rot the way migration 230''s column-REVOKE approach already did for this same table.';

-- ─── (2) Split the FOR ALL policy so DELETE stops naming editors ──────────
--
-- Migration 193's single FOR ALL policy is replaced by three per-command
-- policies. INSERT and UPDATE keep exactly 193's actor set, so no caller
-- loses a path it has today except where section (1) narrows it by column.
-- DELETE drops 'editor'.
--
-- INSERT additionally requires user_id = auth.uid(). That is not a new
-- restriction in practice: the only track-creation route
-- (app/api/vault/[projectId]/tracks/route.ts:40-62) already requires the
-- caller to be the project owner and already writes `user_id: user.id`. The
-- clause stops a direct PostgREST INSERT from stamping someone else's id on
-- a row at creation time, which the UPDATE guard above would otherwise have
-- no opportunity to catch.

DROP POLICY IF EXISTS "tracks_write_project_owner_or_editor" ON public.tracks;

CREATE POLICY "tracks_insert_project_owner_or_editor" ON public.tracks
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      (SELECT public.is_project_owner(project_id, (SELECT auth.uid())))
      OR (SELECT public.project_member_role(project_id, (SELECT auth.uid()))) IN ('co-owner', 'editor')
    )
    AND user_id = (SELECT auth.uid())
  );

CREATE POLICY "tracks_update_project_owner_or_editor" ON public.tracks
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, (SELECT auth.uid())))
    OR (SELECT public.project_member_role(project_id, (SELECT auth.uid()))) IN ('co-owner', 'editor')
  )
  WITH CHECK (
    (SELECT public.is_project_owner(project_id, (SELECT auth.uid())))
    OR (SELECT public.project_member_role(project_id, (SELECT auth.uid()))) IN ('co-owner', 'editor')
  );

CREATE POLICY "tracks_delete_project_owner_or_coowner" ON public.tracks
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, (SELECT auth.uid())))
    OR (SELECT public.project_member_role(project_id, (SELECT auth.uid()))) = 'co-owner'
  );

-- ─── (3) Schema-cache reload ──────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

-- ─── OWNER-RUN BEHAVIORAL VERIFICATION ────────────────────────────────────
--
-- A migration statement's presence is not evidence the behaviour is blocked.
-- Migration 230 shipped a passing text-lock test on a control that enforced
-- nothing, and migration 233 shipped a guard whose IF condition was NULL so
-- it never raised -- both passed every structural check. Only asking
-- production to refuse a real write distinguishes a working guard from a
-- decorative one.
--
-- Run each probe in the Supabase SQL editor after pushing this migration.
-- Every one rolls back and leaves no trace. Substitute a real editor's user
-- id, a real project they edit but do not own, and a track id in it.
--
--   P1  MUST FAIL 42501 -- editor changes credited writers
--   P2  MUST FAIL 42501 -- editor changes isrc
--   P3  MUST FAIL 42501 -- editor changes metadata
--   P4  MUST FAIL 42501 -- owner reassigns user_id (owner is NOT exempt)
--   P5  MUST FAIL (0 rows deleted, RLS) -- editor deletes a track
--   P6  MUST SUCCEED -- editor changes title and lyrics
--   P7  MUST SUCCEED -- owner changes writers and isrc
--   P8  MUST SUCCEED -- service_role changes anything
--
-- P6, P7 and P8 are not optional. A guard that locks owners out of their own
-- credits, or editors out of the working material they were invited to
-- touch, would be worse than the hole it closes -- and would be discovered
-- by users rather than here.
