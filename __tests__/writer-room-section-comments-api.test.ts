import { readFileSync } from 'fs'
import path from 'path'

const listRoute = readFileSync(
  path.join(process.cwd(), 'app/api/works/[workId]/blocks/[blockId]/comments/route.ts'),
  'utf8'
)
const resolutionRoute = readFileSync(
  path.join(
    process.cwd(),
    'app/api/works/[workId]/blocks/[blockId]/comments/[commentId]/route.ts'
  ),
  'utf8'
)
const workPage = readFileSync(
  path.join(process.cwd(), 'components/catalogue/WorkPage.tsx'),
  'utf8'
)

describe("Writer's Room lyric-section comments API and wiring", () => {
  it('checks work access and section ownership before reading or creating comments', () => {
    expect(listRoute).toContain("resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')")
    expect(listRoute).toContain(".eq('id', blockId)")
    expect(listRoute).toContain(".eq('work_id', workId)")
    expect(listRoute).toContain('.limit(200)')
    expect(listRoute).toContain('CommentBodySchema.safeParse')
  })

  it('resolves mentions only from current participants and sends member-safe alerts', () => {
    expect(listRoute).toContain('resolveMentionedUserIds(parsed.data.body, participants)')
    expect(listRoute).toContain("supabase.rpc('create_work_lyric_block_comment'")
    expect(listRoute).toContain("type: 'writer_room_mention'")
    expect(listRoute).toContain('link: `/vault/works/${workId}`')
    expect(listRoute).toContain('.filter(recipientId => recipientId !== user.id)')
  })

  it('keeps resolution scoped to the exact work, block and comment', () => {
    expect(resolutionRoute).toContain('const ResolutionSchema = z.object({ resolved: z.boolean() }).strict()')
    expect(resolutionRoute).toContain(".eq('id', commentId)")
    expect(resolutionRoute).toContain(".eq('work_id', workId)")
    expect(resolutionRoute).toContain(".eq('block_id', blockId)")
    expect(resolutionRoute).toContain("supabase.rpc('set_work_lyric_block_comment_resolution'")
  })

  it('broadcasts only refetch hints and refreshes canonical comments and diary state', () => {
    expect(workPage).toContain("broadcast('comment_changed', { blockId: panel.blockId })")
    expect(workPage).toContain("hint.kind === 'lyric_saved'")
    expect(workPage).toContain('void refreshLyricComments(hint.blockId)')
    expect(workPage).toContain('onOpenComments={(blockId, label)')
    expect(workPage).toContain('<LyricCommentsPanel')
  })
})
