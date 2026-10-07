-- 239_rights_ledger_write_lockdown.sql
--
-- Passes 5 and 7: three rights-bearing tables that migration 136 granted
-- FOR ALL (INSERT, UPDATE, DELETE) to a work's owner or ANY work member,
-- with nothing below the row-level check restricting which columns or which
-- operations that access actually needs.
--
--   136:231-240  work_versions_write_owner_or_member  FOR ALL
--   136:249-258  lyric_blocks_write_owner_or_member   FOR ALL
--   136:267-276  ai_entries_write_owner_or_member     FOR ALL
--
-- What that permits today, by direct PostgREST call under a real member's own
-- JWT, independent of what the Next.js routes choose to send:
--
--   * ai_entries -- the AI-disclosure ledger -- can be rewritten or deleted
--     with no trace. Migration 138's own comment calls the diary row it
--     writes "a row nobody can edit afterwards" (138:324); that is true of
--     the diary event and false of ai_entries itself.
--   * lyric_blocks.author_user_id -- which migration 135:200-207 documents
--     verbatim as "the fact that MOVES SPLITS" -- can be reassigned by any
--     work member to anyone.
--   * work_versions provenance (user_id, source, audio_path, ...) can be
--     rewritten, and any take can be hard-deleted, bypassing migration 163's
--     archive workflow whose own comment says it hides a take "without
--     deleting" (163:34-35).
--
-- Three tables, three mechanisms, each chosen to match how that table's
-- enumerated legitimate writers actually work. Zero behaviour change to any
-- of them.
--
-- ─── TWO CORRECTIONS TO THE PLAN THIS IMPLEMENTS ─────────────────────────
--
-- `.planning/quick/261005-rwl-rights-ledger-write-lockdown/261005-rwl-PLAN.md`
-- was written on 2026-10-05, before migrations 233-238 existed. Two of its
-- claims no longer hold and were corrected here rather than carried forward.
--
-- **1. It numbered this migration 232. That number is a gap, not a vacancy.**
-- The applied sequence runs 230, 231, 233 ... 238; 232 was never created.
-- Introducing a 232 now would place a new migration behind eight already
-- applied to production. This is 239.
--
-- **2. Its central lyric_blocks claim is false.** It states:
--
--     "The ONE legitimate path that changes lyric_blocks.author_user_id /
--      author_kind after row creation is detach_lyric_block_with_text()"
--
-- There are TWO. Migration 161 added accepting a lyric suggestion, which
-- rewrites both columns (161:287-291) after setting the shared GUC to
-- 'suggestion_accept' (161:283) -- not 'detach'. A guard requiring 'detach'
-- alone, as the plan specifies, would have made accepting a lyric suggestion
-- fail with 42501: a live Writer's Room feature broken by a security
-- migration. The authorised set below is therefore
-- ('detach', 'suggestion_accept').
--
-- The plan was right that 145's 'locked_save' and 'restore' paths must NOT be
-- authorised for author changes: both write `text` only (145:271, 145:365)
-- and never touch the author columns, so including them would widen the hole
-- rather than close it.
--
-- ─── NULL DISCIPLINE -- the lesson from migrations 233 and 234 ────────────
--
-- Migration 233 shipped a guard that never fired because an unset GUC made
-- `v_mode = 'literal'` evaluate to NULL, `NOT NULL` is NULL, and PL/pgSQL
-- skips the THEN branch on NULL. Every gating boolean below is forced
-- non-NULL with COALESCE at the point of assignment, matching migration 234's
-- fix and migrations 145/161's own fail-closed `IS NULL OR ... NOT IN (...)`
-- shape.
--
-- ─── WHY TABLE-LEVEL REVOKE IS USED FOR TWO CASES AND NOT THE OTHERS ─────
--
-- Migration 230's `REVOKE INSERT (work_id), UPDATE (work_id) ON tracks` was a
-- silent no-op: a COLUMN-level revoke cannot remove a privilege the role
-- holds at TABLE level. That is a shadowing relationship between two
-- different grant levels.
--
-- A TABLE-level `REVOKE UPDATE, DELETE` has no such relationship -- it
-- removes exactly the privilege that was granted, at the same level. It is
-- used here only for the two unambiguous whole-operation cases (ai_entries
-- UPDATE/DELETE, work_versions DELETE). Every column-scoped protection uses a
-- trigger, following migration 231, which is behaviourally verified.
--
-- The probes at the foot of this file ask production whether the privilege is
-- GONE, not whether the statement ran. That distinction is the entire reason
-- 230's defect survived review.

-- ═══ (1) ai_entries — append-only ═════════════════════════════════════════
--
-- One writer in the whole codebase, and it only INSERTs:
-- app/api/works/[workId]/ai-entries/route.ts exports POST and nothing else;
-- a corpus grep for ai_entries with .update(/.delete(/.upsert( returns zero
-- matches. The only trigger on the table is trg_capture_ai_entry, AFTER
-- INSERT (138:349-352).
--
-- Deliberately NOT decided here: whether a disclosure may later be superseded
-- with history preserved. This closes the live rewrite/delete hole and
-- forecloses nothing -- a future supersede mechanism would be a NEW row
-- carrying a supersedes_entry_id self-reference, which INSERT (untouched)
-- already permits.

REVOKE UPDATE, DELETE ON public.ai_entries FROM authenticated, anon;

DROP POLICY IF EXISTS "ai_entries_write_owner_or_member" ON public.ai_entries;

-- Identical owner-or-member condition to 136:267-276, narrowed from FOR ALL
-- to FOR INSERT. The SELECT policy (136:260-266) is untouched.
CREATE POLICY "ai_entries_insert_owner_or_member" ON public.ai_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_work_owner(work_id, (SELECT auth.uid())))
    OR (SELECT public.work_member_tier(work_id, (SELECT auth.uid()))) IS NOT NULL
  );

-- ═══ (2) lyric_blocks — the two author columns ════════════════════════════
--
-- Column-scoped on purpose. INSERT and DELETE of lyric_blocks rows stay fully
-- available: adding and removing sections is core, constant Writer's Room
-- work (136:165-171, and every shape in blocks/route.ts), so a grant change
-- here would break the product. The table's FOR ALL policy and grants are
-- left exactly as they are; this is a trigger layered on top.
--
-- Verified: no app route can put either column in an UPDATE. Block creation
-- always sets them from the session (blocks/route.ts:188-189, :234-235);
-- the PATCH allowlist carries only block_type/custom_label/performers/
-- vocal_direction; DELETE and the position-renumbering loops touch only
-- `position`.

CREATE OR REPLACE FUNCTION public.lyric_blocks_guard_author_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT := (SELECT auth.role());
  v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role';
  -- current_setting with the no-error flag returns '' for an unset GUC, so ''
  -- and NULL must both mean "no authorised path is in progress".
  v_mode TEXT := NULLIF(current_setting('funun.lyric_text_write', TRUE), '');
  -- COALESCE, not a bare IN: `NULL IN (...)` is NULL, and a NULL here would
  -- propagate into the IF below and disable the guard -- migration 233's
  -- exact defect.
  v_authorised BOOLEAN := COALESCE(v_mode IN ('detach', 'suggestion_accept'), FALSE);
  v_changing BOOLEAN :=
       NEW.author_user_id IS DISTINCT FROM OLD.author_user_id
    OR NEW.author_kind    IS DISTINCT FROM OLD.author_kind;
BEGIN
  IF v_changing AND NOT v_privileged AND NOT v_authorised THEN
    RAISE EXCEPTION 'lyric_blocks.author_user_id and author_kind move splits and can only be rewritten by detach_lyric_block_with_text() or accept_lyric_block_suggestion(), the service role, or a direct database session'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.lyric_blocks_guard_author_write() IS
  'BEFORE UPDATE guard on public.lyric_blocks (migration 239). author_user_id is documented at 135:200-207 as "the fact that MOVES SPLITS"; migration 136''s FOR ALL policy let any work member reassign it. Rejects a change to author_user_id or author_kind unless the transaction-local GUC funun.lyric_text_write is ''detach'' (set by detach_lyric_block_with_text, 145:178) or ''suggestion_accept'' (set by the suggestion-accept function, 161:283) -- the only two paths in the corpus that legitimately rewrite authorship -- or the caller is the service role or a direct database session. 145''s ''locked_save'' and ''restore'' are deliberately NOT authorised: both write text only and never touch these columns. Extends 145''s existing GUC mechanism rather than competing with it; INSERT and DELETE of blocks are untouched because adding and removing sections is core Writer''s Room work.';

REVOKE EXECUTE ON FUNCTION public.lyric_blocks_guard_author_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lyric_blocks_guard_author_write ON public.lyric_blocks;

-- Scoped with UPDATE OF so the guard is not consulted on the far more common
-- text/position writes, and a WHEN clause so a no-op SET of the same value
-- never raises.
CREATE TRIGGER lyric_blocks_guard_author_write
  BEFORE UPDATE OF author_user_id, author_kind ON public.lyric_blocks
  FOR EACH ROW
  WHEN (
    NEW.author_user_id IS DISTINCT FROM OLD.author_user_id
    OR NEW.author_kind IS DISTINCT FROM OLD.author_kind
  )
  EXECUTE FUNCTION public.lyric_blocks_guard_author_write();

-- ═══ (3) work_versions — provenance immutable, no client DELETE ═══════════
--
-- No legitimate DELETE exists anywhere in app/ or lib/ (corpus grep). The
-- archive toggle is the sanctioned way to retire a take (163:6-8) and writes
-- only archived_at/archived_by.
--
-- Every legitimate UPDATE touches label (versions/[versionId]/route.ts:55),
-- peaks once while null (:81), or the archive pair (:109-114). None touches
-- any guarded column, so none can trip the trigger. Both INSERT paths --
-- versions/complete (user_id from the session) and the service-role
-- attach_final_mix passport operation -- are INSERTs, which the UPDATE-only
-- trigger does not see.

REVOKE DELETE ON public.work_versions FROM authenticated, anon;

DROP POLICY IF EXISTS "work_versions_write_owner_or_member" ON public.work_versions;

CREATE POLICY "work_versions_insert_owner_or_member" ON public.work_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_work_owner(work_id, (SELECT auth.uid())))
    OR (SELECT public.work_member_tier(work_id, (SELECT auth.uid()))) IS NOT NULL
  );

CREATE POLICY "work_versions_update_owner_or_member" ON public.work_versions
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_work_owner(work_id, (SELECT auth.uid())))
    OR (SELECT public.work_member_tier(work_id, (SELECT auth.uid()))) IS NOT NULL
  )
  WITH CHECK (
    (SELECT public.is_work_owner(work_id, (SELECT auth.uid())))
    OR (SELECT public.work_member_tier(work_id, (SELECT auth.uid()))) IS NOT NULL
  );

CREATE OR REPLACE FUNCTION public.work_versions_guard_provenance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT := (SELECT auth.role());
  v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role';
  v_changing BOOLEAN :=
       NEW.user_id          IS DISTINCT FROM OLD.user_id
    OR NEW.source           IS DISTINCT FROM OLD.source
    OR NEW.audio_path       IS DISTINCT FROM OLD.audio_path
    OR NEW.audio_ext        IS DISTINCT FROM OLD.audio_ext
    OR NEW.audio_size       IS DISTINCT FROM OLD.audio_size
    OR NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds
    OR NEW.performers       IS DISTINCT FROM OLD.performers
    OR NEW.work_id          IS DISTINCT FROM OLD.work_id;
BEGIN
  IF v_changing AND NOT v_privileged THEN
    RAISE EXCEPTION 'work_versions recording provenance (user_id, source, audio_path, audio_ext, audio_size, duration_seconds, performers, work_id) is fixed at creation and cannot be rewritten by a client; label, peaks and the archive toggle remain writable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.work_versions_guard_provenance() IS
  'BEFORE UPDATE guard on public.work_versions (migration 239). This table is the human-take registry the AI-disclosure "when in doubt" rule depends on to prove a take predates a tool, so its provenance must be fixed at creation. Rejects any client change to user_id, source, audio_path, audio_ext, audio_size, duration_seconds, performers or work_id. label, peaks and archived_at/archived_by stay writable -- those are the only three things the application actually updates. work_id is included because re-pointing a take at a different work would move recording provenance onto a composition it never belonged to.';

REVOKE EXECUTE ON FUNCTION public.work_versions_guard_provenance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS work_versions_guard_provenance ON public.work_versions;

CREATE TRIGGER work_versions_guard_provenance
  BEFORE UPDATE ON public.work_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.work_versions_guard_provenance();

NOTIFY pgrst, 'reload schema';

-- ─── OWNER-RUN BEHAVIORAL VERIFICATION ────────────────────────────────────
--
-- Ask whether the privilege is GONE, not whether the statement ran. Migration
-- 230's REVOKE executed cleanly and removed nothing.
--
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public'
--      and table_name in ('ai_entries','work_versions')
--      and grantee in ('authenticated','anon')
--    order by table_name, grantee, privilege_type;
--
-- Expected: no UPDATE or DELETE row for ai_entries, no DELETE row for
-- work_versions, and SELECT/INSERT still present for both.
--
-- Then, per table, inside a rolled-back transaction as authenticated:
--
--   ai_entries
--     A1  MUST FAIL -- UPDATE an existing entry
--     A2  MUST FAIL -- DELETE an entry
--     A3  MUST SUCCEED -- INSERT a new entry (the one live writer)
--
--   lyric_blocks
--     L1  MUST FAIL 42501 -- UPDATE author_user_id directly
--     L2  MUST SUCCEED -- UPDATE text via the locked_save path
--     L3  MUST SUCCEED -- INSERT a block, then DELETE it
--     L4  MUST SUCCEED -- author change with funun.lyric_text_write='detach'
--     L5  MUST SUCCEED -- author change with 'suggestion_accept'
--
--   work_versions
--     W1  MUST FAIL -- DELETE a take
--     W2  MUST FAIL 42501 -- UPDATE user_id or audio_path
--     W3  MUST SUCCEED -- UPDATE label
--     W4  MUST SUCCEED -- UPDATE archived_at/archived_by
--     W5  MUST SUCCEED -- INSERT a take
--
-- L4 and L5 are the two the plan would have got wrong: L5 in particular
-- exercises the suggestion-accept path the plan's single-'detach' guard would
-- have broken. L2, L3, W3, W4 and A3 are the live product paths -- a guard
-- that blocks any of them is worse than the hole it closes.
