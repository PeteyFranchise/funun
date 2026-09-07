-- ============================================================
-- Funūn — Phase 38.0.1 (workspace-authorization-remediation): Plan 10.
-- Migration 193: the workspace branch is REMOVED from tracks, vault_assets,
--                vault_documents and tool_outputs; the two vault_projects
--                policies are preserved as the only direct workspace branch
--                left in the schema; and four column-allowlist
--                SECURITY DEFINER read functions
--                (public.workspace_read_tracks, workspace_read_assets,
--                workspace_read_documents, workspace_read_tool_outputs)
--                are added in the removed branches' place.
--
-- HUMAN-GATED — this project never runs `supabase db push`, `supabase db
-- reset`, `supabase migration up`, or `supabase db query` from an agent.
-- That is the standing convention stated verbatim in the headers of
-- migrations 078, 080, 136, 177 and 181-190. This file is authored and
-- text-tested (__tests__/migration-193.test.ts, plus the repository-level
-- __tests__/workspace-structural-exclusions.test.ts) but must not be
-- applied automatically.
--
-- ─── PUSHED WITH 191, 192 AND 194 — NEVER STAGED ALONE ───────────────────
-- This migration is pushed TOGETHER with 191, 192 and 194, and with the
-- TypeScript changes from plans 04, 06, 08 and 11, in one transaction
-- window at plan 11's joint checkpoint. It is never staged ahead of that
-- window, and the reason is specific to THIS file rather than a general
-- caution: removing a policy branch before its replacement read functions
-- exist breaks the feature outright (a workspace caller loses every child
-- row with nothing to read instead), and shipping the replacement functions
-- before removing the branch leaves TWO authorization paths live at once
-- with no test saying which one a given call actually executed — a false
-- sense of remediation, which is worse than the defect it claims to fix
-- (38.0.1-RESEARCH.md Pattern 2, "migration-ordering hazard"). The plan 10
-- checkpoint that gates this file is a REVIEW-AND-HOLD, not a push
-- authorisation.
--
-- MIGRATION NUMBERING (Phase 38.0.1 planner decision, restated from
-- migrations 191 and 192's headers): 190 = plan 02 (the R-17/WSR-25
-- `vault_projects.user_id` immutability trigger). 191 = plan 05 (the consent
-- root, delegation lineage, NOT NULL tightening and evidence confirmation
-- schema). 192 = plan 09 (the six-hop `workspace_project_permission` helper
-- every read function below calls). 193 (this file) = plan 10. 194 = the
-- Member consent RPC route. 195-196 are RESERVED for Phase 38.0.2. 197-198
-- are RESERVED for Phase 38.2's billing and beta-flag migrations.
--
-- ─── WHY THIS EXISTS (R-02/WSR-03, R-02/WSR-04, R-02/WSR-05; findings F2
--     and F3) ──────────────────────────────────────────────────────────
-- The permission catalogue names nineteen granular capabilities
-- (migration 184's CHECK constraint, lib/workspaces/permissions.ts), and
-- row-level RLS grants WHOLE ROWS. Those two statements cannot both be
-- honoured by an `OR (SELECT public.workspace_project_permission(...))`
-- disjunct on a table policy, and migration 186 added exactly that to eight
-- child-table policies:
--   F2 — `... 'view_summaries'` on each SELECT policy hands a workspace
--   caller EVERY column of tracks/vault_assets/vault_documents/tool_outputs,
--   including `audio_file_url`, `audio_file_size`, `lyrics`, vault_assets'
--   `url`, vault_documents' `document_data` and `file_url`, and
--   tool_outputs' `inputs`/`output`. A grant that reads "view summaries"
--   silently delivers the master audio path (custody D-01/D-09).
--   F3 — `... 'edit_metadata'` was added to policies declared `FOR ALL`.
--   FOR ALL covers INSERT, UPDATE and DELETE, so a permission named
--   "edit metadata" is in fact delete-and-overwrite authority over an
--   artist's tracks, artwork, contracts and tool history.
--
-- THE FIX, AND WHY IT IS A FUNCTION AND NOT A VIEW. A view's exposed column
-- list is fixed at creation time and cannot vary with which permission the
-- caller currently holds; PostgREST's `select=` mechanism cannot vary it
-- either. A function's `RETURNS TABLE (...)` clause IS the contract — a
-- caller cannot ask for a column outside it, and the function can branch
-- internally (`CASE WHEN public.workspace_project_permission(...) THEN col
-- ELSE NULL END`) to null out a column a specific grant does not cover.
-- That is the whole reason R-02 chose functions (38.0.1-RESEARCH.md
-- Pattern 2). After this migration `vault_projects` is the ONLY table in
-- the schema whose RLS policies name a workspace helper, so the blast
-- radius of a future policy bug in this family is one table, not five.
--
-- ─── THE RECURSION DOCTRINE, AS IT APPLIES HERE ──────────────────────────
-- Restated from migration 192's header, not re-argued: a plain SELECT
-- against an RLS-protected table inside a SECURITY DEFINER body owned by a
-- role that bypasses RLS does not re-enter that table's policies, so it
-- cannot recurse (42P17). What recursion forbids, and what this file never
-- writes, is a cross-table EXISTS inlined inside a POLICY body. The four
-- read functions below each read exactly one production table with a plain
-- qualified SELECT inside their own SECURITY DEFINER bodies — that is safe
-- by the doctrine, not an exception to it. No policy in this file gains a
-- subquery of any kind.
--
-- ─── THE SUBSELECT-WRAPPING RULE ──────────────────────────────────────────
-- Every surviving helper call inside a policy body stays wrapped as a
-- scalar subselect `(SELECT public.helper(...))`, exactly as migrations
-- 078/136/182/183/184/185/186 wrap their own helpers, so the planner
-- evaluates it once per statement rather than once per row. The four read
-- functions call `public.workspace_project_permission` from FUNCTION bodies,
-- not policy bodies, so the wrapping rule does not apply to those call
-- sites.
--
-- ─── INCLUSION / EXCLUSION CHECKLIST (38-RESEARCH.md Pitfall 2, in
--     migration 186's own format) ─────────────────────────────────────────
-- Every policy NAMED by a statement in this file, and nothing else:
--   INCLUDED (section (a), workspace disjunct REMOVED — eight policies):
--     tracks_select_project_owner_or_member,
--     tracks_write_project_owner_or_editor,
--     vault_assets_select_project_owner_or_member,
--     vault_assets_write_project_owner_or_editor,
--     vault_documents_select_project_owner_or_member,
--     vault_documents_write_project_owner_or_editor,
--     tool_outputs_select_project_owner_or_member,
--     tool_outputs_write_project_owner_or_editor.
--   INCLUDED (section (b), workspace disjunct PRESERVED — two policies):
--     vault_projects_select_owner_or_member,
--     vault_projects_update_owner_or_editor.
-- Ten policies, dropped and recreated, matching migration 186's own
-- inventory exactly. This file names NO OTHER POLICY, on any table:
--   EXCLUDED: vault_projects_insert_own and vault_projects_delete_owner_only
--             — migration 186 deliberately did not name them (a
--             workspace-created project is written as the subject Member by
--             a service route, D-24, and deleting a Member's record is never
--             a workspace-derived power), and neither does this file.
--             workspace_audit_log_select (migration 186 section (e)) is
--             untouched. `Public vault projects discoverable` (migration
--             001) is untouched. Every policy on every table outside the
--             five named above — project_members, work_members,
--             idea_members, split_sheets, split_sheet_parties, submissions,
--             subscriptions, user_profiles, artist_profiles, buyer_orgs,
--             buyer_members, funun_staff, and all ten workspace tables from
--             migrations 182-185 — is untouched, in this migration and in
--             any future one, absent a new deliberation reopening
--             D-42/custody D-01/D-09 explicitly.
--             The clean-master accessor path is likewise excluded: NO read
--             function below returns a storage path, a signed URL, a raw
--             document payload or a lyric body under ANY grant, and none of
--             them takes a permission argument that could be widened into
--             one (custody D-01/D-09, D-40).
--
-- THIS FILE DOES NOT MODIFY handle_new_user(), member_type, industry_roles,
-- capability_grants or project_members (D-52). It creates no table, adds no
-- column, and therefore has no backfill and no UUID default to restate.
-- ============================================================

-- ─── (a) The four child tables lose their workspace disjunct ─────────────
-- Each policy below is DROPped and RECREATED with migration 078's ORIGINAL
-- clauses restored EXACTLY — the `is_project_owner` check, the
-- `project_member_role` check, and (on vault_documents and tool_outputs,
-- whose project_id is nullable) the preserved
-- `project_id IS NULL AND user_id = (SELECT auth.uid())` fallback that keeps
-- an owner's unattached documents and tool runs reachable. Exactly ONE
-- disjunct is removed from each — migration 186's
-- `OR (SELECT public.workspace_project_permission(...))` — and nothing else
-- is restructured, reordered or simplified. Nothing is added.
--
-- AFTER THIS SECTION, `public.workspace_project_permission` IS NAMED BY
-- POLICIES ON EXACTLY ONE TABLE: `public.vault_projects` (section (b)). A
-- workspace caller has NO write path of any kind to these four tables —
-- F3's `FOR ALL` delete-and-overwrite exposure is closed by removal, not by
-- narrowing — and NO row-level read path either; reads go through
-- section (c)'s declared column lists.

-- tracks (project_id NOT NULL — no nullable fallback, matching 078/186).
DROP POLICY IF EXISTS "tracks_select_project_owner_or_member" ON public.tracks;

CREATE POLICY "tracks_select_project_owner_or_member" ON public.tracks
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IS NOT NULL
  );

DROP POLICY IF EXISTS "tracks_write_project_owner_or_editor" ON public.tracks;

CREATE POLICY "tracks_write_project_owner_or_editor" ON public.tracks
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
  )
  WITH CHECK (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
  );

-- vault_assets (project_id NOT NULL — no nullable fallback).
DROP POLICY IF EXISTS "vault_assets_select_project_owner_or_member" ON public.vault_assets;

CREATE POLICY "vault_assets_select_project_owner_or_member" ON public.vault_assets
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IS NOT NULL
  );

DROP POLICY IF EXISTS "vault_assets_write_project_owner_or_editor" ON public.vault_assets;

CREATE POLICY "vault_assets_write_project_owner_or_editor" ON public.vault_assets
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
  )
  WITH CHECK (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
  );

-- vault_documents (project_id NULLABLE — migration 001. The
-- `project_id IS NULL AND user_id = (SELECT auth.uid())` fallback from
-- migration 078, preserved verbatim by migration 186, is preserved verbatim
-- again here on BOTH policies).
DROP POLICY IF EXISTS "vault_documents_select_project_owner_or_member" ON public.vault_documents;

CREATE POLICY "vault_documents_select_project_owner_or_member" ON public.vault_documents
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IS NOT NULL
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "vault_documents_write_project_owner_or_editor" ON public.vault_documents;

CREATE POLICY "vault_documents_write_project_owner_or_editor" ON public.vault_documents
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
  );

-- tool_outputs (project_id NULLABLE, ON DELETE SET NULL — migration 001.
-- Same preserved nullable fallback as vault_documents above).
DROP POLICY IF EXISTS "tool_outputs_select_project_owner_or_member" ON public.tool_outputs;

CREATE POLICY "tool_outputs_select_project_owner_or_member" ON public.tool_outputs
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IS NOT NULL
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "tool_outputs_write_project_owner_or_editor" ON public.tool_outputs;

CREATE POLICY "tool_outputs_write_project_owner_or_editor" ON public.tool_outputs
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
  );

-- ─── (b) vault_projects — the one table that keeps a direct branch ───────
-- Recreated with migration 186's clauses intact. `vault_projects` is a
-- summary row: title, artist, status, dates, readiness score. It carries no
-- storage path, no lyric body and no raw document payload, so a whole-row
-- SELECT grant here does not have F2's shape and the branch survives.
DROP POLICY IF EXISTS "vault_projects_select_owner_or_member" ON public.vault_projects;

CREATE POLICY "vault_projects_select_owner_or_member" ON public.vault_projects
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.project_member_role(id, auth.uid())) IS NOT NULL
    OR (SELECT public.workspace_project_permission(id, auth.uid(), 'view_summaries'))
  );

-- CUSTODY IMMUTABILITY UNDER THIS BRANCH IS NOT ENFORCED HERE, AND CANNOT
-- BE. A WITH CHECK clause sees only the PROPOSED row; it cannot compare
-- that row against the stored one, so no expression writable in this policy
-- can say "user_id must not change". Migration 190's BEFORE UPDATE trigger
-- on vault_projects (R-17/WSR-25) is the enforcement point: it compares OLD
-- and NEW and rejects any attempt to move custody, whichever disjunct of
-- this policy admitted the statement. This comment states the boundary so
-- the next reader does not mistake the absence of a custody clause below
-- for an omission — do not attempt to express custody immutability here.
DROP POLICY IF EXISTS "vault_projects_update_owner_or_editor" ON public.vault_projects;

CREATE POLICY "vault_projects_update_owner_or_editor" ON public.vault_projects
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.project_member_role(id, auth.uid())) IN ('co-owner', 'editor')
    OR (SELECT public.workspace_project_permission(id, auth.uid(), 'edit_metadata'))
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.project_member_role(id, auth.uid())) IN ('co-owner', 'editor')
    OR (SELECT public.workspace_project_permission(id, auth.uid(), 'edit_metadata'))
  );

-- ─── (c) The four column-allowlist read functions (R-02/WSR-04) ──────────
-- READ THE `RETURNS TABLE (...)` CLAUSE OF EACH FUNCTION BELOW AS A
-- SECURITY CONTRACT, NOT AS A CONVENIENCE. It is the complete set of facts
-- a workspace caller can obtain about the row, and a caller cannot request
-- anything outside it. Adding a column to one of these lists is exactly as
-- consequential as widening an RLS policy and must be reviewed the same
-- way — __tests__/migration-193.test.ts slices each list and asserts the
-- forbidden names are absent so a later hand-edit fails the suite instead
-- of production.
--
-- Every row returned is still gated by migration 192's six-hop
-- `public.workspace_project_permission`: a live attachment, an active
-- unexpired membership, an accepted in-window relationship, an unrevoked
-- grant on that same relationship, the custody binding
-- (`p.user_id = r.member_user_id`), and a live delegation lineage. These
-- functions add no authority of their own — they narrow what an already
-- authorised caller may see.
--
-- WITHHELD FROM EVERY LIST, UNCONDITIONALLY, UNDER EVERY GRANT (custody
-- D-01/D-09, D-40): tracks' audio path and audio size columns and its lyric
-- body; vault_assets' URL column; vault_documents' JSON payload, its file
-- URL and its e-sign claim token; tool_outputs' input and output JSON. A
-- workspace grant is never a shortcut around the existing narrow,
-- asset-class-specific accessors, and no clean-master reference of any kind
-- is reachable from here.
--
-- CONDITIONAL EXPOSURE, EXACTLY ONE COLUMN: the track ISRC, nulled out
-- unless the caller separately holds `view_private_rights_identifiers`
-- (D-40's bundle-excluded tier — it must be ticked individually and is
-- never implied by `view_summaries`). It is expressed as a CASE inside the
-- single declared column rather than as a second unconditional column, so
-- there is one contract per function and no widened list to review.
-- `access_clean_masters` gets NO conditional branch in any function below:
-- clean-master access is not a column read, and it stays with the existing
-- narrow accessor (custody D-01, D-09) rather than becoming a nullable
-- column here.

CREATE OR REPLACE FUNCTION public.workspace_read_tracks(
  p_project_id UUID,
  p_uid UUID
)
RETURNS TABLE (
  id                UUID,
  project_id        UUID,
  title             TEXT,
  track_number      INTEGER,
  duration_seconds  INTEGER,
  bpm               INTEGER,
  key_signature     TEXT,
  explicit          BOOLEAN,
  featuring_artists TEXT[],
  writers           TEXT[],
  producers         TEXT[],
  isrc              TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    t.id,
    t.project_id,
    t.title,
    t.track_number,
    t.duration_seconds,
    t.bpm,
    t.key_signature,
    t.explicit,
    t.featuring_artists,
    t.writers,
    t.producers,
    CASE
      WHEN public.workspace_project_permission(p_project_id, p_uid, 'view_private_rights_identifiers')
        THEN t.isrc
      ELSE NULL::TEXT
    END
  FROM public.tracks t
  WHERE t.project_id = p_project_id
    AND public.workspace_project_permission(p_project_id, p_uid, 'view_summaries')
    -- The caller-identity binding. These functions are SECURITY DEFINER and
    -- GRANTed to authenticated, so without this line any caller could pass
    -- another user uuid and read what that user is permitted to see. p_uid
    -- names the caller or it names nobody. Do not remove as redundant.
    AND p_uid = (SELECT auth.uid())
$$;

REVOKE EXECUTE ON FUNCTION public.workspace_read_tracks(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.workspace_read_tracks(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.workspace_read_tracks(uuid, uuid) IS
  'The ONLY path by which a workspace caller reads public.tracks as of migration 193 (R-02/WSR-03/WSR-04) — the workspace disjunct was removed from both of tracks'' RLS policies in this same migration, so there is no row-level workspace read or write path left. THE DECLARED RETURN COLUMN LIST IS THE SECURITY CONTRACT: it is the complete set of facts a workspace caller can obtain about a track, a caller cannot request anything outside it, and adding a column to it must be reviewed exactly as carefully as widening an RLS policy. It NEVER returns a storage path, a signed URL, a raw document payload or a lyric body under any grant — audio_file_url, audio_file_size and lyrics are withheld unconditionally (custody D-01/D-09, D-40), and no grant may become a shortcut around the existing narrow, asset-class-specific accessors. The ISRC is the one conditionally exposed column: NULL unless the caller separately holds view_private_rights_identifiers, which is bundle-excluded under D-40 and never implied by view_summaries. Every returned row is gated by migration 192''s six-hop workspace_project_permission, re-evaluated live on every call with nothing cached.';

CREATE OR REPLACE FUNCTION public.workspace_read_assets(
  p_project_id UUID,
  p_uid UUID
)
RETURNS TABLE (
  id         UUID,
  project_id UUID,
  type       TEXT,
  filename   TEXT,
  width      INTEGER,
  height     INTEGER,
  size_bytes BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    a.id,
    a.project_id,
    a.type,
    a.filename,
    a.width,
    a.height,
    a.size_bytes
  FROM public.vault_assets a
  WHERE a.project_id = p_project_id
    AND public.workspace_project_permission(p_project_id, p_uid, 'view_summaries')
    AND p_uid = (SELECT auth.uid())
$$;

REVOKE EXECUTE ON FUNCTION public.workspace_read_assets(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.workspace_read_assets(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.workspace_read_assets(uuid, uuid) IS
  'The ONLY path by which a workspace caller reads public.vault_assets as of migration 193 (R-02/WSR-03/WSR-04) — the workspace disjunct was removed from both of vault_assets'' RLS policies in this same migration. THE DECLARED RETURN COLUMN LIST IS THE SECURITY CONTRACT: a caller cannot request anything outside it, and adding a column to it must be reviewed exactly as carefully as widening an RLS policy. It NEVER returns a storage path, a signed URL, a raw document payload or a lyric body under any grant — the url column is withheld unconditionally, so an asset is described (type, filename, dimensions, size) but never fetchable from here (custody D-01/D-09, D-40: no grant may become a shortcut around the existing narrow, asset-class-specific accessors). Every returned row is gated by migration 192''s six-hop workspace_project_permission, re-evaluated live on every call with nothing cached.';

CREATE OR REPLACE FUNCTION public.workspace_read_documents(
  p_project_id UUID,
  p_uid UUID
)
RETURNS TABLE (
  id         UUID,
  project_id UUID,
  track_id   UUID,
  type       TEXT,
  status     TEXT,
  signed_at  TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    d.id,
    d.project_id,
    d.track_id,
    d.type,
    d.status,
    d.signed_at
  FROM public.vault_documents d
  WHERE d.project_id = p_project_id
    AND public.workspace_project_permission(p_project_id, p_uid, 'view_summaries')
    AND p_uid = (SELECT auth.uid())
$$;

REVOKE EXECUTE ON FUNCTION public.workspace_read_documents(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.workspace_read_documents(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.workspace_read_documents(uuid, uuid) IS
  'The ONLY path by which a workspace caller reads public.vault_documents as of migration 193 (R-02/WSR-03/WSR-04) — the workspace disjunct was removed from both of vault_documents'' RLS policies in this same migration, and their preserved project_id IS NULL owner fallback is untouched. THE DECLARED RETURN COLUMN LIST IS THE SECURITY CONTRACT: a caller cannot request anything outside it, and adding a column to it must be reviewed exactly as carefully as widening an RLS policy. It returns the EXISTENCE and LIFECYCLE STATE of a document (which type, pending/signed/verified, when signed) and nothing of its content: it NEVER returns a storage path, a signed URL, a raw document payload or a lyric body under any grant — document_data, file_url, signed_by, the verification fields and the e-sign completion claim token are all withheld unconditionally (custody D-01/D-09, D-40). Every returned row is gated by migration 192''s six-hop workspace_project_permission, re-evaluated live on every call with nothing cached.';

CREATE OR REPLACE FUNCTION public.workspace_read_tool_outputs(
  p_project_id UUID,
  p_uid UUID
)
RETURNS TABLE (
  id         UUID,
  project_id UUID,
  tool_slug  TEXT,
  title      TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    o.id,
    o.project_id,
    o.tool_slug,
    o.title,
    o.created_at,
    o.updated_at
  FROM public.tool_outputs o
  WHERE o.project_id = p_project_id
    AND public.workspace_project_permission(p_project_id, p_uid, 'view_summaries')
    AND p_uid = (SELECT auth.uid())
$$;

REVOKE EXECUTE ON FUNCTION public.workspace_read_tool_outputs(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.workspace_read_tool_outputs(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.workspace_read_tool_outputs(uuid, uuid) IS
  'The ONLY path by which a workspace caller reads public.tool_outputs as of migration 193 (R-02/WSR-03/WSR-04) — the workspace disjunct was removed from both of tool_outputs'' RLS policies in this same migration, and their preserved project_id IS NULL owner fallback is untouched. THE DECLARED RETURN COLUMN LIST IS THE SECURITY CONTRACT: a caller cannot request anything outside it, and adding a column to it must be reviewed exactly as carefully as widening an RLS policy. It returns that a tool was run and when (slug, title, timestamps) and nothing of what was run or produced: it NEVER returns a storage path, a signed URL, a raw document payload or a lyric body under any grant — the inputs and output JSON columns are withheld unconditionally, because a pitch draft or a metadata export payload can restate exactly the material the other three allowlists withhold (custody D-01/D-09, D-40). Every returned row is gated by migration 192''s six-hop workspace_project_permission, re-evaluated live on every call with nothing cached.';

-- ─── (d) Schema-cache reload ───────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
