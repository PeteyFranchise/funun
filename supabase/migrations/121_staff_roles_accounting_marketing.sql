-- Migration 121: add 'accounting' + 'marketing' staff roles
--
-- Two new Team Member roles (owner request). Widens BOTH CHECK constraints on
-- funun_staff to accept them — the primary staff_role and the authoritative
-- staff_roles[] set (migration 119). Same DROP/ADD shape migrations 108
-- ('anr'), 114 ('it'), and 119 ('legal'/'tms') used.
--
-- The auth gate reads app_metadata (lib/admin/staff-role.ts), NEVER this table;
-- the code recognizing these roles is safe to ship before this push (it reads
-- app_metadata only). But WRITING a member with a new role requires this
-- migration (these CHECKs must allow it), so this is HUMAN-GATED and deploys
-- together with the app code that adds the roles.

-- ─── staff_role (primary / display copy): widen CHECK ──────────────────────
ALTER TABLE public.funun_staff DROP CONSTRAINT IF EXISTS funun_staff_staff_role_check;

ALTER TABLE public.funun_staff ADD CONSTRAINT funun_staff_staff_role_check
  CHECK (staff_role IN ('leadership', 'ae', 'bd', 'anr', 'it', 'legal', 'tms', 'accounting', 'marketing'));

-- ─── staff_roles (authoritative role SET): widen CHECK ─────────────────────
ALTER TABLE public.funun_staff DROP CONSTRAINT IF EXISTS funun_staff_staff_roles_valid;

ALTER TABLE public.funun_staff ADD CONSTRAINT funun_staff_staff_roles_valid
  CHECK (
    array_length(staff_roles, 1) >= 1
    AND staff_roles <@ ARRAY['leadership', 'ae', 'bd', 'anr', 'it', 'legal', 'tms', 'accounting', 'marketing']::text[]
  );

NOTIFY pgrst, 'reload schema';
