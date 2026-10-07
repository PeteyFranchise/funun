-- 238_readiness_trigger_definer_fix.sql
--
-- LIVE DEFECT: no authenticated caller can write tracks, vault_documents,
-- vault_assets or tool_outputs. Every such write raises
--
--   42501: permission denied for function calculate_vault_readiness
--
-- HOW IT HAPPENED
--
-- Migration 070 made calculate_vault_readiness() SECURITY DEFINER (good --
-- it closed a real 42P17 RLS-recursion class) and, in the same breath,
-- revoked its EXECUTE grant (070:206):
--
--   REVOKE EXECUTE ON FUNCTION public.calculate_vault_readiness(uuid)
--     FROM PUBLIC, anon, authenticated;
--
-- 070's header justifies that revoke as follows:
--
--   "no app code calls it directly; every use is trigger-internal, which
--    does not require a role-level EXECUTE grant"
--
-- **The second half of that sentence is false.** A trigger function that is
-- SECURITY INVOKER executes as the INVOKING role, so a call it makes is
-- permission-checked against that role exactly like any other call. Being
-- "trigger-internal" waives nothing. Only a SECURITY DEFINER caller would
-- have made the claim true.
--
-- 070 flipped the callee and left both callers as INVOKER:
--
--   public.update_vault_readiness()            -- 001:434, SECURITY INVOKER
--   public.recompute_readiness_on_distributor() -- 017:11,  SECURITY INVOKER
--
-- so the revoke took effect against the very path that needed the privilege.
--
-- BLAST RADIUS -- four tables, via 001:446-460
--
--   tracks_affect_readiness   AFTER INSERT OR UPDATE OR DELETE ON tracks
--   docs_affect_readiness     AFTER INSERT OR UPDATE        ON vault_documents
--   assets_affect_readiness   AFTER INSERT                  ON vault_assets
--   outputs_affect_readiness  AFTER INSERT                  ON tool_outputs
--
-- plus distributor_affects_readiness (017:22) AFTER UPDATE OF distributor ON
-- vault_projects.
--
-- Every authenticated route that touches those tables is affected: track
-- creation, the track PATCH, both audio paths, the ISRC route, the identifier
-- generator, document create/update/upload, asset upload and tool-output
-- writes.
--
-- HOW IT WAS FOUND
--
-- Accidentally, on 2026-10-06, while behaviourally verifying migration 235.
-- Two probes that were supposed to SUCCEED (an editor editing a title, an
-- owner editing writers) both failed with 42501. The first harness logged only
-- the SQLSTATE, which cannot tell an RLS refusal from a guard refusal from
-- this; logging sqlerrm named the function immediately.
--
-- This is the strongest argument yet for the must-succeed half of a probe
-- set. Had migration 235 been verified with refusal probes alone, all of them
-- would have "passed" -- against a table nobody could write at all -- and this
-- defect would have stayed invisible.
--
-- WHY IT HAS NOT BEEN REPORTED
--
-- Production currently holds no tracks under the owner's projects, so the
-- path is almost certainly unexercised rather than quietly failing for users.
-- That is luck, not design: the first artist to upload a track would have hit
-- it. The owner should still confirm the live counts (see the probe footer).
--
-- THE FIX
--
-- Give both callers the same posture 070 gave the callee: SECURITY DEFINER,
-- SET search_path = '', every reference schema-qualified, and EXECUTE revoked
-- because they are trigger-internal -- a claim that IS true for a trigger
-- function, which Postgres invokes directly rather than through a call site
-- subject to EXECUTE.
--
-- The bodies are otherwise byte-equivalent to 001:434-444 and 017:11-21. No
-- scoring logic changes, so no score recompute is required; this is an
-- access-control change only, exactly as 070 characterised itself.
--
-- A NOTE ON WHAT DEFINER BUYS HERE BEYOND THE GRANT
--
-- update_vault_readiness() also does `UPDATE vault_projects`. As INVOKER that
-- write is subject to vault_projects' RLS, so a co-owner or editor writing a
-- track in someone else's project would silently fail to refresh the score
-- even once the EXECUTE problem is gone. DEFINER fixes that too. A
-- system-computed score written by a trigger is exactly the kind of value
-- that should not depend on the writer's row-level reach.

-- ─── (1) update_vault_readiness -- tracks / documents / assets / outputs ──

CREATE OR REPLACE FUNCTION public.update_vault_readiness()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.vault_projects
     SET vault_readiness_score = public.calculate_vault_readiness(
       COALESCE(NEW.project_id, OLD.project_id)
     )
   WHERE id = COALESCE(NEW.project_id, OLD.project_id);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_vault_readiness() IS
  'AFTER-trigger wrapper that refreshes vault_projects.vault_readiness_score for the project a changed row belongs to. SECURITY DEFINER since migration 238: migration 070 revoked EXECUTE on calculate_vault_readiness() from authenticated on the stated grounds that trigger-internal calls need no grant, which is untrue for a SECURITY INVOKER caller -- the result was that every authenticated write to tracks, vault_documents, vault_assets and tool_outputs raised 42501. DEFINER also lets the score refresh for a co-owner or editor writing in a project whose vault_projects row their RLS does not cover.';

REVOKE EXECUTE ON FUNCTION public.update_vault_readiness() FROM PUBLIC, anon, authenticated;

-- ─── (2) recompute_readiness_on_distributor -- vault_projects ─────────────

CREATE OR REPLACE FUNCTION public.recompute_readiness_on_distributor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.vault_projects
     SET vault_readiness_score = public.calculate_vault_readiness(NEW.id)
   WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.recompute_readiness_on_distributor() IS
  'AFTER UPDATE OF distributor trigger on vault_projects. SECURITY DEFINER since migration 238 for the same reason as update_vault_readiness(): it calls calculate_vault_readiness(), whose EXECUTE grant migration 070 revoked from authenticated.';

REVOKE EXECUTE ON FUNCTION public.recompute_readiness_on_distributor() FROM PUBLIC, anon, authenticated;

-- Triggers are not recreated: CREATE OR REPLACE FUNCTION keeps every existing
-- attachment, and recreating them would widen this migration's blast radius
-- for no benefit.

NOTIFY pgrst, 'reload schema';

-- ─── OWNER-RUN BEHAVIORAL VERIFICATION ────────────────────────────────────
--
-- First, record how exposed this actually was:
--
--   select count(*) as total_tracks,
--          count(*) filter (where updated_at > created_at + interval '2 seconds')
--            as ever_updated
--     from public.tracks;
--
-- Then, as an authenticated caller inside a rolled-back transaction:
--
--   P1  MUST SUCCEED -- owner UPDATEs a track's title
--   P2  MUST SUCCEED -- owner INSERTs a track
--   P3  MUST SUCCEED -- owner INSERTs a vault_document
--   P4  MUST SUCCEED -- the project's vault_readiness_score actually changed
--                       (proves the trigger RAN, not merely that it stopped
--                       raising -- a DEFINER function that silently no-ops
--                       would satisfy P1-P3 and still be broken)
--
-- P4 is the one that distinguishes "the error went away" from "the feature
-- works". Migration 227 is the standing lesson: the statement executed,
-- returned rows, and the answer was still wrong.
