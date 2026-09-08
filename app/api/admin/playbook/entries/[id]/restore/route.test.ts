import { createServiceClient } from '@/lib/supabase/server'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { editEntry, isRoomLead } from '@/lib/playbook/entries'
import { POST } from './route'

jest.mock('@/lib/supabase/server', () => ({ createServiceClient: jest.fn() }))
jest.mock('@/lib/playbook/rooms', () => ({ requireRoomAccess: jest.fn() }))
jest.mock('@/lib/playbook/entries', () => ({ editEntry: jest.fn(), isRoomLead: jest.fn() }))
jest.mock('@/lib/staff/audit', () => ({ logStaffAction: jest.fn() }))

const ENTRY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ROOM_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

function request() {
  return new Request(`http://t.local/api/admin/playbook/entries/${ENTRY_ID}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revisionNumber: 1, expectedRevision: 3, expectedDraftVersion: 2 }),
  })
}

function service(draftContent: unknown | null) {
  return {
    from: jest.fn((table: string) => {
      const row = table === 'playbook_entries'
        ? { id: ENTRY_ID, room_id: ROOM_ID, entry_type: 'document', draft_content: draftContent }
        : { key: 'leadership' }
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
  ;(requireRoomAccess as jest.Mock).mockResolvedValue({ user: { id: USER_ID }, staffRole: 'leadership' })
  ;(isRoomLead as jest.Mock).mockResolvedValue(false)
})

describe('POST /api/admin/playbook/entries/[id]/restore', () => {
  it('refuses to overwrite a pending draft with an old revision', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue(service({ schemaVersion: 1, body: 'Pending' }))

    const response = await POST(request(), { params: Promise.resolve({ id: ENTRY_ID }) })

    expect(response.status).toBe(409)
    expect(editEntry).not.toHaveBeenCalled()
  })
})
