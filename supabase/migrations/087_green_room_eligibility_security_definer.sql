-- ============================================================
-- Funūn — Phase 28 (corrective): Green Room INSERT RLS via a SECURITY DEFINER
-- eligibility helper. Migration 087.
--
-- WHY: migration 085's green_room_posts_insert_own policy hand-wrote an INLINE
-- EXISTS subquery against user_profiles inside the RLS WITH CHECK. Live smoke
-- testing showed the policy rejects even a valid artist whose author_id =
-- auth.uid() and whose member_type is 'artist' — the standalone EXISTS returns
-- true, yet the INSERT is denied 42501. This repo deliberately routes cross-table
-- RLS checks through SECURITY DEFINER helper functions (no_block m035,
-- is_buyer_org_member m080, is_project_owner/project_member_role m078) precisely
-- to avoid this class of nested-RLS-in-policy evaluation problem. 085 broke that
-- convention with an inline subquery; this migration restores it.
--
-- WHAT: add is_green_room_eligible(uid) — a SECURITY DEFINER STABLE helper that
-- mirrors is_buyer_org_member's exact shape — and rewrite the INSERT policy to
-- call it instead of the inline subquery. Same member_type rule (artist|industry)
-- and same author_id = auth.uid() ownership check; only the eligibility lookup
-- moves into the helper. green_room_posts_update_own is untouched.
--
-- HUMAN-GATED — never `supabase db push` from an agent (matches Phases
-- 16/21/25/28's standing convention). Draft + text-tested; the owner reviews and
-- pushes via Codex. Do NOT edit migration 085 (already landed).
-- ============================================================

-- ─── (a) SECURITY DEFINER eligibility helper (mirrors is_buyer_org_member) ──
CREATE OR REPLACE FUNCTION public.is_green_room_eligible(p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = p_uid AND member_type IN ('artist', 'industry')
  )
$$;

-- Intended for use inside the RLS INSERT WITH CHECK, not as a client RPC. Revoke
-- the blanket PostgREST RPC exposure every public-schema function gets by default,
-- then grant back only to authenticated (anon has no legitimate Green Room post
-- access). Mirrors migration 035/064/078/080.
REVOKE EXECUTE ON FUNCTION public.is_green_room_eligible(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_green_room_eligible(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_green_room_eligible(uuid) IS
  'True when the profile is an artist or industry account (Green Room posting eligibility). SECURITY DEFINER so it can be called from green_room_posts'' INSERT WITH CHECK without hitting the nested-RLS-subquery evaluation problem migration 085''s inline EXISTS tripped — see the repo''s is_buyer_org_member (m080) / no_block (m035) precedent. RLS use only, not a client RPC.';

-- ─── (b) Rewrite the INSERT policy to use the helper (no inline subquery) ────
-- Replaces (DROP + single CREATE, not stacked) the member_type gate migration
-- 085 added; keeps author_id = auth.uid(). green_room_posts_update_own untouched.
DROP POLICY IF EXISTS "green_room_posts_insert_own" ON green_room_posts;

CREATE POLICY "green_room_posts_insert_own" ON green_room_posts FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_green_room_eligible(auth.uid())
  );
