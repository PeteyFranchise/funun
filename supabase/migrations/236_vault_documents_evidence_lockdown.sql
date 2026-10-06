-- 236_vault_documents_evidence_lockdown.sql
--
-- Pass 6 C-3: project EDITORS can fabricate signed legal evidence.
--
-- Migration 193's `vault_documents_write_project_owner_or_editor` is a single
-- FOR ALL policy granting owner, co-owner AND editor whole-row INSERT, UPDATE
-- and DELETE (193:218-229). The row holds `status`, `signed_at`, `signed_by`,
-- `file_url`, `document_data`, the four verification columns and `user_id`.
--
-- Migration 045's status-evidence CHECK only requires appropriately SHAPED
-- evidence -- status='signed' needs a signed_at and a file_url or an esign
-- completion stamp; status='verified' needs a file_url, verification_status
-- and verified_at. A caller who can write those columns can supply all of
-- them. The constraint establishes neither authenticity nor immutability, and
-- was never intended to.
--
-- So an editor can today mark a document signed or verified, replace the
-- referenced file, change the asserted signer, or delete the evidence --
-- making a release appear contract-ready when it is not.
--
-- WHAT THIS MIGRATION DOES, AND THE ONE THING IT DELIBERATELY DOES NOT
--
-- Closed here:
--
--   1. An editor can no longer assert or alter ANY evidence field. status,
--      signed_at, signed_by, file_url, document_data, source, type and the
--      four verification columns become owner/co-owner territory on UPDATE,
--      and an editor can no longer create a row that arrives already signed
--      or verified.
--   2. The four verification columns (verification_status,
--      verification_checks, verification_summary, verified_at) become
--      non-writable on UPDATE by ANY client caller, owner included. They are
--      system-computed output of the contract verifier, and today an owner
--      can hand-set verification_status='verified' on an existing row with a
--      direct PostgREST call. INSERT still carries them because
--      app/api/contracts/verify/route.ts:118-132 legitimately creates a row
--      already verified -- that is the upload-and-verify flow, not a forgery.
--   3. user_id is no longer reassignable by any client caller.
--   4. DELETE drops 'editor'.
--
-- NOT closed here, deliberately and on the record:
--
--   An OWNER can still revert their own signed document to 'pending', which
--   clears signed_at. app/api/vault/[projectId]/documents/[docId]/route.ts:50-52
--   does exactly that today and it is reachable from the UI. It is a real
--   correction path -- "I uploaded the wrong PDF" -- and the honest fix is a
--   supersede model where the old evidence survives as history, not a freeze
--   that leaves users with a wrong document and no way out.
--
--   Closing it properly needs a superseded_by column, UI for superseded
--   state, and a decision about what a reverted document does to readiness.
--   That is a build, not a guard, so it is recorded as a follow-up rather
--   than half-done here:
--   .planning/todos/pending/2026-10-06-vault-documents-supersede-not-revert.md
--
--   Pass 6's headline for C-3 is the EDITOR fabricating evidence, and that is
--   fully closed. An owner rewriting their own document's status is a
--   different and much smaller exposure: it is their own project, their own
--   assertion, and it leaves the audit trail in work_diary_events intact.
--
-- NULL DISCIPLINE -- see migration 234. project_member_role() returns NULL
-- for a non-member; a bare `=` against it yields NULL, and a NULL in an IF
-- condition skips the THEN branch. That is how migration 233's guard came to
-- be inert in production. Every boolean below is forced non-NULL with
-- COALESCE at assignment.

-- ─── (1) The evidence guard ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.vault_documents_guard_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT := (SELECT auth.role());
  v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role';
  v_uid UUID := (SELECT auth.uid());
  -- vault_documents.project_id is NULLABLE (migration 001), and migration
  -- 078's `project_id IS NULL AND user_id = auth.uid()` fallback is preserved
  -- in 186 and 193. A project-less document is a personal document, so its
  -- owner is simply user_id. Both branches are COALESCEd to FALSE.
  v_full_authority BOOLEAN :=
    CASE
      WHEN OLD.project_id IS NULL THEN COALESCE(OLD.user_id = v_uid, FALSE)
      ELSE COALESCE((SELECT public.is_project_owner(OLD.project_id, v_uid)), FALSE)
        OR COALESCE((SELECT public.project_member_role(OLD.project_id, v_uid)) = 'co-owner', FALSE)
    END;
  v_verification_changed BOOLEAN;
  v_evidence_changed BOOLEAN;
BEGIN
  IF v_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'vault_documents.user_id cannot be reassigned by a client'
      USING ERRCODE = '42501';
  END IF;

  -- System-computed verifier output. Non-writable on UPDATE by every client
  -- caller including the owner -- an authentic verification result is
  -- produced by the verifier, never typed in afterwards. Set at INSERT time
  -- by app/api/contracts/verify, which is why this check is UPDATE-only.
  v_verification_changed :=
       NEW.verification_status  IS DISTINCT FROM OLD.verification_status
    OR NEW.verification_checks  IS DISTINCT FROM OLD.verification_checks
    OR NEW.verification_summary IS DISTINCT FROM OLD.verification_summary
    OR NEW.verified_at          IS DISTINCT FROM OLD.verified_at;

  IF v_verification_changed THEN
    RAISE EXCEPTION 'vault_documents: verification_status, verification_checks, verification_summary and verified_at are produced by the contract verifier and cannot be changed by a client after the row exists'
      USING ERRCODE = '42501';
  END IF;

  IF v_full_authority THEN
    RETURN NEW;
  END IF;

  -- Editors (and any other non-owner caller RLS admitted) may touch nothing
  -- that constitutes or points at legal evidence.
  v_evidence_changed :=
       NEW.status        IS DISTINCT FROM OLD.status
    OR NEW.signed_at     IS DISTINCT FROM OLD.signed_at
    OR NEW.signed_by     IS DISTINCT FROM OLD.signed_by
    OR NEW.file_url      IS DISTINCT FROM OLD.file_url
    OR NEW.document_data IS DISTINCT FROM OLD.document_data
    OR NEW.source        IS DISTINCT FROM OLD.source
    OR NEW.type          IS DISTINCT FROM OLD.type
    OR NEW.project_id    IS DISTINCT FROM OLD.project_id
    OR NEW.track_id      IS DISTINCT FROM OLD.track_id;

  IF v_evidence_changed THEN
    RAISE EXCEPTION 'vault_documents: signature and evidence fields can only be written by the document owner or a project co-owner (attempted change to one of status, signed_at, signed_by, file_url, document_data, source, type, project_id, track_id)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.vault_documents_guard_evidence() IS
  'BEFORE UPDATE guard on public.vault_documents (migration 236) closing Pass 6 C-3. Rejects any change to status, signed_at, signed_by, file_url, document_data, source, type, project_id or track_id by a caller who is not the document owner, a project co-owner, the service role, or a direct database session; rejects any UPDATE to the four verifier-produced columns by every client caller including the owner; and rejects reassignment of user_id by any client. Deliberately does NOT stop an owner reverting their own signed document to pending -- that is a live UI correction path and closing it needs a supersede model, tracked in .planning/todos/pending/2026-10-06-vault-documents-supersede-not-revert.md.';

REVOKE EXECUTE ON FUNCTION public.vault_documents_guard_evidence() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS vault_documents_guard_evidence ON public.vault_documents;

CREATE TRIGGER vault_documents_guard_evidence
  BEFORE UPDATE ON public.vault_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.vault_documents_guard_evidence();

COMMENT ON TRIGGER vault_documents_guard_evidence ON public.vault_documents IS
  'Enforces migration 236''s evidence-authority split on vault_documents. Independent of the table''s grant state, unlike migration 230''s column-REVOKE approach which was a silent no-op.';

-- ─── (2) Split the FOR ALL policy ─────────────────────────────────────────
--
-- 193's nullable fallback (`project_id IS NULL AND user_id = auth.uid()`) is
-- preserved verbatim on every branch, as 078, 186 and 193 each preserved it
-- in turn.
--
-- INSERT keeps 193's actor set but adds two constraints: the row must be
-- stamped with the caller's own user_id, and a NON-owner may only create a
-- document at status 'pending'. That second clause is what stops an editor
-- creating a row that arrives already signed or verified -- the UPDATE guard
-- above cannot see an INSERT, so without it the whole protection is one
-- POST away from being bypassed.

DROP POLICY IF EXISTS "vault_documents_write_project_owner_or_editor" ON public.vault_documents;

CREATE POLICY "vault_documents_insert_project_owner_or_editor" ON public.vault_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      (SELECT public.is_project_owner(project_id, (SELECT auth.uid())))
      OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
      OR (
        (SELECT public.project_member_role(project_id, (SELECT auth.uid()))) = 'co-owner'
      )
      OR (
        (SELECT public.project_member_role(project_id, (SELECT auth.uid()))) = 'editor'
        AND COALESCE(status, 'pending') = 'pending'
      )
    )
  );

CREATE POLICY "vault_documents_update_project_owner_or_editor" ON public.vault_documents
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, (SELECT auth.uid())))
    OR (SELECT public.project_member_role(project_id, (SELECT auth.uid()))) IN ('co-owner', 'editor')
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT public.is_project_owner(project_id, (SELECT auth.uid())))
    OR (SELECT public.project_member_role(project_id, (SELECT auth.uid()))) IN ('co-owner', 'editor')
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
  );

CREATE POLICY "vault_documents_delete_project_owner_or_coowner" ON public.vault_documents
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, (SELECT auth.uid())))
    OR (SELECT public.project_member_role(project_id, (SELECT auth.uid()))) = 'co-owner'
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
  );

NOTIFY pgrst, 'reload schema';

-- ─── OWNER-RUN BEHAVIORAL VERIFICATION ────────────────────────────────────
--
--   P1  MUST FAIL 42501 -- editor sets status='signed' on a pending document
--   P2  MUST FAIL 42501 -- editor changes file_url
--   P3  MUST FAIL 42501 -- OWNER hand-sets verification_status='verified'
--   P4  MUST FAIL (0 rows, RLS) -- editor INSERTs a row at status='signed'
--   P5  MUST FAIL (0 rows, RLS) -- editor DELETEs a document
--   P6  MUST SUCCEED -- owner uploads: pending -> signed with signed_at,
--                       file_url, signed_by (the live upload-only e-sign path)
--   P7  MUST SUCCEED -- owner INSERTs a pending document
--   P8  MUST SUCCEED -- service_role writes verification columns
--
-- P6 is the one that matters most. It is the actual product flow
-- (documents/[docId]/upload/route.ts:64-68) and a guard that blocks it would
-- break e-signing for every artist.
