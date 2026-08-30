-- ============================================================
-- Funūn — Phase 37.1 "The Songwriter" (My Catalogue)
-- Migration 137: one nullable column. public.split_sheets.work_id links a
--                split sheet to the composition it governs, so a work in My
--                Catalogue can carry a LIVING DRAFT sheet from the moment it
--                is created.
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (the standing convention since migrations 058/062/063/064/066/067/070/078,
-- restated in migration 134's own header). This file is authored and
-- text-tested (__tests__/migration-137.test.ts) but must not be applied
-- automatically. The live push is the 37-01 Task 4 blocking checkpoint and
-- the owner performs it. Do NOT edit migrations 001-134 (already landed).
--
-- Strictly additive, matching migrations 018/026/040/062/063/066/067's
-- convention: the new column is nullable, no existing column, constraint,
-- policy, grant or trigger is dropped or altered anywhere in this file, and
-- every statement is idempotent so a re-run is a no-op.
--
-- ─── (a) WHY THE FK POINTS THIS WAY (Open Question 1, resolved) ──────────
-- The researcher asked whether a work stores its sheet's id or the sheet
-- stores its work's id. Resolved in favour of the SHEET SIDE ONLY, for three
-- reasons that all point the same direction.
--
-- It matches the direction this codebase already established: migration 067
-- attached a sheet to a vault project (split_sheets.vault_project_id) and to
-- a track (split_sheets.track_id), never the reverse. A sheet has always
-- known what it governs; nothing governed has ever known its sheet.
--
-- It avoids a mutual FK pair, which would make work creation an insert of
-- the work, an insert of the sheet, and then an UPDATE of the work to point
-- back — three statements and a window in which the work has no sheet id,
-- in place of two independent inserts.
--
-- And it costs nothing at read time. A work's living draft is resolved by
-- selecting from public.split_sheets where the work matches and status is
-- 'draft', against the index created below — exactly as cheap as reading a
-- stored id, and it cannot go stale the way a denormalised pointer can.
--
-- THERE IS NO REVERSE COLUMN ON public.works AND THERE WILL NOT BE ONE.
-- Migration 135's own header records the same decision from the other side,
-- so neither file's absence can be read later as the other file's oversight.
--
-- ─── (b) WHAT THIS MIGRATION DELIBERATELY DOES NOT TOUCH: THE SHEET RLS ──
-- This file changes NO row level security on public.split_sheets and NO row
-- level security on its party table. That pair is the most delicate in this
-- codebase: migration 064 exists for the single purpose of breaking the
-- mutual policy recursion between their two policy sets (SQLSTATE 42P17,
-- introduced by migration 018 and reachable from three unrelated directions,
-- including the core vault write path), and it did so with the
-- is_split_sheet_initiator / is_split_sheet_party SECURITY DEFINER pair.
--
-- Phase 37.1 does need a work member to READ a work's living draft — that is
-- what renders the splits state on the work page and what fires the
-- people-not-numbers nudge. It gets that through a service-role read in a
-- lib helper that has ALREADY proved work membership before it reads
-- (lib/catalogue/splits-io.ts, plan 05), which is the same posture every
-- signed-URL read and every audio upload in this codebase already takes.
-- Adding a fourth policy to a recursion-sensitive pair, to save one
-- service-role call on a page that is already server-rendered, would be a
-- bad trade — the downside is a production-wide 42P17 that breaks reads for
-- every user at once, and the upside is nothing a user can see.
--
-- ─── (c) vault_projects.type IS ALSO UNTOUCHED (RESEARCH Pitfall 4) ──────
-- S-03 retires the 'unreleased' project type from the CREATE FLOW UI (plan
-- 13's two-door picker simply stops offering it). It does NOT retire the
-- value from the database, and this phase alters no CHECK constraint on
-- public.vault_projects. The one existing production row typed that way must
-- keep validating, because it surfaces on the new My Catalogue shelf via an
-- application-level merge and not via a data migration. A schema change
-- there would turn a UI decision into a destructive one.
-- ============================================================

-- ─── (1) The link ────────────────────────────────────────────────────────
-- ON DELETE SET NULL, never CASCADE. Deleting a work must not delete the
-- legal record of who wrote it — the same sentence that governs every
-- track_id cascade choice in migration 067, applied here for the same
-- reason. An orphaned sheet is recoverable; a deleted one is not.
ALTER TABLE public.split_sheets
  ADD COLUMN IF NOT EXISTS work_id UUID REFERENCES public.works ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_split_sheets_work_id
  ON public.split_sheets (work_id);

COMMENT ON COLUMN public.split_sheets.work_id IS
  'Phase 37.1: the composition this sheet governs, when that composition lives in My Catalogue. NULL for every sheet that predates Phase 37 and for every sheet attached only to a vault project or a track (migration 067''s columns). A work''s LIVING DRAFT is the row where work_id matches and status is ''draft'' — resolved by lookup, because there is deliberately no reverse pointer on public.works. ON DELETE SET NULL so deleting a work never deletes the record of who wrote it.';

-- ─── (2) Schema-cache reload ─────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
