-- ============================================================
-- Funūn — Phase 38 (member-organization-team-workspaces): Slice B
--                roster relationships, agreement evidence, blocks.
-- Migration 183: public.workspace_roster_relationships,
--                public.workspace_agreement_evidence,
--                public.workspace_roster_blocks, the
--                workspace_roster_relationship_is_live /
--                workspace_agreement_evidence_visible SECURITY DEFINER
--                helper pair, a three-table write lockdown, and three
--                non-recursive SELECT policies.
--
-- HUMAN-GATED — this project never runs `supabase db push`, `supabase db
-- reset`, or `supabase migration up` from an agent. That is the standing
-- convention stated verbatim in the headers of migrations 078, 080, 136,
-- 177, 181 and 182. This file is authored and text-tested
-- (__tests__/migration-183.test.ts) but must not be applied automatically.
-- The live push is this plan's (38-04) Task 3 blocking checkpoint. Owner
-- decision taken during execution (2026-09-05): migrations 183, 184 and
-- 185 are BATCHED into a single owner push sitting before Wave 6 — see
-- 38-04-SUMMARY.md's checkpoint section for what the owner verifies there.
--
-- MIGRATION NUMBERING (Phase 38 planner decision 1, restated from migration
-- 182's header): 182 = plan 38-03 (Slice A foundation; already LIVE — local
-- matches remote through 182). 183 (this file) = plan 38-04 (Slice B:
-- roster relationships + agreement evidence + blocks). Its siblings are
-- pre-assigned: 184 = plan 38-08 (grants + bundles), 185 = plan 38-10
-- (attachments + custody transfers), 186 = plan 38-11 (the RLS workspace
-- branch extending project_member_role() and siblings). 187 and 188 remain
-- RESERVED for Phase 38.2's billing and beta-flag migrations and MUST NOT
-- be claimed by any plan in this phase.
--
-- UUID DEFAULTS: every id column below uses gen_random_uuid(), never
-- uuid_generate_v4() — uuid-ossp lives in the `extensions` schema and is
-- not on the migration session's search_path (migration 062's first push
-- attempt failed on exactly that; migrations 078, 136 and 182 all restate
-- the rule; restated again here for the same reason).
--
-- THIS FILE IS ADDITIVE ONLY. It creates three new tables and two new
-- functions. It does not create, alter or drop any policy, trigger,
-- function or column on any table that existed before this migration. In
-- particular, public.workspaces, public.workspace_members,
-- public.workspace_invitations, public.workspace_audit_log,
-- public.workspace_member_role() and public.is_workspace_owner() (all live
-- from migration 182) are READ FROM but never altered here. Nothing in
-- public.project_members or public.work_members is touched either.
--
-- ─── THE D-05 STRUCTURAL GUARANTEE THIS MIGRATION EXISTS TO PROVIDE ──────
-- "Creating a workspace and naming someone grants no data, visibility, or
-- access" (D-05) has to be a property of THIS SCHEMA, not of the UI that
-- happens to call it correctly today. A workspace_roster_relationships row
-- is born in the 'proposed' state; every downstream consequence — the
-- workspace's own read access to anything about the named Member, and (via
-- migration 186's three-hop helper, not yet built) that Member's projects —
-- is gated behind workspace_roster_relationship_is_live(), which returns
-- true ONLY for an 'accepted' row inside its open date window. A proposed
-- row is therefore incapable of widening any policy: the Member can see the
-- claim naming them (D-05 requires this half), but the workspace can see
-- nothing about the Member until they affirmatively accept.
-- ============================================================

-- ─── (a) public.workspace_roster_relationships — the inert claim ─────────
-- Born 'proposed' and inert (D-05). professional_role is FREE TEXT — a
-- roster holds any Member (artist, producer, songwriter, engineer) with no
-- schema fork (D-35); the roster card is role-aware at the UI layer, but
-- this column is NEVER read by any authorization check anywhere in this
-- migration or its helpers.
CREATE TABLE public.workspace_roster_relationships (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  member_user_id     UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  professional_role  TEXT,
  state              TEXT NOT NULL DEFAULT 'proposed'
                     CHECK (state IN ('proposed', 'accepted', 'refused', 'blocked', 'ended')),
  effective_from     DATE,
  terminates_on      DATE,
  proposed_by        UUID NOT NULL REFERENCES auth.users,
  accepted_at        TIMESTAMPTZ,
  refused_at         TIMESTAMPTZ,
  ended_at           TIMESTAMPTZ,
  ended_by           UUID REFERENCES auth.users,
  end_reason         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (terminates_on IS NULL OR effective_from IS NULL OR terminates_on > effective_from)
);

-- A PARTIAL unique index, restricted to the two LIVE states — 'proposed'
-- and 'accepted' — so at most one live claim exists per workspace/member
-- pair, while 'refused', 'blocked' and 'ended' rows accumulate freely as
-- history (a renewed relationship is a new row, never a revival, mirroring
-- D-25's never-move-never-copy posture). This index is ALWAYS keyed on the
-- PAIR (workspace_id, member_user_id) — it never spans workspaces, because
-- a Member may hold any number of roster relationships and Funūn never
-- enforces exclusivity between them; that is a contract term between the
-- parties, not something Funūn adjudicates (D-15, custody D-02 "records,
-- does not adjudicate"). No unique constraint or index anywhere in this
-- file is keyed on member_user_id alone.
CREATE UNIQUE INDEX idx_workspace_roster_relationships_live_pair
  ON public.workspace_roster_relationships (workspace_id, member_user_id)
  WHERE state IN ('proposed', 'accepted');

CREATE INDEX idx_workspace_roster_relationships_member_state
  ON public.workspace_roster_relationships (member_user_id, state);
CREATE INDEX idx_workspace_roster_relationships_workspace_state
  ON public.workspace_roster_relationships (workspace_id, state);

ALTER TABLE public.workspace_roster_relationships ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS workspace_roster_relationships_updated_at ON public.workspace_roster_relationships;
CREATE TRIGGER workspace_roster_relationships_updated_at
  BEFORE UPDATE ON public.workspace_roster_relationships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── (b) public.workspace_agreement_evidence — the declared-scope ladder ─
-- Funūn never parses, interprets or validates the file attached at
-- document_id: this table stores a DECLARATION plus PROVENANCE (who
-- declared it, when, and whether Funūn's own e-sign flow witnessed the
-- signature), and NO COLUMN HERE asserts a "verified" or "approved" status
-- for anything Funūn merely stored (D-37) — the only observation column is
-- witnessed_by_signature, true solely for the one observed case of a
-- Funūn-executed e-sign document. The authority tier itself is computed on
-- read by lib/workspaces/evidence.ts's resolveAuthorityTier() from these
-- columns; there is deliberately NO STORED "document_supported" state or
-- column anywhere in this migration, and no scheduled job — an expiry
-- lapses authority the moment the next query runs, not on the next cron
-- tick (D-16, D-39, 38-RESEARCH.md Open Question 2). Final user-facing
-- labels for this ladder remain counsel-gated (D-37); this schema commits
-- to no vocabulary beyond what is written here.
CREATE TABLE public.workspace_agreement_evidence (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id        UUID NOT NULL REFERENCES public.workspace_roster_relationships ON DELETE CASCADE,
  document_id            UUID REFERENCES public.vault_documents ON DELETE SET NULL,
  declared_scope         TEXT NOT NULL,
  declared_by            UUID NOT NULL REFERENCES auth.users,
  effective_from         DATE,
  expires_at             TIMESTAMPTZ,
  witnessed_by_signature BOOLEAN NOT NULL DEFAULT FALSE,
  superseded_at          TIMESTAMPTZ,
  superseded_by          UUID REFERENCES public.workspace_agreement_evidence,
  uploaded_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspace_agreement_evidence_relationship_expires
  ON public.workspace_agreement_evidence (relationship_id, expires_at);

ALTER TABLE public.workspace_agreement_evidence ENABLE ROW LEVEL SECURITY;

-- ─── (c) public.workspace_roster_blocks — the Member-side refusal ────────
-- D-51's Member-side control: refusing once and blocking stops that
-- workspace proposing again. The service route in plan 38-07 checks this
-- table before inserting a new proposal; the UNIQUE constraint below makes
-- a duplicate block a harmless no-op (upsert-and-ignore) rather than an
-- error path a client has to handle.
CREATE TABLE public.workspace_roster_blocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  member_user_id  UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  blocked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, member_user_id)
);

ALTER TABLE public.workspace_roster_blocks ENABLE ROW LEVEL SECURITY;

-- ─── (d) Write lockdown — no client PostgREST write path on any of the ───
--         three tables (078 section (b) / 136 / 182 section (e)'s posture,
--         restated here). Every write goes through a service-role API
--         route that has already proved caller authority.
REVOKE INSERT, UPDATE, DELETE ON public.workspace_roster_relationships FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.workspace_agreement_evidence FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.workspace_roster_blocks FROM authenticated, anon;

-- ─── (e) SECURITY DEFINER helper pair ─────────────────────────────────────
-- Copies migration 182's proven shape exactly, which in turn copies
-- migration 078's and 136's. Both take identifying values as PARAMETERS
-- rather than calling auth.uid() internally, so `SET search_path = ''`
-- does not have to reach into the auth schema. STABLE lets the planner
-- cache the result within a single statement when the policy wraps the
-- call as `(SELECT ...)`, which every policy below does.
CREATE OR REPLACE FUNCTION public.workspace_roster_relationship_is_live(p_workspace_id UUID, p_member_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_roster_relationships
    WHERE workspace_id = p_workspace_id
      AND member_user_id = p_member_user_id
      AND state = 'accepted'
      AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
      AND (terminates_on IS NULL OR terminates_on > CURRENT_DATE)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.workspace_roster_relationship_is_live(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_roster_relationship_is_live(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.workspace_roster_relationship_is_live(uuid, uuid) IS
  'True only when an ACCEPTED roster relationship exists for this workspace/member pair inside its open date window (effective_from absent or at/before today, terminates_on absent or still in the future). SQL twin of isWorkspaceAccessLive in lib/workspaces/roster.ts -- keep the two conditions identical. Migration 186''s three-hop helper joins workspace-derived project access through this predicate exclusively, so a termination or a unilateral end takes effect on the next statement, never on a cron tick. SECURITY DEFINER so it can be called from RLS policies without re-entering workspace_roster_relationships'' own policies (would recurse with 42P17, per migrations 018, 064, 078, 136 and 182). Intended for RLS policy USING clauses wrapped as (SELECT ...), not a client-invoked RPC.';

-- workspace_agreement_evidence has no workspace_id column of its own (it
-- hangs off relationship_id), so its visibility check has to cross two
-- tables. Routed through SECURITY DEFINER rather than inlined as a bare
-- cross-table EXISTS inside a policy body, to avoid the same 018-shaped
-- recursion migration 182's own helper pair exists to prevent (T-38-04-06).
CREATE OR REPLACE FUNCTION public.workspace_agreement_evidence_visible(p_evidence_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_agreement_evidence e
    JOIN public.workspace_roster_relationships r ON r.id = e.relationship_id
    WHERE e.id = p_evidence_id
      AND (
        r.member_user_id = p_uid
        OR public.is_workspace_owner(r.workspace_id, p_uid)
        OR public.workspace_member_role(r.workspace_id, p_uid) = 'admin'
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.workspace_agreement_evidence_visible(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_agreement_evidence_visible(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.workspace_agreement_evidence_visible(uuid, uuid) IS
  'True when p_uid is the named member on the evidence row''s relationship, or holds an active owner/admin role (via migration 182''s is_workspace_owner/workspace_member_role) on that relationship''s workspace. workspace_agreement_evidence carries no workspace_id of its own, so this predicate joins through relationship_id inside a SECURITY DEFINER body rather than a bare cross-table EXISTS in a policy, avoiding the 42P17 recursion shape (migrations 018, 064, 078, 136, 182). Intended for RLS policy USING clauses wrapped as (SELECT ...), not a client-invoked RPC.';

-- ─── (f) Own-table SELECT policies — every helper call scalar-subselect ──
--         wrapped, never a bare cross-table EXISTS (the recursion rule).
-- The named Member always sees a claim about themselves, including while
-- it is still 'proposed' — D-05 requires the Member see the claim; the
-- workspace seeing nothing about the Member until acceptance is the other
-- half of the same guarantee, enforced structurally by every OTHER table
-- and helper in this file gating on workspace_roster_relationship_is_live()
-- or an already-accepted row, never on this policy alone.
CREATE POLICY "workspace_roster_relationships_select" ON public.workspace_roster_relationships
  FOR SELECT TO authenticated
  USING (
    member_user_id = (SELECT auth.uid())
    OR (SELECT public.workspace_member_role(workspace_id, auth.uid())) IS NOT NULL
  );

-- Because workspace_id is not a column on this table, the visibility check
-- routes through workspace_agreement_evidence_visible() (section (e))
-- rather than a bare cross-table EXISTS.
CREATE POLICY "workspace_agreement_evidence_select" ON public.workspace_agreement_evidence
  FOR SELECT TO authenticated
  USING (
    (SELECT public.workspace_agreement_evidence_visible(id, auth.uid()))
  );

-- Member-private only. A workspace must NEVER be able to enumerate who
-- blocked it (T-38-04-05) — this USING clause references only
-- member_user_id and auth.uid(), with no workspace_member_role call of any
-- kind, so an owner or admin gets no read path onto this table at all.
CREATE POLICY "workspace_roster_blocks_select" ON public.workspace_roster_blocks
  FOR SELECT TO authenticated
  USING (member_user_id = (SELECT auth.uid()));

-- ─── (g) Schema-cache reload ───────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
