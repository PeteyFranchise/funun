-- ============================================================
-- Funūn — Wave 4: Cross-Account Collaboration & Split-Sheet ↔ Project Sync
-- Migration 079: auto-membership SECURITY DEFINER trigger — a claimed
--                collaborator who is a writer on a project-LINKED,
--                non-draft split sheet automatically gains a `viewer`
--                project_members row (② auto-membership, 21-CONTEXT.md).
--
-- An executor agent must NEVER run `supabase db push` for this
-- migration. The live push against the remote database is this plan's
-- blocking human checkpoint (21-02 Task 3), mirroring migrations
-- 058/062/063/066/067/070/078's "do not push from an executor agent"
-- convention. Sequenced strictly AFTER migration 078 (project_members
-- table + RLS foundation) is confirmed live (`supabase migration list`
-- LOCAL=REMOTE through 078) — this migration's INSERT target
-- (public.project_members) and its UNIQUE (project_id, user_id)
-- ON CONFLICT target do not exist until 078 has landed.
--
-- ─── THE VERIFIED-IDENTITY SIGNAL (21-RESEARCH.md Pitfall 2) ─────────────
-- The auto-membership decision reads naturally as "watch
-- split_sheet_parties.user_id" — that column is READ in three places in
-- this codebase but WRITTEN nowhere (not the create route, not the PATCH
-- route, not /api/approve/[token], not any migration/trigger). It is a
-- dead signal for every real user today. The only LIVE verified-identity
-- signal in this codebase is collaborators.claimed_by, set exclusively by
-- claim_collaborators() (migrations 026/072/076) on signup via a
-- case-insensitive email match against the signing-up user's own,
-- Supabase-Auth-verified account email — never a party's free-typed
-- `email` field. This is what "VERIFIED identity" already operationally
-- means in Funūn, and this migration keys auto-membership off it
-- exclusively: split_sheet_parties.collaborator_id -> collaborators.
-- claimed_by -> INSERT project_members(role='viewer').
--
-- ─── THE DRAFT-VISIBILITY GATE (21-RESEARCH.md Assumption A1 / P18-11) ───
-- A writer never gains project visibility while the linked sheet is still
-- a private, unsent draft (status = 'draft') — mirroring
-- fetchSplitSheetsForUser()'s existing `.neq('status', 'draft')` party-of
-- filter and P18-11's "a draft is invisible to non-initiators" rule. The
-- grant fires the moment the sheet's status leaves 'draft' (any non-draft
-- status), not only once fully executed — the initiator has shared the
-- sheet with the room at that point, which is the intended trigger.
--
-- ─── ONE FUNCTION, THREE FIRE SITES (mirrors migration 066's precedent) ──
-- The grant must be correct regardless of event ordering: a claimed
-- collaborator can be added as a party AFTER they claim, a party can be
-- added BEFORE they claim (then claim later), or a sheet can leave draft
-- after both already exist. A single SECURITY DEFINER function branches
-- on TG_TABLE_NAME and is attached to all three tables so the logic lives
-- in exactly one place — app-layer coordination across
-- claim_collaborators(), the split-sheet PATCH route, and the
-- send-for-approval route would risk missing one of the three orderings
-- (21-RESEARCH.md "Alternatives Considered").
--
-- IDEMPOTENCY: every INSERT below is guarded by
-- ON CONFLICT (project_id, user_id) DO NOTHING (project_members' own
-- UNIQUE constraint, migration 078) — re-firing from any ordering, or
-- re-saving an already-synced sheet, never double-inserts or errors.
-- ============================================================

-- ─── sync_project_membership_for_sheet() ──────────────────────────────
-- SECURITY DEFINER so it can write project_members on behalf of the
-- CLAIMED collaborator (a different user than whoever's write fired the
-- trigger — the party-add may be done by the sheet's initiator, the claim
-- transition by Supabase Auth's own signup flow) without requiring that
-- caller to hold an RLS grant on project_members directly (migration 078
-- REVOKEs all client INSERT/UPDATE/DELETE on that table by design). Every
-- write this function performs is scoped strictly by server-owned ids
-- read off the row that just changed (NEW.*) or resolved via a join
-- through them — never a client-supplied project_id/user_id — mirroring
-- split_sheet_party_response_confirms_collaborator()'s (066) exact
-- cross-user-write-scoped-by-a-server-owned-id discipline. SET
-- search_path = '' + fully-qualified public. table references prevent a
-- search_path hijack (T-08-04, matching every DEFINER function in this
-- codebase since migration 034).
CREATE OR REPLACE FUNCTION public.sync_project_membership_for_sheet()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'split_sheet_parties' THEN
    -- Fired on a party row insert/update (e.g. a party is added, or its
    -- collaborator_id is (re)assigned). Resolve the sheet + collaborator
    -- through NEW.split_sheet_id / NEW.collaborator_id.
    INSERT INTO public.project_members (project_id, user_id, role, added_by)
    SELECT ss.vault_project_id, c.claimed_by, 'viewer', NULL
    FROM public.split_sheets ss
    JOIN public.collaborators c ON c.id = NEW.collaborator_id
    WHERE ss.id = NEW.split_sheet_id
      AND ss.vault_project_id IS NOT NULL
      AND ss.status <> 'draft'
      AND c.claimed_by IS NOT NULL
    ON CONFLICT (project_id, user_id) DO NOTHING;

  ELSIF TG_TABLE_NAME = 'split_sheets' THEN
    -- Fired when a sheet's status leaves draft, or it becomes linked to a
    -- project (vault_project_id set). Fan out to EVERY party already on
    -- this sheet whose collaborator is claimed — any of them may already
    -- have been a party before the sheet was shared/linked.
    INSERT INTO public.project_members (project_id, user_id, role, added_by)
    SELECT NEW.vault_project_id, c.claimed_by, 'viewer', NULL
    FROM public.split_sheet_parties p
    JOIN public.collaborators c ON c.id = p.collaborator_id
    WHERE p.split_sheet_id = NEW.id
      AND NEW.vault_project_id IS NOT NULL
      AND NEW.status <> 'draft'
      AND c.claimed_by IS NOT NULL
    ON CONFLICT (project_id, user_id) DO NOTHING;

  ELSIF TG_TABLE_NAME = 'collaborators' THEN
    -- Fired when claimed_by transitions NULL -> set (signup, via
    -- claim_collaborators()). Fan out to EVERY linked, non-draft sheet
    -- this newly-claimed collaborator is already a party on — they may
    -- have been named on a shared sheet long before they signed up.
    INSERT INTO public.project_members (project_id, user_id, role, added_by)
    SELECT ss.vault_project_id, NEW.claimed_by, 'viewer', NULL
    FROM public.split_sheet_parties p
    JOIN public.split_sheets ss ON ss.id = p.split_sheet_id
    WHERE p.collaborator_id = NEW.id
      AND ss.vault_project_id IS NOT NULL
      AND ss.status <> 'draft'
      AND NEW.claimed_by IS NOT NULL
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-internal only — no app code calls this directly (matches
-- migration 070's calculate_vault_readiness() revoke-only posture, not
-- migration 078's is_project_owner/project_member_role grant-back
-- posture, since no RLS policy body needs to invoke this one as the
-- querying role). Revoking the default PostgREST RPC exposure prevents
-- any authenticated/anon caller from invoking it as a bare no-op RPC
-- (it does nothing useful called directly — TG_TABLE_NAME/NEW are only
-- meaningful inside an actual trigger firing).
REVOKE EXECUTE ON FUNCTION public.sync_project_membership_for_sheet() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sync_project_membership_for_sheet() IS
  'Auto-grants a viewer project_members row when a party on a project-linked, non-draft split sheet resolves through collaborator_id to a collaborators row whose claimed_by is set (the ONLY verified-identity signal in this codebase — never the party table''s own dead, never-written user_id column). Branches on TG_TABLE_NAME so one function serves all three event orderings (party added, sheet leaves draft/gets linked, collaborator claims). SECURITY DEFINER so it can write project_members on behalf of a different user than whoever triggered it; every write is scoped by server-owned ids off the row that changed. Trigger-internal only, never a client-invoked RPC.';

-- ─── Trigger attachment — all three fire sites ─────────────────────────
DROP TRIGGER IF EXISTS sync_project_membership_on_party_change ON public.split_sheet_parties;
CREATE TRIGGER sync_project_membership_on_party_change
  AFTER INSERT OR UPDATE ON public.split_sheet_parties
  FOR EACH ROW EXECUTE FUNCTION public.sync_project_membership_for_sheet();

-- WHEN guard: only re-run the fan-out when status or vault_project_id
-- actually changed value (not merely appeared in the SET clause of a
-- no-op UPDATE ... SET status = status), so an unrelated save on an
-- already-synced sheet does not needlessly rescan its parties.
DROP TRIGGER IF EXISTS sync_project_membership_on_sheet_change ON public.split_sheets;
CREATE TRIGGER sync_project_membership_on_sheet_change
  AFTER UPDATE OF status, vault_project_id ON public.split_sheets
  FOR EACH ROW
  WHEN (
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.vault_project_id IS DISTINCT FROM OLD.vault_project_id
  )
  EXECUTE FUNCTION public.sync_project_membership_for_sheet();

-- WHEN guard: only re-run the fan-out when claimed_by actually transitions
-- (not merely appeared in the SET clause of a no-op UPDATE).
DROP TRIGGER IF EXISTS sync_project_membership_on_claim ON public.collaborators;
CREATE TRIGGER sync_project_membership_on_claim
  AFTER UPDATE OF claimed_by ON public.collaborators
  FOR EACH ROW
  WHEN (NEW.claimed_by IS DISTINCT FROM OLD.claimed_by)
  EXECUTE FUNCTION public.sync_project_membership_for_sheet();

-- ─── Schema-cache reload ──────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
