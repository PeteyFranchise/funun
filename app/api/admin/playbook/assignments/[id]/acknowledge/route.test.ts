import { createServiceClient } from '@/lib/supabase/server'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { POST } from './route'

jest.mock('@/lib/supabase/server', () => ({ createServiceClient: jest.fn() }))
jest.mock('@/lib/playbook/rooms', () => ({ requireRoomAccess: jest.fn() }))
jest.mock('@/lib/staff/audit', () => ({ logStaffAction: jest.fn() }))

const ASSIGNMENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function request(body: unknown) {
  return new Request(`http://t.local/api/admin/playbook/assignments/${ASSIGNMENT_ID}/acknowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => jest.clearAllMocks())

describe('POST /api/admin/playbook/assignments/[id]/acknowledge', () => {
  it('requires a room-scoped request before any service-role read', async () => {
    const response = await POST(request({}), { params: Promise.resolve({ id: ASSIGNMENT_ID }) })
    expect(response.status).toBe(400)
    expect(requireRoomAccess).not.toHaveBeenCalled()
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('fails closed on room access before assignment lookup', async () => {
    ;(requireRoomAccess as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    const response = await POST(request({ roomKey: 'leadership' }), {
      params: Promise.resolve({ id: ASSIGNMENT_ID }),
    })
    expect(response.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })
})
