-- ============================================================
-- Phase 38.0.2 — VERIFICATION PART B, PRODUCTION SINGLE-SHOT
--
-- Extends .planning/phases/38.0.1-workspace-authorization-remediation/
--   38.0.1-VERIFY-B-PRODUCTION-SINGLE.sql
-- rather than replacing it (R-30). That file ran cleanly against
-- production on 2026-09-07 and found a bug nothing static could
-- reach. Every safety property of the original is preserved here:
-- the pre-flight guard, the single DO block, the per-assertion
-- subtransactions, the switch-on/switch-off pair, and a teardown
-- that is always reached.
--
-- Seeds fixtures, turns the D-56 kill switch ON, runs the
-- behavioural assertions, drains the deferred-constraint queue,
-- tears down, restores the switch and re-enables every trigger it
-- disabled. ONE paste. ONE statement. The switch is on for about a
-- second.
--
-- ─── WHY THIS EXISTS AT ALL ───────────────────────────────────
-- This repo has NO live-Postgres test harness. Every claim the
-- text-lock suites make is a reading of SQL text, not an
-- observation of a running database. That gap is not theoretical:
-- migration 190's suite was green, its function existed, and the
-- route called it correctly — and custody transfer was still
-- broken in production for a day, because migration 139's
-- differently-named `guard_owner_immutable` also fires on
-- `vault_projects` and refused the sanctioned RPC. Only Part B,
-- executing the real RPC, surfaced it.
--
-- This file is this phase's ONLY behavioural proof.
--
-- ─── WHAT CHANGED FROM 38.0.1's VERSION ───────────────────────
--  1. B3 FLIPS. 38.0.1's Part B recorded a guest reaching an
--     attached project as the per-relationship model working as
--     designed. Under R-20 / WSR-29 a guest must now be REFUSED.
--     Same probe, opposite expectation, history recorded above it.
--  2. B3b IS NEW. The seeded ADMIN must still be admitted. A floor
--     that accidentally excluded EVERYONE would sail through B3
--     alone.
--  3. A seventh identity (007, the INVITEE) and a second project,
--     plus cohort, invitation, custody-transfer and second
--     roster-relationship fixtures.
--  4. Assertions for WSR-07, WSR-08, WSR-09, WSR-10, WSR-11,
--     WSR-12, WSR-13, WSR-16, WSR-18, WSR-19, WSR-23 and WSR-26.
--     WSR-21 is NOT here and cannot be: it is an application-layer
--     rule with no SQL surface. 38.0.2-VALIDATION.md says so
--     rather than borrowing credit from a database check.
--  5. Teardown deletes from TWELVE tables — including the
--     workspace check B28 creates, whose id the RPC allocates —
--     disables the seven triggers this phase installs or relies
--     on, re-enables them, and asserts the re-enable as its own
--     result row.
--
-- ─── WHY THIS IS SAFE TO RUN ON PRODUCTION ────────────────────
--   * Part A's population block gates it: all eleven workspace
--     tables must read zero before this file is run.
--   * The guard below ABORTS if workspaces, workspace_members,
--     workspace_invitations or workspace_audit_log is non-empty,
--     so if a beta user has created a workspace since Part A this
--     refuses to run rather than seeding into live data.
--   * The whole thing is ONE DO block = ONE statement = ONE
--     transaction. If ANY step raises, everything rolls back,
--     including the kill-switch flip and every trigger
--     disable/enable. There is no half-applied state.
--   * Every assertion has its own BEGIN ... EXCEPTION
--     subtransaction, so one failure costs one result row rather
--     than the whole result set, and the teardown is still
--     reached.
--
-- ─── THE TWO TEARDOWN HAZARDS THIS PHASE CREATES ──────────────
-- Neither exists in 38.0.1's harness. Either would abort the run.
--
-- HAZARD 1 — THE AUDIT LOG IS NOW APPEND-ONLY TO EVERY ROLE.
-- Migration 197 section (e) installs BEFORE UPDATE OR DELETE (row)
-- and BEFORE TRUNCATE (statement) triggers that raise
-- unconditionally, with NO postgres exemption — deliberately,
-- because nothing legitimately needs to rewrite an audit row.
-- Every RPC this harness calls writes audit rows, and the teardown
-- must remove them or it leaves fixtures in a table Part A asserts
-- is empty. HANDLED: the teardown disables both append-only
-- triggers around the audit cleanup, re-enables them, and check
-- B31 asserts `tgenabled` on both afterwards. This is exactly the
-- limitation migration 197 documents in its own words —
-- "append-only to every application role, not immutable" —
-- demonstrated rather than hidden.
--
-- HAZARD 2 — FOUR DEFERRED CONSTRAINT TRIGGERS FIRE AT COMMIT.
-- Migration 197 section (g) installs `AFTER UPDATE OF <cols> ...
-- DEFERRABLE INITIALLY DEFERRED` constraint triggers on
-- workspace_members, workspace_roster_relationships,
-- workspace_invitations and workspace_custody_transfers. Any DIRECT
-- fixture UPDATE of a consequential column queues an event that
-- demands a matching audit row AT COMMIT.
--
-- HANDLED BY DESIGN, NOT BY DISABLING: **the seed is INSERT-ONLY**,
-- and the constraint triggers are AFTER UPDATE triggers, so nothing
-- in the seed queues an event at all. Every consequential change in
-- the assertion phase goes through the RPCs — which is what the
-- harness is for. THE ASSERTIONS THEREFORE RUN WITH ALL FOUR
-- TRIGGERS ENABLED, which is the only way WSR-13 is actually being
-- tested; check B0 asserts that state before the first assertion
-- runs, and check B31 asserts it again after teardown.
--
-- The queue is then DRAINED at the outer level, before teardown,
-- while the audit rows still exist — see the long comment above
-- check B30. Without that drain the teardown's audit deletions
-- would make every queued assertion fail at COMMIT and take the
-- whole block down.
--
-- ─── D-56 — WHY NO PATH LEAVES THE SWITCH ON ──────────────────
-- The switch is turned ON inside this block and turned OFF again
-- inside the same block. Row 100 proves it. Walked by hand, there
-- are exactly two kinds of statement after the flip:
--   * every assertion is inside its own BEGIN ... EXCEPTION, so it
--     cannot propagate out of the block at all; and
--   * the four statements that are NOT wrapped — the drain at B30,
--     the teardown's DDL, its DELETEs, and the two closing INSERTs
--     — either complete, in which case the explicit
--     `SET enabled = FALSE` immediately above them has already run,
--     or they RAISE, in which case the whole transaction rolls back
--     and the flip to TRUE is undone with everything else.
-- There is no third case. ALTER TABLE ... DISABLE TRIGGER is
-- transactional in PostgreSQL, so the same argument covers the
-- seven triggers the teardown switches off.
--
-- Nothing else in this phase touches the switch, and turning it on
-- for real is a separate, deliberate act that is NOT part of this
-- file.
--
-- Run this ONE statement. Then read the result table.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.zz_verify_b_results (
  ord INT, check_name TEXT, detail TEXT, verdict TEXT, run_at TIMESTAMPTZ DEFAULT now()
);
TRUNCATE public.zz_verify_b_results;

DO $BLOCK$
DECLARE
  -- ─── Identities. 001-006 are 38.0.1's six, unchanged. ─────────
  SUBJECT  UUID := 'ffff0000-0000-0000-0000-000000000001';
  OWNER_   UUID := 'ffff0000-0000-0000-0000-000000000002';
  ADMIN_   UUID := 'ffff0000-0000-0000-0000-000000000003';
  CONTRACT UUID := 'ffff0000-0000-0000-0000-000000000004';
  GUEST    UUID := 'ffff0000-0000-0000-0000-000000000005';
  OUTSIDER UUID := 'ffff0000-0000-0000-0000-000000000006';
  -- NEW: the seventh identity. Holds a valid pending invitation and is
  -- deliberately NOT in workspace_cohorts, so R-24's negative case is real
  -- rather than simulated.
  INVITEE  UUID := 'ffff0000-0000-0000-0000-000000000007';

  PROJ     UUID := 'ffff0000-0000-0000-0000-0000000000a1';
  -- NEW: a second project, so the custody path OUTSIDE any workspace can be
  -- exercised at the same time as the one inside it. The partial unique
  -- index idx_workspace_custody_transfers_one_live_offer allows only one
  -- live offer per project, so two live offers need two projects.
  PROJ2    UUID := 'ffff0000-0000-0000-0000-0000000000a2';
  TRK      UUID := 'ffff0000-0000-0000-0000-0000000000b1';

  WS       UUID := 'ffff0000-0000-0000-0000-0000000000c1';

  MEM_OWN  UUID := 'ffff0000-0000-0000-0000-0000000000d1';
  MEM_ADM  UUID := 'ffff0000-0000-0000-0000-0000000000d2';
  MEM_CON  UUID := 'ffff0000-0000-0000-0000-0000000000d3';
  MEM_GST  UUID := 'ffff0000-0000-0000-0000-0000000000d4';
  -- NEW: the dangling NULL-user_id pending seat paired with the invitation
  -- the revoke assertion revokes. This shape is ACCEPTED by the phase (plan
  -- 14 proved retiring it from route code is impossible once 197 applies),
  -- so the harness exercises the shape that actually exists.
  MEM_PND  UUID := 'ffff0000-0000-0000-0000-0000000000d5';

  REL      UUID := 'ffff0000-0000-0000-0000-0000000000e1';   -- SUBJECT, accepted
  REL2     UUID := 'ffff0000-0000-0000-0000-0000000000e2';   -- OUTSIDER, proposed
  ATT      UUID := 'ffff0000-0000-0000-0000-0000000000f1';
  ROOT     UUID := 'ffff0000-0000-0000-0000-000000000091';
  CHILD    UUID := 'ffff0000-0000-0000-0000-000000000092';

  COH_OWN  UUID := 'ffff0000-0000-0000-0000-000000000071';   -- OWNER_ in cohort
  COH_INV  UUID := 'ffff0000-0000-0000-0000-000000000072';   -- INVITEE, added mid-run

  INV1     UUID := 'ffff0000-0000-0000-0000-000000000081';   -- redeemed by INVITEE
  INV2     UUID := 'ffff0000-0000-0000-0000-000000000082';   -- revoked by OWNER_
  TOK1     TEXT := 'ffff000000000000000000000000000000000000000000000000000000000081';
  TOK2     TEXT := 'ffff000000000000000000000000000000000000000000000000000000000082';
  EMAIL_INV TEXT := 'b-invitee@verify.invalid';
  EMAIL_REV TEXT := 'b-revokee@verify.invalid';

  CT_WS    UUID := 'ffff0000-0000-0000-0000-000000000061';   -- custody, IN a workspace
  CT_NOWS  UUID := 'ffff0000-0000-0000-0000-000000000062';   -- custody, NO workspace

  ok BOOLEAN; n BIGINT; guard BIGINT;
  v_unexpected BOOLEAN;
  v_outcome TEXT; v_outcome2 TEXT;
  v_audit UUID; v_audit2 UUID;
  v_tid UUID; v_tid2 UUID; v_tid3 UUID;
  v_mid UUID; v_mrole TEXT; v_state TEXT; v_state2 TEXT;
  v_role_a TEXT; v_role_b TEXT;
  v_seats INT;
  v_ae BOOLEAN; v_ck BOOLEAN; v_ae2 BOOLEAN; v_ck2 BOOLEAN;
  v_blocks BIGINT; v_audits BIGINT;
  v_uid UUID;
  v_txt TEXT;
  v_ws2 UUID; v_slug2 TEXT;
  v_red BOOLEAN; v_red2 BOOLEAN; v_chg JSONB;
BEGIN
  -- ═══ GUARD: refuse if real workspace data exists ═══════════════
  -- 38.0.1's guard, WIDENED. It checked workspace_members only. This phase
  -- also disables the audit log's append-only triggers during teardown and
  -- deletes audit and invitation rows, so emptiness of those two is now part
  -- of the safety argument rather than a nicety — and 38.0.1's check A9
  -- counted neither.
  SELECT count(*) INTO guard FROM public.workspace_members;
  IF guard > 0 THEN
    RAISE EXCEPTION 'REFUSING: workspace_members has % row(s). Part A saw 0. Real data may exist now — do not seed into it.', guard;
  END IF;

  SELECT count(*) INTO guard FROM public.workspaces;
  IF guard > 0 THEN
    RAISE EXCEPTION 'REFUSING: workspaces has % row(s). Real data may exist now — do not seed into it.', guard;
  END IF;

  SELECT count(*) INTO guard FROM public.workspace_invitations;
  IF guard > 0 THEN
    RAISE EXCEPTION 'REFUSING: workspace_invitations has % row(s). WSR-26''s revoke assumes emptiness and 38.0.1 check A9 never counted this table.', guard;
  END IF;

  SELECT count(*) INTO guard FROM public.workspace_audit_log;
  IF guard > 0 THEN
    RAISE EXCEPTION 'REFUSING: workspace_audit_log has % row(s). This teardown DISABLES the append-only triggers to clean up, which must never happen while real audit rows exist. 38.0.1 check A9 never counted this table.', guard;
  END IF;

  -- Not because the teardown would touch them — it deletes by project id —
  -- but because row 100 counts this table globally, and a pre-existing
  -- Member-to-Member transfer would make a clean run report CHECK MANUALLY.
  -- Part A gives this table a PASS/FAIL verdict for the same reason.
  SELECT count(*) INTO guard FROM public.workspace_custody_transfers;
  IF guard > 0 THEN
    RAISE EXCEPTION 'REFUSING: workspace_custody_transfers has % row(s). Part A expects zero. Investigate before seeding.', guard;
  END IF;

  -- ═══ SEED — INSERT ONLY, DELIBERATELY ══════════════════════════
  -- Not one UPDATE appears below. Migration 197's four deferred constraint
  -- triggers are AFTER UPDATE triggers, so an INSERT-only seed queues no
  -- event and needs no trigger disabled. That is teardown hazard 2's answer:
  -- the seed avoids the constraint rather than switching it off, and every
  -- consequential change in the assertion phase goes through an RPC.
  --
  -- The auth.users INSERT trigger handle_new_user() enforces an invite gate
  -- and raises 'not_invited' for any email with no pending artist_invites row
  -- and no collaborators row. Rather than disabling a trigger in the auth
  -- schema (owned by supabase_auth_admin, so ALTER would likely be refused),
  -- admit these seven through the real front door by seeding invites first.
  INSERT INTO public.artist_invites (email, source, status)
  SELECT e, 'staff', 'pending'
  FROM unnest(ARRAY['b-subject@verify.invalid','b-owner@verify.invalid',
                    'b-admin@verify.invalid','b-contractor@verify.invalid',
                    'b-guest@verify.invalid','b-outsider@verify.invalid',
                    'b-invitee@verify.invalid']) AS e;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u.email, '', now(), now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb
  FROM (VALUES
    (SUBJECT,'b-subject@verify.invalid'), (OWNER_,'b-owner@verify.invalid'),
    (ADMIN_,'b-admin@verify.invalid'),    (CONTRACT,'b-contractor@verify.invalid'),
    (GUEST,'b-guest@verify.invalid'),     (OUTSIDER,'b-outsider@verify.invalid'),
    (INVITEE, EMAIL_INV)
  ) AS u(id,email) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.vault_projects (id,user_id,title,type) VALUES
    (PROJ,  SUBJECT, 'Part B verification project','single'),
    (PROJ2, SUBJECT, 'Part B verification project (no workspace)','single')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.tracks (id,project_id,user_id,title,track_number)
  VALUES (TRK, PROJ, SUBJECT, 'Part B track', 1) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspaces (id,name,slug,workspace_type,roster_enabled,created_by)
  VALUES (WS,'Part B workspace','part-b-verify-ffff0000','management',TRUE,OWNER_)
  ON CONFLICT (id) DO NOTHING;

  -- guard_workspace_member_owner_role_change (197 section (c)) fires BEFORE
  -- INSERT here and returns at its `current_user IN ('postgres')` exemption,
  -- because the SQL editor session IS postgres. That exemption is ROLE-scoped,
  -- not function-scoped, and this seed is one of the things it admits. Check
  -- B14 is what proves the guard still refuses a NON-postgres caller.
  INSERT INTO public.workspace_members (id,workspace_id,user_id,role,status,expires_at) VALUES
   (MEM_OWN,WS,OWNER_,   'owner',     'active',NULL),
   (MEM_ADM,WS,ADMIN_,   'admin',     'active',NULL),
   (MEM_CON,WS,CONTRACT, 'contractor','active', now() - interval '1 day'),
   (MEM_GST,WS,GUEST,    'guest',     'active',NULL)
  ON CONFLICT (id) DO NOTHING;

  -- The dangling pending seat paired with INV2, user_id NULL. Seeded
  -- separately because it carries invited_email and no user.
  INSERT INTO public.workspace_members (id,workspace_id,user_id,invited_email,role,status)
  VALUES (MEM_PND, WS, NULL, EMAIL_REV, 'member', 'pending')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspace_roster_relationships
    (id,workspace_id,member_user_id,state,effective_from,terminates_on,proposed_by)
  VALUES
    (REL, WS,SUBJECT, 'accepted',CURRENT_DATE-1,NULL,OWNER_),
    -- NEW: a `proposed` relationship, for the R-23 block/collapse assertion
    -- and for WSR-18's visibility check. `block` is legal ONLY from
    -- `proposed` (LEGAL_ROSTER_EDGES), so the accepted row above cannot be
    -- used for it.
    (REL2,WS,OUTSIDER,'proposed',NULL,          NULL,OWNER_)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspace_attachments (id,workspace_id,project_id,relationship_id,attached_by)
  VALUES (ATT,WS,PROJ,REL,OWNER_) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspace_grants
    (id,workspace_id,relationship_id,permission,source,parent_grant_id,granted_by)
  VALUES (ROOT,WS,REL,'view_summaries','member_consent',NULL,SUBJECT) ON CONFLICT (id) DO NOTHING;
  -- Project-scoped, not relationship-wide: idx_workspace_grants_unique_live is
  -- UNIQUE on (workspace_id, relationship_id, project_id, permission) NULLS NOT
  -- DISTINCT among live rows, so a child sharing the parent's relationship-wide
  -- scope would collide with it.
  INSERT INTO public.workspace_grants
    (id,workspace_id,relationship_id,project_id,permission,source,parent_grant_id,granted_by)
  VALUES (CHILD,WS,REL,PROJ,'view_summaries','individual',ROOT,OWNER_)
  ON CONFLICT (id) DO NOTHING;

  -- The cohort positive control. Without a row here, R-24's negative case
  -- would be indistinguishable from "the gate refuses everyone", which is the
  -- same mistake B3b exists to prevent on the role floor.
  INSERT INTO public.workspace_cohorts (id, account_user_id, stage, enabled, created_by)
  VALUES (COH_OWN, OWNER_, 'pilot', TRUE, OWNER_) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspace_invitations
    (id, workspace_id, email, role, token_hash, status, expires_at, invited_by)
  VALUES
    (INV1, WS, EMAIL_INV, 'member', TOK1, 'pending', now() + interval '7 days', OWNER_),
    (INV2, WS, EMAIL_REV, 'member', TOK2, 'pending', now() + interval '7 days', OWNER_)
  ON CONFLICT (id) DO NOTHING;

  -- Two custody offers. Migration 187's BEFORE INSERT guard requires
  -- offered_by AND from_user_id to BOTH equal the project's current
  -- custodian — no workspace owner or admin may offer on a Member's behalf —
  -- so both are SUBJECT.
  --
  -- CT_WS carries a workspace. CT_NOWS deliberately does NOT: migration 198
  -- section (i) re-scopes 197's audit assertion with
  -- `WHEN (NEW.workspace_id IS NOT NULL)` precisely because
  -- workspace_audit_log.workspace_id is NOT NULL while
  -- workspace_custody_transfers.workspace_id is nullable. Both paths must be
  -- exercised: they behave differently and both must succeed.
  INSERT INTO public.workspace_custody_transfers
    (id, project_id, from_user_id, to_user_id, offered_by, workspace_id, state)
  VALUES
    (CT_WS,   PROJ,  SUBJECT, OUTSIDER, SUBJECT, WS,   'offered'),
    (CT_NOWS, PROJ2, SUBJECT, OUTSIDER, SUBJECT, NULL, 'offered')
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.workspace_access_config SET enabled = TRUE;   -- switch ON

  -- ═══ B0 — THE ASSERTIONS RUN WITH THE GUARDS ENABLED ═══════════
  -- Stated as a result row rather than assumed. If any of these six were
  -- disabled going in — by a previous aborted run, or by someone debugging —
  -- then WSR-13 and WSR-26 are not being tested at all and every later PASS
  -- on those two would be worthless. `tgenabled`: 'O' = enabled (origin),
  -- 'D' = disabled.
  BEGIN
    SELECT count(*) INTO n FROM pg_trigger t
     WHERE NOT t.tgisinternal AND t.tgenabled <> 'D'
       AND t.tgname IN ('assert_workspace_member_change_audited',
                        'assert_workspace_roster_relationship_change_audited',
                        'assert_workspace_invitation_change_audited',
                        'assert_workspace_custody_transfer_change_audited',
                        'guard_workspace_audit_log_no_row_change',
                        'guard_workspace_audit_log_no_truncate');
    INSERT INTO public.zz_verify_b_results VALUES (0,'B0 guards ENABLED before any assertion', n||' of 6 enabled',
      CASE WHEN n = 6 THEN 'PASS — WSR-13 and WSR-26 are actually under test'
           ELSE '*** FAIL — a guard is disabled; every WSR-13/WSR-26 verdict below is meaningless ***' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (0,'B0 guards ENABLED before any assertion',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  -- ═══ ASSERTIONS ════════════════════════════════════════════════
  -- EACH assertion gets its OWN BEGIN/EXCEPTION block. That matters: a
  -- PL/pgSQL exception block is a subtransaction, so one shared wrapper
  -- rolls back every result row written before the failure. 38.0.1's first
  -- production run lost all eleven verdicts that way and showed only the
  -- abort. An INSERT inside a handler runs after that rollback, in the outer
  -- context, so it survives — which is why each error row is written in the
  -- handler.

  BEGIN
    ok := public.workspace_project_permission(PROJ,OWNER_,'view_summaries');
    INSERT INTO public.zz_verify_b_results VALUES (1,'B1 baseline: owner HAS access','workspace_project_permission',
      CASE WHEN ok THEN 'PASS' ELSE '*** FAIL — baseline broken, later results meaningless ***' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (1,'B1 baseline: owner HAS access',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  BEGIN
    ok := public.workspace_project_permission(PROJ,CONTRACT,'view_summaries');
    INSERT INTO public.zz_verify_b_results VALUES (2,'B2 WSR-17 expired seat refused','contractor active + expires_at past',
      CASE WHEN ok THEN '*** FAIL — EXPIRED SEAT GRANTED ACCESS ***' ELSE 'PASS' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (2,'B2 WSR-17 expired seat refused',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  BEGIN
    INSERT INTO public.zz_verify_b_results VALUES (3,'B2b WSR-17 helper agrees',
      coalesce(public.workspace_member_role(WS,CONTRACT),'(null)'),
      CASE WHEN public.workspace_member_role(WS,CONTRACT) IS NULL THEN 'PASS' ELSE '*** FAIL ***' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (3,'B2b WSR-17 helper agrees',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  -- ── B3 — THE ASSERTION THAT FLIPS. R-20 / WSR-29. ──────────────
  -- HISTORY, RECORDED HONESTLY RATHER THAN QUIETLY REWRITTEN.
  -- 38.0.1's Part B ran this EXACT probe and recorded the guest REACHING the
  -- project as the correct answer: "PASS — membership alone did not grant
  -- access; the grant did", because grants are per-relationship and
  -- workspace_project_permission hop 2 filtered on `status` and `expires_at`
  -- with NO role condition at all. That was a true reading of the model as it
  -- then stood, and it was surfaced to the owner rather than filed as a bug.
  --
  -- On 2026-09-07 the owner decided (R-20) to add a role floor excluding
  -- `guest`: a guest keeps workspace chrome and never reaches a Member's
  -- project data. Owner, admin, member and contractor keep access.
  --
  -- SAME PROBE. OPPOSITE EXPECTATION. If this row FAILS, the floor did not
  -- reach hop 2 — and check B3b below is what stops a floor that reached too
  -- far from passing here by accident.
  BEGIN
    ok := public.workspace_project_permission(PROJ,GUEST,'view_summaries');
    INSERT INTO public.zz_verify_b_results VALUES (4,'B3 WSR-29 guest REFUSED (flipped from 38.0.1)','guest seat, live relationship-wide grant',
      CASE WHEN ok THEN '*** FAIL — GUEST STILL REACHES PROJECT DATA; the R-20 floor is not in hop 2 ***' ELSE 'PASS — guest refused' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (4,'B3 WSR-29 guest REFUSED (flipped from 38.0.1)',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  -- ── B3b — THE FLOOR IS NOT OVER-APPLIED. NEW. ──────────────────
  -- Without this, a floor that accidentally excluded EVERYONE would pass B3
  -- and look like success. The admin holds an active, unexpired, non-owner
  -- seat and must still reach the project through the same grant the guest
  -- was refused on. B3 and B3b must BOTH pass; one without the other means
  -- the floor is either absent or too wide.
  BEGIN
    ok := public.workspace_project_permission(PROJ,ADMIN_,'view_summaries');
    INSERT INTO public.zz_verify_b_results VALUES (5,'B3b WSR-29 floor not over-applied','admin seat, same grant',
      CASE WHEN ok THEN 'PASS — admin still admitted' ELSE '*** FAIL — THE FLOOR EXCLUDES EVERYONE; B3 above is meaningless ***' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (5,'B3b WSR-29 floor not over-applied',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  BEGIN
    ok := public.workspace_project_permission(PROJ,OUTSIDER,'view_summaries');
    INSERT INTO public.zz_verify_b_results VALUES (6,'B4 outsider','no relationship',
      CASE WHEN ok THEN '*** FAIL — outsider granted access ***' ELSE 'PASS' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (6,'B4 outsider',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  BEGIN
    UPDATE public.workspace_grants SET revoked_at = now() WHERE id = ROOT;
    ok := public.workspace_project_permission(PROJ,OWNER_,'view_summaries');
    UPDATE public.workspace_grants SET revoked_at = NULL WHERE id = ROOT;
    INSERT INTO public.zz_verify_b_results VALUES (7,'B5 WSR-02 revoked root kills descendant','root revoked, child live',
      CASE WHEN ok THEN '*** FAIL — descendant survived root revocation ***' ELSE 'PASS' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (7,'B5 WSR-02 revoked root kills descendant',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  BEGIN
    PERFORM public.transfer_vault_project_custody(PROJ, SUBJECT, OUTSIDER);
    ok := public.workspace_project_permission(PROJ,OWNER_,'view_summaries');
    PERFORM public.transfer_vault_project_custody(PROJ, OUTSIDER, SUBJECT);
    INSERT INTO public.zz_verify_b_results VALUES (8,'B6 WSR-06 custody binding','access after custody moved away',
      CASE WHEN ok THEN '*** FAIL — ACCESS SURVIVED CUSTODY TRANSFER ***' ELSE 'PASS' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (8,'B6 WSR-06 custody binding',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',OWNER_::text,'role','authenticated')::text, true);
    SELECT count(*) INTO n FROM public.workspace_read_tracks(PROJ, OWNER_);
    PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO public.zz_verify_b_results VALUES (9,'B8 WSR-04 allowlisted accessor works', n||' rows',
      CASE WHEN n > 0 THEN 'PASS' ELSE '*** FAIL — accessor returned nothing; chain broken ***' END);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO public.zz_verify_b_results VALUES (9,'B8 WSR-04 allowlisted accessor works',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',OUTSIDER::text,'role','authenticated')::text, true);
    SELECT count(*) INTO n FROM public.workspace_read_tracks(PROJ, OWNER_);
    PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO public.zz_verify_b_results VALUES (10,'B9 p_uid impersonation refused',
      'outsider passing owner uuid saw '||n||' rows',
      CASE WHEN n = 0 THEN 'PASS' ELSE '*** FAIL — READ IMPERSONATION STILL POSSIBLE ***' END);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO public.zz_verify_b_results VALUES (10,'B9 p_uid impersonation refused',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  -- B10 must run as `authenticated`, NOT as the editor's `postgres` session.
  -- Migrations 190 and 196 both exempt current_user = 'postgres' so the
  -- SECURITY DEFINER custody RPC can work; a raw UPDATE typed into the SQL
  -- editor therefore inherits that exemption and would SUCCEED, reporting a
  -- false FAIL. The realistic case is the project's own custodian trying to
  -- reassign user_id directly, so impersonate them and drop to the
  -- authenticated role first. RESET ROLE in the handler too, or every later
  -- statement would keep running as authenticated.
  --
  -- ONE CHANGE FROM 38.0.1's VERSION: the unexpected-success path now ROLLS
  -- ITSELF BACK. 38.0.1 recorded the FAIL and left `user_id` moved, which was
  -- harmless there because nothing later depended on it. Here B23 asserts a
  -- real custody accept against this same project, so a silently moved
  -- custodian would corrupt the most important verdict in the file.
  v_unexpected := FALSE;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',SUBJECT::text,'role','authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.vault_projects SET user_id = OUTSIDER WHERE id = PROJ;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    v_unexpected := TRUE;
    RAISE EXCEPTION 'HARNESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    IF v_unexpected THEN
      INSERT INTO public.zz_verify_b_results VALUES (11,'B10 WSR-25 custody immutable (as authenticated)','raw UPDATE succeeded and was rolled back by the harness','*** FAIL — TRIGGER DID NOT BLOCK ***');
    ELSE
      INSERT INTO public.zz_verify_b_results VALUES (11,'B10 WSR-25 custody immutable (as authenticated)', SQLSTATE||': '||left(SQLERRM,80),'PASS — refused');
    END IF;
  END;

  BEGIN
    UPDATE public.workspace_access_config SET enabled = FALSE;
    ok := public.workspace_project_permission(PROJ,OWNER_,'view_summaries');
    UPDATE public.workspace_access_config SET enabled = TRUE;
    INSERT INTO public.zz_verify_b_results VALUES (12,'B12 D-56 disable drill','access while switch OFF',
      CASE WHEN ok THEN '*** FAIL — KILL SWITCH DOES NOT KILL ***' ELSE 'PASS' END);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.workspace_access_config SET enabled = TRUE;
    INSERT INTO public.zz_verify_b_results VALUES (12,'B12 D-56 disable drill',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  -- ══════════════════════════════════════════════════════════════
  -- NEW ASSERTIONS — PHASE 38.0.2
  -- ══════════════════════════════════════════════════════════════

  -- ── B13 — WSR-16 / R-07. THE COHORT GATE, BOTH ANSWERS. ────────
  -- Two booleans, not one, on purpose: the caller must distinguish 503 (the
  -- platform control is off, affecting everybody) from 404 (this Member is
  -- outside the pilot, affecting one account). Collapsing them would make an
  -- incident indistinguishable from an access decision.
  --
  -- Both calls must report access_enabled = TRUE while the switch is on, and
  -- the two cohort answers must DISAGREE — OWNER_ is seeded into the cohort,
  -- INVITEE deliberately is not. A gate that answered the same for both would
  -- be no gate.
  BEGIN
    SELECT a.access_enabled, a.cohort_ok INTO v_ae, v_ck
      FROM public.workspace_access_permitted(OWNER_, TRUE) a;
    SELECT b.access_enabled, b.cohort_ok INTO v_ae2, v_ck2
      FROM public.workspace_access_permitted(INVITEE, TRUE) b;
    INSERT INTO public.zz_verify_b_results VALUES (13,'B13 WSR-16 cohort gate discriminates',
      'owner(enabled='||coalesce(v_ae::text,'null')||',cohort='||coalesce(v_ck::text,'null')
      ||')  invitee(enabled='||coalesce(v_ae2::text,'null')||',cohort='||coalesce(v_ck2::text,'null')||')',
      CASE WHEN v_ae IS TRUE AND v_ae2 IS TRUE AND v_ck IS TRUE AND v_ck2 IS FALSE
           THEN 'PASS — in-cohort admitted, out-of-cohort refused, switch reported ON for both'
           WHEN v_ae IS NOT TRUE OR v_ae2 IS NOT TRUE THEN '*** FAIL — access_enabled wrong while the switch is ON ***'
           WHEN v_ck IS NOT TRUE THEN '*** FAIL — a SEEDED cohort account was refused; the gate admits nobody ***'
           ELSE '*** FAIL — a NON-cohort account was admitted; the pilot bound means nothing ***' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (13,'B13 WSR-16 cohort gate discriminates',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  -- ── B14 — WSR-07. AN ADMIN CANNOT PROMOTE THEMSELVES. ──────────
  -- Through the sanctioned RPC, with the admin as BOTH actor and target.
  -- Expect a REFUSAL OUTCOME, not an exception: R-26 requires authority
  -- refusals to be on the record, and a RAISE would roll back the audit row
  -- written moments earlier in the same transaction. "An admin attempted
  -- self-promotion" is precisely the sentence this phase exists to be able to
  -- show someone later, so the audit row is asserted too.
  --
  -- WHICH CODE COMES BACK IS DECIDED BY BRANCH ORDER in migration 198
  -- section (c): the `p_new_role = 'owner'` branch sits ABOVE the
  -- self-role-change branch, so the expected code is
  -- `promotion_requires_transfer`. `no_self_role_change` would also be a
  -- correct refusal and is accepted here, with the code named in the detail
  -- so a reordering is visible rather than silent.
  BEGIN
    SELECT r.outcome, r.audit_id INTO v_outcome, v_audit
      FROM public.workspace_change_member_role_or_status(
             ADMIN_, WS, MEM_ADM, 'owner'::TEXT,
             NULL::TEXT, NULL::TEXT, NULL::TEXT) r;
    SELECT count(*) INTO v_audits FROM public.workspace_audit_log l
     WHERE l.target_id = MEM_ADM AND l.action = 'workspace.member.change_refused';
    INSERT INTO public.zz_verify_b_results VALUES (14,'B14 WSR-07 admin self-promotion refused AND audited',
      'outcome='||coalesce(v_outcome,'(null)')||'  audit_rows='||v_audits,
      CASE WHEN v_outcome IN ('promotion_requires_transfer','no_self_role_change')
                AND v_audit IS NOT NULL AND v_audits > 0
             THEN 'PASS — refused by outcome code, refusal on the record'
           WHEN v_outcome = 'ok' THEN '*** FAIL — AN ADMIN PROMOTED THEMSELVES TO OWNER ***'
           WHEN v_audit IS NULL THEN '*** FAIL — refused, but the refusal was NOT audited (R-26) ***'
           ELSE '*** FAIL — unexpected outcome code ***' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (14,'B14 WSR-07 admin self-promotion refused AND audited',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR — a RAISE here would have rolled back the audit row (R-26) ***'); END;

  -- ── B14b — WSR-07. THE TRIGGER HOLDS OUTSIDE THE RPC. ──────────
  -- RUN AS service_role, AND THE CHOICE OF ROLE IS THE WHOLE POINT:
  --   * as postgres (the editor's own session) the statement would SUCCEED,
  --     because guard_workspace_owner_role_change's first line is
  --     `IF current_user IN ('postgres') THEN RETURN NEW`. That exemption is
  --     ROLE-scoped, not function-scoped. Testing as postgres reports a false
  --     FAIL.
  --   * as `authenticated` the statement would be refused by the missing
  --     table GRANT (migration 182 section (e)) before the trigger ever ran,
  --     which proves the grant, not the guard. That case is B14c.
  --   * `service_role` holds the grant AND carries BYPASSRLS, so no privilege
  --     and no policy stands in the way. ONLY THE TRIGGER CAN REFUSE IT.
  --     That is the meaningful test, and it is the shape of a future route
  --     that writes the table directly instead of calling the RPC.
  --
  -- THE UNEXPECTED-SUCCESS PATH MUST ROLL ITSELF BACK. If the UPDATE
  -- succeeded it would queue a deferred audit assertion with no audit row,
  -- and that event would abort the WHOLE BLOCK at COMMIT rather than failing
  -- this one check. The RAISE below forces the subtransaction to roll back,
  -- taking the UPDATE and its queued event with it. `v_unexpected` is a
  -- PL/pgSQL variable and is NOT transactional, so it survives the rollback
  -- and tells the handler which case it is looking at.
  v_unexpected := FALSE;
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    UPDATE public.workspace_members SET role = 'owner' WHERE id = MEM_ADM;
    RESET ROLE;
    v_unexpected := TRUE;
    RAISE EXCEPTION 'HARNESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF v_unexpected THEN
      INSERT INTO public.zz_verify_b_results VALUES (15,'B14b WSR-07 direct promotion refused (as service_role)','raw UPDATE succeeded and was rolled back by the harness','*** FAIL — THE OWNER-ROLE TRIGGER DID NOT BLOCK service_role ***');
    ELSE
      INSERT INTO public.zz_verify_b_results VALUES (15,'B14b WSR-07 direct promotion refused (as service_role)', SQLSTATE||': '||left(SQLERRM,90),'PASS — refused');
    END IF;
  END;

  v_unexpected := FALSE;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',ADMIN_::text,'role','authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.workspace_members SET role = 'owner' WHERE id = MEM_ADM;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    v_unexpected := TRUE;
    RAISE EXCEPTION 'HARNESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    IF v_unexpected THEN
      INSERT INTO public.zz_verify_b_results VALUES (16,'B14c WSR-07 direct promotion refused (as authenticated)','raw UPDATE succeeded and was rolled back by the harness','*** FAIL — A SESSION CLIENT CAN WRITE workspace_members ***');
    ELSE
      INSERT INTO public.zz_verify_b_results VALUES (16,'B14c WSR-07 direct promotion refused (as authenticated)', SQLSTATE||': '||left(SQLERRM,90),'PASS — refused (expect 42501 from the missing GRANT, not the trigger)');
    END IF;
  END;

  -- ── B15 — WSR-08 / R-22. OWNERSHIP TRANSFERS. ──────────────────
  -- Nominate, accept, and assert THREE facts in one verdict: the successor
  -- holds `owner`, the nominator holds `admin` (ownership TRANSFERS — the
  -- nominator does NOT remain a second owner), and the workspace still has
  -- exactly ONE active owner.
  --
  -- THE PROMOTE-BEFORE-DEMOTE ORDER IS WHAT THIS PROVES.
  -- guard_workspace_never_zero_owners runs inside the writing transaction and
  -- SEES that transaction's uncommitted writes from earlier statements. In
  -- the reverse order it counts zero remaining owners and raises 42501, and
  -- the entire transfer fails — in production, on a path a person is standing
  -- in front of. No text-lock can distinguish the two orders' behaviour.
  BEGIN
    SELECT r.outcome, r.transfer_id INTO v_outcome, v_tid
      FROM public.workspace_nominate_owner(OWNER_, WS, ADMIN_) r;
    SELECT r2.outcome INTO v_outcome2
      FROM public.workspace_respond_ownership_nomination(ADMIN_, v_tid, 'accept', 'offered') r2;

    SELECT m.role INTO v_role_a FROM public.workspace_members m WHERE m.id = MEM_ADM;
    SELECT m.role INTO v_role_b FROM public.workspace_members m WHERE m.id = MEM_OWN;
    SELECT count(*) INTO n FROM public.workspace_members m
     WHERE m.workspace_id = WS AND m.role = 'owner' AND m.status = 'active'
       AND (m.expires_at IS NULL OR m.expires_at > now());

    INSERT INTO public.zz_verify_b_results VALUES (17,'B15 WSR-08/R-22 ownership TRANSFERS (promote before demote)',
      'nominate='||coalesce(v_outcome,'(null)')||' accept='||coalesce(v_outcome2,'(null)')
      ||' successor='||coalesce(v_role_a,'(null)')||' nominator='||coalesce(v_role_b,'(null)')
      ||' live_owners='||n,
      CASE WHEN v_outcome <> 'ok' THEN '*** FAIL — nomination refused: '||coalesce(v_outcome,'(null)')||' ***'
           WHEN v_outcome2 <> 'ok' THEN '*** FAIL — accept refused: '||coalesce(v_outcome2,'(null)')||' ***'
           WHEN v_role_a <> 'owner' THEN '*** FAIL — successor was not promoted ***'
           WHEN v_role_b <> 'admin' THEN '*** FAIL — nominator kept ownership; this is a COPY, not a TRANSFER (R-22) ***'
           WHEN n <> 1 THEN '*** FAIL — workspace has '||n||' live owners, expected exactly 1 ***'
           ELSE 'PASS — one owner before, one owner after, and it is a different person' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (17,'B15 WSR-08/R-22 ownership TRANSFERS (promote before demote)',SQLSTATE||': '||left(SQLERRM,110),'*** ERROR — 42501 here means the demotion ran before the promotion ***'); END;

  -- Transfer it back, so every later assertion and the teardown see the
  -- roster they were written against. This is also a second, independent
  -- exercise of the same path in the opposite direction.
  BEGIN
    SELECT r.outcome, r.transfer_id INTO v_outcome, v_tid2
      FROM public.workspace_nominate_owner(ADMIN_, WS, OWNER_) r;
    SELECT r2.outcome INTO v_outcome2
      FROM public.workspace_respond_ownership_nomination(OWNER_, v_tid2, 'accept', 'offered') r2;
    SELECT m.role INTO v_role_a FROM public.workspace_members m WHERE m.id = MEM_OWN;
    SELECT m.role INTO v_role_b FROM public.workspace_members m WHERE m.id = MEM_ADM;
    INSERT INTO public.zz_verify_b_results VALUES (18,'B15b WSR-08 transfer BACK (restores the fixture roster)',
      'nominate='||coalesce(v_outcome,'(null)')||' accept='||coalesce(v_outcome2,'(null)')
      ||' owner_seat='||coalesce(v_role_a,'(null)')||' admin_seat='||coalesce(v_role_b,'(null)'),
      CASE WHEN v_outcome = 'ok' AND v_outcome2 = 'ok' AND v_role_a = 'owner' AND v_role_b = 'admin'
           THEN 'PASS — roster restored; the path works in both directions'
           ELSE '*** FAIL — roster NOT restored; every later assertion is suspect ***' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (18,'B15b WSR-08 transfer BACK (restores the fixture roster)',SQLSTATE||': '||left(SQLERRM,110),'*** ERROR — later assertions are suspect ***'); END;

  -- ── B16 — WSR-08b. THE NOMINATOR CANNOT ACCEPT. ────────────────
  -- The F1 attack shape: one person performing both sides of an act D-05 and
  -- D-29 require to be two-sided. Refused inside the RPC (the layer under
  -- test here), refused again by assertMayRespond at the route, and refused a
  -- third time by the diary's own guards. Three layers agreeing is this
  -- repo's doctrine, not deduplication.
  --
  -- Then WITHDRAWN, so the diary carries no live offer into the teardown.
  BEGIN
    SELECT r.outcome, r.transfer_id INTO v_outcome, v_tid3
      FROM public.workspace_nominate_owner(OWNER_, WS, ADMIN_) r;
    SELECT r2.outcome, r2.audit_id INTO v_outcome2, v_audit
      FROM public.workspace_respond_ownership_nomination(OWNER_, v_tid3, 'accept', 'offered') r2;
    SELECT m.role INTO v_role_a FROM public.workspace_members m WHERE m.id = MEM_ADM;
    INSERT INTO public.zz_verify_b_results VALUES (19,'B16 WSR-08b nominator cannot accept their own nomination',
      'nominate='||coalesce(v_outcome,'(null)')||' self_accept='||coalesce(v_outcome2,'(null)')
      ||' successor_role='||coalesce(v_role_a,'(null)')||' audited='||(v_audit IS NOT NULL)::text,
      CASE WHEN v_outcome <> 'ok' THEN '*** FAIL — could not set up the case ***'
           WHEN v_outcome2 = 'ok' OR v_role_a = 'owner'
             THEN '*** FAIL — SELF-DEALING SUCCEEDED; one person performed both sides ***'
           WHEN v_outcome2 <> 'forbidden' THEN '*** FAIL — refused, but with an unexpected code ***'
           WHEN v_audit IS NULL THEN '*** FAIL — refused, but the refusal was NOT audited (R-26) ***'
           ELSE 'PASS — forbidden, and on the record' END);
    -- Leave the diary clean, and exercise the withdraw path while we are here.
    PERFORM 1 FROM public.workspace_respond_ownership_nomination(OWNER_, v_tid3, 'withdraw', 'offered');
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (19,'B16 WSR-08b nominator cannot accept their own nomination',SQLSTATE||': '||left(SQLERRM,110),'*** ERROR ***'); END;

  -- ── B17 — WSR-11 / R-28. THE OWNER FLOOR, INSIDE THE RPC. ──────
  -- The last live owner tries to remove their own seat. The count that
  -- refuses it runs INSIDE the lock and INSIDE the write transaction, which
  -- is precisely what F15's cross-transaction count was not.
  -- guard_workspace_never_zero_owners remains the last line of defence rather
  -- than the primary control, so the caller should see the outcome code
  -- `floor`, NOT a raised 42501 — an exception here would mean the RPC's own
  -- check was skipped and only the trigger caught it.
  BEGIN
    SELECT r.outcome, r.audit_id INTO v_outcome, v_audit
      FROM public.workspace_change_member_role_or_status(
             OWNER_, WS, MEM_OWN, NULL::TEXT, 'removed'::TEXT,
             NULL::TEXT, NULL::TEXT) r;
    SELECT m.status INTO v_state FROM public.workspace_members m WHERE m.id = MEM_OWN;
    INSERT INTO public.zz_verify_b_results VALUES (20,'B17 WSR-11 owner floor refuses the last owner',
      'outcome='||coalesce(v_outcome,'(null)')||' owner_seat_status='||coalesce(v_state,'(null)')
      ||' audited='||(v_audit IS NOT NULL)::text,
      CASE WHEN v_outcome = 'floor' AND v_state = 'active' AND v_audit IS NOT NULL
             THEN 'PASS — refused by outcome code, seat untouched, refusal on the record'
           WHEN v_state <> 'active' THEN '*** FAIL — THE WORKSPACE LOST ITS ONLY OWNER ***'
           WHEN v_outcome <> 'floor' THEN '*** FAIL — refused, but not by the RPC''s own floor check ***'
           ELSE '*** FAIL — refused but not audited (R-26) ***' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (20,'B17 WSR-11 owner floor refuses the last owner',SQLSTATE||': '||left(SQLERRM,110),'*** ERROR — a RAISE means only the trigger caught it; the RPC check was skipped ***'); END;

  -- ── B18 — WSR-10 / R-24. THE COHORT GATE ON THE ACCEPTOR. ──────
  -- Otherwise one cohort owner can pull in unlimited non-cohort Members and
  -- the pilot bound stops meaning anything (F17's shape, one hop removed).
  --
  -- TWO CALLS, BECAUSE ONE PROVES NOTHING. The first must be refused; then a
  -- cohort row is inserted for the same identity and the SAME call must
  -- succeed. That is what shows the GATE was the cause, rather than an
  -- unrelated failure — a bad token, an expired invitation, a mismatched
  -- address — quietly producing the answer the harness wanted.
  BEGIN
    SELECT r.outcome INTO v_outcome
      FROM public.workspace_redeem_invitation(INVITEE, TOK1, EMAIL_INV, TRUE) r;

    INSERT INTO public.workspace_cohorts (id, account_user_id, stage, enabled, created_by)
    VALUES (COH_INV, INVITEE, 'pilot', TRUE, OWNER_) ON CONFLICT (id) DO NOTHING;

    SELECT r2.outcome, r2.member_id, r2.member_role INTO v_outcome2, v_mid, v_mrole
      FROM public.workspace_redeem_invitation(INVITEE, TOK1, EMAIL_INV, TRUE) r2;

    INSERT INTO public.zz_verify_b_results VALUES (21,'B18 WSR-10/R-24 cohort gate binds the ACCEPTOR',
      'before_cohort='||coalesce(v_outcome,'(null)')||' after_cohort='||coalesce(v_outcome2,'(null)')
      ||' seat='||coalesce(v_mrole,'(null)'),
      CASE WHEN v_outcome <> 'not_in_cohort'
             THEN '*** FAIL — a NON-COHORT ACCOUNT WAS ADMITTED BY INVITATION; the pilot bound is bypassable ***'
           WHEN v_outcome2 <> 'ok' THEN '*** FAIL — the in-cohort redemption also failed ('||coalesce(v_outcome2,'(null)')||'), so the first refusal proves nothing ***'
           WHEN v_mid IS NULL OR v_mrole <> 'member' THEN '*** FAIL — redeemed, but no seat was created ***'
           ELSE 'PASS — refused out of cohort, admitted in cohort, seat created' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (21,'B18 WSR-10/R-24 cohort gate binds the ACCEPTOR',SQLSTATE||': '||left(SQLERRM,110),'*** ERROR ***'); END;

  -- ── B19 — WSR-10b. THE REVOKE PATH. NOTHING HAS EXERCISED IT. ──
  -- Plan 14 found that the invitation REVOKE handler still performed TWO
  -- route-side consequential writes, each in its own transaction: the
  -- invitation's `status = 'revoked'` and the paired seat's
  -- `status = 'removed'`. Once migration 197 applies, the first write's audit
  -- row lands in a DIFFERENT transaction and cannot match, and the second had
  -- no audit row written for it at all — so BOTH abort at COMMIT and
  -- INVITATION REVOCATION STOPS WORKING. The fix is
  -- workspace_revoke_invitation, added to migration 198 after plan 11 closed
  -- it. This assertion is the only thing that has ever run it.
  --
  -- Two rows mutate, so TWO audit rows must be written — one naming the
  -- invitation, one naming the seat. A single audit row would abort the whole
  -- transaction at COMMIT on whichever table it did not name.
  BEGIN
    SELECT r.outcome, r.seats_removed, r.invitation_audit_id, r.member_audit_id
      INTO v_outcome, v_seats, v_audit, v_audit2
      FROM public.workspace_revoke_invitation(OWNER_, WS, INV2, 'pending') r;
    SELECT i.status INTO v_state FROM public.workspace_invitations i WHERE i.id = INV2;
    SELECT m.status INTO v_state2 FROM public.workspace_members m WHERE m.id = MEM_PND;
    INSERT INTO public.zz_verify_b_results VALUES (22,'B19 WSR-10b invitation revoke, both rows in one transaction',
      'outcome='||coalesce(v_outcome,'(null)')||' invitation='||coalesce(v_state,'(null)')
      ||' paired_seat='||coalesce(v_state2,'(null)')||' seats_removed='||coalesce(v_seats,-1)
      ||' audits='||(v_audit IS NOT NULL)::text||'/'||(v_audit2 IS NOT NULL)::text,
      CASE WHEN v_outcome <> 'ok' THEN '*** FAIL — revoke refused: '||coalesce(v_outcome,'(null)')||' ***'
           WHEN v_state <> 'revoked' THEN '*** FAIL — invitation not revoked ***'
           WHEN v_state2 <> 'removed' THEN '*** FAIL — DANGLING PENDING SEAT SURVIVED A REVOKED INVITATION ***'
           WHEN v_audit IS NULL OR v_audit2 IS NULL THEN '*** FAIL — a mutated row has no audit row naming it; this aborts at COMMIT ***'
           ELSE 'PASS — invitation revoked, paired seat removed, both audited' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (22,'B19 WSR-10b invitation revoke, both rows in one transaction',SQLSTATE||': '||left(SQLERRM,110),'*** ERROR ***'); END;

  -- ── B20 — WSR-12 / R-23. blocked COLLAPSES TO refused. ─────────
  -- FOUR facts in one verdict, because any one of them failing reopens the
  -- channel T-38-04-05 exists to close:
  --   1. the transition succeeds and the relationship reads `blocked` at the
  --      source of truth;
  --   2. workspace_roster_blocks gained its row IN THE SAME TRANSACTION —
  --      today that upsert is a separate write issued after the state change
  --      has already committed, and assertCanPropose reads THAT table, so a
  --      crash between the two would let the workspace re-propose to a Member
  --      who had just blocked it;
  --   3. the WORKSPACE-facing read reports `refused`, not `blocked`;
  --   4. the MEMBER's own read, through RLS, still reports the TRUE state —
  --      a Member must be able to see their own act.
  --
  -- Fact 4 must run as `authenticated`, or the postgres session bypasses RLS
  -- and the read proves nothing about the policy.
  BEGIN
    SELECT r.outcome, r.new_state INTO v_outcome, v_state
      FROM public.workspace_transition_roster_relationship(
             OUTSIDER, REL2, 'block', 'proposed', 'member') r;

    SELECT count(*) INTO v_blocks FROM public.workspace_roster_blocks b
     WHERE b.workspace_id = WS AND b.member_user_id = OUTSIDER;

    PERFORM set_config('request.jwt.claims', json_build_object('sub',OWNER_::text,'role','authenticated')::text, true);
    SELECT p.state INTO v_state2 FROM public.workspace_roster_page(WS, OWNER_, 50, 0) p WHERE p.id = REL2;
    PERFORM set_config('request.jwt.claims', NULL, true);

    PERFORM set_config('request.jwt.claims', json_build_object('sub',OUTSIDER::text,'role','authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT r2.state INTO v_txt FROM public.workspace_roster_relationships r2 WHERE r2.id = REL2;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);

    INSERT INTO public.zz_verify_b_results VALUES (23,'B20 WSR-12/R-23 block: side effect in-transaction, state collapsed to the workspace',
      'outcome='||coalesce(v_outcome,'(null)')||' new_state='||coalesce(v_state,'(null)')
      ||' block_rows='||v_blocks||' workspace_sees='||coalesce(v_state2,'(null)')
      ||' member_sees='||coalesce(v_txt,'(null)'),
      CASE WHEN v_outcome <> 'ok' THEN '*** FAIL — transition refused: '||coalesce(v_outcome,'(null)')||' ***'
           WHEN v_state <> 'blocked' THEN '*** FAIL — state did not move to blocked ***'
           WHEN v_blocks <> 1 THEN '*** FAIL — NO BLOCK ROW IN THE SAME TRANSACTION; the workspace can re-propose ***'
           WHEN v_state2 IS NULL THEN '*** FAIL — the owner cannot see the row at all; R-12 proposal management is broken ***'
           WHEN v_state2 <> 'refused' THEN '*** FAIL — THE WORKSPACE CAN SEE IT WAS BLOCKED (T-38-04-05) ***'
           WHEN v_txt <> 'blocked' THEN '*** FAIL — the Member cannot see their own block ***'
           ELSE 'PASS — one transaction, workspace sees refused, Member sees blocked' END);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO public.zz_verify_b_results VALUES (23,'B20 WSR-12/R-23 block: side effect in-transaction, state collapsed to the workspace',SQLSTATE||': '||left(SQLERRM,110),'*** ERROR ***'); END;

  -- ── B20b — WSR-12b. THE COMPARE-AND-SET BITES. ─────────────────
  -- The same call, with the same now-stale expectation. It must report
  -- `stale` against the LOCKED row rather than overwriting. Not audited, and
  -- deliberately so (R-26): losing a race is a business outcome about the
  -- caller's stale copy, not a fact about anyone's authority, and a trail
  -- full of stale-CAS rows would bury the refusals that matter.
  BEGIN
    SELECT r.outcome, r.new_state INTO v_outcome, v_state
      FROM public.workspace_transition_roster_relationship(
             OUTSIDER, REL2, 'block', 'proposed', 'member') r;
    SELECT r2.state INTO v_state2 FROM public.workspace_roster_relationships r2 WHERE r2.id = REL2;
    INSERT INTO public.zz_verify_b_results VALUES (24,'B20b WSR-12b compare-and-set refuses the stale second write',
      'outcome='||coalesce(v_outcome,'(null)')||' state_now='||coalesce(v_state2,'(null)'),
      CASE WHEN v_outcome = 'stale' AND v_state2 = 'blocked' THEN 'PASS — stale, and nothing overwritten'
           WHEN v_outcome = 'ok' THEN '*** FAIL — A STALE WRITE WAS ACCEPTED ***'
           ELSE '*** FAIL — unexpected outcome; expected stale ***' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (24,'B20b WSR-12b compare-and-set refuses the stale second write',SQLSTATE||': '||left(SQLERRM,110),'*** ERROR ***'); END;

  -- ── B21 — WSR-18 / R-12. A PROPOSED ROW IS NOT WORKSPACE-WIDE. ─
  -- D-05 says the workspace sees nothing until acceptance. A guest holds a
  -- live seat and must reach NO row of the proposed relationship through the
  -- raw table, while the owner reaches it through workspace_roster_page (B20
  -- fact 3 above already proved that half). Must run as `authenticated` or
  -- RLS does not apply and the read proves nothing.
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',GUEST::text,'role','authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO n FROM public.workspace_roster_relationships r WHERE r.id = REL2;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO public.zz_verify_b_results VALUES (25,'B21 WSR-18 a non-owner seat sees no proposed/blocked row', 'guest saw '||n||' row(s)',
      CASE WHEN n = 0 THEN 'PASS — the policy admits only the named Member and settled accepted/ended rows'
           ELSE '*** FAIL — an ordinary seat reaches a proposed or blocked relationship ***' END);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO public.zz_verify_b_results VALUES (25,'B21 WSR-18 a non-owner seat sees no proposed/blocked row',SQLSTATE||': '||left(SQLERRM,110),'*** ERROR ***'); END;

  -- ── B22 — WSR-09. THE OFFERER MAY NEVER ALSO ACCEPT. ───────────
  -- Run BEFORE the real accept, on the same live offer, so no extra fixture
  -- is needed.
  --
  -- READ THIS VERDICT CAREFULLY. Through the ROUTE this outcome is
  -- unreachable: assertMayRespond refuses everything migration 198 section
  -- (h) refuses, and it refuses it first. THIS HARNESS CALLS THE RPC
  -- DIRECTLY, bypassing that layer entirely, so what it proves is that the
  -- DATABASE layer refuses self-dealing on its own — the two-layers-agree
  -- doctrine, tested from the inside. If this ever came back `ok`, the two
  -- predicates have drifted and the route is the only thing standing between
  -- a Member and a unilateral custody grab.
  BEGIN
    SELECT r.outcome, r.audit_id INTO v_outcome, v_audit
      FROM public.workspace_accept_custody_transfer(SUBJECT, CT_WS, 'accept', 'offered') r;
    SELECT t.state INTO v_state FROM public.workspace_custody_transfers t WHERE t.id = CT_WS;
    INSERT INTO public.zz_verify_b_results VALUES (26,'B22 WSR-09 the offerer cannot accept their own offer (RPC layer)',
      'outcome='||coalesce(v_outcome,'(null)')||' diary_state='||coalesce(v_state,'(null)')
      ||' audited='||(v_audit IS NOT NULL)::text,
      CASE WHEN v_outcome = 'ok' OR v_state <> 'offered'
             THEN '*** FAIL — SELF-DEALING CUSTODY ACCEPT SUCCEEDED AT THE DATABASE LAYER ***'
           WHEN v_outcome <> 'forbidden' THEN '*** FAIL — refused, but with an unexpected code ***'
           WHEN v_audit IS NULL THEN '*** FAIL — refused, but the refusal was NOT audited (R-26) ***'
           ELSE 'PASS — forbidden at the RPC layer, and on the record' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (26,'B22 WSR-09 the offerer cannot accept their own offer (RPC layer)',SQLSTATE||': '||left(SQLERRM,110),'*** ERROR ***'); END;

  -- ══════════════════════════════════════════════════════════════
  -- ── B23 — WSR-09. **THE SINGLE MOST IMPORTANT ASSERTION.** ─────
  --
  -- A REAL CUSTODY ACCEPT MUST SUCCEED.
  --
  -- The nested UPDATE inside transfer_vault_project_custody fires BOTH
  -- vault_projects guards — migration 139's `guard_owner_immutable` (exempted
  -- for this table by migration 196) and migration 190's
  -- `trg_guard_vault_projects_user_id_immutable` — and BOTH must admit it.
  --
  -- NO TEXT-LOCK CAN PROVE THIS. Migration 190's suite was green, its
  -- function existed, and the route called it correctly — and custody
  -- transfer was broken in production for a day, because a differently-NAMED
  -- second trigger also fired and refused the sanctioned RPC. Only executing
  -- the real RPC surfaces that class of failure, and this is the assertion
  -- that would have caught it.
  --
  -- If this row is anything but PASS, the phase is not done, whatever the
  -- test suites say.
  --
  -- THREE facts after ONE call: the diary reads `accepted`,
  -- vault_projects.user_id has actually MOVED, and an audit row naming the
  -- transfer exists. Custody moving without the diary, or the diary moving
  -- without custody, is the split-brain this RPC exists to close.
  -- ══════════════════════════════════════════════════════════════
  BEGIN
    SELECT r.outcome, r.audit_id INTO v_outcome, v_audit
      FROM public.workspace_accept_custody_transfer(OUTSIDER, CT_WS, 'accept', 'offered') r;
    SELECT t.state INTO v_state FROM public.workspace_custody_transfers t WHERE t.id = CT_WS;
    SELECT p.user_id INTO v_uid FROM public.vault_projects p WHERE p.id = PROJ;
    -- FILTERED ON THE ACTION, NOT JUST target_id, AND THAT MATTERS HERE.
    -- B22 already wrote a `custody.transfer.refused` row naming CT_WS, and
    -- every audit row in this transaction shares the same now(), so the
    -- DEFERRED assertion would be satisfied by B22's row alone even if this
    -- accept wrote nothing. The harness must not inherit that leniency.
    SELECT count(*) INTO v_audits FROM public.workspace_audit_log l
     WHERE l.target_id = CT_WS AND l.action = 'custody.transfer.accepted';

    INSERT INTO public.zz_verify_b_results VALUES (27,'B23 WSR-09 *** A REAL CUSTODY ACCEPT *** (in a workspace)',
      'outcome='||coalesce(v_outcome,'(null)')||' diary='||coalesce(v_state,'(null)')
      ||' custodian_moved='||(v_uid = OUTSIDER)::text||' audit_rows='||v_audits,
      CASE WHEN v_outcome <> 'ok' THEN '*** FAIL — THE SANCTIONED CUSTODY RPC WAS REFUSED: '||coalesce(v_outcome,'(null)')||' ***'
           WHEN v_state <> 'accepted' THEN '*** FAIL — custody moved but the diary did not; SPLIT BRAIN ***'
           WHEN v_uid IS DISTINCT FROM OUTSIDER THEN '*** FAIL — the diary moved but CUSTODY DID NOT; SPLIT BRAIN ***'
           WHEN v_audits = 0 THEN '*** FAIL — no audit row; this aborts at COMMIT ***'
           WHEN v_audit IS NULL THEN '*** FAIL — the RPC reported no audit id ***'
           ELSE 'PASS — diary accepted, custody moved, audited, all in one transaction' END);

    -- Move custody back, so the roster relationship's custody bind
    -- (p.user_id = r.member_user_id) holds again for the teardown.
    PERFORM public.transfer_vault_project_custody(PROJ, OUTSIDER, SUBJECT);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (27,'B23 WSR-09 *** A REAL CUSTODY ACCEPT *** (in a workspace)',SQLSTATE||': '||left(SQLERRM,140),'*** ERROR — THIS IS THE 139/196 FAILURE SHAPE. READ THE MESSAGE. ***'); END;

  -- ── B23b — WSR-09 / 198 s(i). CUSTODY WITH workspace_id = NULL. ─
  -- THE OTHER PATH, AND IT BEHAVES DIFFERENTLY. Migration 197 installs the
  -- custody audit assertion UNCONDITIONALLY; migration 198 section (i) drops
  -- and re-creates it with `WHEN (NEW.workspace_id IS NOT NULL)`, because
  -- workspace_audit_log.workspace_id is NOT NULL while
  -- workspace_custody_transfers.workspace_id is NULLABLE. For a transfer
  -- offered outside any workspace NO audit row can be written at all, so
  -- 197's unconditional form would demand a row the schema makes impossible
  -- and EVERY direct Member-to-Member custody accept, decline and withdraw
  -- would abort at COMMIT — the current route included, not only the RPC.
  --
  -- SO: outcome `ok`, custody moved, diary accepted, and audit_id NULL — the
  -- ABSENCE of an audit row is the correct answer here, not a failure. If
  -- this row errors with an integrity violation, 198 section (i) did not land
  -- or landed before 197.
  BEGIN
    SELECT r.outcome, r.audit_id INTO v_outcome, v_audit
      FROM public.workspace_accept_custody_transfer(OUTSIDER, CT_NOWS, 'accept', 'offered') r;
    SELECT t.state INTO v_state FROM public.workspace_custody_transfers t WHERE t.id = CT_NOWS;
    SELECT p.user_id INTO v_uid FROM public.vault_projects p WHERE p.id = PROJ2;
    SELECT count(*) INTO v_audits FROM public.workspace_audit_log l WHERE l.target_id = CT_NOWS;

    INSERT INTO public.zz_verify_b_results VALUES (28,'B23b WSR-09 custody accept OUTSIDE any workspace (198 s(i))',
      'outcome='||coalesce(v_outcome,'(null)')||' diary='||coalesce(v_state,'(null)')
      ||' custodian_moved='||(v_uid = OUTSIDER)::text||' audit_rows='||v_audits||' (0 is correct)',
      CASE WHEN v_outcome <> 'ok' THEN '*** FAIL — refused: '||coalesce(v_outcome,'(null)')||' ***'
           WHEN v_state <> 'accepted' THEN '*** FAIL — diary did not move ***'
           WHEN v_uid IS DISTINCT FROM OUTSIDER THEN '*** FAIL — custody did not move ***'
           WHEN v_audits <> 0 OR v_audit IS NOT NULL
             THEN '*** FAIL — an audit row was written for a transfer with no workspace; workspace_id is NOT NULL on the log ***'
           ELSE 'PASS — moved and committed with no audit row, exactly as 198 s(i) intends' END);

    PERFORM public.transfer_vault_project_custody(PROJ2, OUTSIDER, SUBJECT);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (28,'B23b WSR-09 custody accept OUTSIDE any workspace (198 s(i))',SQLSTATE||': '||left(SQLERRM,140),'*** ERROR — an integrity violation here means 197''s UNCONDITIONAL assertion is still installed ***'); END;

  -- ── B24 — WSR-26. THE AUDIT LOG REFUSES A WRITE. ───────────────
  -- THREE ROLES, THREE ROWS, BECAUSE THEY PROVE DIFFERENT THINGS.
  --
  -- B24 runs as the editor's own `postgres` session. Unlike migrations
  -- 190/196's user_id guards, the append-only trigger has NO postgres
  -- exemption branch — deliberately: a sanctioned RPC legitimately needs to
  -- seat an owner, but NOTHING legitimately needs to rewrite an audit row,
  -- and an exemption here would admit every SECURITY DEFINER function this
  -- phase adds. So this test is meaningful as typed. B24b re-runs it under
  -- `service_role`, which is the role 38.0.1 check A10 caught holding
  -- TRUNCATE, DELETE and UPDATE, and which no policy can constrain because it
  -- carries BYPASSRLS.
  --
  -- Every one of these uses the rollback-on-unexpected-success pattern, so a
  -- write that DID land cannot survive into the teardown.
  v_unexpected := FALSE;
  BEGIN
    UPDATE public.workspace_audit_log SET action = 'tampered' WHERE workspace_id = WS;
    v_unexpected := TRUE;
    RAISE EXCEPTION 'HARNESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF v_unexpected THEN
      INSERT INTO public.zz_verify_b_results VALUES (29,'B24 WSR-26 audit UPDATE refused (as postgres)','UPDATE succeeded and was rolled back by the harness','*** FAIL — THE APPEND-ONLY TRIGGER HAS AN EXEMPTION IT MUST NOT HAVE ***');
    ELSE
      INSERT INTO public.zz_verify_b_results VALUES (29,'B24 WSR-26 audit UPDATE refused (as postgres)', SQLSTATE||': '||left(SQLERRM,90),'PASS — refused');
    END IF;
  END;

  v_unexpected := FALSE;
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    UPDATE public.workspace_audit_log SET action = 'tampered' WHERE workspace_id = WS;
    RESET ROLE;
    v_unexpected := TRUE;
    RAISE EXCEPTION 'HARNESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF v_unexpected THEN
      INSERT INTO public.zz_verify_b_results VALUES (30,'B24b WSR-26 audit UPDATE refused (as service_role)','UPDATE succeeded and was rolled back by the harness','*** FAIL — service_role CAN STILL REWRITE THE AUDIT TRAIL (check A10''s finding is not closed) ***');
    ELSE
      INSERT INTO public.zz_verify_b_results VALUES (30,'B24b WSR-26 audit UPDATE refused (as service_role)', SQLSTATE||': '||left(SQLERRM,90),'PASS — refused');
    END IF;
  END;

  v_unexpected := FALSE;
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    DELETE FROM public.workspace_audit_log WHERE workspace_id = WS;
    RESET ROLE;
    v_unexpected := TRUE;
    RAISE EXCEPTION 'HARNESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF v_unexpected THEN
      INSERT INTO public.zz_verify_b_results VALUES (31,'B24c WSR-26 audit DELETE refused (as service_role)','DELETE succeeded and was rolled back by the harness','*** FAIL — THE AUDIT TRAIL IS ERASABLE ***');
    ELSE
      INSERT INTO public.zz_verify_b_results VALUES (31,'B24c WSR-26 audit DELETE refused (as service_role)', SQLSTATE||': '||left(SQLERRM,90),'PASS — refused');
    END IF;
  END;

  -- TRUNCATE gets its own row because it gets its own TRIGGER. A row-level
  -- trigger DOES NOT FIRE FOR TRUNCATE — there are no rows to fire per — so
  -- without the separate FOR EACH STATEMENT trigger, TRUNCATE walks straight
  -- past B24b/B24c's protection. TRUNCATE is also the one privilege check A10
  -- found on service_role that migration 182's REVOKE never even named.
  v_unexpected := FALSE;
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    EXECUTE 'TRUNCATE public.workspace_audit_log';
    RESET ROLE;
    v_unexpected := TRUE;
    RAISE EXCEPTION 'HARNESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF v_unexpected THEN
      INSERT INTO public.zz_verify_b_results VALUES (32,'B24d WSR-26 audit TRUNCATE refused (as service_role)','TRUNCATE succeeded and was rolled back by the harness','*** FAIL — THE STATEMENT-LEVEL TRIGGER IS MISSING OR ROW-LEVEL ***');
    ELSE
      INSERT INTO public.zz_verify_b_results VALUES (32,'B24d WSR-26 audit TRUNCATE refused (as service_role)', SQLSTATE||': '||left(SQLERRM,90),'PASS — refused');
    END IF;
  END;

  -- ── B25 — WSR-19. THE PII WRITE GUARD, AT DEPTH. ───────────────
  -- A NESTED key is the case a top-level-only operator would miss.
  -- `changes ?| ARRAY['email', ...]` inspects TOP-LEVEL KEYS ONLY, and this
  -- codebase already writes `{"status": {"before": ..., "after": ...}}`
  -- diffs, so a `{"before": {"email": ...}}` payload walks straight past it.
  -- The guard uses the recursive `$.**."key"` member accessor, which matches
  -- at EVERY depth including depth zero — B25b proves the depth-zero half
  -- still works, so a "fix" that traded one for the other would be visible.
  v_unexpected := FALSE;
  BEGIN
    INSERT INTO public.workspace_audit_log
      (id, workspace_id, actor_user_id, subject_member_id, action, target_type, target_id, changes)
    VALUES ('ffff0000-0000-0000-0000-0000000000aa', WS, OWNER_, OWNER_,
            'harness.pii.nested', 'workspace_member', MEM_ADM,
            '{"before": {"email": "leak@verify.invalid"}}'::jsonb);
    v_unexpected := TRUE;
    RAISE EXCEPTION 'HARNESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF v_unexpected THEN
      INSERT INTO public.zz_verify_b_results VALUES (33,'B25 WSR-19 nested restricted key refused','INSERT succeeded and was rolled back by the harness','*** FAIL — A NESTED email KEY REACHED THE AUDIT TRAIL ***');
    ELSE
      INSERT INTO public.zz_verify_b_results VALUES (33,'B25 WSR-19 nested restricted key refused', SQLSTATE||': '||left(SQLERRM,90),'PASS — refused at depth 1');
    END IF;
  END;

  v_unexpected := FALSE;
  BEGIN
    INSERT INTO public.workspace_audit_log
      (id, workspace_id, actor_user_id, subject_member_id, action, target_type, target_id, changes)
    VALUES ('ffff0000-0000-0000-0000-0000000000ab', WS, OWNER_, OWNER_,
            'harness.pii.toplevel', 'workspace_member', MEM_ADM,
            '{"email": "leak@verify.invalid"}'::jsonb);
    v_unexpected := TRUE;
    RAISE EXCEPTION 'HARNESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF v_unexpected THEN
      INSERT INTO public.zz_verify_b_results VALUES (34,'B25b WSR-19 top-level restricted key refused','INSERT succeeded and was rolled back by the harness','*** FAIL — depth-zero is no longer covered ***');
    ELSE
      INSERT INTO public.zz_verify_b_results VALUES (34,'B25b WSR-19 top-level restricted key refused', SQLSTATE||': '||left(SQLERRM,90),'PASS — refused at depth 0');
    END IF;
  END;

  -- ══════════════════════════════════════════════════════════════
  -- ── B26 — WSR-13. AN UNAUDITED CONSEQUENTIAL CHANGE FAILS. ─────
  --
  -- **READ THIS BEFORE CHANGING ANYTHING IN THIS BLOCK.**
  --
  -- This is the ONLY assertion in the file that proves a DEFERRED constraint,
  -- and deferred constraints do NOT behave the way the obvious test assumes.
  --
  -- A DEFERRABLE INITIALLY DEFERRED constraint trigger fires AT COMMIT, NOT
  -- at the end of a PL/pgSQL subtransaction. Writing the UPDATE inside a
  -- BEGIN ... EXCEPTION block and expecting it to abort there would report a
  -- confident false PASS *and* queue an event that takes the WHOLE BLOCK down
  -- at COMMIT — after the teardown, when the audit rows it looks for are
  -- already gone. `SET CONSTRAINTS ALL IMMEDIATE` is what forces the check to
  -- run HERE, where this subtransaction can catch it.
  --
  -- TWO CONSEQUENCES, BOTH STATED RATHER THAN DISCOVERED:
  --   1. `ALL IMMEDIATE` drains EVERY pending deferred event in this
  --      transaction, not only the one just queued. Every RPC above wrote its
  --      audit row, so they all pass; if one had not, this row would report
  --      the wrong cause. B30 below re-drains at the outer level, which is
  --      where a genuine violation from an RPC would surface honestly.
  --   2. On the exception path this subtransaction rolls back, which restores
  --      the UPDATE, the constraint mode AND the previously-drained event
  --      queue. That is why B30 exists at all: the queue must be drained
  --      again, successfully, at the outer level, BEFORE the teardown deletes
  --      the audit rows those events look for.
  --
  -- THE TARGET IS THE GUEST SEAT, chosen because no RPC above wrote an audit
  -- row naming it. The assertion matches on `target_id = NEW.id`, and every
  -- audit row in this transaction shares the same `now()`, so a target that
  -- HAD been audited earlier would satisfy the constraint and report a false
  -- PASS.
  -- ══════════════════════════════════════════════════════════════
  v_unexpected := FALSE;
  BEGIN
    UPDATE public.workspace_members SET status = 'suspended' WHERE id = MEM_GST;
    EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';
    v_unexpected := TRUE;
    RAISE EXCEPTION 'HARNESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF v_unexpected THEN
      INSERT INTO public.zz_verify_b_results VALUES (35,'B26 WSR-13 unaudited consequential change is refused','the UPDATE passed SET CONSTRAINTS ALL IMMEDIATE and was rolled back by the harness','*** FAIL — A CONSEQUENTIAL CHANGE CAN COMMIT WITH NO AUDIT ROW ***');
    ELSE
      INSERT INTO public.zz_verify_b_results VALUES (35,'B26 WSR-13 unaudited consequential change is refused', SQLSTATE||': '||left(SQLERRM,110),'PASS — refused (expect 23000-class: integrity_constraint_violation)');
    END IF;
  END;

  -- ── B27 — WSR-13. THE AUDITED CHANGE IS ADMITTED. ──────────────
  -- The other half, and it is not decoration: a constraint that refused
  -- EVERYTHING would pass B26 and make every RPC in this file impossible.
  -- The RPC-driven mutations above already carry their audit rows, so the
  -- outer drain at B30 is the proof; this row states the expectation so a
  -- reader is not left inferring it.
  BEGIN
    SELECT count(*) INTO v_audits FROM public.workspace_audit_log l WHERE l.workspace_id = WS;
    INSERT INTO public.zz_verify_b_results VALUES (36,'B27 WSR-13 the RPCs wrote their audit rows', v_audits||' audit row(s) for the fixture workspace',
      CASE WHEN v_audits > 0 THEN 'PASS — see B30 for the constraint verdict'
           ELSE '*** FAIL — no RPC wrote an audit row; B26 proves nothing ***' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (36,'B27 WSR-13 the RPCs wrote their audit rows',SQLSTATE||': '||left(SQLERRM,90),'*** ERROR ***'); END;

  -- ══════════════════════════════════════════════════════════════
  -- ── B28 — WSR-23. CAN A WORKSPACE STILL BE CREATED AT ALL? ─────
  --
  -- THE HIGHEST-CONSEQUENCE CARRY-FORWARD IN THE PHASE, and it is a
  -- behavioural question by construction.
  --
  -- Migration 197 section (c) refuses EVERY non-definer INSERT that seats an
  -- `owner`. POST /api/workspaces seats the creator as owner at creation
  -- time. So the moment 197 applies, if workspace_create is not a
  -- postgres-owned SECURITY DEFINER function, NOBODY CAN CREATE A WORKSPACE
  -- AT ALL — and the failure is silent until someone tries. That is why
  -- WSR-23's atomic create is a PREREQUISITE for WSR-07 rather than an
  -- independent hygiene item.
  --
  -- It is also what makes R-15's `created_by` visibility fallback
  -- unnecessary: creation now seats the owner in the SAME transaction as the
  -- container, so there is no window in which a creator holds no membership
  -- row and needs a fallback to see their own workspace. Part A check A9
  -- proves the fallback is gone from the policy; this proves removing it
  -- broke nothing.
  --
  -- Three facts: the RPC returns `ok`, the container exists, and the creator
  -- holds an ACTIVE OWNER SEAT on it.
  BEGIN
    SELECT r.outcome, r.workspace_id, r.slug INTO v_outcome, v_ws2, v_slug2
      FROM public.workspace_create(
             OWNER_, 'Part B created workspace', 'part-b-created-ffff0000',
             'management', TRUE, FALSE, NULL::UUID) r;
    SELECT count(*) INTO n FROM public.workspace_members m
     WHERE m.workspace_id = v_ws2 AND m.user_id = OWNER_
       AND m.role = 'owner' AND m.status = 'active';
    INSERT INTO public.zz_verify_b_results VALUES (37,'B28 WSR-23 atomic workspace creation still works',
      'outcome='||coalesce(v_outcome,'(null)')||' workspace='||coalesce(v_ws2::text,'(null)')
      ||' slug='||coalesce(v_slug2,'(null)')||' owner_seats='||n,
      CASE WHEN v_outcome <> 'ok' THEN '*** FAIL — creation refused: '||coalesce(v_outcome,'(null)')||' ***'
           WHEN v_ws2 IS NULL THEN '*** FAIL — no workspace returned ***'
           WHEN n <> 1 THEN '*** FAIL — NOBODY CAN CREATE A WORKSPACE: 197 s(c) refused the owner seat ***'
           ELSE 'PASS — container and owner seat in one transaction' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (37,'B28 WSR-23 atomic workspace creation still works',SQLSTATE||': '||left(SQLERRM,140),'*** ERROR — 42501 HERE MEANS WORKSPACE CREATION IS DEAD IN PRODUCTION ***'); END;

  -- ── B29 — WSR-19 / R-13 / R-27. THE REDACTED AUDIT READ. ───────
  -- The other half of WSR-19. B25 proves restricted keys cannot be WRITTEN;
  -- this proves what an ordinary seat can READ.
  --
  -- D-50's intent — a workspace can audit itself — is preserved; only the
  -- mechanism changes (R-27). Ordinary members reach the trail through this
  -- redacted definer reader instead of the raw table, and `changes` comes
  -- back as `{}` with `changes_redacted = TRUE`. An owner, an admin, and the
  -- actor or subject of the row itself get the full view.
  --
  -- The GUEST is used as the ordinary seat: not the actor, not the subject,
  -- and role `guest` is not in ('owner','admin'). If the flag comes back
  -- NULL rather than TRUE, the COALESCE that makes the reader fail CLOSED
  -- has been lost — a bare three-way OR returns NULL, not FALSE, for a
  -- seatless caller.
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',GUEST::text,'role','authenticated')::text, true);
    SELECT a.changes_redacted, a.changes INTO v_red, v_chg
      FROM public.workspace_audit_page(WS, GUEST, 5, 0) a LIMIT 1;
    PERFORM set_config('request.jwt.claims', json_build_object('sub',OWNER_::text,'role','authenticated')::text, true);
    SELECT b.changes_redacted INTO v_red2
      FROM public.workspace_audit_page(WS, OWNER_, 5, 0) b LIMIT 1;
    PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO public.zz_verify_b_results VALUES (38,'B29 WSR-19 audit read is redacted by viewer class',
      'guest_redacted='||coalesce(v_red::text,'(null/no row)')||' guest_changes='||coalesce(v_chg::text,'(null)')
      ||' owner_redacted='||coalesce(v_red2::text,'(null/no row)'),
      CASE WHEN v_red IS NULL THEN '*** FAIL — an ordinary seat reached NO audit row; D-50''s workspace-audits-itself read is gone ***'
           WHEN v_red IS NOT TRUE THEN '*** FAIL — AN ORDINARY SEAT SAW THE RAW changes PAYLOAD ***'
           WHEN v_chg IS DISTINCT FROM '{}'::JSONB THEN '*** FAIL — flagged redacted but the payload came through anyway ***'
           WHEN v_red2 IS NULL THEN '*** FAIL — the OWNER reached no audit row at all ***'
           WHEN v_red2 IS NOT FALSE THEN '*** FAIL — the owner''s own view is redacted too; the reader is not viewer-class aware ***'
           ELSE 'PASS — guest redacted, owner full' END);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO public.zz_verify_b_results VALUES (38,'B29 WSR-19 audit read is redacted by viewer class',SQLSTATE||': '||left(SQLERRM,110),'*** ERROR ***'); END;

  -- ══════════════════════════════════════════════════════════════
  -- ── B30 — DRAIN THE DEFERRED QUEUE, AT THE OUTER LEVEL. ────────
  --
  -- DELIBERATELY **NOT** WRAPPED IN A SUBTRANSACTION, and the reason is the
  -- whole design of hazard 2's handling.
  --
  -- Every consequential UPDATE the RPCs performed above queued a deferred
  -- assertion that will fire at COMMIT and look for an audit row naming the
  -- mutated row. The teardown below DELETES those audit rows. So the queue
  -- MUST be drained while they still exist, or a clean run would abort at
  -- COMMIT with an integrity violation caused by nothing but its own cleanup.
  --
  -- If a real WSR-13 violation exists, this statement RAISES and the entire
  -- DO block rolls back — the kill switch, the fixtures, every trigger state
  -- and the result table with it. That is the correct failure: the owner sees
  -- the raised message naming the table and row, NOTHING is left behind, and
  -- the finding is unambiguous. A wrapped version would report a tidy verdict
  -- row and then abort at COMMIT anyway, because a subtransaction rollback
  -- RESTORES the event queue rather than discarding it.
  --
  -- Constraints are deliberately LEFT IMMEDIATE afterwards. The teardown
  -- issues only DELETEs, and these are AFTER UPDATE OF triggers, so nothing
  -- below can fire them — but if a future edit adds an UPDATE to the
  -- teardown, IMMEDIATE makes it fail loudly at the statement rather than
  -- silently at COMMIT.
  -- ══════════════════════════════════════════════════════════════
  EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';

  INSERT INTO public.zz_verify_b_results VALUES (39,'B30 WSR-13 deferred queue drained clean','SET CONSTRAINTS ALL IMMEDIATE returned',
    'PASS — every RPC mutation had its audit row in the same transaction');

  -- ═══ TEARDOWN — ALWAYS REACHED ═════════════════════════════════
  UPDATE public.workspace_access_config SET enabled = FALSE;   -- switch OFF

  -- SEVEN TRIGGERS DISABLED, EVERY ONE OF THEM RE-ENABLED BELOW AND ASSERTED
  -- AT B31.
  --   * guard_workspace_never_zero_owners — 38.0.1's original: deleting the
  --     owner seat would otherwise raise the floor.
  --   * the two append-only guards — HAZARD 1. Nothing, in any role, can
  --     delete an audit row while these are on. This is precisely the
  --     limitation migration 197 states in its own words, demonstrated
  --     rather than hidden: what the three layers buy is "append-only to
  --     every APPLICATION role", not immutability, because the database
  --     owner can disable the triggers and then mutate freely. That bound
  --     must not be overstated in any audit-trail UI copy.
  --   * the four deferred assertions — HAZARD 2. Not strictly required (they
  --     are AFTER UPDATE triggers and the teardown only DELETEs), disabled
  --     anyway so that a future edit adding an UPDATE here cannot silently
  --     queue an event after the drain at B30.
  ALTER TABLE public.workspace_members              DISABLE TRIGGER guard_workspace_never_zero_owners;
  ALTER TABLE public.workspace_audit_log            DISABLE TRIGGER guard_workspace_audit_log_no_row_change;
  ALTER TABLE public.workspace_audit_log            DISABLE TRIGGER guard_workspace_audit_log_no_truncate;
  ALTER TABLE public.workspace_members              DISABLE TRIGGER assert_workspace_member_change_audited;
  ALTER TABLE public.workspace_roster_relationships DISABLE TRIGGER assert_workspace_roster_relationship_change_audited;
  ALTER TABLE public.workspace_invitations          DISABLE TRIGGER assert_workspace_invitation_change_audited;
  ALTER TABLE public.workspace_custody_transfers    DISABLE TRIGGER assert_workspace_custody_transfer_change_audited;

  -- DELETED BY WORKSPACE ID, NOT ONLY BY `LIKE 'ffff0000-%'`.
  -- The RPCs create rows this harness never named: the seat
  -- workspace_redeem_invitation inserts, the diary rows
  -- workspace_nominate_owner inserts, the block row the roster transition
  -- upserts, and every audit row. All carry gen_random_uuid() ids. A
  -- teardown keyed on the fixture uuid prefix alone would leave every one of
  -- them behind, in tables Part A asserts are empty.
  -- B28's workspace is deleted FIRST and by its own returned id, because
  -- workspace_create allocates it with gen_random_uuid(). If B28 failed,
  -- v_ws2 is NULL and every one of these matches nothing — `= NULL` is never
  -- true — which is the correct no-op rather than a wildcard.
  DELETE FROM public.workspace_audit_log            WHERE workspace_id = v_ws2;
  DELETE FROM public.workspace_members              WHERE workspace_id = v_ws2;
  DELETE FROM public.workspaces                     WHERE id = v_ws2;

  DELETE FROM public.workspace_audit_log            WHERE workspace_id = WS;
  DELETE FROM public.workspace_grants               WHERE workspace_id = WS;
  DELETE FROM public.workspace_attachments          WHERE workspace_id = WS;
  DELETE FROM public.workspace_permission_requests  WHERE workspace_id = WS;
  DELETE FROM public.workspace_custody_transfers    WHERE project_id IN (PROJ, PROJ2);
  DELETE FROM public.workspace_roster_blocks        WHERE workspace_id = WS;
  DELETE FROM public.workspace_roster_relationships WHERE workspace_id = WS;
  DELETE FROM public.workspace_ownership_transfers  WHERE workspace_id = WS;
  DELETE FROM public.workspace_invitations          WHERE workspace_id = WS;
  DELETE FROM public.workspace_members              WHERE workspace_id = WS;
  DELETE FROM public.workspace_cohorts              WHERE account_user_id IN (OWNER_, INVITEE);
  DELETE FROM public.workspaces                     WHERE id = WS;
  DELETE FROM public.tracks                         WHERE project_id IN (PROJ, PROJ2);
  DELETE FROM public.vault_projects                 WHERE id IN (PROJ, PROJ2);
  DELETE FROM auth.users                            WHERE id::text LIKE 'ffff0000-%';
  DELETE FROM public.artist_invites                 WHERE email LIKE '%@verify.invalid';

  ALTER TABLE public.workspace_custody_transfers    ENABLE TRIGGER assert_workspace_custody_transfer_change_audited;
  ALTER TABLE public.workspace_invitations          ENABLE TRIGGER assert_workspace_invitation_change_audited;
  ALTER TABLE public.workspace_roster_relationships ENABLE TRIGGER assert_workspace_roster_relationship_change_audited;
  ALTER TABLE public.workspace_members              ENABLE TRIGGER assert_workspace_member_change_audited;
  ALTER TABLE public.workspace_audit_log            ENABLE TRIGGER guard_workspace_audit_log_no_truncate;
  ALTER TABLE public.workspace_audit_log            ENABLE TRIGGER guard_workspace_audit_log_no_row_change;
  ALTER TABLE public.workspace_members              ENABLE TRIGGER guard_workspace_never_zero_owners;

  -- ── B31 — EVERY TRIGGER THE HARNESS DISABLED IS BACK ON. ───────
  -- ITS OWN RESULT ROW, because a harness that left the audit log's
  -- append-only guards off would be worse than no harness: the table would
  -- silently stop being append-only and nothing would say so. 'D' = disabled.
  INSERT INTO public.zz_verify_b_results
  SELECT 40, 'B31 all seven disabled triggers re-enabled',
         string_agg(t.tgname || '=' || t.tgenabled::text, ', ' ORDER BY t.tgname),
         CASE WHEN count(*) = 7 AND count(*) FILTER (WHERE t.tgenabled = 'D') = 0
              THEN 'PASS — all seven enabled'
              ELSE '*** FAIL — A TRIGGER IS STILL DISABLED. RE-ENABLE IT BY HAND, NOW. ***' END,
         now()
  FROM pg_trigger t
  WHERE NOT t.tgisinternal
    AND t.tgname IN ('guard_workspace_never_zero_owners',
                     'guard_workspace_audit_log_no_row_change',
                     'guard_workspace_audit_log_no_truncate',
                     'assert_workspace_member_change_audited',
                     'assert_workspace_roster_relationship_change_audited',
                     'assert_workspace_invitation_change_audited',
                     'assert_workspace_custody_transfer_change_audited');

  -- ── ROW 100 — THE TEARDOWN VERDICT. ────────────────────────────
  INSERT INTO public.zz_verify_b_results
  SELECT 100, 'TEARDOWN',
         'switch=' || coalesce((SELECT enabled::text FROM public.workspace_access_config), 'NULL')
         || '  workspaces=' || (SELECT count(*) FROM public.workspaces)
         || '  members=' || (SELECT count(*) FROM public.workspace_members)
         || '  roster=' || (SELECT count(*) FROM public.workspace_roster_relationships)
         || '  blocks=' || (SELECT count(*) FROM public.workspace_roster_blocks)
         || '  grants=' || (SELECT count(*) FROM public.workspace_grants)
         || '  attachments=' || (SELECT count(*) FROM public.workspace_attachments)
         || '  requests=' || (SELECT count(*) FROM public.workspace_permission_requests)
         || '  audit=' || (SELECT count(*) FROM public.workspace_audit_log)
         || '  invitations=' || (SELECT count(*) FROM public.workspace_invitations)
         || '  ownership=' || (SELECT count(*) FROM public.workspace_ownership_transfers)
         || '  cohorts=' || (SELECT count(*) FROM public.workspace_cohorts)
         || '  custody=' || (SELECT count(*) FROM public.workspace_custody_transfers),
         CASE WHEN (SELECT enabled FROM public.workspace_access_config) IS FALSE
                   AND (SELECT count(*) FROM public.workspaces) = 0
                   AND (SELECT count(*) FROM public.workspace_members) = 0
                   AND (SELECT count(*) FROM public.workspace_roster_relationships) = 0
                   AND (SELECT count(*) FROM public.workspace_roster_blocks) = 0
                   AND (SELECT count(*) FROM public.workspace_grants) = 0
                   AND (SELECT count(*) FROM public.workspace_attachments) = 0
                   AND (SELECT count(*) FROM public.workspace_permission_requests) = 0
                   AND (SELECT count(*) FROM public.workspace_audit_log) = 0
                   AND (SELECT count(*) FROM public.workspace_invitations) = 0
                   AND (SELECT count(*) FROM public.workspace_ownership_transfers) = 0
                   AND (SELECT count(*) FROM public.workspace_cohorts) = 0
                   AND (SELECT count(*) FROM public.workspace_custody_transfers) = 0
              THEN 'PASS — D-56 switch OFF, all twelve tables empty'
              ELSE '*** CHECK MANUALLY — a fixture survived, or the switch is still ON ***' END,
         now();
END
$BLOCK$;

SELECT ord, check_name, detail, verdict FROM public.zz_verify_b_results ORDER BY ord;

-- ─── AFTERWARDS ───────────────────────────────────────────────
-- Paste the result table into
--   .planning/phases/38.0.2-workspace-transactional-integrity-hygiene/
--     38.0.2-VERIFICATION.md
-- in 38.0.1-VERIFICATION.md's format.
--
-- The scratch table is left in place on purpose, exactly as 38.0.1 left it —
-- the results survive the session, and the next run TRUNCATEs it. To remove
-- it entirely:  DROP TABLE public.zz_verify_b_results;
