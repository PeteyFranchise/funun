-- ============================================================
-- Migration 210 — TIER 3: relocate `no_block` out of the PostgREST-exposed
-- schema, retarget every caller, and drop the `public` copy
--
-- Phase 38.0.3, plan 05. Requirements T3-1, T3-2, T3-3, Q4, Q5.
--
-- HUMAN-GATED. NO AGENT APPLIES THIS FILE. It was authored, text-locked and
-- committed by an agent that never opened a database connection, never ran a
-- `supabase` command and never executed a single statement below. The owner
-- applies it by hand, in the Supabase SQL editor, as ONE paste, AFTER running
-- plan 06 Part A2 as a PRE-APPLY GATE. See the ORDERING block at the end of
-- this header.
--
-- NUMBER: this file is 210, not the 209 its plan text originally said. Codex's
-- Playbook workstream took 207 (staged OUTSIDE `supabase/migrations/`), which
-- pushed Tier 1 to 208 and Tier 2 to 209. Re-verified at execution time
-- against `supabase/migrations/`, `git status --porcelain` and
-- `.planning/quick/**`.
-- ============================================================
--
-- ─── WHY RELOCATE RATHER THAN BIND — OWNER DECISION D4 ───────────────────
--
-- Migration 209 bound thirteen SECURITY DEFINER helpers to the calling
-- identity. `no_block` is deliberately NOT one of them, because
-- `no_block(a, b)` is SYMMETRIC. Any bind permissive enough to keep the RLS
-- policy path working (`a = auth.uid()`) necessarily also permits
-- `no_block(me, X)` — which answers "did X block me?" for any X the caller
-- cares to name. That is threat T-08-03, and migration 035 closed it at the
-- table level. Its exact words, reproduced so this file carries the reason
-- rather than pointing at it:
--
--   "A member sees ONLY their own blocklist, never who blocked them
--    (T-08-03: enumeration of 'who blocked me' is an information-disclosure
--    risk mitigated by restricting SELECT to blocker_id = auth.uid())."
--
-- Binding would re-open the thing the binding was meant to close. Owner
-- decision D4 is therefore RELOCATE. This is the one function in the whole
-- phase that genuinely needs a schema move.
--
-- ─── WHAT RELOCATION BUYS, AND WHAT IT DOES NOT — STATED HONESTLY ────────
--
-- BUYS: PostgREST introspects and routes to ONLY the schemas named in its
-- `db-schemas` configuration. A function outside that set has NO RPC route at
-- all; a request naming an unlisted schema is rejected with `PGRST106`. That
-- is a real control, not obscurity — it is not a matter of guessing a name.
-- Combined with the drop of the `public` copy in section 5, the symmetric
-- block oracle cannot be asked over HTTP with any key.
--
-- DOES NOT BUY: this removes no privilege. For a policy on a `public` table
-- to call a helper in another schema, the QUERYING role must hold `USAGE` on
-- that schema and `EXECUTE` on that function — a policy expression is
-- evaluated with the privileges of the querying role, not the table owner's.
-- So `authenticated` KEEPS EXECUTE below. It simply has no HTTP route to
-- reach it.
--
-- WHAT THAT MAKES THIS: a CONFIGURATION boundary, not a privilege boundary,
-- and it is ONE DASHBOARD TOGGLE away from being undone. The statements below
-- are literally the first half of Supabase's own "how to expose a custom
-- schema" recipe. Nobody may complete the recipe. The schema comment in
-- section 1 says so at the catalogue level, and plan 06 Part A2 re-records
-- the exposed-schema list on every run so drift is visible. Recorded as a
-- residual, accepted by the owner, NOT mitigated by this file.
--
-- ─── THE HAZARD THAT FOLLOWS THE FUNCTION TO ITS NEW HOME ────────────────
--
-- PostgreSQL grants `EXECUTE` to `PUBLIC` by default on EVERY function it
-- creates, in EVERY schema. The moment `USAGE` on the new schema reaches
-- `authenticated`, every function there becomes executable by `authenticated`
-- through that default — exactly as in `public`. This is a confirmed, open
-- Supabase issue: functions in custom API schemas receive EXECUTE for
-- `anon`/`authenticated` even when only `GRANT USAGE` was issued, and even
-- when `ALTER DEFAULT PRIVILEGES` had revoked it.
--
-- `ALTER DEFAULT PRIVILEGES` is NOT a dependable prophylactic here: it is
-- scoped to the creating role, and the issue reporter found it did not
-- prevent the grants. It is deliberately not used below.
--
-- The ONLY dependable control is the EXPLICIT PER-FUNCTION REVOKE NAMING THE
-- ROLES — owner decision D2's model, established by migration 149 and
-- restated by migrations 196, 197, 208 and 209. A `REVOKE ... FROM PUBLIC`
-- alone does NOT remove Supabase's DIRECT grants to `anon`/`authenticated`;
-- that is the migration-047 defect verbatim. Section 2 writes the full form.
--
-- ─── WHY THE ORDER OF SECTIONS BELOW IS THE SAFETY ARGUMENT ──────────────
--
-- PostgreSQL records `DEPENDENCY_NORMAL` entries for RLS policy expressions,
-- but records NOTHING for a function name that appears inside a string-literal
-- `AS ... ` function body — and every function in this repo uses that form.
--
-- Consequence: the `DROP FUNCTION` in section 5 would SUCCEED with a body
-- caller still pointing at `public.no_block`, and that caller would raise
-- `42883 function does not exist` on its next live invocation, in production,
-- with no prior warning. That is the migration-198 failure shape exactly:
-- green test suite, clean apply, broken on the first real call.
--
-- So section 3 retargets BOTH body callers BEFORE the drop. The ordering is
-- load-bearing and is locked by assertion 1 of
-- `__tests__/migration-210-no-block-relocation.test.ts`.
--
-- ─── APPLY THIS FILE AS ONE BATCH — AND WHY ANY WINDOW IS SAFE ───────────
--
-- Section 4 drops and recreates eleven policies. Between a `DROP POLICY` and
-- its `CREATE POLICY`, the table is left with fewer policies — and under RLS
-- the absence of a permitting policy is DEFAULT-DENY. Any window is therefore
-- fail-CLOSED: a brief refusal for a non-owner role, never an exposure. That
-- is what makes the drop/create ordering acceptable rather than reckless. It
-- is also why a cascading drop is forbidden (see section 5): cascading a
-- policy away PERMANENTLY leaves its table with zero policies, which is the
-- same default-deny, but total and silent.
--
-- ─── PRECONDITION: PLAN 04 MUST BE DEPLOYED, NOT MERELY MERGED ───────────
--
-- Until phase 38.0.3 plan 04 is DEPLOYED, running production code still calls
-- `service.rpc('no_block', ...)` from `lib/green-room/placements-admin.ts`.
-- PostgREST routes that request against the EXPOSED schema, so the relocation
-- removes the route regardless of grants and the call would start returning
-- an error. Plan 04 replaced it with a direct service-role read of
-- `public.blocks`, and `__tests__/rls-helper-callsites.test.ts` assertion (d)
-- pins `no_block` at ZERO application `.rpc()` call sites. Merged is not
-- enough. DEPLOYED.
--
-- ─── ORDERING — READ BEFORE APPLYING ANYTHING ────────────────────────────
--
--   1. Confirm migrations 208 and 209 are applied and plan 03's Part A and
--      Part B are clean.
--   2. Confirm plan 04 is merged AND deployed.
--   3. Run plan 06's `38.0.3-VERIFY-A2-NO-BLOCK.sql` as a PRE-APPLY GATE. Its
--      G-block enumerates every `public` function whose `prosrc` names
--      `no_block`. It MUST return exactly the two this file retargets:
--      `green_room_can_view_post` and `discover_profile_id_by_email`. A THIRD
--      NAME IS A STOP — section 3 is incomplete, the drop would break that
--      caller silently, and this file must be extended before it is applied.
--      The same run asserts the production policy count is 11 and names any
--      policy absent from section 4.
--   4. Apply THIS FILE as one paste.
--   5. IF THE `DROP FUNCTION` IN SECTION 5 REFUSES WITH `2BP01`, THAT IS THE
--      SAFETY MECHANISM WORKING, NOT A FAILURE OF THIS MIGRATION. Read the
--      `DETAIL:` line — it names every policy still referencing the function.
--      Record it in the plan SUMMARY, add the named policy to section 4, and
--      re-apply. DO NOT force the drop. DO NOT add a cascading modifier.
--      Restating the limit of that guarantee: it is self-verifying for POLICY
--      references ONLY. A string-literal body reference records no dependency
--      and would not block it. That blind spot is what step 3 exists to close.
--   6. Re-run Part A2 (post-apply) and run Part B2.
--   7. Confirm the relocated schema is still ABSENT from Supabase API
--      settings, Exposed schemas.
--   8. Fire one `curl` at the PostgREST RPC route for `no_block` with the anon
--      key and with the service key, and record both HTTP statuses. That is
--      the only check proving the ROUTE is gone rather than the privilege.
--
-- ============================================================


-- ─── SECTION 1 — THE SCHEMA ──────────────────────────────────────────────
--
-- Named `private`, matching Supabase's own documented hardening convention
-- for internal helper functions. `security_helpers` was considered and
-- rejected ONLY because `private` is the documented name; nothing about this
-- helper is special. This choice sets the precedent for any future
-- relocation in this repo — a second schema for the same purpose would be
-- worse than a slightly generic first one.

CREATE SCHEMA IF NOT EXISTS private;

-- Documentation of intent, not a change: PostgreSQL grants NOTHING to PUBLIC
-- on a newly created schema. Written anyway so this file is an authority on
-- the schema's grant posture rather than silent about it — the same reason
-- migrations 196, 197 and 209 restate function grants they do not alter. A
-- file that is silent about a posture stops being evidence for it, and that
-- is precisely how the migration-047 defect stayed invisible for two years.
REVOKE ALL ON SCHEMA private FROM PUBLIC;

-- `authenticated` ONLY.
--
-- NOT `anon`: `public.no_block` has never been granted to `anon` (migration
-- 035 grants `authenticated` only, and `38.0.3-LIVE-EXPOSED.txt` confirms
-- `resolve_profile_by_handle` is the single function `anon` can reach).
-- Granting `anon` now would be a BEHAVIOUR CHANGE, not a preservation.
--
-- NOT `service_role` either: after plan 04 no application code reaches this
-- function, and the two SECURITY DEFINER bodies in section 3 that call it
-- execute with the privileges of the function OWNER, so they need no grant of
-- their own.
GRANT USAGE ON SCHEMA private TO authenticated;

COMMENT ON SCHEMA private IS
  'Internal RLS helper functions. DELIBERATELY NOT in PostgREST exposed-schema list (db-schemas) and MUST NEVER be added to it. Adding this schema under Supabase API settings, Exposed schemas would restore an HTTP RPC route to every function here and would silently undo phase 38.0.3 Tier 3 (owner decision D4, threat T-08-03). Membership of this schema is a routing control, not a privilege control: callers still require USAGE here plus EXECUTE on the function.';


-- ─── SECTION 2 — THE RELOCATED FUNCTION ──────────────────────────────────
--
-- Body copied VERBATIM from migration 035, with the identical four
-- attributes: RETURNS BOOLEAN, LANGUAGE sql, STABLE, SECURITY DEFINER,
-- SET search_path = ''.
--
-- Each of those is load-bearing and none is decoration:
--   - SECURITY DEFINER is the whole point. The calling role is restricted by
--     `blocks_select_own` to `blocker_id = auth.uid()`, so it could not
--     otherwise read the OTHER direction — "did they block me". Running as the
--     owner bypasses RLS on `blocks` and sees both directions. A relocation
--     that silently dropped this would leave a function that still applies,
--     still grants, still passes every structural check, and answers the
--     reverse direction wrongly.
--   - SET search_path = '' with a fully-qualified `public.blocks` is the
--     T-08-04 search-path-hijack mitigation migration 035 established.
--   - STABLE lets the planner cache the result within a single statement when
--     wrapped as (SELECT no_block(...)) in a policy, avoiding per-row
--     re-evaluation.
--
-- Parameter names `a` and `b` are PRESERVED. The eleven policies in section 4
-- pass positionally, but the names are part of the function's identity for any
-- future CREATE OR REPLACE, which cannot rename a parameter.

CREATE OR REPLACE FUNCTION private.no_block(a UUID, b UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  )
$$;

-- THE GRANT POSTURE, WRITTEN IN FULL BECAUSE THE DEFAULT IS THE HAZARD.
--
-- PostgreSQL has already granted EXECUTE to PUBLIC on the function above, by
-- default, at CREATE time — in this schema exactly as in `public`. The revoke
-- names PUBLIC, `anon` AND `authenticated` explicitly because Supabase grants
-- `anon`/`authenticated` DIRECTLY and a `FROM PUBLIC`-only revoke does not
-- remove a direct grant (migration 047's defect). Then the single grant back.
-- Two statements, in this order. This is the migration-149 shape.
REVOKE EXECUTE ON FUNCTION private.no_block(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION private.no_block(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION private.no_block(uuid, uuid) IS
  'Returns false when EITHER direction of a block exists between a and b. Intended for use inside RLS policy WITH CHECK/USING clauses (wrapped as (SELECT no_block(...))), not as a client-invoked RPC. Relocated from public by phase 38.0.3 migration 210: the schema placement now ENFORCES what migration 035 comment could only request, because PostgREST has no route to an unexposed schema. Symmetric by design, which is why owner decision D4 relocated it rather than binding it to the caller identity (threat T-08-03).';


-- ─── SECTION 3 — THE TWO SECURITY DEFINER BODY CALLERS ───────────────────
-- ─── THIS SECTION MUST PRECEDE THE DROP. DO NOT REORDER. ─────────────────
--
-- These two are INVISIBLE to `DROP FUNCTION`. PostgreSQL records dependencies
-- for RLS policy expressions but NOT for a name inside a string-literal
-- function body. The drop in section 5 would succeed with either of these
-- still pointing at `public.no_block`, and the caller would raise
-- `42883 function does not exist` on its next live invocation. Nothing would
-- raise at apply time. Nothing would log. Migration 198 shipped exactly this.
--
-- Plan 06 Part A2's G-block enumerates `pg_proc.prosrc` in production before
-- the owner applies this file, and asserts the set is EXACTLY these two.

-- ─── 3a. public.green_room_can_view_post(uuid, uuid) ─────────────────────
--
-- BODY COPIED FROM MIGRATION 209, **NOT** FROM MIGRATION 076.
--
-- Migration 209 added the Tier-2 caller-identity binding to this function.
-- Copying the older 076 body would SILENTLY REVERT it and re-open the
-- cross-user disclosure Tier 2 closed one migration ago — while every
-- relocation check in this file still passed. That is the single most likely
-- silent regression in the whole phase, so it carries its own test assertion
-- (assertion 10) and its own Part A2 check (the B-block).
--
-- EXACTLY ONE THING CHANGES relative to 209: the `no_block(p_viewer,
-- p.author_id)` call is now schema-qualified to the relocated helper.
--
-- The nested `public.green_room_post_matches_custom_audience(p.id, p_viewer)`
-- call is LEFT ALONE. It stays in `public`, where migration 208 revoked
-- EXECUTE on it from `authenticated`, and it remains reachable from this body
-- because a SECURITY DEFINER body executes with the privileges of the function
-- OWNER. DO NOT grant it back and DO NOT relocate it here.
--
-- The parameter is `p_viewer`, not `p_uid` (migration 076 named it). CREATE OR
-- REPLACE cannot rename a parameter, and a body written against the wrong name
-- fails to apply at best.
--
-- The `auth.role() = 'service_role'` disjunct is load-bearing, not decorative:
-- `lib/trust-safety/reports.ts` calls this function through the SERVICE client
-- with a viewer who is not the caller, and `auth.uid()` is NULL on a service
-- connection. A diff of this function with no `auth.role()` reference in it is
-- the warning sign.
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
          AND private.no_block(p_viewer, p.author_id)
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

-- Grant posture restated, matching migration 209 exactly. `authenticated`
-- KEEPS EXECUTE: twelve RLS policies name this function, and a policy
-- expression runs as the QUERYING role — revoking would raise
-- `42501 permission denied for function` on every read those policies gate.
REVOKE EXECUTE ON FUNCTION public.green_room_can_view_post(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.green_room_can_view_post(uuid, uuid) TO authenticated;

-- ─── 3b. public.discover_profile_id_by_email(text) ───────────────────────
--
-- BODY COPIED VERBATIM FROM MIGRATION 149, with EXACTLY ONE change: the
-- `no_block(auth.uid(), profile.id)` call is schema-qualified to the relocated
-- helper.
--
-- Owner decision D2 declared this function OUT OF SCOPE for phase 38.0.3
-- because it is already correct — it is the MODEL the phase copies (it binds
-- `auth.uid()` directly rather than accepting an identity parameter, and it
-- already carries the full revoke/grant posture). Nothing here changes that.
-- This is a mechanical call-target retarget and nothing else, and assertion 11
-- of the migration-210 test is what makes that claim CHECKABLE rather than
-- merely asserted: it diffs this body against migration 149's after
-- normalising the helper qualifier.
CREATE OR REPLACE FUNCTION public.discover_profile_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profile.id
  FROM auth.users account
  JOIN public.user_profiles profile ON profile.id = account.id
  WHERE p_email IS NOT NULL
    AND char_length(trim(p_email)) BETWEEN 3 AND 254
    AND account.deleted_at IS NULL
    AND lower(account.email) = lower(trim(p_email))
    AND profile.id <> auth.uid()
    AND profile.is_public = true
    AND private.no_block(auth.uid(), profile.id)
    AND (
      profile.profile_visibility = 'public'
      OR (
        profile.profile_visibility = 'connections_only'
        AND EXISTS (
          SELECT 1
          FROM public.connections connection
          WHERE connection.status = 'accepted'
            AND (
              (connection.requester_id = auth.uid() AND connection.addressee_id = profile.id)
              OR (connection.addressee_id = auth.uid() AND connection.requester_id = profile.id)
            )
        )
      )
    )
  LIMIT 1
$$;

-- Migration 149's exact posture, restated verbatim (REVOKE ALL, not REVOKE
-- EXECUTE — reproduced as it was written rather than normalised).
REVOKE ALL ON FUNCTION public.discover_profile_id_by_email(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discover_profile_id_by_email(TEXT)
  TO authenticated;


-- ─── SECTION 4 — THE ELEVEN LIVE POLICIES ────────────────────────────────
--
-- Every policy in production whose predicate names `no_block`, dropped and
-- recreated with the helper call re-qualified to the relocated schema and
-- NOTHING ELSE changed. The `FOR` clause, the `TO` clause (or its deliberate
-- absence) and the predicate are reproduced exactly from each policy's LATEST
-- definition:
--
--   follows_insert_own                   public.follows                  038
--   wall_insert_author                   public.wall_posts               038
--   endo_insert_author                   public.endorsements             038
--   dmt_insert_participant               public.dm_threads               038
--   dmm_insert_sender                    public.dm_messages              038
--   connections_insert_own               public.connections              044
--   green_room_comments_select_visible   public.green_room_comments      060
--   green_room_reactions_select_visible  public.green_room_reactions     060
--   green_room_reposts_select_visible    public.green_room_reposts       060
--   rc_select_public                     public.release_comments         061
--   rc_insert_author                     public.release_comments         061
--
-- Migration 057 also created the three green_room `*_select_visible` policies,
-- but migration 060 superseded all three. Latest-definition-wins: copying 057
-- would silently revert 060's block-visibility work.
--
-- TWO THINGS ABOUT THIS SECTION THAT ARE EASY TO GET WRONG:
--
-- 1. QUALIFICATION. Migrations 038, 044 and 061 call the helper UNQUALIFIED.
--    That resolved through the then-current `search_path` at policy-creation
--    time. The replacements below qualify it EXPLICITLY with the new schema.
--    An unqualified name here would resolve back to `public` while the
--    `public` copy still exists — this section runs before section 5 — and
--    would then fail the moment section 5 drops it. Qualified, or broken.
--
-- 2. `DROP POLICY` IS WRITTEN PLAIN, NOT `IF EXISTS`. A policy that production
--    does not have must raise LOUDLY here rather than be skipped in silence.
--    A silent skip followed by a successful CREATE would mean this migration
--    invented a policy nobody reviewed, on a table nobody expected.
--
-- A PRE-EXISTING OBSERVATION, RECORDED AND DELIBERATELY NOT FIXED HERE.
-- `rc_select_public` carries NO `TO` clause, so it applies to PUBLIC, which
-- includes `anon` — and `anon` has never held EXECUTE on `public.no_block`
-- (migration 035 grants `authenticated` only). Anonymous reads of
-- `release_comments` therefore ALREADY FAIL TODAY: plan 03's Part B row B12
-- captured the pre-state as `SQLSTATE 42501 permission denied for function
-- no_block` as `anon`. After this migration `anon` additionally lacks USAGE on
-- the relocated schema, so the read still fails — behaviour preserved, error
-- text possibly different. Plan 06's Part B2 must reproduce that baseline.
-- DO NOT grant `anon` access to "make it work": that would be a functional
-- change outside this phase's mandate and could surface comments that are
-- invisible today. It is a finding for the owner, not a bug to fix here. The
-- absence of the `TO` clause is reproduced exactly below and is pinned by
-- assertion 7 of the migration-210 test.

-- ─── 4.1 follows_insert_own (public.follows) — from migration 038 ────────
DROP POLICY "follows_insert_own" ON public.follows;
CREATE POLICY "follows_insert_own" ON public.follows FOR INSERT TO authenticated
  WITH CHECK (follower_id = auth.uid() AND private.no_block(auth.uid(), followee_id));

-- ─── 4.2 wall_insert_author (public.wall_posts) — from migration 038 ─────
DROP POLICY "wall_insert_author" ON public.wall_posts;
CREATE POLICY "wall_insert_author" ON public.wall_posts FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND private.no_block(auth.uid(), profile_id));

-- ─── 4.3 endo_insert_author (public.endorsements) — from migration 038 ───
DROP POLICY "endo_insert_author" ON public.endorsements;
CREATE POLICY "endo_insert_author" ON public.endorsements FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND private.no_block(auth.uid(), profile_id));

-- ─── 4.4 dmt_insert_participant (public.dm_threads) — from migration 038 ─
-- a_id/b_id are canonically ordered (a_id < b_id), not caller/other — so the
-- "other party" is resolved by a CASE expression sitting INSIDE the helper's
-- second argument. That CASE is reproduced character for character; it is the
-- most intricate of the eleven predicates and the one most likely to be
-- mis-copied, which is why the drift guard (assertion 9) exists.
DROP POLICY "dmt_insert_participant" ON public.dm_threads;
CREATE POLICY "dmt_insert_participant" ON public.dm_threads FOR INSERT TO authenticated
  WITH CHECK (
    (a_id = auth.uid() OR b_id = auth.uid())
    AND private.no_block(auth.uid(), CASE WHEN a_id = auth.uid() THEN b_id ELSE a_id END)
  );

-- ─── 4.5 dmm_insert_sender (public.dm_messages) — from migration 038 ─────
-- The helper is called inside an EXISTS subquery over `dm_threads`, so that a
-- block placed AFTER a thread already exists still rejects new messages posted
-- to that thread rather than only gating thread creation.
--
-- `dm_threads` is referenced UNQUALIFIED here, exactly as migration 038 wrote
-- it, and that is correct: this is a POLICY EXPRESSION, not a SECURITY DEFINER
-- body with `SET search_path = ''`. Qualifying it would be an unrelated change
-- smuggled in under a relocation, and the drift guard would catch it.
DROP POLICY "dmm_insert_sender" ON public.dm_messages;
CREATE POLICY "dmm_insert_sender" ON public.dm_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND EXISTS (
    SELECT 1 FROM dm_threads t
    WHERE t.id = thread_id
      AND (t.a_id = auth.uid() OR t.b_id = auth.uid())
      AND private.no_block(auth.uid(), CASE WHEN t.a_id = auth.uid() THEN t.b_id ELSE t.a_id END)
  ));

-- ─── 4.6 connections_insert_own (public.connections) — migration 044 ─────
DROP POLICY "connections_insert_own" ON public.connections;
CREATE POLICY "connections_insert_own" ON public.connections FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() AND private.no_block(auth.uid(), addressee_id));

-- ─── 4.7 green_room_comments_select_visible — migration 060 ──────────────
-- Also calls `public.green_room_can_view_post`. That call STAYS IN `public`:
-- the function is not relocated by this file, it is only replaced in section
-- 3a, and it is one of the thirteen Tier-2 helpers that must keep its EXECUTE
-- grant precisely because policies like this one name it.
DROP POLICY "green_room_comments_select_visible" ON public.green_room_comments;
CREATE POLICY "green_room_comments_select_visible" ON public.green_room_comments FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND moderation_status = 'visible'
    AND public.green_room_can_view_post(post_id, auth.uid())
    AND private.no_block(auth.uid(), author_id)
  );

-- ─── 4.8 green_room_reactions_select_visible — migration 060 ─────────────
DROP POLICY "green_room_reactions_select_visible" ON public.green_room_reactions;
CREATE POLICY "green_room_reactions_select_visible" ON public.green_room_reactions FOR SELECT TO authenticated
  USING (
    public.green_room_can_view_post(post_id, auth.uid())
    AND private.no_block(auth.uid(), user_id)
  );

-- ─── 4.9 green_room_reposts_select_visible — migration 060 ───────────────
DROP POLICY "green_room_reposts_select_visible" ON public.green_room_reposts;
CREATE POLICY "green_room_reposts_select_visible" ON public.green_room_reposts FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.green_room_can_view_post(original_post_id, auth.uid())
    AND private.no_block(auth.uid(), author_id)
  );

-- ─── 4.10 rc_select_public (public.release_comments) — migration 061 ─────
-- TWO helper calls in ONE policy, and it is the only policy of the eleven with
-- two. They check different relationships and dropping either would silently
-- remove a block check:
--   viewer <-> release OWNER   (the call inside the EXISTS)
--   viewer <-> comment AUTHOR  (the trailing call)
--
-- NO `TO` CLAUSE. This is deliberate and reproduced exactly. See the
-- pre-existing observation above; do not "tidy" this to `TO authenticated`.
DROP POLICY "rc_select_public" ON public.release_comments;
CREATE POLICY "rc_select_public" ON public.release_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vault_projects p
      WHERE p.id = project_id
        AND (p.is_public OR p.user_id = auth.uid())
        AND private.no_block(auth.uid(), p.user_id)
    )
    AND private.no_block(auth.uid(), author_id)
  );

-- ─── 4.11 rc_insert_author (public.release_comments) — migration 061 ─────
DROP POLICY "rc_insert_author" ON public.release_comments;
CREATE POLICY "rc_insert_author" ON public.release_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM vault_projects p
      WHERE p.id = project_id
        AND private.no_block(auth.uid(), p.user_id)
    )
  );


-- ─── SECTION 5 — THE DROP ────────────────────────────────────────────────
--
-- NO MODIFIER IS WRITTEN. Not a cascading one, and not `RESTRICT` either —
-- restrictive IS the default, and spelling it out would suggest the default
-- had been considered and overridden rather than relied upon.
--
-- THIS STATEMENT IS THE VERIFICATION, NOT A STEP THAT NEEDS ONE.
-- PostgreSQL's CreatePolicy and AlterPolicy record `DEPENDENCY_NORMAL` entries
-- for both the USING and the WITH CHECK expression, and `DROP FUNCTION`
-- defaults to REFUSING while any object depends on it. So a policy missed by
-- section 4 makes this statement fail with `2BP01` and a `DETAIL:` line naming
-- every policy still referencing the function. Nothing is lost; nothing is
-- half-applied that a re-paste cannot finish.
--
-- IF IT REFUSES, THAT IS SUCCESS. Read the DETAIL, add the named policy to
-- section 4, re-apply. Do NOT force it.
--
-- A CASCADING DROP IS FORBIDDEN HERE AND ANYWHERE NEAR RLS. Cascading a policy
-- away leaves its table with ZERO policies, and with RLS enabled that is
-- default-deny: a silent, TOTAL read outage for every non-owner role. Fail
-- closed, but total, and invisible until a user reports an empty screen.
--
-- THE LIMIT OF THE GUARANTEE, RESTATED: self-verifying for POLICY references
-- ONLY. A reference inside a string-literal function body records no
-- dependency and would NOT block this statement. That is why section 3 comes
-- first, and why plan 06's Part A2 enumerates `pg_proc.prosrc` in production
-- before the owner applies this file.

DROP FUNCTION public.no_block(uuid, uuid);


-- ─── SECTION 6 — POSTGREST SCHEMA RELOAD ─────────────────────────────────
-- PostgREST caches the schema it introspects. Without this, the dropped RPC
-- stays apparently routable until the cache turns over on its own.
NOTIFY pgrst, 'reload schema';
