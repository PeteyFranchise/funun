import { createServiceClient } from '@/lib/supabase/server'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { isRoomLead } from '@/lib/playbook/entries'
import { POST } from './route'

jest.mock('@/lib/supabase/server', () => ({ createServiceClient: jest.fn() }))
jest.mock('@/lib/playbook/rooms', () => ({ requireRoomAccess: jest.fn() }))
jest.mock('@/lib/playbook/entries', () => ({ isRoomLead: jest.fn() }))
jest.mock('@/lib/staff/audit', () => ({ logStaffAction: jest.fn() }))

const ENTRY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ROOM_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

function request(body: Record<string, unknown>) {
  return new Request('http://t.local/api/admin/playbook/assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    roomKey: 'ar',
    entryId: ENTRY_ID,
    targetKind: 'role',
    targetUserId: null,
    targetRole: 'anr',
    required: true,
    dueAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(requireRoomAccess as jest.Mock).mockResolvedValue({ user: { id: USER_ID }, staffRole: 'anr' })
  ;(isRoomLead as jest.Mock).mockResolvedValue(false)
  ;(createServiceClient as jest.Mock).mockReturnValue({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: { id: ROOM_ID }, error: null })) })),
      })),
    })),
  })
})

describe('POST /api/admin/playbook/assignments', () => {
  it('rejects a mismatched audience before authorization or database access', async () => {
    const response = await POST(request(validBody({ targetKind: 'user' })))
    expect(response.status).toBe(400)
    expect(requireRoomAccess).not.toHaveBeenCalled()
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('enforces room access before creating a service-role client', async () => {
    ;(requireRoomAccess as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    const response = await POST(request(validBody()))
    expect(response.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('requires room-lead or Leadership assignment authority', async () => {
    const response = await POST(request(validBody()))
    expect(response.status).toBe(403)
    expect(isRoomLead).toHaveBeenCalledWith(expect.anything(), ROOM_ID, USER_ID)
  })
})
