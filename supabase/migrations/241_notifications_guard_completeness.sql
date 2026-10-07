-- 241_notifications_guard_completeness.sql
--
-- Migration 240's notifications guard was INCOMPLETE. It protected user_id,
-- type, data and created_at, and left seven columns open:
--
--   title, body, link, emailed, actor_id, actor_name, actor_avatar_url
--
-- So a recipient could still rewrite what a notification SAYS and who it
-- claims to be FROM -- which is precisely the provenance Pass 6's finding was
-- about. 240 closed the smaller half of its own stated goal.
--
-- HOW IT WAS MISSED, AND WHY THE TEST DID NOT CATCH IT
--
-- I listed the columns I remembered from the CREATE TABLE in migration 009
-- and never diffed that list against the live schema. title/body/link/emailed
-- are in that same CREATE TABLE (009:63-74) and I simply skipped them; the
-- three actor_* columns were added by a later ALTER.
--
-- 240's test asserted the guard "covers every column except read" but only
-- checked the four columns I had written. It restated my list back to me
-- rather than measuring it against the table -- a check that proves the code
-- matches the author's intent, which is exactly the kind that passes while
-- the intent is wrong.
--
-- The companion test for THIS migration derives the column list from the
-- migration corpus and requires each one to be either guarded or in an
-- explicit, named allowlist. That is the fix for the class; this file is the
-- fix for the instance.
--
-- Found while preparing 240's own behavioural probes, before they were run.
--
-- ALSO: opportunity_matches.notified_at. Set by the matcher; nothing client
-- -side writes it. `applied`, `applied_at` and `status` are deliberately left
-- writable -- an artist applying to an opportunity is a real client action,
-- and closing it would break a capability to fix nothing.

CREATE OR REPLACE FUNCTION public.notifications_guard_provenance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT := (SELECT auth.role());
  v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role';
  -- EVERY column except `read`. Positive list on purpose: a column added later
  -- is unguarded but visibly so, whereas an exclusion list would silently
  -- admit it. The paired test now checks this list against the corpus, so a
  -- new column makes the suite fail rather than quietly widening the surface.
  v_changing BOOLEAN :=
       NEW.user_id          IS DISTINCT FROM OLD.user_id
    OR NEW.type             IS DISTINCT FROM OLD.type
    OR NEW.title            IS DISTINCT FROM OLD.title
    OR NEW.body             IS DISTINCT FROM OLD.body
    OR NEW.link             IS DISTINCT FROM OLD.link
    OR NEW.data             IS DISTINCT FROM OLD.data
    OR NEW.emailed          IS DISTINCT FROM OLD.emailed
    OR NEW.created_at       IS DISTINCT FROM OLD.created_at
    OR NEW.actor_id         IS DISTINCT FROM OLD.actor_id
    OR NEW.actor_name       IS DISTINCT FROM OLD.actor_name
    OR NEW.actor_avatar_url IS DISTINCT FROM OLD.actor_avatar_url;
BEGIN
  IF v_changing AND NOT v_privileged THEN
    RAISE EXCEPTION 'notifications: only the read flag may be changed by a client; what a notification says, who it is from, and when it arrived are the record of what happened'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notifications_guard_provenance() IS
  'BEFORE UPDATE guard on public.notifications. Only the read flag is client-writable; title, body, link, data, emailed, type, user_id, created_at and the three actor_* snapshot columns are service-written and stay as filed. Migration 240 introduced this guard but covered only four of the eleven columns -- 241 completed it after the gap was found while preparing 240''s probes.';

CREATE OR REPLACE FUNCTION public.opportunity_matches_guard_computed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT := (SELECT auth.role());
  v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role';
  -- applied / applied_at / status stay writable: an artist applying to an
  -- opportunity is a real client action. notified_at joins the guarded set --
  -- the matcher stamps it and no client path writes it.
  v_changing BOOLEAN :=
       NEW.match_score    IS DISTINCT FROM OLD.match_score
    OR NEW.breakdown      IS DISTINCT FROM OLD.breakdown
    OR NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id
    OR NEW.project_id     IS DISTINCT FROM OLD.project_id
    OR NEW.user_id        IS DISTINCT FROM OLD.user_id
    OR NEW.notified_at    IS DISTINCT FROM OLD.notified_at;
BEGIN
  IF v_changing AND NOT v_privileged THEN
    RAISE EXCEPTION 'opportunity_matches.match_score, breakdown and notified_at are produced by the matcher and cannot be set by the artist they describe'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Triggers are not recreated: CREATE OR REPLACE FUNCTION keeps 240's existing
-- attachments, and recreating them would widen this migration for no benefit.

NOTIFY pgrst, 'reload schema';

-- ─── OWNER-RUN BEHAVIORAL VERIFICATION (supersedes 240's) ─────────────────
--
--   N1  MUST FAIL 42501  -- recipient rewrites title or body
--   N1b MUST FAIL 42501  -- recipient rewrites actor_name (who it is from)
--   N2  MUST SUCCEED     -- recipient sets read = true (the one live write)
--   N3  MUST SUCCEED     -- service_role rewrites anything
--
--   O1  MUST FAIL 42501  -- artist rewrites their own match_score
--   O1b MUST FAIL 42501  -- artist rewrites notified_at
--   O2  MUST SUCCEED     -- artist sets applied = true (a real client action)
--   O3  MUST SUCCEED     -- service_role updates match_score (the matcher)
--
-- O2 is new and matters: 241 widens the guarded set, and widening is exactly
-- when a capability gets closed by accident.
