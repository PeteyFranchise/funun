-- Migration 119: multi-role staff (Team Members redesign)
--
-- Deliberately overturns the earlier single-role model (D-03), per owner
-- decision: a Team Member may hold SEVERAL roles. Adds funun_staff.staff_roles
-- (the authoritative role SET) alongside the existing staff_role (kept as the
-- PRIMARY/display copy), and widens the primary CHECK to add the two new roles
-- 'legal' + 'tms' (people ops).
--
-- The auth gate reads app_metadata (staff_roles array; lib/admin/staff-role.ts),
-- NEVER this table — funun_staff stays a service-role-only DISPLAY COPY (089).
-- Any role change must write BOTH app_metadata.staff_roles AND these columns in
-- the same handler (createStaffAccount + the edit endpoint); staff_role holds
-- the PRIMARY (highest-priority) element of staff_roles.
--
-- HUMAN-GATED PUSH. Deploys together with the app code that reads/writes
-- staff_roles (Team Members port) — either alone is an inconsistent state.

-- ─── staff_role (primary / display copy): widen CHECK to add 'legal' + 'tms' ─
-- Same DROP/ADD shape migrations 108 ('anr') and 114 ('it') used.
ALTER TABLE public.funun_staff DROP CONSTRAINT IF EXISTS funun_staff_staff_role_check;

ALTER TABLE public.funun_staff ADD CONSTRAINT funun_staff_staff_role_check
  CHECK (staff_role IN ('leadership', 'ae', 'bd', 'anr', 'it', 'legal', 'tms'));

-- ─── staff_roles (authoritative role SET) ──────────────────────────────────
ALTER TABLE public.funun_staff ADD COLUMN IF NOT EXISTS staff_roles TEXT[];

-- Backfill every existing row from its single primary role, then require it.
UPDATE public.funun_staff SET staff_roles = ARRAY[staff_role] WHERE staff_roles IS NULL;
ALTER TABLE public.funun_staff ALTER COLUMN staff_roles SET NOT NULL;

-- At least one role, and every element one of the seven valid roles (<@ = "is
-- contained by"). Mirrors the primary CHECK's value list.
ALTER TABLE public.funun_staff ADD CONSTRAINT funun_staff_staff_roles_valid
  CHECK (
    array_length(staff_roles, 1) >= 1
    AND staff_roles <@ ARRAY['leadership', 'ae', 'bd', 'anr', 'it', 'legal', 'tms']::text[]
  );

-- Deploy-safety: keep the pre-redesign code (which writes only staff_role, not
-- staff_roles) able to INSERT during the window between this push and the new
-- code going live — backfill staff_roles from the single staff_role on any
-- INSERT that omits it. A no-op for the new write path (which always sets
-- staff_roles), so it never masks a genuinely missing role.
CREATE OR REPLACE FUNCTION public.funun_staff_default_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.staff_roles IS NULL AND NEW.staff_role IS NOT NULL THEN
    NEW.staff_roles := ARRAY[NEW.staff_role];
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS funun_staff_default_roles_trg ON public.funun_staff;
CREATE TRIGGER funun_staff_default_roles_trg
  BEFORE INSERT ON public.funun_staff
  FOR EACH ROW EXECUTE FUNCTION public.funun_staff_default_roles();

COMMENT ON COLUMN public.funun_staff.staff_roles IS
  'Authoritative multi-role SET for a Team Member (Team Members redesign, migration 119). staff_role remains the PRIMARY (highest-priority) display copy; both these columns AND app_metadata.staff_roles must be written together in the same handler (createStaffAccount + the edit endpoint). The gate (lib/admin/staff-role.ts) reads app_metadata only — this table stays a service-role-only display copy (089).';

NOTIFY pgrst, 'reload schema';
