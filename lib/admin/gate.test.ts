import { getStaffRole, requireStaff, verifyAdmin } from '@/lib/admin/gate'
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
