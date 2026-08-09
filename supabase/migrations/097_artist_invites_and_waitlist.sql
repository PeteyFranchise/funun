-- ============================================================
-- Funūn — Phase 27 (artist-invite-only-onboarding): data foundation
-- Migration 097 — artist_invites + artist_waitlist tables + email_has_account()
--
-- WHY: Phase 27 gates artist self-serve signup behind an invitation
-- allowlist, enforced inside handle_new_user()'s default (artist) branch
-- (that gate itself is a SEPARATE, higher-risk migration — 098 — kept
-- isolated per 27-RESEARCH's explicit recommendation so a schema-only
-- change can be reviewed/pushed independently of a trigger-body edit).
-- This migration only adds the two tables the gate and the public routes
-- read/write, plus a service-role-only helper for existing-account lookup.
--
-- WHAT:
--   1. artist_invites — the allowlist itself. One row per invited email:
--      Team-Member-issued invites, waitlist conversions, and the owner's
--      own bootstrap ("owner_seed") row. `status`/`source` are constrained
--      to the vocabularies in lib/invites/schema.ts (single TS source of
--      truth — Task 2 of this plan).
--   2. artist_waitlist — D-11's inline denial capture + D-19's broadcast-
--      scoped opt-out. `unsubscribe_token` is a DISTINCT random token, NOT
--      the row's primary key (RESEARCH Security Domain — an IDOR-safe
--      unsubscribe link: leaking a waitlist row's UUID elsewhere can't be
--      used to toggle a stranger's subscription state).
--   3. email_has_account(text) — a SECURITY DEFINER helper the check-invite
--      route uses to tell "invited but no account yet" from "already has
--      an account, sign in instead" without a raw auth.users PostgREST
--      query (that schema isn't exposed) or a full-table listUsers() scan.
--      Supabase's JS admin SDK has no getUserByEmail() (open feature
--      request, supabase/auth#880) — this is the documented workaround.
--
-- Both tables reapply the `funun_staff`/`staff_audit_log` zero-RLS-policy
-- shape (migration 089), further hardened per migration 091's finding that
-- a DML-only REVOKE leaves TRUNCATE/TRIGGER/REFERENCES behind — this
-- migration REVOKEs ALL from the start rather than shipping the gap and
-- needing a 091-style follow-up. ENABLE ROW LEVEL SECURITY with ZERO
-- CREATE POLICY statements + REVOKE ALL FROM PUBLIC, anon, authenticated =
-- reachable ONLY via the service role. Every read/write in later plans
-- goes through an API route using createServiceClient(), never
-- createApiClient() (27-RESEARCH Pitfall 4).
--
-- Why a NEW artist_waitlist table, not the dead `waitlist` table from
-- migration 001: that table's shape doesn't match (no name/note/
-- unsubscribed_at/unsubscribe_token columns) and its permissive
-- `"Anyone can join waitlist" FOR INSERT USING (true)` policy predates
-- this repo's privilege-hardening passes (migrations 070/075/091) — it has
-- never been through the zero-policy/service-role review this project now
-- requires of every new table, and nothing in app/lib/components reads or
-- writes it (confirmed by grep). This is a deliberate divergence, not an
-- oversight (27-RESEARCH Pitfall 5).
--
-- This migration is SCHEMA-ONLY — handle_new_user() is untouched here; the
-- gate itself lands in migration 098.
--
-- HUMAN-GATED — never `supabase db push` from an agent (matches Phases
-- 16/21/25/28's standing convention). Draft + text-tested only. The owner
-- reviews and pushes at this phase's blocking checkpoint (27-11).
-- ============================================================

-- ─── artist_invites (the allowlist) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.artist_invites (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'accepted', 'expired')),
  invite_token        TEXT,
  token_expires_at    TIMESTAMPTZ,
  -- Nullable: waitlist conversions and the owner-seed row may have no
  -- single named inviter (unlike collaborator_invites.inviting_user_id,
  -- which is NOT NULL because every row there has a real inviting user).
  invited_by_user_id  UUID REFERENCES auth.users ON DELETE SET NULL,
  source              TEXT NOT NULL
                      CHECK (source IN ('collaborator', 'staff', 'waitlist_conversion', 'owner_seed')),
  accepted_user_id    UUID REFERENCES auth.users ON DELETE SET NULL,
  accepted_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive lookup — the gate predicate (098) and the check-invite
-- route (later plans) both match emails via LOWER(email), matching the
-- claim_collaborators() case-insensitivity convention (D-04 parity).
CREATE INDEX IF NOT EXISTS idx_artist_invites_email_lower
  ON public.artist_invites (LOWER(email));

-- The gate's pending-lookup and the admin list view both filter on status.
CREATE INDEX IF NOT EXISTS idx_artist_invites_status
  ON public.artist_invites (status);

ALTER TABLE public.artist_invites ENABLE ROW LEVEL SECURITY;

-- No policies are created for any role. An RLS-enabled table with zero
-- policies denies ALL row access to authenticated/anon by construction —
-- combined with the REVOKE ALL below (removing the table-level grants
-- Supabase applies to newly created public-schema tables by default,
-- including TRUNCATE/TRIGGER/REFERENCES, per migration 091's finding),
-- this table is reachable ONLY via the service role.
REVOKE ALL ON public.artist_invites FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.artist_invites IS
  'Phase 27 artist self-serve signup allowlist. Service-role-only (zero RLS policies + REVOKE ALL, mirrors migration 089/091). source in (collaborator, staff, waitlist_conversion, owner_seed); status in (pending, accepted, expired) — see lib/invites/schema.ts for the single TS source of truth. Read by handle_new_user()''s gate (migration 098) and by POST /api/signup/check-invite (later plans).';

-- ─── artist_waitlist (D-11 denial capture + D-19 broadcast opt-out) ───────
CREATE TABLE IF NOT EXISTS public.artist_waitlist (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                  TEXT NOT NULL,
  name                   TEXT,
  note                   TEXT,
  unsubscribed_at        TIMESTAMPTZ,
  -- Distinct random token, NOT the row's primary key — RESEARCH Security
  -- Domain IDOR mitigation: a waitlist UUID leaked elsewhere (e.g. an
  -- admin list view) cannot be used to toggle a stranger's subscription
  -- state via the unsubscribe link.
  unsubscribe_token      TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  -- Idempotency guard for the Leadership-only reopen broadcast (RESEARCH
  -- Pitfall 6) — the broadcast route only emails rows where this is NULL.
  notified_reopen_at     TIMESTAMPTZ,
  converted_to_invite_at TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive UNIQUE — the conflict target the waitlist upsert
-- (POST /api/waitlist, later plans) relies on for D-19's rejoin-auto-
-- resubscribes behavior (`ON CONFLICT (email_lower) DO UPDATE ...`).
CREATE UNIQUE INDEX IF NOT EXISTS idx_artist_waitlist_email_lower
  ON public.artist_waitlist (LOWER(email));

ALTER TABLE public.artist_waitlist ENABLE ROW LEVEL SECURITY;

-- No policies are created for any role — same zero-policy + REVOKE ALL
-- service-role-only shape as artist_invites above.
REVOKE ALL ON public.artist_waitlist FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.artist_waitlist IS
  'Phase 27 waitlist capture for denied signup attempts (D-11) + broadcast-scoped opt-out (D-19). Service-role-only (zero RLS policies + REVOKE ALL). Deliberately NOT the dead `waitlist` table from migration 001 — see this migration''s header comment for the schema-mismatch + pre-hardening-policy rationale. unsubscribe_token is a distinct random token, never the row id, for IDOR safety on unsubscribe links.';

-- ─── email_has_account(text) — service-role-only existing-account check ──
-- SECURITY DEFINER against auth.users, locked down exactly like migration
-- 075 locked down claim_collaborators()/backfill_claimed_collaborators():
-- EXECUTE revoked from PUBLIC/anon/authenticated, granted only to
-- service_role. Never exposed to PostgREST directly — called only from the
-- check-invite route via the service-role client (RESEARCH "Don't
-- Hand-Roll" — Supabase's admin SDK has no getUserByEmail()).
CREATE OR REPLACE FUNCTION public.email_has_account(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(p_email)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.email_has_account(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.email_has_account(text) TO service_role;

COMMENT ON FUNCTION public.email_has_account(text) IS
  'Service-role-only existing-account lookup for the check-invite route (Phase 27). SECURITY DEFINER against auth.users; EXECUTE revoked from PUBLIC/anon/authenticated, granted only to service_role — mirrors migration 075''s claim_collaborators() lockdown. Never exposed to PostgREST.';

-- Table/function privilege changes affect what PostgREST exposes.
NOTIFY pgrst, 'reload schema';
