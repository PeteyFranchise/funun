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

// ─── D-31.1-01 hide-not-filter contract (31.1 plan 04, Task 3) ────────────
// Proves the Client Partners room's server-side leadership gate: a
// non-leadership caller (ae/bd) never triggers
// lib/client-partners/signals.ts's loadWholeBookWithCoverage — the
// whole-book/coverage/By-AE data is never fetched for them at all, not
// merely filtered out client-side (T-31.1-info-disclosure). The decision
// point is app/(admin)/admin/client-partners/page.tsx's exported
// loadClientPartnersRoomData(), factored out of the page component so it's
// testable here without rendering or mocking next/navigation.
// requireStaffPage() itself (the auth call BEFORE this function is ever
// reached — 'it'/no-role/unauthenticated redirect before any load) is
// already exhaustively covered by __tests__/staff-role-it.test.ts; this
// suite covers only the leadership/non-leadership data-branch it gates.
describe('client-partners room — D-31.1-01 hide-not-filter (loadClientPartnersRoomData)', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  function mockRoomSignals() {
    jest.doMock('@/lib/client-partners/signals', () => ({
      loadBook: jest.fn(async () => []),
      loadWholeBookWithCoverage: jest.fn(async () => []),
    }))
  }

  // 31.2 plan 10: loadClientPartnersRoomData ALSO computes the leadership-
  // only engagement rollup (R13/D-31.2-13/T-31.2-27) via the SAME
  // isLeadership branch as allData above — mocked separately so these tests
  // can assert buildEngagementRollup is never invoked for a non-leadership
  // caller (hide-not-filter, identical discipline to loadWholeBookWithCoverage).
  function mockEngagementRollup() {
    jest.doMock('@/lib/selects/engagement-rollup', () => ({
      buildEngagementRollup: jest.fn(async () => ({ byAe: [] })),
    }))
  }

  // 31.1 plan 06: loadClientPartnersRoomData now ALSO queries
  // onboarding_tasks (every caller, via listOpenOnboardingTasks) and, for
  // leadership, funun_staff (via loadAssignableAeList's aeList roster) —
  // both real SupabaseClient chains this suite's real (non-mocked)
  // lib/client-partners/onboarding + lib/client-partners/coverage helpers
  // issue against `service`. A minimal chainable fake stands in for both.
  //
  // 31.2 plan 09: loadClientPartnersRoomData ALSO calls buildTodaysPlayData,
  // which queries `plays` via lib/playbook/plays.ts's loadActivePlay
  // (.select().eq().maybeSingle()) — maybeSingle() resolving to { data: null }
  // means "no active play," so buildTodaysPlayData short-circuits before
  // ever reaching play_assignments/play_assignment_completions.
  function mockService() {
    const builder = {
      select: () => builder,
      eq: () => builder,
      overlaps: () => builder,
      order: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    }
    return { from: () => builder } as unknown as Parameters<
      typeof import('@/app/(admin)/admin/client-partners/page').loadClientPartnersRoomData
    >[0]
  }

  it('never calls loadWholeBookWithCoverage/buildEngagementRollup and returns allData=null/engagementRollup=null for an ae caller', async () => {
    mockRoomSignals()
    mockEngagementRollup()
    const { loadClientPartnersRoomData } = await import('@/app/(admin)/admin/client-partners/page')
    const { loadWholeBookWithCoverage, loadBook } = await import('@/lib/client-partners/signals')
    const { buildEngagementRollup } = await import('@/lib/selects/engagement-rollup')

    const result = await loadClientPartnersRoomData(mockService(), { userId: 'u-ae', staffRole: 'ae' })

    expect(loadBook).toHaveBeenCalledTimes(1)
    expect(loadWholeBookWithCoverage).not.toHaveBeenCalled()
    expect(buildEngagementRollup).not.toHaveBeenCalled()
    expect(result.allData).toBeNull()
    expect(result.engagementRollup).toBeNull()
    expect(result.isLeadership).toBe(false)
    expect(result.openOnboardingTasks).toEqual([])
  })

  it('never calls loadWholeBookWithCoverage/buildEngagementRollup and returns allData=null/engagementRollup=null for a bd caller', async () => {
    mockRoomSignals()
    mockEngagementRollup()
    const { loadClientPartnersRoomData } = await import('@/app/(admin)/admin/client-partners/page')
    const { loadWholeBookWithCoverage } = await import('@/lib/client-partners/signals')
    const { buildEngagementRollup } = await import('@/lib/selects/engagement-rollup')

    const result = await loadClientPartnersRoomData(mockService(), { userId: 'u-bd', staffRole: 'bd' })

    expect(loadWholeBookWithCoverage).not.toHaveBeenCalled()
    expect(buildEngagementRollup).not.toHaveBeenCalled()
    expect(result.allData).toBeNull()
    expect(result.engagementRollup).toBeNull()
  })

  it('calls loadWholeBookWithCoverage/buildEngagementRollup and returns populated allData/engagementRollup ONLY for leadership', async () => {
    mockRoomSignals()
    mockEngagementRollup()
    const { loadClientPartnersRoomData } = await import('@/app/(admin)/admin/client-partners/page')
    const { loadWholeBookWithCoverage } = await import('@/lib/client-partners/signals')
    const { buildEngagementRollup } = await import('@/lib/selects/engagement-rollup')

    const result = await loadClientPartnersRoomData(mockService(), { userId: 'u-lead', staffRole: 'leadership' })

    expect(loadWholeBookWithCoverage).toHaveBeenCalledTimes(1)
    expect(buildEngagementRollup).toHaveBeenCalledTimes(1)
    expect(result.allData).not.toBeNull()
    expect(result.engagementRollup).toEqual({ byAe: [] })
    expect(result.isLeadership).toBe(true)
    expect(result.allData?.coverage.totalClients).toBe(0)
    expect(result.allData?.aeList).toEqual([])
  })
})
