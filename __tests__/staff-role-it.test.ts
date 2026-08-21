import { getStaffRole, ALL_STAFF_ROLES, OPERATIONAL_STAFF_ROLES } from '@/lib/admin/staff-role'
import { createApiClient, createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServerClient: jest.fn(),
}))

// next/navigation's redirect() throws internally in the real Next.js
// runtime (a special NEXT_REDIRECT digest error) and never returns — mock
// it as a sentinel-throwing function so requireStaffPage()'s callers can
// be asserted without a full Next.js request context.
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

function mockPageSession(user: unknown) {
  ;(createServerClient as jest.Mock).mockResolvedValue({
    auth: { getUser: jest.fn(async () => ({ data: { user } })) },
  })
}

function mockApiSession(user: unknown) {
  ;(createApiClient as jest.Mock).mockResolvedValue({
    auth: { getUser: jest.fn(async () => ({ data: { user } })) },
  })
}

// ─── Task 1: 'it' StaffRole recognition (Phase 33 / D-01) ─────────────────
// Wave 0 test — written FIRST (RED) before lib/admin/staff-role.ts is
// widened to recognize 'it'. Mirrors lib/admin/gate.test.ts's typed-fixture
// conventions for getStaffRole.

describe('staff-role.ts getStaffRole — it role (Phase 33)', () => {
  it('returns it for app_metadata.staff_role = it', () => {
    expect(getStaffRole({ app_metadata: { staff_role: 'it' } })).toBe('it')
  })

  it('ALL_STAFF_ROLES contains it and still contains leadership/ae/bd/anr (+ legal/tms)', () => {
    expect(ALL_STAFF_ROLES).toContain('it')
    expect(ALL_STAFF_ROLES).toContain('leadership')
    expect(ALL_STAFF_ROLES).toContain('ae')
    expect(ALL_STAFF_ROLES).toContain('bd')
    expect(ALL_STAFF_ROLES).toContain('anr')
    // Team Members redesign added the multi-role staff roles:
    expect(ALL_STAFF_ROLES).toContain('legal')
    expect(ALL_STAFF_ROLES).toContain('tms')
    expect(ALL_STAFF_ROLES).toHaveLength(7)
  })

  it('getStaffRole for leadership/ae/bd/anr is unchanged', () => {
    expect(getStaffRole({ app_metadata: { staff_role: 'leadership' } })).toBe('leadership')
    expect(getStaffRole({ app_metadata: { staff_role: 'ae' } })).toBe('ae')
    expect(getStaffRole({ app_metadata: { staff_role: 'bd' } })).toBe('bd')
    expect(getStaffRole({ app_metadata: { staff_role: 'anr' } })).toBe('anr')
  })

  it('returns leadership when is_admin === true (owner bootstrap unaffected)', () => {
    expect(getStaffRole({ app_metadata: { is_admin: true } })).toBe('leadership')
  })

  it('returns null and never throws for missing app_metadata (fail closed)', () => {
    expect(() => getStaffRole({})).not.toThrow()
    expect(getStaffRole({})).toBe(null)
  })

  it('rejects an unrecognized staff_role string', () => {
    expect(getStaffRole({ app_metadata: { staff_role: 'superadmin' } })).toBe(null)
  })
})

// ─── Task 2: requireStaffPage() page-context guard (Phase 33 / D-02) ──────
// Mocks @/lib/supabase/server (createServerClient) and next/navigation
// (redirect throws a sentinel), mirroring app/(admin)/layout.tsx's own
// createServerClient + getUser + redirect() idiom.

describe('gate.ts requireStaffPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns { user, staffRole } for an it caller', async () => {
    const { requireStaffPage } = await import('@/lib/admin/gate')
    const user = { id: 'u1', app_metadata: { staff_role: 'it' } }
    mockPageSession(user)
    const result = await requireStaffPage(['leadership', 'it'])
    expect(result).toEqual({ user, staffRole: 'it' })
  })

  it('returns { user, staffRole } for a leadership caller', async () => {
    const { requireStaffPage } = await import('@/lib/admin/gate')
    const user = { id: 'u2', app_metadata: { staff_role: 'leadership' } }
    mockPageSession(user)
    const result = await requireStaffPage(['leadership', 'it'])
    expect(result).toEqual({ user, staffRole: 'leadership' })
  })

  it("redirects to '/' when the caller role is not in allowed (ae excluded)", async () => {
    const { requireStaffPage } = await import('@/lib/admin/gate')
    mockPageSession({ id: 'u3', app_metadata: { staff_role: 'ae' } })
    await expect(requireStaffPage(['leadership', 'it'])).rejects.toThrow('REDIRECT:/')
    expect(redirect).toHaveBeenCalledWith('/')
  })

  it("redirects to '/signin' when there is no session", async () => {
    const { requireStaffPage } = await import('@/lib/admin/gate')
    mockPageSession(null)
    await expect(requireStaffPage(['leadership', 'it'])).rejects.toThrow('REDIRECT:/signin')
    expect(redirect).toHaveBeenCalledWith('/signin')
  })
})

// ─── Task 3: CR-01 hardening — fail-closed default staff guard ────────────
// Code-review finding CR-01: before Phase 33 the default staff set was
// exactly ['leadership','ae','bd','anr']. Widening ALL_STAFF_ROLES to
// include 'it' silently widened every requireStaff()/requireStaffPage()
// call that relied on the default, admitting the read-only 'it' role to
// admin surfaces (Crate Requests, Selects, My Client Partners, Artist
// Invites, Directory, client/clients workspaces) that migration 114's own
// invariant says 'it' must never reach. These tests lock the fix:
// OPERATIONAL_STAFF_ROLES excludes 'it', and both guards DENY an 'it'
// caller when no explicit allowlist is passed — 'it' is admitted only
// where a caller lists it explicitly (e.g. requireStaffPage(['leadership',
// 'it']) above, which the Playbook IT room's pages use).

describe('OPERATIONAL_STAFF_ROLES (CR-01 hardening)', () => {
  it('excludes it but contains every other staff role (incl. legal/tms)', () => {
    expect(OPERATIONAL_STAFF_ROLES).not.toContain('it')
    expect(OPERATIONAL_STAFF_ROLES).toContain('leadership')
    expect(OPERATIONAL_STAFF_ROLES).toContain('ae')
    expect(OPERATIONAL_STAFF_ROLES).toContain('bd')
    expect(OPERATIONAL_STAFF_ROLES).toContain('anr')
    // legal + tms are operational staff (they work inside the console):
    expect(OPERATIONAL_STAFF_ROLES).toContain('legal')
    expect(OPERATIONAL_STAFF_ROLES).toContain('tms')
    expect(OPERATIONAL_STAFF_ROLES).toHaveLength(6)
  })
})

describe('requireStaff() default (CR-01 hardening)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('denies an it caller by default (403 Forbidden, not admitted to general staff surfaces)', async () => {
    const { requireStaff } = await import('@/lib/admin/gate')
    mockApiSession({ id: 'u5', app_metadata: { staff_role: 'it' } })
    const result = await requireStaff()
    expect(result).toEqual({ error: 'Forbidden', status: 403 })
  })

  it('still admits a leadership caller by default (unchanged behavior)', async () => {
    const { requireStaff } = await import('@/lib/admin/gate')
    const user = { id: 'u6', app_metadata: { staff_role: 'leadership' } }
    mockApiSession(user)
    const result = await requireStaff()
    expect(result).toEqual({ user, staffRole: 'leadership' })
  })
})

describe('requireStaffPage() default (CR-01 hardening)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("redirects an it caller to '/' by default (not admitted to general staff surfaces)", async () => {
    const { requireStaffPage } = await import('@/lib/admin/gate')
    mockPageSession({ id: 'u7', app_metadata: { staff_role: 'it' } })
    await expect(requireStaffPage()).rejects.toThrow('REDIRECT:/')
    expect(redirect).toHaveBeenCalledWith('/')
  })

  it('still admits a leadership caller by default (unchanged behavior)', async () => {
    const { requireStaffPage } = await import('@/lib/admin/gate')
    const user = { id: 'u8', app_metadata: { staff_role: 'leadership' } }
    mockPageSession(user)
    const result = await requireStaffPage()
    expect(result).toEqual({ user, staffRole: 'leadership' })
  })
})
