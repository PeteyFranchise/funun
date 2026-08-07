-- ============================================================
-- Funūn — Phase 23 (buyer-onboarding-login-register): buyer_orgs
-- "created-but-not-onboarded" lifecycle + lead-qualifying fields
-- Migration 095
--
-- WHY: Phase 23's light-touch Register (+ "Talk to a sales rep") flow
-- creates a real buyer_orgs account immediately (NOT a bare lead,
-- 23-CONTEXT.md) but the account still needs AE-assisted onboarding
-- before it's fully active (23-RESEARCH Open Question #2). A status
-- lifecycle column captures that; five qualifying/contact columns give
-- the assigned AE the CRM-lite lead data captured at signup without a
-- round-trip through auth.admin.getUserById(). `source` carries the
-- two-doors-one-pipeline distinction ("Register" vs "Talk to a sales
-- rep") for admin-queue/notification copy only (23-RESEARCH Answer 4).
--
-- WHAT: ALTER TABLE public.buyer_orgs, all columns additive/nullable
-- except `status` (NOT NULL DEFAULT 'pending_onboarding' — every existing
-- row backfills to pending_onboarding via the default; acceptable since
-- beta has no real buyers yet, per STATE.md) and `source` (NOT NULL
-- DEFAULT 'register' for the same backfill reasoning).
--
-- COLUMN-PRIVILEGE DOCTRINE (Pitfall 6 — this codebase's #1 recurring
-- migration mistake, per migration 090's own precedent): decided
-- per-field, explicitly, below:
--   - status, use_case  -> ADDED to migration 080's authenticated GRANT
--     SELECT allowlist. The buyer portal needs to show "your account is
--     being set up by your AE" during pending_onboarding, and use_case
--     is data the buyer themselves typed in at register.
--   - contact_name, contact_email, contact_phone, contact_role, source
--     -> DELIBERATELY NOT granted to authenticated. These are staff-only
--     lead/CRM fields, mirroring how ae_user_id/verified_at/created_by
--     already stay private on this same table (migration 080/090's
--     documented convention).
--
-- HUMAN-GATED — never `supabase db push` from an agent (matches Phases
-- 16/21/25/28's standing convention). Draft + text-tested only (see
-- __tests__/migration-095.test.ts); the owner reviews and pushes via
-- Codex at the 23-08 checkpoint. Do NOT edit migrations 080-094 (already
-- landed).
-- ============================================================

ALTER TABLE public.buyer_orgs
  ADD COLUMN status text NOT NULL DEFAULT 'pending_onboarding'
    CHECK (status IN ('pending_onboarding', 'active')),
  ADD COLUMN use_case text,
  ADD COLUMN contact_name text,
  ADD COLUMN contact_email text,
  ADD COLUMN contact_phone text,
  ADD COLUMN contact_role text,
  ADD COLUMN source text NOT NULL DEFAULT 'register'
    CHECK (source IN ('register', 'sales_rep'));

COMMENT ON COLUMN public.buyer_orgs.status IS
  'Phase 23: the account-created-but-not-onboarded lifecycle. pending_onboarding (default, every existing row backfills here) means the account exists but the assigned AE has not yet completed onboarding; active means onboarding is complete. Transitioned by a staff-only PATCH (mirrors STAFF_EDITABLE_BUYER_ORG_FIELDS, 23-06). Buyer-readable — added to migration 080''s authenticated GRANT SELECT allowlist so the portal can show onboarding status to the buyer.';

COMMENT ON COLUMN public.buyer_orgs.use_case IS
  'Phase 23: company-level qualifying answer captured at register (agency / film-tv / brand / other), free-form text to match this codebase''s phone/free-text precedent (no validation library). Buyer-readable — the buyer typed this in themselves.';

COMMENT ON COLUMN public.buyer_orgs.contact_name IS
  'Phase 23: the registrant''s name, captured at register/sales-rep signup for the AE''s onboarding-detail surface. Staff-only lead/CRM field — deliberately NOT in migration 080''s authenticated GRANT SELECT allowlist, mirroring ae_user_id/verified_at/created_by.';

COMMENT ON COLUMN public.buyer_orgs.contact_email IS
  'Phase 23: the registrant''s work email, captured at register/sales-rep signup. Staff-only lead/CRM field — deliberately NOT in migration 080''s authenticated GRANT SELECT allowlist.';

COMMENT ON COLUMN public.buyer_orgs.contact_phone IS
  'Phase 23: the registrant''s phone, captured at register/sales-rep signup. Staff-only lead/CRM field — deliberately NOT in migration 080''s authenticated GRANT SELECT allowlist.';

COMMENT ON COLUMN public.buyer_orgs.contact_role IS
  'Phase 23: the registrant''s role at the company, captured at register/sales-rep signup. Staff-only lead/CRM field — deliberately NOT in migration 080''s authenticated GRANT SELECT allowlist.';

COMMENT ON COLUMN public.buyer_orgs.source IS
  'Phase 23: the two-doors discriminant — register (self-serve form) or sales_rep ("Talk to a sales rep"). Same pipeline, admin-copy distinction only (23-RESEARCH Answer 4). Staff-only — deliberately NOT in migration 080''s authenticated GRANT SELECT allowlist.';

-- Extend migration 080's authenticated SELECT allowlist (additive —
-- Postgres column grants accumulate; this does not replace the existing
-- id, name, is_personal, verified, created_at grant).
GRANT SELECT (status, use_case) ON public.buyer_orgs TO authenticated;

-- contact_name, contact_email, contact_phone, contact_role, source are
-- intentionally left ungranted to authenticated/anon — staff-only.

NOTIFY pgrst, 'reload schema';
