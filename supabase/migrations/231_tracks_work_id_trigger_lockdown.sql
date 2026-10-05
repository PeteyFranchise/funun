-- ============================================================
-- Funūn — correcting migration 230's silent no-op. Migration 231:
--                 tracks_guard_work_id_write — a BEFORE INSERT OR UPDATE
--                 trigger on public.tracks that actually rejects a
--                 client-side write to work_id, replacing migration 230's
--                 column-level REVOKE that never took effect.
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (the standing convention since migrations 058/062/063/064/066/067/070/078,
-- restated as recently as 230's own header). This file is authored and
-- text-tested (__tests__/migration-231-tracks-work-id-trigger-lockdown.test.ts)
-- but must not be applied automatically. The live push and the OWNER-RUN
-- BEHAVIORAL VERIFICATION block at the end of this file are the owner's
-- step, tracked as a todo
-- (.planning/todos/pending/261004-wlk-push-and-verify-migration-231.md).
-- Do NOT edit migrations 001-230 (already landed).
-- ============================================================
--
-- ─── WHY THIS MIGRATION EXISTS: 230'S REVOKE WAS A SILENT NO-OP ──────────
--
-- Migration 230 (230:120) shipped:
--
--   REVOKE INSERT (work_id), UPDATE (work_id) ON public.tracks
--     FROM authenticated, anon;
--
-- That statement executed, reported success, and protected nothing.
-- `public.tracks` has carried Supabase's ambient table-level INSERT/UPDATE
-- grant to `authenticated`/`anon` since migration 001
-- (001_initial_schema.sql:115-141 creates the table and its RLS policy with
-- zero GRANT/REVOKE statements anywhere in that block; a full-corpus
-- `grep -n "GRANT\|REVOKE" supabase/migrations/*.sql` naming `tracks` returns
-- only migration 230's own column-level lines). PostgreSQL does not let a
-- column-level REVOKE remove a privilege a role already holds at the table
-- level — a column simply inherits the table grant regardless of any
-- column-scoped REVOKE issued against it. Confirmed against production:
-- `information_schema.column_privileges` for `tracks.work_id` returns 8 rows
-- (SELECT/INSERT/UPDATE/REFERENCES x anon+authenticated) and
-- `information_schema.role_table_grants` for `tracks` returns 4 rows of
-- table-level INSERT/UPDATE for anon+authenticated — both exactly as they
-- were before 230 ever ran.
--
-- Migration 230 cited migration 084's `REVOKE SELECT
-- (stripe_connect_account_id) ON public.user_profiles`
-- (084_stripe_connect_payouts.sql:70) as its model. That citation does not
-- transfer, and THIS IS THE LESSON: a cited precedent must be checked for
-- the actual mechanism it relies on, not just copied for its surface shape.
-- 084's column genuinely had no table-level privilege to shadow it, because
-- migration 040 had already revoked `user_profiles`' (then
-- `artist_profiles`') table-level SELECT/UPDATE grant years before
-- `stripe_connect_account_id` ever existed (040_artist_profiles_column_
-- privileges.sql:83,113) — there was no ambient grant left for 084's REVOKE
-- to fight. `tracks` never got migration 040's equivalent step. 230 copied
-- the REVOKE's shape without the precondition that made it work.
--
-- ─── SEPARATE FINDING, NOT FIXED HERE ─────────────────────────────────────
-- `anon` additionally holds this same ambient table-level INSERT/UPDATE
-- grant on `tracks`, but it is already neutralized by RLS:
-- `tracks_write_project_owner_or_editor`
-- (193_workspace_column_allowlist_rpcs.sql:168-178) is `FOR ALL TO
-- authenticated` only, so `anon` has no applicable write policy and is
-- default-denied regardless of the grant. This is the same class of
-- residual-grant hygiene migrations 091 (funun_staff / staff_audit_log) and
-- 092 (buyer_orgs / buyer_members) already closed for other tables there
-- TRUNCATE/TRIGGER/REFERENCES; here it is a dead-but-ungranted,
-- not-near-exploitable INSERT/UPDATE. Closing it is deliberately deferred to
-- the follow-up named in this plan's owner todo rather than bundled into
-- this fix, to keep this migration reviewable against the one defect it
-- exists to correct.
--
-- ─── WHY A TRIGGER (CANDIDATE B), NOT A TABLE-REVOKE-THEN-COLUMN-ALLOWLIST
-- (CANDIDATE A) ───────────────────────────────────────────────────────────
-- Candidate A — migration 040's own pattern, proven to work — would mean
-- revoking `tracks`' table-level INSERT/UPDATE and re-granting column by
-- column. `tracks` has grown its column list four separate times
-- (migrations 001, 005, 006, 109) with zero grant bookkeeping; converting it
-- to allowlist mode now would require enumerating and re-verifying INSERT
-- and UPDATE grants for roughly two dozen columns against every writer route
-- in this codebase — correct, but a far larger and riskier change than a
-- single-column defect requires, and it inherits the EXACT "the next added
-- column is silently wrong" failure mode this fix exists to close: either a
-- future column is forgotten from the allowlist and legitimate writes break,
-- or someone "fixes" that by re-granting table-wide and reopens this precise
-- hole. A trigger's protection does not read `tracks`' grant state at all —
-- it is correct regardless of what any future migration grants or revokes on
-- this table — so it cannot rot the same way.
--
-- ─── WHY `auth.role()`, NOT `current_user` ───────────────────────────────
-- `graduate_song_passport_to_release()` (230:150-291) is SECURITY DEFINER,
-- which changes `current_user` to the function's OWNER for the duration of
-- the call. A guard gated on `current_user = 'service_role'` would therefore
-- see the function's owner, not its caller, and could not distinguish a
-- service-role-mediated write from any other. `auth.role()` reads the
-- `request.jwt.claims` session GUC instead — a property of the CONNECTION,
-- which SECURITY DEFINER's identity switch never touches. Migration 209
-- already ships thirteen functions relying on exactly this idiom
-- (`(SELECT auth.role()) = 'service_role'`, e.g.
-- 209_definer_helper_caller_binding.sql:254,301,320, with its own "WHY THE
-- SERVICE-ROLE DISJUNCT IS REQUIRED, NOT DECORATIVE" section) — this
-- migration matches that established idiom rather than inventing a new one.
--
-- `graduate_song_passport_to_release()`'s only caller,
-- app/api/works/[workId]/passport/route.ts:171
-- (`service.rpc('graduate_song_passport_to_release', ...)`), uses the
-- service client constructed at route.ts:56 via `createServiceClient()`
-- (lib/supabase/server.ts:39-43), whose JWT carries the `service_role`
-- claim. That claim is what `auth.role()` reads inside the trigger, so the
-- write this migration must not break keeps working by the same mechanism
-- migration 209 already relies on thirteen times over.
--
-- NULL is treated as privileged for the same reason migration 230's
-- predecessors already trust it: a direct database session (the owner via
-- `supabase db push`, the Supabase SQL editor, a migration's own backfill)
-- has no `request.jwt.claims` at all, so `auth.role()` returns NULL there —
-- the same pre-existing admin trust tier this table's owner-run migrations
-- already operate at, not a new privilege being introduced.
--
-- ─── NO EXISTING WRITER OF tracks EVER NAMES work_id ──────────────────────
-- Re-verified this session: the legacy track INSERT
-- (app/api/vault/[projectId]/tracks/route.ts:55-61, insert payload `user_id,
-- project_id, title, track_number, isrc` — no `work_id`), the metadata PATCH
-- route's allowlisted TrackUpdate type
-- (app/api/vault/[projectId]/tracks/[trackId]/route.ts:19-30, no `work_id`
-- field, and :136 `.update(update)` where `update` can only ever contain
-- allowlisted keys), the isrc/audio/audio-complete routes, the three
-- sync-library tag routes, the two split-sheet metadata-merge routes,
-- generate-identifier, and migration 226's `set_track_metadata_asset`
-- (226_track_metadata_atomic_asset_merge.sql:30-47, SECURITY INVOKER,
-- key-allowlisted to 'stems'/'instrumental') never name `work_id` in an
-- INSERT or UPDATE payload today, so none of them can trip this guard.
--
-- ─── WHAT THIS DOES NOT TOUCH ─────────────────────────────────────────────
-- Migrations 001-230 are byte-for-byte unedited. This migration is
-- additive-only: one new trigger function and one new trigger. Migration
-- 230's column-level REVOKE (230:120) stays exactly as it shipped — it is
-- now a harmless, documentation-only no-op (editing 230 would mean editing
-- an already-landed migration, which is forbidden). Not one RLS policy on
-- `tracks` is altered. `graduate_song_passport_to_release()`'s body
-- (230:150-291) is untouched by this file.
-- ============================================================

-- ─── (1) The guard function ───────────────────────────────────────────────
-- SECURITY INVOKER, deliberately — matching migration 226's own posture for
-- its trigger-adjacent functions: no elevated access is needed here, the
-- function only inspects NEW/OLD and the calling connection's own
-- auth.role(), so it runs with exactly the privileges the trigger's firing
-- context already has.
CREATE OR REPLACE FUNCTION public.tracks_guard_work_id_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  -- auth.role() reads the request.jwt.claims session GUC -- a property of
  -- the CONNECTION, not of SECURITY DEFINER's current_user switch. This is
  -- the identical idiom migration 209 already relies on for its thirteen
  -- SECURITY DEFINER binds (209_definer_helper_caller_binding.sql:254,301,320:
  -- "(SELECT auth.role()) = 'service_role'"). current_user would instead see
  -- graduate_song_passport_to_release()'s OWNER during that function's call,
  -- never its caller -- using it here would make this guard blind to the one
  -- legitimate writer it must allow through.
  v_role TEXT := (SELECT auth.role());
  -- NULL covers a direct database session (the owner via `supabase db push`,
  -- the Supabase SQL editor, a migration's own backfill) -- no
  -- request.jwt.claims exists there, so auth.role() returns NULL. That is
  -- the same pre-existing admin trust tier this table's owner-run migrations
  -- already operate at, not a new privilege introduced by this guard.
  -- 'service_role' covers graduate_song_passport_to_release() (SECURITY
  -- DEFINER, called only via the service client at
  -- app/api/works/[workId]/passport/route.ts:171) and any future
  -- service-role-mediated write.
  v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role';
  v_changing BOOLEAN := (TG_OP = 'INSERT' AND NEW.work_id IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND NEW.work_id IS DISTINCT FROM OLD.work_id);
BEGIN
  IF v_changing AND NOT v_privileged THEN
    RAISE EXCEPTION 'tracks.work_id can only be written by the service role (graduate_song_passport_to_release)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tracks_guard_work_id_write() IS
  'BEFORE INSERT OR UPDATE guard on public.tracks (migration 231) rejecting any client write to work_id unless auth.role() is NULL (direct database session) or ''service_role'' (graduate_song_passport_to_release() via the service client). Replaces migration 230''s column-level REVOKE INSERT (work_id), UPDATE (work_id), which never took effect because public.tracks has carried the ambient Supabase table-level INSERT/UPDATE grant since migration 001 and a column REVOKE cannot override a live table grant. See migration 231''s header for the full mechanism and the auth.role() vs. current_user reasoning.';

-- ─── (2) The trigger ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS tracks_guard_work_id_write ON public.tracks;

CREATE TRIGGER tracks_guard_work_id_write
  BEFORE INSERT OR UPDATE ON public.tracks
  FOR EACH ROW
  EXECUTE FUNCTION public.tracks_guard_work_id_write();

COMMENT ON TRIGGER tracks_guard_work_id_write ON public.tracks IS
  'Enforces that only the service role (or a direct database session) may set or change tracks.work_id -- migration 231''s correction of migration 230''s silent-no-op column REVOKE. Protection does not depend on tracks'' grant state, so it cannot rot the way the column-REVOKE approach already did when a future migration changes those grants.';

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- OWNER-RUN BEHAVIORAL VERIFICATION
--
-- This migration's own Jest test (__tests__/migration-231-tracks-work-id-
-- trigger-lockdown.test.ts) proves the SQL below was WRITTEN with the
-- intended guard. It does NOT and CANNOT prove Postgres ENFORCES it --
-- migration 230 shipped a passing text-lock test on SQL that enforced
-- nothing. The only real proof is running the trigger against a live
-- database, which no session authoring this file could do (no Docker, no
-- local Supabase Postgres, no production credentials reachable from this
-- planning or execution environment). Run the two blocks below, by hand, in
-- the Supabase SQL editor, AFTER pushing this migration.
--
-- (a) RE-CONFIRM THE (UNCHANGED) GRANT STATE. The grant itself is not what
--     changed -- the trigger is. Seeing the same 8-row / 4-row result as the
--     original defect report is NOT a failure; it is expected and confirms
--     this fix did not (and does not need to) touch the grant at all.
--
--   SELECT * FROM information_schema.column_privileges
--   WHERE table_schema = 'public' AND table_name = 'tracks' AND column_name = 'work_id';
--
--   SELECT * FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND table_name = 'tracks'
--     AND privilege_type IN ('INSERT', 'UPDATE');
--
-- (b) THE ACTUAL PROOF -- a self-contained, non-destructive behavioral
--     probe. Requires at least one real project you (the owner) control;
--     production currently has that even though it has zero tracks.
--     Replace <YOUR_USER_ID> and <YOUR_PROJECT_ID> with real values you own.
--     Everything below is wrapped so the whole probe is discarded by the
--     final ROLLBACK and leaves no trace in production.
--
--   BEGIN;
--
--   -- Impersonate an ordinary authenticated client.
--   SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub','<YOUR_USER_ID>')::text, true);
--   SET ROLE authenticated;
--
--   SAVEPOINT probe_1;
--   -- MUST RAISE 42501 -- an authenticated client naming work_id directly.
--   INSERT INTO public.tracks (project_id, user_id, title, track_number, work_id)
--   VALUES ('<YOUR_PROJECT_ID>', '<YOUR_USER_ID>', 'trigger probe', 9999, '00000000-0000-0000-0000-000000000000');
--   -- After observing the 42501 error above:
--   ROLLBACK TO SAVEPOINT probe_1;
--
--   -- MUST SUCCEED -- the same client, same row shape, just without work_id.
--   INSERT INTO public.tracks (project_id, user_id, title, track_number)
--   VALUES ('<YOUR_PROJECT_ID>', '<YOUR_USER_ID>', 'trigger probe', 9999)
--   RETURNING id;
--   -- Note the returned id; it is referenced as <PROBE_TRACK_ID> below.
--
--   RESET ROLE;
--   -- Impersonate the service role -- the one path graduate_song_passport_
--   -- to_release() actually uses.
--   SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
--   SET ROLE service_role;
--
--   -- MUST SUCCEED -- this is the proof graduate_song_passport_to_release()'s
--   -- own write path still works.
--   UPDATE public.tracks SET work_id = '00000000-0000-0000-0000-000000000000'
--   WHERE id = '<PROBE_TRACK_ID>';
--
--   -- Discard the entire probe. Production is unchanged after this line.
--   ROLLBACK;
--
-- If (b)'s first INSERT does NOT raise 42501, or either of the later two
-- steps fails, this migration did not do what it claims and must not be
-- treated as applied correctly.
-- ============================================================
