-- 242_collaboration_surface_lockdown.sql
--
-- Pass 6's medium findings, second and final instalment: works, tool_outputs,
-- collaborator_invites and pitches. Held back from migration 240 because each
-- needed a judgement about what a collaborator may legitimately change, and
-- that judgement had to come from reading the routes rather than the finding.
--
-- Reading them changed two of the four conclusions.
--
-- ═══ (1) works — Pass 6 named the wrong exposure, and missed a worse one ══
--
-- Pass 6: "any work member can rewrite title, primary performer, vocal state
-- and working-version selection."
--
-- That is TRUE and it is INTENDED. app/api/works/[workId]/route.ts:32-37
-- resolves access at the 'contribute' tier on purpose, and the working-take
-- route does the same (versions/[versionId]/route.ts:24). Collaborative
-- songwriting is the product; a co-writer retitling the song or marking it
-- instrumental is the feature, not a breach. Restricting it would be
-- reversing a shipped product decision under cover of a security fix, so
-- nothing here touches those four columns.
--
-- What Pass 6 did NOT name is the actual hole. migration 136:199-208:
--
--   CREATE POLICY "works_update_owner_or_member" ON public.works
--     FOR UPDATE ... WITH CHECK ((SELECT auth.uid()) = user_id OR ...)
--
-- The WITH CHECK is satisfied when the NEW row's user_id equals the caller.
-- So any work member can set user_id to themselves and the policy approves it:
-- **a collaborator can take ownership of someone else's work.** Everything
-- downstream reads works.user_id as the authority — graduation, the owner's
-- work_members row, is_work_owner() — so this is the strongest claim in the
-- table and the one thing no client should ever write.
--
-- graduated_project_id is deliberately NOT touched: migration 172:16-28
-- already guards it with an owner-only rule, a decision made in that
-- migration's own terms, and re-litigating it here would be scope creep.

CREATE OR REPLACE FUNCTION public.works_guard_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT := (SELECT auth.role());
  v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role';
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id AND NOT v_privileged THEN
    RAISE EXCEPTION 'works.user_id is the work''s ownership and cannot be reassigned by a client; everything downstream reads it as the authority'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.works_guard_ownership() IS
  'BEFORE UPDATE guard on public.works (migration 242). Migration 136''s works_update_owner_or_member WITH CHECK is satisfied by `auth.uid() = user_id` on the NEW row, so any work member could set user_id to themselves and take ownership. Title, vocal_state, primary_performer and working_version_id are deliberately NOT guarded: the routes resolve those at the contribute tier on purpose, and a co-writer changing them is the product working. graduated_project_id stays with migration 172''s owner-only guard.';

REVOKE EXECUTE ON FUNCTION public.works_guard_ownership() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS works_guard_ownership ON public.works;
CREATE TRIGGER works_guard_ownership
  BEFORE UPDATE ON public.works
  FOR EACH ROW
  EXECUTE FUNCTION public.works_guard_ownership();

-- ═══ (2) tool_outputs — provenance, written once ══════════════════════════
--
-- Migration 193:245-246 is FOR ALL to owner, co-owner and editor. The row
-- records which tool ran, with what input, and what came back.
--
-- Verified writers: app/api/tools/[slug]/route.ts and
-- app/api/vault/[projectId]/documents/generate/route.ts:150 -- both INSERT.
-- No UPDATE and no DELETE exists anywhere in app/ or lib/. So the FOR ALL
-- grants two operations nobody uses, over a record whose whole value is being
-- an accurate account of what the tool did.

DROP POLICY IF EXISTS "tool_outputs_write_project_owner_or_editor" ON public.tool_outputs;

CREATE POLICY "tool_outputs_insert_project_owner_or_editor" ON public.tool_outputs
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_project_owner(project_id, (SELECT auth.uid())))
    OR (SELECT public.project_member_role(project_id, (SELECT auth.uid()))) IN ('co-owner', 'editor')
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
  );

-- ═══ (3) collaborator_invites — the inviter does not get to say it was ════
--         accepted
--
-- Migration 018:122-123 is an implicit FOR ALL keyed on inviting_user_id, so
-- the inviter can write status, accepted_user_id and accepted_at directly --
-- fabricating the claim that a named person accepted their invitation.
--
-- The real lifecycle is written by SECURITY DEFINER functions: migration
-- 157:33, 214:247 and 148:147. Those run as the function owner and are not
-- subject to RLS, so removing the client's UPDATE and DELETE costs nothing.
-- The only app-side write is lib/collaborators/invite.ts:214, an INSERT.

DROP POLICY IF EXISTS "Inviting user manages invites" ON public.collaborator_invites;

CREATE POLICY "collaborator_invites_select_inviter" ON public.collaborator_invites
  FOR SELECT TO authenticated
  USING (inviting_user_id = (SELECT auth.uid()));

CREATE POLICY "collaborator_invites_insert_inviter" ON public.collaborator_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    inviting_user_id = (SELECT auth.uid())
    -- An invitation starts unaccepted. Nothing else is a valid opening state.
    AND status = 'pending'
    AND accepted_user_id IS NULL
    AND accepted_at IS NULL
  );

-- ═══ (4) pitches — the recipient may answer, not rewrite ══════════════════
--
-- Migration 001:257 grants the RECIPIENT `FOR UPDATE` over the whole row, so
-- the person who received a pitch can rewrite who sent it, which project it
-- concerns, and what it said.
--
-- Zero writes to this table exist in app/ or lib/ today (the curator portal
-- reads them). The policy's own name says what it was for -- "Recipients
-- update pitch status" -- so the guard restores the intent the name already
-- claims: the recipient answers, and the pitch itself stays as sent.

CREATE OR REPLACE FUNCTION public.pitches_guard_sent_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT := (SELECT auth.role());
  v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role';
  -- status, viewed_at, responded_at and response_message stay writable --
  -- those ARE the recipient's answer.
  v_changing BOOLEAN :=
       NEW.project_id   IS DISTINCT FROM OLD.project_id
    OR NEW.artist_id    IS DISTINCT FROM OLD.artist_id
    OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
    OR NEW.message      IS DISTINCT FROM OLD.message
    OR NEW.sent_at      IS DISTINCT FROM OLD.sent_at;
BEGIN
  IF v_changing AND NOT v_privileged THEN
    RAISE EXCEPTION 'pitches: a recipient may record their response, but who sent the pitch, what it concerned and what it said stay as sent'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.pitches_guard_sent_content() IS
  'BEFORE UPDATE guard on public.pitches (migration 242). Migration 001''s "Recipients update pitch status" policy actually grants whole-row UPDATE, so the recipient could rewrite the sender, the project and the message. This restores the intent the policy''s own name claims: status, viewed_at, responded_at and response_message are the recipient''s answer and stay writable; everything the artist sent is fixed.';

REVOKE EXECUTE ON FUNCTION public.pitches_guard_sent_content() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pitches_guard_sent_content ON public.pitches;
CREATE TRIGGER pitches_guard_sent_content
  BEFORE UPDATE ON public.pitches
  FOR EACH ROW
  EXECUTE FUNCTION public.pitches_guard_sent_content();

NOTIFY pgrst, 'reload schema';

-- ─── OWNER-RUN BEHAVIORAL VERIFICATION ────────────────────────────────────
--
--   W1  MUST FAIL 42501    -- a work MEMBER sets works.user_id to themselves
--   W2  MUST SUCCEED       -- a contribute member retitles the work
--   W3  MUST SUCCEED       -- a contribute member changes vocal_state
--
--   T1  MUST FAIL (0 rows) -- editor UPDATEs a tool_output
--   T2  MUST FAIL (0 rows) -- editor DELETEs a tool_output
--   T3  MUST SUCCEED       -- owner INSERTs a tool_output
--
--   I1  MUST FAIL (0 rows) -- inviter marks their own invite accepted
--   I2  MUST FAIL (0 rows) -- inviter INSERTs an already-accepted invite
--   I3  MUST SUCCEED       -- inviter INSERTs a pending invite
--   I4  MUST SUCCEED       -- inviter SELECTs their own invites
--
--   P1  MUST FAIL 42501    -- recipient rewrites artist_id or message
--   P2  MUST SUCCEED       -- recipient sets status and response_message
--
-- W2, W3, T3, I3, I4 and P2 are the live-capability probes. W2/W3 matter most:
-- this migration deliberately leaves collaborative editing alone, and a guard
-- that caught it would be reversing a product decision by accident.
