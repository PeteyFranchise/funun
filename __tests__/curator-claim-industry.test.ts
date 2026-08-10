// Tests for the repointed POST /api/curators/claim/[token] route (INDUSTRY-04).
// Asserts the primary mint path now goes through provisionIndustryAccount()
// (role='industry'), never a direct admin.createUser({app_metadata:{role:
// 'curator'}}) call, and that the atomic claim-token conditional UPDATE
// (IDOR mitigation, T-28-03-01) is preserved exactly. Unit-level — no HTTP
// harness; mirrors the mock-Supabase-client style of capability-grant.test.ts
// and verification-admin-api.test.ts's direct route-handler invocation.

import { POST } from '@/app/api/curators/claim/[token]/route'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { industryInviteEmail } from '@/lib/email/industryInvite'
import { provisionIndustryAccount, DuplicateIndustryMemberError } from '@/lib/industry/createIndustryMember'

jest.mock('@/lib/supabase/server', () => ({ createServiceClient: jest.fn() }))
jest.mock('@/lib/email', () => ({ sendEmail: jest.fn() }))

// Keep the real DuplicateIndustryMemberError class (the route's `instanceof`
// check must work against it) but mock provisionIndustryAccount itself.
jest.mock('@/lib/industry/createIndustryMember', () => {
  const actual = jest.requireActual('@/lib/industry/createIndustryMember')
  return { ...actual, provisionIndustryAccount: jest.fn() }
})

const TOKEN = 'tok_abc123'

function buildService({
  curatorRow,
  claimResults = [{ data: { id: 'cur1' }, error: null }],
  deleteUserResult = { error: null },
  generateLinkResult = {
    data: { properties: { action_link: 'https://funun.app/magic' }, user: { id: 'existing-user-1' } },
    error: null,
  },
}: {
  curatorRow: unknown
  claimResults?: Array<{ data: unknown; error: unknown }>
  deleteUserResult?: { error: unknown }
  generateLinkResult?: unknown
}) {
  const maybeSingleSelect = jest.fn(async () => ({ data: curatorRow, error: null }))
  const eqSelect = jest.fn(() => ({ maybeSingle: maybeSingleSelect }))
  const select = jest.fn(() => ({ eq: eqSelect }))

  // Each claim CAS call (the primary attempt + any idempotent retry) consumes
  // the next result; the last repeats if there are more calls than results.
  let claimCall = 0
  const maybeSingleUpdate = jest.fn(async () => claimResults[Math.min(claimCall++, claimResults.length - 1)])
  const selectUpdate = jest.fn(() => ({ maybeSingle: maybeSingleUpdate }))
  const isSpy = jest.fn(() => ({ select: selectUpdate }))
  const eqUpdate2 = jest.fn(() => ({ is: isSpy }))
  const eqUpdate1 = jest.fn(() => ({ eq: eqUpdate2 }))
  const update = jest.fn(() => ({ eq: eqUpdate1 }))

  const generateLink = jest.fn(async () => generateLinkResult)
  const deleteUser = jest.fn(async () => deleteUserResult)

  const service = {
    from: jest.fn((table: string) => {
      if (table !== 'curators') throw new Error(`Unexpected table in mock: ${table}`)
      return { select, update }
    }),
    auth: { admin: { generateLink, deleteUser } },
  }

  return { service, select, eqSelect, update, eqUpdate1, eqUpdate2, isSpy, generateLink, deleteUser, maybeSingleUpdate }
}

function req() {
  return new Request(`http://t.local/api/curators/claim/${TOKEN}`, { method: 'POST' })
}

function params() {
  return { params: Promise.resolve({ token: TOKEN }) }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /api/curators/claim/[token]', () => {
  it('mints an Industry account via provisionIndustryAccount on the primary path — never role=curator', async () => {
    const curatorRow = {
      id: 'cur1',
      email: 'curator@example.com',
      name: 'Nova Curator',
      claim_token_expires_at: null,
      claimed_by: null,
    }
    const { service, eqUpdate1, eqUpdate2, isSpy } = buildService({ curatorRow })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(provisionIndustryAccount as jest.Mock).mockResolvedValueOnce({ userId: 'u1' })

    const res = await POST(req(), params())
    expect(res.status).toBe(200)

    expect(provisionIndustryAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'curator@example.com',
        displayName: 'Nova Curator',
        roleSlugs: ['playlist_curator'],
      })
    )

    // The atomic conditional UPDATE (IDOR mitigation) must be preserved exactly.
    expect(eqUpdate1).toHaveBeenCalledWith('id', 'cur1')
    expect(eqUpdate2).toHaveBeenCalledWith('claim_token', TOKEN)
    expect(isSpy).toHaveBeenCalledWith('claimed_by', null)

    // Exactly one email, with curator-claim-appropriate copy (not the cold-invite subject).
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const emailArgs = (sendEmail as jest.Mock).mock.calls[0][0]
    expect(emailArgs.subject).not.toBe(industryInviteEmail({ displayName: 'x', actionLink: 'y' }).subject)
  })

  it('routes a DuplicateIndustryMemberError from provisionIndustryAccount into the existing-account fallback, without overwriting the existing account', async () => {
    const curatorRow = {
      id: 'cur1',
      email: 'curator@example.com',
      name: 'Nova Curator',
      claim_token_expires_at: null,
      claimed_by: null,
    }
    const { service, eqUpdate1, eqUpdate2, isSpy, maybeSingleUpdate } = buildService({ curatorRow })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(provisionIndustryAccount as jest.Mock).mockRejectedValueOnce(
      new DuplicateIndustryMemberError('This email has already been invited.')
    )

    const res = await POST(req(), params())
    expect(res.status).toBe(200)

    // Fallback links the existing auth.users id from generateLink — it never
    // calls provisionIndustryAccount a second time and never mutates the
    // existing account's role/member_type (no such write is mocked here).
    expect(provisionIndustryAccount).toHaveBeenCalledTimes(1)
    expect(maybeSingleUpdate).toHaveBeenCalled()
    expect(eqUpdate1).toHaveBeenCalledWith('id', 'cur1')
    expect(eqUpdate2).toHaveBeenCalledWith('claim_token', TOKEN)
    expect(isSpy).toHaveBeenCalledWith('claimed_by', null)
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('returns 410 when the atomic conditional UPDATE matches zero rows (concurrent double-claim) — and does NOT delete the account (a concurrent claim reused it)', async () => {
    const curatorRow = {
      id: 'cur1',
      email: 'curator@example.com',
      name: 'Nova Curator',
      claim_token_expires_at: null,
      claimed_by: null,
    }
    const { service, deleteUser } = buildService({ curatorRow, claimResults: [{ data: null, error: null }] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(provisionIndustryAccount as jest.Mock).mockResolvedValueOnce({ userId: 'u1' })

    const res = await POST(req(), params())
    expect(res.status).toBe(410)
    // A zero-row result means the row is already linked to this same account —
    // never delete it.
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('re-attempts the idempotent claim on an ambiguous transport error and succeeds — NEVER deletes (HIGH: no live-account deletion)', async () => {
    const curatorRow = {
      id: 'cur1',
      email: 'curator@example.com',
      name: 'Nova Curator',
      claim_token_expires_at: null,
      claimed_by: null,
    }
    // First claim CAS errors (ambiguous), the retry lands the claim.
    const { service, deleteUser, maybeSingleUpdate } = buildService({
      curatorRow,
      claimResults: [
        { data: null, error: { message: 'db down' } },
        { data: { id: 'cur1' }, error: null },
      ],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(provisionIndustryAccount as jest.Mock).mockResolvedValueOnce({ userId: 'u1' })

    const res = await POST(req(), params())
    expect(res.status).toBe(200)
    expect(maybeSingleUpdate).toHaveBeenCalledTimes(2) // primary + retry
    expect(deleteUser).not.toHaveBeenCalled() // never delete on the ambiguous path
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('ambiguous error then a retry that finds the row already claimed (our own lost-response commit) → 200, sends once, never deletes', async () => {
    const curatorRow = {
      id: 'cur1',
      email: 'curator@example.com',
      name: 'Nova Curator',
      claim_token_expires_at: null,
      claimed_by: null,
    }
    // Primary errored (response lost after commit); retry finds zero rows
    // because our own earlier UPDATE actually landed — treated as success.
    const { service, deleteUser, maybeSingleUpdate } = buildService({
      curatorRow,
      claimResults: [
        { data: null, error: { message: 'response lost' } },
        { data: null, error: null },
      ],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(provisionIndustryAccount as jest.Mock).mockResolvedValueOnce({ userId: 'u1' })

    const res = await POST(req(), params())
    expect(res.status).toBe(200)
    expect(maybeSingleUpdate).toHaveBeenCalledTimes(2)
    expect(deleteUser).not.toHaveBeenCalled()
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('surfaces manual reconciliation (500) WITHOUT deleting when the claim errors twice', async () => {
    const curatorRow = {
      id: 'cur1',
      email: 'curator@example.com',
      name: 'Nova Curator',
      claim_token_expires_at: null,
      claimed_by: null,
    }
    const { service, deleteUser } = buildService({
      curatorRow,
      claimResults: [
        { data: null, error: { message: 'db down' } },
        { data: null, error: { message: 'still down' } },
      ],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(provisionIndustryAccount as jest.Mock).mockResolvedValueOnce({ userId: 'u1' })

    const res = await POST(req(), params())
    expect(res.status).toBe(500)
    expect(deleteUser).not.toHaveBeenCalled() // still never delete
  })
})
