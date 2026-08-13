-- ============================================================
-- Funūn — Phase 32 (Production Observability, Capacity & Incident
-- Readiness): observability_recipients — the growable alert-recipient /
-- incident-owner list behind the D-10 config layer
-- Migration 110
--
-- WHY: 32-CONTEXT.md D-10 — all tunable thresholds, the alert-recipient
-- list, and the incident owners live in ONE owner-editable config surface.
-- Thresholds + the SEV-1..4 enum are a typed module
-- (lib/observability/config.ts, this same plan) since they're mostly
-- static and benefit from type-checking; the recipient/owner list is
-- table-backed here so it is addable WITHOUT a redeploy as the team grows
-- (D-08: "Alert destinations MUST be extensible ... never a hardcoded
-- single sink") — the natural target for the deferred Observability Admin
-- Dashboard's CRUD UI (32-CONTEXT.md "Deferred Ideas").
--
-- 32-CONTEXT.md D-04 — monitoring-data access is founder-only for now.
-- This table carries no product/user data (email + role only), but it IS
-- the routing table for every production alert, so it gets the same
-- founder-only, zero-policy RLS posture as funun_staff (migration 089) and
-- the ANR staff-role widen (migration 108).
--
-- WHAT: create public.observability_recipients (id, email, role,
-- created_at). Enable RLS with NO policies — service-role reads/writes
-- bypass RLS entirely; there is deliberately no authenticated-role access
-- and no UI this phase. lib/observability/config.ts's getAlertRecipients()/
-- getIncidentOwners() read this table via createServiceClient() only, and
-- fall back to a Pete-only default recipient whenever the table is
-- empty/unreachable (including before this migration is pushed) — so no
-- downstream alerting/plan is blocked on the push.
--
-- T-32-01 (Tampering / Elevation of Privilege, high, mitigate): zero-policy
-- RLS means no authenticated/anon caller can read or write this table via
-- PostgREST, regardless of session — asserted by __tests__/migration-110
-- .test.ts (zero CREATE POLICY statements against observability_recipients).
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (matches migrations 080/081/089/090/096/106/108's standing convention).
-- Draft + text-tested only; the owner reviews and pushes via their normal
-- Codex `supabase db push` flow. Do NOT edit migrations 001-109 (already
-- landed).
-- ============================================================

-- ─── observability_recipients: growable alert-recipient / owner list ──
CREATE TABLE public.observability_recipients (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        NOT NULL,
  role       text        NOT NULL CHECK (role IN ('primary', 'backup', 'watcher')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.observability_recipients ENABLE ROW LEVEL SECURITY;

-- Deliberately NO CREATE POLICY statements — zero-policy RLS. Only the
-- service-role client (which bypasses RLS entirely) may read or write this
-- table; there is no authenticated-role or anon access path, matching the
-- funun_staff founder-only precedent (migration 089).

COMMENT ON TABLE public.observability_recipients IS
  'D-10 config layer: the growable alert-recipient/incident-owner surface behind lib/observability/config.ts (Phase 32). Read via getAlertRecipients()/getIncidentOwners() using createServiceClient() only — zero-policy RLS, founder-only access (D-04). role = primary | backup | watcher (D-13: Pete is primary; no dedicated backup yet). Rows are addable without a redeploy, the deferred Observability Admin Dashboard is a thin CRUD UI over this table.';

COMMENT ON COLUMN public.observability_recipients.email IS
  'Recipient email address for the alert fan-out helper (lib/observability/alerts.ts, Plan 05). Never displayed publicly.';

COMMENT ON COLUMN public.observability_recipients.role IS
  'primary/backup = incident owners (getIncidentOwners()); watcher = fan-out recipient only, not an incident owner.';

NOTIFY pgrst, 'reload schema';
