-- ============================================================
-- Funūn — Phase 31.2 (AE Console: Playbook Authoring, RBAC,
--                     Plays & Selects Telemetry)
-- Migration 130: data-driven Playbook RBAC + authoring model
--                 (rooms, per-role view grants, room-leads,
--                 sub-groups, SOP/Topic entries)
--
-- WHY: D-31.2-01 generalizes Phase 33's hardcoded in-code room gates
-- (`requireStaffPage(['leadership','it'])` literals repeated across the
-- 5 IT-room pages) into a DB-stored, leadership-editable room×role access
-- matrix. Every downstream 31.2 plan (the access editor UI, the SOP/Topic
-- authoring flow, requireRoomAccess()) reads tables that do not exist yet
-- — this is the gating data-model dependency for those plans.
--
-- (a) PLAYBOOK_ROOMS — the 6 Phase-33 mockup rooms (lib/playbook/nav.ts),
-- seeded in nav.ts order so the access editor and Rail 2 can both read the
-- same source of truth. it-team + leadership are the sensitive/view-gated
-- rooms (D-31.2-03); the other four are readable by all Team Members.
--
-- (b) PLAYBOOK_ROOM_ROLE_GRANTS — the per-role VIEW grant matrix (D-31.2-01).
-- CRITICAL (Pitfall 5, T-31.2-02): role='leadership' is structurally
-- EXCLUDED from this table via a CHECK constraint — leadership access is
-- never row-data, so it can never be accidentally unchecked/removed from
-- the matrix (last-admin protection at the data layer, not a runtime
-- "prevent removing the last admin" check). Seeded to reproduce Phase 33's
-- EXACT current behavior (Pitfall 6, backward-compat): it-team is grantable
-- to role 'it' (net leadership+it, unchanged from Phase 33's hardcoded
-- gate); the four non-sensitive rooms (company-wide, ar, ae-sales, tms) are
-- granted to every non-leadership operational role; the leadership room
-- gets ZERO grant rows (leadership-only, structural — no row ever needed).
--
-- (c) PLAYBOOK_ROOM_LEADS — the per-room room-lead ASSIGNMENT layer
-- (D-31.2-02), distinct from the role×room VIEW grants above. A room-lead
-- approves that room's draft entries and manages its sub-groups (D-31.2-04
-- authority gradient); leadership holds room-lead abilities everywhere as
-- a strict superset, without ever needing a row here.
--
-- (d) PLAYBOOK_SUB_GROUPS — per-room content groupings (D-31.2-04:
-- sub-groups → room-leads + admins create/manage).
--
-- (e) PLAYBOOK_ENTRIES — the SOP/Topic draft→publish store (D-31.2-05/06).
-- `content` is the published body; `draft_content` is a pending edit
-- awaiting room-lead/leadership approval — mirrors the existing Tips
-- `tip_body`/`tip_draft` precedent (app/api/admin/tips/[itemKey]/route.ts)
-- generalized to a real table. `entry_type` distinguishes SOPs (checklists)
-- from Topics (coaching bundles); Plays are intentionally NOT stored here —
-- migration 131 gives Plays their own tables (one-active invariant + per-AE
-- completions behave nothing like a draft/publish document, A4).
--
-- RLS DOCTRINE (MANDATORY — mirrors migration 128/129 exactly): every new
-- table gets ENABLE ROW LEVEL SECURITY with ZERO policies, plus a full
-- REVOKE SELECT, INSERT, UPDATE, DELETE ... FROM authenticated, anon. An
-- RLS-enabled table with zero policies denies ALL row access to
-- authenticated/anon by construction — combined with the REVOKE, every
-- new table here is reachable ONLY via the service role from
-- requireStaff-gated routes. No policy-creation statement appears anywhere
-- in this file. No new column is added to any authenticated GRANT.
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (matches Phases 16/21/25/28/32/112/128's standing convention). Draft +
-- text-tested only (__tests__/migration-130.test.ts); the owner reviews
-- and pushes via `supabase db push` against prod (project
-- wgfjakfiyeewzfuxkgyo) at the 31.2-01 Task 4 checkpoint. Do NOT edit
-- migrations 001-129 (already landed).
-- ============================================================

-- ─── (a) playbook_rooms — the 6 Phase-33 rooms, data-driven ─────────────
CREATE TABLE public.playbook_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9-]+$'),
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL,
  sensitive   BOOLEAN NOT NULL DEFAULT false,
  coming_soon BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS playbook_rooms_updated_at ON public.playbook_rooms;
CREATE TRIGGER playbook_rooms_updated_at
  BEFORE UPDATE ON public.playbook_rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.playbook_rooms IS
  'D-31.2-01/03: the 6 Phase-33 Playbook rooms (lib/playbook/nav.ts order), now DB-stored so the access editor and Rail 2 read the same source of truth. sensitive=true marks the view-gated rooms (it-team, leadership); coming_soon mirrors the Phase-33 "Coming soon" ghost state until authored content exists.';

-- Seed the six Phase-33 rooms in nav.ts order (company-wide, ar, ae-sales,
-- it-team, tms, leadership). it-team is live + sensitive (D-31.2-03);
-- leadership is sensitive but stays coming_soon until content ships;
-- the remaining four are non-sensitive, readable-by-all rooms.
INSERT INTO public.playbook_rooms (key, label, sort_order, sensitive, coming_soon) VALUES
  ('company-wide', 'Company-wide', 1, false, true),
  ('ar',           'A&R',          2, false, true),
  ('ae-sales',     'AE / Sales',   3, false, true),
  ('it-team',      'IT Team',      4, true,  false),
  ('tms',          'TMS',          5, false, true),
  ('leadership',   'Leadership',   6, true,  true)
ON CONFLICT (key) DO NOTHING;

-- ─── (b) playbook_room_role_grants — per-role VIEW grants (D-31.2-01) ───
-- role='leadership' is structurally excluded via the CHECK below —
-- leadership access is NEVER stored as row-data (Pitfall 5, T-31.2-02).
CREATE TABLE public.playbook_room_role_grants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID NOT NULL REFERENCES public.playbook_rooms ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (
               role IN ('ae', 'bd', 'anr', 'it', 'legal', 'tms', 'accounting', 'marketing')
               AND role <> 'leadership'
             ),
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, role)
);

COMMENT ON TABLE public.playbook_room_role_grants IS
  'D-31.2-01: the leadership-editable room×role VIEW-access matrix that generalizes Phase 33''s hardcoded requireStaffPage([...]) literals. role <> ''leadership'' is enforced structurally by the CHECK — leadership can never be locked out of a room by an access-editor edit, because leadership never needs (and can never hold) a row here (Pitfall 5, T-31.2-02, structural last-admin protection). Seeded to reproduce Phase 33''s exact current it-team behavior (leadership+it, Pitfall 6 backward-compat) plus the D-31.2-03 default of all-operational-roles on the four non-sensitive rooms.';

-- Seed grants reproducing today's exact behavior + the D-31.2-03 default.
-- it-team: grantable to role 'it' only — leadership passes structurally,
-- so the net access is leadership+it, UNCHANGED from Phase 33's hardcoded
-- requireStaffPage(['leadership','it']) gate (Pitfall 6).
INSERT INTO public.playbook_room_role_grants (room_id, role)
SELECT r.id, 'it'
FROM public.playbook_rooms r
WHERE r.key = 'it-team'
ON CONFLICT (room_id, role) DO NOTHING;

-- company-wide / ar / ae-sales / tms: readable by every non-leadership
-- operational role (transparency across teams, D-31.2-03 default).
INSERT INTO public.playbook_room_role_grants (room_id, role)
SELECT r.id, g.role
FROM public.playbook_rooms r
CROSS JOIN (VALUES ('ae'), ('bd'), ('anr'), ('legal'), ('tms'), ('accounting'), ('marketing')) AS g(role)
WHERE r.key IN ('company-wide', 'ar', 'ae-sales', 'tms')
ON CONFLICT (room_id, role) DO NOTHING;

-- leadership room: ZERO grant rows by design — leadership-only, structural
-- (leadership always sees it; no other role is granted it on day one).

-- ─── (c) playbook_room_leads — per-room room-lead assignment (D-31.2-02) ─
CREATE TABLE public.playbook_room_leads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID NOT NULL REFERENCES public.playbook_rooms ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

COMMENT ON TABLE public.playbook_room_leads IS
  'D-31.2-02: per-room room-lead assignment, distinct from the role×room VIEW grants in playbook_room_role_grants. A room-lead approves that room''s draft playbook_entries and manages its playbook_sub_groups; leadership holds room-lead abilities everywhere as a strict superset (no row needed here for leadership).';

-- ─── (d) playbook_sub_groups — per-room content groupings (D-31.2-04) ───
CREATE TABLE public.playbook_sub_groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID NOT NULL REFERENCES public.playbook_rooms ON DELETE CASCADE,
  key        TEXT NOT NULL,
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, key)
);

DROP TRIGGER IF EXISTS playbook_sub_groups_updated_at ON public.playbook_sub_groups;
CREATE TRIGGER playbook_sub_groups_updated_at
  BEFORE UPDATE ON public.playbook_sub_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.playbook_sub_groups IS
  'D-31.2-04: per-room content sub-groups (authority gradient: room-leads + admins create/manage). playbook_entries optionally files under one of a room''s sub-groups.';

-- ─── (e) playbook_entries — SOP/Topic draft→publish store (D-31.2-05/06) ─
CREATE TABLE public.playbook_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID NOT NULL REFERENCES public.playbook_rooms ON DELETE CASCADE,
  sub_group_id  UUID REFERENCES public.playbook_sub_groups ON DELETE SET NULL,
  entry_type    TEXT NOT NULL CHECK (entry_type IN ('sop', 'topic')),
  title         TEXT NOT NULL,
  content       JSONB NOT NULL DEFAULT '{}'::jsonb,
  draft_content JSONB,
  status        TEXT NOT NULL DEFAULT 'draft_pending' CHECK (status IN ('draft_pending', 'published')),
  author_id     UUID REFERENCES auth.users,
  approved_by   UUID REFERENCES auth.users,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_playbook_entries_room_type_status ON public.playbook_entries (room_id, entry_type, status);

DROP TRIGGER IF EXISTS playbook_entries_updated_at ON public.playbook_entries;
CREATE TRIGGER playbook_entries_updated_at
  BEFORE UPDATE ON public.playbook_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.playbook_entries IS
  'D-31.2-05/06: the SOP (checklist) / Topic (coaching bundle) authored-content store, draft→publish. content is the published body; draft_content is a pending edit awaiting room-lead/leadership approval — generalizes the existing launchpad_checklist_items.tip_body/tip_draft precedent (app/api/admin/tips/[itemKey]/route.ts). Leadership + room-leads publish on save (status stays/goes ''published'' directly); regular Team Members submit a draft (status=''draft_pending'') for a room-lead/leadership approve. Plays are intentionally NOT stored here — see migration 131.';

-- ─── (f) RLS — staff-only, zero policies (mirrors migration 128/129) ────
ALTER TABLE public.playbook_rooms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_room_role_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_room_leads       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_sub_groups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_entries          ENABLE ROW LEVEL SECURITY;

-- No policies are created for any of the five tables. An RLS-enabled
-- table with zero policies denies ALL row access to authenticated/anon by
-- construction — combined with the REVOKE below, every table here is
-- reachable ONLY via the service role from requireStaff-gated routes.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_rooms           FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_room_role_grants FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_room_leads       FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_sub_groups       FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_entries          FROM authenticated, anon;

-- ─── (g) Schema-cache reload ──────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
