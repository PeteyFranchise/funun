-- ============================================================
-- Funūn — Phase 30 (The Crate + Sync Library): sync_listings
-- quality-review + staff-notes columns
-- Migration 107
--
-- WHY: The Sync Library inclusion gate (30-CONTEXT.md "The gate checks")
-- has three checks — rights, quality, metadata. Rights already has a home
-- (sync_listings.status, migration 096). Quality is a MANUAL staff
-- judgment for v1 (30-CONTEXT.md "Quality bar signal" — no automated
-- audio-quality analysis unless a cheap existing signal exists; none
-- found) and needs a persisted, auditable home on the per-song row so the
-- gate's qualityOk signal (consumed by 30-04) isn't recomputed from
-- nothing every time. staff_notes is the free-text guidance staff attach
-- to a listing, surfaced in the Sync Readiness worklist and the Crate's
-- staff-only layer (30-CONTEXT.md "Role-aware Crate").
--
-- WHAT: five new nullable columns on sync_listings, additive only —
-- quality_ok/quality_note/quality_reviewed_by/quality_reviewed_at (the
-- manual quality-bar verdict + who/when) and staff_notes (per-listing
-- staff guidance, independent of the quality verdict). Deliberately does
-- NOT touch sync_listings.status or its CHECK constraint — incomplete is
-- a COMPUTED readiness signal derived from the Wave 1 readiness engine +
-- legal-doc gate (30-CONTEXT.md "Readiness granularity"), never a stored
-- status value, so the admission state machine migration 096 established
-- cannot drift (30-CONTEXT.md prohibition + 30-RESEARCH.md Assumptions
-- Log A4).
--
-- RLS: sync_listings already REVOKEs INSERT/UPDATE/DELETE from
-- authenticated/anon and restricts SELECT to the owning artist via RLS
-- (migration 096, part (a)). New columns added by ALTER TABLE inherit the
-- table's existing REVOKE + RLS policy automatically — Postgres has no
-- per-column grant/RLS surface to reapply here, so this migration adds
-- NO new REVOKE/GRANT/POLICY statements; a reaffirming comment below
-- records that fact for the next reader rather than restating a no-op.
-- All writes to these five columns route through the leadership-gated
-- quality-review route (30-04, requireStaff-protected), never direct
-- PostgREST access. T-30-06 (Elevation of Privilege — buyers/artists
-- writing curation-only fields): closed by the inherited REVOKE, same as
-- migration 096's T-26-01.
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (matches migrations 080/081/089/090/096/106's standing convention).
-- Draft + text-tested only; the owner reviews and pushes via their normal
-- Codex `supabase db push` flow. Do NOT edit migrations 080-106 (already
-- landed).
-- ============================================================

-- ─── sync_listings: quality-review + staff-notes columns ──────────────
ALTER TABLE public.sync_listings
  ADD COLUMN quality_ok           BOOLEAN,
  ADD COLUMN quality_note         TEXT,
  ADD COLUMN quality_reviewed_by  UUID REFERENCES auth.users(id),
  ADD COLUMN quality_reviewed_at  TIMESTAMPTZ,
  ADD COLUMN staff_notes          TEXT;

COMMENT ON COLUMN public.sync_listings.quality_ok IS
  'Manual v1 quality-bar verdict for the inclusion gate (30-CONTEXT.md "Quality bar" — audio quality + genuine sync fit; no automated audio analysis). NULL = not yet reviewed, TRUE = passed, FALSE = failed. Feeds the gate''s qualityOk signal (30-04). T-30-05 (Repudiation): every write to this column is logged via logStaffAction at the reviewing route, never written directly.';

COMMENT ON COLUMN public.sync_listings.quality_note IS
  'Optional staff-facing note explaining the quality_ok verdict (e.g. why a track failed the quality bar). Not shown to buyers; surfaced in the Sync Readiness worklist and the Crate''s staff-only layer.';

COMMENT ON COLUMN public.sync_listings.quality_reviewed_by IS
  'auth.users.id of the staff member who set the current quality_ok verdict. Actor metadata for audit, mirroring sync_listings.decided_by''s shape (migration 096).';

COMMENT ON COLUMN public.sync_listings.quality_reviewed_at IS
  'Timestamp of the current quality_ok verdict. NULL until first review.';

COMMENT ON COLUMN public.sync_listings.staff_notes IS
  'Free-text staff guidance on this listing (e.g. what''s missing, context for the completion pipeline), independent of the quality_ok verdict. Surfaced in the Sync Readiness worklist (30-CONTEXT.md "A worklist queue... lists every incomplete track + exactly what''s missing") and the role-aware Crate''s staff-only layer.';

-- RLS reaffirmation (no new policy/grant needed — see header): these five
-- columns are additive ALTER TABLE columns on a table that ALREADY has
-- RLS enabled (migration 096) with authenticated/anon INSERT/UPDATE/
-- DELETE fully REVOKEd and SELECT scoped to the owning artist row. A
-- newly added column carries no independent grant surface in Postgres —
-- it inherits the table-level REVOKE and the existing
-- "sync_listings_select_own" RLS policy automatically. Confirmed: no
-- ALTER of sync_listings.status or its CHECK constraint occurs in this
-- migration (30-CONTEXT.md prohibition — incomplete stays a computed
-- signal, never a stored status value). T-30-06 (Elevation of Privilege):
-- closed by the inherited lockdown; writes to these columns happen only
-- via the leadership-gated quality-review service-role route (30-04).

NOTIFY pgrst, 'reload schema';
