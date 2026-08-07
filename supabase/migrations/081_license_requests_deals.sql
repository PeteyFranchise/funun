-- ============================================================
-- Funūn — Wave 4 follow-on: Phase 16 GTM Beta Launch & Buyer Portal
-- Migration 081: license_requests + license_request_tracks +
--                 project_license_terms + vault_documents sync-license
--                 type widening
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push against the remote database is a human-gated checkpoint
-- (mirrors migrations 058/062/063/064/066-070/075/076/078/080's "do not
-- push from an executor agent" convention). This migration has a foreign
-- key to buyer_orgs (migration 080) and MUST be pushed strictly after 080
-- is confirmed live — both are part of Wave 0's batch push per this
-- plan's checkpoint task, which owns `supabase migration list`
-- confirmation and the adversarial buyer-session checks.
--
-- ─── PRIVACY POSTURE (D-07/D-13a/D-15/D-16a/D-20, RESEARCH Patterns 3) ────
-- license_requests is the deal substrate every downstream Phase 16 surface
-- (buyer portal, artist Deals room, admin negotiation queue, money rails,
-- GTM metrics) reads and writes. The buyer-cannot-self-approve-their-own-
-- deal invariant is enforced at THREE layers, not one:
--   1. Row RLS scopes SELECT to the caller's own buyer org OR the vault
--      project they OWN.
--   2. A column-level REVOKE/GRANT allowlist hides admin_notes, owner_id,
--      commission_pct, and artist_net_cents even on rows a caller can
--      otherwise see (RESEARCH Pitfall 2 — RLS restricts rows, not
--      columns; migration 040/058 convention).
--   3. INSERT/UPDATE/DELETE are revoked from authenticated/anon entirely.
--      Every stage transition, owner assignment, and commission edit is an
--      authority action that goes through a verifyAdmin-gated service-role
--      route (plan 16-07); buyer request creation goes through a validated
--      service-role route (plan 16-06), never a client INSERT policy
--      (RESEARCH Pitfall 3, mirrors migration 056's dm_threads/dm_messages
--      hardening exactly).
--
-- ─── C4 HARDENING — artist-arm SELECT must use explicit ownership ────────
-- Migration 078 (Phase 21) widened vault_projects' own SELECT policy from
-- owner-only to owner-OR-member (project_members guest list). A naive
-- `vault_project_id IN (SELECT id FROM vault_projects)` subquery inside
-- license_requests' policy would resolve THROUGH vault_projects' own
-- (now-widened) RLS, silently leaking license requests tied to a
-- co-owned/editor/viewer project to anyone on that project's guest list —
-- not just the actual owner. This migration scopes the artist arm by
-- EXPLICIT ownership instead: `vault_project_id IN (SELECT id FROM
-- vault_projects WHERE user_id = auth.uid())`, matching on user_id
-- directly rather than trusting a nested RLS-filtered subquery. A seller
-- must see only requests tied to projects they OWN, never merely
-- collaborate on.
--
-- ─── SELF-REFERENTIAL RLS RECURSION ───────────────────────────────────────
-- None of the three tables below have a policy that reads FROM THEMSELVES
-- (license_requests' policy reads buyer_members + vault_projects;
-- license_request_tracks'/project_license_terms' policies read
-- license_requests via a subquery on license_requests' own primary key,
-- which is not a self-referential RLS re-entry). The migration 064/078/080
-- SECURITY DEFINER helper pattern is therefore not required for NEW
-- recursion here — this migration reuses the EXISTING
-- public.is_buyer_org_member(uuid, uuid) helper from migration 080 for the
-- buyer-org arm of every policy below, exactly as that helper documents
-- itself as intended for RLS policy USING clauses.
--
-- ─── vault_documents.type WIDENING (D-08, RESEARCH Pitfall 7) ────────────
-- Migration 001's vault_documents.type CHECK constraint only allows
-- split_sheet, copyright_registration, hire_right, sample_clearance,
-- distribution_agreement. Signed sync licenses (D-08's Contract Locker
-- destination for the e-sign flow built in plan 16-09) need a sixth value,
-- sync_license, or the e-sign completion webhook's document-insert fails
-- with a raw 23514 check_violation instead of landing in Contract Locker.
-- ============================================================

-- ─── (a) license_requests ─────────────────────────────────────────────
CREATE TABLE license_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_org_id         UUID REFERENCES public.buyer_orgs NOT NULL,
  -- Dual-level attribution (D-13a): the individual AND the company are
  -- always recorded, never just the org.
  created_by           UUID REFERENCES auth.users NOT NULL,
  vault_project_id     UUID REFERENCES public.vault_projects NOT NULL,
  usage_types          TEXT[] DEFAULT '{}',
  territories          TEXT[] DEFAULT '{}',
  term_months          INTEGER,
  exclusivity          BOOLEAN NOT NULL DEFAULT false,
  budget_cents         INTEGER,
  need_by              DATE,
  buyer_notes          TEXT,
  -- D-16a deal-stage pipeline.
  stage                TEXT NOT NULL DEFAULT 'submitted' CHECK (stage IN (
                          'submitted',
                          'in_negotiation',
                          'terms_agreed',
                          'contract',
                          'closed_won',
                          'closed_lost'
                        )),
  -- Admin deal owner — an authority field, never buyer/artist writable.
  owner_id             UUID REFERENCES auth.users,
  admin_notes          TEXT,
  -- D-15a: whether this request matched the project's pre-cleared terms
  -- (matchesPreclearedTerms(), lib/deals/matching.ts) at submission time.
  matched_precleared   BOOLEAN NOT NULL DEFAULT false,
  -- D-20 commission economics — server-computed only, never client-supplied.
  gross_fee_cents      INTEGER,
  commission_pct       NUMERIC(5,2),
  artist_net_cents     INTEGER,
  -- D-08: Contract Locker destination once the sync license is signed.
  contract_document_id UUID REFERENCES public.vault_documents,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_license_requests_buyer_org_id     ON public.license_requests (buyer_org_id);
CREATE INDEX idx_license_requests_vault_project_id ON public.license_requests (vault_project_id);
CREATE INDEX idx_license_requests_stage            ON public.license_requests (stage);

DROP TRIGGER IF EXISTS license_requests_updated_at ON public.license_requests;
CREATE TRIGGER license_requests_updated_at
  BEFORE UPDATE ON public.license_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.license_requests IS
  'Phase 16 deal substrate (D-07): first-class license-request data feeding the buyer portal, artist Deals room, admin negotiation queue, money rails, and GTM metrics. Server-owned writes (D-20/RESEARCH Pitfall 3): INSERT/UPDATE/DELETE are revoked from authenticated/anon — stage transitions, owner assignment, and commission edits are authority actions owned by service-role admin routes. Column-level GRANT excludes admin_notes/owner_id/commission_pct/artist_net_cents (RESEARCH Pitfall 2) so a buyer never reads Funūn''s internal economics or negotiation notes even on their own org''s rows.';

-- ─── (b) license_request_tracks ────────────────────────────────────────
-- Join table for multi-track requests within one project (RESEARCH
-- Assumption A5: one request equals one project, many tracks).
CREATE TABLE license_request_tracks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_request_id UUID REFERENCES public.license_requests ON DELETE CASCADE NOT NULL,
  track_id           UUID REFERENCES public.tracks ON DELETE CASCADE NOT NULL,
  UNIQUE (license_request_id, track_id)
);

CREATE INDEX idx_license_request_tracks_request_id ON public.license_request_tracks (license_request_id);
CREATE INDEX idx_license_request_tracks_track_id   ON public.license_request_tracks (track_id);

COMMENT ON TABLE public.license_request_tracks IS
  'Join table resolving RESEARCH Assumption A5: a license_requests row is scoped to one vault_project_id but may name multiple tracks within it. Row-scope, column-grant, and write-REVOKE treatment mirrors license_requests exactly (section (f)/(g) below).';

-- ─── (c) project_license_terms ─────────────────────────────────────────
-- 1:1 table on vault_projects holding the "Marmoset five" (D-15). Absence
-- of a row means "no terms set" and must route to admin negotiation
-- (D-15a) — enforced in lib/deals/matching.ts's matchesPreclearedTerms(),
-- not the database.
CREATE TABLE project_license_terms (
  vault_project_id     UUID PRIMARY KEY REFERENCES public.vault_projects ON DELETE CASCADE,
  min_fee_cents        INTEGER,
  allowed_usage_types  TEXT[] DEFAULT '{}',
  territories          TEXT[] DEFAULT '{}',
  exclusivity_allowed  BOOLEAN,
  max_term_months      INTEGER,
  updated_by           UUID REFERENCES auth.users,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS project_license_terms_updated_at ON public.project_license_terms;
CREATE TRIGGER project_license_terms_updated_at
  BEFORE UPDATE ON public.project_license_terms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.project_license_terms IS
  'Per-project pre-cleared licensing terms (D-15, the "Marmoset five": minimum fee, allowed usage/media types, territories, exclusivity, term length). A missing row for a given vault_project_id means "no terms set" and routes every request against that project to admin negotiation first (D-15a) — enforced by matchesPreclearedTerms() in lib/deals/matching.ts, not a database constraint.';

-- ─── (d) vault_documents.type widening (D-08, RESEARCH Pitfall 7) ──────
-- Drop and recreate migration 001's CHECK with the existing five values
-- plus sync_license, so signed sync licenses can land in Contract Locker.
ALTER TABLE public.vault_documents DROP CONSTRAINT IF EXISTS vault_documents_type_check;

ALTER TABLE public.vault_documents ADD CONSTRAINT vault_documents_type_check
  CHECK (type IN (
    'split_sheet',
    'copyright_registration',
    'hire_right',
    'sample_clearance',
    'distribution_agreement',
    'sync_license'
  ));

COMMENT ON CONSTRAINT vault_documents_type_check ON public.vault_documents IS
  'Widened in migration 081 to add sync_license (D-08) alongside migration 001''s original five document types, so the Phase 16 e-sign completion webhook (plan 16-09) can insert signed sync-license documents into Contract Locker without a 23514 check_violation (RESEARCH Pitfall 7).';

-- ─── (e) RLS — row scope ────────────────────────────────────────────────
ALTER TABLE public.license_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_request_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_license_terms  ENABLE ROW LEVEL SECURITY;

-- license_requests: buyer-org members see their own org's requests; artists
-- see requests tied to projects they OWN (C4 — explicit user_id match, never
-- a bare vault_projects-visible subquery, since migration 078 widened that
-- table's own SELECT to owner-OR-member).
CREATE POLICY "license_requests_select_buyer_org_or_project_owner" ON public.license_requests
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_buyer_org_member(license_requests.buyer_org_id, auth.uid()))
    OR license_requests.vault_project_id IN (
      SELECT id FROM public.vault_projects WHERE user_id = (SELECT auth.uid())
    )
  );

-- license_request_tracks: visible exactly when the parent license_requests
-- row is visible (same buyer-org-or-project-owner scoping, applied via a
-- subquery on license_requests' own primary key — not a self-reference on
-- this table, so no SECURITY DEFINER helper is needed here).
CREATE POLICY "license_request_tracks_select_via_parent_request" ON public.license_request_tracks
  FOR SELECT TO authenticated
  USING (
    license_request_id IN (
      SELECT id FROM public.license_requests
      WHERE (SELECT public.is_buyer_org_member(license_requests.buyer_org_id, auth.uid()))
         OR license_requests.vault_project_id IN (
              SELECT id FROM public.vault_projects WHERE user_id = (SELECT auth.uid())
            )
    )
  );

-- project_license_terms: readable by the owning artist (row scope is
-- simply "this project's terms row, and I own the project") and by any
-- buyer-org member who has (or is about to submit) a request against that
-- project — needed so the buyer portal can show pre-cleared terms before
-- a request exists (D-15's whole point is the buyer sees the bar to clear).
CREATE POLICY "project_license_terms_select_owner_or_buyer" ON public.project_license_terms
  FOR SELECT TO authenticated
  USING (
    vault_project_id IN (
      SELECT id FROM public.vault_projects WHERE user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.buyer_members
      WHERE buyer_members.user_id = (SELECT auth.uid())
    )
  );

-- ─── (f) Write lockdown — every write is server-owned ────────────────────
-- Mirrors migration 056/058's doctrine exactly (RESEARCH Pitfall 3): no
-- client PostgREST write path exists in v1 for any of the three tables.
-- Buyer request creation (16-06), stage/commission/owner mutation (16-07),
-- and pre-cleared-terms authoring (16-04/vault licensing route) all go
-- through validated service-role routes.
-- REVOKE UPDATE is broken out as its own statement per table (rather than
-- folded into a single REVOKE INSERT, UPDATE, DELETE list) so the
-- stage/commission/owner UPDATE lockdown that closes T-16-04/T-16-05 reads
-- as an explicit, individually-auditable line, matching migration 056's
-- `REVOKE INSERT, UPDATE ON dm_threads FROM authenticated` precedent shape.
REVOKE UPDATE ON public.license_requests       FROM authenticated, anon;
REVOKE UPDATE ON public.license_request_tracks FROM authenticated, anon;
REVOKE UPDATE ON public.project_license_terms  FROM authenticated, anon;
REVOKE INSERT, DELETE ON public.license_requests       FROM authenticated, anon;
REVOKE INSERT, DELETE ON public.license_request_tracks FROM authenticated, anon;
REVOKE INSERT, DELETE ON public.project_license_terms  FROM authenticated, anon;

-- ─── (g) Column-level SELECT lockdown (migration 040/058 convention) ─────
-- Row RLS restricts which ROWS a caller sees; it says nothing about which
-- COLUMNS. license_requests deliberately EXCLUDES admin_notes, owner_id,
-- commission_pct, and artist_net_cents from the grant (RESEARCH Pitfall 2)
-- — a buyer may see their own quote in gross_fee_cents but never Funūn's
-- internal economics or negotiation notes. created_by is included so a
-- caller can see who on their own team filed the request (D-13a); it is
-- never used as an authorization boundary (buyer_org_id is).
REVOKE SELECT ON public.license_requests FROM authenticated, anon;
GRANT SELECT (
  id, buyer_org_id, created_by, vault_project_id, usage_types, territories,
  term_months, exclusivity, budget_cents, need_by, buyer_notes, stage,
  matched_precleared, gross_fee_cents, contract_document_id,
  created_at, updated_at
) ON public.license_requests TO authenticated;

REVOKE SELECT ON public.license_request_tracks FROM authenticated, anon;
GRANT SELECT (id, license_request_id, track_id) ON public.license_request_tracks TO authenticated;

-- project_license_terms carries no admin-only columns — the whole row is
-- the artist's own pre-cleared terms, and a buyer needs the full shape to
-- know what bar their request must clear (D-15).
REVOKE SELECT ON public.project_license_terms FROM authenticated, anon;
GRANT SELECT (
  vault_project_id, min_fee_cents, allowed_usage_types, territories,
  exclusivity_allowed, max_term_months, updated_at
) ON public.project_license_terms TO authenticated;
-- updated_by stays private (admin-audit-adjacent field, mirrors migration
-- 058's treatment of artist_profiles.verified_at / migration 080's
-- treatment of buyer_orgs.created_by).

-- ─── (h) Schema-cache reload ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
