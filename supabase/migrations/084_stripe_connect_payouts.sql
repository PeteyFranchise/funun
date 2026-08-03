-- ============================================================
-- Funūn — Wave 4 follow-on: Phase 16 GTM Beta Launch & Buyer Portal
-- Migration 084: Stripe Connect account state on user_profiles +
--                 payment-state columns on license_requests
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push against the remote database is a human-gated checkpoint
-- (mirrors migrations 058/062/063/064/066-070/075/076/078/080/081/082's
-- "do not push from an executor agent" convention) — the final checkpoint
-- task in plan 16-08 owns the push, `supabase migration list` confirmation,
-- and the live Stripe Connect test-mode payment verification.
--
-- ─── user_profiles: connected account id + onboarding state (D-17a) ──────
-- stripe_connect_account_id is a financial identifier and MUST NOT be
-- granted to authenticated/anon (T-16-35) — it stays PRIVATE by omission,
-- exactly like every other column added to user_profiles since migration
-- 040 that wasn't explicitly re-granted (082's isni/gs1_company_prefix
-- precedent: a newly-added column carries no column-level SELECT/UPDATE
-- privilege until explicitly GRANTed). This migration still runs an
-- explicit REVOKE on that one column as defense-in-depth, matching this
-- repo's treatment of its most sensitive additions (082's
-- platform_identifier_config).
--
-- The three onboarding-status booleans mirror Stripe's own Account object
-- fields (charges_enabled/payouts_enabled/details_submitted) so the
-- payouts-settings GET route (app/api/settings/payouts/route.ts) can serve
-- a fast, DB-backed status without a live Stripe call on every page load,
-- refreshed both by that route (on redirect-back, a live check) and by the
-- account.updated webhook event (app/api/webhooks/stripe/route.ts).
--
-- ─── license_requests: payment state (D-17/D-20) ─────────────────────────
-- payment_status/stripe_checkout_session_id/stripe_payment_intent_id/
-- paid_at record where a deal is in the Checkout -> webhook lifecycle:
-- unpaid (default) -> awaiting_payment (admin pay route creates the
-- Checkout Session) -> paid (webhook-confirmed checkout.session.completed
-- — this is the signal plan 16-10 reads to unlock buyer delivery). Writes
-- are revoked from authenticated/anon — every write is service-role, from
-- the admin pay route or the signature-verified webhook (RESEARCH Pitfall
-- 3 / migration 081's existing write-lockdown doctrine, re-applied here
-- for these four new columns). SELECT is deliberately left at its
-- migration 081 default (no new GRANT) — these columns start PRIVATE like
-- every column added after 081's explicit allowlist, mirroring 082's isni
-- decision: a future plan that needs to render payment status in the
-- buyer/artist UI adds the column-level GRANT alongside that consuming
-- code, not here in isolation.
-- ============================================================

-- ─── (a) user_profiles: Stripe Connect account state ─────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id        TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.stripe_connect_account_id IS
  'Stripe Connect Express connected account id (D-17a). A financial identifier — deliberately ungranted to authenticated/anon (T-16-35); read/written exclusively via the service-role client from app/api/settings/payouts/route.ts, app/api/admin/deals/[id]/pay/route.ts, and the Stripe webhook.';

COMMENT ON COLUMN public.user_profiles.stripe_connect_charges_enabled IS
  'Mirrors Stripe Account.charges_enabled. Refreshed by the payouts-settings GET route (live check) and the account.updated webhook event — never client-writable.';

COMMENT ON COLUMN public.user_profiles.stripe_connect_payouts_enabled IS
  'Mirrors Stripe Account.payouts_enabled. The admin pay route (app/api/admin/deals/[id]/pay/route.ts) requires this true before it will create a buyer Checkout Session for a deal owned by this artist.';

COMMENT ON COLUMN public.user_profiles.stripe_connect_details_submitted IS
  'Mirrors Stripe Account.details_submitted — true once the artist has completed Stripe-hosted Express onboarding, even if charges/payouts are still pending Stripe review.';

-- Defense-in-depth: explicit REVOKE for the one column above that is a
-- genuine financial identifier, even though it already carries no grant
-- by default (see header note).
REVOKE SELECT (stripe_connect_account_id) ON public.user_profiles FROM authenticated, anon;

-- ─── (b) license_requests: payment state ─────────────────────────────────
ALTER TABLE license_requests
  ADD COLUMN IF NOT EXISTS payment_status            TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'awaiting_payment', 'paid')),
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id   TEXT,
  ADD COLUMN IF NOT EXISTS paid_at                    TIMESTAMPTZ;

-- A given Checkout Session must resolve to exactly one deal; the partial
-- uniqueness (WHERE NOT NULL) lets every unpaid/awaiting deal keep a null
-- session id without colliding.
CREATE UNIQUE INDEX IF NOT EXISTS idx_license_requests_stripe_checkout_session_id
  ON public.license_requests (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

COMMENT ON COLUMN public.license_requests.payment_status IS
  'D-17/D-20 payment lifecycle: unpaid (no session created yet) -> awaiting_payment (Checkout Session created by the admin pay route) -> paid (webhook-confirmed checkout.session.completed, idempotent on redelivery per T-16-37). Written exclusively by app/api/admin/deals/[id]/pay/route.ts and the signature-verified Stripe webhook — never client-writable (see REVOKE below).';

COMMENT ON COLUMN public.license_requests.stripe_checkout_session_id IS
  'The Stripe Checkout Session id created for this deal''s payment; the webhook resolves an incoming checkout.session.completed event back to this deal by matching on this column.';

COMMENT ON COLUMN public.license_requests.stripe_payment_intent_id IS
  'The underlying PaymentIntent id, recorded once the webhook confirms payment — the destination transfer + application fee (D-17a/D-20) live on this PaymentIntent in the Stripe dashboard.';

-- Re-issuing migration 081's write lockdown here (a no-op against the
-- already-revoked existing columns) keeps THIS migration self-documenting
-- about the four new columns' write posture without relying on the reader
-- to cross-reference 081.
REVOKE INSERT, UPDATE, DELETE ON public.license_requests FROM authenticated, anon;

-- ─── (c) Schema-cache reload ──────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
