-- ============================================================
-- Funūn — Split-Sheet Identity Integrity Fix (260926-v1w)
-- Migration 228: minimal provenance marker + the one persisted mint snapshot
--
-- ─── Why this exists ─────────────────────────────────────────────────────
-- Three surfaces (the owner page, the /approve token page, the mint route)
-- each resolved a split-sheet party's identity independently, and two of
-- three used a resolver (lib/split-sheets/live-identity.ts, now deleted)
-- whose policy was wrong for publishing_designee/administrator: it let a
-- claimed party's profile default silently overwrite a work-specific
-- choice recorded on THIS sheet. The fix replaces all readers with one
-- server-side resolver (lib/split-sheets/resolve-party-identities.server.ts)
-- and adds a pre-mint conflict gate that BLOCKS when the freshly-resolved
-- identity has drifted since a party last approved/countered (Ruling 1).
-- That gate needs somewhere to record the baseline it compares against,
-- and the mint needs somewhere to persist the exact identity the signed
-- PDF was rendered from, so every post-mint reader (the approval page, the
-- Certificate of Signature) shows the same thing the document says. Both
-- additive, both nullable, both backward compatible with every pre-228 row.
--
-- ─── Naming (Finding C, label-integrity) ──────────────────────────────────
-- `identity_source = 'party_asserted'` was considered and rejected: the
-- write site guarantees only that the holder of the 256-bit approval token
-- POSTed the value, not that the described person asserted it (email
-- control is unverified and explicitly out of scope). Named
-- 'token_holder_submitted' instead. `identity_approved_digest` was also
-- rejected: a party approves a SPLIT, not an identity — the correction UI
-- is optional and collapsed, so approval is not identity confirmation.
-- Named `identity_digest_at_approval`: it records the resolved identity at
-- the instant this party's approve/counter was recorded, and nothing more.
--
-- ─── Backfill honesty ──────────────────────────────────────────────────────
-- Existing rows cannot be honestly classified as 'inviter_supplied' — some
-- already carry a historical update_identity write whose collaborators-row
-- half silently failed (the bug this fix corrects). Defaulting them to
-- 'inviter_supplied' would be a populated, plausible, WRONG label. Existing
-- rows backfill to 'unknown', and the gate (identityDriftSinceLastAction,
-- lib/split-sheets/identity-policy.ts) grants 'unknown' no special power —
-- it does not branch on identity_source at all today. The column exists so
-- a future authority/provenance model (explicitly out of scope here) can
-- distinguish a roster copy from a token-holder submission without a
-- second migration.
--
-- ─── Finding B — THE GRANT IS NOT OPTIONAL ────────────────────────────────
-- Migration 115 REVOKEd the table-wide SELECT on split_sheet_parties and
-- re-GRANTs an explicit column list, and says so in its own header: "A new
-- column added later must be added here too, or it becomes silently
-- unreadable through the authenticated client." Without the GRANT SELECT
-- below, identity_source/identity_submitted_at/identity_digest_at_approval
-- 42501 through the authenticated client and the gate degrades to
-- ALWAYS-PASSING — the single most likely way this fix ships broken.
--
-- ─── HUMAN-GATED PUSH ──────────────────────────────────────────────────────
-- An executor agent must NEVER run `supabase db push` for this migration.
-- Every split-sheet migration in this repo carries this convention (062,
-- 063, 065, 066, 074, 115) — the live push against the remote database is
-- a human-gated checkpoint. This file is authored and reviewed here; the
-- owner pushes it and verifies the output per the plan's Migration Gate
-- section (identity_source backfill, the GRANT, the snapshot column, and
-- a zero-count check on 'token_holder_submitted' immediately after push).
-- ============================================================

BEGIN;

-- ─── split_sheet_parties: minimal provenance marker ───────────────────────
-- Three-step nullable-then-backfill-then-constrain sequence (mirrors
-- migration 119's staff_roles pattern) so existing rows land on 'unknown'
-- and ONLY new rows take the 'inviter_supplied' default — a plain
-- `ADD COLUMN ... DEFAULT 'inviter_supplied'` would backfill every
-- pre-existing row to a default that asserts something nothing checked.
ALTER TABLE split_sheet_parties
  ADD COLUMN IF NOT EXISTS identity_source TEXT,
  ADD COLUMN IF NOT EXISTS identity_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS identity_digest_at_approval TEXT;

UPDATE split_sheet_parties
  SET identity_source = 'unknown'
  WHERE identity_source IS NULL;

ALTER TABLE split_sheet_parties
  ALTER COLUMN identity_source SET NOT NULL,
  ALTER COLUMN identity_source SET DEFAULT 'inviter_supplied';

ALTER TABLE split_sheet_parties
  ADD CONSTRAINT split_sheet_parties_identity_source_check
  CHECK (identity_source IN ('inviter_supplied', 'token_holder_submitted', 'unknown'));

-- ─── Finding B: the GRANT every new column needs ──────────────────────────
-- Keep this in sync with migration 115's column-list contract on this same
-- table. This adds to that grant; it does not replace it.
GRANT SELECT (
  identity_source,
  identity_submitted_at,
  identity_digest_at_approval
) ON split_sheet_parties TO authenticated;

-- ─── esign_envelopes: the one persisted mint snapshot ─────────────────────
-- Written in the SAME insert that records the envelope (mint-envelope
-- route, step 6), holding the exact resolved-identity array the PDF was
-- rendered from. No GRANT needed — esign_envelopes carries no column-level
-- REVOKE (only RLS, see migration 062).
ALTER TABLE esign_envelopes
  ADD COLUMN IF NOT EXISTS party_identity_snapshot JSONB;

COMMIT;
