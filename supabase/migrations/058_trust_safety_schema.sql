-- ============================================================
-- Funūn — Wave 4: The Green Room
-- Migration 058: Trust & Safety schema (reports, verification audit,
-- profile/open-to visibility)
-- Run via: supabase db push
-- ============================================================
-- Phase 13 closes the Green Room safety loop (13-CONTEXT.md). This
-- migration authors the database rails only — the Network tab API/UI
-- (13-02), block-enforcement retrofit (13-03), reporting/admin review API
-- (13-04), and verification/visibility settings API (13-05) all build on
-- top of what this migration creates. Do not `supabase db push` this from
-- an executor agent — the live push is a human-gated checkpoint in a
-- later plan.
--
-- Security posture:
-- - Reports are private by default: a reporter can read only id/
--   target_type/status/created_at for THEIR OWN rows (RLS row-scope +
--   column-level GRANT). Admin fields (admin_notes, reviewed_by,
--   reviewed_at) and every write path are server-owned via the service
--   role, mirroring migration 056's dm_threads/dm_messages hardening —
--   report creation needs app-level validation (target must actually be
--   reportable/visible to the reporter) and admin review is an authority
--   action, so neither belongs on a client-writable RLS policy alone.
-- - A reported user has NO SELECT path to any report row about them: the
--   only SELECT policy is scoped to reporter_id = auth.uid(), regardless
--   of what target_id/target_type the row references.
-- - verification_audit_log is fully admin/service-role only: RLS enabled
--   with zero policies denies all authenticated/anon access by
--   construction; the REVOKE below removes the table-level grant Supabase
--   applies to newly created public-schema tables by default.
-- - profile_visibility/open_to_visibility are additive, non-PII columns
--   on artist_profiles. Following migration 040's column-privilege
--   pattern, they get an explicit column-level SELECT grant (the table
--   already had `REVOKE SELECT ON artist_profiles FROM authenticated,
--   anon` applied in 040, so any new column starts PRIVATE by default —
--   these two are deliberately opted back in because the public profile
--   route (app/u/[handle]/page.tsx) runs as the anon/authenticated
--   session client and needs to read them to decide what to render).
--   verified_at is intentionally left with NO grant — it stays private
--   like the pre-existing verified_by column, admin-audit data only.
-- - No_block() wiring: reports and verification_audit_log have no
--   cross-user SELECT path at all (row-scoped to the reporter, or
--   service-role-only), so there is nothing for no_block() to gate here.
--   Retrofitting no_block() into EXISTING socially-exposed tables is
--   Wave 3's job (13-03), not this schema-planning plan.
-- ============================================================

-- ─── artist_profiles: visibility + verification audit columns ───────────
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS profile_visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (profile_visibility IN ('public', 'connections_only')),
  ADD COLUMN IF NOT EXISTS open_to_visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (open_to_visibility IN ('public', 'connections', 'hidden')),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Additive column-level SELECT grant only (no REVOKE needed — migration 040
-- already revoked table-level SELECT from authenticated/anon; new columns
-- are private until explicitly granted, so this is opt-in, not a widening).
GRANT SELECT (profile_visibility, open_to_visibility)
  ON artist_profiles TO authenticated, anon;

-- Owner-facing writes to these two settings, plus verified/verified_at/
-- verified_by, all go through service-role API routes in Plan 13-05
-- (mirrors is_public's existing precedent: no direct authenticated UPDATE
-- grant, app/api/profile/route.ts writes via createServiceClient() after
-- its own allowlist check). No UPDATE grant is added here.

COMMENT ON COLUMN artist_profiles.profile_visibility IS
  'Server-enforced profile visibility (SAFETY-04): public or connections_only. Read by the public profile route via the session client, so it carries an explicit column-level SELECT grant.';

COMMENT ON COLUMN artist_profiles.open_to_visibility IS
  'Independent of profile_visibility (SAFETY-04): a public profile can still hide its open_to status. public/connections/hidden.';

COMMENT ON COLUMN artist_profiles.verified_at IS
  'Timestamp of the last admin verification grant/revoke action (SAFETY-03). Private — no authenticated/anon grant, mirrors the existing verified_by column. Full history lives in verification_audit_log.';

-- ─── reports (SAFETY-02) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id  UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN (
                 'profile',
                 'message',
                 'green_room_post',
                 'green_room_comment',
                 'green_room_repost',
                 'green_room_placement'
               )),
  target_id    UUID NOT NULL,
  reason       TEXT NOT NULL CHECK (reason IN (
                 'harassment',
                 'spam',
                 'impersonation',
                 'inappropriate_content',
                 'scam_fraud',
                 'other'
               )),
  details      TEXT CHECK (details IS NULL OR char_length(details) <= 2000),
  status       TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
                 'submitted',
                 'under_review',
                 'actioned',
                 'dismissed'
               )),
  admin_notes  TEXT,
  reviewed_by  UUID REFERENCES auth.users ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter_created
  ON reports (reporter_id, created_at DESC);

-- Admin review queue: newest open reports first.
CREATE INDEX IF NOT EXISTS idx_reports_status_created
  ON reports (status, created_at)
  WHERE status IN ('submitted', 'under_review');

CREATE INDEX IF NOT EXISTS idx_reports_target
  ON reports (target_type, target_id);

DROP TRIGGER IF EXISTS reports_updated_at ON reports;
CREATE TRIGGER reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_select_own" ON reports;

-- Reporter can read only their own report rows — never another user's,
-- and never a row where they are the TARGET rather than the reporter
-- (target_id is never compared against auth.uid() by this policy).
CREATE POLICY "reports_select_own" ON reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

-- Column lockdown: even on their own row, a reporter must not read
-- internal moderation fields (admin_notes, reviewed_by, reviewed_at) or
-- resubmit target_id/reason/details post-hoc. Mirrors migration 040's
-- REVOKE-then-column-GRANT pattern.
REVOKE SELECT ON reports FROM authenticated, anon;
GRANT SELECT (id, target_type, status, created_at) ON reports TO authenticated;

-- All writes are server-owned (mirrors migration 056's dm_threads/
-- dm_messages hardening): report creation needs app-level validation
-- (target must be reportable/visible to the reporter, per-target
-- de-duplication) and admin review actions (status/admin_notes/
-- reviewed_by/reviewed_at) are an authority action. No authenticated/anon
-- client can write directly; Plan 13-04's API routes use the service role
-- after their own auth/ownership checks.
REVOKE INSERT, UPDATE, DELETE ON reports FROM authenticated, anon;

COMMENT ON TABLE reports IS
  'Reports are private by default (SAFETY-02): reporters see only id/target_type/status/created_at for their own rows via RLS + column grants; admin review fields and all writes are server-owned via the service role (Plan 13-04). A reported user has no SELECT path to any report row about them.';

-- ─── verification_audit_log (SAFETY-03) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS verification_audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id  UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  action      TEXT NOT NULL CHECK (action IN ('grant', 'revoke')),
  actor_id    UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_audit_log_profile
  ON verification_audit_log (profile_id, created_at DESC);

ALTER TABLE verification_audit_log ENABLE ROW LEVEL SECURITY;

-- No policies are created for any role. An RLS-enabled table with zero
-- policies denies ALL row access to authenticated/anon by construction —
-- combined with the REVOKE below (which removes the table-level grant
-- Supabase applies to newly created public-schema tables by default),
-- this table is reachable ONLY via the service role (admin verification
-- routes, Plan 13-05). Verified badge grant/revoke must remain admin-only
-- and never become owner-editable (13-EXECUTION-PACKET.md non-negotiable
-- safety rule).
REVOKE SELECT, INSERT, UPDATE, DELETE ON verification_audit_log FROM authenticated, anon;

COMMENT ON TABLE verification_audit_log IS
  'Admin-only audit trail for artist_profiles.verified grant/revoke actions (SAFETY-03). No authenticated/anon access; written and read exclusively via the service role in admin verification routes (Plan 13-05).';
