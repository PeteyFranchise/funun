-- Migration 139: pin the ownership column on works and vault_projects
--
-- ─── Why this exists ────────────────────────────────────────────────
-- The UPDATE policies on both parent tables (migration 078 for
-- vault_projects, migration 136 for works) authorize a row by the caller's
-- MEMBERSHIP, and their WITH CHECK re-uses that same membership test:
--
--   USING      ( auth.uid() = user_id OR <caller is a member> )
--   WITH CHECK ( auth.uid() = user_id OR <caller is a member> )
--
-- A Postgres UPDATE evaluates USING against the OLD row and WITH CHECK
-- against the NEW row. So a legitimately-added editor (vault_projects) or
-- contributor (works) can issue a DIRECT PostgREST update that rewrites
-- user_id to their own id: USING passes (they are a member of the old
-- row), and WITH CHECK passes because `auth.uid() = user_id` is now true
-- against the value they just wrote. They become the row's owner, which
-- unlocks the owner-only DELETE and membership administration. The app's
-- API allowlists fields and never lets this happen — but the database is
-- the real trust boundary, and a member holds their own JWT.
--
-- An RLS policy cannot fix this: policy expressions cannot reference OLD,
-- so there is no way to say "user_id must not change" in WITH CHECK. The
-- correct instrument is a BEFORE UPDATE trigger. A column-level GRANT
-- would also work but forces us to enumerate every legitimately-updatable
-- column on two wide tables and re-grant on every future column — a
-- standing regression risk. The guard below pins exactly the one column
-- that must never move under a plain update and leaves everything else
-- untouched, including for the owner.
--
-- There is no ownership-transfer feature today. If one is ever built it
-- must run through a dedicated, separately-authorized path (a
-- SECURITY DEFINER function owned by the table owner, which this trigger
-- does not fire against) — never a client UPDATE. Until then, ownership is
-- immutable for everyone, owner included.

CREATE OR REPLACE FUNCTION public.guard_owner_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- IS DISTINCT FROM is null-safe; user_id is NOT NULL on both tables, so
  -- this is a plain inequality in practice. A no-op update (same id) is
  -- allowed, so ordinary saves that happen to include user_id still pass.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'ownership is immutable; user_id cannot be changed by update'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_owner_immutable() IS
  'BEFORE UPDATE guard for parent tables whose UPDATE policy widens to members: rejects any change to user_id, closing the ownership-takeover path where a member rewrites user_id to themselves and passes WITH CHECK against the value they just wrote (migration 078 / 136 pattern). Trigger-internal only. Ownership transfer, if ever built, goes through a separately-authorized definer path, not a client update.';

-- Trigger-internal only: clients never call this directly, and the trigger
-- fires regardless of caller EXECUTE. Withhold the grant to match the
-- codebase's guard-function posture (migrations 070 / 126).
REVOKE EXECUTE ON FUNCTION public.guard_owner_immutable() FROM PUBLIC, anon, authenticated;

-- works — user_id is the owner; migration 136 widened UPDATE to any member.
DROP TRIGGER IF EXISTS guard_owner_immutable ON public.works;
CREATE TRIGGER guard_owner_immutable
  BEFORE UPDATE ON public.works
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_owner_immutable();

-- vault_projects — user_id is the owner; migration 078 widened UPDATE to
-- co-owner / editor members.
DROP TRIGGER IF EXISTS guard_owner_immutable ON public.vault_projects;
CREATE TRIGGER guard_owner_immutable
  BEFORE UPDATE ON public.vault_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_owner_immutable();

NOTIFY pgrst, 'reload schema';
