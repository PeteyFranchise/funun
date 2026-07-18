-- ============================================================
-- Funūn — Wave 4: The Green Room
-- Migration 057: Green Room feed schema, RLS, and indexes
-- Run via: supabase db push
-- ============================================================
-- Phase 12 introduces a feed-first Green Room surface. This migration
-- creates the database rails only: posts, custom audiences, comments,
-- reactions, reposts, and admin-curated placements. API/UI work lands in
-- later plans.
--
-- Security posture:
-- - Visibility is server-enforced through green_room_can_view_post().
-- - Blocks are enforced through the existing no_block() helper.
-- - Drafts are owner-only.
-- - Custom audiences are stored in a bounded, queryable 1:1 table.
-- - Reposts are invalidated by always checking the original post at read
--   time instead of copying visibility state into the repost row.
-- ============================================================

-- ─── Core posts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS green_room_posts (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id          UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  post_type          TEXT NOT NULL CHECK (post_type IN (
                       'general_update',
                       'collab_request',
                       'release_announcement',
                       'question',
                       'win_milestone',
                       'feedback_request',
                       'opportunity_need'
                     )),
  body               TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  visibility         TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN (
                       'public',
                       'followers',
                       'connections',
                       'draft',
                       'custom'
                     )),
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  linked_object_type TEXT CHECK (linked_object_type IN ('profile', 'project', 'track', 'opportunity')),
  linked_object_id   UUID,
  allow_resharing    BOOLEAN NOT NULL DEFAULT true,
  moderation_status  TEXT NOT NULL DEFAULT 'visible' CHECK (moderation_status IN (
                       'visible',
                       'under_review',
                       'hidden',
                       'removed'
                     )),
  report_count       INTEGER NOT NULL DEFAULT 0 CHECK (report_count >= 0),
  published_at       TIMESTAMPTZ,
  deleted_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((linked_object_type IS NULL AND linked_object_id IS NULL) OR (linked_object_type IS NOT NULL AND linked_object_id IS NOT NULL)),
  CHECK ((status = 'draft' AND published_at IS NULL) OR (status <> 'draft' AND published_at IS NOT NULL)),
  CHECK ((visibility = 'draft' AND status = 'draft') OR visibility <> 'draft')
);

CREATE INDEX IF NOT EXISTS idx_green_room_posts_author_created
  ON green_room_posts (author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_green_room_posts_published_cursor
  ON green_room_posts (published_at DESC, id DESC)
  WHERE status = 'published' AND deleted_at IS NULL AND moderation_status = 'visible';

CREATE INDEX IF NOT EXISTS idx_green_room_posts_visibility
  ON green_room_posts (visibility, post_type, published_at DESC)
  WHERE status = 'published' AND deleted_at IS NULL AND moderation_status = 'visible';

CREATE TRIGGER green_room_posts_updated_at
  BEFORE UPDATE ON green_room_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE green_room_posts ENABLE ROW LEVEL SECURITY;

-- ─── Custom audiences ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS green_room_post_audiences (
  post_id       UUID PRIMARY KEY REFERENCES green_room_posts ON DELETE CASCADE,
  relationships TEXT[] NOT NULL DEFAULT '{}'
                CHECK (relationships <@ ARRAY['followers', 'connections', 'outside_network']::TEXT[]),
  roles         TEXT[] NOT NULL DEFAULT '{}',
  genres        TEXT[] NOT NULL DEFAULT '{}',
  locations     TEXT[] NOT NULL DEFAULT '{}',
  people        UUID[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (cardinality(relationships) <= 3),
  CHECK (cardinality(roles) <= 8),
  CHECK (cardinality(genres) <= 8),
  CHECK (cardinality(locations) <= 8),
  CHECK (cardinality(people) <= 50),
  CHECK (
    cardinality(relationships) +
    cardinality(roles) +
    cardinality(genres) +
    cardinality(locations) +
    cardinality(people) BETWEEN 1 AND 60
  )
);

CREATE INDEX IF NOT EXISTS idx_green_room_audiences_relationships
  ON green_room_post_audiences USING gin (relationships);

CREATE INDEX IF NOT EXISTS idx_green_room_audiences_roles
  ON green_room_post_audiences USING gin (roles);

CREATE INDEX IF NOT EXISTS idx_green_room_audiences_genres
  ON green_room_post_audiences USING gin (genres);

CREATE INDEX IF NOT EXISTS idx_green_room_audiences_people
  ON green_room_post_audiences USING gin (people);

CREATE TRIGGER green_room_post_audiences_updated_at
  BEFORE UPDATE ON green_room_post_audiences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE green_room_post_audiences ENABLE ROW LEVEL SECURITY;

-- ─── Visibility helpers ──────────────────────────────────────────────
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

REVOKE EXECUTE ON FUNCTION public.green_room_post_matches_custom_audience(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.green_room_can_view_post(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.green_room_post_matches_custom_audience(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.green_room_can_view_post(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.green_room_can_view_post(uuid, uuid) IS
  'Returns true when a viewer may read a Green Room post. Enforces draft privacy, author publicness for non-owner reads, published visibility, custom audiences, moderation state, deletes, and bidirectional blocks.';

-- ─── Comments ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS green_room_comments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id           UUID NOT NULL REFERENCES green_room_posts ON DELETE CASCADE,
  author_id         UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  body              TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  moderation_status TEXT NOT NULL DEFAULT 'visible' CHECK (moderation_status IN ('visible', 'under_review', 'hidden', 'removed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_green_room_comments_post_created
  ON green_room_comments (post_id, created_at ASC)
  WHERE deleted_at IS NULL AND moderation_status = 'visible';

CREATE INDEX IF NOT EXISTS idx_green_room_comments_author
  ON green_room_comments (author_id, created_at DESC);

CREATE TRIGGER green_room_comments_updated_at
  BEFORE UPDATE ON green_room_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE green_room_comments ENABLE ROW LEVEL SECURITY;

-- ─── Reactions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS green_room_reactions (
  post_id       UUID NOT NULL REFERENCES green_room_posts ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN (
                  'like',
                  'love',
                  'fire',
                  'congrats',
                  'inspired',
                  'helpful',
                  'interested'
                )),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS idx_green_room_reactions_user
  ON green_room_reactions (user_id, created_at DESC);

ALTER TABLE green_room_reactions ENABLE ROW LEVEL SECURITY;

-- ─── Reposts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS green_room_reposts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_post_id UUID NOT NULL REFERENCES green_room_posts ON DELETE CASCADE,
  author_id        UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  quote_body       TEXT CHECK (quote_body IS NULL OR char_length(quote_body) BETWEEN 1 AND 1000),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,
  UNIQUE (original_post_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_green_room_reposts_author_created
  ON green_room_reposts (author_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_green_room_reposts_original
  ON green_room_reposts (original_post_id)
  WHERE deleted_at IS NULL;

ALTER TABLE green_room_reposts ENABLE ROW LEVEL SECURITY;

-- ─── Admin-curated placements ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS green_room_placements (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  placement_kind    TEXT NOT NULL CHECK (placement_kind IN ('featured', 'sponsored', 'partner', 'program', 'opportunity')),
  label             TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  title             TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  body              TEXT CHECK (body IS NULL OR char_length(body) <= 500),
  destination_type  TEXT NOT NULL CHECK (destination_type IN ('profile', 'project', 'track', 'opportunity', 'post', 'external')),
  destination_id    UUID,
  destination_url   TEXT,
  priority          INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  starts_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at           TIMESTAMPTZ,
  created_by        UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK ((destination_type = 'external' AND destination_url IS NOT NULL) OR (destination_type <> 'external' AND destination_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_green_room_placements_active_window
  ON green_room_placements (status, starts_at, ends_at, priority DESC)
  WHERE status = 'active';

CREATE TRIGGER green_room_placements_updated_at
  BEFORE UPDATE ON green_room_placements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE green_room_placements ENABLE ROW LEVEL SECURITY;

-- ─── RLS: posts and custom audiences ─────────────────────────────────
DROP POLICY IF EXISTS "green_room_posts_select_visible" ON green_room_posts;
DROP POLICY IF EXISTS "green_room_posts_insert_own" ON green_room_posts;
DROP POLICY IF EXISTS "green_room_posts_update_own" ON green_room_posts;
DROP POLICY IF EXISTS "green_room_posts_delete_own" ON green_room_posts;

CREATE POLICY "green_room_posts_select_visible" ON green_room_posts FOR SELECT TO authenticated
  USING (public.green_room_can_view_post(id, auth.uid()));

CREATE POLICY "green_room_posts_insert_own" ON green_room_posts FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "green_room_posts_update_own" ON green_room_posts FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "green_room_posts_delete_own" ON green_room_posts FOR DELETE TO authenticated
  USING (author_id = auth.uid());

DROP POLICY IF EXISTS "green_room_audiences_select_visible" ON green_room_post_audiences;
DROP POLICY IF EXISTS "green_room_audiences_insert_owner" ON green_room_post_audiences;
DROP POLICY IF EXISTS "green_room_audiences_update_owner" ON green_room_post_audiences;
DROP POLICY IF EXISTS "green_room_audiences_delete_owner" ON green_room_post_audiences;

CREATE POLICY "green_room_audiences_select_visible" ON green_room_post_audiences FOR SELECT TO authenticated
  USING (public.green_room_can_view_post(post_id, auth.uid()));

CREATE POLICY "green_room_audiences_insert_owner" ON green_room_post_audiences FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM green_room_posts p
    WHERE p.id = post_id
      AND p.author_id = auth.uid()
      AND p.visibility = 'custom'
  ));

CREATE POLICY "green_room_audiences_update_owner" ON green_room_post_audiences FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM green_room_posts p
    WHERE p.id = post_id
      AND p.author_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM green_room_posts p
    WHERE p.id = post_id
      AND p.author_id = auth.uid()
      AND p.visibility = 'custom'
  ));

CREATE POLICY "green_room_audiences_delete_owner" ON green_room_post_audiences FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM green_room_posts p
    WHERE p.id = post_id
      AND p.author_id = auth.uid()
  ));

-- ─── RLS: comments, reactions, reposts ───────────────────────────────
DROP POLICY IF EXISTS "green_room_comments_select_visible" ON green_room_comments;
DROP POLICY IF EXISTS "green_room_comments_insert_visible_post" ON green_room_comments;
DROP POLICY IF EXISTS "green_room_comments_update_own" ON green_room_comments;
DROP POLICY IF EXISTS "green_room_comments_delete_own_or_post_owner" ON green_room_comments;

CREATE POLICY "green_room_comments_select_visible" ON green_room_comments FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND moderation_status = 'visible'
    AND public.green_room_can_view_post(post_id, auth.uid())
    AND public.no_block(auth.uid(), author_id)
  );

CREATE POLICY "green_room_comments_insert_visible_post" ON green_room_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.green_room_can_view_post(post_id, auth.uid())
  );

CREATE POLICY "green_room_comments_update_own" ON green_room_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "green_room_comments_delete_own_or_post_owner" ON green_room_comments FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM green_room_posts p
      WHERE p.id = post_id
        AND p.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "green_room_reactions_select_visible" ON green_room_reactions;
DROP POLICY IF EXISTS "green_room_reactions_insert_own_visible_post" ON green_room_reactions;
DROP POLICY IF EXISTS "green_room_reactions_delete_own" ON green_room_reactions;

CREATE POLICY "green_room_reactions_select_visible" ON green_room_reactions FOR SELECT TO authenticated
  USING (
    public.green_room_can_view_post(post_id, auth.uid())
    AND public.no_block(auth.uid(), user_id)
  );

CREATE POLICY "green_room_reactions_insert_own_visible_post" ON green_room_reactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.green_room_can_view_post(post_id, auth.uid())
  );

CREATE POLICY "green_room_reactions_delete_own" ON green_room_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "green_room_reposts_select_visible" ON green_room_reposts;
DROP POLICY IF EXISTS "green_room_reposts_insert_own_visible_original" ON green_room_reposts;
DROP POLICY IF EXISTS "green_room_reposts_delete_own_or_original_owner" ON green_room_reposts;

CREATE POLICY "green_room_reposts_select_visible" ON green_room_reposts FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.green_room_can_view_post(original_post_id, auth.uid())
    AND public.no_block(auth.uid(), author_id)
  );

CREATE POLICY "green_room_reposts_insert_own_visible_original" ON green_room_reposts FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM green_room_posts p
      WHERE p.id = original_post_id
        AND p.allow_resharing = true
        AND p.visibility IN ('public', 'followers', 'connections')
        AND public.green_room_can_view_post(p.id, auth.uid())
    )
  );

CREATE POLICY "green_room_reposts_delete_own_or_original_owner" ON green_room_reposts FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM green_room_posts p
      WHERE p.id = original_post_id
        AND p.author_id = auth.uid()
    )
  );

-- ─── RLS: placements ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "green_room_placements_select_active" ON green_room_placements;

CREATE POLICY "green_room_placements_select_active" ON green_room_placements FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
  );

-- Admin placement writes are intentionally server-owned for v1. The admin
-- API will verify app_metadata.is_admin and use the service role, matching
-- existing /api/admin/* patterns.
REVOKE INSERT, UPDATE, DELETE ON green_room_placements FROM authenticated, anon;

COMMENT ON TABLE green_room_placements IS
  'Admin-curated Green Room placements. These are labeled featured/sponsored/partner/program/opportunity cards, not self-serve ads or billing surfaces.';
