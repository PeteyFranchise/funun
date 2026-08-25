import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { loadRooms } from '@/lib/playbook/rooms'
import { readRoomGrants, setRoomGrant, removeRoomGrant } from '@/lib/playbook/access-grants'
import { GET, PATCH } from './route'

// ─── app/api/admin/playbook/rooms/route.test.ts (31.2-03 Task 3) ──────────
// Mirrors lib/admin/gate.test.ts's admin-route conventions: a non-leadership
// caller is 403'd on GET and PATCH (before any service/DB call); a PATCH
// targeting role 'leadership' is 400 (never reaches setRoomGrant); a valid
// grant PATCH is shaped to call setRoomGrant/removeRoomGrant, which is
// itself the audited write path (Task 2).

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => ({
  verifyAdmin: jest.fn(),
}))

jest.mock('@/lib/playbook/rooms', () => ({
  loadRooms: jest.fn(),
}))

jest.mock('@/lib/playbook/access-grants', () => {
  const actual = jest.requireActual('@/lib/playbook/access-grants')
  return {
    ...actual,
    readRoomGrants: jest.fn(),
    setRoomGrant: jest.fn(),
    removeRoomGrant: jest.fn(),
  }
})

const LEADERSHIP_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ROOM_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

const ROOMS = [
  { id: ROOM_UUID, key: 'it-team', label: 'IT Team', sort_order: 4, sensitive: true, coming_soon: false },
]

function jsonRequest(url: string, body: unknown, method = 'PATCH') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServiceClient as jest.Mock).mockReturnValue({})
  ;(loadRooms as jest.Mock).mockResolvedValue(ROOMS)
  ;(readRoomGrants as jest.Mock).mockResolvedValue([])
})

describe('GET /api/admin/playbook/rooms', () => {
  it('returns 403 for a non-leadership caller and never loads rooms/grants', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await GET()
    expect(res.status).toBe(403)
    expect(loadRooms).not.toHaveBeenCalled()
    expect(readRoomGrants).not.toHaveBeenCalled()
  })

  it('returns the room×role grant matrix for leadership, with no leadership column', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID } })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].room.key).toBe('it-team')
    expect(Object.keys(body.data[0].grants)).not.toContain('leadership')
  })
})

describe('PATCH /api/admin/playbook/rooms', () => {
  it('returns 403 for a non-leadership caller and never writes', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await PATCH(
      jsonRequest('http://t.local/api/admin/playbook/rooms', { roomId: ROOM_UUID, role: 'it', granted: true })
    )
    expect(res.status).toBe(403)
    expect(setRoomGrant).not.toHaveBeenCalled()
    expect(removeRoomGrant).not.toHaveBeenCalled()
  })

  it('rejects a PATCH targeting role "leadership" with 400 and never calls setRoomGrant', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID } })

    const res = await PATCH(
      jsonRequest('http://t.local/api/admin/playbook/rooms', {
        roomId: ROOM_UUID,
        role: 'leadership',
        granted: true,
      })
    )
    expect(res.status).toBe(400)
    expect(setRoomGrant).not.toHaveBeenCalled()
    expect(removeRoomGrant).not.toHaveBeenCalled()
  })

  it('rejects an unrecognized role with 400', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID } })

    const res = await PATCH(
      jsonRequest('http://t.local/api/admin/playbook/rooms', {
        roomId: ROOM_UUID,
        role: 'superadmin',
        granted: true,
      })
    )
    expect(res.status).toBe(400)
    expect(setRoomGrant).not.toHaveBeenCalled()
  })

  it('rejects a non-strict body (extra field) with 400', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID } })

    const res = await PATCH(
      jsonRequest('http://t.local/api/admin/playbook/rooms', {
        roomId: ROOM_UUID,
        role: 'it',
        granted: true,
        evil_field: 'nope',
      })
    )
    expect(res.status).toBe(400)
    expect(setRoomGrant).not.toHaveBeenCalled()
  })

  it('a valid grant=true PATCH calls setRoomGrant with the session-derived actorId, never a body-supplied one', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID } })
    ;(setRoomGrant as jest.Mock).mockResolvedValue({ ok: true })

    const res = await PATCH(
      jsonRequest('http://t.local/api/admin/playbook/rooms', {
        roomId: ROOM_UUID,
        role: 'it',
        granted: true,
      })
    )
    expect(res.status).toBe(200)
    expect(setRoomGrant).toHaveBeenCalledTimes(1)
    expect(setRoomGrant).toHaveBeenCalledWith(
      expect.anything(),
      { roomId: ROOM_UUID, role: 'it', actorId: LEADERSHIP_UUID }
    )
    expect(removeRoomGrant).not.toHaveBeenCalled()
  })

  it('a valid grant=false PATCH calls removeRoomGrant', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID } })
    ;(removeRoomGrant as jest.Mock).mockResolvedValue({ ok: true })

    const res = await PATCH(
      jsonRequest('http://t.local/api/admin/playbook/rooms', {
        roomId: ROOM_UUID,
        role: 'it',
        granted: false,
      })
    )
    expect(res.status).toBe(200)
    expect(removeRoomGrant).toHaveBeenCalledTimes(1)
    expect(setRoomGrant).not.toHaveBeenCalled()
  })

  it('returns 500 when the write fails, without a 200 matrix response', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID } })
    ;(setRoomGrant as jest.Mock).mockResolvedValue({ ok: false, error: 'boom' })

    const res = await PATCH(
      jsonRequest('http://t.local/api/admin/playbook/rooms', {
        roomId: ROOM_UUID,
        role: 'it',
        granted: true,
      })
    )
    expect(res.status).toBe(500)
  })
})
