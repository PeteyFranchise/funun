-- 237_split_sheets_executed_immutability.sql
--
-- Pass 6 C-4: an initiator can rewrite or delete an EXECUTED split sheet.
--
-- Migration 018:52-53 created the table with an implicit FOR ALL policy:
--
--   CREATE POLICY "Initiator manages split sheet" ON split_sheets
--     USING (auth.uid() = initiator_user_id) WITH CHECK (auth.uid() = initiator_user_id);
--
-- No command list, so it covers SELECT, INSERT, UPDATE and DELETE. It was
-- written when `status` could only be draft / pending_approval / approved /
-- countered. Migration 062:137 later added **'esign_pending' and
-- 'executed'** and the policy was never revisited.
--
-- So the initiator can today change or delete `status` (including
-- 'executed'), `all_approved_at`, `track_id`, `vault_project_id`, `work_id`,
-- the song identity and the entire parent row -- AFTER other parties have
-- approved or signed. Deleting it can cascade to or detach the evidence
-- hanging off it.
--
-- WHY THIS ONE IS LOW RISK -- the write inventory, verified
--
-- Every status-advancing write to split_sheets already goes through the
-- SERVICE client, not the user's:
--
--   approve/[token]/route.ts:236        service -> 'countered'
--   works/route.ts:126                  service    INSERT
--   split-sheets/[id]/attach:135        service    origin/link fields
--   split-sheets/[id]/mint-envelope:514 service -> 'esign_pending'
--   split-sheets/[id]/void:119          service    reset
--   webhooks/docuseal                   service -> 'executed'
--
-- The two authenticated paths are narrow and already correct:
--
--   split-sheets/route.ts:126-135   INSERT, always status 'draft'
--   split-sheets/[id]/route.ts:311  UPDATE scoped `.eq('initiator_user_id', user.id)`,
--                                   writing only song_name, vault_project_id,
--                                   a few sheet fields, status (gated by
--                                   isAllowedStatusTransition) and
--                                   last_change_summary
--   split-sheets/[id]/route.ts:364  DELETE, already refuses unless status='draft'
--
-- The application therefore already enforces most of what follows. PostgREST
-- bypasses all of it. This migration moves those rules into the database,
-- where a direct call cannot route around them.
--
-- NULL DISCIPLINE -- see migration 234. No bare `=` against a nullable value
-- is used in any boolean that gates a RAISE.

-- ─── (1) The executed-sheet guard ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.split_sheets_guard_execution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT := (SELECT auth.role());
  v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role';
  -- status is NOT NULL (018), so this comparison cannot be NULL. Stated
  -- explicitly because migration 233's defect was exactly an unexamined
  -- assumption that a comparison could not yield NULL.
  v_was_locked BOOLEAN := OLD.status IN ('esign_pending', 'executed');
BEGIN
  IF v_privileged THEN
    RETURN NEW;
  END IF;

  -- A sheet that has gone out for signature, or come back executed, is
  -- evidence. The only legitimate ways out are mint-envelope and void, both
  -- of which run as the service role and are unaffected by this branch.
  IF v_was_locked THEN
    RAISE EXCEPTION 'split_sheets: a sheet with status % cannot be changed by a client; void it through the void endpoint instead', OLD.status
      USING ERRCODE = '42501';
  END IF;

  IF NEW.initiator_user_id IS DISTINCT FROM OLD.initiator_user_id THEN
    RAISE EXCEPTION 'split_sheets.initiator_user_id cannot be reassigned by a client'
      USING ERRCODE = '42501';
  END IF;

  -- Set by the approval fan-out (approve/[token], service). A client that
  -- can write it can claim every party approved.
  IF NEW.all_approved_at IS DISTINCT FROM OLD.all_approved_at THEN
    RAISE EXCEPTION 'split_sheets.all_approved_at records that every party approved and is written only by the approval flow'
      USING ERRCODE = '42501';
  END IF;

  -- Attachment to a track or a work is performed by attach/detach, both
  -- service-side. Re-pointing an approved sheet at a different song would
  -- move agreed splits onto work the parties never agreed to.
  IF NEW.track_id IS DISTINCT FROM OLD.track_id
     OR NEW.work_id IS DISTINCT FROM OLD.work_id THEN
    RAISE EXCEPTION 'split_sheets: track_id and work_id are set by the attach and detach endpoints, not by a direct write'
      USING ERRCODE = '42501';
  END IF;

  -- 'esign_pending' is minted by mint-envelope and 'executed' by the
  -- DocuSeal webhook -- both service-side, both backed by an envelope. A
  -- client asserting either would be claiming a signature that does not
  -- exist.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('esign_pending', 'executed') THEN
    RAISE EXCEPTION 'split_sheets: status % is established by the e-sign flow and cannot be set directly', NEW.status
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.split_sheets_guard_execution() IS
  'BEFORE UPDATE guard on public.split_sheets (migration 237) closing Pass 6 C-4. Refuses every client write to a sheet already at esign_pending or executed, and on any other sheet refuses changes to initiator_user_id, all_approved_at, track_id and work_id, and refuses a client setting status to esign_pending or executed. Migration 018''s implicit FOR ALL policy predates migration 062 adding those two statuses and was never revisited; the application already enforced these rules but PostgREST bypassed them.';

REVOKE EXECUTE ON FUNCTION public.split_sheets_guard_execution() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS split_sheets_guard_execution ON public.split_sheets;

CREATE TRIGGER split_sheets_guard_execution
  BEFORE UPDATE ON public.split_sheets
  FOR EACH ROW
  EXECUTE FUNCTION public.split_sheets_guard_execution();

COMMENT ON TRIGGER split_sheets_guard_execution ON public.split_sheets IS
  'Enforces migration 237''s executed-sheet immutability. Fires before migration 079''s AFTER UPDATE OF status, vault_project_id membership fan-out, so a refused write never reaches the fan-out.';

-- ─── (2) Replace the implicit FOR ALL with per-command policies ───────────
--
-- IMPORTANT: 018's policy had no command list, so it also granted the
-- initiator SELECT. An explicit SELECT policy is therefore recreated below
-- -- dropping the FOR ALL without it would take the initiator's read access
-- away and break every split-sheet screen they own.
--
-- 018's separate "Parties can view split sheets" policy is untouched; parties
-- keep their read path.
--
-- DELETE encodes the application's own existing rule
-- (split-sheets/[id]/route.ts:364): a draft may be removed, anything further
-- along may not. Expressed in RLS rather than the trigger because a DELETE
-- policy can read the row's status directly.

DROP POLICY IF EXISTS "Initiator manages split sheet" ON public.split_sheets;

CREATE POLICY "split_sheets_select_initiator" ON public.split_sheets
  FOR SELECT TO authenticated
  USING (initiator_user_id = (SELECT auth.uid()));

CREATE POLICY "split_sheets_insert_initiator_draft" ON public.split_sheets
  FOR INSERT TO authenticated
  WITH CHECK (
    initiator_user_id = (SELECT auth.uid())
    AND status = 'draft'
    AND all_approved_at IS NULL
  );

CREATE POLICY "split_sheets_update_initiator_unlocked" ON public.split_sheets
  FOR UPDATE TO authenticated
  USING (
    initiator_user_id = (SELECT auth.uid())
    AND status NOT IN ('esign_pending', 'executed')
  )
  WITH CHECK (initiator_user_id = (SELECT auth.uid()));

CREATE POLICY "split_sheets_delete_initiator_draft_only" ON public.split_sheets
  FOR DELETE TO authenticated
  USING (
    initiator_user_id = (SELECT auth.uid())
    AND status = 'draft'
  );

NOTIFY pgrst, 'reload schema';

-- ─── OWNER-RUN BEHAVIORAL VERIFICATION ────────────────────────────────────
--
-- Needs one sheet at status 'executed' (or 'esign_pending') and one at
-- 'draft', both initiated by the test user. If production has no executed
-- sheet yet, create one inside the probe transaction as service_role and
-- roll it back.
--
--   P1  MUST FAIL 42501      -- initiator edits song_name on an EXECUTED sheet
--   P2  MUST FAIL 42501      -- initiator sets status='draft' on an EXECUTED sheet
--   P3  MUST FAIL 42501      -- initiator sets all_approved_at on a draft
--   P4  MUST FAIL 42501      -- initiator sets status='executed' on a draft
--   P5  MUST FAIL (0 rows)   -- initiator DELETEs an EXECUTED sheet
--   P6  MUST SUCCEED         -- initiator edits song_name on a DRAFT
--   P7  MUST SUCCEED         -- initiator DELETEs a DRAFT
--   P8  MUST SUCCEED         -- initiator SELECTs their own sheet (proves the
--                               recreated SELECT policy did not lose read access)
--   P9  MUST SUCCEED         -- service_role sets status='executed'
--
-- P8 exists because this migration drops a FOR ALL policy that was silently
-- providing SELECT. Forgetting to recreate it would not raise anything --
-- rows would simply stop appearing, which is the quietest possible
-- regression and the one most likely to reach a user before it reaches us.
