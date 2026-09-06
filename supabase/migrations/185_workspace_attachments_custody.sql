-- ============================================================
-- Funūn — Phase 38 (member-organization-team-workspaces): Slice D
--                the attachment link and the two-sided custody transfer.
-- Migration 185: public.workspace_attachments,
--                public.workspace_custody_transfers, the
--                workspace_attachment_visible / custody_transfer_visible
--                SECURITY DEFINER helper pair, a two-table write lockdown,
--                two non-recursive SELECT policies, and the BEFORE INSERT
--                offered-by guard that makes a unilateral custody grab
--                structurally impossible.
--
-- HUMAN-GATED — this project never runs `supabase db push`, `supabase db
-- reset`, or `supabase migration up` from an agent. That is the standing
-- convention stated verbatim in the headers of migrations 078, 080, 136,
-- 177, 181, 182, 183 and 184. This file is authored and text-tested
-- (__tests__/migration-185.test.ts) but must not be applied automatically.
-- Owner decision taken during execution (2026-09-05): migrations 183, 184
-- and 185 are BATCHED into a single owner push sitting before Wave 6 — this
-- plan's (38-10) Task 3 blocking checkpoint records what the owner verifies
-- there. This is the LAST migration in that batch.
--
-- MIGRATION NUMBERING (Phase 38 planner decision 1, restated from migrations
-- 182, 183 and 184's headers): 182 = plan 38-03 (Slice A foundation; already
-- LIVE). 183 = plan 38-04 (Slice B: roster relationships + agreement
-- evidence + blocks; authored, not yet pushed). 184 = plan 38-08 (Slice C:
-- grants + bundles; authored, not yet pushed). 185 (this file) = plan 38-10
-- (Slice D's additive half: attachments + custody transfers). Its sibling
-- 186 = plan 38-11 (Slice D's other half: the RLS workspace branch extending
-- project_member_role() and siblings — edits LIVE policies on
-- vault_projects and four child tables, and therefore stands alone with its
-- own review, its own push, and its own adversarial smoke; it must NOT be
-- batched with 182-185). 187 and 188 remain RESERVED for Phase 38.2's
-- billing and beta-flag migrations and MUST NOT be claimed by any plan in
-- this phase.
--
-- UUID DEFAULTS: every id column below uses gen_random_uuid(), never
-- uuid_generate_v4() — uuid-ossp lives in the `extensions` schema and is
-- not on the migration session's search_path (migration 062's first push
-- attempt failed on exactly that; migrations 078, 136, 182, 183 and 184 all
-- restate the rule; restated again here for the same reason).
--
-- THIS FILE IS ADDITIVE ONLY. It creates two new tables, two new SECURITY
-- DEFINER helpers, and one new trigger function. It does not create, alter
-- or drop any policy, trigger, function or column on any table that existed
-- before this migration. In particular, public.vault_projects,
-- public.tracks, public.vault_assets, public.vault_documents,
-- public.tool_outputs, public.project_members and public.work_members are
-- READ FROM (workspace_attachment_visible reads vault_projects.user_id to
-- recognize the current custodian) but never altered here. Nothing in
-- public.workspaces, public.workspace_members (migration 182) or
-- public.workspace_roster_relationships (migration 183) is altered either
-- — both are READ FROM only.
--
-- ─── THE D-28 CANONICAL RULE THIS SCHEMA DEPENDS ON ──────────────────────
-- `vault_projects.user_id` and `works.user_id` mean RECORD CUSTODY — who
-- holds and administers the record in Funūn — NEVER rights ownership.
-- Rights always live on separate evidenced records: composition rights on
-- split sheets, master rights on version ownership records (custody D-02).
-- Both tables this migration creates depend on that meaning holding: a
-- workspace_attachments row links a workspace to a project without ever
-- implying the workspace owns anything about that project's rights, and a
-- workspace_custody_transfers row changes who administers the record in
-- Funūn, never who owns its underlying composition or master rights. No
-- column is renamed by this or any migration in this phase (D-28).
--
-- ─── D-23 / D-25 / D-26 — WHY THERE IS NO COLUMN ON vault_projects ───────
-- A workspace reaches a project ONLY through an attachment row (D-23) — this
-- migration adds no `owner_workspace_id` column or any other column to
-- vault_projects, so personal URLs and workflows already live on that table
-- are structurally untouched. Detaching sets `detached_at` and stops there
-- (D-25): the attachment row persists as history, and no project row moves,
-- copies, or is deleted. A workspace's catalogue view is therefore a QUERY
-- over live (`detached_at IS NULL`) attachment rows, never a copy or a fork
-- of the underlying project (D-26) — the covering index in section (a)
-- below is what makes that query cheap, and it is what migration 186's
-- three-hop project-permission helper joins through as its first hop.
--
-- ─── D-29 — WHY CUSTODY TRANSFER IS TWO ROWS OF PROOF, NOT ONE WRITE ─────
-- Custody may transfer, but only as a two-sided act: the current holder
-- offers, the recipient accepts, and the diary records it permanently —
-- never unilateral (D-29). This migration stores the OFFER and its
-- resolution (workspace_custody_transfers.state); the actual
-- `vault_projects.user_id` write that makes an acceptance real happens in
-- the service route on acceptance (plan 38-13), never in a trigger here, so
-- the diary entry and the custody change are one reviewable code path
-- rather than two independent ones that could drift apart. Section (f)'s
-- BEFORE INSERT guard is the structural backstop that makes an offer from
-- anyone but the current holder or an owner/admin of the named workspace
-- impossible even if a future route forgets to check.
-- ============================================================

-- ─── (a) public.workspace_attachments — the link a workspace reaches a ───
--         project through
CREATE TABLE public.workspace_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES public.vault_projects ON DELETE CASCADE,
  -- Ties an attachment to the consent that justifies it (nullable — an
  -- attachment can in principle predate a formal roster relationship row,
  -- but is expected to carry one in practice).
  relationship_id UUID REFERENCES public.workspace_roster_relationships ON DELETE CASCADE,
  attached_by     UUID NOT NULL REFERENCES auth.users,
  attached_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULL while the link is live. Set once, on detach — never cleared back
  -- to NULL and never deleted (D-25). A renewed attachment is a NEW row,
  -- mirroring migration 183's never-revive-a-row posture for roster
  -- relationships.
  detached_at     TIMESTAMPTZ,
  detached_by     UUID REFERENCES auth.users,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.workspace_attachments IS
  'A workspace reaches a project ONLY through a row here (D-23) — vault_projects carries no additional ownership column naming a workspace, and none will ever be added. Detaching sets detached_at and stops there (D-25): nothing moves, copies, or is deleted; the row persists as history. A workspace catalogue is a QUERY over the live (detached_at IS NULL) rows here, never a copy or a fork of the project itself (D-26) — same underlying vault_projects row for the holder and for every attached workspace, differing only by which fields each caller''s grant exposes.';

-- A PARTIAL unique index so one LIVE attachment exists per (workspace,
-- project) pair while detached rows accumulate freely as history — mirrors
-- migration 183's idx_workspace_roster_relationships_live_pair shape.
CREATE UNIQUE INDEX idx_workspace_attachments_live_pair
  ON public.workspace_attachments (workspace_id, project_id)
  WHERE detached_at IS NULL;

-- LOAD-BEARING for migration 186's three-hop project-permission helper —
-- this is the first hop of that chain. The helper resolves "does workspace
-- W have a live attachment to project P" by entering through THIS index,
-- keyed exactly on (project_id, workspace_id) so the project-id-first read
-- path migration 186 needs is an index-only lookup, never a sequential
-- scan. The `detached_at IS NULL` filter is what structurally excludes a
-- severed attachment from ever widening access again (T-38-10-01) — do not
-- drop or reorder this filter in any future migration that touches this
-- index.
CREATE INDEX idx_workspace_attachments_project_live
  ON public.workspace_attachments (project_id, workspace_id)
  WHERE detached_at IS NULL;

-- The catalogue query: "every project this workspace currently holds an
-- attachment to."
CREATE INDEX idx_workspace_attachments_workspace_live
  ON public.workspace_attachments (workspace_id)
  WHERE detached_at IS NULL;

ALTER TABLE public.workspace_attachments ENABLE ROW LEVEL SECURITY;

-- ─── (b) public.workspace_custody_transfers — the two-sided offer record ─
CREATE TABLE public.workspace_custody_transfers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES public.vault_projects ON DELETE CASCADE,
  from_user_id   UUID NOT NULL REFERENCES auth.users,
  to_user_id     UUID NOT NULL REFERENCES auth.users,
  offered_by     UUID NOT NULL REFERENCES auth.users,
  -- Nullable — a transfer may be offered outside any workspace context
  -- (e.g. two Members transacting directly). ON DELETE SET NULL, not
  -- CASCADE: a workspace being deleted must never erase the historical
  -- record of a custody negotiation it once hosted.
  workspace_id   UUID REFERENCES public.workspaces ON DELETE SET NULL,
  state          TEXT NOT NULL DEFAULT 'offered'
                 CHECK (state IN ('offered', 'accepted', 'declined', 'withdrawn')),
  offered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at   TIMESTAMPTZ,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_user_id <> to_user_id)
);

COMMENT ON TABLE public.workspace_custody_transfers IS
  'Custody may transfer, but only as a two-sided act (D-29): the current holder offers, the recipient accepts, and the diary records it permanently — never unilateral. The actual vault_projects.user_id write that makes an acceptance real is performed by the service route on acceptance (plan 38-13), never by a trigger on this table, so the diary entry and the custody change are one reviewable code path rather than two that could drift apart. Section (f)''s BEFORE INSERT guard structurally forbids an offer from anyone but the current holder or an owner/admin of the named workspace.';

-- A PARTIAL unique index so at most one LIVE ('offered') negotiation exists
-- per project at a time — a second offer cannot be raised until the first
-- is accepted, declined, or withdrawn.
CREATE UNIQUE INDEX idx_workspace_custody_transfers_one_live_offer
  ON public.workspace_custody_transfers (project_id)
  WHERE state = 'offered';

CREATE INDEX idx_workspace_custody_transfers_project
  ON public.workspace_custody_transfers (project_id);

ALTER TABLE public.workspace_custody_transfers ENABLE ROW LEVEL SECURITY;

-- ─── (c) Write lockdown — no client PostgREST write path on either table ─
--         (078 section (b) / 136 / 182 section (e) / 183 section (d) / 184
--         section (c)'s posture, restated here). Every write — attaching,
--         detaching, offering, accepting, declining, or withdrawing a
--         custody transfer — goes through a service-role API route that has
--         already proved caller authority (plan 38-13).
REVOKE INSERT, UPDATE, DELETE ON public.workspace_attachments FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.workspace_custody_transfers FROM authenticated, anon;

-- ─── (d) SECURITY DEFINER helper pair ─────────────────────────────────────
-- Copies migrations 182/183/184's proven shape exactly. Both take
-- identifying values as PARAMETERS rather than calling auth.uid()
-- internally, so `SET search_path = ''` does not have to reach into the
-- auth schema. STABLE lets the planner cache the result within a single
-- statement when the policy wraps the call as `(SELECT ...)`, which every
-- policy below does.
--
-- Visible to an active member of the attachment's own workspace (they
-- administer the attachment) OR to the project's current custodian (they
-- are entitled to see who holds an attachment to their own record) —
-- visibility never depends on the attachment's live/detached state, the
-- same "history stays visible" posture migration 183 took for roster
-- relationships.
CREATE OR REPLACE FUNCTION public.workspace_attachment_visible(p_attachment_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_attachments a
    JOIN public.vault_projects p ON p.id = a.project_id
    WHERE a.id = p_attachment_id
      AND (
        public.workspace_member_role(a.workspace_id, p_uid) IS NOT NULL
        OR p.user_id = p_uid
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.workspace_attachment_visible(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_attachment_visible(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.workspace_attachment_visible(uuid, uuid) IS
  'True when p_uid is an ACTIVE member of the attachment''s own workspace (via migration 182''s workspace_member_role), or is the project''s current custodian (vault_projects.user_id, per D-28''s canonical meaning of that column). workspace_attachments carries both a workspace_id and a project_id directly, but the custodian check still requires a join, so this predicate is routed through a SECURITY DEFINER body rather than a bare cross-table EXISTS inside a policy, avoiding the 42P17 recursion shape (migrations 018, 064, 078, 136, 182, 183, 184). Intended for RLS policy USING clauses wrapped as (SELECT ...), not a client-invoked RPC.';

-- Visible ONLY to the three named parties on the offer — a workspace seat
-- alone must never reveal a private custody negotiation (T-38-10-04). Note
-- the deliberate absence of any workspace_member_role() call in this body.
CREATE OR REPLACE FUNCTION public.custody_transfer_visible(p_transfer_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_custody_transfers
    WHERE id = p_transfer_id
      AND (from_user_id = p_uid OR to_user_id = p_uid OR offered_by = p_uid)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.custody_transfer_visible(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.custody_transfer_visible(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.custody_transfer_visible(uuid, uuid) IS
  'True only when p_uid is the offer''s from_user_id, to_user_id, or offered_by. Deliberately does NOT consult workspace_member_role() anywhere — a workspace seat alone must never reveal a private custody negotiation between two people (T-38-10-04). SECURITY DEFINER so it can be called from this table''s own RLS policy without re-entering it (would recurse with 42P17, per migrations 018, 064, 078, 136, 182, 183, 184). Intended for RLS policy USING clauses wrapped as (SELECT ...), not a client-invoked RPC.';

-- ─── (e) Own-table SELECT policies — every helper call scalar-subselect ──
--         wrapped, never a bare cross-table EXISTS (the recursion rule).
CREATE POLICY "workspace_attachments_select" ON public.workspace_attachments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.workspace_attachment_visible(id, auth.uid()))
  );

CREATE POLICY "workspace_custody_transfers_select" ON public.workspace_custody_transfers
  FOR SELECT TO authenticated
  USING (
    (SELECT public.custody_transfer_visible(id, auth.uid()))
  );

-- ─── (f) BEFORE INSERT guard — a unilateral custody grab is impossible ───
--         even if a future route forgets to check (D-29, T-38-10-02).
-- Follows migration 172's guard_work_graduation_owner_only() shape exactly:
-- plain LANGUAGE plpgsql (not SECURITY DEFINER — this function only calls
-- public.workspace_member_role(), which is already GRANTed EXECUTE TO
-- authenticated, and the only role that can ever reach this trigger at all
-- is service_role, since section (c) above revokes every client INSERT
-- path on this table). offered_by must equal the current holder
-- (from_user_id) OR be an active owner/admin of the named workspace —
-- when workspace_id is NULL (a transfer offered outside any workspace
-- context), only the current holder themself may offer it.
CREATE OR REPLACE FUNCTION public.guard_custody_transfer_offered_by_holder()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.offered_by <> NEW.from_user_id
     AND NOT (
       NEW.workspace_id IS NOT NULL
       AND public.workspace_member_role(NEW.workspace_id, NEW.offered_by) IN ('owner', 'admin')
     ) THEN
    RAISE EXCEPTION 'a custody offer must come from the current holder or an owner/admin of the named workspace — custody transfer is two-sided, never unilateral (D-29)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_custody_transfer_offered_by_holder()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_custody_transfer_offered_by_holder ON public.workspace_custody_transfers;
CREATE TRIGGER guard_custody_transfer_offered_by_holder
  BEFORE INSERT ON public.workspace_custody_transfers
  FOR EACH ROW EXECUTE FUNCTION public.guard_custody_transfer_offered_by_holder();

-- ─── (g) Schema-cache reload ───────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
