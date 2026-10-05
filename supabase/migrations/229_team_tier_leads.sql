-- ============================================================
-- Funūn — Quick task 261004-ttq (Team-tier qualification questionnaire)
-- Migration 229 — team_tier_leads
--
-- WHY: the owner's 2026-10-04 rule is "more than 10 seats -> a Funūn Team
-- Member picks it up as an Entourage conversation; 10 or fewer -> self-serve
-- Team, with onboarding help offered afterwards." Today there is nowhere
-- for that lead to live, nobody attached to look at it, and the self-serve
-- branch's destination does not exist yet (self-serve Team signup is
-- Phase 47, unbuilt). This migration adds ONE table to hold every /team-fit
-- submission. This is a lead from a prospective Member buying a larger
-- Member workspace — it deliberately does NOT touch buyer_orgs/
-- buyer_members (the Client Partner model); reusing that model here would
-- be the exact account-class confusion the owner ruled against on
-- 2026-10-04 (see .planning/deliberations/2026-10-04-owner-decisions-
-- submissions-and-gate-0.md).
--
-- WHAT: team_tier_leads, reapplying the exact zero-RLS-policy + REVOKE ALL
-- shape of migration 097's artist_invites/artist_waitlist (ENABLE ROW LEVEL
-- SECURITY with no policy statements at all, then REVOKE ALL FROM
-- PUBLIC, anon, authenticated) — reachable only via the service role.
-- Every read/write goes through an API route or admin page using
-- createServiceClient(), never createApiClient().
--
-- routing_outcome is NEVER client-supplied — it is always computed
-- server-side by resolveRouting(seat_answer) (lib/team-tier/
-- qualification.ts) immediately before insert. catalogue_answer's bands
-- and the 'not_sure' -> 'bd' routing default are both the 2026-09-26 todo's
-- own drafts/recommendation, not an owner-final decision — see the column
-- comment below and lib/team-tier/qualification.ts's own code comments.
--
-- No assigned-owner/liaison column exists on this table, deliberately.
-- Phase 34 ("Lead Intake & BDT First Contact") is the real, owner-SOP-backed
-- design for picking up/assigning a lead, and it is unbuilt and scoped to
-- buyer self-registration, not Member leads. Visibility (the admin list)
-- plus a real fan-out notification to every bd+leadership staff member is
-- what makes "someone will follow up" true here, without inventing an
-- ownership model nothing yet enforces — exactly the label-integrity trap
-- an unenforced `assigned_to` column would be.
--
-- HUMAN-GATED — never `supabase db push` from an agent (matches migrations
-- 089/095/097's standing convention). Draft + text-tested only
-- (__tests__/migration-229.test.ts); the owner reviews and pushes it.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.team_tier_leads (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Q1 (routing). Must exactly match SEAT_ANSWER_VALUES in
  -- lib/team-tier/qualification.ts — single source of truth; keep both in
  -- sync if either changes.
  seat_answer        TEXT NOT NULL
                      CHECK (seat_answer IN ('me_or_a_few', 'small_team', 'more_than_ten', 'not_sure')),

  -- Q2 (sizing). These bands are the 2026-09-26 todo's own draft
  -- (.planning/todos/pending/2026-09-26-team-tier-qualification-
  -- questionnaire.md) — the owner has not set final cutoffs. Do not treat
  -- as settled; must exactly match CATALOGUE_ANSWER_VALUES in
  -- lib/team-tier/qualification.ts.
  catalogue_answer   TEXT NOT NULL
                      CHECK (catalogue_answer IN ('under_25', 'from_25_to_200', 'from_200_to_1000', 'over_1000')),

  -- Q3 (color). Pick-two cap + element allowlist as two separate named
  -- CHECKs rather than one compound expression — easier to read, and each
  -- failure names itself distinctly. Must exactly match PAIN_POINT_VALUES
  -- in lib/team-tier/qualification.ts.
  pain_points        TEXT[] NOT NULL DEFAULT '{}'::text[],
  pain_points_other  TEXT,

  -- Server-computed ONLY — resolveRouting(seat_answer) decides this
  -- immediately before insert; a client-submitted routingOutcome field (if
  -- any) is never read by the API route.
  routing_outcome    TEXT NOT NULL CHECK (routing_outcome IN ('bd', 'self_serve')),

  -- Collected ONLY on the BD branch — the only branch that promises a
  -- human reply. A promise with no reachable contact would itself be the
  -- label-integrity failure this table's own bd_requires_contact CHECK
  -- defends against below.
  contact_name       TEXT,
  contact_email      TEXT,

  -- Populated only when the submitter happens to have an active session
  -- (this questionnaire never requires one) — forward-compatible for a
  -- future signed-in entry point without building that entry point now.
  submitted_by_user_id UUID REFERENCES auth.users ON DELETE SET NULL,

  CONSTRAINT team_tier_leads_pain_points_max_two
    CHECK (array_length(pain_points, 1) IS NULL OR array_length(pain_points, 1) <= 2),
  CONSTRAINT team_tier_leads_pain_points_allowlist
    CHECK (pain_points <@ ARRAY[
      'chasing_details',
      'unsigned_splits',
      'readiness_unclear',
      'scattered_files',
      'registrations_unclear',
      'finding_sync',
      'something_else'
    ]::text[]),

  -- Defense in depth: a future caller cannot insert a 'bd'-routed row with
  -- nobody to contact — that would be exactly the label-integrity failure
  -- this plan is designed to avoid (an ending that promises a reply with
  -- no reachable person behind it).
  CONSTRAINT team_tier_leads_bd_requires_contact
    CHECK (routing_outcome <> 'bd' OR (contact_name IS NOT NULL AND contact_email IS NOT NULL))
);

-- The admin list's ordering (newest first).
CREATE INDEX IF NOT EXISTS idx_team_tier_leads_created_at
  ON public.team_tier_leads (created_at DESC);

ALTER TABLE public.team_tier_leads ENABLE ROW LEVEL SECURITY;

-- No policies are created for any role. An RLS-enabled table with zero
-- policies denies ALL row access to authenticated/anon by construction —
-- combined with the REVOKE ALL below, this table is reachable ONLY via the
-- service role.
REVOKE ALL ON public.team_tier_leads FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.team_tier_leads IS
  'Quick task 261004-ttq: /team-fit Team-tier qualification questionnaire submissions. Service-role-only (zero RLS policies + REVOKE ALL, mirrors migration 089/097). routing_outcome is server-derived via resolveRouting(seat_answer) — never client-supplied. catalogue_answer''s bands and the ''not_sure''->''bd'' routing default (lib/team-tier/qualification.ts) are provisional per the 2026-09-26 todo, pending the owner. No assigned-owner/liaison column by design — see this migration''s header comment and Phase 34. HUMAN-GATED: never `supabase db push` from an agent.';

-- Table privilege changes affect what PostgREST exposes.
NOTIFY pgrst, 'reload schema';
