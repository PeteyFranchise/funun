-- ============================================================
-- Funūn — Phase 38.0.1 (workspace-authorization-remediation): Plan 05.
-- Migration 191: the consent root, the delegation lineage, `relationship_id`
--                NOT NULL on `workspace_grants` and `workspace_attachments`,
--                and evidence confirmation on `workspace_agreement_evidence`.
--
-- HUMAN-GATED — this project never runs `supabase db push`, `supabase db
-- reset`, `supabase migration up`, or `supabase db query` from an agent.
-- That is the standing convention stated verbatim in the headers of
-- migrations 078, 080, 136, 177 and 181-189. This file is authored and
-- text-tested (__tests__/migration-191.test.ts) but must not be applied
-- automatically.
--
-- PUSH ORDERING — this checkpoint is a HOLD, not a push authorisation. This
-- migration is additive on its own, but it is pushed TOGETHER with 190 and
-- 192 in one transaction window, at plan 11's joint checkpoint, because
-- migration 192's SQL twin of lib/workspaces/grant-lineage.ts reads the
-- `parent_grant_id` column and the member-consent CHECK literal this file
-- adds, and migration 190's trigger and this file's NOT NULL tightening
-- both land on the same tables in the same push. Do not push 191 alone.
--
-- MIGRATION NUMBERING (Phase 38.0.1 planner decision, restated from this
-- phase's plan headers): migrations 188 and 189 were claimed in the
-- meantime by unrelated Playbook work (188_playbook_anr_core_responsibilities,
-- 189_playbook_bdt_foundation_doctrine) — the F3-fix reservation migration
-- 187's header made for "188" therefore moved forward. 190 = plan 02 (the
-- R-17/WSR-25 `vault_projects.user_id` immutability trigger). 191 (this
-- file) = plan 05 (Slice A of this phase's remediation: consent root,
-- delegation lineage, NOT NULL, evidence confirmation). 192-194 remain this
-- phase's later plans (the SQL twin of the lineage walk, the Member consent
-- RPC route, and the evidence confirmation route). 195-196 are RESERVED for
-- Phase 38.0.2. 197-198 are RESERVED for Phase 38.2's billing and beta-flag
-- migrations. No other migration file is edited to reflect this renumbering
-- — this file is the single source of truth for it going forward.
--
-- WHY THIS EXISTS (R-01/WSR-01, R-01/WSR-02, R-08/WSR-14, R-16/WSR-24;
-- findings F6, F8, F22) — three independent defects, one migration because
-- all three are additive schema-only changes on tables migrations 183-185
-- already created, and 192's helper needs all three sections to exist
-- together:
--   F6 — `assertGrantIssuable` (lib/workspaces/grants.ts) derives a
--   granter's authority entirely from `resolveEffectivePermissions`, which
--   reads `workspace_grants` rows for the same relationship. With zero
--   grant rows in existence (confirmed empirically at 0/0 by this phase's
--   pre-flight probe P3), every possible first grant request evaluates
--   `granterHolds` as empty and is refused forever — the bootstrap
--   deadlock R-01 exists to break. Section (a) below gives the schema a way
--   to represent the one kind of grant that needs no prior grant to point
--   to: the subject Member's own root consent (`source = 'member_consent'`,
--   `parent_grant_id IS NULL`), with every delegated grant beneath it
--   carrying an immutable lineage link back to that root.
--   F8 — a workspace could insert `workspace_agreement_evidence` naming a
--   `declaredScope` with no document and no subject confirmation, and it
--   became immediately live authority-tier evidence the instant
--   `resolveAuthorityTier` next evaluated it. Section (c) below adds the
--   confirmation pair R-08 requires: the workspace proposes, the subject
--   Member confirms, and confirmation is unreachable without a document.
--   F22 — both `workspace_grants.relationship_id` and
--   `workspace_attachments.relationship_id` were left nullable, with a NULL
--   read by migration 186's helper as "applies workspace-wide." Migration
--   192's custody binding resolves through `relationship_id` specifically —
--   a NULL there lets the helper join ANY accepted relationship in the
--   workspace, defeating the binding outright (T-38.0.1-05-02, critical).
--   Section (b) below tightens both to NOT NULL.
--
-- WHY NO BACKFILL EXISTS — every workspace table in production is EMPTY.
-- `.planning/phases/38.0.1-workspace-authorization-remediation/
-- 38.0.1-PREFLIGHT.md` recorded, by direct query against production, zero
-- rows in `workspaces`, `workspace_members`, `workspace_roster_relationships`,
-- `workspace_attachments`, `workspace_audit_log`, and `workspace_grants`
-- (P2, P3, and the P5 exposure-assessment follow-up counts, all 0). D-PF-02
-- reads GO on that basis: the NOT NULL statements in section (b) below are
-- authored unconditionally, because there is no data anywhere in this phase
-- to migrate, backfill, or reconcile. Re-verify the NULL counts immediately
-- before the joint push regardless — these are live tables and this file
-- was authored against a point-in-time read.
--
-- UUID DEFAULTS: this migration adds no new table and therefore mints no
-- new `id` column, so there is no UUID default to restate. `parent_grant_id`
-- below is a foreign key onto an existing `gen_random_uuid()`-defaulted
-- column (migration 184), not a new default of its own.
--
-- THIS FILE IS ADDITIVE ONLY, in the sense migrations 182-187 use the word:
-- it widens one CHECK constraint, adds columns and constraints to three
-- EXISTING tables, and restates (does not change) an existing REVOKE. It
-- creates no table, no SECURITY DEFINER function, and no trigger — those
-- are migration 192's job. It creates and drops NO POLICY of any kind: no
-- authorization BEHAVIOUR changes as a result of this file; only the
-- storage shape a later migration and later routes will read changes.
-- Nothing in `handle_new_user()`, `member_type`, `industry_roles`,
-- `capability_grants`, or `project_members` is touched (D-52).
-- ============================================================

-- ─── (a) Consent root and delegation lineage on workspace_grants ─────────
-- (R-01/WSR-01, R-01/WSR-02, F6, D-21)
--
-- The member-consent literal below is byte-identical to
-- `MEMBER_CONSENT_SOURCE` exported by `lib/workspaces/grant-lineage.ts`.
-- That module's own header names this migration as the second of the three
-- places the one string must agree (TypeScript, this schema, migration
-- 192's `WITH RECURSIVE` SQL twin) — __tests__/migration-191.test.ts imports
-- the TypeScript constant and asserts this file contains it verbatim, so a
-- rename on either side fails the suite instead of drifting silently.
ALTER TABLE public.workspace_grants DROP CONSTRAINT IF EXISTS workspace_grants_source_check;

ALTER TABLE public.workspace_grants ADD CONSTRAINT workspace_grants_source_check
  CHECK (source IN ('bundle', 'individual', 'member_consent'));

COMMENT ON CONSTRAINT workspace_grants_source_check ON public.workspace_grants IS
  'Widened in migration 191 to add ''member_consent'' (R-01, WSR-01/02) alongside migration 184''s original ''bundle''/''individual'' values. ''member_consent'' is the literal lib/workspaces/grant-lineage.ts exports as MEMBER_CONSENT_SOURCE — the relationship''s own member_user_id is the root of authority for a grant carrying this source, needing no parent grant to point to. The other two places this literal must agree are that TypeScript module and migration 192''s SQL twin function.';

-- Self-referencing lineage link. RESTRICT, not CASCADE: grant rows are
-- never deleted in this codebase (they are revoked via revoked_at), so a
-- delete on this FK would only ever fire against an out-of-band operation
-- this schema does not sanction — RESTRICT refuses that operation outright
-- rather than silently orphaning every descendant in the chain.
ALTER TABLE public.workspace_grants
  ADD COLUMN parent_grant_id UUID REFERENCES public.workspace_grants(id) ON DELETE RESTRICT;

-- The two-way invariant that makes "every delegated grant carries a
-- lineage" a schema fact rather than an application convention a route
-- could forget: a member-consent row is the root and has no parent; every
-- other row is a delegation and MUST name one. This is what makes a
-- delegated grant with no ancestor unstorable (T-38.0.1-05-01, critical).
ALTER TABLE public.workspace_grants ADD CONSTRAINT workspace_grants_consent_root_or_lineage_check
  CHECK (
    (source = 'member_consent' AND parent_grant_id IS NULL)
    OR (source <> 'member_consent' AND parent_grant_id IS NOT NULL)
  );

-- Index-backs migration 192's `WITH RECURSIVE` walk up the parent chain —
-- without this, every lookup of "who is my parent" (and, one level up in
-- the SQL twin, the reverse "who are my descendants") pays a sequential
-- scan on a table this authorization layer reads on every RLS evaluation.
CREATE INDEX idx_workspace_grants_parent_grant_id
  ON public.workspace_grants (parent_grant_id);

COMMENT ON COLUMN public.workspace_grants.parent_grant_id IS
  'D-21''s two-tier model made structural: NULL on a member-consent root row (the subject Member''s own authority, needing no ancestor); non-NULL on every delegated row, naming the grant it was relayed from. Nothing here cascades a revocation — lib/workspaces/grant-lineage.ts''s isGrantChainLive() and migration 192''s SQL twin both re-walk this chain fresh on every read, so a parent''s revoked_at becomes visible to every descendant on the very next query, never on a cron tick or a cleanup job (D-49). ON DELETE RESTRICT because grant rows are never deleted in this codebase (they are revoked, not removed) — a delete attempt against a row with descendants is refused rather than silently orphaning the chain.';

-- ─── (b) NOT NULL on the two security foreign keys (R-16/WSR-24, F22) ────
-- Authored unconditionally under D-PF-02 = GO
-- (38.0.1-PREFLIGHT.md: both NULL counts confirmed 0 against production,
-- trivially so since every workspace table is empty). Re-verify
-- immediately before the joint push regardless — these are live tables and
-- this file was authored against a point-in-time read.
--
-- Migration 186's helper joins `workspace_roster_relationships` with
-- `(a.relationship_id IS NULL OR r.id = a.relationship_id)` — a NULL there
-- matches ANY accepted relationship in the workspace, and migration 192's
-- custody binding (`p.user_id = r.member_user_id`) then resolves against
-- whichever relationship happened to join. A nullable relationship_id
-- therefore defeats the custody binding directly
-- (T-38.0.1-05-02, critical) — this is why WSR-24 was promoted from Low.
ALTER TABLE public.workspace_grants ALTER COLUMN relationship_id SET NOT NULL;
ALTER TABLE public.workspace_attachments ALTER COLUMN relationship_id SET NOT NULL;

COMMENT ON COLUMN public.workspace_grants.relationship_id IS
  'NOT NULL as of migration 191 (R-16/WSR-24) — corrects migration 184''s original "NULL applies workspace-wide" reading. A grant is always tied to exactly ONE roster relationship, because the relationship is what identifies WHICH Member''s consent justifies the access, and migration 192''s custody binding and lineage walk both resolve through this column. A grant with no relationship to name confers nothing and can no longer be stored.';

COMMENT ON COLUMN public.workspace_attachments.relationship_id IS
  'NOT NULL as of migration 191 (R-16/WSR-24) — corrects migration 185''s original "can in principle predate a formal roster relationship row" reading. An attachment is always tied to exactly ONE roster relationship: migration 186''s helper previously treated a NULL here as "matches any accepted relationship in the workspace," which let migration 192''s custody binding (p.user_id = r.member_user_id) resolve against whichever relationship happened to join — a wildcard, not a binding (T-38.0.1-05-02, critical). A NULL here can no longer be stored.';

-- ─── (c) Evidence confirmation (R-08/WSR-14, F8) ─────────────────────────
-- A workspace may still draft a scope-only proposal (declared_scope with no
-- document) — that is genuine admin help, and D-36/D-37 already forbid
-- Funūn from inspecting or validating what a document contains. What R-08
-- forbids is that proposal conferring anything on its own: it stays inert
-- until the relationship's own member_user_id confirms it, and — because
-- authority tier requires a document-supported relationship per D-16 —
-- confirmation itself is unreachable without a document attached.
ALTER TABLE public.workspace_agreement_evidence ADD COLUMN confirmed_by_subject_at TIMESTAMPTZ;
ALTER TABLE public.workspace_agreement_evidence ADD COLUMN confirmed_by_subject UUID REFERENCES auth.users;

-- Both-or-neither: a half-confirmed row (a timestamp with no confirming
-- identity, or vice versa) is not a state this schema can express.
ALTER TABLE public.workspace_agreement_evidence ADD CONSTRAINT workspace_agreement_evidence_confirmation_pair_check
  CHECK (
    (confirmed_by_subject_at IS NULL AND confirmed_by_subject IS NULL)
    OR (confirmed_by_subject_at IS NOT NULL AND confirmed_by_subject IS NOT NULL)
  );

-- Confirmation without a document is exactly the F8 hole this section
-- exists to close: document_id itself stays nullable (a workspace may
-- still draft a scope-only proposal that confers nothing), but the moment
-- confirmed_by_subject_at is set, document_id must already be non-NULL —
-- the document is mandatory for anything that can reach authority tier.
ALTER TABLE public.workspace_agreement_evidence ADD CONSTRAINT workspace_agreement_evidence_confirmed_requires_document_check
  CHECK (confirmed_by_subject_at IS NULL OR document_id IS NOT NULL);

COMMENT ON COLUMN public.workspace_agreement_evidence.confirmed_by_subject_at IS
  'R-08/WSR-14 (F8): the workspace proposes evidence, the subject Member confirms it — an unconfirmed row (this column NULL) confers nothing at any tier, no matter what declared_scope names or how long ago it was uploaded. NULL until the relationship''s own member_user_id has affirmatively confirmed. The CHECK constraints on this table require confirmed_by_subject to be set in lockstep, and require document_id to already be non-NULL before this column can be set — Funūn never inspects the document''s contents either way (D-36, D-37).';

COMMENT ON COLUMN public.workspace_agreement_evidence.confirmed_by_subject IS
  'The confirming identity, set only alongside confirmed_by_subject_at. The enforcement that this identity must actually BE the relationship''s member_user_id (not merely some authenticated caller) lives in plan 08''s Member-side confirmation route, not in a CHECK here — a CHECK can compare two columns on the same row but cannot join to workspace_roster_relationships to verify the identity match.';

-- ─── (d) Write lockdown — restated, not changed ──────────────────────────
-- (078 section (b) / 136 / 182 section (e) / 183 section (d) / 184 section
-- (c) / 185 section (c)'s posture, restated here.) This is a RESTATEMENT:
-- all three REVOKEs already exist from migrations 183-185. Every write on
-- any of these three tables — issuing or narrowing a grant, confirming
-- evidence, attaching a workspace to a project — still goes through a
-- service-role API route that has already proved caller authority in
-- application code; nothing about this migration opens a new client write
-- path or narrows an existing one.
REVOKE INSERT, UPDATE, DELETE ON public.workspace_grants, public.workspace_attachments, public.workspace_agreement_evidence FROM authenticated, anon;

-- ─── (e) Schema-cache reload ───────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
