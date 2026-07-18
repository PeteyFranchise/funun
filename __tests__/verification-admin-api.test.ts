import {
  validateVerificationAction,
  loadMembersForVerification,
  grantOrRevokeVerification,
  VERIFICATION_MEMBER_COLUMNS,
} from '@/lib/trust-safety/verification'
import { GET as verificationGET } from '@/app/api/admin/verification/route'
import { PATCH as verificationPATCH } from '@/app/api/admin/verification/[id]/route'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => ({ verifyAdmin: jest.fn() }))

const PROFILE_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ADMIN_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

function jsonRequest(url: string, body: unknown, method = 'PATCH') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('validateVerificationAction', () => {
  it('accepts grant and revoke', () => {
    expect(validateVerificationAction({ action: 'grant' })).toEqual({ ok: true, value: { action: 'grant' } })
    expect(validateVerificationAction({ action: 'revoke' })).toEqual({ ok: true, value: { action: 'revoke' } })
  })

  it('rejects an invalid or missing action', () => {
    expect(validateVerificationAction({ action: 'delete' }).ok).toBe(false)
    expect(validateVerificationAction({}).ok).toBe(false)
  })
})

describe('VERIFICATION_MEMBER_COLUMNS', () => {
  it('never selects private / PII columns and never uses select(*)', () => {
    expect(VERIFICATION_MEMBER_COLUMNS).not.toBe('*')
    for (const forbidden of ['legal_first_name', 'contact_phone', 'mailing_address', 'pro', 'ipi', 'email']) {
      expect(VERIFICATION_MEMBER_COLUMNS).not.toContain(forbidden)
    }
    expect(VERIFICATION_MEMBER_COLUMNS).toContain('verified')
    expect(VERIFICATION_MEMBER_COLUMNS).toContain('verified_at')
  })
})

describe('loadMembersForVerification', () => {
  function serviceWith(rows: unknown[]) {
    const orSpy = jest.fn(async () => ({ data: rows, error: null }))
    const limitSpy = jest.fn(() => ({ data: rows, error: null, or: orSpy }))
    const orderSpy2 = jest.fn(() => ({ limit: limitSpy }))
    const orderSpy1 = jest.fn(() => ({ order: orderSpy2 }))
    const selectSpy = jest.fn(() => ({ order: orderSpy1 }))
    const fromSpy = jest.fn(() => ({ select: selectSpy }))
    return { from: fromSpy, selectSpy, limitSpy, orSpy }
  }

  it('loads members with the explicit column list, no search filter', async () => {
    const rows = [{ id: PROFILE_UUID, artist_name: 'Nova', verified: false }]
    const service = serviceWith(rows)
    const result = await loadMembersForVerification(service as never, null)
    expect(service.selectSpy).toHaveBeenCalledWith(VERIFICATION_MEMBER_COLUMNS)
    expect(result).toEqual(rows)
  })

  it('applies an ilike search filter over artist_name/handle when q is provided', async () => {
    const rows: unknown[] = []
    const service = serviceWith(rows)
    await loadMembersForVerification(service as never, 'nova')
    expect(service.limitSpy).toHaveBeenCalled()
    expect(service.orSpy).toHaveBeenCalledWith('artist_name.ilike.%nova%,handle.ilike.%nova%')
  })
})

describe('grantOrRevokeVerification', () => {
  function serviceWithExisting(existing: unknown, updated: unknown) {
    const auditInsert = jest.fn(async () => ({ error: null }))
    return {
      from: jest.fn((table: string) => {
        if (table === 'verification_audit_log') {
          return { insert: auditInsert }
        }
        // artist_profiles: first call is the existence check (select().eq().maybeSingle()),
        // second is update().eq(), third is the reload select().eq().maybeSingle().
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: existing, error: null })) })),
          })),
          update: jest.fn(() => ({ eq: jest.fn(async () => ({ error: null })) })),
        }
      }),
      auditInsert,
    }
  }

  it('404s when the profile does not exist', async () => {
    const service = serviceWithExisting(null, null)
    const result = await grantOrRevokeVerification(service as never, PROFILE_UUID, 'grant', ADMIN_UUID)
    expect(result).toEqual({ ok: false, error: 'Profile not found', status: 404 })
    expect(service.auditInsert).not.toHaveBeenCalled()
  })

  it('grants verification, writes verified_at, and appends an audit log row', async () => {
    let call = 0
    const service = {
      from: jest.fn((table: string) => {
        if (table === 'verification_audit_log') {
          return { insert: jest.fn(async (row: unknown) => {
            expect(row).toEqual({ profile_id: PROFILE_UUID, action: 'grant', actor_id: ADMIN_UUID })
            return { error: null }
          }) }
        }
        call += 1
        if (call === 1) {
          // existence check
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: { id: PROFILE_UUID }, error: null })) })),
            })),
          }
        }
        if (call === 2) {
          // update
          return {
            update: jest.fn((update: unknown) => {
              expect(update).toMatchObject({ verified: true })
              return { eq: jest.fn(async () => ({ error: null })) }
            }),
          }
        }
        // reload
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({
                data: { id: PROFILE_UUID, verified: true, verified_at: '2026-07-18T00:00:00Z' },
                error: null,
              })),
            })),
          })),
        }
      }),
    }

    const result = await grantOrRevokeVerification(service as never, PROFILE_UUID, 'grant', ADMIN_UUID)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.verified).toBe(true)
    }
  })
})

describe('GET /api/admin/verification', () => {
  it('rejects non-admins', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    const res = await verificationGET(new Request('http://t.local/api/admin/verification'))
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns the member list for an admin', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: ADMIN_UUID } })
    const orderSpy2 = jest.fn(() => ({ limit: jest.fn(async () => ({ data: [{ id: PROFILE_UUID }], error: null })) }))
    const orderSpy1 = jest.fn(() => ({ order: orderSpy2 }))
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({ select: jest.fn(() => ({ order: orderSpy1 })) })),
    })
    const res = await verificationGET(new Request('http://t.local/api/admin/verification'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([{ id: PROFILE_UUID }])
  })
})

describe('PATCH /api/admin/verification/[id]', () => {
  it('rejects non-admins', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })
    const res = await verificationPATCH(jsonRequest('http://t.local/api/admin/verification/p1', { action: 'grant' }), {
      params: Promise.resolve({ id: 'p1' }),
    })
    expect(res.status).toBe(401)
  })

  it('rejects an invalid action before touching the service client', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: ADMIN_UUID } })
    const res = await verificationPATCH(
      jsonRequest('http://t.local/api/admin/verification/p1', { action: 'delete' }),
      { params: Promise.resolve({ id: 'p1' }) }
    )
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('grants verification for a valid admin request', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: ADMIN_UUID } })
    let call = 0
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'verification_audit_log') return { insert: jest.fn(async () => ({ error: null })) }
        call += 1
        if (call === 1) {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: { id: PROFILE_UUID }, error: null })) })),
            })),
          }
        }
        if (call === 2) {
          return { update: jest.fn(() => ({ eq: jest.fn(async () => ({ error: null })) })) }
        }
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({ data: { id: PROFILE_UUID, verified: true }, error: null })),
            })),
          })),
        }
      }),
    })

    const res = await verificationPATCH(
      jsonRequest(`http://t.local/api/admin/verification/${PROFILE_UUID}`, { action: 'grant' }),
      { params: Promise.resolve({ id: PROFILE_UUID }) }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.verified).toBe(true)
  })
})
