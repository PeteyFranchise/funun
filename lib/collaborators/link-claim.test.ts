import type { SupabaseClient } from '@supabase/supabase-js'
import { linkClaimedCollaborators } from '@/lib/collaborators/link-claim'

// ─── lib/collaborators/link-claim.ts ───────────────────────────────────────
// Owner scoping, the claimed_by-null guard, ILIKE metacharacter escaping
// (reused from lib/invites/allowlist.ts, not copied), and the never-throws
// contract.

const OWNER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MEMBER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function mockService(options: {
  rows?: { id: string }[]
  error?: { message: string } | null
  throws?: boolean
} = {}) {
  const { rows = [{ id: 'row-1' }], error = null, throws = false } = options

  const calls: { eqArgs: unknown[]; ilikeArgs: unknown[]; isArgs: unknown[]; update: unknown } = {
    eqArgs: [],
    ilikeArgs: [],
    isArgs: [],
    update: undefined,
  }

  const updateSpy = jest.fn((payload: unknown) => {
    calls.update = payload
    return builder
  })
  const eqSpy = jest.fn((...args: unknown[]) => {
    calls.eqArgs = args
    return builder
  })
  const ilikeSpy = jest.fn((...args: unknown[]) => {
    calls.ilikeArgs = args
    return builder
  })
  const isSpy = jest.fn((...args: unknown[]) => {
    calls.isArgs = args
    return builder
  })
  const selectSpy = jest.fn(async () => {
    if (throws) throw new Error('connection reset')
    return { data: rows, error }
  })

  const builder: any = {
    update: updateSpy,
    eq: eqSpy,
    ilike: ilikeSpy,
    is: isSpy,
    select: selectSpy,
  }

  const from = jest.fn((table: string) => {
    if (table === 'collaborators') return builder
    throw new Error(`Unexpected table: ${table}`)
  })

  return { service: { from } as unknown as SupabaseClient, updateSpy, eqSpy, ilikeSpy, isSpy, calls }
}

describe('linkClaimedCollaborators', () => {
  it('scopes the update by owner id, exact email, and claimed_by IS NULL', async () => {
    const { service, updateSpy, eqSpy, ilikeSpy, isSpy } = mockService()

    const linked = await linkClaimedCollaborators(service, {
      ownerUserId: OWNER_ID,
      memberUserId: MEMBER_ID,
      memberEmail: 'Jamie@Example.com',
    })

    expect(linked).toBe(1)
    expect(updateSpy).toHaveBeenCalledWith({ claimed_by: MEMBER_ID })
    expect(eqSpy).toHaveBeenCalledWith('user_id', OWNER_ID)
    expect(ilikeSpy).toHaveBeenCalledWith('email', 'Jamie@Example.com')
    expect(isSpy).toHaveBeenCalledWith('claimed_by', null)
  })

  it('escapes ILIKE metacharacters in the email before querying', async () => {
    const { service, ilikeSpy } = mockService()

    await linkClaimedCollaborators(service, {
      ownerUserId: OWNER_ID,
      memberUserId: MEMBER_ID,
      memberEmail: 'a_b%c@example.com',
    })

    expect(ilikeSpy).toHaveBeenCalledWith('email', 'a\\_b\\%c@example.com')
  })

  it('returns the real linked count from the number of rows the update touched', async () => {
    const { service } = mockService({ rows: [{ id: 'row-1' }, { id: 'row-2' }] })

    const linked = await linkClaimedCollaborators(service, {
      ownerUserId: OWNER_ID,
      memberUserId: MEMBER_ID,
      memberEmail: 'jamie@example.com',
    })

    expect(linked).toBe(2)
  })

  it('returns 0 for an empty or whitespace-only email, without querying', async () => {
    const { service } = mockService()

    const linked = await linkClaimedCollaborators(service, {
      ownerUserId: OWNER_ID,
      memberUserId: MEMBER_ID,
      memberEmail: '   ',
    })

    expect(linked).toBe(0)
    expect(service.from).not.toHaveBeenCalled()
  })

  it('never throws — a DB error resolves to 0', async () => {
    const { service } = mockService({ rows: [], error: { message: 'boom' } })

    const linked = await linkClaimedCollaborators(service, {
      ownerUserId: OWNER_ID,
      memberUserId: MEMBER_ID,
      memberEmail: 'jamie@example.com',
    })

    expect(linked).toBe(0)
  })

  it('never throws — a thrown error resolves to 0', async () => {
    const { service } = mockService({ throws: true })

    await expect(
      linkClaimedCollaborators(service, {
        ownerUserId: OWNER_ID,
        memberUserId: MEMBER_ID,
        memberEmail: 'jamie@example.com',
      })
    ).resolves.toBe(0)
  })
})
