-- ============================================================
-- Funūn — Wave 4: The Green Room (Phase 17: Split-Sheet E-Sign)
-- Migration 063: legal-grade split-sheet document fields (ESIGN-16, P17-09)
--
-- The 2026-07-20 provider gate found the split-sheet renderer produced a
-- table, not an instrument: one SPLIT column, no legal names, no work
-- details, no publishing designee/administrator, no operative language.
-- Plan 17-09 rebuilds the document per the approved template spec
-- (.planning/phases/17-split-sheet-esign/17-SPLIT-SHEET-TEMPLATE-SPEC.md).
-- This migration adds exactly the columns that spec's "Revised new-field
-- requirement" section calls for — nothing more. rights_scope,
-- writer_share/publisher_share/master_share, ISWC/ISRC snapshots, and a
-- samples_disclosed flag were considered during planning and explicitly
-- REJECTED by the approved spec: the document is songwriting/publishing
-- only, stated via a fixed Guidance Note rather than a per-sheet toggle,
-- and split_percentage (018) remains the single share column.
--
-- Strictly additive (D-18b/AM-5 convention, mirrors migrations 018/062):
-- every new column is nullable, no existing column or constraint is
-- altered, and the 100.000% split_percentage CHECK (018) is untouched.
-- Live split_sheets/split_sheet_parties rows are mid-approval production
-- data — a pre-063 row must keep rendering after this migration lands
-- (lib/vault/pdf/split-sheet.tsx's degradation path handles the nulls).
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push against the remote database is this plan's first blocking
-- human checkpoint (mirrors migrations 058/062's "do not push from an
-- executor agent" convention).
-- ============================================================

-- ─── split_sheet_parties: per-writer legal/publishing fields ─────────────
-- legal_name is distinct from the existing `name` column (018), which is
-- the professional/stage name shown elsewhere in the app. The approved
-- document renders "Legal Name (p/k/a Professional Name)" — see decision 6
-- in the template spec. publishing_designee and administrator are new
-- concepts entirely (no prior column held them).
ALTER TABLE split_sheet_parties
  ADD COLUMN IF NOT EXISTS legal_name          TEXT,
  ADD COLUMN IF NOT EXISTS publishing_designee TEXT,
  ADD COLUMN IF NOT EXISTS administrator       TEXT;

-- ─── split_sheets: standalone work-detail fields ──────────────────────────
-- Artist Name / Album-Project Title / Record Label print in the approved
-- Work Details section. When a sheet is attached to a vault_project these
-- prefill from the project (title, migration 006's label) and remain
-- editable; when standalone they are captured directly in the builder.
-- All optional per decision 4 — a missing value prints as an em-dash, it
-- never blocks a signature.
ALTER TABLE split_sheets
  ADD COLUMN IF NOT EXISTS artist_name         TEXT,
  ADD COLUMN IF NOT EXISTS album_project_title TEXT,
  ADD COLUMN IF NOT EXISTS record_label        TEXT;

-- ─── artist_profiles: administrator (decision 3a prefill source) ─────────
-- The only field in the auto-populate chain that has no existing home.
-- pro (020) and publisher (020, → Publishing Designee) already exist on
-- both artist_profiles and collaborators; administrator does not exist on
-- either table until this migration. Without it, "auto-populate from
-- Funūn data" is impossible for that one field and every signer would
-- have to retype it by hand.
--
-- Column-privilege doctrine (migration 040): artist_profiles.publisher has
-- NO authenticated/anon SELECT or UPDATE grant — migration 040's
-- REVOKE-then-explicit-column-GRANT pattern means any column absent from
-- its GRANT lists is private by construction, with no further REVOKE
-- needed. administrator is PII/rights-registry data of the same class as
-- publisher, so it inherits that same private-by-default posture the
-- instant it's added: it is NOT in 040's GRANT SELECT/GRANT UPDATE column
-- lists, so authenticated/anon get zero privileges on it. Only
-- service_role (which bypasses column grants entirely) and the
-- application's own ownership-checked routes (app/api/profile/route.ts,
-- via createServiceClient() per 040's Task 2 companion fix) can read or
-- write it. No new REVOKE/GRANT statement is required here — this comment
-- documents that the doctrine applies, per this plan's explicit
-- instruction to follow migration 040's approach for this column.
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS administrator TEXT;

-- ─── collaborators: administrator (optional, recommended) ────────────────
-- So a non-user collaborator picked via CollaboratorPicker also prefills
-- Administrator, not just PRO/publisher (018 already stores those two).
-- collaborators has no column-privilege lockdown (owner-only RLS via
-- migration 018's "Users manage own collaborators" policy already scopes
-- all access to auth.uid() = user_id), so no privilege doctrine note is
-- needed here.
ALTER TABLE collaborators
  ADD COLUMN IF NOT EXISTS administrator TEXT;
