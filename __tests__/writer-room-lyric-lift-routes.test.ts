import { readFileSync } from 'fs'
import path from 'path'

function source(file: string) {
  return readFileSync(path.join(process.cwd(), file), 'utf8')
}

const start = source('app/api/works/[workId]/versions/[versionId]/lyric-lift/route.ts')
const read = source('app/api/works/[workId]/lyric-lifts/[liftId]/route.ts')
const edit = source('app/api/works/[workId]/lyric-lifts/[liftId]/sections/[sectionId]/route.ts')
const apply = source('app/api/works/[workId]/lyric-lifts/[liftId]/apply/route.ts')
const worker = source('lib/catalogue/lyric-lift-service.ts')

describe('Writer’s Room Lyric Lift route contracts', () => {
  it('authenticates and checks room contribution access before every private draft operation', () => {
    for (const route of [start, read, edit, apply]) {
      expect(route).toContain('supabase.auth.getUser()')
      expect(route).toContain("resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')")
    }
  })

  it('lets a room member cancel an open draft without deleting the source recording', () => {
    expect(read).toContain('export async function DELETE')
    expect(read).toContain("status: 'discarded'")
    expect(read).not.toContain(".from('work_versions').delete")
    expect(worker).toContain("currentLift.status === 'discarded'")
  })

  it('binds the source recording to the addressed room and rejects provider-incompatible files early', () => {
    expect(start).toContain(".eq('id', versionId)")
    expect(start).toContain(".eq('work_id', workId)")
    expect(start).toContain('LYRIC_LIFT_MAX_BYTES')
    expect(start).toContain('LYRIC_LIFT_SUPPORTED_EXTENSIONS')
    expect(start).toContain('OPENAI_API_KEY')
  })

  it('queues paid work durably and makes worker retries idempotent per lift', () => {
    expect(start).toContain('queueLyricLift(lift.id)')
    expect(worker).toContain(".delete()\n      .eq('lift_id', liftId)")
    expect(worker).toContain("status: 'processing'")
    expect(worker).toContain("status: 'review'")
    expect(worker).toContain("status: 'failed'")
  })

  it('never accepts a client-supplied writer and only applies through the append-safe RPC', () => {
    expect(edit).not.toContain('author_user_id')
    expect(apply).toContain("z.enum(['empty_only', 'append'])")
    expect(apply).toContain("service.rpc('apply_work_lyric_lift'")
    expect(apply).toContain('p_actor_id: user.id')
  })
})
