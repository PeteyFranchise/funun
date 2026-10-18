import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { logStaffAction } from '@/lib/staff/audit'
import { DELETE } from './route'

jest.mock('@/lib/supabase/server', () => ({ createServiceClient: jest.fn() }))
jest.mock('@/lib/admin/gate', () => ({ requireStaff: jest.fn() }))
jest.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: jest.fn() }))
jest.mock('@/lib/staff/audit', () => ({ logStaffAction: jest.fn() }))

const STAFF_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function request(body: unknown) {
  return new Request('http://test.local/api/admin/email-suppressions', {
    method: 'DELETE',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function mockService(result: { data: { email: string } | null; error: { message: string } | null }) {
  const maybeSingle = jest.fn(async () => result)
  const select = jest.fn(() => ({ maybeSingle }))
  const eq = jest.fn(() => ({ select }))
  const del = jest.fn(() => ({ eq }))
  const from = jest.fn(() => ({ delete: del }))
  return { from, del, eq, select, maybeSingle }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: STAFF_ID }, staffRole: 'leadership' })
  ;(checkRateLimit as jest.Mock).mockResolvedValue(false)
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
})

describe('DELETE /api/admin/email-suppressions', () => {
  it('removes the normalized address for leadership staff and audits it without the address', async () => {
    const service = mockService({ data: { email: 'bounced@example.com' }, error: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await DELETE(request({ email: ' Some One <Bounced@Example.com> ' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(requireStaff).toHaveBeenCalledWith(['leadership'])
    expect(service.from).toHaveBeenCalledWith('email_suppressions')
    expect(service.eq).toHaveBeenCalledWith('email', 'bounced@example.com')
    expect(logStaffAction).toHaveBeenCalledWith(service, {
      actorId: STAFF_ID,
      action: 'email_suppression.remove',
      targetType: 'email_suppression',
      changes: { removed: 1 },
    })
    expect(JSON.stringify((logStaffAction as jest.Mock).mock.calls[0][1])).not.toContain('example.com')
  })

  it('returns 404 when the address is not suppressed, without writing an audit entry', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue(mockService({ data: null, error: null }))

    const res = await DELETE(request({ email: 'clean@example.com' }))

    expect(res.status).toBe(404)
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('returns 500 on a database error', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue(
      mockService({ data: null, error: { message: 'database unavailable' } })
    )

    const res = await DELETE(request({ email: 'bounced@example.com' }))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Request could not be completed.' })
  })

  it('rejects an unauthenticated caller with 401 before touching the service client', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })

    const res = await DELETE(request({ email: 'bounced@example.com' }))

    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('rejects a non-staff or non-leadership caller with 403 before touching the service client', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await DELETE(request({ email: 'bounced@example.com' }))

    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('returns 429 when rate limited, before touching the service client', async () => {
    ;(checkRateLimit as jest.Mock).mockResolvedValue(true)

    const res = await DELETE(request({ email: 'bounced@example.com' }))

    expect(res.status).toBe(429)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it.each([[{}], [{ email: 'not-an-address' }], [{ email: 'a@b.co', extra: 1 }], ['not json']])(
    'returns 400 for an invalid body %p',
    async (body) => {
      const res = await DELETE(request(body))

      expect(res.status).toBe(400)
      expect(createServiceClient).not.toHaveBeenCalled()
    }
  )
})
