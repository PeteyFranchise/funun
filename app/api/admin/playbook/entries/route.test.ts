import { createServiceClient } from '@/lib/supabase/server'
import { logStaffAction } from '@/lib/staff/audit'
import { requireRoomAccess, isRoomLead, createEntry, listEntries } from '@/lib/playbook/entries'
import { POST, GET } from './route'

// ─── /api/admin/playbook/entries (31.2-04 Task 2) ──────────────────────────
// Mirrors app/api/admin/pipeline-stages/route.test.ts's fake-chainable-
// service convention. Covers: a non-granted caller is 403; a regular
// member's create lands draft_pending regardless of any body flag
// (zod .strict() also rejects an unlisted status/approver key outright);
// leadership/room-lead lands published; every create audits.

jest.mock('@/lib/playbook/entries', () => ({
  requireRoomAccess: jest.fn(),
  isRoomLead: jest.fn(),
  createEntry: jest.fn(),
  listEntries: jest.fn(),
}))

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/staff/audit', () => ({
  logStaffAction: jest.fn(),
}))

const ROOM_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MEMBER_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const LEADERSHIP_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ENTRY_UUID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

function jsonRequest(url: string, body: unknown, method: string) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockService(options: { room?: Record<string, unknown> | null } = {}) {
  const { room = { id: ROOM_UUID } } = options

  const from = jest.fn((table: string) => {
    if (table === 'playbook_rooms') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: room, error: null })),
          })),
        })),
      }
    }
    throw new Error(`Unexpected table in test: ${table}`)
  })

  return { from }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
  ;(createServiceClient as jest.Mock).mockReturnValue(mockService())
})

describe('POST /api/admin/playbook/entries — room access gate', () => {
  it('returns 403 when the caller has no access to the target room', async () => {
    ;(requireRoomAccess as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await POST(
      jsonRequest(
        'http://t.local/api/admin/playbook/entries',
        { roomKey: 'ae-sales', entryType: 'sop', title: 'New SOP', content: { steps: ['a'] } },
        'POST'
      )
    )

    expect(res.status).toBe(403)
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('rejects an unknown top-level key (e.g. a client-supplied status) with 400 and never calls createEntry', async () => {
    const res = await POST(
      jsonRequest(
        'http://t.local/api/admin/playbook/entries',
        { roomKey: 'ae-sales', entryType: 'sop', title: 'New SOP', content: {}, status: 'published' },
        'POST'
      )
    )

    expect(res.status).toBe(400)
    expect(requireRoomAccess).not.toHaveBeenCalled()
    expect(createEntry).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/playbook/entries — role-tiered publish gate', () => {
  it('a regular member lands draft_pending regardless of the body — isApprover=false is passed to createEntry', async () => {
    ;(requireRoomAccess as jest.Mock).mockResolvedValue({
      user: { id: MEMBER_UUID },
      staffRole: 'ae',
    })
    ;(isRoomLead as jest.Mock).mockResolvedValue(false)
    ;(createEntry as jest.Mock).mockResolvedValue({
      data: { id: ENTRY_UUID, status: 'draft_pending' },
    })

    const res = await POST(
      jsonRequest(
        'http://t.local/api/admin/playbook/entries',
        { roomKey: 'ae-sales', entryType: 'topic', title: 'Coaching topic', content: { body: 'x' } },
        'POST'
      )
    )

    expect(res.status).toBe(200)
    expect(createEntry).toHaveBeenCalledTimes(1)
    const call = (createEntry as jest.Mock).mock.calls[0][1]
    expect(call.isApprover).toBe(false)
    expect(logStaffAction).toHaveBeenCalledTimes(1)
  })

  it('leadership lands published directly — isApprover=true, no isRoomLead DB read needed', async () => {
    ;(requireRoomAccess as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    ;(createEntry as jest.Mock).mockResolvedValue({
      data: { id: ENTRY_UUID, status: 'published' },
    })

    const res = await POST(
      jsonRequest(
        'http://t.local/api/admin/playbook/entries',
        { roomKey: 'ae-sales', entryType: 'sop', title: 'New SOP', content: { steps: ['a'] } },
        'POST'
      )
    )

    expect(res.status).toBe(200)
    const call = (createEntry as jest.Mock).mock.calls[0][1]
    expect(call.isApprover).toBe(true)
    expect(isRoomLead).not.toHaveBeenCalled()
    expect(logStaffAction).toHaveBeenCalledTimes(1)
  })

  it('a room-lead (non-leadership) lands published directly via isRoomLead', async () => {
    ;(requireRoomAccess as jest.Mock).mockResolvedValue({
      user: { id: MEMBER_UUID },
      staffRole: 'ae',
    })
    ;(isRoomLead as jest.Mock).mockResolvedValue(true)
    ;(createEntry as jest.Mock).mockResolvedValue({
      data: { id: ENTRY_UUID, status: 'published' },
    })

    const res = await POST(
      jsonRequest(
        'http://t.local/api/admin/playbook/entries',
        { roomKey: 'ae-sales', entryType: 'sop', title: 'New SOP', content: {} },
        'POST'
      )
    )

    expect(res.status).toBe(200)
    const call = (createEntry as jest.Mock).mock.calls[0][1]
    expect(call.isApprover).toBe(true)
  })

  it('returns 404 when the room key does not resolve to a room', async () => {
    ;(requireRoomAccess as jest.Mock).mockResolvedValue({
      user: { id: MEMBER_UUID },
      staffRole: 'ae',
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(mockService({ room: null }))

    const res = await POST(
      jsonRequest(
        'http://t.local/api/admin/playbook/entries',
        { roomKey: 'nonexistent-room', entryType: 'sop', title: 'x', content: {} },
        'POST'
      )
    )

    expect(res.status).toBe(404)
    expect(createEntry).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/playbook/entries', () => {
  it('returns 400 when roomKey is missing', async () => {
    const res = await GET(new Request('http://t.local/api/admin/playbook/entries'))
    expect(res.status).toBe(400)
    expect(requireRoomAccess).not.toHaveBeenCalled()
  })

  it('returns 403 when the caller has no room access', async () => {
    ;(requireRoomAccess as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await GET(new Request('http://t.local/api/admin/playbook/entries?roomKey=ae-sales'))
    expect(res.status).toBe(403)
    expect(listEntries).not.toHaveBeenCalled()
  })

  it('lists room-scoped entries for a granted caller', async () => {
    ;(requireRoomAccess as jest.Mock).mockResolvedValue({
      user: { id: MEMBER_UUID },
      staffRole: 'ae',
    })
    ;(listEntries as jest.Mock).mockResolvedValue({
      data: [{ id: ENTRY_UUID, status: 'published' }],
    })

    const res = await GET(new Request('http://t.local/api/admin/playbook/entries?roomKey=ae-sales'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(listEntries).toHaveBeenCalledWith(expect.anything(), { roomId: ROOM_UUID, viewerId: MEMBER_UUID })
  })
})
