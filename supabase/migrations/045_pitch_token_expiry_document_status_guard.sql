-- ─── Migration 045: Pitch token expiry + document status evidence guard ─────
--
-- Hardening from adversarial review:
-- - Public pitch response links should expire instead of remaining live forever.
-- - vault_documents signed/verified states must have evidence attached at the
--   database layer, not only in route code.

ALTER TABLE pitch_history
  ADD COLUMN IF NOT EXISTS response_token_expires_at TIMESTAMPTZ
  NOT NULL DEFAULT (now() + INTERVAL '30 days');

CREATE INDEX IF NOT EXISTS idx_pitch_history_response_token_unexpired
  ON pitch_history (response_token, response_token_expires_at)
  WHERE status = 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vault_documents_status_requires_evidence_chk'
  ) THEN
    ALTER TABLE vault_documents
      ADD CONSTRAINT vault_documents_status_requires_evidence_chk
      CHECK (
        status = 'pending'
        OR (
          status = 'signed'
          AND signed_at IS NOT NULL
          AND (
            file_url IS NOT NULL
            OR document_data #> '{esign,completedAt}' IS NOT NULL
          )
        )
        OR (
          status = 'verified'
          AND file_url IS NOT NULL
          AND verification_status = 'verified'
          AND verified_at IS NOT NULL
        )
      ) NOT VALID;
  END IF;
END $$;
