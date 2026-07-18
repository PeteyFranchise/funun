-- ============================================================
-- Funūn — Wave 4: The Green Room
-- Migration 060: interaction block visibility + custom-audience role parity
-- Run via: supabase db push
-- ============================================================
-- Migration 057 may already be applied in shared environments. This
-- forward migration aligns database enforcement with the app contract by:
-- 1. letting custom-audience role rules match BOTH artist_profiles.roles
--    (preset slugs + custom labels) and industry_roles
-- 2. hiding comments/reactions/reposts from viewers blocked in either
--    direction with the interaction author, even on shared third-party posts
-- ============================================================

CREATE OR REPLACE FUNCTION public.green_room_post_matches_custom_audience(
  p_post_id UUID,
  p_viewer UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.green_room_post_audiences a
    LEFT JOIN public.artist_profiles ap ON ap.id = p_viewer
    WHERE a.post_id = p_post_id
      AND p_viewer IS NOT NULL
      AND (
        p_viewer = ANY(a.people)
        OR (
          'followers' = ANY(a.relationships)
          AND EXISTS (
            SELECT 1 FROM public.follows f
            WHERE f.follower_id = p_viewer
              AND f.followee_id = (SELECT p.author_id FROM public.green_room_posts p WHERE p.id = p_post_id)
          )
        )
        OR (
          'connections' = ANY(a.relationships)
          AND EXISTS (
            SELECT 1 FROM public.connections c
            WHERE c.status = 'accepted'
              AND (
                (c.requester_id = p_viewer AND c.addressee_id = (SELECT p.author_id FROM public.green_room_posts p WHERE p.id = p_post_id))
                OR
                (c.addressee_id = p_viewer AND c.requester_id = (SELECT p.author_id FROM public.green_room_posts p WHERE p.id = p_post_id))
              )
          )
        )
        OR (
          'outside_network' = ANY(a.relationships)
          AND NOT EXISTS (
            SELECT 1 FROM public.follows f
            WHERE f.follower_id = p_viewer
              AND f.followee_id = (SELECT p.author_id FROM public.green_room_posts p WHERE p.id = p_post_id)
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.connections c
            WHERE c.status = 'accepted'
              AND (
                (c.requester_id = p_viewer AND c.addressee_id = (SELECT p.author_id FROM public.green_room_posts p WHERE p.id = p_post_id))
                OR
                (c.addressee_id = p_viewer AND c.requester_id = (SELECT p.author_id FROM public.green_room_posts p WHERE p.id = p_post_id))
              )
          )
        )
        OR (
          cardinality(a.roles) > 0
          AND (
            COALESCE(ap.industry_roles, '{}'::TEXT[]) && a.roles
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(ap.roles, '[]'::jsonb)) AS role
              WHERE (
                role->>'kind' = 'preset'
                AND lower(role->>'slug') = ANY(ARRAY(SELECT lower(r) FROM unnest(a.roles) AS r))
              )
              OR (
                role->>'kind' = 'custom'
                AND lower(role->>'label') = ANY(ARRAY(SELECT lower(r) FROM unnest(a.roles) AS r))
              )
            )
          )
        )
        OR (cardinality(a.genres) > 0 AND ap.genre IS NOT NULL AND lower(ap.genre) = ANY(ARRAY(SELECT lower(g) FROM unnest(a.genres) AS g)))
        OR (cardinality(a.locations) > 0 AND ap.location IS NOT NULL AND lower(ap.location) = ANY(ARRAY(SELECT lower(l) FROM unnest(a.locations) AS l)))
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.green_room_post_matches_custom_audience(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.green_room_post_matches_custom_audience(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "green_room_comments_select_visible" ON green_room_comments;
CREATE POLICY "green_room_comments_select_visible" ON green_room_comments FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND moderation_status = 'visible'
    AND public.green_room_can_view_post(post_id, auth.uid())
    AND public.no_block(auth.uid(), author_id)
  );

DROP POLICY IF EXISTS "green_room_reactions_select_visible" ON green_room_reactions;
CREATE POLICY "green_room_reactions_select_visible" ON green_room_reactions FOR SELECT TO authenticated
  USING (
    public.green_room_can_view_post(post_id, auth.uid())
    AND public.no_block(auth.uid(), user_id)
  );

DROP POLICY IF EXISTS "green_room_reposts_select_visible" ON green_room_reposts;
CREATE POLICY "green_room_reposts_select_visible" ON green_room_reposts FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.green_room_can_view_post(original_post_id, auth.uid())
    AND public.no_block(auth.uid(), author_id)
  );
