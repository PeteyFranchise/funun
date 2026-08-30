-- ============================================================
-- Funūn — Phase 37.1 "The Songwriter" (My Catalogue)
-- Migration 136: public.work_members (the guest list), the
--                is_work_owner / work_member_tier SECURITY DEFINER helper
--                pair, EVERY row level security policy for the five tables
--                of this phase's composition layer, and the
--                claimed-collaborator bridge trigger.
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (the standing convention since migrations 058/062/063/064/066/067/070/078,
-- restated in migration 134's own header). This file is authored and
-- text-tested (__tests__/migration-136.test.ts) but must not be applied
-- automatically. The live push is the 37-01 Task 4 blocking checkpoint and
-- the owner performs it. Do NOT edit migrations 001-134 (already landed).
--
-- ─── THIS FILE CARRIES 135's POLICIES, AND THAT IS DELIBERATE ────────────
-- Migration 135 creates public.works, public.work_versions,
-- public.lyric_blocks and public.ai_entries with RLS enabled and no policy
-- on any of them. This file supplies all of them. The two files are one
-- logical unit split only for reviewability and they are pushed together in
-- a single `supabase db push` at one checkpoint, against empty tables that
-- no shipped application code reads yet — so the enabled-but-unreachable
-- state between them is never observable by a user.
--
-- The split cannot run the other way. Every policy below calls
-- public.work_member_tier(), whose body selects from public.work_members —
-- the table THIS file creates. A policy in 135 could not have referenced it.
--
-- ─── WHY A HELPER PAIR AND NOT TWO CROSS-TABLE EXISTS SUBQUERIES ─────────
-- public.works and public.work_members are the same SHAPE of relationship
-- migration 064 already had to fix once for split_sheets ↔
-- split_sheet_parties, and migration 078 had to fix again for
-- vault_projects ↔ project_members: two tables whose row-visibility rules
-- each need to read the other. A naive pair of cross-table
-- `EXISTS (SELECT 1 FROM other_table ...)` policies recurses at PostgreSQL
-- QUERY REWRITE time with SQLSTATE 42P17
-- (`infinite recursion detected in policy for relation "..."`), exactly as
-- migration 018 did. The failure is user-independent — it happens before a
-- single row is examined — so it breaks every authenticated read at once.
--
-- A SECURITY DEFINER function runs as its owner, so RLS is not applied to
-- the tables it reads; the rewriter never expands a policy inside the helper
-- and the cycle is cut. This migration ships that fix from day one rather
-- than rediscovering the recursion in production and patching it afterwards
-- as migration 064 had to. Every call site below wraps the helper as a
-- scalar subselect `(SELECT public.helper(...))` — STABLE plus the
-- subselect wrapper is what lets the planner evaluate it once per statement
-- instead of once per row, and __tests__/migration-136.test.ts asserts the
-- wrapping structurally so a later hand-edit that inlines an EXISTS fails
-- the suite rather than production.
--
-- UUID DEFAULTS: gen_random_uuid(), never uuid_generate_v4() — uuid-ossp
-- lives in the `extensions` schema and is not on the migration session's
-- search_path (migration 062's first push attempt failed on exactly that;
-- migration 078's header records the rule).
-- ============================================================

-- ─── (1) work_members — the guest list ───────────────────────────────────
-- user_id references auth.users directly, matching every other ownership FK
-- in this schema (vault_projects.user_id, project_members.user_id,
-- collaborators.user_id, split_sheet_parties.user_id all reference
-- auth.users, never a profile table).
--
-- user_id is NULLABLE, and that is the point of this table. It is set
-- immediately for the work's owner, and it stays NULL for an invited
-- collaborator who has not signed up yet — a real, expected, long-lived
-- state. Section (4)'s bridge fills it the moment that person claims their
-- roster row at signup. collaborator_id is the inverse: NULL only for the
-- owner's own row, set for every invitee.
--
-- Two PARTIAL unique indexes rather than one composite UNIQUE constraint,
-- because a plain UNIQUE (work_id, user_id) would treat every unclaimed
-- invitee's NULL as distinct and let the same person be added twice, while
-- still failing to constrain the collaborator side at all. The partials
-- constrain each identity axis exactly where it is populated.
--
-- MEMBERSHIP IS NOT SPLITS. A row here grants ACCESS to a work; it does not
-- grant OWNERSHIP of the composition. Being on the work and being on the
-- splits are different facts (doctrine, verbatim), and nothing in this
-- migration promotes a member to a split_sheet_parties row. That promotion
-- happens only when someone is marked a WRITER, in plan 05's route.
CREATE TABLE public.work_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id         UUID REFERENCES public.works ON DELETE CASCADE NOT NULL,
  user_id         UUID REFERENCES auth.users ON DELETE CASCADE,
  collaborator_id UUID REFERENCES public.collaborators ON DELETE SET NULL,
  tier            TEXT NOT NULL CHECK (tier IN ('contribute', 'administer')),
  added_by        UUID REFERENCES auth.users,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_work_members_unique_user
  ON public.work_members (work_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX idx_work_members_unique_collab
  ON public.work_members (work_id, collaborator_id)
  WHERE collaborator_id IS NOT NULL;

CREATE INDEX idx_work_members_work_id ON public.work_members (work_id);
CREATE INDEX idx_work_members_user_id ON public.work_members (user_id);

ALTER TABLE public.work_members ENABLE ROW LEVEL SECURITY;

-- ─── (2) Guest-list write lockdown (migration 078(b)'s exact posture) ────
-- Membership is the capability that lets a person write audio and lyrics
-- into SOMEBODY ELSE'S SONG. It is therefore never writable over raw
-- PostgREST, no matter what the policies say — a policy governs which rows a
-- grant reaches, and the cleaner answer here is to withhold the grant. Every
-- membership write goes through a service-role API route that has already
-- proved the caller's tier on this specific work (plan 05). This is the same
-- decision migration 078 made for project_members and migration 042 made for
-- capability_grants.
REVOKE INSERT, UPDATE, DELETE ON public.work_members FROM authenticated, anon;

-- ─── (3) The SECURITY DEFINER helper pair ────────────────────────────────
-- Copies migration 078's proven shape exactly, which in turn copies
-- migration 064's. Both take the user id as a PARAMETER rather than calling
-- auth.uid() internally, so `SET search_path = ''` does not have to reach
-- into the auth schema — the same shape as public.no_block() (035) and
-- is_split_sheet_initiator / is_split_sheet_party (064). STABLE lets the
-- planner cache the result within a single statement when the policy wraps
-- the call as (SELECT ...), which every policy below does.
CREATE OR REPLACE FUNCTION public.is_work_owner(p_work_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.works
    WHERE id = p_work_id AND user_id = p_uid
  )
$$;

CREATE OR REPLACE FUNCTION public.work_member_tier(p_work_id UUID, p_uid UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tier FROM public.work_members
  WHERE work_id = p_work_id AND user_id = p_uid
$$;

-- These two ARE invoked from RLS policy bodies as the querying role, so they
-- need GRANT EXECUTE TO authenticated — migration 064/078's grant-back
-- posture, not migration 070's revoke-only posture (which is correct for
-- trigger-internal functions like section (4)'s). anon has no legitimate
-- catalogue access and must not be handed a SECURITY DEFINER oracle for
-- "does user X own / hold a tier on work Y".
REVOKE EXECUTE ON FUNCTION public.is_work_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_work_owner(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.work_member_tier(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.work_member_tier(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.is_work_owner(uuid, uuid) IS
  'True when uid owns the given work. SECURITY DEFINER so it can be called from work_members'' RLS policy without re-entering works'' own policies (would recurse with 42P17 — see migrations 064 and 078, whose precedent this reapplies). Intended for RLS policy USING clauses wrapped as (SELECT ...), not a client-invoked RPC.';

COMMENT ON FUNCTION public.work_member_tier(uuid, uuid) IS
  'Returns uid''s tier on the given work (contribute/administer), or NULL if not a member. SECURITY DEFINER so it can be called from works'' and its child tables'' RLS policies without re-entering work_members'' own policies (would recurse with 42P17). NULL means "not a member" and is the value every SELECT policy tests against. Intended for RLS policy USING clauses wrapped as (SELECT ...), not a client-invoked RPC.';

-- ─── (4) Policies for all five tables ────────────────────────────────────
--
-- WHAT THE TWO TIERS MEAN IN 37.1, stated so the shape below is not read as
-- an omission. Both tiers may add versions, edit lyric blocks and file AI
-- entries. That is exactly what CONTRIBUTE means in the doctrine — play the
-- versions, add your own iterations (uploads and hum-it-in takes), edit the
-- pad, annotate the diary. ADMINISTER is NOT a row-write distinction in this
-- phase. It gates MEMBERSHIP changes, and membership is already unwritable
-- over PostgREST by section (2)'s revoke, so that gate is enforced in plan
-- 05's service-role route rather than in a policy here.
--
-- In 37.2 administer additionally gates the money and release doors — the
-- graduation to a release project and the execution of the split sheet.
-- Those doors will need their own administer-only gate, most naturally an
-- UPDATE policy on works that is stricter for graduated_project_id than the
-- one below is for title. Leaving both tiers writable on the CONTENT tables
-- today is a deliberate decision, not an oversight.

-- work_members: least privilege. A contributor sees their own row (enough to
-- render "you're a contributor on this song"); the owner sees the whole
-- guest list, because the owner manages it.
CREATE POLICY "work_members_select" ON public.work_members
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT public.is_work_owner(work_id, auth.uid()))
  );

-- works: SELECT and UPDATE widen to any member; INSERT is self-only; DELETE
-- stays with the owner. Deleting a song is not a contribution.
CREATE POLICY "works_select_owner_or_member" ON public.works
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.work_member_tier(id, auth.uid())) IS NOT NULL
  );

CREATE POLICY "works_update_owner_or_member" ON public.works
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.work_member_tier(id, auth.uid())) IS NOT NULL
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.work_member_tier(id, auth.uid())) IS NOT NULL
  );

CREATE POLICY "works_insert_own" ON public.works
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "works_delete_owner_only" ON public.works
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- work_versions / lyric_blocks / ai_entries: access resolves through
-- work_id, NEVER through the row's own user_id / created_by /
-- author_user_id. That conflation is migration 078's Pitfall 1 — today a
-- child row's creator always equals the work's owner because only the owner
-- has ever written one, and the instant a second writer exists the
-- conflation breaks visibility in both directions.
CREATE POLICY "work_versions_select_owner_or_member" ON public.work_versions
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_work_owner(work_id, auth.uid()))
    OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
  );

CREATE POLICY "work_versions_write_owner_or_member" ON public.work_versions
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_work_owner(work_id, auth.uid()))
    OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
  )
  WITH CHECK (
    (SELECT public.is_work_owner(work_id, auth.uid()))
    OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
  );

CREATE POLICY "lyric_blocks_select_owner_or_member" ON public.lyric_blocks
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_work_owner(work_id, auth.uid()))
    OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
  );

CREATE POLICY "lyric_blocks_write_owner_or_member" ON public.lyric_blocks
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_work_owner(work_id, auth.uid()))
    OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
  )
  WITH CHECK (
    (SELECT public.is_work_owner(work_id, auth.uid()))
    OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
  );

CREATE POLICY "ai_entries_select_owner_or_member" ON public.ai_entries
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_work_owner(work_id, auth.uid()))
    OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
  );

CREATE POLICY "ai_entries_write_owner_or_member" ON public.ai_entries
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_work_owner(work_id, auth.uid()))
    OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
  )
  WITH CHECK (
    (SELECT public.is_work_owner(work_id, auth.uid()))
    OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
  );

-- ─── (5) The claimed-collaborator bridge ─────────────────────────────────
-- A work_members row can exist for a person who has not signed up yet
-- (user_id NULL, collaborator_id set). This trigger fills user_id the moment
-- they claim their roster row at signup, and it is the ONLY thing in this
-- phase that grants access to a work as a side effect of somebody else's
-- action — which is why the signal it keys off matters more than the code.
--
-- IT KEYS OFF collaborators.claimed_by AND NOTHING ELSE. Migration 079's
-- header is the authority: split_sheet_parties.user_id reads naturally as
-- the identity column and is a DEAD SIGNAL — READ in three places in this
-- codebase and WRITTEN nowhere (not the create route, not the PATCH route,
-- not /api/approve/[token], not any migration or trigger). The only LIVE
-- verified-identity signal in this codebase is collaborators.claimed_by, set
-- exclusively by claim_collaborators() (migrations 026/072/076) on signup,
-- via a case-insensitive match against the signing-up user's own,
-- Supabase-Auth-verified account email — never a party's free-typed email
-- field. That is what "verified identity" already operationally means in
-- Funūn, and backfilling membership off anything weaker would hand somebody
-- write access to another artist's song on the strength of a typed string.
--
-- ONE FIRE SITE, NOT THREE. Migration 079 needed three, because a
-- split_sheet_party can be linked to a project before or after either side
-- exists and the grant has to be correct under every ordering. A
-- work_members row always carries collaborator_id AT CREATION TIME — plan
-- 05's invite route picks or creates the roster collaborator first, then
-- inserts the membership row — so the only ordering that can leave user_id
-- unfilled is "membership created, claim happens later", and this single
-- trigger covers it.
--
-- IDEMPOTENT: `AND user_id IS NULL` means a re-fire, a re-claim, or a
-- claimed_by value being rewritten never overwrites a membership row that
-- already resolved to a real account.
CREATE OR REPLACE FUNCTION public.sync_work_membership_on_claim()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.work_members
  SET user_id = NEW.claimed_by
  WHERE collaborator_id = NEW.id
    AND user_id IS NULL;

  RETURN NEW;
END;
$$;

-- Trigger-internal only — no app code calls this directly, and no RLS policy
-- body invokes it, so it follows migration 070/079's revoke-only posture
-- rather than section (3)'s grant-back posture. Called bare as an RPC it does
-- nothing useful (NEW is only meaningful inside an actual trigger firing);
-- revoking the default PostgREST exposure keeps it from being probed at all.
REVOKE EXECUTE ON FUNCTION public.sync_work_membership_on_claim() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sync_work_membership_on_claim() IS
  'Backfills work_members.user_id when a collaborator claims their roster row at signup. Keys exclusively off collaborators.claimed_by — the ONLY verified-identity signal in this codebase (set by claim_collaborators() from the signing-up user''s Supabase-Auth-verified account email), never off split_sheet_parties.user_id, which is read in three places and written nowhere. SECURITY DEFINER so it can write work_members on behalf of a different user than whoever triggered it, and because migration 136 revokes all client writes on that table by design. Idempotent via the user_id IS NULL guard. Trigger-internal only, never a client-invoked RPC.';

-- WHEN guard: only fire when claimed_by actually transitions, not merely
-- because it appeared in the SET clause of a no-op UPDATE (migration 079's
-- convention).
DROP TRIGGER IF EXISTS sync_work_membership_on_claim ON public.collaborators;
CREATE TRIGGER sync_work_membership_on_claim
  AFTER UPDATE OF claimed_by ON public.collaborators
  FOR EACH ROW
  WHEN (NEW.claimed_by IS DISTINCT FROM OLD.claimed_by)
  EXECUTE FUNCTION public.sync_work_membership_on_claim();

-- ─── (6) Schema-cache reload ─────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
