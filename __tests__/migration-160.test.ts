import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/160_writer_room_timed_track_comments.sql'),
  'utf8'
)
const sqlOnly = migration.split('\n').filter(line => !line.trim().startsWith('--')).join('\n')

describe("migration 160 — Writer's Room timed track comments", () => {
  it('anchors bounded comments to exact work versions and timestamps', () => {
    expect(sqlOnly).toContain('CREATE TABLE public.work_version_comments')
    expect(sqlOnly).toContain('version_id               UUID NOT NULL REFERENCES public.work_versions(id)')
    expect(sqlOnly).toContain('timestamp_ms BETWEEN 0 AND 86400000')
    expect(sqlOnly).toContain('NEW.timestamp_ms > ceil(v_version.duration_seconds * 1000)::INTEGER')
    expect(sqlOnly).toContain('v_parent.version_id <> NEW.version_id')
  })

  it('closes direct writes and exposes participant-aware RPCs only', () => {
    expect(sqlOnly).toContain('ALTER TABLE public.work_version_comments ENABLE ROW LEVEL SECURITY')
    expect(sqlOnly).toContain('REVOKE ALL ON TABLE public.work_version_comments FROM PUBLIC, anon, authenticated')
    expect(sqlOnly).toMatch(/GRANT SELECT \([\s\S]+\) ON public\.work_version_comments TO authenticated/)
    expect(sqlOnly).toMatch(/create_work_version_comment\(uuid, uuid, text, integer, uuid, uuid\[\]\)[\s\S]+TO authenticated/)
    expect(sqlOnly).toMatch(/set_work_version_comment_resolution\(uuid, uuid, uuid, boolean\)[\s\S]+TO authenticated/)
  })

  it('records an explicit carry review and copies only selected unresolved roots from the immediate prior version', () => {
    expect(sqlOnly).toContain('CREATE TABLE public.work_version_comment_carry_reviews')
    expect(sqlOnly).toContain("AND (created_at, id) < (v_target.created_at, v_target.id)")
    expect(sqlOnly).toContain('AND parent_comment_id IS NULL')
    expect(sqlOnly).toContain('AND resolved_at IS NULL')
    expect(sqlOnly).toContain('v_valid_count <> v_requested_count')
    expect(sqlOnly).toContain('carried_from_version_id, carried_from_comment_id')
    expect(sqlOnly).toContain('LEAST(')
  })
})
