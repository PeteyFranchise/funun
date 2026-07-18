-- ============================================================
-- Funūn — Wave 4: The Green Room
-- Migration 058: Require public author profiles for non-owner feed reads
-- Run via: supabase db push
-- ============================================================
-- Migration 057 may already be applied in shared environments. This forward
-- migration reapplies the post visibility helper so private-profile authors do
-- not continue surfacing through feed, comments, reactions, reposts, or post
-- placement destination checks.
-- ============================================================

CREATE OR REPLACE FUNCTION public.green_room_can_view_post(
  p_post_id UUID,
  p_viewer UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.green_room_posts p
    WHERE p.id = p_post_id
      AND p.deleted_at IS NULL
      AND p.moderation_status = 'visible'
      AND p_viewer IS NOT NULL
      AND (
        p.author_id = p_viewer
        OR (
          p.status = 'published'
          AND p.published_at IS NOT NULL
          AND public.no_block(p_viewer, p.author_id)
          AND EXISTS (
            SELECT 1 FROM public.artist_profiles ap
            WHERE ap.id = p.author_id
              AND ap.is_public = true
          )
          AND (
            p.visibility = 'public'
            OR (
              p.visibility = 'followers'
              AND EXISTS (
                SELECT 1 FROM public.follows f
                WHERE f.follower_id = p_viewer
                  AND f.followee_id = p.author_id
              )
            )
            OR (
              p.visibility = 'connections'
              AND EXISTS (
                SELECT 1 FROM public.connections c
                WHERE c.status = 'accepted'
                  AND (
                    (c.requester_id = p_viewer AND c.addressee_id = p.author_id)
                    OR (c.addressee_id = p_viewer AND c.requester_id = p.author_id)
                  )
              )
            )
            OR (
              p.visibility = 'custom'
              AND public.green_room_post_matches_custom_audience(p.id, p_viewer)
            )
          )
        )
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.green_room_can_view_post(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.green_room_can_view_post(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.green_room_can_view_post(uuid, uuid) IS
  'Returns true when a viewer may read a Green Room post. Enforces draft privacy, author publicness for non-owner reads, published visibility, custom audiences, moderation state, deletes, and bidirectional blocks.';
