import { createServiceClient } from '@/lib/supabase/server'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { isRoomLead } from '@/lib/playbook/entries'
import { PATCH } from './route'

jest.mock('@/lib/supabase/server', () => ({ createServiceClient: jest.fn() }))
jest.mock('@/lib/playbook/rooms', () => ({ requireRoomAccess: jest.fn() }))
jest.mock('@/lib/playbook/entries', () => ({ isRoomLead: jest.fn() }))
jest.mock('@/lib/staff/audit', () => ({ logStaffAction: jest.fn() }))

const ENTRY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ROOM_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

function request(overrides: Record<string, unknown> = {}) {
  return new Request(`http://t.local/api/admin/playbook/entries/${ENTRY_ID}/metadata`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ownerId: null,
      reviewDueAt: null,
      reviewIntervalDays: null,
      templateLinks: [],
      markReviewed: false,
      ...overrides,
    }),
  })
}

function service() {
  return {
    from: jest.fn((table: string) => {
      const row = table === 'playbook_entries' ? { id: ENTRY_ID, room_id: ROOM_ID } : { key: 'leadership' }
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: row, error: null })) })),
        })),
      }
    }),
    rpc: jest.fn(),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServiceClient as jest.Mock).mockReturnValue(service())
  ;(requireRoomAccess as jest.Mock).mockResolvedValue({ user: { id: USER_ID }, staffRole: 'ae' })
  ;(isRoomLead as jest.Mock).mockResolvedValue(false)
})

describe('PATCH /api/admin/playbook/entries/[id]/metadata', () => {
  it('rejects duplicate Gameplan links before accessing the database', async () => {
    const templateId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    const response = await PATCH(request({
      templateLinks: [
        { templateId, relationshipKind: 'reference' },
        { templateId, relationshipKind: 'required_reading' },
      ],
    }), { params: Promise.resolve({ id: ENTRY_ID }) })

    expect(response.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('requires room-lead or leadership authority', async () => {
    const response = await PATCH(request(), { params: Promise.resolve({ id: ENTRY_ID }) })

    expect(response.status).toBe(403)
  })
})
