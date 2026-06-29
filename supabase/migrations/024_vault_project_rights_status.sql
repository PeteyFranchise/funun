-- ─── Migration 024: Add rights registration status columns to vault_projects ──
--
-- These three columns track an artist's registration actions for each project.
-- They do NOT feed into calculate_vault_readiness() — rights registration is
-- advisory guidance, not a gate on the readiness score. The readiness items
-- 'copyright' and 'pro_registration' track data completeness (ISRC, ISWC),
-- while these columns track the real-world filing actions the artist takes.
--
--   copyright_status        — three-state enum: not_filed → filed → registered.
--                             filed = application submitted to copyright.gov eCO.
--                             registered = certificate of registration received.
--
--   pro_registration_status — binary: not_registered or registered.
--                             MVP simplification — the artist either belongs
--                             to a PRO (ASCAP/BMI/SESAC/SOCAN) or does not.
--
--   soundexchange_registered — boolean artist override.
--                             The rights page auto-derives eligibility from
--                             RDR-N data; this flag lets an artist mark
--                             themselves as already registered with SoundExchange.
--
-- No RLS changes needed:
--   vault_projects already has USING (auth.uid() = user_id) policy covering
--   all reads and writes.
--
-- No trigger changes needed:
--   calculate_vault_readiness() is not modified.
--
-- Run via: Supabase SQL Editor → paste this file → Run

ALTER TABLE vault_projects
  ADD COLUMN IF NOT EXISTS copyright_status TEXT DEFAULT 'not_filed'
    CHECK (copyright_status IN ('not_filed', 'filed', 'registered')),
  ADD COLUMN IF NOT EXISTS pro_registration_status TEXT DEFAULT 'not_registered'
    CHECK (pro_registration_status IN ('not_registered', 'registered')),
  ADD COLUMN IF NOT EXISTS soundexchange_registered BOOLEAN DEFAULT false
