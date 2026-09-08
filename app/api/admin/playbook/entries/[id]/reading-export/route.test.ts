import { createServiceClient } from '@/lib/supabase/server'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { GET } from './route'

jest.mock('@/lib/supabase/server', () => ({ createServiceClient: jest.fn() }))
jest.mock('@/lib/playbook/rooms', () => ({ requireRoomAccess: jest.fn() }))
jest.mock('@/lib/playbook/entries', () => ({ isRoomLead: jest.fn() }))

const ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

beforeEach(() => jest.clearAllMocks())

describe('GET Playbook reading export', () => {
  it('requires room access before any service-role export read', async () => {
    ;(requireRoomAccess as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    const response = await GET(new Request(`http://t.local/export?roomKey=ar`), { params: Promise.resolve({ id: ID }) })
    expect(response.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('rejects a missing room key before authorization', async () => {
    const response = await GET(new Request('http://t.local/export'), { params: Promise.resolve({ id: ID }) })
    expect(response.status).toBe(400)
    expect(requireRoomAccess).not.toHaveBeenCalled()
  })
})
