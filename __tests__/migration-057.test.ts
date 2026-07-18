import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/057_green_room_feed.sql'),
  'utf8'
)
const authorPublicnessMigration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/058_green_room_feed_author_publicness.sql'),
  'utf8'
)

describe('migration 057 — Green Room feed schema', () => {
  it('creates separate tables for posts, audiences, comments, reactions, reposts, and placements', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS green_room_posts')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS green_room_post_audiences')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS green_room_comments')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS green_room_reactions')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS green_room_reposts')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS green_room_placements')
  })

  it('bounds custom audience complexity in queryable columns', () => {
    expect(migration).toContain('relationships TEXT[]')
    expect(migration).toContain('roles         TEXT[]')
    expect(migration).toContain('genres        TEXT[]')
    expect(migration).toContain('people        UUID[]')
    expect(migration).toContain('CHECK (cardinality(people) <= 50)')
    expect(migration).toContain('BETWEEN 1 AND 60')
  })

  it('adds feed cursor and audience indexes', () => {
    expect(migration).toContain('idx_green_room_posts_published_cursor')
    expect(migration).toContain('idx_green_room_posts_visibility')
    expect(migration).toContain('idx_green_room_audiences_people')
    expect(migration).toContain('idx_green_room_placements_active_window')
  })
})

describe('migration 057 — visibility and block enforcement', () => {
  it('creates a SECURITY DEFINER visibility helper with draft and block contracts', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.green_room_can_view_post')
    expect(migration).toContain('SECURITY DEFINER')
    expect(migration).toContain('public.no_block(p_viewer, p.author_id)')
    expect(migration).toMatch(/FROM public\.artist_profiles ap[\s\S]*ap\.id = p\.author_id[\s\S]*ap\.is_public = true/)
    expect(migration).toContain("p.status = 'published'")
    expect(migration).toContain('p.author_id = p_viewer')
  })

  it('ships a forward migration for live databases that already applied 057', () => {
    expect(authorPublicnessMigration).toContain('CREATE OR REPLACE FUNCTION public.green_room_can_view_post')
    expect(authorPublicnessMigration).toMatch(/FROM public\.artist_profiles ap[\s\S]*ap\.id = p\.author_id[\s\S]*ap\.is_public = true/)
    expect(authorPublicnessMigration).toContain('GRANT EXECUTE ON FUNCTION public.green_room_can_view_post(uuid, uuid) TO authenticated')
  })

  it('enforces followers, connections, and custom audience visibility server-side', () => {
    expect(migration).toContain("p.visibility = 'followers'")
    expect(migration).toContain("p.visibility = 'connections'")
    expect(migration).toContain("p.visibility = 'custom'")
    expect(migration).toContain('public.green_room_post_matches_custom_audience(p.id, p_viewer)')
  })

  it('uses the visibility helper in post SELECT RLS', () => {
    expect(migration).toMatch(/CREATE POLICY\s+"green_room_posts_select_visible"[\s\S]*public\.green_room_can_view_post\(id, auth\.uid\(\)\)/)
  })

  it('keeps custom audiences owner-written and visible only through post visibility', () => {
    expect(migration).toMatch(/CREATE POLICY\s+"green_room_audiences_select_visible"[\s\S]*public\.green_room_can_view_post\(post_id, auth\.uid\(\)\)/)
    expect(migration).toContain("AND p.visibility = 'custom'")
  })
})

describe('migration 057 — interactions and placement safeguards', () => {
  it('makes comments and reactions inherit post visibility', () => {
    expect(migration).toMatch(/green_room_comments_insert_visible_post[\s\S]*public\.green_room_can_view_post\(post_id, auth\.uid\(\)\)/)
    expect(migration).toMatch(/green_room_reactions_insert_own_visible_post[\s\S]*public\.green_room_can_view_post\(post_id, auth\.uid\(\)\)/)
  })

  it('keeps reposts tied to current original-post visibility and resharing controls', () => {
    expect(migration).toMatch(/green_room_reposts_select_visible[\s\S]*public\.green_room_can_view_post\(original_post_id, auth\.uid\(\)\)/)
    expect(migration).toContain('p.allow_resharing = true')
    expect(migration).toContain("p.visibility IN ('public', 'followers', 'connections')")
  })

  it('labels placements and keeps v1 placement writes server-owned', () => {
    expect(migration).toContain("placement_kind IN ('featured', 'sponsored', 'partner', 'program', 'opportunity')")
    expect(migration).toContain('not self-serve ads or billing surfaces')
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON green_room_placements FROM authenticated, anon')
  })
})
