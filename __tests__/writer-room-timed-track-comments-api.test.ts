import { readFileSync } from 'fs'
import path from 'path'

const commentsRoute = readFileSync(
  path.join(process.cwd(), 'app/api/works/[workId]/versions/[versionId]/comments/route.ts'),
  'utf8'
)
const resolutionRoute = readFileSync(
  path.join(process.cwd(), 'app/api/works/[workId]/versions/[versionId]/comments/[commentId]/route.ts'),
  'utf8'
)
const carryRoute = readFileSync(
  path.join(process.cwd(), 'app/api/works/[workId]/versions/[versionId]/comments/carry-forward/route.ts'),
  'utf8'
)
const workPage = readFileSync(path.join(process.cwd(), 'components/catalogue/WorkPage.tsx'), 'utf8')

describe("Writer's Room timed track comments API and wiring", () => {
  it('checks contribution access and scopes reads and writes to one work version', () => {
    expect(commentsRoute).toContain("resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')")
    expect(commentsRoute).toContain(".eq('version_id', versionId)")
    expect(commentsRoute).toContain('CommentBodySchema.safeParse')
    expect(commentsRoute).toContain("supabase.rpc('create_work_version_comment'")
  })

  it('limits mentions to room participants and creates an exact-time deep link', () => {
    expect(commentsRoute).toContain('resolveMentionedUserIds(parsed.data.body, participants)')
    expect(commentsRoute).toContain("type: 'writer_room_track_mention'")
    expect(commentsRoute).toContain('?version=${versionId}&comment=${inserted.id}&t=${inserted.timestamp_ms}')
    expect(commentsRoute).toContain('.filter(recipientId => recipientId !== user.id)')
  })

  it('keeps resolution and carry choices behind scoped RPCs', () => {
    expect(resolutionRoute).toContain(".eq('version_id', versionId)")
    expect(resolutionRoute).toContain("supabase.rpc('set_work_version_comment_resolution'")
    expect(carryRoute).toContain('sourceCommentIds: z.array(z.string().uuid()).max(100)')
    expect(carryRoute).toContain("supabase.rpc('review_work_version_comment_carry'")
  })

  it('broadcasts version ids only, never remote comment bodies', () => {
    expect(workPage).toContain("broadcast('track_comment_changed', { versionId })")
    expect(workPage).toContain("hint.kind === 'track_comment_changed'")
    expect(workPage).toContain('<TimedTrackPlayer')
  })
})
