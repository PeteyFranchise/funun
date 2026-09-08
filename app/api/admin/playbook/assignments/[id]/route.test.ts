import { createServiceClient } from '@/lib/supabase/server'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { DELETE, PATCH } from './route'

jest.mock('@/lib/supabase/server', () => ({ createServiceClient: jest.fn() }))
jest.mock('@/lib/playbook/rooms', () => ({ requireRoomAccess: jest.fn() }))
jest.mock('@/lib/playbook/entries', () => ({ isRoomLead: jest.fn() }))
jest.mock('@/lib/staff/audit', () => ({ logStaffAction: jest.fn() }))

const ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const context = { params: Promise.resolve({ id: ID }) }
function request(method: string, body: unknown) {
  return new Request(`http://t.local/api/admin/playbook/assignments/${ID}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(() => jest.clearAllMocks())

describe('Playbook reading assignment management', () => {
  it('validates an edit before authorization or service-role access', async () => {
    const response = await PATCH(request('PATCH', { roomKey: 'ar' }), context)
    expect(response.status).toBe(400)
    expect(requireRoomAccess).not.toHaveBeenCalled()
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('fails a revoke closed on room access before service-role access', async () => {
    ;(requireRoomAccess as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    const response = await DELETE(request('DELETE', { roomKey: 'ar' }), context)
    expect(response.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })
})
