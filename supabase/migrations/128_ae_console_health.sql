-- ============================================================
-- Funūn — Phase 31.1 (AE Console: Health, Leadership Tower,
--                     Telemetry, Team RBAC)
-- Migration 128: executed-license timestamp, D-10 pipeline stages,
--                 health-rules config singleton, Game Plan store,
--                 D-07 onboarding-task queue
--
-- WHY: every downstream 31.1 plan (health render, Health Rules screen,
-- assign handoff, Game Plan) reads tables/columns that do not exist yet.
-- This is the gating data-model dependency for the whole phase.
--
-- (a) EXECUTED-LICENSE TIMESTAMP (D-31.1-09, owner-decided 2026-08-23):
-- the relationship-health color clock reads the date a client's license
-- agreement is EXECUTED / SIGNED (e-sign completion) — NOT deal-stage
-- closed_won, NOT payment-received. RESEARCH confirmed esign_envelopes
-- (migration 124) ties to split_sheets — the songwriter side — NOT the
-- buyer/sync license, so no per-deal executed timestamp exists tied to a
-- buyer_org today. Adds license_requests.executed_at, stamped by the
-- deal-stage/e-sign-completion route once a sync license is marked
-- executed/signed (that write lands in a later 31.1 plan, gated on the
-- executed/signed event per D-31.1-09 — this migration only adds the
-- column). Forward-compatible with lib/esign/provider.ts's vendor-agnostic
-- EsignState contract (dropbox_sign/docusign/docuseal). Private by
-- default: executed_at is deliberately NOT added to migration 081's
-- authenticated GRANT SELECT allowlist on license_requests.
--
-- (b) D-10 PIPELINE STAGES — leadership-configurable stage model
-- (New lead / Contacted / Active / Negotiating / Closed/Dormant), plus
-- buyer_orgs.pipeline_stage_id + stage_entered_at (days-in-stage =
-- now() - stage_entered_at, computed on read — no triggers/cron).
--
-- (c) HEALTH_RULES_CONFIG — a seeded singleton row (id=1, D-31.1-03) with
-- tunable Good/Warning/At-risk/Cold thresholds (days), "keeps-warm" toggles
-- (open brief / open deal / recent Selects / optional recent contact), and
-- prospect_image_url (D-31.1-08 — null renders the neutral placeholder
-- marker; owner supplies/replaces the image asset from the Health Rules
-- screen with no code change).
--
-- (d) GAME_PLANS — one row per buyer_org (R14/D-31.1-06), a saved
-- per-account call-prep doc (topics as JSONB).
--
-- (e) ONBOARDING_TASKS — net-new D-07 auto-created handoff task queue,
-- one row per assignment, indexed by (assignee_id, status). This is NOT
-- the jobs worker queue (migration 118) — a distinct, staff-facing task
-- list surfaced in the receiving AE's My view.
--
-- COLUMN-PRIVILEGE DOCTRINE (Pitfall 4/6, mirrors migration 090/095/112):
-- every new buyer_orgs/license_requests column added by this migration
-- (executed_at, pipeline_stage_id, stage_entered_at) is private by
-- default — none is added to any authenticated GRANT SELECT allowlist.
-- Postgres column grants are additive, so simply omitting them here is
-- sufficient; they can be opted in later via an explicit GRANT SELECT
-- statement if a buyer-facing surface ever needs them (none does today).
--
-- RLS DOCTRINE (MANDATORY — mirrors migration 112 §e exactly): every new
-- table gets ENABLE ROW LEVEL SECURITY with ZERO policies, plus a full
-- REVOKE SELECT, INSERT, UPDATE, DELETE ... FROM authenticated, anon. An
-- RLS-enabled table with zero policies denies ALL row access to
-- authenticated/anon by construction — combined with the REVOKE, every
-- new table here is reachable ONLY via the service role from
-- requireStaff-gated routes. No CREATE POLICY statement appears anywhere
-- in this file.
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (matches Phases 16/21/25/28/32/112's standing convention). Draft +
-- text-tested only (__tests__/migration-128.test.ts); the owner reviews
-- and pushes via `supabase db push` against prod (project
-- wgfjakfiyeewzfuxkgyo) at the 31.1-01 Task 3 checkpoint. Do NOT edit
-- migrations 001-127 (already landed).
-- ============================================================

-- ─── (a) license_requests.executed_at — the health-color clock source ───
ALTER TABLE public.license_requests ADD COLUMN executed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.license_requests.executed_at IS
  'D-31.1-09 (owner-decided 2026-08-23): the executed/signed-license moment (e-sign completion) that drives the relationship-health color clock. Deliberately distinct from stage=''closed_won'' and from any payment-received event — health recency must read the actual signing moment, not the deal-pipeline stage. Stamped by the deal-stage/e-sign-completion route once a sync license is marked executed/signed (a later 31.1 plan), forward-compatible with lib/esign/provider.ts''s vendor-agnostic EsignState contract (dropbox_sign/docusign/docuseal). No backfill — prod buyer_orgs/license_requests are empty. Private by default: NOT added to migration 081''s authenticated GRANT SELECT allowlist.';

-- ─── (b) pipeline_stages — D-10 leadership-configurable stage model ─────
CREATE TABLE public.pipeline_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_]+$'),
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS pipeline_stages_updated_at ON public.pipeline_stages;
CREATE TRIGGER pipeline_stages_updated_at
  BEFORE UPDATE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.pipeline_stages IS
  'D-10: leadership-configurable pipeline stages for buyer_orgs (days-in-stage measured against stage_entered_at). Seeded with the five default stages below; a leader may relabel/reorder/add stages later via the Health Rules-adjacent config surface. Staff-only.';

-- Seed the D-10 defaults with stable keys.
INSERT INTO public.pipeline_stages (key, label, sort_order, is_terminal) VALUES
  ('new_lead',       'New lead',       1, false),
  ('contacted',      'Contacted',      2, false),
  ('active',         'Active',         3, false),
  ('negotiating',    'Negotiating',    4, false),
  ('closed_dormant', 'Closed/Dormant', 5, true)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.buyer_orgs
  ADD COLUMN pipeline_stage_id UUID REFERENCES public.pipeline_stages ON DELETE SET NULL,
  ADD COLUMN stage_entered_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.buyer_orgs.pipeline_stage_id IS
  'D-10: the org''s current pipeline stage (references pipeline_stages). Private by default — NOT added to migration 080''s authenticated GRANT SELECT allowlist.';

COMMENT ON COLUMN public.buyer_orgs.stage_entered_at IS
  'D-10: when the org entered its current pipeline_stage_id — days-in-stage is computed on read as now() - stage_entered_at (D-06 doctrine, no triggers/cron). Private by default — NOT added to migration 080''s authenticated GRANT SELECT allowlist.';

-- ─── (c) health_rules_config — seeded singleton (D-31.1-03/08) ──────────
CREATE TABLE public.health_rules_config (
  id                       INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  good_within_days         INTEGER NOT NULL DEFAULT 90,
  warning_after_days       INTEGER NOT NULL DEFAULT 120,
  at_risk_after_days       INTEGER NOT NULL DEFAULT 180,
  cold_after_days          INTEGER NOT NULL DEFAULT 365,
  keep_warm_open_brief     BOOLEAN NOT NULL DEFAULT true,
  keep_warm_open_deal      BOOLEAN NOT NULL DEFAULT true,
  keep_warm_recent_selects BOOLEAN NOT NULL DEFAULT true,
  recent_selects_days      INTEGER NOT NULL DEFAULT 21,
  keep_warm_recent_contact BOOLEAN NOT NULL DEFAULT false,
  recent_contact_days      INTEGER NOT NULL DEFAULT 30,
  prospect_image_url       TEXT,
  updated_by               UUID REFERENCES auth.users,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS health_rules_config_updated_at ON public.health_rules_config;
CREATE TRIGGER health_rules_config_updated_at
  BEFORE UPDATE ON public.health_rules_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.health_rules_config IS
  'D-31.1-03: a leadership-only settings singleton (id=1, enforced by the CHECK) holding tunable relationship-health thresholds (days) and "keeps-warm" toggles that hold health up despite no recent executed license. Saves apply immediately — the next render recomputes health from this row (D-06 doctrine, nothing cached/recomputed).';

COMMENT ON COLUMN public.health_rules_config.prospect_image_url IS
  'D-31.1-08: owner-supplied, leadership-configurable image asset rendered in the prospect (never-licensed) health slot. NULL renders the neutral placeholder marker shipped in code — the owner uploads/replaces the actual asset from the Health Rules screen (image -> storage -> this config value) with no code change required.';

-- Seed the singleton row.
INSERT INTO public.health_rules_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ─── (d) game_plans — per-account Call Game Plan (R14/D-31.1-06) ────────
CREATE TABLE public.game_plans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_org_id UUID NOT NULL REFERENCES public.buyer_orgs ON DELETE CASCADE,
  topics       JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by   UUID REFERENCES auth.users,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX game_plans_one_per_org ON public.game_plans (buyer_org_id);

DROP TRIGGER IF EXISTS game_plans_updated_at ON public.game_plans;
CREATE TRIGGER game_plans_updated_at
  BEFORE UPDATE ON public.game_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.game_plans IS
  'R14/D-31.1-06: one saved per-account call-prep doc per buyer_org (enforced by the game_plans_one_per_org unique index). topics is a JSONB array of {title, questions:[...], done} entries. "Log conversation" writes "X of N covered" + notes to client_relationship_log (kind=''conversation'') rather than duplicating storage here. Staff-only.';

-- ─── (e) onboarding_tasks — D-07 auto-created handoff task queue ────────
-- Net-new; NOT the jobs worker queue (migration 118).
CREATE TABLE public.onboarding_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_org_id UUID NOT NULL REFERENCES public.buyer_orgs ON DELETE CASCADE,
  assignee_id  UUID NOT NULL REFERENCES auth.users,
  created_by   UUID REFERENCES auth.users,
  title        TEXT NOT NULL,
  checklist    JSONB NOT NULL DEFAULT '[]'::jsonb,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed')),
  handoff_note TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_onboarding_tasks_assignee ON public.onboarding_tasks (assignee_id, status);

COMMENT ON TABLE public.onboarding_tasks IS
  'D-07: the auto-created onboarding/handoff task queue, one row inserted whenever a buyer_org is assigned to an AE (assignee_id = the receiving AE), carrying a seeded default checklist and the required D-07 handoff_note. Surfaced in the AE''s My view. Net-new — distinct from the jobs worker queue (migration 118). Staff-only.';

-- ─── (f) RLS — staff-only, zero policies (mirrors migration 112 §e) ─────
ALTER TABLE public.pipeline_stages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_rules_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_plans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_tasks    ENABLE ROW LEVEL SECURITY;

-- No policies are created for any of the four tables. An RLS-enabled
-- table with zero policies denies ALL row access to authenticated/anon by
-- construction — combined with the REVOKE below, every table here is
-- reachable ONLY via the service role from requireStaff-gated routes.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.pipeline_stages     FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.health_rules_config FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.game_plans          FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.onboarding_tasks    FROM authenticated, anon;

-- ─── (g) Schema-cache reload ──────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
