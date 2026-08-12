-- ============================================================
-- Funūn — Lane 1 (Brief Builder v2): buyer_briefs persistence
-- Migration 106
--
-- WHY: The Brief Builder (/sync/brief) turns a buyer's free-text project
-- description into a structured brief (creative + deal fields). v1 was
-- ephemeral — draft, apply-to-Crate, re-rank, all in-session. v2 persists a
-- brief when the buyer hits "Send to my AE", so it lands in the buyer's
-- "My Briefs" list and (Lane Engine, next slice) in the assigned AE's feed.
-- Design authority: .planning/design/crate-lead-engine-BUILD-SPEC.md §2.
--
-- WHAT: one table, public.buyer_briefs, modeled on migration 081's
-- license_requests EXACTLY — dual-level attribution (buyer_org_id +
-- created_by), a status pipeline, server-owned writes (INSERT/UPDATE/DELETE
-- REVOKEd from authenticated/anon — every write goes through a validated
-- service-role route), a buyer-arm SELECT policy via the existing
-- public.is_buyer_org_member() helper (migration 080), and a column-level
-- GRANT allowlist. There is NO guest/anonymous brief in this slice: a brief
-- is always tied to a logged-in buyer's org (buyer_org_id + created_by NOT
-- NULL). "Send to my AE" register-gates a guest before it ever reaches here.
--
-- STAFF/AE ACCESS (no policy here, by design): AEs read briefs for the orgs
-- they cover through a staff-gated (requireStaff, lib/admin/gate.ts)
-- service-role route — the same doctrine as the 16-07 admin negotiation
-- queue over license_requests. Service-role reads bypass RLS, so this table
-- needs only the buyer-arm SELECT policy below; the AE coverage predicate
-- (buyer_orgs.ae_user_id = me, or leadership) lives in application code, not
-- RLS. buyer_orgs.ae_user_id stays staff-private (migration 090).
--
-- CONVENTIONS reused verbatim from migrations 080/081:
--  * gen_random_uuid() (NOT uuid_generate_v4() — uuid-ossp is off the
--    migration session search_path; migration 062's first-push failure).
--  * update_updated_at() BEFORE UPDATE trigger (defined migration 001).
--  * public.is_buyer_org_member(uuid, uuid) SECURITY DEFINER helper
--    (migration 080) for the buyer-org SELECT arm — no self-referential
--    recursion here (the policy reads that helper, never buyer_briefs).
--  * Write lockdown + column-level REVOKE/GRANT allowlist (migration
--    040/058/080/081 convention): RLS scopes ROWS, the GRANT scopes COLUMNS.
--
-- HUMAN-GATED — an executor agent must NEVER run `supabase db push` for this
-- migration. The live push against the remote database is a human-gated
-- checkpoint (mirrors migrations 058/062/063/064/066-070/075/076/078/080/
-- 081/089/090's standing "do not push from an agent" convention). The owner
-- reviews and pushes; this file is draft-only. Do NOT edit migrations
-- 080-105 (already landed).
-- ============================================================

-- ─── (a) buyer_briefs ──────────────────────────────────────────────────
create table public.buyer_briefs (
  id            uuid primary key default gen_random_uuid(),
  -- Dual-level attribution (D-13a), exactly as license_requests: the
  -- individual AND the company are always recorded. Both NOT NULL — a brief
  -- is only persisted for a logged-in buyer (guests register-gate first).
  buyer_org_id  uuid references public.buyer_orgs on delete cascade not null,
  created_by    uuid references auth.users not null,
  -- Pipeline the buyer's "My Briefs" list and the AE Lead Engine both read.
  status        text not null default 'new' check (status in (
                  'new',
                  'ae_reviewing',
                  'selects_sent',
                  'in_deal',
                  'licensed',
                  'closed'
                )),
  -- A short human label for the list (server-derived from the brief, e.g.
  -- the intended use); the buyer's original free text; the structured brief.
  title         text,
  prose         text,
  brief         jsonb not null default '{}'::jsonb,
  -- Optional target date (forward-compat: the AI extracts a deadline from
  -- the notes in a later slice; unused today, nullable).
  deadline      date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_buyer_briefs_org_created on public.buyer_briefs (buyer_org_id, created_at desc);

drop trigger if exists buyer_briefs_updated_at on public.buyer_briefs;
create trigger buyer_briefs_updated_at
  before update on public.buyer_briefs
  for each row execute function update_updated_at();

comment on table public.buyer_briefs is
  'Brief Builder v2 (Lane 1): a buyer''s structured project brief, persisted when they "Send to my AE". Modeled on migration 081''s license_requests — dual attribution (buyer_org_id + created_by, both NOT NULL; no guest briefs — guests register-gate first), a status pipeline, and server-owned writes (INSERT/UPDATE/DELETE REVOKEd; every write goes through a validated service-role route). Buyers SELECT their own org''s briefs via RLS (My Briefs); AEs read covered orgs'' briefs through a staff-gated service-role route (bypasses RLS), same doctrine as the 16-07 negotiation queue.';

-- ─── (b) RLS — row scope (buyer arm only) ──────────────────────────────
alter table public.buyer_briefs enable row level security;

-- Buyer-org members see their own org's briefs. Reuses the existing
-- migration 080 SECURITY DEFINER helper (documented as intended for RLS
-- USING clauses wrapped as (SELECT ...)); the policy reads that helper +
-- buyer_briefs' own columns, never buyer_briefs via a subquery, so there is
-- no self-referential recursion (no new helper needed). Staff/AE reads do
-- NOT go through RLS — they use a service-role route, so there is
-- deliberately no staff SELECT policy here.
create policy "buyer_briefs_select_own_org" on public.buyer_briefs
  for select to authenticated
  using ((select public.is_buyer_org_member(buyer_briefs.buyer_org_id, auth.uid())));

-- ─── (c) Write lockdown — every write is server-owned ──────────────────
-- No client PostgREST write path exists: brief creation (POST /api/buyer/
-- briefs) and AE status transitions (Lead Engine service routes) both go
-- through validated service-role routes. A buyer cannot forge a brief onto
-- another org, self-advance status, or delete AE-worked briefs. Mirrors
-- migration 081's per-verb REVOKE shape.
revoke update on public.buyer_briefs from authenticated, anon;
revoke insert, delete on public.buyer_briefs from authenticated, anon;

-- ─── (d) Column-level SELECT lockdown (migration 040/058/081 convention) ─
-- RLS restricts which ROWS a caller sees; it says nothing about COLUMNS.
-- buyer_briefs carries no admin-only columns today — the whole row is the
-- buyer's own brief — but we still REVOKE-then-GRANT an explicit allowlist
-- (matching license_requests) so that if a future admin/AE-only column is
-- added (e.g. an internal AE note) it stays private by default until
-- explicitly GRANTed, rather than leaking through "all columns unless
-- revoked". Nothing is granted to anon — briefs are never public.
revoke select on public.buyer_briefs from authenticated, anon;
grant select (
  id, buyer_org_id, created_by, status, title, prose, brief, deadline,
  created_at, updated_at
) on public.buyer_briefs to authenticated;

-- ─── (e) Schema-cache reload ───────────────────────────────────────────
notify pgrst, 'reload schema';
