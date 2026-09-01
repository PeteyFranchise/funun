import { readFileSync } from 'fs'
import path from 'path'

const listRoute = readFileSync(
  path.join(process.cwd(), 'app/api/works/[workId]/blocks/[blockId]/snapshots/route.ts'),
  'utf8'
)
const restoreRoute = readFileSync(
  path.join(
    process.cwd(),
    'app/api/works/[workId]/blocks/[blockId]/snapshots/[snapshotId]/restore/route.ts'
  ),
  'utf8'
)
const blockRoute = readFileSync(
  path.join(process.cwd(), 'app/api/works/[workId]/blocks/[blockId]/route.ts'),
  'utf8'
)

describe("Writer's Room lyric snapshot API", () => {
  it('checks private work access and section ownership before listing history', () => {
    expect(listRoute).toContain("resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')")
    expect(listRoute).toContain(".eq('id', blockId)")
    expect(listRoute).toContain(".eq('work_id', workId)")
    expect(listRoute).toContain('.limit(50)')
    expect(listRoute).not.toContain('capture_key, reason')
  })

  it('requires a UUID tab session and delegates restore atomically to the lock-aware RPC', () => {
    expect(restoreRoute).toContain('session_id: z.string().uuid()')
    expect(restoreRoute).toContain("resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')")
    expect(restoreRoute).toContain("supabase.rpc('restore_locked_lyric_block_snapshot'")
    expect(restoreRoute).toContain('p_snapshot_id: snapshotId')
    expect(restoreRoute).toContain("message.includes('lyric_lock_required')")
  })

  it('keeps detach available through a scoped function instead of a direct text update', () => {
    expect(blockRoute).toContain("supabase.rpc('detach_lyric_block_with_text'")
    expect(blockRoute).not.toContain(".update(patch)")
  })
})
