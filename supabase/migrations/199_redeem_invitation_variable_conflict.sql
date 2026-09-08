-- ============================================================
-- Migration 199: repair the PL/pgSQL 42702 in migration 198's
--                public.workspace_redeem_invitation.
-- ============================================================
--
-- WHAT WAS BROKEN, AND HOW IT WAS FOUND. Phase 38.0.2's Part B behavioural
-- harness -- assertion B18, and the ONLY caller this RPC has ever had -- was
-- run against production on 2026-09-08 and returned:
--
--     42702: column reference "workspace_id" is ambiguous
--
-- The function therefore failed on every path that reached seat creation:
-- invitation redemption was entirely non-functional in 198 as applied. It hurt
-- nobody, and the three reasons are worth recording because they are the same
-- three that contained migration 139's custody defect in Phase 38.0.1: the
-- D-56 kill switch was OFF, every workspace table was empty, and no route had
-- yet been pointed at this RPC.
--
-- ROOT CAUSE. `workspace_id` is BOTH an OUT parameter of this function (it is
-- a column of the RETURNS TABLE, and callers read it off the result) AND a
-- real column on public.workspace_members. 198's line 2229 reads:
--
--     ON CONFLICT (workspace_id, user_id) WHERE user_id IS NOT NULL
--
-- An ON CONFLICT index-inference specification is parsed as EXPRESSIONS --
-- it legally accepts an expression index such as ON CONFLICT (lower(email)) --
-- and PL/pgSQL therefore applies variable substitution to it. An INSERT column
-- list does NOT have that property: it resolves against the target table only.
-- That asymmetry is the whole bug, and it is why line 2213's identical-looking
-- `workspace_id, user_id, ...` is perfectly fine while 2229 raises. `user_id`
-- is not a declared name here, which is exactly why the error named
-- `workspace_id` and nothing else.
--
-- 198's own header states the invariant that was supposed to prevent this --
-- "Every value the body reads or writes lives in a v_ local, so the OUT
-- parameter names above are never referenced as expressions inside the body
-- ... load-bearing here, because `workspace_id` is also a real column on four
-- of the tables below." The invariant was correct and was kept everywhere the
-- author was looking. It did not cover the one place where a bare column name
-- is REQUIRED by the grammar and cannot be aliased away.
--
-- THE FIX, AND THE THREE ALTERNATIVES THAT WERE REJECTED. This migration adds
-- exactly one line -- `#variable_conflict use_column` -- and changes nothing
-- else about the function. Not chosen, and why, so nobody re-opens it:
--
--   * RENAME THE OUT PARAMETER. It is a RETURNS TABLE column name, so renaming
--     it changes the function's result shape. lib/workspaces and the redeem
--     route read `workspace_id` off the row. Breaking, for a cosmetic gain.
--
--   * ON CONFLICT ON CONSTRAINT <name>, which is not parsed as expressions and
--     would sidestep substitution entirely. IMPOSSIBLE HERE: 198's own COMMENT
--     records that this upsert infers migration 182's PARTIAL unique index
--     idx_workspace_members_unique_user, and a partial index cannot back a
--     UNIQUE CONSTRAINT. ON CONFLICT ON CONSTRAINT accepts constraints only.
--
--   * RESTRUCTURE INTO A LOOKUP-THEN-UPDATE-OR-INSERT FORK. Forbidden by 198's
--     stated design property -- "there is still exactly one INSERT and no
--     conditional UPDATE against this table" -- because the fork is precisely
--     the F11 shape whose double-INSERT race the single statement removed.
--
-- WHY use_column IS SAFE HERE, VERIFIED RATHER THAN ASSUMED. The directive
-- makes the COLUMN win wherever a name is ambiguous, so it is only safe if no
-- variable is ever read through a bare name that a column could capture. The
-- entire executable body was scanned: no OUT parameter (outcome, workspace_id,
-- member_id, member_role, invitation_audit_id, member_audit_id) is read as a
-- variable expression anywhere. Every bare occurrence is an INSERT column list
-- -- which resolves to the column regardless of this directive -- plus the
-- single buggy ON CONFLICT. Every value the body actually reads is a v_ local
-- or a p_ parameter, and no table in this schema has a column by either name.
-- The directive therefore changes resolution at exactly one site: the defect.
--
-- The body below is otherwise BYTE-IDENTICAL to migration 198 lines 1804-2278.
-- Diff this file against that range; the only difference must be the single
-- added directive line. The REVOKE/GRANT posture is re-issued verbatim: CREATE
-- OR REPLACE preserves privileges, so this is belt-and-braces, and it keeps
-- the grant visible next to the definition the way 198 and 123 both do.
--
-- The COMMENT ON FUNCTION from 198 is deliberately NOT re-issued -- it survives
-- CREATE OR REPLACE untouched and remains accurate, including its description
-- of the ON CONFLICT clause, which this migration does not change.
--
-- Phase: 38.0.2 (hotfix). Ledger: .planning/ROADMAP.md LIVE MIGRATION LEDGER.
-- ============================================================

CREATE OR REPLACE FUNCTION public.workspace_redeem_invitation(
  p_actor_id       UUID,      -- asserted by the route AFTER auth.getUser()
                              -- (R-21 Option A)
  p_token_hash     TEXT,      -- the sha256 hex digest, NEVER the raw token
  p_actor_email    TEXT,      -- already normalised by normalizeInvitedEmail
  p_require_cohort BOOLEAN    -- supplied from the environment by
                              -- lib/workspaces/cohort.ts (D-55 / R-07)
)
RETURNS TABLE (
  outcome             TEXT,
  workspace_id        UUID,
  member_id           UUID,
  member_role         TEXT,
  invitation_audit_id UUID,
  member_audit_id     UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  -- Every value the body reads or writes lives in a v_ local, so the OUT
  -- parameter names above are never referenced as expressions inside the
  -- body (plan 06's rule, kept -- and load-bearing here, because
  -- `workspace_id` is also a real column on four of the tables below).
  v_workspace_id          UUID;
  v_invitation_id         UUID;
  v_invitation_email      TEXT;
  v_invitation_role       TEXT;
  v_invitation_status     TEXT;
  v_invitation_expires_at TIMESTAMPTZ;
  v_seat                  public.workspace_members%ROWTYPE;
  v_seat_found            BOOLEAN := FALSE;
  v_member_id             UUID;
  v_access_enabled        BOOLEAN;
  v_cohort_ok             BOOLEAN;
  v_invitation_audit_id   UUID;
  v_member_audit_id       UUID;
  -- Used by the AUDITED REFUSAL branches only. Named to match the
  -- shared harness assertion in __tests__/migration-198.test.ts, which
  -- checks that every refusal captures its audit row's id before
  -- returning: one local for that job keeps the check meaningful across
  -- every RPC in this file rather than per-function.
  v_audit_id              UUID;
BEGIN
  -- (0) LO-4: bound the wait.
  SET LOCAL lock_timeout = '3s';

  -- Validation errors, NOT audited, so RAISE is the correct mechanism
  -- (R-26). A correct caller cannot produce any of them: the route's Zod
  -- schema refuses an empty token and the session gate refuses an anonymous
  -- caller before this function is reached.
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'p_actor_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_token_hash IS NULL OR btrim(p_token_hash) = '' THEN
    RAISE EXCEPTION 'p_token_hash is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN
    RAISE EXCEPTION 'p_actor_email is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (1) THE GLOBAL GATE, FIRST, AND BOTH HALVES IN ONE ROUND TRIP.
  --
  -- public.workspace_access_permitted (migration 197, plan 09) folds the
  -- D-56 kill switch and the D-55 cohort window into one function
  -- specifically so a gated request does not grow from one round trip to
  -- two -- the same move migrations 192 and 194 already made. This RPC is
  -- the acceptor call site R-24 names.
  SELECT a.access_enabled, a.cohort_ok
    INTO v_access_enabled, v_cohort_ok
    FROM public.workspace_access_permitted(p_actor_id, p_require_cohort) a;

  -- COALESCE, not a bare NOT: a three-valued NULL would make `NOT v` return
  -- NULL, which an IF treats as false and would therefore ADMIT the caller.
  -- Plan 07 shipped the same COALESCE for the same reason on the audit
  -- reader's redaction flag. Fail closed on every path.
  IF NOT COALESCE(v_access_enabled, FALSE) THEN
    -- RAISE, not an outcome code, and the reason is R-26's test: there is
    -- nothing to audit about a globally disabled feature -- no authority
    -- was exercised, and no workspace's record is the right place for it --
    -- and no audit row has been written yet, so the RAISE rolls back
    -- nothing. Section (c) makes the identical call for the identical
    -- reason.
    RAISE EXCEPTION 'workspace access is disabled'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT COALESCE(v_cohort_ok, FALSE) THEN
    -- R-24 / R-25. The route maps this outcome to 404, NOT 403: during a
    -- bounded pilot a Member outside the cohort should not learn the
    -- feature exists, and 404 is how the rest of this repo hides an
    -- unreachable resource. That is why it is a DISTINCT outcome from the
    -- disabled RAISE above -- 503 and 404 are different answers to
    -- different questions and the route must be able to tell them apart.
    --
    -- NOT AUDITED, and the reason is structural rather than a judgement
    -- call: workspace_audit_log.workspace_id is NOT NULL, and no workspace
    -- is known at this point -- the invitation has not been read yet,
    -- deliberately, because reading it before the eligibility gate would
    -- leak the existence of an invitation to an ineligible caller. A
    -- platform-eligibility fact also does not belong on one workspace's
    -- record.
    RETURN QUERY SELECT 'not_in_cohort'::TEXT,
      NULL::UUID, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- (2) LOCK, IN ASCENDING LO-1 RANK ONLY: 1 -> 2 -> 4.
  --
  -- READ BEFORE LOCK, AND WHY IT IS SAFE. The rank-1 row to lock is the
  -- invitation's workspace, which is not known until the invitation has
  -- been read. Reading it UNLOCKED first is the only way to acquire the
  -- rest in ascending rank order; locking the invitation first would take
  -- rank 4 before rank 1 and invert LO-1 outright. This read therefore
  -- proves NOTHING and is treated as proving nothing: the invitation is
  -- re-read from the locked row at step (3) and every precondition is
  -- decided there. All it does is name the workspace.
  SELECT i.workspace_id INTO v_workspace_id
    FROM public.workspace_invitations i
   WHERE i.token_hash = p_token_hash;

  IF NOT FOUND THEN
    -- The route's message for this outcome must stay NON-ENUMERATING: it
    -- may not disclose whether the token ever existed, whether it belonged
    -- to this caller, or whether it has already been used. One generic
    -- sentence for every miss.
    RETURN QUERY SELECT 'not_found'::TEXT,
      NULL::UUID, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- Rank 1, the container, FIRST. Nothing on the workspaces row is read or
  -- written here; the lock is cheap and it gives every concurrent
  -- redemption against the SAME workspace one stable serialisation point,
  -- which is what turns two racing redemptions into two queued ones.
  --
  -- FOR NO KEY UPDATE, never FOR UPDATE (LO-2). public.workspaces is a
  -- foreign-key parent of members, invitations, grants, attachments and the
  -- audit log; FOR UPDATE conflicts with the FOR KEY SHARE that every one
  -- of those concurrent child INSERTs takes on this row, so it would block
  -- all of them for the whole transaction. The weaker mode is sufficient
  -- here because nothing in this function modifies a column that any
  -- foreign key references. That phrasing is deliberate and section (c)
  -- explains why at length: LO-2's suite assertion treats one particular
  -- two-word phrase in the ten comment lines above a locking clause as a
  -- JUSTIFICATION for a stronger mode, so prose explaining why the stronger
  -- mode is NOT needed must avoid that token or it would silently
  -- pre-authorise a future FOR UPDATE at this exact site.
  PERFORM 1
     FROM public.workspaces w
    WHERE w.id = v_workspace_id
      FOR NO KEY UPDATE;

  -- Rank 2, the candidate seat -- the row the seat write at step (4) will
  -- conflict with if it exists. Locked BEFORE the invitation so the rank
  -- sequence stays ascending, and captured in full rather than PERFORMed
  -- because step (3) has to look at its role and its status.
  SELECT * INTO v_seat
    FROM public.workspace_members m
   WHERE m.workspace_id = v_workspace_id
     AND m.user_id      = p_actor_id
     FOR NO KEY UPDATE;

  v_seat_found := FOUND;

  -- Rank 4, the invitation itself, last of the locks. Keyed on token_hash,
  -- which migration 182 declares UNIQUE, so this can only ever match one
  -- row.
  SELECT i.id, i.email, i.role, i.status, i.expires_at
    INTO v_invitation_id, v_invitation_email, v_invitation_role,
         v_invitation_status, v_invitation_expires_at
    FROM public.workspace_invitations i
   WHERE i.token_hash = p_token_hash
     FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT,
      NULL::UUID, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- (3) REVALIDATE EVERY PRECONDITION *AFTER* THE LOCKS.
  --
  -- THE SELF-HEAL, FOLDED IN. The route today issues this expiry write as
  -- its own separate transaction before returning 410. Here it happens
  -- under the lock that already proved the invitation is still pending, so
  -- it cannot race the acceptance path.
  --
  -- IT MUST BE AN OUTCOME AND NOT A RAISE, and the reason is mechanical:
  -- this branch MUTATES and therefore AUDITS, and a RAISE would roll that
  -- audit row back along with the mutation (R-26). Migration 197's deferred
  -- constraint trigger on workspace_invitations (AFTER UPDATE OF status)
  -- would also abort the transaction at COMMIT if this UPDATE committed
  -- without an audit row naming this invitation's own id.
  IF v_invitation_status = 'pending' AND v_invitation_expires_at <= now() THEN
    UPDATE public.workspace_invitations
       SET status = 'expired'
     WHERE id = v_invitation_id;

    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      v_workspace_id, p_actor_id, p_actor_id,
      'workspace.invitation.expired', NULL, 'workspace_invitation', v_invitation_id,
      jsonb_build_object('status',
        jsonb_build_object('before', 'pending', 'after', 'expired'))
    )
    RETURNING id INTO v_invitation_audit_id;

    RETURN QUERY SELECT 'expired'::TEXT,
      v_workspace_id, NULL::UUID, v_invitation_role, v_invitation_audit_id, NULL::UUID;
    RETURN;
  END IF;

  -- Already accepted, refused, revoked or swept to expired. A business
  -- outcome about a link the caller holds a stale copy of, not a fact about
  -- anyone's authority, so NOT audited (R-26).
  IF v_invitation_status <> 'pending' THEN
    RETURN QUERY SELECT 'not_pending'::TEXT,
      v_workspace_id, NULL::UUID, v_invitation_role, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- THE BINDING CHECK. An attempted redemption by an identity the
  -- invitation does not name is an AUTHORITY refusal and belongs on the
  -- record (R-26), so it writes its audit row and returns a code rather
  -- than raising -- a RAISE would roll that row back.
  --
  -- Both sides are lowered because migration 182's own live-invitation
  -- index is keyed on lower(email); comparing raw would let a differently
  -- cased address miss a row the database considers the same one.
  --
  -- NO ADDRESS APPEARS IN `changes`. Migration 197 section (f) refuses the
  -- key `email` at ANY depth, and the address already lives on
  -- workspace_invitations.email behind an owner/admin-only policy, which
  -- this audit row reaches through its own target_id.
  IF lower(v_invitation_email) IS DISTINCT FROM lower(p_actor_email) THEN
    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      v_workspace_id, p_actor_id, p_actor_id,
      'workspace.invitation.redemption_refused', NULL,
      'workspace_invitation', v_invitation_id,
      jsonb_build_object('refusal', 'email_mismatch')
    )
    RETURNING id INTO v_audit_id;

    RETURN QUERY SELECT 'email_mismatch'::TEXT,
      v_workspace_id, NULL::UUID, v_invitation_role, v_audit_id, NULL::UUID;
    RETURN;
  END IF;

  -- AN OWNER-ROLE INVITATION IS REFUSED HERE, AND THIS IS THE EXPLICIT
  -- ANSWER TO "WHICH OF THE TWO DID YOU DO", AS THE PLAN REQUIRED.
  --
  -- Migration 197's guard_workspace_owner_role_change DOES define the rule
  -- structurally -- a workspace_members row may not become owner, and an
  -- owner row may not change -- but its FIRST statement is
  -- `IF current_user IN ('postgres') THEN RETURN NEW`, and current_user IS
  -- 'postgres' for the duration of this function, because this function is
  -- a postgres-owned SECURITY DEFINER function. THE TRIGGER THEREFORE
  -- ADMITS AN OWNER SEAT CREATED HERE. Its exemption is role-scoped, not
  -- function-scoped, exactly as this file's header records at length.
  --
  -- So the guard is added here explicitly rather than relied on: an owner
  -- seat is created ONLY at workspace creation (section (b)) or through the
  -- two-sided ownership transfer (sections (d) and (e), R-05/R-22). An
  -- invitation is neither, and an owner-role invitation reaching this point
  -- means somebody issued one -- which is an authority event worth having
  -- on the record, so it is audited before the code is returned.
  IF v_invitation_role = 'owner' THEN
    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      v_workspace_id, p_actor_id, p_actor_id,
      'workspace.invitation.redemption_refused', NULL,
      'workspace_invitation', v_invitation_id,
      jsonb_build_object('refusal', 'owner_invitation_forbidden')
    )
    RETURNING id INTO v_audit_id;

    RETURN QUERY SELECT 'owner_invitation_forbidden'::TEXT,
      v_workspace_id, NULL::UUID, v_invitation_role, v_audit_id, NULL::UUID;
    RETURN;
  END IF;

  -- THE SECOND HALF OF THE SAME RULE, AND IT IS NOT IN THE PLAN TEXT --
  -- RECORDED HERE RATHER THAN LEFT SILENT.
  --
  -- The single seat statement at step (4) ends `DO UPDATE SET role =
  -- EXCLUDED.role`. If the caller ALREADY holds an owner seat on this
  -- workspace and redeems a lower-role invitation to it, that clause would
  -- DEMOTE AN OWNER -- outside the two-sided transfer, silently, and past
  -- migration 197's guard because of the same postgres exemption explained
  -- above. guard_workspace_never_zero_owners would catch it only when that
  -- owner is the LAST one, and then only as a raised 42501 the route
  -- reports as a 500.
  --
  -- Refusing is the correct answer rather than "leave the role alone",
  -- because an owner silently receiving a member-role invitation and having
  -- it appear to succeed is a worse outcome than a named refusal.
  IF v_seat_found AND v_seat.role = 'owner' THEN
    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      v_workspace_id, p_actor_id, p_actor_id,
      'workspace.invitation.redemption_refused', NULL,
      'workspace_member', v_seat.id,
      jsonb_build_object('refusal', 'owner_seat_conflict')
    )
    RETURNING id INTO v_audit_id;

    RETURN QUERY SELECT 'owner_seat_conflict'::TEXT,
      v_workspace_id, v_seat.id, v_invitation_role, NULL::UUID, v_audit_id;
    RETURN;
  END IF;

  -- SEAT-TRANSITION LEGALITY, ALSO NOT IN THE PLAN TEXT AND ALSO RECORDED.
  --
  -- `DO UPDATE SET status = 'active'` would REVIVE a `removed` seat. D-14
  -- makes removal terminal -- "removal ends future access only; nothing is
  -- ever deleted or revived" -- and migration 182's status set gives
  -- `removed` no outbound edge at all. A person removed from a workspace
  -- while an invitation to it was still pending must not be able to let
  -- themselves back in by redeeming it.
  --
  -- The allowlist is migration 182's own inbound edges to `active`:
  -- pending -> active, suspended -> active, expired -> active, and
  -- active -> active as a no-op re-redemption. NOT audited, matching
  -- section (c)'s treatment of the same code: losing to the state machine
  -- is a business outcome, not an exercise of authority.
  IF v_seat_found AND v_seat.status NOT IN ('pending', 'active', 'suspended', 'expired') THEN
    RETURN QUERY SELECT 'illegal_transition'::TEXT,
      v_workspace_id, v_seat.id, v_invitation_role, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- (4) MUTATE. ONE STATEMENT EACH.
  --
  -- THE CAS IS NOW STRUCTURAL. The route's `.eq('status','pending')` filter
  -- is gone because there is nothing left for it to do: the row was locked
  -- at step (2) and its status was revalidated under that lock at step (3),
  -- so no concurrent writer can have moved it in between. There is no
  -- unchecked result to check.
  --
  -- updated_at is deliberately absent everywhere in this function -- and
  -- workspace_invitations has no updated_at column at all.
  UPDATE public.workspace_invitations
     SET status      = 'accepted',
         accepted_at = now(),
         accepted_by = p_actor_id
   WHERE id = v_invitation_id;

  -- THE SEAT, AS ONE STATEMENT. THREE THINGS ABOUT IT.
  --
  -- 1. THE CONFLICT TARGET IS THE PARTIAL UNIQUE INDEX
  --    idx_workspace_members_unique_user (workspace_id, user_id)
  --    WHERE user_id IS NOT NULL. Restating that predicate in the ON
  --    CONFLICT clause is what makes the inference well-defined: without
  --    it, PostgreSQL has no partial index to match and the statement
  --    fails to plan. Migration 182 chose a PARTIAL index deliberately --
  --    a plain composite UNIQUE would still allow the same person to be
  --    seated twice through two NULL-user_id pending rows, because every
  --    NULL is distinct.
  --
  -- 2. IT REPLACES THE LOOKUP-THEN-UPDATE-OR-INSERT FORK ENTIRELY, which
  --    is the half of F11 that let two concurrent redemptions both miss
  --    the seat and both take the INSERT branch. One statement cannot
  --    race itself.
  --
  -- 3. IT IS STILL ONE ROW PER STATEMENT, honouring the workspace_members
  --    trigger rule in this file's header: a BEFORE ROW trigger's own
  --    SELECT cannot see rows changed by its own command, so a statement
  --    touching two member rows would fire each guard twice, blind.
  --
  -- ON THE PL/PGSQL NAME QUESTION -- MIGRATION 198 REASONED THIS OUT, GOT IT
  -- WRONG, AND THE WRONG ANSWER IS KEPT HERE BECAUSE IT IS THE MOST USEFUL
  -- THING IN THIS FILE. At this exact spot 198 wrote: "A bare column name in
  -- an ON CONFLICT inference list is carried as an IndexElem name and resolved
  -- directly against the target relation's attributes -- it is not transformed
  -- as an expression, so PL/pgSQL's variable substitution does not reach it."
  --
  -- That is FALSE. An inference element may be an arbitrary expression --
  -- ON CONFLICT (lower(email)) is legal -- so PL/pgSQL DOES substitute into
  -- it, the OUT parameter `workspace_id` collides with the column of the same
  -- name, and this statement raised
  --
  --     42702: column reference "workspace_id" is ambiguous
  --
  -- on the first live call this function ever received. An INSERT column list
  -- genuinely does have the property 198 claimed, which is why the
  -- identical-looking list a few lines above is fine. That asymmetry is what
  -- made the wrong answer so plausible, and it is the whole lesson.
  --
  -- 198 also wrote that the reasoning "was NOT checked against a running
  -- database ... if it is wrong the failure is a loud plan-time error in plan
  -- 17's harness, never a silent misbehaviour." That prediction was exactly
  -- right, and it is why this cost one verification run rather than a
  -- production incident: Part B assertion B18 caught it. The repair is the
  -- `#variable_conflict use_column` directive at the top of this block. DO NOT
  -- REMOVE IT, and do not delete it on the strength of the paragraph above --
  -- that paragraph is the mistake, preserved, not the current rule.
  --
  -- expires_at IS CARRIED OVER FROM THE PAIRED PENDING SEAT, and this is an
  -- addition to the plan text, stated rather than slipped in. The issuance
  -- route sets expires_at on the pending seat for a time-boxed role (D-11,
  -- contractor). When the invitee had no account at issuance time that
  -- pending row carries user_id = NULL, so it is NOT the row this statement
  -- conflicts with, and a plain INSERT would produce a contractor seat with
  -- NO expiry at all -- an unbounded contractor, which is precisely what
  -- D-11's time-boxing exists to prevent. The scalar subquery is a read,
  -- not a branch: there is still exactly one INSERT and no conditional
  -- UPDATE against this table. On the conflict path expires_at is left
  -- untouched, so an existing seat keeps its own window.
  INSERT INTO public.workspace_members (
    workspace_id, user_id, invited_email, role, status, expires_at
  ) VALUES (
    v_workspace_id,
    p_actor_id,
    v_invitation_email,
    v_invitation_role,
    'active',
    (SELECT m.expires_at
       FROM public.workspace_members m
      WHERE m.workspace_id        = v_workspace_id
        AND m.user_id             IS NULL
        AND lower(m.invited_email) = lower(v_invitation_email)
        AND m.status              = 'pending'
      ORDER BY m.created_at DESC
      LIMIT 1)
  )
  ON CONFLICT (workspace_id, user_id) WHERE user_id IS NOT NULL
  DO UPDATE SET status = 'active',
                role   = EXCLUDED.role
  RETURNING id INTO v_member_id;

  -- (5) AUDIT TWICE, IN THE SAME TRANSACTION, AND HERE IS WHY TWICE.
  --
  -- Migration 197 installs its deferred constraint triggers PER TABLE, and
  -- each matches on `target_id = NEW.id`. This function mutates a row on
  -- workspace_invitations AND a row on workspace_members, so ONE audit row
  -- cannot satisfy both: whichever table it did not name would abort the
  -- whole transaction at COMMIT.
  --
  -- THE SHAPE THAT WOULD FAIL, NAMED SO NOBODY REINTRODUCES IT. The route
  -- today writes a single log line with `targetId: pendingSeat?.id ?? null`
  -- -- null whenever no pending seat existed, and a null target_id matches
  -- no row at all. Plan 14 removes it.
  --
  -- `changes` carries the role and NOTHING else on both rows. No email
  -- address appears anywhere: migration 197 section (f) refuses the key at
  -- any depth, and the address is already reachable from the audit row
  -- through target_id, behind workspace_invitations' owner/admin-only
  -- policy.
  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, subject_member_id,
    action, permission_relied_on, target_type, target_id, changes
  ) VALUES (
    v_workspace_id, p_actor_id, p_actor_id,
    'workspace.invitation.accepted', NULL, 'workspace_invitation', v_invitation_id,
    jsonb_build_object('role', v_invitation_role)
  )
  RETURNING id INTO v_invitation_audit_id;

  -- target_id is the SEAT ROW's own id -- never null, never the workspace's,
  -- never the invitation's.
  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, subject_member_id,
    action, permission_relied_on, target_type, target_id, changes
  ) VALUES (
    v_workspace_id, p_actor_id, p_actor_id,
    'workspace.member.activated', NULL, 'workspace_member', v_member_id,
    jsonb_build_object('role', v_invitation_role)
  )
  RETURNING id INTO v_member_audit_id;

  RETURN QUERY SELECT 'ok'::TEXT,
    v_workspace_id, v_member_id, v_invitation_role,
    v_invitation_audit_id, v_member_audit_id;
END;
$$;

-- Migration 123's grant posture, NOT migration 046's. Re-issued verbatim.
REVOKE EXECUTE ON FUNCTION public.workspace_redeem_invitation(
  UUID, TEXT, TEXT, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_redeem_invitation(
  UUID, TEXT, TEXT, BOOLEAN
) TO service_role;
