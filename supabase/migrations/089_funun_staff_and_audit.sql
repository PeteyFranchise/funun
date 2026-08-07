-- ============================================================
-- Funūn — Phase 25 (funun-team-accounts-ae): staff identity + audit trail
-- Migration 089
--
-- WHY: Phase 25 generalizes the binary `app_metadata.is_admin` gate into a
-- three-tier staff role (leadership/ae/bd — lib/admin/gate.ts, 25-01). The
-- gate itself is enforced entirely off `app_metadata.staff_role` (D-01/A4):
-- this migration adds the DISPLAY/profile companion table (`funun_staff`,
-- Team Member Directory contact-card fields — title/phone/avatar_url) plus
-- the write-audit trail every staff mutation must produce (D-04, Pitfall 1
-- of 25-RESEARCH.md, mirroring migration 058's verification_audit_log).
--
-- WHAT: two new tables, both RLS-enabled with ZERO policies and a full
-- REVOKE from authenticated/anon — reachable ONLY via the service role,
-- reapplying migration 058's proven zero-RLS-policy shape verbatim:
--   1. funun_staff — one row per staff account, keyed to auth.users.
--      staff_role here is a DISPLAY COPY of the authoritative
--      app_metadata.staff_role (Pitfall 1) — any role change must write
--      BOTH in the same handler (25-04), never split across two endpoints.
--   2. staff_audit_log — who/what/when for every staff write to client
--      (buyer_orgs/buyer_members) or staff (funun_staff) data, mirroring
--      verification_audit_log's shape exactly.
--
-- HUMAN-GATED — never `supabase db push` from an agent (matches Phases
-- 16/21/25/28's standing convention). Draft + text-tested only (see
-- __tests__/migration-089-090.test.ts); the owner reviews and pushes via
-- Codex at the 25-07 checkpoint. Do NOT edit migrations 080-088 (already
-- landed).
-- ============================================================

-- ─── funun_staff (Team Member identity + directory profile) ──────────────
CREATE TABLE IF NOT EXISTS public.funun_staff (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  staff_role   TEXT NOT NULL CHECK (staff_role IN ('leadership', 'ae', 'bd')),
  display_name TEXT,
  title        TEXT,
  phone        TEXT,
  avatar_url   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funun_staff_user_id ON public.funun_staff (user_id);

ALTER TABLE public.funun_staff ENABLE ROW LEVEL SECURITY;

-- No policies are created for any role. An RLS-enabled table with zero
-- policies denies ALL row access to authenticated/anon by construction —
-- combined with the REVOKE below (which removes the table-level grant
-- Supabase applies to newly created public-schema tables by default),
-- this table is reachable ONLY via the service role (staff listing/create/
-- edit routes, 25-04, and the read-only Team Member Directory, 25-10).
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.funun_staff FROM authenticated, anon;

COMMENT ON TABLE public.funun_staff IS
  'Funūn Team Member identity + directory profile (Phase 25). Service-role-only, mirrors migration 058''s verification_audit_log zero-RLS-policy shape. staff_role here is a DISPLAY COPY of the authoritative app_metadata.staff_role (the gate in lib/admin/gate.ts checks app_metadata only) — any role change must write BOTH in the same handler, never split across two endpoints (25-RESEARCH.md Pitfall 1). title/phone/avatar_url are the Team Member Directory contact-card fields (25-10); avatar_url is the member''s photo with an initials fallback in the UI.';

-- ─── staff_audit_log (D-04: audit every staff write) ──────────────────────
CREATE TABLE IF NOT EXISTS public.staff_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES auth.users ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   UUID,
  changes     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_audit_log_actor
  ON public.staff_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_audit_log_target
  ON public.staff_audit_log (target_type, target_id, created_at DESC);

ALTER TABLE public.staff_audit_log ENABLE ROW LEVEL SECURITY;

-- No policies are created for any role. An RLS-enabled table with zero
-- policies denies ALL row access to authenticated/anon by construction —
-- combined with the REVOKE below (which removes the table-level grant
-- Supabase applies to newly created public-schema tables by default),
-- this table is reachable ONLY via the service role, written exclusively
-- via lib/staff/audit.ts's logStaffAction() (25-02) from staff write
-- routes. A staff account cannot read, forge, or tamper with its own
-- audit trail (T-25-03, T-25-16).
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.staff_audit_log FROM authenticated, anon;

COMMENT ON TABLE public.staff_audit_log IS
  'Staff write-action audit trail (Phase 25 D-04). Service-role-only, mirrors migration 058''s verification_audit_log exactly. Never authenticated/anon-writable or -readable. Written exclusively via lib/staff/audit.ts''s logStaffAction().';

NOTIFY pgrst, 'reload schema';
