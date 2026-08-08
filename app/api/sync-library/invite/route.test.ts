import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { createNotification } from '@/lib/notifications'
import { POST } from './route'

// ─── POST /api/sync-library/invite — staff mints the admin_invited grant ──
// Colocated route test, mirroring app/api/admin/buyer-orgs/[id]/route.test.ts's
// requireStaff/logStaffAction mocking conventions. lib/social/notifications.ts's
// buildSyncLibraryInviteNotification is left UNMOCKED (pure function) — only the
// createNotification DB write is mocked, matching __tests__/docuseal-webhook.test.ts.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => ({
  requireStaff: jest.fn(),
}))

jest.mock('@/lib/staff/audit', () => ({
  logStaffAction: jest.fn(),
}))

jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(),
}))

const LEADERSHIP_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const AE_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const ARTIST_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

function jsonRequest(body: unknown) {
  return new Request('http://t.local/api/sync-library/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

type Resolution = { data?: unknown; error?: unknown }

function chain(resolution: Resolution) {
  const builder: Record<string, unknown> = {}
  builder.select = jest.fn(() => builder)
  builder.eq = jest.fn(() => builder)
  builder.in = jest.fn(() => builder)
  builder.insert = jest.fn(() => builder)
  builder.maybeSingle = jest.fn(async () => resolution)
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(resolution).then(resolve, reject)
  return builder
}

function mockService(sequence: Record<string, Resolution[]>) {
  const builders: Record<string, ReturnType<typeof chain>[]> = {}
  const calls: Record<string, number> = {}
  const from = jest.fn((table: string) => {
    const idx = calls[table] ?? 0
    calls[table] = idx + 1
    const seq = sequence[table] ?? []
    const resolution = seq[idx] ?? seq[seq.length - 1] ?? { data: null, error: null }
    const builder = chain(resolution)
    builders[table] = builders[table] ?? []
    builders[table].push(builder)
    return builder
  })
  return { from, builders }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
  ;(createNotification as jest.Mock).mockResolvedValue({ ok: true })
})

describe('POST /api/sync-library/invite', () => {
  it('returns 401 for an unauthenticated caller and never touches the DB', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })

    const res = await POST(jsonRequest({ profileId: ARTIST_UUID }))

    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 403 for staff outside leadership/ae (e.g. bd)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await POST(jsonRequest({ profileId: ARTIST_UUID }))

    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 400 for a missing/empty profileId and never touches the DB', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })

    const res = await POST(jsonRequest({}))

    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 404 when the target profile is not a real artist account', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({
      user_profiles: [{ data: null, error: null }],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ profileId: ARTIST_UUID }))

    expect(res.status).toBe(404)
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('mints an approved admin_invited sync_library grant, notifies, and audits (leadership)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({
      user_profiles: [{ data: { id: ARTIST_UUID, member_type: 'artist' }, error: null }],
      capability_grants: [
        { data: null, error: null }, // idempotency check — no existing active grant
        { data: { id: 'grant-1', status: 'approved' }, error: null }, // insert result
      ],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ profileId: ARTIST_UUID }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data).toEqual({ grantId: 'grant-1', status: 'approved' })

    const insertBuilder = service.builders.capability_grants[1]
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        profile_id: ARTIST_UUID,
        capability: 'sync_library',
        status: 'approved',
        source: 'admin_invited',
        decided_by: LEADERSHIP_UUID,
      })
    )

    expect(createNotification).toHaveBeenCalledTimes(1)
    const [, payload] = (createNotification as jest.Mock).mock.calls[0]
    expect(payload.userId).toBe(ARTIST_UUID)
    expect(payload.type).toBe('sync_library_invite')

    expect(logStaffAction).toHaveBeenCalledWith(service, {
      actorId: LEADERSHIP_UUID,
      action: 'sync_library.invite',
      targetType: 'capability_grant',
      targetId: 'grant-1',
      changes: { profileId: ARTIST_UUID },
    })
  })

  it('allows an ae to invite (role set is leadership+ae)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      user_profiles: [{ data: { id: ARTIST_UUID, member_type: 'artist' }, error: null }],
      capability_grants: [
        { data: null, error: null },
        { data: { id: 'grant-2', status: 'approved' }, error: null },
      ],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ profileId: ARTIST_UUID }))

    expect(res.status).toBe(201)
    expect(requireStaff).toHaveBeenCalledWith(['leadership', 'ae'])
  })

  it('is idempotent — an existing active grant is returned without a duplicate insert or notification', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({
      user_profiles: [{ data: { id: ARTIST_UUID, member_type: 'artist' }, error: null }],
      capability_grants: [{ data: { id: 'existing-grant', status: 'approved' }, error: null }],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ profileId: ARTIST_UUID }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ grantId: 'existing-grant', status: 'approved' })
    expect(service.builders.capability_grants).toHaveLength(1)
    expect(createNotification).not.toHaveBeenCalled()
    expect(logStaffAction).toHaveBeenCalledWith(service, {
      actorId: LEADERSHIP_UUID,
      action: 'sync_library.invite',
      targetType: 'capability_grant',
      targetId: 'existing-grant',
      changes: { profileId: ARTIST_UUID, idempotent: true },
    })
  })
})
