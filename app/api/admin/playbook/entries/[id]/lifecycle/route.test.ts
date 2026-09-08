import { createServiceClient } from '@/lib/supabase/server'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { isRoomLead, setEntryLifecycle } from '@/lib/playbook/entries'
import { logStaffAction } from '@/lib/staff/audit'
import { PATCH } from './route'

jest.mock('@/lib/supabase/server', () => ({ createServiceClient: jest.fn() }))
jest.mock('@/lib/playbook/rooms', () => ({ requireRoomAccess: jest.fn() }))
jest.mock('@/lib/playbook/entries', () => ({ isRoomLead: jest.fn(), setEntryLifecycle: jest.fn() }))
jest.mock('@/lib/staff/audit', () => ({ logStaffAction: jest.fn() }))

const ENTRY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ROOM_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

function request(action = 'archive') {
  return new Request(`http://t.local/api/admin/playbook/entries/${ENTRY_ID}/lifecycle`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, expectedRevision: 2, expectedDraftVersion: 0 }),
  })
}

function service() {
  return {
    from: jest.fn((table: string) => {
      const row = table === 'playbook_entries' ? { room_id: ROOM_ID } : { key: 'leadership' }
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: row, error: null })) })),
        })),
      }
    }),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServiceClient as jest.Mock).mockReturnValue(service())
  ;(requireRoomAccess as jest.Mock).mockResolvedValue({ user: { id: USER_ID }, staffRole: 'ae' })
  ;(isRoomLead as jest.Mock).mockResolvedValue(false)
  ;(setEntryLifecycle as jest.Mock).mockResolvedValue({ data: { id: ENTRY_ID, status: 'archived' } })
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
})

describe('PATCH /api/admin/playbook/entries/[id]/lifecycle', () => {
  it('requires room-lead or leadership authority', async () => {
    const response = await PATCH(request(), { params: Promise.resolve({ id: ENTRY_ID }) })

    expect(response.status).toBe(403)
    expect(setEntryLifecycle).not.toHaveBeenCalled()
  })

  it('returns an optimistic-lock conflict without writing an audit event', async () => {
    ;(requireRoomAccess as jest.Mock).mockResolvedValue({ user: { id: USER_ID }, staffRole: 'leadership' })
    ;(setEntryLifecycle as jest.Mock).mockResolvedValue({ data: null, error: 'Entry changed' })

    const response = await PATCH(request('restore'), { params: Promise.resolve({ id: ENTRY_ID }) })

    expect(response.status).toBe(409)
    expect(logStaffAction).not.toHaveBeenCalled()
  })
})
