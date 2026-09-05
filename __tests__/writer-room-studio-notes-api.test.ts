import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Writer Room Studio Notes contracts', () => {
  const migration = read('supabase/migrations/180_writer_room_studio_notes.sql')
  const collectionRoute = read('app/api/works/[workId]/studio-notes/route.ts')
  const itemRoute = read('app/api/works/[workId]/studio-notes/[noteId]/route.ts')
  const reactionRoute = read('app/api/works/[workId]/studio-notes/[noteId]/reactions/route.ts')

  it('keeps whole-song notes and reaction writes behind participant-checked RPCs', () => {
    expect(migration).toContain('REVOKE ALL ON TABLE public.work_studio_notes FROM PUBLIC, anon, authenticated')
    expect(migration).toContain('REVOKE ALL ON TABLE public.work_note_reactions FROM PUBLIC, anon, authenticated')
    expect(migration).toContain('public.work_member_tier(p_work_id, v_uid) IS NOT NULL')
    expect(migration).toContain('studio_note_recipient_not_participant')
    expect(migration).toContain('reaction_note_not_found')
    expect(migration).toContain('pg_advisory_xact_lock')
  })

  it('validates every mutation, checks work access, and rate limits writes', () => {
    for (const route of [collectionRoute, itemRoute, reactionRoute]) {
      expect(route).toContain('resolveWorkAccess')
      expect(route).toContain('checkRateLimit')
      expect(route).toContain('safeParse')
    }
    expect(collectionRoute).toContain('current Writer’s Room members')
    expect(reactionRoute).toContain("z.enum(['like', 'love', 'fire', 'heard', 'done', 'idea', 'laugh'])")
  })

  it('preserves existing audio and lyric comment stores under one facade', () => {
    expect(collectionRoute).toContain("supabase.from('work_version_comments')")
    expect(collectionRoute).toContain("supabase.from('work_lyric_block_comments')")
    expect(collectionRoute).toContain("supabase.rpc('create_work_version_comment'")
    expect(collectionRoute).toContain("supabase.rpc('create_work_lyric_block_comment'")
  })
})
