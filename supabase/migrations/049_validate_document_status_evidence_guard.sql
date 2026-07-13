-- ─── Migration 049: Validate document status evidence guard ────────────────
--
-- Migration 045 added this check as NOT VALID so legacy rows could be cleaned
-- up safely. Now that cleanup is complete, validate it for all rows.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vault_documents_status_requires_evidence_chk'
      AND convalidated = false
  ) THEN
    ALTER TABLE vault_documents
      VALIDATE CONSTRAINT vault_documents_status_requires_evidence_chk;
  END IF;
END $$;
