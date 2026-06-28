-- ============================================================
-- Funūn — Wave 2: Rights & Registration Rails
-- Migration 019: structured name fields on collaborators
-- Adds first_name / middle_name / last_name / name_suffix so
-- names are captured in separate parts for PRO/copyright alignment.
-- All columns are nullable for backward compat — existing rows
-- retain their assembled `name` value; new rows set `name` from
-- the assembled parts on write.
-- ============================================================

ALTER TABLE collaborators
  ADD COLUMN IF NOT EXISTS first_name   TEXT,
  ADD COLUMN IF NOT EXISTS middle_name  TEXT,
  ADD COLUMN IF NOT EXISTS last_name    TEXT,
  ADD COLUMN IF NOT EXISTS name_suffix  TEXT;
