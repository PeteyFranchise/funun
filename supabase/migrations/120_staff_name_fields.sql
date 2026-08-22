-- Migration 120: structured first/last name on Team Members
--
-- The Add/Edit team-member form now captures First name + Last name (both
-- required) alongside display_name (optional — a nickname/alias; defaults to
-- "First Last"). Adds the two columns; display_name stays the authoritative
-- shown name. Nullable — existing rows predate the split and keep their
-- display_name only.
--
-- Additive + backward-compatible (old code just doesn't select/write these).
-- HUMAN-GATED PUSH; deploys with the app code that reads/writes them.

ALTER TABLE public.funun_staff ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.funun_staff ADD COLUMN IF NOT EXISTS last_name TEXT;

COMMENT ON COLUMN public.funun_staff.first_name IS
  'Team member first name (Add-team-member form, migration 120). display_name remains the authoritative shown name (a nickname/alias, or "First Last" when left blank).';
COMMENT ON COLUMN public.funun_staff.last_name IS
  'Team member last name (Add-team-member form, migration 120). See first_name.';

NOTIFY pgrst, 'reload schema';
