-- ============================================================
-- Funūn — Phase 30 (The Crate + Sync Library): widen funun_staff
-- staff_role CHECK to add the 'anr' (A&R) role
-- Migration 108
--
-- WHY: 30-CONTEXT.md "resolved_after_research" (Pete, 2026-08-13) — AE
-- tag proposals require approval by Leadership OR a new "A&R" role.
-- A&R's Phase-30 authority is narrow: approve/reject AE tag proposals
-- (30-06) only. Admit/reject curation stays leadership-only, unchanged.
-- The role model (funun_staff.staff_role, migration 089; lib/admin/
-- staff-role.ts's StaffRole union) is deliberately extensible — this is
-- its first extension beyond the original leadership/ae/bd set.
--
-- WHAT: widen funun_staff.staff_role's CHECK constraint to admit 'anr'
-- alongside the three existing values, using the DROP CONSTRAINT / ADD
-- CONSTRAINT convention migration 096 established for capability_grants
-- and vault_documents.type (never edit a landed migration's constraint
-- in place). staff_role here remains a DISPLAY COPY of the authoritative
-- app_metadata.staff_role (migration 089's COMMENT ON TABLE) — this
-- migration only widens the DB-side display copy's CHECK; the
-- authoritative gate change is lib/admin/staff-role.ts's StaffRole union
-- (shipped in this same plan's commit, no gate — see 30-03-PLAN.md Task
-- 2). No funun_staff row is created with staff_role = 'anr' by this
-- migration; that happens later via the normal staff-create flow
-- (app/api/admin/staff/route.ts) once the owner decides to onboard an
-- A&R account.
--
-- T-30-06 (Elevation of Privilege): 'anr' is additive and carries ONLY
-- tag-approval authority in this phase (30-06's approve/reject-proposal
-- route, gated requireStaff(['leadership','anr'])) — it is never granted
-- admit/reject/remove curation power, which stays leadership-only
-- (unchanged from migration 096/26-06).
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (matches migrations 080/081/089/090/096/106's standing convention).
-- Draft + text-tested only; the owner reviews and pushes via their normal
-- Codex `supabase db push` flow. Do NOT edit migrations 080-107 (already
-- landed/drafted this same plan).
-- ============================================================

-- ─── funun_staff.staff_role: widen CHECK to add 'anr' ─────────────────
-- Default Postgres constraint name for an inline column CHECK follows
-- migration 096's observed pattern (<table>_<column>_check); confirmed
-- against migration 089's unnamed inline
-- `staff_role TEXT NOT NULL CHECK (staff_role IN ('leadership','ae','bd'))`.
ALTER TABLE public.funun_staff DROP CONSTRAINT IF EXISTS funun_staff_staff_role_check;

ALTER TABLE public.funun_staff ADD CONSTRAINT funun_staff_staff_role_check
  CHECK (staff_role IN ('leadership', 'ae', 'bd', 'anr'));

COMMENT ON CONSTRAINT funun_staff_staff_role_check ON public.funun_staff IS
  'Widened in migration 108 (Phase 30) to add ''anr'' (A&R) alongside migration 089''s original leadership/ae/bd values. staff_role remains a DISPLAY COPY of the authoritative app_metadata.staff_role (089''s COMMENT ON TABLE) — any role change must still write BOTH in the same handler. ''anr'' carries ONLY tag-approval authority in Phase 30 (approve/reject AE tag proposals, 30-06); admit/reject/remove curation stays leadership-only.';

NOTIFY pgrst, 'reload schema';
