-- ============================================================
-- Funūn — Wave 4: The Green Room (Phase 19: Profile & Identity Model Cleanup)
-- Migration 075: privilege hardening for the 072 claim functions + 074 flags table
--
-- Preflight of the Phase 19 human-gated push (Codex, 2026-07-24) found two
-- default-grant gaps in the pending migrations 072/074. Per project
-- convention (historical/pending migrations are immutable), the fix lands as
-- this NEW migration rather than editing 071–074. Both changes mirror the
-- established privilege-sweep pattern in migration 070 (and 064's DEFINER
-- EXECUTE lockdown). ACCESS-CONTROL ONLY — no function body or table shape
-- changes; REVOKE of an ungranted privilege is a Postgres no-op (safe +
-- reversible).
--
-- Gap 1 (072) — public.claim_collaborators(uuid,text) and
--   public.backfill_claimed_collaborators(uuid) are SECURITY DEFINER and
--   perform CROSS-USER writes driven by arbitrary p_user_id / p_email.
--   `CREATE OR REPLACE FUNCTION` preserves the pre-existing default PUBLIC
--   EXECUTE (migrations 026/051 never revoked it), so any authenticated
--   caller could RPC them directly and drive a cross-user write, bypassing
--   the /api/claim-collaborators route's server-derived id/email. No app code
--   calls these directly: the middleware route uses the SERVICE-ROLE client
--   (app/api/claim-collaborators/route.ts:24-25), and the signup trigger
--   handle_new_user() invokes them internally as its own (owner) definer —
--   neither needs a role-level EXECUTE grant to authenticated. Revoke from
--   PUBLIC/anon/authenticated; grant only service_role.
--
-- Gap 2 (074) — split_sheet_identity_flags' INSERT policy checked only
--   auth.uid() = flagged_by; it did NOT verify the target party belongs to
--   the caller, that the sheet is frozen, or its status. A direct
--   authenticated PostgREST insert could therefore bypass the route
--   (app/api/split-sheets/[id]/correction-flag/route.ts), which enforces all
--   of that server-side, and spam flags against arbitrary party rows. ALL
--   runtime access to this table is service-role (the route's insert and the
--   owner's staged-flag read at split-sheets/[id]/page.tsx:135) — there is no
--   session-client write or read — so flag writes are server-owned. Revoke
--   direct write privileges from authenticated/anon and drop the misleading
--   INSERT policy. The row-scoped SELECT policy is kept (harmless; future
--   authenticated reads for the flagger + sheet owner stay possible).
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push is this phase's human checkpoint (plan 19-07), applied with
-- 071–074 in filename order: 071 → 072 → 073 → 074 → 075.
-- ============================================================

-- ─── Gap 1: lock down the SECURITY DEFINER claim functions (072) ──────────
REVOKE EXECUTE ON FUNCTION public.claim_collaborators(uuid, text)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.backfill_claimed_collaborators(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_collaborators(uuid, text)      TO service_role;
GRANT  EXECUTE ON FUNCTION public.backfill_claimed_collaborators(uuid) TO service_role;

-- ─── Gap 2: make split_sheet_identity_flags writes server-owned (074) ─────
-- The INSERT policy was weaker than the route's authorization, and direct
-- authenticated writes are unnecessary (the route writes with the service
-- role). Drop the misleading policy and revoke direct write privileges;
-- TRUNCATE/TRIGGER swept too (defense-in-depth, per migration 070).
DROP POLICY IF EXISTS "Flagger can insert own flag" ON public.split_sheet_identity_flags;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER
  ON public.split_sheet_identity_flags FROM authenticated, anon;

-- Function EXECUTE + table privilege changes affect what PostgREST exposes.
NOTIFY pgrst, 'reload schema';
