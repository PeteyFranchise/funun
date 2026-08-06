-- ============================================================
-- Funūn — Phase 28 (corrective): let authors read their own just-inserted row so
-- Green Room INSERT ... RETURNING stops failing 42501. Migration 088.
--
-- WHY: the app creates a post with
--   supabase.from('green_room_posts').insert(...).select(...).single()
-- i.e. INSERT ... RETURNING. PostgreSQL applies the table's SELECT policy to the
-- row a RETURNING clause hands back, and the live SELECT policy is
--   USING ( public.green_room_can_view_post(id, auth.uid()) ).
-- green_room_can_view_post is LANGUAGE sql STABLE and RE-QUERIES green_room_posts
-- for the row (it reads moderation_status / visibility / author_id off the stored
-- tuple). Inside the SAME INSERT command, that STABLE re-query's snapshot does not
-- yet contain the row being inserted, so it finds nothing -> the function returns
-- false -> the RETURNING is rejected 42501, EVEN THOUGH the INSERT WITH CHECK
-- (085/087: author_id = auth.uid() AND is_green_room_eligible) evaluated true.
--
-- Live smoke proved this precisely: in the artist's own authenticated session,
-- auth.uid() = the author, member_type = 'artist', is_green_room_eligible = true,
-- and there is no RESTRICTIVE / stacked INSERT policy — yet the insert still 42501s.
-- The eligibility work in 085/087 was correct but ORTHOGONAL; this SELECT-on-
-- RETURNING path is the actual blocker and has been latent since the policy's
-- introduction (057/059), first exercised end-to-end by Phase 28's smoke.
--
-- WHAT: rewrite green_room_posts_select_visible to affirm the author's own
-- (non-deleted) row via a DIRECT column predicate — author_id = auth.uid() —
-- evaluated on the row itself with NO re-query, so it holds for the just-inserted
-- tuple during RETURNING. All other-viewer visibility still flows through
-- green_room_can_view_post unchanged. This only ever GRANTS an author sight of
-- their own posts (which the function's own p.author_id = p_viewer branch already
-- intends); it removes no visibility. The INSERT policy is untouched, so the
-- buyer / @funun-staff rejections (085/087 WITH CHECK + app-layer gate) are
-- unaffected — a buyer never passes the INSERT WITH CHECK to reach RETURNING.
--
-- HUMAN-GATED — never `supabase db push` from an agent (matches Phases
-- 16/21/25/28's standing convention). Draft + text-tested; the owner reviews and
-- pushes via Codex. Do NOT edit migrations 085/086/087 (already landed).
-- ============================================================

-- Replace (DROP + single CREATE, not stacked) the SELECT policy. Same
-- green_room_can_view_post gate for every other viewer; add a re-query-free
-- author short-circuit so the author can read their own non-deleted row —
-- including the tuple a RETURNING clause returns from their own INSERT.
DROP POLICY IF EXISTS "green_room_posts_select_visible" ON green_room_posts;

CREATE POLICY "green_room_posts_select_visible" ON green_room_posts FOR SELECT TO authenticated
  USING (
    (author_id = auth.uid() AND deleted_at IS NULL)
    OR public.green_room_can_view_post(id, auth.uid())
  );
