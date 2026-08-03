-- ============================================================
-- Funūn — Wave 4 follow-on: Phase 16 GTM Beta Launch & Buyer Portal
-- Migration 080: buyer_orgs + buyer_members + handle_new_user buyer branch
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push against the remote database is a human-gated checkpoint
-- (mirrors migrations 058/062/063/064/066-070/075/076/078's "do not push
-- from an executor agent" convention) — the checkpoint task in this plan
-- (16-01) owns the push, `supabase migration list` confirmation, and the
-- phantom-row sanity query.
--
-- UUID DEFAULTS: both tables use gen_random_uuid(), NOT uuid_generate_v4()
-- — uuid-ossp lives in the `extensions` schema and is not on the migration
-- session's search_path (migration 062's first push failure; reapplied in
-- 078). Every function below also carries SET search_path = '' with
-- fully-qualified public.* references for the same search-path-hijacking
-- reason (migration 035/064/078 precedent) — EXCEPT handle_new_user()
-- itself, which intentionally carries none, matching its live body
-- (migration 076's own note: every reference in that function is already
-- fully public-qualified, so nothing resolves through search_path; adding
-- the clause here would be an out-of-scope security-semantics change on a
-- migration whose only job is to add one early-return branch).
--
-- Security posture (D-11/D-13/D-13a/D-14, RESEARCH Patterns 1/3):
-- - Buyer accounts are FULLY SEPARATE from user_profiles (D-11/D-04): the
--   handle_new_user() buyer branch below is an early RETURN NEW, positioned
--   before the industry/default branches, with NO user_profiles insert and
--   NO subscriptions insert — the exact curator-early-return shape, guarding
--   against the phantom-row bug class this repo has already fixed twice
--   (curator branch, industry branch — RESEARCH Pitfall 1).
-- - Every buyer belongs to exactly one buyer_org (D-13); solo buyers get an
--   auto-created personal org (is_personal = true) where they are admin —
--   one data model, no special cases. That provisioning logic lives in
--   lib/buyers/org.ts + the admin/invite routes (plan 16-03), not here.
-- - Admin-created orgs are BORN VERIFIED (D-14): buyer_orgs.verified
--   defaults true, members inherit org verification — there is no
--   per-member verification flow or column.
-- - Two permission tiers only (D-13): buyer_role is a hard CHECK constraint
--   of 'requester'/'approver'. is_org_admin marks the approver who manages
--   members; org admins are always approvers (enforced in lib/buyers/
--   permissions.ts, not the database — the DB only guarantees the tier
--   value itself, application logic guarantees admins hold approver).
-- - Server-owned writes (migrations 040/056/058 doctrine): RLS row-scope
--   restricts SELECT to the caller's own org; a companion column-level
--   REVOKE/GRANT restricts which columns are readable even on permitted
--   rows; INSERT/UPDATE/DELETE are revoked from authenticated/anon entirely
--   — every write (org creation, member invite, role change) goes through a
--   service-role route (plan 16-03), never direct PostgREST.
-- - Self-referential RLS recursion (migration 064/078 precedent): a naive
--   `org_id IN (SELECT org_id FROM buyer_members WHERE user_id = auth.uid())`
--   policy directly on buyer_members would re-enter buyer_members' own SELECT
--   policy during query rewrite and fail with 42P17 "infinite recursion
--   detected in policy for relation" for every caller, exactly as migration
--   018 did for split_sheets/split_sheet_parties. This migration ships the
--   SECURITY DEFINER helper fix (is_buyer_org_member()) from day one rather
--   than discovering the recursion in production, mirroring 078's
--   is_project_owner()/project_member_role() pair.
-- ============================================================

-- ─── (a) buyer_orgs ────────────────────────────────────────────────────
create table public.buyer_orgs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  is_personal  boolean not null default false,
  verified     boolean not null default true,
  verified_at  timestamptz default now(),
  created_by   uuid references auth.users,
  created_at   timestamptz not null default now()
);

comment on table public.buyer_orgs is
  'Phase 16 buyer identity (D-11/D-12/D-14): the company/org layer for sync buyers, fully separate from user_profiles. Admin-created orgs are born verified (verified defaults true) — beta has no per-member verification flow, members inherit org verification. is_personal marks a solo buyer''s auto-created single-member org (D-13). All writes are server-owned; see the REVOKE below.';

-- ─── (b) buyer_members ─────────────────────────────────────────────────
create table public.buyer_members (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references public.buyer_orgs on delete cascade not null,
  user_id      uuid references auth.users on delete cascade not null,
  buyer_role   text not null check (buyer_role in ('requester', 'approver')),
  is_org_admin boolean not null default false,
  invited_by   uuid references auth.users,
  created_at   timestamptz not null default now(),
  unique (org_id, user_id)
);

create index idx_buyer_members_user_id on public.buyer_members (user_id);

comment on table public.buyer_members is
  'Org membership + permission tier for buyer accounts (D-13/D-13a). Two tiers only: requester (browse + submit requests) and approver (requester rights + approve terms/budget + sign-off) — enforced by the CHECK constraint and by lib/buyers/permissions.ts. is_org_admin marks the approver who manages members; org admins are always approvers by application-level convention, not a DB constraint. Every request/deal records both user_id and org_id so activity is dual-attributable. All writes are server-owned; see the REVOKE below.';

-- ─── (c) handle_new_user() — buyer early-return branch ──────────────────
-- Rebased on the CURRENT LIVE body (migration 076, user_profiles) — NOT
-- migration 039 (superseded; still named the pre-rename artist_profiles
-- table, which migration 077 dropped). Confirmed no migration between 076
-- and 079 redefines this function. Curator early-return, industry branch,
-- and default branch below are preserved verbatim from 076, including its
-- deliberate absence of `SET search_path = ''` (076's own note: every
-- reference in the body is already fully public-qualified). Only the new
-- buyer branch is added, positioned immediately after the curator branch
-- and before the industry/default branches — RETURN NEW immediately, with
-- NO user_profiles insert and NO subscriptions insert.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  if (new.raw_app_meta_data->>'role') = 'curator' then
    return new;
  end if;

  -- Buyer branch (Phase 16, D-11/D-04): buyers are a fully separate
  -- account type, mirroring the curator early-return exactly — RETURN NEW
  -- immediately with NO user_profiles insert and NO subscriptions insert.
  -- Positioned before the industry/default branches so a buyer signup can
  -- never fall through to the user_profiles insert (the phantom-row bug
  -- class this repo has already fixed twice — RESEARCH Pitfall 1).
  if (new.raw_app_meta_data->>'role') = 'buyer' then
    return new;
  end if;

  -- Industry branch (D-01/D-03 resolved, migration 039; re-pointed to
  -- user_profiles by migration 076). Unlike the curator/buyer branches, an
  -- industry member DOES get a real profile row (never a bare RETURN NEW),
  -- just built without claim_collaborators() (that flow is artist-only).
  if (new.raw_app_meta_data->>'role') = 'industry' then
    insert into public.user_profiles (id, member_type, artist_name, industry_roles, roles)
    values (
      new.id,
      'industry',
      new.raw_user_meta_data->>'display_name',
      array(select jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'role_badges', '[]'::jsonb))),
      coalesce(new.raw_user_meta_data->'profile_roles', '[]'::jsonb)
    );

    -- D-18: industry members DO get a free subscriptions row, same as
    -- artists. Wrapped in the same nested exception-isolation pattern as
    -- the artist branch's claim_collaborators call below so a
    -- secondary-insert failure cannot orphan the profile row just
    -- created above (mirrors CR-04 / migration 027).
    begin
      insert into public.subscriptions (user_id, tier, status)
      values (new.id, 'free', 'active');
    exception when others then
      null; -- swallow subscription-insert errors; account creation continues
    end;

    return new;
  end if;

  insert into public.user_profiles (id) values (new.id);
  insert into public.subscriptions (user_id, tier, status)
  values (new.id, 'free', 'active');

  -- Phase 4: claim any collaborator rows matching this user's email.
  -- Wrapped in a nested exception block so a claim failure cannot orphan
  -- the new account by rolling back the two inserts above (CR-04).
  begin
    perform public.claim_collaborators(new.id, new.email);
  exception when others then
    null; -- swallow claim errors; account creation continues
  end;

  return new;
end;
$$ language plpgsql security definer;

-- ─── (d) SECURITY DEFINER helper — breaks the buyer_members self-join
--         recursion (migration 064/078 precedent) ───────────────────────
-- Takes the user id as a parameter rather than calling auth.uid()
-- internally so SET search_path = '' does not have to reach into the auth
-- schema (same shape as no_block() in migration 035 and is_project_owner()/
-- project_member_role() in migration 078). STABLE lets the planner cache
-- the result within a single statement when the policy wraps the call as
-- (SELECT ...). SECURITY DEFINER means this runs as the table owner, which
-- bypasses buyer_members' own RLS when queried from inside the function —
-- that is what cuts the recursion, not the self-reference itself.
create or replace function public.is_buyer_org_member(p_org_id uuid, p_uid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.buyer_members
    where org_id = p_org_id and user_id = p_uid
  )
$$;

-- Intended for use inside RLS policy USING clauses, not as a client RPC.
-- Revoke the blanket PostgREST RPC exposure every function in the public
-- schema gets by default, then grant back only to authenticated — anon has
-- no legitimate buyer-org access and must not get a SECURITY DEFINER oracle
-- for "is user X a member of org Y". Mirrors migration 035/064/078.
REVOKE EXECUTE ON FUNCTION public.is_buyer_org_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_buyer_org_member(uuid, uuid) TO authenticated;

comment on function public.is_buyer_org_member(uuid, uuid) is
  'True when uid is a member of the given buyer org. SECURITY DEFINER so it can be called from buyer_members'' own RLS policy (and buyer_orgs'' policy) without re-entering buyer_members'' policies, which would recurse — see migration 064/078''s precedent, reapplied here for Phase 16. Intended for RLS policy USING clauses wrapped as (SELECT ...), not a client-invoked RPC.';

-- ─── (e) RLS — row scope ─────────────────────────────────────────────────
alter table public.buyer_orgs enable row level security;
alter table public.buyer_members enable row level security;

create policy "buyer_members_select_own_org" on public.buyer_members
  for select to authenticated
  using ((select public.is_buyer_org_member(buyer_members.org_id, auth.uid())));

create policy "buyer_orgs_select_own_org" on public.buyer_orgs
  for select to authenticated
  using ((select public.is_buyer_org_member(buyer_orgs.id, auth.uid())));

-- ─── (f) Write lockdown — every write is server-owned ────────────────────
-- No INSERT/UPDATE/DELETE policy exists for either table in v1: org
-- creation, the first org-admin invite, and every subsequent member invite/
-- role change/removal go through a service-role route (plan 16-03), never
-- direct PostgREST. A buyer cannot self-promote to approver or org admin,
-- cannot create their own org, and cannot rename/reverify an org.
REVOKE INSERT, UPDATE, DELETE ON public.buyer_orgs FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.buyer_members FROM authenticated, anon;

-- ─── (g) Column-level SELECT lockdown (migration 040/058 convention) ─────
-- Row RLS restricts which ROWS a caller sees; it says nothing about which
-- COLUMNS. Both REVOKE-then-GRANT an explicit allowlist so a session client
-- cannot read admin/audit-only columns via direct PostgREST even on rows it
-- is otherwise permitted to see. Neither table grants anon anything — buyer
-- org/member data is never public (D-05).
REVOKE SELECT ON public.buyer_orgs FROM authenticated, anon;
GRANT SELECT (id, name, is_personal, verified, created_at)
  ON public.buyer_orgs TO authenticated;
-- verified_at and created_by stay private (admin-audit fields, mirrors
-- migration 058's treatment of artist_profiles.verified_at).

REVOKE SELECT ON public.buyer_members FROM authenticated, anon;
GRANT SELECT (id, org_id, user_id, buyer_role, is_org_admin, created_at)
  ON public.buyer_members TO authenticated;
-- invited_by stays private (admin-audit field, same treatment as above).

-- ─── (h) Schema-cache reload ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
