-- ============================================================
-- Funūn — Phase 31.2 (AE Console: Playbook Authoring, RBAC,
--                     Plays & Selects Telemetry)
-- Migration 132: the Selects engagement telemetry model — raw
--                 audible-time delta rows + open/view events,
--                 abuse-cap trigger shipped inline (R13/D-31.2-12)
--
-- WHY: D-31.2-12/13/14 (R13). Today only selects.sent_at is known ("was
-- it shown"). This migration adds the raw signal a genuine audible-time
-- accumulator needs — per-track engagement deltas (play/pause/seek-aware,
-- NOT a naive wall-clock timer) plus open/view events — so lib/selects/
-- engagement.ts (plan 02) can SUM raw deltas at read time into a
-- qualified-listen (>=30s) signal, and the leadership rollup (plan 0X)
-- can aggregate across the team's book. Per-recipient attribution,
-- staff-only — NEVER shown to the client (D-31.2-14, standard B2B
-- email-open-tracking posture).
--
-- (e) SELECTS_TRACK_ENGAGEMENT — RAW per-track+viewer delta rows. This is
-- deliberately NEVER a stored running total (D-06 computed-on-read
-- doctrine, same reasoning as days-in-stage/health) — engagement.ts SUMs
-- these rows at read time. delta_seconds CHECK (0 < delta <= 15) is the
-- per-heartbeat abuse ceiling (Pitfall 2): a public, lightly-authed write
-- path must never trust an unbounded client-reported delta. event
-- distinguishes the heartbeat/pause/ended/unload lifecycle points the
-- client-side accumulator flushes on.
--
-- (f) SELECTS_OPENS — open/view events, one row per viewer "opened this
-- Selects" moment (distinct from per-track engagement).
--
-- (g) ABUSE-CAP TRIGGER — a SECURITY DEFINER per-(track, viewer) row-count
-- ceiling mirroring migration 117's enforce_selects_reaction_cap() EXACTLY
-- (same function shape: SECURITY DEFINER, SET search_path = '', COUNT +
-- RAISE EXCEPTION with ERRCODE 'check_violation'). Per D-31.2-12/13's
-- "telemetry is leadership-facing from day one" framing, this trigger
-- ships IN THIS FILE alongside its table — never deferred to a follow-up
-- migration the way the signed-viewer-cookie hardening was deferred
-- (Pitfall 2/T-31.2-03).
--
-- RLS DOCTRINE (MANDATORY — mirrors migration 128/129/130/131 exactly):
-- every new table gets ENABLE ROW LEVEL SECURITY with ZERO policies, plus
-- a full REVOKE SELECT, INSERT, UPDATE, DELETE ... FROM authenticated,
-- anon. An RLS-enabled table with zero policies denies ALL row access to
-- authenticated/anon by construction — combined with the REVOKE, every
-- new table here is reachable ONLY via the service role from the
-- validated engagement-write route (mirroring how /api/selects/[token]/
-- react reaches selects_reactions today) and requireStaff-gated read
-- routes. No policy-creation statement appears anywhere in this file. No
-- new column is added to any authenticated GRANT.
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (matches Phases 16/21/25/28/32/112/128/130/131's standing convention).
-- Draft + text-tested only (__tests__/migration-132.test.ts); the owner
-- reviews and pushes via `supabase db push` against prod (project
-- wgfjakfiyeewzfuxkgyo) at the 31.2-01 Task 4 checkpoint. Do NOT edit
-- migrations 001-131 (already landed).
-- ============================================================

-- ─── (e) selects_track_engagement — raw per-track+viewer delta rows ─────
CREATE TABLE public.selects_track_engagement (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selects_id       UUID NOT NULL REFERENCES public.selects ON DELETE CASCADE,
  selects_track_id UUID NOT NULL REFERENCES public.selects_tracks ON DELETE CASCADE,
  viewer_key       TEXT,
  delta_seconds    NUMERIC(7,2) NOT NULL CHECK (delta_seconds > 0 AND delta_seconds <= 15),
  event            TEXT NOT NULL CHECK (event IN ('heartbeat', 'pause', 'ended', 'unload')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_selects_track_engagement_track_viewer ON public.selects_track_engagement (selects_track_id, viewer_key);

COMMENT ON TABLE public.selects_track_engagement IS
  'R13/D-31.2-12: RAW audible-playback-time delta rows for a Selects track — NEVER a stored running total (D-06 computed-on-read doctrine); lib/selects/engagement.ts SUMs these at read time to derive the >=30s qualified-listen signal. delta_seconds CHECK (0 < delta <= 15) is the per-heartbeat abuse ceiling (Pitfall 2) backstopping the client-side play/pause/seek-aware accumulator. Per-recipient attribution via viewer_key, staff-only (D-31.2-14) — never surfaced to the client.';

-- ─── (f) selects_opens — open/view events (D-31.2-12) ───────────────────
CREATE TABLE public.selects_opens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selects_id UUID NOT NULL REFERENCES public.selects ON DELETE CASCADE,
  viewer_key TEXT,
  opened_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_selects_opens_selects_viewer ON public.selects_opens (selects_id, viewer_key);

COMMENT ON TABLE public.selects_opens IS
  'D-31.2-12: an open/view event, one row per viewer "opened this Selects" moment — distinct from the per-track engagement deltas above. Staff-only (D-31.2-14) — never surfaced to the client.';

-- ─── (g) abuse-cap trigger — mirrors migration 117 EXACTLY, shipped here ─
-- Per-(selects_track_id, viewer_key) row-count ceiling. Telemetry is
-- leadership-facing from day one (D-31.2-12/13) so this closes the abuse
-- surface in the SAME migration that creates the table (Pitfall 2/
-- T-31.2-03), never deferred to a follow-up.
CREATE OR REPLACE FUNCTION public.enforce_selects_track_engagement_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.selects_track_engagement
    WHERE selects_track_id = NEW.selects_track_id
      AND viewer_key IS NOT DISTINCT FROM NEW.viewer_key;

  IF v_count >= 5000 THEN
    RAISE EXCEPTION 'selects track engagement cap reached for track % viewer %', NEW.selects_track_id, NEW.viewer_key
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_selects_track_engagement_cap() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS selects_track_engagement_cap ON public.selects_track_engagement;
CREATE TRIGGER selects_track_engagement_cap
  BEFORE INSERT ON public.selects_track_engagement
  FOR EACH ROW EXECUTE FUNCTION public.enforce_selects_track_engagement_cap();

-- ─── (h) RLS — staff-only, zero policies (mirrors migration 128/129/130/131) ─
ALTER TABLE public.selects_track_engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selects_opens            ENABLE ROW LEVEL SECURITY;

-- No policies are created for either table. An RLS-enabled table with
-- zero policies denies ALL row access to authenticated/anon by
-- construction — combined with the REVOKE below, both tables here are
-- reachable ONLY via the service role (the validated engagement-write
-- route, mirroring how /api/selects/[token]/react reaches
-- selects_reactions today, plus requireStaff-gated read routes).
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.selects_track_engagement FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.selects_opens            FROM authenticated, anon;

-- ─── (i) Schema-cache reload ──────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
