-- ============================================================
-- Funun - Quick task 261017-u5c (suppress hard-bounced addresses, GH #190)
-- migration 246 - email_suppressions
--
-- WHY: the Resend webhook (app/api/webhooks/resend/route.ts) used to record
-- a hard bounce only on curators.email_valid. Every other recipient class
-- (collaborators, buyers, invitees, staff, alerts, notifications) kept
-- receiving mail at an address that had already hard-bounced, which hurts
-- sender reputation and Resend account standing.
--
-- WHAT: one app-wide suppression list. The webhook upserts a row on every
-- verified HardBounce event, for any address. sendEmail() in
-- lib/email/index.ts reads this table before every send and skips
-- suppressed recipients, so every caller is covered without being touched.
--
-- Addresses are stored normalized (trimmed, lowercased) and the CHECK
-- enforces it, so a casing mismatch between the writer and the reader can
-- never silently miss a row.
--
-- source_event_id holds the svix-id of the signed Resend event that caused
-- the suppression, so every row traces back to a specific delivery.
--
-- Service-role only, same shape as migrations 089/097/229: RLS enabled with
-- zero policy statements, then REVOKE ALL FROM PUBLIC, anon, authenticated.
-- The list is a set of third-party email addresses; no browser client should
-- read it, and none should be able to delete a row to re-enable mail to a
-- bounced address or insert one to block someone else's invites.
--
-- Deploy order: sendEmail() fails open if this table is absent (it reports
-- to Sentry and sends anyway), and the webhook returns 500 until the table
-- exists so Resend keeps retrying and no bounce is lost. So the code is safe
-- to deploy before this migration is applied.
--
-- No function is defined here, so no search_path pinning is needed.
--
-- HUMAN-GATED - never `supabase db push` from an agent (matches migrations
-- 089/095/097/229's standing convention). Draft + text-tested only
-- (__tests__/migration-246-email-suppressions.test.ts); the owner reviews
-- and applies it.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  email            TEXT PRIMARY KEY
                    CHECK (email = lower(btrim(email)))
                    CHECK (length(email) > 0),
  reason           TEXT NOT NULL
                    CHECK (length(btrim(reason)) > 0),
  source_event_id  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.email_suppressions FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.email_suppressions IS
  'App-wide list of hard-bounced email addresses (normalized lowercase). Written by the Resend webhook on HardBounce, read by sendEmail() before every send. Service-role only: RLS on with zero policies, all browser roles revoked. HUMAN-GATED: never `supabase db push` from an agent.';

NOTIFY pgrst, 'reload schema';
