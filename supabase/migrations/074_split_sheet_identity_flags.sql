-- ============================================================
-- Funūn — Wave 4: The Green Room (Phase 19: Profile & Identity Model Cleanup)
-- Migration 074: split_sheet_identity_flags — R4 flag-for-fix
--
-- Backs plan 19-03's "this info is wrong" affordance: a claimed user who
-- appears on a FROZEN split sheet (esign_pending/executed) can submit a
-- structured identity-correction flag (field + suggested value) against
-- their own party row. Writes land ONLY in this new table — never in
-- split_sheet_parties, and never touching split_percentage/role (SPEC R4,
-- Prohibitions "MUST NOT let a non-owner write another user's
-- split_sheet_parties row or edit split_percentage/role").
--
-- Table/RLS/index shape follows migration 026's convention
-- (collaborators.claimed_by-style additive SELECT policy, never a
-- table-wide grant). The `field` CHECK is the DB-layer twin of the route's
-- FLAGGABLE_FIELDS allowlist (app/api/split-sheets/[id]/correction-flag/
-- route.ts) — keep both lists identical if either ever changes.
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push against the remote database is this phase's blocking
-- human checkpoint (plan 19-07), mirroring migrations 058/062/063/065/
-- 066's "do not push from an executor agent" convention.
-- ============================================================

-- ─── split_sheet_identity_flags ────────────────────────────────────────
-- One row per submitted correction. split_sheet_party_id ties the flag to
-- the frozen party snapshot at flag time (RESEARCH Open Question 3
-- resolution) — never to a live collaborator/profile row, so the flag
-- stays meaningful even if the claimed user later edits their profile
-- again. flagged_by is the server-derived auth.uid() of the claimed user
-- (never client-supplied — see the INSERT policy below and the route's
-- own server-side derivation).
CREATE TABLE IF NOT EXISTS split_sheet_identity_flags (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  split_sheet_party_id  UUID NOT NULL REFERENCES split_sheet_parties(id) ON DELETE CASCADE,
  flagged_by            UUID NOT NULL REFERENCES auth.users(id),
  field                 TEXT NOT NULL
                        CHECK (field IN ('pro', 'ipi', 'publisher', 'administrator', 'legal_name')),
  suggested_value       TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'open',
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_split_sheet_identity_flags_party_id
  ON split_sheet_identity_flags (split_sheet_party_id);

ALTER TABLE split_sheet_identity_flags ENABLE ROW LEVEL SECURITY;

-- INSERT: only the flagger, for their own row — mirrors the server-derived
-- flagged_by discipline; a client can never insert a flag attributed to
-- someone else even if RLS were the only line of defense.
CREATE POLICY "Flagger can insert own flag" ON split_sheet_identity_flags
  FOR INSERT WITH CHECK (auth.uid() = flagged_by);

-- SELECT: the flagger sees their own submissions, and the sheet's
-- INITIATOR (owner) sees flags raised against their sheet — resolved via
-- the party -> split_sheet -> initiator_user_id join. Additive, row-scoped
-- policy in the style of migration 026's "Claimed users see own credits"
-- (never a table-wide grant).
CREATE POLICY "Flagger or sheet owner can view flag" ON split_sheet_identity_flags
  FOR SELECT USING (
    auth.uid() = flagged_by
    OR EXISTS (
      SELECT 1
      FROM split_sheet_parties
      JOIN split_sheets ON split_sheets.id = split_sheet_parties.split_sheet_id
      WHERE split_sheet_parties.id = split_sheet_identity_flags.split_sheet_party_id
        AND split_sheets.initiator_user_id = auth.uid()
    )
  );

COMMENT ON TABLE split_sheet_identity_flags IS
  'R4 flag-for-fix: a claimed user''s structured "this is wrong" correction request against their own identity on a frozen (esign_pending/executed) split sheet. Never mutates split_sheet_parties; applying a fix is the owner''s action (plan 19-06).';
