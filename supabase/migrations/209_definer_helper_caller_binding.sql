-- ============================================================
-- Migration 209 — TIER 2: bind thirteen SECURITY DEFINER authorization
-- predicates to the CALLING identity
--
-- Phase 38.0.3, plan 02. Requirements Q1-T2, Q1-T2b, Q1-T2c, Q1-T2d, Q4, Q5.
--
-- HUMAN-GATED. NO AGENT APPLIES THIS FILE. It was authored, text-locked and
-- committed by an agent that never opened a database connection, never ran a
-- `supabase` command and never executed a single statement below. The owner
-- applies it by hand, in the Supabase SQL editor, AFTER plan 03's Part A
-- PRE-RUN. See the ORDERING block at the end of this header — reversing that
-- order destroys the only evidence that the disclosure existed.
--
-- NUMBER: this file is 209, not the 208 its plan text says. Plan 01 took 208
-- because Codex's Playbook workstream took 207
-- (`.planning/quick/260908-playbook-releases-27-31/207_playbook_operational_v1.sql`,
-- staged OUTSIDE `supabase/migrations/`). Re-verified at execution time
-- against `supabase/migrations/`, `git status --porcelain` AND
-- `.planning/quick/**`, matching filenames with BOTH `_` and `-` separators.
-- ============================================================
--
-- ─── WHAT THIS CHANGES, AND WHAT IT DELIBERATELY DOES NOT ────────────────
--
-- CHANGES: thirteen function BODIES. Each now refuses to answer a question
-- about somebody other than the caller — it returns FALSE (twelve BOOLEAN
-- predicates) or NULL (`workspace_member_role`, the one TEXT return) instead
-- of the true answer.
--
-- DOES NOT CHANGE: not one RLS policy. Not one grant. Not one table. Not one
-- line of application code. There is no `CREATE POLICY`, `ALTER POLICY` or
-- `DROP POLICY` statement anywhere in this file, and there never should be.
--
-- ─── WHY NO POLICY NEEDS REWRITING — THE Q1 FINDING ──────────────────────
--
-- `38.0.3-SCOPE.md` planned the hard version of this work: relocate the
-- helpers into a non-exposed schema and rewrite every policy call site in
-- lockstep. The research falsified the model that plan rested on.
--
-- Every `public.<helper>(` occurrence across all 200 migrations was located
-- with line comments stripped and dollar-quoted regions mapped, each match
-- classified as inside-a-function-body versus inside a policy statement, and
-- the balanced argument list extracted verbatim. Result: **73 policy call
-- sites** across these thirteen helpers plus `no_block` — 58 for the thirteen
-- bound here, the remainder for `no_block` — and **every single one of them
-- passes `auth.uid()` at the identity argument position. Zero exceptions.**
--
-- So the conjunct added below is TAUTOLOGICALLY TRUE wherever a policy
-- evaluates it. Behaviour on the policy path is preserved BY CONSTRUCTION,
-- not by hoping a test caught everything. The policies do not change because
-- they do not need to.
--
-- That finding is not a paragraph in a plan. Plan 01 turned it into
-- `__tests__/rls-helper-callsites.test.ts` assertion (a), which re-derives it
-- from the migration corpus on every `npm test`. If a future policy ever
-- passes something other than `auth.uid()` here, that test goes red and this
-- migration's safety argument is retracted automatically.
--
-- ─── WHY ALL THIRTEEN ARE IN ONE FILE — DO NOT SPLIT THIS MIGRATION ──────
--
-- Several of the thirteen call each other, FORWARDING THEIR OWN `p_uid`:
--
--   workspace_agreement_evidence_visible -> is_workspace_owner(r.workspace_id, p_uid)
--                                        -> workspace_member_role(r.workspace_id, p_uid)
--   workspace_audit_visible              -> workspace_member_role(l.workspace_id, p_uid)
--   ownership_transfer_visible           -> workspace_member_role(t.workspace_id, p_uid)
--   workspace_attachment_visible         -> workspace_member_role(a.workspace_id, p_uid)
--   green_room_can_view_post             -> no_block(p_viewer, p.author_id)
--                                        -> green_room_post_matches_custom_audience(p.id, p_viewer)
--   workspace_project_permission         -> workspace_access_enabled()
--                                        -> workspace_grant_lineage_live(g.id)
--
-- Once ALL thirteen are bound, that chain is transitively safe: the entry
-- point constrains `p_uid`, and every interior call forwards an
-- already-constrained value.
--
-- A PARTIAL ROLLOUT IS THE DANGEROUS STATE, AND IT DOES NOT FAIL LOUDLY. If
-- the inner function is bound and its outer caller is not, an attacker calling
-- the outer with somebody else's uid reaches an inner call whose `p_uid` is no
-- longer `auth.uid()`. The inner returns FALSE/NULL. The outer therefore
-- returns a CONFIDENT WRONG ANSWER — "no" where the truth is "yes". Nothing
-- raises. Nothing logs. That is the exact class of defect that has shipped
-- twice in this repo already. One file. Thirteen replaces. One batch.
--
-- ─── THE SIX EXTERNAL DEFINER CALLERS — VERIFIED AT EXECUTION TIME ───────
--
-- Six SECURITY DEFINER functions OUTSIDE this set forward a `p_uid` into one
-- of the thirteen. Every one of them ALREADY binds `p_uid = (SELECT
-- auth.uid())` in its own body, so none of them changes behaviour here:
--
--   193 workspace_read_tracks        -> workspace_project_permission   binds
--   193 workspace_read_assets        -> workspace_project_permission   binds
--   193 workspace_read_documents     -> workspace_project_permission   binds
--   193 workspace_read_tool_outputs  -> workspace_project_permission   binds
--   197 workspace_audit_page         -> workspace_member_role          binds
--   197 workspace_roster_page        -> workspace_member_role,
--                                       is_workspace_owner             binds
--
-- ─── WHY THE SERVICE-ROLE DISJUNCT IS REQUIRED, NOT DECORATIVE ───────────
--
-- Two application call sites use the SERVICE client and deliberately pass a
-- viewer who is NOT the caller:
--
--   lib/trust-safety/reports.ts:179       service.rpc('green_room_can_view_post', { p_post_id, p_viewer })
--   lib/green-room/placements-admin.ts:353 service.rpc('no_block', { a, b })
--
-- On a service connection `auth.uid()` is NULL. A strict migration-194-style
-- bind (`p_uid = (SELECT auth.uid())` and nothing else) would make both of
-- those return FALSE for every input, SILENTLY — a moderation queue that
-- shows nothing and a placement guard that refuses everyone. `auth.role()`
-- reads the request JWT claim, not `current_user`, so it returns
-- 'service_role' on those connections and 'authenticated' on client ones.
--
-- A diff of `green_room_can_view_post` with no `auth.role()` reference in it
-- is the warning sign. Test assertion 3 names that function explicitly for
-- exactly this reason.
--
-- ─── WHY THE TRIGGER-DEPTH DISJUNCT IS OMITTED HERE ──────────────────────
--
-- Migration 174 carries a THIRD disjunct, `pg_trigger_depth() > 0`. It is
-- deliberately ABSENT from all thirteen functions below.
--
-- It is the weakest branch of the idiom: an unauthenticated, un-identity-bound
-- escape that ANY write firing ANY trigger enters. It is also dead weight
-- here — no current trigger function calls any of these thirteen.
--
-- That is not an assumption either. `__tests__/rls-helper-callsites.test.ts`
-- assertion (c) enumerates every `RETURNS TRIGGER` function in the corpus with
-- latest-definition-wins semantics and asserts none of them calls a Tier-2
-- helper. So the omission STAYS true rather than being true once and rotting.
--
-- **MIGRATION 174 ITSELF IS NOT EDITED BY THIS FILE AND MUST NOT BE.**
-- Migrations 146 and 160 have trigger-side callers of 174's helpers that still
-- depend on its third branch. Removing it there would break them.
--
-- ─── WHY `no_block` IS NOT BOUND HERE ────────────────────────────────────
--
-- `no_block` is NOT one of the thirteen. It is not redefined, revoked or
-- granted anywhere in this file. Its single appearance below is as a CALL
-- inside `green_room_can_view_post`'s copied body, which is load-bearing and
-- must stay.
--
-- Reason: `no_block(a, b)` is SYMMETRIC. Any bind permissive enough to keep
-- the policy path working (`a = auth.uid()`) also permits `no_block(me, X)` —
-- which answers "did X block me?". That is threat T-08-03, which migration 035
-- closed at the table level. Binding it would re-open the thing the binding
-- was meant to close. Owner decision D4 is therefore RELOCATE, not bind, and
-- that is plans 04-06 (migration 210).
--
-- Note also: migration 208 revoked EXECUTE on
-- `green_room_post_matches_custom_audience` from `authenticated`. The call to
-- it inside `green_room_can_view_post`'s body below keeps working because a
-- SECURITY DEFINER body executes with the privileges of the function OWNER.
-- DO NOT `GRANT` it back.
--
-- ─── WHY THE GRANT POSTURE IS RESTATED FOR ALL THIRTEEN ──────────────────
--
-- `CREATE OR REPLACE FUNCTION` PRESERVES existing grants — but it says nothing
-- about them, and a file that is silent about the posture stops being an
-- authority on it. That is precisely how the migration-047 defect stayed
-- invisible for two years while the repo looked correct. Migrations 196 and
-- 197 already restate for the same reason.
--
-- So every replace below is followed by an explicit REVOKE naming PUBLIC,
-- `anon` AND `authenticated` (a `FROM PUBLIC`-only revoke does NOT remove
-- Supabase's DIRECT grants to `anon`/`authenticated` — the 047 defect), then a
-- GRANT to `authenticated` only.
--
-- `authenticated` KEEPS EXECUTE HERE, AND THAT IS THE POINT. Unlike migration
-- 208's four Tier-1 functions, these thirteen ARE NAMED BY RLS POLICIES, and a
-- policy expression runs with the privileges of the QUERYING role. Revoking
-- one would produce `42501 permission denied for function` on every read that
-- policy gates. That is the TRAP `38.0.3-SCOPE.md` names in capitals, and this
-- file respects it: the BODY does the work now, not the grant. The endpoint
-- stays reachable and answers every cross-user question with FALSE/NULL.
--
-- ─── WHAT `CREATE OR REPLACE FUNCTION` CANNOT DO ─────────────────────────
--
-- All three of these would RAISE on apply, so they are stated rather than
-- discovered:
--
--   1. It cannot RENAME an input parameter. The identity parameter is `p_uid`
--      on eleven of the thirteen, `p_viewer` on `green_room_can_view_post`
--      (migration 076) and bare `uid` on `is_split_sheet_initiator` and
--      `is_split_sheet_party` (migration 064). Each is written with the name
--      it actually has. They are NOT normalised. A bind written against the
--      wrong name is a SILENT NO-OP that reads as a fix.
--   2. It cannot change the RETURN TYPE. `workspace_member_role` returns TEXT;
--      the other twelve return BOOLEAN. `is_green_room_eligible` declares its
--      types in lowercase (`p_uid uuid`, `RETURNS boolean`) and its header is
--      reproduced as it is.
--   3. All thirteen keep `LANGUAGE sql STABLE SECURITY DEFINER SET
--      search_path = ''` exactly. The empty search_path is load-bearing: it is
--      why every reference in every body is schema-qualified, and it is the
--      T-08-04 search-path-hijack mitigation migration 035 established.
--
-- ─── THE DELIBERATE RESIDUAL ─────────────────────────────────────────────
--
-- After binding, an authenticated caller can still ask these functions about
-- THEMSELVES — "what is my role in workspace W", "can I see post P". That is
-- self-information, equivalent to what an ordinary SELECT already returns
-- them. It is recorded, not mitigated. The disclosure being closed is the
-- CROSS-USER one.
--
-- ─── BODIES COPIED FROM (latest-definition-wins) ─────────────────────────
--
-- Several of these have been redefined more than once. Copying an older body
-- would SILENTLY REVERT behaviour, so each is copied from its LATEST
-- definition and the drift is locked by
-- `__tests__/migration-209-definer-binds.test.ts` assertion 6:
--
--   workspace_project_permission          197:1701   (not 192, not 186)
--   workspace_member_role                 192:163    (not 182)
--   is_workspace_owner                    192:173    (not 182)
--   green_room_can_view_post              076:264    (not 059, not 057)
--   workspace_audit_visible               197:1268   (not 186)
--   custody_transfer_visible              185:229
--   ownership_transfer_visible            197:321
--   workspace_attachment_visible          185:203
--   workspace_agreement_evidence_visible  183:206
--   workspace_grant_visible_to_member     184:212
--   is_split_sheet_initiator              064:113
--   is_split_sheet_party                  064:128
--   is_green_room_eligible                087:27
--
-- ─── ORDERING — READ BEFORE APPLYING ANYTHING ────────────────────────────
--
--   1. Run plan 03's Part A as a PRE-RUN. Confirm its E-block, C-block and
--      D-block gates. The grant rows WILL read FAIL there; that is the wanted
--      result — it is the evidence the disclosure existed, and it cannot be
--      reconstructed once the revokes land.
--   2. THEN apply migration 208, then this file (209), together, in that
--      order.
--   3. Re-run Part A (post-run), then run Part B.
--   4. Do not start plans 04-06 until Part A and Part B are both clean.
--
-- ============================================================


-- ─── (a) workspace_project_permission (uuid, uuid, text) ─────────────────
--         body from migration 197:1701. The new conjunct goes in FRONT of
--         the existing `workspace_access_enabled() AND EXISTS (...)`, not
--         between them.
CREATE OR REPLACE FUNCTION public.workspace_project_permission(
  p_project_id UUID,
  p_uid UUID,
  p_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    p_uid = (SELECT auth.uid())
    OR (SELECT auth.role()) = 'service_role'
  ) AND
    public.workspace_access_enabled()
    AND EXISTS (
      SELECT 1
      FROM public.workspace_attachments a
      JOIN public.workspace_members m
        ON m.workspace_id = a.workspace_id
       AND m.user_id = p_uid
       AND m.status = 'active'
       AND (m.expires_at IS NULL OR m.expires_at > now())
       AND m.role IN ('owner', 'admin', 'member', 'contractor')
      JOIN public.workspace_roster_relationships r
        ON r.workspace_id = a.workspace_id
       AND r.id = a.relationship_id
       AND r.state = 'accepted'
       AND (r.effective_from IS NULL OR r.effective_from <= CURRENT_DATE)
       AND (r.terminates_on IS NULL OR r.terminates_on > CURRENT_DATE)
      JOIN public.workspace_grants g
        ON g.workspace_id = a.workspace_id
       AND g.relationship_id = r.id
       AND g.permission = p_permission
       AND g.revoked_at IS NULL
       AND (g.project_id IS NULL OR g.project_id = p_project_id)
      JOIN public.vault_projects p
        ON p.id = a.project_id
       AND p.user_id = r.member_user_id
      WHERE a.project_id = p_project_id
        AND a.detached_at IS NULL
        AND public.workspace_grant_lineage_live(g.id)
    )
$$;


-- ─── (b) workspace_member_role (uuid, uuid) — THE ONLY TEXT RETURN ───────
--         body from migration 192:163. TEXT, so this takes the CASE shape,
--         not a leading conjunct: a leading `(...) AND` on a TEXT-returning
--         function is a type error that only surfaces on apply. This is
--         migration 174's project_member_role shape exactly, minus the
--         trigger-depth branch.
CREATE OR REPLACE FUNCTION public.workspace_member_role(p_workspace_id UUID, p_uid UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_uid = (SELECT auth.uid())
      OR (SELECT auth.role()) = 'service_role' THEN (
      SELECT role FROM public.workspace_members
      WHERE workspace_id = p_workspace_id AND user_id = p_uid AND status = 'active'
        AND (expires_at IS NULL OR expires_at > now())
    )
    ELSE NULL
  END
$$;


-- ─── (c) is_workspace_owner (uuid, uuid) ─────────────────────────────────
--         body from migration 192:173.
CREATE OR REPLACE FUNCTION public.is_workspace_owner(p_workspace_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    p_uid = (SELECT auth.uid())
    OR (SELECT auth.role()) = 'service_role'
  ) AND EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = p_uid
      AND role = 'owner' AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
  )
$$;


-- ─── (d) green_room_can_view_post (uuid, uuid) — PARAMETER IS `p_viewer` ─
--         body from migration 076:264. NOT `p_uid`. A bind written against
--         `p_uid` here would fail to apply at best and, if the name happened
--         to resolve, would do nothing at all.
--
--         This is the one function whose service-role disjunct is proven
--         load-bearing by a live route: lib/trust-safety/reports.ts:179 calls
--         it through the service client with a viewer who is not the caller.
CREATE OR REPLACE FUNCTION public.green_room_can_view_post(
  p_post_id UUID,
  p_viewer UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    p_viewer = (SELECT auth.uid())
    OR (SELECT auth.role()) = 'service_role'
  ) AND EXISTS (
    SELECT 1
    FROM public.green_room_posts p
    WHERE p.id = p_post_id
      AND p.deleted_at IS NULL
      AND p.moderation_status = 'visible'
      AND p_viewer IS NOT NULL
      AND (
        p.author_id = p_viewer
        OR (
          p.status = 'published'
          AND p.published_at IS NOT NULL
          AND public.no_block(p_viewer, p.author_id)
          AND EXISTS (
            SELECT 1 FROM public.user_profiles ap
            WHERE ap.id = p.author_id
              AND ap.is_public = true
          )
          AND (
            p.visibility = 'public'
            OR (
              p.visibility = 'followers'
              AND EXISTS (
                SELECT 1 FROM public.follows f
                WHERE f.follower_id = p_viewer
                  AND f.followee_id = p.author_id
              )
            )
            OR (
              p.visibility = 'connections'
              AND EXISTS (
                SELECT 1 FROM public.connections c
                WHERE c.status = 'accepted'
                  AND (
                    (c.requester_id = p_viewer AND c.addressee_id = p.author_id)
                    OR (c.addressee_id = p_viewer AND c.requester_id = p.author_id)
                  )
              )
            )
            OR (
              p.visibility = 'custom'
              AND public.green_room_post_matches_custom_audience(p.id, p_viewer)
            )
          )
        )
      )
  )
$$;


-- ─── (e) workspace_audit_visible (uuid, uuid) ────────────────────────────
--         body from migration 197:1268 (the R-13/R-27/WSR-19 NARROWED
--         version, not migration 186's, which also admitted any live seat).
CREATE OR REPLACE FUNCTION public.workspace_audit_visible(p_row_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    p_uid = (SELECT auth.uid())
    OR (SELECT auth.role()) = 'service_role'
  ) AND EXISTS (
    SELECT 1
    FROM public.workspace_audit_log l
    WHERE l.id = p_row_id
      AND (
        l.actor_user_id = p_uid
        OR l.subject_member_id = p_uid
        OR public.workspace_member_role(l.workspace_id, p_uid) IN ('owner', 'admin')
      )
  )
$$;


-- ─── (f) custody_transfer_visible (uuid, uuid) ───────────────────────────
--         body from migration 185:229. Note the deliberate absence of any
--         workspace_member_role() call — preserved exactly (T-38-10-04).
CREATE OR REPLACE FUNCTION public.custody_transfer_visible(p_transfer_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    p_uid = (SELECT auth.uid())
    OR (SELECT auth.role()) = 'service_role'
  ) AND EXISTS (
    SELECT 1 FROM public.workspace_custody_transfers
    WHERE id = p_transfer_id
      AND (from_user_id = p_uid OR to_user_id = p_uid OR offered_by = p_uid)
  )
$$;


-- ─── (g) ownership_transfer_visible (uuid, uuid) ─────────────────────────
--         body from migration 197:321.
CREATE OR REPLACE FUNCTION public.ownership_transfer_visible(p_transfer_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    p_uid = (SELECT auth.uid())
    OR (SELECT auth.role()) = 'service_role'
  ) AND EXISTS (
    SELECT 1
    FROM public.workspace_ownership_transfers t
    WHERE t.id = p_transfer_id
      AND (
        t.from_user_id = p_uid
        OR t.to_user_id = p_uid
        OR t.offered_by = p_uid
        OR public.workspace_member_role(t.workspace_id, p_uid) IN ('owner', 'admin')
      )
  )
$$;


-- ─── (h) workspace_attachment_visible (uuid, uuid) ───────────────────────
--         body from migration 185:203.
CREATE OR REPLACE FUNCTION public.workspace_attachment_visible(p_attachment_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    p_uid = (SELECT auth.uid())
    OR (SELECT auth.role()) = 'service_role'
  ) AND EXISTS (
    SELECT 1
    FROM public.workspace_attachments a
    JOIN public.vault_projects p ON p.id = a.project_id
    WHERE a.id = p_attachment_id
      AND (
        public.workspace_member_role(a.workspace_id, p_uid) IS NOT NULL
        OR p.user_id = p_uid
      )
  )
$$;


-- ─── (i) workspace_agreement_evidence_visible (uuid, uuid) ───────────────
--         body from migration 183:206. Calls BOTH is_workspace_owner and
--         workspace_member_role, forwarding its own p_uid — the clearest
--         illustration of why a partial rollout returns wrong answers.
CREATE OR REPLACE FUNCTION public.workspace_agreement_evidence_visible(p_evidence_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    p_uid = (SELECT auth.uid())
    OR (SELECT auth.role()) = 'service_role'
  ) AND EXISTS (
    SELECT 1
    FROM public.workspace_agreement_evidence e
    JOIN public.workspace_roster_relationships r ON r.id = e.relationship_id
    WHERE e.id = p_evidence_id
      AND (
        r.member_user_id = p_uid
        OR public.is_workspace_owner(r.workspace_id, p_uid)
        OR public.workspace_member_role(r.workspace_id, p_uid) = 'admin'
      )
  )
$$;


-- ─── (j) workspace_grant_visible_to_member (uuid, uuid) ──────────────────
--         body from migration 184:212.
CREATE OR REPLACE FUNCTION public.workspace_grant_visible_to_member(p_grant_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    p_uid = (SELECT auth.uid())
    OR (SELECT auth.role()) = 'service_role'
  ) AND EXISTS (
    SELECT 1
    FROM public.workspace_grants g
    JOIN public.workspace_roster_relationships r ON r.id = g.relationship_id
    WHERE g.id = p_grant_id
      AND r.member_user_id = p_uid
  )
$$;


-- ─── (k) is_split_sheet_initiator (uuid, uuid) — PARAMETER IS BARE `uid` ─
--         body from migration 064:113. NOT `p_uid`. CREATE OR REPLACE cannot
--         rename it, and a bind written against `p_uid` would be a no-op that
--         reads as a fix.
CREATE OR REPLACE FUNCTION public.is_split_sheet_initiator(sheet_id UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    uid = (SELECT auth.uid())
    OR (SELECT auth.role()) = 'service_role'
  ) AND EXISTS (
    SELECT 1 FROM public.split_sheets
    WHERE id = sheet_id AND initiator_user_id = uid
  )
$$;


-- ─── (l) is_split_sheet_party (uuid, uuid) — PARAMETER IS BARE `uid` ─────
--         body from migration 064:128.
CREATE OR REPLACE FUNCTION public.is_split_sheet_party(sheet_id UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    uid = (SELECT auth.uid())
    OR (SELECT auth.role()) = 'service_role'
  ) AND EXISTS (
    SELECT 1 FROM public.split_sheet_parties
    WHERE split_sheet_id = sheet_id AND user_id = uid
  )
$$;


-- ─── (m) is_green_room_eligible (uuid) — LOWERCASE TYPE DECLARATIONS ─────
--         body from migration 087:27. The only single-argument helper of the
--         thirteen, and the only one whose header declares `uuid`/`boolean`
--         in lowercase. Reproduced as it is.
CREATE OR REPLACE FUNCTION public.is_green_room_eligible(p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    p_uid = (SELECT auth.uid())
    OR (SELECT auth.role()) = 'service_role'
  ) AND EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = p_uid AND member_type IN ('artist', 'industry')
  )
$$;


-- ─── (n) GRANT POSTURE, RESTATED EXPLICITLY FOR ALL THIRTEEN ─────────────
--
-- `authenticated` KEEPS EXECUTE on every one of these, and that is correct:
-- unlike migration 208's Tier-1 four, these thirteen ARE named by RLS
-- policies, and a policy expression runs as the QUERYING role — revoking one
-- would raise `42501 permission denied for function` on every read that policy
-- gates. The BODY closes the disclosure now, not the grant. The endpoint stays
-- reachable and returns FALSE/NULL to every cross-user question.
--
-- Each REVOKE names PUBLIC, `anon` AND `authenticated` explicitly: Supabase
-- grants `anon`/`authenticated` DIRECTLY, and `REVOKE ... FROM PUBLIC` does
-- not remove a direct grant. That is the migration-047 defect verbatim.
--
-- Signatures are the lowercase spellings used by the existing statements in
-- migrations 059, 064, 087, 183, 184, 185, 192 and 197. A statement against a
-- signature that does not exist is a SILENT NO-OP.

REVOKE EXECUTE ON FUNCTION public.workspace_project_permission(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_project_permission(uuid, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.workspace_member_role(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_member_role(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_workspace_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_workspace_owner(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.green_room_can_view_post(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.green_room_can_view_post(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.workspace_audit_visible(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_audit_visible(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.custody_transfer_visible(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.custody_transfer_visible(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.ownership_transfer_visible(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ownership_transfer_visible(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.workspace_attachment_visible(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_attachment_visible(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.workspace_agreement_evidence_visible(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_agreement_evidence_visible(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.workspace_grant_visible_to_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_grant_visible_to_member(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_split_sheet_initiator(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_split_sheet_initiator(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_split_sheet_party(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_split_sheet_party(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_green_room_eligible(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_green_room_eligible(uuid) TO authenticated;


-- ─── (o) PostgREST schema reload ─────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
