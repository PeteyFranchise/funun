-- ============================================================
-- Funūn — Phase 25 (funun-team-accounts-ae): AE ↔ Client Partner assignment
-- Migration 090
--
-- WHY: CONTEXT.md's naming decision — buyer/Client Partner orgs get one
-- assigned Account Executive (D-03/A2: a single nullable FK column, not a
-- join table — the audit log from migration 089/lib/staff/audit.ts already
-- gives reassignment history "for free" via 25-09's leadership-only
-- reassign route). Mirrors migration 081's owner_id single-column
-- admin-assignment precedent.
--
-- WHAT: ALTER TABLE public.buyer_orgs ADD COLUMN ae_user_id, nullable,
-- additive, no backfill — every existing Client Partner org starts
-- unassigned; leadership assigns via the staff-only PATCH .../ae route
-- (25-05). Deliberately does NOT extend migration 080's authenticated
-- GRANT SELECT (id, name, is_personal, verified, created_at) allowlist —
-- ae_user_id stays private/staff-only, mirroring how verified_at/
-- created_by are kept private in that same migration (RESEARCH Pitfall 2).
--
-- HUMAN-GATED — never `supabase db push` from an agent (matches Phases
-- 16/21/25/28's standing convention). Draft + text-tested only (see
-- __tests__/migration-089-090.test.ts); the owner reviews and pushes via
-- Codex at the 25-07 checkpoint. Do NOT edit migrations 080-088 (already
-- landed).
-- ============================================================

ALTER TABLE public.buyer_orgs
  ADD COLUMN ae_user_id UUID REFERENCES auth.users ON DELETE SET NULL;

CREATE INDEX idx_buyer_orgs_ae_user_id ON public.buyer_orgs (ae_user_id);

-- Deliberately NOT added to migration 080's column-level SELECT GRANT
-- list (`GRANT SELECT (id, name, is_personal, verified, created_at) ON
-- public.buyer_orgs TO authenticated`). Postgres column-privilege GRANTs
-- are an explicit allowlist, not "all columns unless revoked" — a new
-- column is private by default until explicitly GRANTed. Keeping
-- ae_user_id out of that list is the INTENDED lockdown here, not an
-- oversight: it mirrors how verified_at/created_by already stay private
-- in this same table (migration 080's own documented convention). Extend
-- the GRANT in a future migration only if/when a buyer-facing "your AE"
-- surface is built (Phase 23+).
COMMENT ON COLUMN public.buyer_orgs.ae_user_id IS
  'Phase 25: the Funūn staff member (Account Executive) assigned to this Client Partner company. One AE per company, nullable until leadership sets it via the staff-only PATCH .../ae route (25-05/25-09). Private column — deliberately NOT in migration 080''s authenticated GRANT SELECT allowlist; stays staff-only.';

NOTIFY pgrst, 'reload schema';
