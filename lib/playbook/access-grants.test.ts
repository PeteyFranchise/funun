import {
  isGrantableRole,
  buildGrantMatrix,
  setRoomGrant,
  removeRoomGrant,
  GRANTABLE_ROLES,
} from './access-grants'
import { logStaffAction } from '@/lib/staff/audit'
import type { PlaybookRoom } from './rooms'

// ─── lib/playbook/access-grants.test.ts (31.2-03 Task 2) ──────────────────
// Unit-proves isGrantableRole + buildGrantMatrix (the pure tested surface),
// then proves setRoomGrant/removeRoomGrant reject a leadership target and
// call logStaffAction exactly once per successful change (D-31.2-01 audit
// guardrail, Pitfall 5 structural last-admin protection).

jest.mock('@/lib/staff/audit', () => ({
  logStaffAction: jest.fn(),
}))

describe('lib/playbook/access-grants isGrantableRole', () => {
  it('rejects leadership', () => {
    expect(isGrantableRole('leadership')).toBe(false)
  })

  it('rejects an unrecognized/non-StaffRole value', () => {
    expect(isGrantableRole('superadmin')).toBe(false)
    expect(isGrantableRole(undefined)).toBe(false)
    expect(isGrantableRole(42)).toBe(false)
  })

  it('accepts every other StaffRole', () => {
    for (const role of GRANTABLE_ROLES) {
      expect(isGrantableRole(role)).toBe(true)
    }
  })
})

describe('lib/playbook/access-grants buildGrantMatrix', () => {
  const rooms: PlaybookRoom[] = [
    { id: 'room-1', key: 'it-team', label: 'IT Team', sort_order: 4, sensitive: true, coming_soon: false },
    { id: 'room-2', key: 'ar', label: 'A&R', sort_order: 2, sensitive: false, coming_soon: true },
  ]

  it('never emits a leadership column', () => {
    const matrix = buildGrantMatrix(rooms, [])
    for (const entry of matrix) {
      expect(Object.keys(entry.grants)).not.toContain('leadership')
    }
  })

  it('marks granted (room,role) pairs true and everything else false', () => {
    const matrix = buildGrantMatrix(rooms, [{ room_id: 'room-1', role: 'it' }])
    const itRoom = matrix.find(e => e.room.key === 'it-team')!
    const arRoom = matrix.find(e => e.room.key === 'ar')!

    expect(itRoom.grants.it).toBe(true)
    expect(itRoom.grants.ae).toBe(false)
    expect(arRoom.grants.it).toBe(false)
  })

  it('produces one matrix entry per room, in the given order', () => {
    const matrix = buildGrantMatrix(rooms, [])
    expect(matrix.map(e => e.room.key)).toEqual(['it-team', 'ar'])
  })
})

describe('lib/playbook/access-grants setRoomGrant / removeRoomGrant', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
  })

  function mockService(writeError: { message: string } | null = null) {
    const upsert = jest.fn(async () => ({ error: writeError }))
    const firstEq = jest.fn(() => ({
      eq: jest.fn(async () => ({ error: writeError })),
    }))
    const del = jest.fn(() => ({ eq: firstEq }))

    return { from: jest.fn(() => ({ upsert, delete: del })), upsert, delete: del }
  }

  it('setRoomGrant rejects a leadership target — never inserts, never audits', async () => {
    const service = mockService()
    const result = await setRoomGrant(service as never, {
      roomId: 'room-1',
      role: 'leadership',
      actorId: 'u-lead',
    })

    expect(result.ok).toBe(false)
    expect(service.upsert).not.toHaveBeenCalled()
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('setRoomGrant writes the grant row and audits exactly once', async () => {
    const service = mockService()
    const result = await setRoomGrant(service as never, {
      roomId: 'room-1',
      role: 'it',
      actorId: 'u-lead',
    })

    expect(result.ok).toBe(true)
    expect(service.upsert).toHaveBeenCalledTimes(1)
    expect(logStaffAction).toHaveBeenCalledTimes(1)
    expect(logStaffAction).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        action: 'grant_playbook_room_role',
        changes: { room_id: 'room-1', role: 'it' },
      })
    )
  })

  it('removeRoomGrant rejects a leadership target — never deletes, never audits', async () => {
    const service = mockService()
    const result = await removeRoomGrant(service as never, {
      roomId: 'room-1',
      role: 'leadership',
      actorId: 'u-lead',
    })

    expect(result.ok).toBe(false)
    expect(service.delete).not.toHaveBeenCalled()
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('removeRoomGrant deletes the grant row and audits exactly once', async () => {
    const service = mockService()
    const result = await removeRoomGrant(service as never, {
      roomId: 'room-1',
      role: 'it',
      actorId: 'u-lead',
    })

    expect(result.ok).toBe(true)
    expect(service.delete).toHaveBeenCalledTimes(1)
    expect(logStaffAction).toHaveBeenCalledTimes(1)
    expect(logStaffAction).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        action: 'revoke_playbook_room_role',
        changes: { room_id: 'room-1', role: 'it' },
      })
    )
  })
})
