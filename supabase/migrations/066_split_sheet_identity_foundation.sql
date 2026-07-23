-- ============================================================
-- Funūn — Wave 4: The Green Room (Phase 18: Split-Sheet Home)
-- Migration 066: split-sheet identity foundation (targeted replan
-- 18-05) — collaborators.legal_name, collaborators.status, and
-- artist_profiles.legal_name_locked_at, plus the two status-
-- confirmation triggers.
--
-- Feeds the redesigned identity/collaborator model
-- (.planning/deliberations/split-sheet-identity-and-collaborator-model.md
-- §1 live-linked identity, §2 legal-name locking, §6 pending/confirmed
-- roster status, §7 recipient-side data completion) and 18-01's living
-- draft surface (session-locked decision 3: collaborators.status flips
-- confirmed on EITHER signup (claimed_by non-null) OR sheet-response
-- (approval_status leaving pending), whichever happens first).
--
-- Strictly additive, matching migrations 018/026/040/062/063's convention:
-- every new column is nullable or NOT NULL-with-DEFAULT, every new-column
-- statement is idempotent (IF NOT EXISTS), no existing column or
-- constraint is dropped or altered anywhere, and both triggers use
-- CREATE OR REPLACE FUNCTION plus DROP TRIGGER IF EXISTS before CREATE
-- TRIGGER so a re-run is a no-op.
--
-- Does NOT touch backfill_claimed_collaborators() or claim_collaborators()
-- (migration 026) — research Pitfall 5. Those stay additive/COALESCE for
-- their own unrelated callers; the overwrite-semantics live-identity
-- resolver this plan also ships (lib/split-sheets/live-identity.ts) is a
-- brand-new, distinct function, never a mutation of the 026 functions.
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push against the remote database is this plan's blocking
-- human checkpoint (Task 4), mirroring migrations 058/062/063/065's
-- "do not push from an executor agent" convention.
-- ============================================================

-- ─── collaborators: legal_name + status ──────────────────────────────
-- legal_name is a nullable TEXT, distinct from the existing NOT NULL
-- `name` column (018), which stays the professional/display name. It is
-- the persisted home for a self-corrected legal name (deliberation §7)
-- so it is reused on future sheets without re-entry.
--
-- status is NOT NULL DEFAULT 'confirmed' with a CHECK constraining it to
-- 'pending' or 'confirmed'. Existing rows are deliberate, fully-entered
-- roster members, so the DEFAULT backfills every pre-066 row to
-- 'confirmed' with no data migration needed; only the fast-add path
-- (18-01) ever writes 'pending'.
--
-- Reuse-vs-new-column decision (research Don't-Hand-Roll, recorded here
-- per this plan's instruction): the existing collaborator_invites table
-- (migration 018) already carries pending/accepted/expired, but it is
-- scoped to the educational-IPI invite flow (POST /api/collaborators/[id]/
-- invite) and keyed to a specific invite token, not to the roster-level
-- "have they engaged at all" concept deliberation §6 describes. A
-- brand-new collaborators.status column is the correct choice;
-- collaborator_invites is NOT extended or reused for this.
ALTER TABLE collaborators
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'confirmed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collaborators_status_check'
  ) THEN
    ALTER TABLE collaborators
      ADD CONSTRAINT collaborators_status_check CHECK (status IN ('pending', 'confirmed'));
  END IF;
END $$;

-- ─── artist_profiles: legal_name_locked_at ────────────────────────────
-- Nullable TIMESTAMPTZ sentinel, null-until-an-event exactly like
-- artist_profiles.claimed_at (026) and verified_at (040-era): IS NOT NULL
-- means the legal name is confirmed-and-locked (deliberation §2).
--
-- Column-privilege doctrine (migration 040): this column is PRIVATE by
-- construction. It is NOT added to migration 040's GRANT SELECT/UPDATE
-- lists for artist_profiles, so authenticated/anon get zero privileges
-- on it via direct PostgREST — matching migration 063's administrator
-- treatment exactly. It is read and written server-side only via
-- createServiceClient() (settings/page.tsx already selects * via the
-- service client; PATCH /api/profile writes it via the service client
-- after a session-verified ownership check). No new GRANT/REVOKE
-- statement is emitted here — the doctrine applies by omission, per
-- migration 040's original design.
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS legal_name_locked_at TIMESTAMPTZ;

-- ─── Trigger 1: claimed ⇒ confirmed ────────────────────────────────────
-- BEFORE INSERT OR UPDATE on collaborators: whenever NEW.claimed_by IS
-- NOT NULL, force NEW.status = 'confirmed'. This catches
-- claim_collaborators() (026) firing on signup, and any future path that
-- populates claimed_by, WITHOUT editing claim_collaborators() itself
-- (research Pitfall 5 — that function stays untouched). A BEFORE trigger
-- that only mutates NEW needs no elevated privilege.
CREATE OR REPLACE FUNCTION public.collaborators_claimed_implies_confirmed()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.claimed_by IS NOT NULL THEN
    NEW.status := 'confirmed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS collaborators_claimed_implies_confirmed_trigger ON collaborators;
CREATE TRIGGER collaborators_claimed_implies_confirmed_trigger
  BEFORE INSERT OR UPDATE ON collaborators
  FOR EACH ROW EXECUTE FUNCTION public.collaborators_claimed_implies_confirmed();

-- ─── Trigger 2: sheet-response ⇒ confirmed ─────────────────────────────
-- AFTER UPDATE OF approval_status on split_sheet_parties: fires only when
-- the party's approval_status leaves 'pending' (approved or countered)
-- AND the party is linked to a roster row (collaborator_id IS NOT NULL).
-- Flips the linked collaborators row to status = 'confirmed', guarded by
-- status <> 'confirmed' so it is a no-op when already confirmed.
--
-- SECURITY DEFINER is required: the party responding via a public
-- /approve/[token] link may have no Funūn account at all, and the write
-- targets the INITIATOR's collaborators row (a different user's table),
-- which the invoking role (anon, via the token route, or the
-- unauthenticated party) has no RLS grant to update directly. Elevation
-- is safe here because the UPDATE is scoped strictly by
-- NEW.collaborator_id — a server-owned id read off the row that just
-- changed, never a client-supplied id — mirroring the exact
-- cross-user-write-scoped-by-a-server-owned-id discipline
-- claim_collaborators() (026) already uses. SET search_path = ''
-- (matching migration 034's clear_featured_if_unpublished() precedent)
-- and fully schema-qualified table references prevent search_path
-- hijack.
CREATE OR REPLACE FUNCTION public.split_sheet_party_response_confirms_collaborator()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.approval_status = 'pending'
     AND NEW.approval_status <> 'pending'
     AND NEW.collaborator_id IS NOT NULL THEN
    UPDATE public.collaborators
      SET status = 'confirmed'
    WHERE id = NEW.collaborator_id
      AND status <> 'confirmed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS split_sheet_party_response_confirms_collaborator_trigger ON split_sheet_parties;
CREATE TRIGGER split_sheet_party_response_confirms_collaborator_trigger
  AFTER UPDATE OF approval_status ON split_sheet_parties
  FOR EACH ROW EXECUTE FUNCTION public.split_sheet_party_response_confirms_collaborator();
