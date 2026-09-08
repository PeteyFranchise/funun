import { createServiceClient } from '@/lib/supabase/server'
import { logStaffAction } from '@/lib/staff/audit'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { approveEntry, editEntry, isRoomLead, rejectEntry } from '@/lib/playbook/entries'
import { PATCH } from './route'

jest.mock('@/lib/playbook/rooms', () => ({ requireRoomAccess: jest.fn() }))
jest.mock('@/lib/playbook/entries', () => ({
  approveEntry: jest.fn(),
  editEntry: jest.fn(),
  isRoomLead: jest.fn(),
  rejectEntry: jest.fn(),
}))
jest.mock('@/lib/supabase/server', () => ({ createServiceClient: jest.fn() }))
jest.mock('@/lib/staff/audit', () => ({ logStaffAction: jest.fn() }))

const ENTRY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ROOM_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

function request(body: unknown) {
  return new Request(`http://t.local/api/admin/playbook/entries/${ENTRY_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function service() {
  return {
    from: jest.fn((table: string) => {
      const row =
        table === 'playbook_entries'
          ? { id: ENTRY_ID, room_id: ROOM_ID, entry_type: 'topic' }
          : { key: 'ae-sales' }
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: row, error: null })),
          })),
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
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
})

describe('PATCH /api/admin/playbook/entries/[id]', () => {
  it('requires both published and draft concurrency tokens', async () => {
    const response = await PATCH(request({ action: 'approve' }), { params: Promise.resolve({ id: ENTRY_ID }) })

    expect(response.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('does not let a regular member turn a requested edit into a direct publish', async () => {
    ;(editEntry as jest.Mock).mockResolvedValue({
      data: { id: ENTRY_ID, status: 'published', draft_content: { questions: ['Proposed'] } },
    })

    const response = await PATCH(
      request({
        action: 'edit',
        content: { questions: ['Proposed'] },
        publish: true,
        expectedRevision: 2,
        expectedDraftVersion: 0,
      }),
      { params: Promise.resolve({ id: ENTRY_ID }) }
    )

    expect(response.status).toBe(200)
    expect(editEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isApprover: false, publishRequested: true, editorId: USER_ID })
    )
  })

  it('returns conflict when an optimistic lock is stale', async () => {
    ;(editEntry as jest.Mock).mockResolvedValue({
      data: null,
      error: 'This entry changed in another session. Refresh before saving.',
    })

    const response = await PATCH(
      request({
        action: 'edit',
        content: { questions: ['Proposed'] },
        expectedRevision: 2,
        expectedDraftVersion: 3,
      }),
      { params: Promise.resolve({ id: ENTRY_ID }) }
    )

    expect(response.status).toBe(409)
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('requires approval authority for approve and reject actions', async () => {
    const response = await PATCH(
      request({ action: 'approve', expectedRevision: 1, expectedDraftVersion: 1 }),
      { params: Promise.resolve({ id: ENTRY_ID }) }
    )

    expect(response.status).toBe(403)
    expect(approveEntry).not.toHaveBeenCalled()
    expect(rejectEntry).not.toHaveBeenCalled()
  })
})
