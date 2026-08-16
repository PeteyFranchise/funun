import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { loadSelectsInScope } from '@/lib/selects/persistence'
import { POST } from './route'

// ─── POST /api/admin/selects/[id]/send — send-guard test (31-04 Task 3) ────
// Colocated route test, mirroring app/api/admin/buyer-orgs/[id]/route.test.ts's
// mock-requireStaff/mock-createServiceClient convention. Covers the two
// independent guards: the illegal-transition rejection (isLegalSelectsTransition,
// imported directly by route.ts) and the empty-Selects guard (R11 AC), plus the
// success path minting the shareUrl.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => ({
  requireStaff: jest.fn(),
}))

jest.mock('@/lib/selects/persistence', () => ({
  loadSelectsInScope: jest.fn(),
}))

const AE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SELECTS_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

function jsonRequest(body: unknown = {}) {
  return new Request(`http://t.local/api/admin/selects/${SELECTS_ID}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockService(options: { trackCount?: number; updateResult?: Record<string, unknown> | null } = {}) {
  const { trackCount = 0, updateResult = null } = options
  const updateSpy = jest.fn((update: Record<string, unknown>) => {
    const builder: { eq: jest.Mock; select: jest.Mock } = {
      eq: jest.fn(() => builder),
      select: jest.fn(() => ({
        maybeSingle: jest.fn(async () => ({
          data: updateResult ? { ...updateResult, ...update } : null,
          error: updateResult ? null : { message: 'update failed' },
        })),
      })),
    }
    return builder
  })
  const countBuilder: { eq: jest.Mock; is: jest.Mock } = {
    eq: jest.fn(() => countBuilder),
    is: jest.fn(() => Promise.resolve({ count: trackCount, error: null })),
  }
  const selectSpy = jest.fn(() => countBuilder)
  const from = jest.fn((table: string) => {
    if (table === 'selects_tracks') return { select: selectSpy }
    return { update: updateSpy }
  })
  return { from, updateSpy, selectSpy }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_ID }, staffRole: 'ae' })
})

describe('POST /api/admin/selects/[id]/send', () => {
  it('rejects sending an already-approved Selects (illegal transition, no re-send)', async () => {
    ;(loadSelectsInScope as jest.Mock).mockResolvedValue({ id: SELECTS_ID, status: 'approved' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest(), { params: Promise.resolve({ id: SELECTS_ID }) })

    expect(res.status).toBe(400)
    expect(service.updateSpy).not.toHaveBeenCalled()
  })

  it('rejects sending a draft Selects with zero non-removed tracks (R11 AC)', async () => {
    ;(loadSelectsInScope as jest.Mock).mockResolvedValue({ id: SELECTS_ID, status: 'draft' })
    const service = mockService({ trackCount: 0 })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest(), { params: Promise.resolve({ id: SELECTS_ID }) })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/no tracks/i)
    expect(service.updateSpy).not.toHaveBeenCalled()
  })

  it('sends a draft Selects with at least one non-removed track and returns the share link', async () => {
    ;(loadSelectsInScope as jest.Mock).mockResolvedValue({ id: SELECTS_ID, status: 'draft' })
    const service = mockService({
      trackCount: 1,
      updateResult: { id: SELECTS_ID, status: 'sent', share_token: 'tok123' },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest(), { params: Promise.resolve({ id: SELECTS_ID }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.shareUrl).toBe('/selects/tok123')
    expect(body.data.status).toBe('sent')
    expect(service.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', sent_at: expect.any(String) })
    )
  })

  it('rejects re-sending a changes_requested-transitioned Selects back to sent when zero tracks remain', async () => {
    ;(loadSelectsInScope as jest.Mock).mockResolvedValue({ id: SELECTS_ID, status: 'changes_requested' })
    const service = mockService({ trackCount: 0 })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest(), { params: Promise.resolve({ id: SELECTS_ID }) })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/no tracks/i)
  })

  it('returns 404 (not the guard error) when the caller is out of scope', async () => {
    ;(loadSelectsInScope as jest.Mock).mockResolvedValue(null)
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest(), { params: Promise.resolve({ id: SELECTS_ID }) })

    expect(res.status).toBe(404)
  })
})
