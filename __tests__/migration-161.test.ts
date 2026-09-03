import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/161_writer_room_lyric_suggestions.sql'),
  'utf8'
)
const sqlOnly = migration.split('\n').filter(line => !line.trim().startsWith('--')).join('\n')

describe("migration 161 — Writer's Room alternate lyric suggestions", () => {
  it('stores bounded private proposals separately from canonical lyrics', () => {
    expect(sqlOnly).toContain('CREATE TABLE public.work_lyric_block_suggestions')
    expect(sqlOnly).toContain("status IN ('pending', 'accepted', 'declined')")
    expect(sqlOnly).toContain('char_length(proposed_text) BETWEEN 1 AND 4000')
    expect(sqlOnly).toContain('char_length(note) BETWEEN 1 AND 500')
    expect(sqlOnly).toContain('ALTER TABLE public.work_lyric_block_suggestions ENABLE ROW LEVEL SECURITY')
    expect(sqlOnly).toContain('REVOKE ALL ON TABLE public.work_lyric_block_suggestions FROM PUBLIC, anon, authenticated')
  })

  it('binds authors and mentions to a current participant and rejects repeat blocks', () => {
    expect(sqlOnly).toContain('AND repeat_of_block_id IS NULL')
    expect(sqlOnly).toContain('public.is_work_owner(NEW.work_id, NEW.author_user_id)')
    expect(sqlOnly).toContain('public.work_member_tier(NEW.work_id, v_mentioned_user_id) IS NOT NULL')
    expect(sqlOnly).toContain("RAISE EXCEPTION 'lyric_block_not_suggestible'")
  })

  it('keeps acceptance administrative, atomic, stale-safe and lock-safe', () => {
    expect(sqlOnly).toContain("public.work_member_tier(p_work_id, v_uid) = 'administer'")
    expect(sqlOnly).toContain("RAISE EXCEPTION 'suggestion_accept_not_allowed'")
    expect(sqlOnly).toContain("RAISE EXCEPTION 'suggestion_author_unavailable'")
    expect(sqlOnly).toContain('author_user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL')
    expect(sqlOnly).toContain('AND expires_at > now()')
    expect(sqlOnly).toContain("RAISE EXCEPTION 'lyric_block_busy'")
    expect(sqlOnly).toContain('CREATE TRIGGER trg_serialize_work_lyric_block_lock')
    expect(sqlOnly).toMatch(/FROM public\.lyric_blocks[\s\S]+FOR UPDATE;[\s\S]+IF EXISTS \([\s\S]+FROM public\.work_lyric_block_locks/)
    expect(sqlOnly).toContain('v_block.text IS DISTINCT FROM v_suggestion.base_text')
    expect(sqlOnly).toContain("RAISE EXCEPTION 'suggestion_stale'")
    expect(sqlOnly).toContain("'before_suggestion_accept'")
    expect(sqlOnly).toContain("set_config('funun.lyric_text_write', 'suggestion_accept', TRUE)")
    const decisionFunction = sqlOnly.slice(sqlOnly.indexOf('CREATE OR REPLACE FUNCTION public.decide_work_lyric_block_suggestion'))
    expect(decisionFunction.indexOf('FROM public.lyric_blocks')).toBeLessThan(
      decisionFunction.indexOf('FROM public.work_lyric_block_suggestions')
    )
  })

  it('attributes accepted words to their proposer and emits one meaningful lyric diary event', () => {
    expect(sqlOnly).toContain('author_user_id = v_suggestion.author_user_id')
    expect(sqlOnly).toContain("WHEN v_suggestion_id IS NOT NULL THEN 'suggestion_accepted'")
    expect(sqlOnly).toContain("'suggestionAuthorId', v_suggestion_author_id")
    expect(sqlOnly).not.toContain("INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)\n  VALUES (\n    p_work_id")
  })

  it('allows only RPC-backed writes', () => {
    expect(sqlOnly).toMatch(/create_work_lyric_block_suggestion\(uuid, uuid, text, text, uuid\[\]\)[\s\S]+TO authenticated/)
    expect(sqlOnly).toMatch(/decide_work_lyric_block_suggestion\(uuid, uuid, uuid, text\)[\s\S]+TO authenticated/)
  })
})
