import { isRoomLead } from '@/lib/playbook/entries'
import { readPublicationSource } from '@/lib/playbook/publication-source'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
import { GET } from './route'

jest.mock('@/lib/playbook/entries', () => ({ isRoomLead: jest.fn() }))
jest.mock('@/lib/playbook/publication-source', () => ({ readPublicationSource: jest.fn() }))
jest.mock('@/lib/playbook/rooms', () => ({ requireRoomAccess: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createServiceClient: jest.fn() }))

const ROOM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SUBGROUP_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

function request(query: string) {
  return new Request(`http://t.local/api/admin/playbook/publication/source?${query}`)
}

function service() {
  return {
    from: jest.fn((table: string) => ({
      select: jest.fn(() => ({
        eq: jest.fn((field: string) => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: table === 'playbook_sub_groups' ? { id: SUBGROUP_ID } : null, error: null })),
          })),
          maybeSingle: jest.fn(async () => ({ data: field === 'key' ? { id: ROOM_ID } : null, error: null })),
        })),
      })),
    })),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServiceClient as jest.Mock).mockReturnValue(service())
  ;(requireRoomAccess as jest.Mock).mockResolvedValue({ user: { id: USER_ID }, staffRole: 'leadership' })
  ;(isRoomLead as jest.Mock).mockResolvedValue(false)
  ;(readPublicationSource as jest.Mock).mockResolvedValue({
    sourcePath: '.planning/deliberations/organizational-doctrine/functional-team-doctrines.md#1-a-r-doctrine',
    filePath: '.planning/deliberations/organizational-doctrine/functional-team-doctrines.md',
    section: '1-a-r-doctrine',
    markdown: '### Purpose\n\nApproved.',
    sourceHash: 'abc123',
  })
})

describe('GET /api/admin/playbook/publication/source', () => {
  it('rejects a room mismatch before checking authorization', async () => {
    const response = await GET(request('key=ar-doctrine&roomKey=leadership'))

    expect(response.status).toBe(404)
    expect(requireRoomAccess).not.toHaveBeenCalled()
    expect(readPublicationSource).not.toHaveBeenCalled()
  })

  it('does not read source content for a caller without room access', async () => {
    ;(requireRoomAccess as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const response = await GET(request('key=ar-doctrine&roomKey=ar'))

    expect(response.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(readPublicationSource).not.toHaveBeenCalled()
  })

  it('does not read source content for a room member who is not its lead', async () => {
    ;(requireRoomAccess as jest.Mock).mockResolvedValue({ user: { id: USER_ID }, staffRole: 'anr' })

    const response = await GET(request('key=ar-doctrine&roomKey=ar'))

    expect(response.status).toBe(403)
    expect(isRoomLead).toHaveBeenCalledWith(expect.anything(), ROOM_ID, USER_ID)
    expect(readPublicationSource).not.toHaveBeenCalled()
  })

  it('returns the exact allowlisted section and destination for leadership', async () => {
    const response = await GET(request('key=ar-doctrine&roomKey=ar'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(body.data).toEqual(expect.objectContaining({
      key: 'ar-doctrine',
      roomKey: 'ar',
      subgroupKey: 'role-doctrine',
      subGroupId: SUBGROUP_ID,
      markdown: '### Purpose\n\nApproved.',
      sourceHash: 'abc123',
    }))
    expect(readPublicationSource).toHaveBeenCalledWith('.planning/deliberations/organizational-doctrine/functional-team-doctrines.md#1-a-r-doctrine')
  })
})
