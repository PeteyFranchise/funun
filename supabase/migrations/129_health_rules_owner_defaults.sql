-- ============================================================
-- Funūn — Phase 31.1 (AE Console: Health, Leadership Tower,
--                     Telemetry, Team RBAC) — Gap Closure
-- Migration 129: health_rules_config owner defaults (3-threshold model)
--
-- WHY: verification found two gaps against the health_rules_config data
-- model shipped by migration 128. Gap 1 (CR-01): the config exposed four
-- independently-tunable thresholds (good/warning/at_risk/cold), but there
-- are only three real color boundaries — Cold is OPEN-ENDED ("everything
-- past At-risk"), not a separately-tunable cutoff. The application layer
-- fix (lib/client-partners/health.ts, app/api/admin/health-rules/route.ts,
-- components/admin/HealthRulesForm.tsx) retires cold_after_days as a
-- client-editable / color-model input in the SAME gap-closure pass this
-- migration ships alongside. This migration updates the DATA to match:
-- the OWNER-DECIDED thresholds (2026-08-24) are Good ≤30 days, Warning
-- 31–60 days, At-risk 61–180 days, Cold 181+ days (open-ended).
-- migration 128 seeded good=90/warning=120/at_risk=180/cold=365 — this
-- migration corrects the seeded row AND the column defaults so any future
-- environment seeds the owner's model, not 128's placeholder numbers.
-- at_risk_after_days is already 180 (matches the owner's number) so it is
-- left untouched; only good_within_days, warning_after_days, and
-- cold_after_days move.
--
-- cold_after_days remains a NOT NULL column (unchanged shape) — the
-- application layer now force-writes it to always equal
-- at_risk_after_days on every PATCH (so the column stays honest: Cold
-- begins exactly where At-risk ends), and this migration seeds it to 180
-- to match that same invariant on day one, before any leadership save.
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (matches Phases 16/21/25/28/32/112/128's standing convention). Draft +
-- text-tested only (__tests__/migration-129.test.ts); the owner reviews
-- and pushes via `supabase db push` against prod (project
-- wgfjakfiyeewzfuxkgyo). Do NOT edit migrations 001-128 (already landed).
-- ============================================================

-- ─── (a) Correct the seeded singleton row to the owner's thresholds ─────
UPDATE public.health_rules_config
SET good_within_days   = 30,
    warning_after_days = 60,
    cold_after_days    = 180
WHERE id = 1;

-- ─── (b) Correct the column defaults so fresh environments seed the ────
--         owner's model, not migration 128's placeholder numbers.
ALTER TABLE public.health_rules_config
  ALTER COLUMN good_within_days   SET DEFAULT 30,
  ALTER COLUMN warning_after_days SET DEFAULT 60,
  ALTER COLUMN cold_after_days    SET DEFAULT 180;

-- ─── (c) Schema-cache reload ──────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
