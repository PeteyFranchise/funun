-- ============================================================
-- Funūn — Phase 31.2 (AE Console: Playbook Authoring, RBAC,
--                     Plays & Selects Telemetry)
-- Migration 131: the Plays model — one active team-wide "today's
--                 play" at a time, its assignments, per-AE completions
--
-- WHY: D-31.2-08/09/10/11. A Play is a container of several assignments
-- leadership publishes for the whole team — structurally analogous to a
-- Game Plan (migration 128) holding several topics, but team-wide rather
-- than per-account, and with a hard one-active-at-a-time invariant
-- (publishing a new play replaces the currently active one). Every
-- downstream 31.2 plan (the "today's play" banner on My Client Partners,
-- the leadership completion rollup) reads these tables.
--
-- (a) PLAYS — the play container. Publishing a new play is expected to
-- retire the prior active one (application-level transition); the
-- PARTIAL UNIQUE INDEX below is the hard DB-level backstop guaranteeing
-- AT MOST ONE row can ever have status='active' regardless of how the
-- application enforces the transition (mirrors the game_plans_one_per_org
-- unique-index doctrine from migration 128).
--
-- (b) PLAY_ASSIGNMENTS — the individual directives inside a play.
-- kind='client_targeted' (D-31.2-09a): targets a health_band OR
-- pipeline_stage_key, evaluated PER-AE against their OWN book at read
-- time (no stored per-AE fan-out row — the eligible-client set is derived,
-- same "computed on read" doctrine as health/days-in-stage). The AE deep-
-- links into My Client Partners filtered to those clients.
-- kind='general_task' (D-31.2-09b/10): a checkable directive that is NOT
-- client-filtered (e.g. "post this on social today") — carries its own
-- content (title/note/link_url/attachment_url/content) so it is posting-
-- ready and forward-compatible with the deferred Buffer/campaign posting
-- fast-follow (A5), even though actual in-app posting is out of scope here.
--
-- (c) PLAY_ASSIGNMENT_COMPLETIONS — the AE-marks-done record (D-31.2-11,
-- the measurement half of the phase — leadership's "who's acted" rollup).
-- UNIQUE(assignment_id, ae_user_id) is the idempotent per-(assignment, AE)
-- completion key — a retried/duplicate "mark done" call is a no-op, never
-- a duplicate completion row.
--
-- RLS DOCTRINE (MANDATORY — mirrors migration 128/129/130 exactly): every
-- new table gets ENABLE ROW LEVEL SECURITY with ZERO policies, plus a full
-- REVOKE SELECT, INSERT, UPDATE, DELETE ... FROM authenticated, anon. An
-- RLS-enabled table with zero policies denies ALL row access to
-- authenticated/anon by construction — combined with the REVOKE, every
-- new table here is reachable ONLY via the service role from
-- requireStaff-gated routes. No policy-creation statement appears
-- anywhere in this file. No new column is added to any authenticated
-- GRANT.
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (matches Phases 16/21/25/28/32/112/128/130's standing convention). Draft
-- + text-tested only (__tests__/migration-131.test.ts); the owner reviews
-- and pushes via `supabase db push` against prod (project
-- wgfjakfiyeewzfuxkgyo) at the 31.2-01 Task 4 checkpoint. Do NOT edit
-- migrations 001-130 (already landed).
-- ============================================================

-- ─── (a) plays — one active team-wide "today's play" (D-31.2-08) ────────
CREATE TABLE public.plays (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  published_by UUID REFERENCES auth.users,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One-active invariant: a unique index on a constant expression, scoped by
-- the partial WHERE predicate, guarantees the DB can never hold more than
-- one row with status = 'active' at a time — publishing a new play must
-- retire the prior one first or this insert/update fails.
CREATE UNIQUE INDEX plays_one_active_uniq ON public.plays ((1)) WHERE status = 'active';

COMMENT ON TABLE public.plays IS
  'D-31.2-08: the team-wide "today''s play" container. plays_one_active_uniq enforces AT MOST ONE row with status=''active'' at the DB level (publishing a new play replaces the currently active one). A play is a container of several play_assignments, structurally analogous to how a game_plans row (migration 128) holds several topics, but team-wide rather than per-account.';

-- ─── (b) play_assignments — client-targeted or general-task directives ──
CREATE TABLE public.play_assignments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  play_id            UUID NOT NULL REFERENCES public.plays ON DELETE CASCADE,
  kind               TEXT NOT NULL CHECK (kind IN ('client_targeted', 'general_task')),
  title              TEXT NOT NULL,
  note               TEXT,
  health_band        TEXT,
  pipeline_stage_key TEXT,
  link_url           TEXT,
  attachment_url     TEXT,
  content            JSONB,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_play_assignments_play ON public.play_assignments (play_id, sort_order);

COMMENT ON TABLE public.play_assignments IS
  'D-31.2-09: individual directives inside a play. kind=''client_targeted'' rows use health_band/pipeline_stage_key — the eligible-client set is derived per-AE against their OWN book AT READ TIME (D-06 computed-on-read doctrine), never a stored per-AE fan-out. kind=''general_task'' rows use title/note/link_url/attachment_url/content — the content-carrying, posting-ready-but-posting-deferred social/team directive (D-31.2-10, A5).';

-- ─── (c) play_assignment_completions — per-AE "marked done" (D-31.2-11) ─
CREATE TABLE public.play_assignment_completions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.play_assignments ON DELETE CASCADE,
  ae_user_id    UUID NOT NULL REFERENCES auth.users,
  note          TEXT,
  completed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, ae_user_id)
);

COMMENT ON TABLE public.play_assignment_completions IS
  'D-31.2-11: the AE-marks-done record, one per (assignment, AE) — UNIQUE(assignment_id, ae_user_id) makes a retried/duplicate "mark done" call idempotent, never a duplicate completion row. Leadership reads this to build the "who''s acted" completion rollup — the measurement half of the Plays loop.';

-- ─── (d) RLS — staff-only, zero policies (mirrors migration 128/129/130) ─
ALTER TABLE public.plays                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_assignments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_assignment_completions ENABLE ROW LEVEL SECURITY;

-- No policies are created for any of the three tables. An RLS-enabled
-- table with zero policies denies ALL row access to authenticated/anon by
-- construction — combined with the REVOKE below, every table here is
-- reachable ONLY via the service role from requireStaff-gated routes.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.plays                       FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.play_assignments            FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.play_assignment_completions FROM authenticated, anon;

-- ─── (e) Schema-cache reload ──────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
