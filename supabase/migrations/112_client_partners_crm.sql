-- ============================================================
-- Funūn — Phase 31 Slice 1 (AE Client Workspace + Selects)
-- Migration 112: CRM-lite people layer — buyer_org_contacts,
--                 client_relationship_log, buyer_orgs.website
--
-- WHY: My Client Partners (31-CONTEXT.md) needs a real, multiple-contact,
-- one-flagged-primary people layer per buyer org (D-08/D-09) plus a
-- lightweight relationship log for notes/conversations (Slice 1) and
-- assignment entries (Slice 2). buyer_orgs already carries a SINGLE legacy
-- contact captured at signup (migration 095's contact_name/contact_email/
-- contact_phone/contact_role) — that is NOT this CRM layer and is
-- reconciled explicitly below (31-RESEARCH.md Pitfall 6), not silently.
--
-- WHAT: two new tables, both staff-only (RLS enabled, ZERO policies, full
-- REVOKE from authenticated/anon — mirrors migration 089's zero-RLS-policy
-- shape; no buyer ever reads contacts/log directly), plus one additive
-- column on buyer_orgs:
--   1. buyer_org_contacts — a rich, export-friendly contact record
--      (title/email/phone/linkedin_url/timezone/tags/address/notes/
--      custom_fields), with a partial unique index enforcing AT MOST ONE
--      is_primary row per org (D-08/D-09).
--   2. client_relationship_log — org-scoped notes/conversations (kind =
--      'note'/'conversation' this slice) and assignment entries (kind =
--      'assignment', Slice 2), authored by a staff user, optionally
--      pointed at a specific contact.
--   3. buyer_orgs.website — additive text column.
--
-- COLUMN-PRIVILEGE DOCTRINE (Pitfall 6 / migration 090's own precedent,
-- reapplied by migration 095): a new column is private by default. website
-- is deliberately NOT added to migration 080's authenticated GRANT SELECT
-- allowlist in this migration — Postgres column grants are additive
-- (095 proved this: it extended 080's list without restating it), so
-- omitting website here is sufficient to keep it staff-only; it can be
-- opted in later via its own explicit GRANT SELECT (website) statement if
-- the buyer portal ever needs to display it.
--
-- LEGACY RECONCILIATION (31-RESEARCH.md Pitfall 6 — stated, not silent):
-- buyer_orgs.contact_name/contact_email/contact_phone (migration 095) is a
-- SINGLE legacy contact captured at signup, NOT this CRM layer. The
-- backfill below (section d) copies that single legacy contact into ONE
-- new buyer_org_contacts row per org (is_primary = true) wherever any of
-- those three legacy columns is non-null. This is non-destructive: the
-- legacy buyer_orgs.contact_* columns are left fully intact (A4 —
-- owner-confirm at push; if the owner wants an empty start instead, they
-- say so at the 31-02 Task 3 checkpoint and this INSERT is skipped/reverted
-- before push).
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (matches Phases 16/21/25/28/32's standing convention). Draft + text-
-- tested only (__tests__/migration-112.test.ts); the owner reviews and
-- pushes via `supabase db push` at the 31-02 Task 3 checkpoint. Do NOT
-- edit migrations 001-111 (already landed).
-- ============================================================

-- ─── (a) buyer_org_contacts ───────────────────────────────────────────────
CREATE TABLE public.buyer_org_contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_org_id  UUID NOT NULL REFERENCES public.buyer_orgs ON DELETE CASCADE,
  name          TEXT NOT NULL,
  title         TEXT,
  email         TEXT,
  phone         TEXT,
  linkedin_url  TEXT,
  timezone      TEXT,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  address       JSONB,
  notes         TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- D-08: multiple contacts per org, at most one flagged primary.
CREATE UNIQUE INDEX buyer_org_contacts_one_primary_per_org
  ON public.buyer_org_contacts (buyer_org_id)
  WHERE is_primary;

CREATE INDEX idx_buyer_org_contacts_org ON public.buyer_org_contacts (buyer_org_id);

DROP TRIGGER IF EXISTS buyer_org_contacts_updated_at ON public.buyer_org_contacts;
CREATE TRIGGER buyer_org_contacts_updated_at
  BEFORE UPDATE ON public.buyer_org_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.buyer_org_contacts IS
  'Phase 31 Slice 1 (D-08/D-09): a rich, export-friendly contact record for My Client Partners. Multiple contacts per org, at most one flagged is_primary (partial unique index). Staff-only — no buyer ever reads this table directly. Reconciled with migration 095''s legacy buyer_orgs.contact_* single-contact fields via a one-time backfill below (section d) — legacy columns are left intact.';

-- ─── (b) client_relationship_log ──────────────────────────────────────────
CREATE TABLE public.client_relationship_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_org_id   UUID NOT NULL REFERENCES public.buyer_orgs ON DELETE CASCADE,
  contact_id     UUID REFERENCES public.buyer_org_contacts ON DELETE SET NULL,
  author_user_id UUID NOT NULL REFERENCES auth.users,
  kind           TEXT NOT NULL DEFAULT 'note' CHECK (kind IN (
                    'note', 'conversation', 'status_change', 'assignment'
                  )),
  body           TEXT,
  meta           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_relationship_log_org_created
  ON public.client_relationship_log (buyer_org_id, created_at DESC);

COMMENT ON TABLE public.client_relationship_log IS
  'Org-scoped notes/conversations (Slice 1: kind = note/conversation) and assignment entries (Slice 2: kind = assignment/status_change). Every entry is authored by a staff user (author_user_id) and optionally pointed at a specific buyer_org_contacts row. Staff-only — no buyer ever reads this table directly.';

-- ─── (c) buyer_orgs.website ────────────────────────────────────────────────
ALTER TABLE public.buyer_orgs ADD COLUMN website TEXT;

COMMENT ON COLUMN public.buyer_orgs.website IS
  'Phase 31 Slice 1: the client org''s website, for the My Client Partners detail view. Staff-only — deliberately NOT added to migration 080''s authenticated GRANT SELECT allowlist (Pitfall 6 / migration 090''s column-privilege doctrine: a new column is private by default, an explicit opt-in GRANT is required to expose it to the buyer portal).';

-- ─── (d) Legacy backfill — buyer_orgs.contact_* -> first primary contact ──
-- One-time, non-destructive: inserts exactly one buyer_org_contacts row
-- (is_primary = true) per existing buyer_orgs row that has any of
-- contact_name/contact_email/contact_phone (migration 095) set, copying
-- those three values into name/email/phone. The legacy buyer_orgs.contact_*
-- columns are NOT dropped or cleared by this migration — they remain the
-- historical lead-capture record (A4). Guarded by a NOT EXISTS so re-running
-- this migration file (or ever pairing it with a future backfill) cannot
-- double-insert a second primary row for the same org.
INSERT INTO public.buyer_org_contacts (buyer_org_id, name, email, phone, is_primary)
SELECT
  bo.id,
  COALESCE(bo.contact_name, bo.contact_email, 'Primary contact'),
  bo.contact_email,
  bo.contact_phone,
  true
FROM public.buyer_orgs bo
WHERE (bo.contact_name IS NOT NULL OR bo.contact_email IS NOT NULL OR bo.contact_phone IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.buyer_org_contacts boc
    WHERE boc.buyer_org_id = bo.id AND boc.is_primary
  );

-- ─── (e) RLS — staff-only, zero policies (mirrors migration 089) ─────────
ALTER TABLE public.buyer_org_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_relationship_log ENABLE ROW LEVEL SECURITY;

-- No policies are created for either table. An RLS-enabled table with zero
-- policies denies ALL row access to authenticated/anon by construction —
-- combined with the REVOKE below, both tables are reachable ONLY via the
-- service role from requireStaff-gated routes.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.buyer_org_contacts FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.client_relationship_log FROM authenticated, anon;

-- ─── (f) Schema-cache reload ──────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
