-- ============================================================
-- Funūn — Phase 33 (The Playbook shell + IT Team monitoring
-- dashboard): widen funun_staff staff_role CHECK to add the
-- 'it' (IT Team) role
-- Migration 114
--
-- WHY: 33-CONTEXT.md D-01 (resolved during Phase 33 discussion) —
-- The Playbook's IT Team room (5 sub-pages, including the Monitoring
-- Dashboard) is gated to leadership + a new "IT" role. IT's Phase-33
-- authority is narrow: READ access to the IT Team room only (4 doc
-- pages + the Monitoring Dashboard) — it carries no write/curation
-- power anywhere in the app. The role model (funun_staff.staff_role,
-- migration 089; lib/admin/staff-role.ts's StaffRole union) is
-- deliberately extensible — this is its second extension, mirroring
-- migration 108's 'anr' addition exactly.
--
-- WHAT: widen funun_staff.staff_role's CHECK constraint to admit 'it'
-- alongside the four existing values, using the DROP CONSTRAINT / ADD
-- CONSTRAINT convention migration 096 established for capability_grants
-- and vault_documents.type (never edit a landed migration's constraint
-- in place). staff_role here remains a DISPLAY COPY of the authoritative
-- app_metadata.staff_role (migration 089's COMMENT ON TABLE) — this
-- migration only widens the DB-side display copy's CHECK; the
-- authoritative gate change is lib/admin/staff-role.ts's StaffRole union
-- (shipped in 33-01's commit, no gate — see 33-01-PLAN.md). No
-- funun_staff row is created with staff_role = 'it' by this migration;
-- that happens later via the normal staff-create flow
-- (app/api/admin/staff/route.ts) once the owner decides to onboard an
-- IT account.
--
-- T-33-01c (Elevation of Privilege): 'it' is additive and carries ONLY
-- read access to the IT Team room in this phase (all 5 IT-room pages,
-- gated requireStaff(['leadership','it']) per D-02) — it is never
-- granted any write/curation power anywhere in the app.
--
-- HUMAN-GATED — this project never runs `supabase db push` from an
-- agent (matches migrations 080/081/089/090/096/106/108's standing
-- convention). Draft + text-tested only; the owner reviews and pushes
-- via their normal Codex `supabase db push` flow. Do NOT edit migrations
-- 080-113 (already landed).
-- ============================================================

-- ─── funun_staff.staff_role: widen CHECK to add 'it' ───────────────────
-- Default Postgres constraint name for an inline column CHECK follows
-- migration 096's observed pattern (<table>_<column>_check); confirmed
-- against migration 108's DROP/ADD shape which already widened the
-- original migration 089 inline
-- `staff_role TEXT NOT NULL CHECK (staff_role IN ('leadership','ae','bd'))`.
ALTER TABLE public.funun_staff DROP CONSTRAINT IF EXISTS funun_staff_staff_role_check;

ALTER TABLE public.funun_staff ADD CONSTRAINT funun_staff_staff_role_check
  CHECK (staff_role IN ('leadership', 'ae', 'bd', 'anr', 'it'));

COMMENT ON CONSTRAINT funun_staff_staff_role_check ON public.funun_staff IS
  'Widened in migration 114 (Phase 33) to add ''it'' (IT Team) alongside migration 108''s ''anr'' addition and migration 089''s original leadership/ae/bd values. staff_role remains a DISPLAY COPY of the authoritative app_metadata.staff_role (089''s COMMENT ON TABLE) — any role change must still write BOTH in the same handler. ''it'' carries ONLY read access to The Playbook''s IT Team room in Phase 33 (all 5 IT-room pages including the Monitoring Dashboard, gated requireStaff([''leadership'',''it''])); it is never granted write/curation power anywhere in the app.';

NOTIFY pgrst, 'reload schema';
