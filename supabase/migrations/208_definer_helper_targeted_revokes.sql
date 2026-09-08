-- ============================================================
-- Migration 208: Phase 38.0.3 Tier 1 — targeted EXECUTE revokes on the four
--                SECURITY DEFINER helpers that NO RLS POLICY NAMES, plus the
--                drop of the one that nothing calls at all.
-- ============================================================
--
-- HUMAN-GATED. NO AGENT APPLIES THIS FILE. It was authored by an executor that
-- opened no database connection. The owner applies it, by hand, and only after
-- the PRE-RUN gate described at the bottom of this header has been run and
-- read.
--
-- NUMBERING NOTE. Phase 38.0.3's plans were written expecting to claim 207.
-- 207 was taken between planning and execution by the parallel Playbook
-- workstream, whose candidate migration lives at
-- .planning/quick/260908-playbook-releases-27-31/207_playbook_operational_v1.sql
-- with a paired untracked test (__tests__/migration-207-playbook-operational-v1.test.ts).
-- The Playbook candidate chain is 201, 202, 204, 205, 206, 207. This file
-- therefore claims 208, re-verified at execution time against BOTH
-- `ls supabase/migrations/` and `git status --porcelain`, per owner decision D5.
--
-- ─── THE TRAP, AND WHY THIS FILE IS ITS ONE DOCUMENTED EXEMPTION ──────────
--
-- `38.0.3-SCOPE.md` states a rule in capital letters:
--
--     THE TRAP -- do not blanket-revoke. "Revoking EXECUTE from
--     `authenticated` would take large parts of the app down... Any plan that
--     opens with 'REVOKE from anon, authenticated' is wrong and must be
--     rejected at plan-check."
--
-- THAT RULE IS CORRECT AND IT IS NOT WEAKENED HERE. It applies to a helper if
-- and only if AN RLS POLICY NAMES THAT HELPER. PostgreSQL's Row Security
-- Policies documentation is explicit that policy expressions "are run ... with
-- the privileges of the user running the query", so a role that cannot EXECUTE
-- a helper its policy calls gets `42501 permission denied for function` on
-- every read that policy gates. That is real, it is why the next migration in
-- this phase BINDS thirteen helpers rather than revoking them, and it is why
-- no helper in that set appears in this file.
--
-- The four functions below are named by ZERO policies. Their only callers are
-- other SECURITY DEFINER bodies, and a definer body executes with the
-- privileges of the function's OWNER, not the caller's -- so the caller does
-- not need EXECUTE for those calls to keep succeeding. PostgreSQL, Privileges:
-- EXECUTE is "the only type of privilege that is applicable to functions".
--
-- THE PROOF IS A TEST IN THIS REPO, NOT A CLAIM IN A PLAN.
-- `__tests__/rls-helper-callsites.test.ts`, assertion (b), re-derives the
-- zero-policy-call-site count on every `npm test` by parsing all migrations
-- with line comments stripped and dollar-quoted regions mapped. If that
-- assertion ever goes red, THIS MIGRATION BECAME WRONG RETROACTIVELY and a
-- policy is about to fail. The restated rule the phase now operates under:
--
--     No blanket revoke. A revoke is permitted only for a function whose
--     policy call-site count is PROVEN ZERO BY A TEST IN THE REPO.
--
-- ─── PER-FUNCTION EVIDENCE ────────────────────────────────────────────────
--
-- Measured over all 200 migrations, line comments stripped first, dollar
-- regions mapped (38.0.3-RESEARCH.md section Q1; reproduced permanently by
-- __tests__/rls-helper-callsites.test.ts):
--
--   function                                   policy sites   definer-body callers
--   -----------------------------------------  ------------   --------------------
--   workspace_access_enabled()                       0                 11
--   workspace_grant_lineage_live(uuid)               0                  2
--   green_room_post_matches_custom_audience(2)       0                  1
--   workspace_roster_relationship_is_live(2)         0                  0  <- dead
--
-- The eleven definer bodies that call workspace_access_enabled() and keep
-- working unchanged after this revoke: workspace_project_permission,
-- workspace_catalogue_page, workspace_audit_page, workspace_roster_page,
-- workspace_access_permitted, workspace_create, workspace_nominate_owner,
-- workspace_change_member_role_or_status, workspace_respond_ownership_nomination,
-- workspace_revoke_invitation, workspace_transition_roster_relationship.
--
-- The two that call workspace_grant_lineage_live(uuid):
-- workspace_project_permission (43 references, the busiest helper in the
-- schema) and workspace_catalogue_page.
--
-- The one that calls green_room_post_matches_custom_audience(uuid, uuid):
-- green_room_can_view_post.
--
-- Every one of those fourteen callers is itself SECURITY DEFINER, so every one
-- of those calls runs as the OWNER. `authenticated` loses the ability to call
-- these four DIRECTLY over PostgREST and loses nothing else.
--
-- ─── WHAT WAS ACTUALLY EXPOSED ───────────────────────────────────────────
--
-- PostgREST turns every function in `public` that the requesting role can
-- execute into an HTTP RPC endpoint. So, to anyone holding the public anon key:
--
--   workspace_access_enabled()                 -- "is the D-56 workspace switch
--                                                 on?" Low value, free to close.
--   workspace_grant_lineage_live(uuid)         -- "is this consent chain live?"
--                                                 for any grant id.
--   green_room_post_matches_custom_audience()  -- "is user X in post P's custom
--                                                 audience?" -- discloses an
--                                                 author's private audience
--                                                 construction: roles, genres,
--                                                 locations, explicit people.
--   workspace_roster_relationship_is_live()    -- "does workspace W have a live
--                                                 roster relationship with user
--                                                 U?" for arbitrary pairs.
--
-- None of the four writes. This is information disclosure of the authorization
-- graph, not a write bypass. Migration 185's own comment already stated the
-- intent -- "Intended for RLS policy USING clauses ..., not a client-invoked
-- RPC." The intent was right. NOTHING ENFORCED IT. These comments now describe
-- an enforced state.
--
-- ─── WHY `anon` AND `authenticated` ARE NAMED, NOT JUST PUBLIC ───────────
--
-- This is owner decision D2's posture -- migration 149's shape -- applied
-- verbatim. Supabase grants EXECUTE to `anon` and `authenticated` DIRECTLY, and
-- `REVOKE ... FROM PUBLIC` does not remove a direct role grant. That single
-- omission is exactly how `apply_to_opportunity_atomic` stayed open from
-- migration 047 (2024) until 2026-09-08: 047 revoked FROM PUBLIC, the repo
-- therefore looked correct, and production had direct grants the whole time.
-- Every revoke below names all three.
--
-- NO GRANT IS ISSUED ANYWHERE IN THIS FILE. The absence of a grant is the
-- point of the file, and the paired test asserts the count of GRANT statements
-- here is zero -- not "no grant to authenticated", zero grants, full stop.
--
-- This migration replaces NO function body. It contains no
-- CREATE OR REPLACE FUNCTION. It changes reachability, never behaviour.
--
-- ─── THE DROP, AND WHAT TO DO IF IT REFUSES ──────────────────────────────
--
-- `workspace_roster_relationship_is_live(uuid, uuid)` was created by migration
-- 183 for migration 186's three-hop helper to join through. Migration 192
-- rewrote that helper (v2) and inlined the relationship check; 197 rewrote it
-- again (v3). The predicate was left behind. It has zero callers of any kind
-- anywhere in the repo -- zero policies, zero function bodies, zero
-- application code. The only remaining textual references are prose comments
-- in migration 183 and in app/api/workspaces/[workspaceId]/roster/route.ts.
--
-- The DROP below is written with NO DROP MODIFIER AT ALL, so PostgreSQL's
-- DEFAULT RESTRICTIVE behaviour applies. That default is the verification, not
-- a stylistic choice: PostgreSQL records a dependency for every RLS policy
-- expression (recordDependencyOnExpr(... DEPENDENCY_NORMAL) in
-- src/backend/commands/policy.c, for both the USING and the WITH CHECK
-- expression), so a refusal with SQLSTATE 2BP01 would NAME every policy that
-- still references it. Writing RESTRICT explicitly is deliberately avoided so
-- that a future reader cannot mistake the default for an oversight and
-- "helpfully" change it.
--
-- IF THE DROP REFUSES WITH 2BP01, OWNER:
--   1. STOP. Do not force it.
--   2. DO NOT add the recursive drop modifier. With RLS enabled, cascading a
--      policy away does not open the table -- it leaves the table DEFAULT-DENY,
--      which is a silent total read outage for every non-owner role.
--   3. Paste the `DETAIL:` line verbatim into the plan SUMMARY. It is the
--      evidence of what actually depends on the function.
--   4. Apply this fallback instead, and nothing else:
--
--        REVOKE EXECUTE ON FUNCTION
--          public.workspace_roster_relationship_is_live(uuid, uuid)
--          FROM PUBLIC, anon, authenticated;
--
--      That closes the endpoint without removing the function, which is the
--      whole security benefit; the drop is only hygiene on top of it.
--
-- RESIDUAL RISK, STATED HONESTLY. The default restrictive mode is
-- self-verifying for POLICY references ONLY. This repo writes every function
-- body as a string-literal `AS $$ ... $$` block, and PostgreSQL's own
-- CREATE FUNCTION documentation says that form "may leave dangling functions"
-- because it does not track dependencies on objects used in the body. A
-- BODY-LEVEL caller would therefore NOT block this drop -- it would succeed
-- cleanly and then raise `42883 function does not exist` on the first live
-- call. That is the migration-198 failure shape this phase exists to prevent,
-- and it is why the PRE-RUN below is mandatory rather than advisory, and why
-- research assumption A7 is closed there rather than here.
--
-- ─── MANDATORY PRE-RUN BEFORE APPLYING THIS FILE ─────────────────────────
--
-- Ship plan 03 FIRST and run its Part A as a PRE-RUN, before applying anything.
-- Confirm three gates in that output:
--
--   E-block: ZERO body callers for workspace_roster_relationship_is_live
--            (pg_proc.prosrc enumeration). If it shows a caller, DO NOT apply
--            the drop -- use the revoke fallback above.
--   C-block: no event trigger grants EXECUTE (research assumption A1). If one
--            does, this migration is not durable and the phase needs a
--            different mechanism.
--   D-block: no UNEXPECTED policy -- no production policy that exists in no
--            migration file (research assumption A5). The whole call-site
--            analysis, and therefore assertion (b), is blind to one.
--
-- The grant rows in that pre-run WILL read FAIL. That is the point: it is the
-- evidence that the disclosure existed, and after this migration lands it
-- cannot be reconstructed.
--
-- ============================================================


-- ─── (1) workspace_access_enabled() ──────────────────────────────────────
-- Signature matches migration 186 line 183 exactly. A revoke against a
-- signature that does not exist is a SILENT NO-OP, and a silent no-op is the
-- exact failure mode this phase exists to fix.
REVOKE EXECUTE ON FUNCTION public.workspace_access_enabled() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.workspace_access_enabled() IS
  'D-56/WS-31 kill-switch reader: returns the single global boolean that gates every workspace code path. INTERNAL TO SECURITY DEFINER BODIES AND DELIBERATELY NOT CLIENT-CALLABLE -- migration 208 revoked EXECUTE from PUBLIC, anon and authenticated, and issues no grant. Its eleven callers (workspace_project_permission, workspace_catalogue_page, workspace_audit_page, workspace_roster_page, workspace_access_permitted, workspace_create, workspace_nominate_owner, workspace_change_member_role_or_status, workspace_respond_ownership_nomination, workspace_revoke_invitation, workspace_transition_roster_relationship) are all SECURITY DEFINER and therefore execute this as the function OWNER, needing no EXECUTE grant of their own. ZERO RLS policies name this function -- proved on every npm test by __tests__/rls-helper-callsites.test.ts assertion (b), which is what makes the revoke safe under 38.0.3-SCOPE.md''s TRAP rule.';


-- ─── (2) workspace_grant_lineage_live(uuid) ──────────────────────────────
-- Signature matches migration 192 line 147 exactly.
REVOKE EXECUTE ON FUNCTION public.workspace_grant_lineage_live(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.workspace_grant_lineage_live(uuid) IS
  'R-01/WSR-02 delegation-lineage re-validation: walks a grant chain and returns false when an ancestor is revoked or the chain has no live member-consent root. INTERNAL TO SECURITY DEFINER BODIES AND DELIBERATELY NOT CLIENT-CALLABLE -- migration 208 revoked EXECUTE from PUBLIC, anon and authenticated, and issues no grant. As an RPC it answered "is this consent chain live?" for any grant id held by anyone with the public anon key. Its two callers, workspace_project_permission (hop 6) and workspace_catalogue_page, are both SECURITY DEFINER and execute it as the function OWNER. ZERO RLS policies name this function -- proved on every npm test by __tests__/rls-helper-callsites.test.ts assertion (b).';


-- ─── (3) green_room_post_matches_custom_audience(uuid, uuid) ─────────────
-- Signature matches migration 060 line 91 (and 057 line 256) exactly.
REVOKE EXECUTE ON FUNCTION public.green_room_post_matches_custom_audience(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.green_room_post_matches_custom_audience(uuid, uuid) IS
  'Green Room custom-audience predicate: does this viewer match the audience the author constructed for this post (roles, genres, locations, explicit people lists). INTERNAL TO SECURITY DEFINER BODIES AND DELIBERATELY NOT CLIENT-CALLABLE -- migration 208 revoked EXECUTE from PUBLIC, anon and authenticated, and issues no grant. As an RPC it let anyone holding the public anon key probe an author''s PRIVATE AUDIENCE CONSTRUCTION one user at a time, which is the highest-value disclosure of the four functions migration 208 closes. Its sole caller, green_room_can_view_post, is SECURITY DEFINER and executes it as the function OWNER. ZERO RLS policies name this function -- proved on every npm test by __tests__/rls-helper-callsites.test.ts assertion (b).';


-- ─── (4) workspace_roster_relationship_is_live(uuid, uuid) — DROP ────────
-- Signature matches migration 183 line 195 exactly.
--
-- No drop modifier is written, so PostgreSQL's DEFAULT RESTRICTIVE behaviour
-- applies and the statement is self-verifying for policy references. See the
-- header for the 2BP01 fallback and for the string-literal-body caveat that
-- makes plan 03's Part A pre-run mandatory.
DROP FUNCTION public.workspace_roster_relationship_is_live(uuid, uuid);


-- ─── (5) Schema-cache reload ─────────────────────────────────────────────
-- PostgREST caches the schema it introspects. Without this, the three revoked
-- endpoints and the dropped one stay APPARENTLY LIVE until the cache turns
-- over on its own -- which would make a post-apply verification pass read
-- clean while the exposure was still reachable.
NOTIFY pgrst, 'reload schema';
