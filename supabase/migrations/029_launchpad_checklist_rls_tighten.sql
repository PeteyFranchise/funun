-- ============================================================
-- Funūn — Wave 3: Launchpad Checklist — RLS tightening
-- Migration 029: Restrict direct authenticated reads on
--               launchpad_checklist_items (CR-03 / LAUNCH-03)
-- Run via: supabase db push
-- ============================================================

-- The original migration 028 granted SELECT to all authenticated users via
-- USING(true), relying solely on the API layer to gate unapproved tip_body
-- text and strip tip_draft. This migration closes the DB-layer gap.
--
-- Approach chosen (option b — least churn): replace USING(true) with
-- USING(false) so that no authenticated role can SELECT the base table
-- directly. All artist reads go through the service-role client inside the
-- API handler (app/api/launchpad/[projectId]/checklist/route.ts), which
-- already verifies auth + ownership and gates tip fields in code.
-- Admin reads already use the service-role client, which bypasses RLS
-- entirely — those are unaffected.
--
-- PostgreSQL does not support column-level RLS, so a USING(false) row
-- policy is the cleanest way to prevent direct table access while
-- preserving the existing API behavior unchanged.

DROP POLICY IF EXISTS "Anyone can read checklist items" ON launchpad_checklist_items;

-- No authenticated SELECT allowed on the base table. All reads must go
-- through the service-role client inside authenticated API handlers that
-- enforce their own auth + tip-gating logic.
CREATE POLICY "No direct authenticated reads — use API" ON launchpad_checklist_items
  FOR SELECT USING (false);
