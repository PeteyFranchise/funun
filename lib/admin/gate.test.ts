import { getStaffRole, getStaffRoles, requireStaff, verifyAdmin } from '@/lib/admin/gate'
import { createApiClient } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
}))

// ─── Fixtures ────────────────────────────────────────────────────────────
// getStaffRole reads only app_metadata; mirror lib/buyers/permissions.test.ts's
// typed-fixture-at-top structure.

function mockSession(user: unknown) {
  ;(createApiClient as jest.Mock).mockResolvedValue({
    auth: { getUser: jest.fn(async () => ({ data: { user } })) },
  })
}

describe('lib/admin/gate getStaffRole', () => {
  it('returns leadership for app_metadata.staff_role = leadership', () => {
    expect(getStaffRole({ app_metadata: { staff_role: 'leadership' } })).toBe('leadership')
  })

  it('returns ae and bd for those exact staff_role values', () => {
    expect(getStaffRole({ app_metadata: { staff_role: 'ae' } })).toBe('ae')
    expect(getStaffRole({ app_metadata: { staff_role: 'bd' } })).toBe('bd')
  })

  it('returns leadership when is_admin === true (D-02/A1 bootstrap fallback)', () => {
    expect(getStaffRole({ app_metadata: { is_admin: true } })).toBe('leadership')
  })

  it('returns null for an unrecognized staff_role string', () => {
    expect(getStaffRole({ app_metadata: { staff_role: 'superadmin' } })).toBe(null)
  })

  it('degrades to null from missing/undefined app_metadata, never throws (fail-closed)', () => {
    expect(() => getStaffRole({})).not.toThrow()
    expect(getStaffRole({})).toBe(null)
    expect(() => getStaffRole({ app_metadata: undefined })).not.toThrow()
    expect(getStaffRole({ app_metadata: undefined })).toBe(null)
  })

  it('staff_role wins over is_admin when both are present (explicit role is authoritative)', () => {
    expect(getStaffRole({ app_metadata: { staff_role: 'ae', is_admin: true } })).toBe('ae')
  })
})

describe('lib/admin/gate requireStaff', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 Unauthorized when there is no session', async () => {
    mockSession(null)
    const result = await requireStaff()
    expect(result).toEqual({ error: 'Unauthorized', status: 401 })
  })

  it('returns 403 Forbidden when the caller role is not in allowed', async () => {
    mockSession({ id: 'u1', app_metadata: { staff_role: 'bd' } })
    const result = await requireStaff(['leadership'])
    expect(result).toEqual({ error: 'Forbidden', status: 403 })
  })

  it('returns 403 Forbidden when the caller has no recognized staff role at all', async () => {
    mockSession({ id: 'u1', app_metadata: {} })
    const result = await requireStaff()
    expect(result).toEqual({ error: 'Forbidden', status: 403 })
  })

  it('returns { user, staffRole } on success', async () => {
    const user = { id: 'u1', app_metadata: { staff_role: 'ae' } }
    mockSession(user)
    const result = await requireStaff(['leadership', 'ae', 'bd'])
    expect(result).toEqual({ user, staffRole: 'ae' })
  })
})

describe('lib/admin/gate verifyAdmin (preserved leadership alias)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns { user } on success (unchanged public shape for existing callers)', async () => {
    const user = { id: 'u1', app_metadata: { is_admin: true } }
    mockSession(user)
    const result = await verifyAdmin()
    expect('error' in result).toBe(false)
    expect((result as { user: unknown }).user).toEqual(user)
  })

  it('returns 403 Forbidden for a non-leadership staff role', async () => {
    mockSession({ id: 'u1', app_metadata: { staff_role: 'ae' } })
    const result = await verifyAdmin()
    expect(result).toEqual({ error: 'Forbidden', status: 403 })
  })

  it('returns 401 Unauthorized when there is no session', async () => {
    mockSession(null)
    const result = await verifyAdmin()
    expect(result).toEqual({ error: 'Unauthorized', status: 401 })
  })
})

// ─── Multi-role (Team Members redesign) ────────────────────────────────────
describe('lib/admin/gate getStaffRoles (multi-role)', () => {
  it('reads the full set from app_metadata.staff_roles, priority-sorted', () => {
    // stored order is [tms, leadership]; leadership outranks tms
    expect(getStaffRoles({ app_metadata: { staff_roles: ['tms', 'leadership'] } })).toEqual([
      'leadership',
      'tms',
    ])
  })

  it('recognizes the new legal + tms roles', () => {
    expect(getStaffRoles({ app_metadata: { staff_roles: ['legal', 'tms'] } })).toEqual([
      'legal',
      'tms',
    ])
  })

  it('filters out unrecognized entries and dedupes', () => {
    expect(getStaffRoles({ app_metadata: { staff_roles: ['ae', 'bogus', 'ae', 'legal'] } })).toEqual([
      'ae',
      'legal',
    ])
  })

  it('falls back to the legacy single staff_role when the array is absent/empty', () => {
    expect(getStaffRoles({ app_metadata: { staff_role: 'bd' } })).toEqual(['bd'])
    expect(getStaffRoles({ app_metadata: { staff_roles: [], staff_role: 'ae' } })).toEqual(['ae'])
  })

  it('falls back to leadership for the is_admin bootstrap, and [] for non-staff', () => {
    expect(getStaffRoles({ app_metadata: { is_admin: true } })).toEqual(['leadership'])
    expect(getStaffRoles({})).toEqual([])
    expect(getStaffRoles({ app_metadata: { staff_roles: ['nope'] } })).toEqual([])
  })

  it('getStaffRole returns the PRIMARY (highest-priority) role of the set', () => {
    expect(getStaffRole({ app_metadata: { staff_roles: ['tms', 'leadership'] } })).toBe('leadership')
    expect(getStaffRole({ app_metadata: { staff_roles: ['tms', 'ae'] } })).toBe('ae')
  })
})

describe('lib/admin/gate requireStaff (multi-role)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('passes when ANY of the member’s roles is allowed (ae+tms person via a leadership+tms gate)', async () => {
    const user = { id: 'u1', app_metadata: { staff_roles: ['ae', 'tms'] } }
    mockSession(user)
    const result = await requireStaff(['leadership', 'tms'])
    // matches via tms; returns the primary role (ae outranks tms)
    expect(result).toEqual({ user, staffRole: 'ae' })
  })

  it('still 403s a multi-role member when none of their roles is allowed', async () => {
    mockSession({ id: 'u1', app_metadata: { staff_roles: ['ae', 'bd'] } })
    const result = await requireStaff(['leadership'])
    expect(result).toEqual({ error: 'Forbidden', status: 403 })
  })
})
