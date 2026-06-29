-- ─── Migration 025: Add mlc_registered boolean to vault_projects ──────────────
--
-- This column tracks an artist's MLC registration action for each project.
-- It does NOT feed into calculate_vault_readiness() — rights registration is
-- advisory guidance, not a gate on the readiness score.
--
--   mlc_registered — boolean artist override (same pattern as soundexchange_registered).
--                    The MLC (Mechanical Licensing Collective) collects mechanical
--                    royalties for on-demand streaming and downloads in the US.
--                    Each songwriter registers their own share independently at
--                    themlc.com — this is separate from PRO royalties, which cover
--                    public performance.
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
  ADD COLUMN IF NOT EXISTS mlc_registered BOOLEAN DEFAULT false;
