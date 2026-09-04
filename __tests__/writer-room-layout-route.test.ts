import { readFileSync } from 'fs'
import path from 'path'

const route = readFileSync(
  path.join(process.cwd(), 'app/api/works/[workId]/layout/route.ts'),
  'utf8'
)

describe('Writer’s Room layout route contract', () => {
  it('requires authenticated work contribution access before parsing or writing', () => {
    const accessIndex = route.indexOf('resolveWorkAccess(')
    const parseIndex = route.indexOf('WriterRoomLayoutSchema.safeParse')
    const upsertIndex = route.indexOf(".from('work_room_layouts')")
    expect(accessIndex).toBeGreaterThan(-1)
    expect(parseIndex).toBeGreaterThan(accessIndex)
    expect(upsertIndex).toBeGreaterThan(parseIndex)
    expect(route).toContain("workId, userId, 'contribute'")
  })

  it('binds both identity fields server-side and upserts only the caller’s row', () => {
    expect(route).toContain('work_id: workId')
    expect(route).toContain('user_id: userId as string')
    expect(route).toContain("{ onConflict: 'work_id,user_id' }")
    expect(route).not.toMatch(/body\.(?:user_id|userId|work_id|workId)/)
  })

  it('uses the shared strict schema and does not expose database errors', () => {
    expect(route).toContain('WriterRoomLayoutSchema.safeParse(body)')
    expect(route).toContain("{ error: 'Invalid room layout' }")
    expect(route).toContain("{ error: 'Could not save the room layout' }")
    expect(route).not.toContain('error.message')
  })
})
