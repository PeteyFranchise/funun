-- ─── Migration 006 — Metadata Studio ────────────────────────────────
-- Adds the release-level rights / contact block (the "who to call and who
-- owns this" data that goes on a one-sheet and into file tags) plus the
-- track-level composition code. Per-track composer rows (name, role, PRO,
-- IPI, split %) live in the existing tracks.metadata JSONB under the
-- `composers` key, so no new column is needed for those.
--
-- All additive + idempotent: safe to re-run.

-- Release-level rights & contact (shared across the project / album) ──
ALTER TABLE vault_projects
  ADD COLUMN IF NOT EXISTS label            TEXT,
  ADD COLUMN IF NOT EXISTS publisher        TEXT,
  ADD COLUMN IF NOT EXISTS c_line           TEXT,    -- © composition line, e.g. "© 2026 Jane Doe"
  ADD COLUMN IF NOT EXISTS p_line           TEXT,    -- ℗ sound-recording line, e.g. "℗ 2026 Jane Doe"
  ADD COLUMN IF NOT EXISTS copyright_year   INTEGER,
  ADD COLUMN IF NOT EXISTS primary_language TEXT,    -- ISO 639 language of the lyrics / release
  ADD COLUMN IF NOT EXISTS contact_name     TEXT,
  ADD COLUMN IF NOT EXISTS contact_email    TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone    TEXT;

-- Track-level composition identifier (complements the ISRC recording code).
ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS iswc     TEXT,   -- composition code, format T-DDDDDDDDD-C
  ADD COLUMN IF NOT EXISTS language TEXT;   -- per-track language override
