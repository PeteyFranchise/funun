import { readFileSync } from 'fs'
import path from 'path'

const migration146 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/146_writer_room_section_comments.sql'),
  'utf8'
)

const sqlOnly = migration146
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

describe("migration 146 — Writer's Room lyric-section comments", () => {
  it('stores private section threads with bounded plain-text bodies and one-level replies', () => {
    expect(sqlOnly).toContain('CREATE TABLE public.work_lyric_block_comments')
    expect(sqlOnly).toContain('char_length(body) BETWEEN 1 AND 2000')
    expect(sqlOnly).toContain('cardinality(mentioned_user_ids) <= 25')
    expect(sqlOnly).toContain('v_parent.parent_comment_id IS NOT NULL')
    expect(sqlOnly).toContain("RAISE EXCEPTION 'comment_thread_resolved'")
  })

  it('binds every comment, parent, author and mention to the same work section', () => {
    expect(sqlOnly).toContain('WHERE id = NEW.block_id AND work_id = NEW.work_id')
    expect(sqlOnly).toContain('v_parent.work_id <> NEW.work_id')
    expect(sqlOnly).toContain('v_parent.block_id <> NEW.block_id')
    expect(sqlOnly).toContain('public.is_work_owner(NEW.work_id, NEW.author_user_id)')
    expect(sqlOnly).toContain('public.work_member_tier(NEW.work_id, v_mentioned_user_id) IS NOT NULL')
    expect(sqlOnly).toContain('WHERE mentioned_id IS NOT NULL')
  })

  it('keeps direct writes closed and exposes only participant-aware RPCs', () => {
    expect(sqlOnly).toContain('ALTER TABLE public.work_lyric_block_comments ENABLE ROW LEVEL SECURITY')
    expect(sqlOnly).toContain('CREATE POLICY work_lyric_block_comments_select')
    expect(sqlOnly).toContain('REVOKE ALL ON TABLE public.work_lyric_block_comments FROM PUBLIC, anon, authenticated')
    expect(sqlOnly).toMatch(/GRANT SELECT \([\s\S]+\) ON public\.work_lyric_block_comments TO authenticated/)
    expect(sqlOnly).toMatch(/create_work_lyric_block_comment\(uuid, uuid, text, uuid, uuid\[\]\)[\s\S]+TO authenticated/)
    expect(sqlOnly).toMatch(/set_work_lyric_block_comment_resolution\(uuid, uuid, uuid, boolean\)[\s\S]+TO authenticated/)
  })

  it('limits resolution to a root author, work owner or administering member', () => {
    expect(sqlOnly).toContain("RAISE EXCEPTION 'comment_reply_not_resolvable'")
    expect(sqlOnly).toContain('v_comment.author_user_id IS DISTINCT FROM v_uid')
    expect(sqlOnly).toContain("public.work_member_tier(p_work_id, v_uid) IS DISTINCT FROM 'administer'")
    expect(sqlOnly).toContain("RAISE EXCEPTION 'comment_resolution_not_allowed'")
    expect(sqlOnly).toContain("RAISE EXCEPTION 'invalid_comment_resolution'")
  })

  it('records meaningful thread lifecycle events without logging every reply', () => {
    expect(sqlOnly).toContain("'note', 'comment'")
    expect(sqlOnly).toContain('IF NEW.parent_comment_id IS NOT NULL THEN')
    expect(sqlOnly).toContain("'operation', 'opened'")
    expect(sqlOnly).toContain("'operation', CASE WHEN NEW.resolved_at IS NULL THEN 'reopened' ELSE 'resolved' END")
  })
})
