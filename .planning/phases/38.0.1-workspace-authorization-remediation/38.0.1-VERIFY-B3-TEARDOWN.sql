-- ============================================================
-- Phase 38.0.1 — VERIFICATION PART B, FILE 3 of 3: TEARDOWN
--
-- Run after B2. Removes ONLY the ffff0000-… fixtures B1 created,
-- and puts the D-56 kill switch back OFF.
--
-- On a disposable preview branch you may simply delete the branch
-- instead. Run this if you want the branch back to a clean state,
-- or if you ever ran B1 somewhere you did not intend.
-- ============================================================

UPDATE public.workspace_access_config SET enabled = FALSE;

-- The owner-floor guard is BEFORE DELETE OR UPDATE on workspace_members and
-- fires on cascading deletes too, so removing the fixture workspace would
-- abort with "A workspace must always have at least one active owner."
-- Disable it for the teardown only, then put it straight back.
ALTER TABLE public.workspace_members DISABLE TRIGGER guard_workspace_never_zero_owners;

DELETE FROM public.workspace_grants                WHERE id::text LIKE 'ffff0000-%';
DELETE FROM public.workspace_attachments           WHERE id::text LIKE 'ffff0000-%';
DELETE FROM public.workspace_roster_relationships  WHERE id::text LIKE 'ffff0000-%';
DELETE FROM public.workspace_members               WHERE id::text LIKE 'ffff0000-%';
DELETE FROM public.workspace_permission_requests   WHERE id::text LIKE 'ffff0000-%';
DELETE FROM public.workspaces                      WHERE id::text LIKE 'ffff0000-%';
DELETE FROM public.tracks                          WHERE id::text LIKE 'ffff0000-%';
DELETE FROM public.vault_projects                  WHERE id::text LIKE 'ffff0000-%';
DELETE FROM auth.users                             WHERE id::text LIKE 'ffff0000-%';

ALTER TABLE public.workspace_members ENABLE TRIGGER guard_workspace_never_zero_owners;

SELECT 'TORN DOWN.' AS status,
       (SELECT enabled FROM public.workspace_access_config) AS kill_switch_enabled,
       (SELECT count(*) FROM public.workspace_members)      AS members_remaining,
       (SELECT count(*) FROM public.workspace_grants)       AS grants_remaining;
-- kill_switch_enabled must read FALSE and both counts must read 0.
