-- ============================================================
-- Funūn — Wave 4: The Green Room (Phase 17: Split-Sheet E-Sign)
-- Migration 065: esign_envelopes.certificate_path
-- Run via: supabase db push
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push against the remote database is human-gated, mirroring the
-- convention established by migration 062's header and carried by 063/064.
--
-- WHAT THIS ADDS AND WHY IT IS SEPARATE FROM 062
--
-- 062 gave esign_envelopes two document pointers, both for artifacts the
-- PROVIDER produces:
--
--   executed_file_path  the executed, countersigned PDF
--   audit_log_path      DocuSeal's own Certificate of Signature / audit log
--
-- P17-10 (ESIGN-19) then established a THIRD artifact that DocuSeal does
-- not produce and cannot: Funūn's own Certificate of Completion. It is the
-- artist-facing completion record — it cites the provider's audit log as
-- the underlying evidence rather than reproducing it, and it separates
-- what Funūn observed from what DocuSeal reported. That document needs its
-- own pointer; overloading audit_log_path would collapse exactly the
-- distinction the certificate exists to preserve.
--
-- NULLABLE, DELIBERATELY. Envelopes completed before this column existed
-- have no certificate, and the completion webhook treats the certificate
-- as non-fatal (a render or upload failure must not strand an execution
-- whose $0.20 is already spent). NULL therefore means "no Funūn
-- certificate on file", which is a real and expected state, not an error.
--
-- No RLS or grant changes: the column inherits esign_envelopes' existing
-- policies and the 062 REVOKE of INSERT/UPDATE/DELETE/TRUNCATE from
-- authenticated + anon. The completion webhook writes it via the service
-- role, like every other write on this table.
-- ============================================================

ALTER TABLE esign_envelopes
  ADD COLUMN IF NOT EXISTS certificate_path TEXT;

COMMENT ON COLUMN esign_envelopes.certificate_path IS
  'release-documents storage path of Funūn''s own Certificate of Completion '
  '(ESIGN-19, P17-10). Distinct from audit_log_path, which holds the provider''s '
  'audit log that this certificate cites as underlying evidence. NULL when no '
  'Funūn certificate was filed for this envelope.';
