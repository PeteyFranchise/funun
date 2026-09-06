import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertMayOffer,
  assertMayRespond,
  CUSTODY_TRANSFER_STATE_VALUES,
  describeTransferEffect,
  isLegalTransferTransition,
  TRANSFER_LEGAL_EDGES,
  type CustodyTransferState,
} from '@/lib/workspaces/custody-transfer'

const PROJECT_ID = '11111111-1111-1111-1111-111111111111'
const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const CUSTODIAN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const RECIPIENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const WORKSPACE_ADMIN_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const STRANGER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

type Res<T> = { data: T; error: { message: string } | null }

type Handlers = {
  project: () => Res<{ id: string; user_id: string } | null>
  membership: () => Res<{ role: string; status: string } | null>
  attachment: () => Res<{ id: string } | null>
}

const DEFAULT_HANDLERS: Handlers = {
  project: () => ({ data: { id: PROJECT_ID, user_id: CUSTODIAN_ID }, error: null }),
  membership: () => ({ data: null, error: null }),
  attachment: () => ({ data: null, error: null }),
}

function createFakeSupabase(overrides: Partial<Handlers> = {}) {
  const handlers: Handlers = { ...DEFAULT_HANDLERS, ...overrides }

  const projectMaybeSingle = jest.fn(async () => handlers.project())
  const projectEq = jest.fn(() => ({ maybeSingle: projectMaybeSingle }))
  const projectSelect = jest.fn(() => ({ eq: projectEq }))

  const membershipMaybeSingle = jest.fn(async () => handlers.membership())
  const membershipEq2 = jest.fn(() => ({ maybeSingle: membershipMaybeSingle }))
  const membershipEq1 = jest.fn(() => ({ eq: membershipEq2 }))
  const membershipSelect = jest.fn(() => ({ eq: membershipEq1 }))

  const attachmentMaybeSingle = jest.fn(async () => handlers.attachment())
  const attachmentIs = jest.fn(() => ({ maybeSingle: attachmentMaybeSingle }))
  const attachmentEq2 = jest.fn(() => ({ is: attachmentIs }))
  const attachmentEq1 = jest.fn(() => ({ eq: attachmentEq2 }))
  const attachmentSelect = jest.fn(() => ({ eq: attachmentEq1 }))

  const from = jest.fn((table: string) => {
    if (table === 'vault_projects') return { select: projectSelect }
    if (table === 'workspace_members') return { select: membershipSelect }
    if (table === 'workspace_attachments') return { select: attachmentSelect }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from, handlers }
}

function asClient(fake: { from: jest.Mock }): SupabaseClient {
  return fake as unknown as SupabaseClient
}

describe('isLegalTransferTransition', () => {
  it('permits offered -> accepted, declined, withdrawn', () => {
    expect(isLegalTransferTransition('offered', 'accepted')).toBe(true)
    expect(isLegalTransferTransition('offered', 'declined')).toBe(true)
    expect(isLegalTransferTransition('offered', 'withdrawn')).toBe(true)
  })

  it('refuses every same-state self-transition', () => {
    for (const state of CUSTODY_TRANSFER_STATE_VALUES) {
      expect(isLegalTransferTransition(state, state)).toBe(false)
    }
  })

  it('refuses every move out of a terminal state (accepted, declined, withdrawn)', () => {
    const terminal: CustodyTransferState[] = ['accepted', 'declined', 'withdrawn']
    for (const from of terminal) {
      for (const to of CUSTODY_TRANSFER_STATE_VALUES) {
        expect(isLegalTransferTransition(from, to)).toBe(false)
      }
    }
  })

  it('refuses an unknown state value on either side', () => {
    expect(isLegalTransferTransition('offered', 'bogus' as CustodyTransferState)).toBe(false)
    expect(isLegalTransferTransition('bogus' as CustodyTransferState, 'accepted')).toBe(false)
  })

  it('TRANSFER_LEGAL_EDGES names exactly the three legal exits from offered', () => {
    expect(Array.from(TRANSFER_LEGAL_EDGES.offered).sort()).toEqual(
      ['accepted', 'declined', 'withdrawn'].sort()
    )
  })
})

describe('assertMayOffer', () => {
  it("permits the project's current custodian", async () => {
    const fake = createFakeSupabase()
    const result = await assertMayOffer(asClient(fake), {
      projectId: PROJECT_ID,
      offeredByUserId: CUSTODIAN_ID,
      workspaceId: null,
    })
    expect(result).toEqual({ ok: true, custodianId: CUSTODIAN_ID })
  })

  it('refuses a non-custodian offering outside any workspace context', async () => {
    const fake = createFakeSupabase()
    const result = await assertMayOffer(asClient(fake), {
      projectId: PROJECT_ID,
      offeredByUserId: STRANGER_ID,
      workspaceId: null,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
  })

  it('permits an owner/admin of a workspace with a live attachment to the project', async () => {
    const fake = createFakeSupabase({
      membership: () => ({ data: { role: 'admin', status: 'active' }, error: null }),
      attachment: () => ({ data: { id: 'att-1' }, error: null }),
    })
    const result = await assertMayOffer(asClient(fake), {
      projectId: PROJECT_ID,
      offeredByUserId: WORKSPACE_ADMIN_ID,
      workspaceId: WORKSPACE_ID,
    })
    expect(result).toEqual({ ok: true, custodianId: CUSTODIAN_ID })
  })

  it('refuses a workspace member role (not owner/admin) even with a live attachment', async () => {
    const fake = createFakeSupabase({
      membership: () => ({ data: { role: 'member', status: 'active' }, error: null }),
      attachment: () => ({ data: { id: 'att-1' }, error: null }),
    })
    const result = await assertMayOffer(asClient(fake), {
      projectId: PROJECT_ID,
      offeredByUserId: WORKSPACE_ADMIN_ID,
      workspaceId: WORKSPACE_ID,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
  })

  it('refuses an owner/admin whose workspace has no live attachment to the project', async () => {
    const fake = createFakeSupabase({
      membership: () => ({ data: { role: 'owner', status: 'active' }, error: null }),
      attachment: () => ({ data: null, error: null }),
    })
    const result = await assertMayOffer(asClient(fake), {
      projectId: PROJECT_ID,
      offeredByUserId: WORKSPACE_ADMIN_ID,
      workspaceId: WORKSPACE_ID,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
  })

  it('refuses a suspended owner/admin membership even with a live attachment', async () => {
    const fake = createFakeSupabase({
      membership: () => ({ data: { role: 'owner', status: 'suspended' }, error: null }),
      attachment: () => ({ data: { id: 'att-1' }, error: null }),
    })
    const result = await assertMayOffer(asClient(fake), {
      projectId: PROJECT_ID,
      offeredByUserId: WORKSPACE_ADMIN_ID,
      workspaceId: WORKSPACE_ID,
    })
    expect(result.ok).toBe(false)
  })

  it('returns 404 when the project does not exist', async () => {
    const fake = createFakeSupabase({ project: () => ({ data: null, error: null }) })
    const result = await assertMayOffer(asClient(fake), {
      projectId: PROJECT_ID,
      offeredByUserId: CUSTODIAN_ID,
      workspaceId: null,
    })
    expect(result).toEqual({ ok: false, status: 404, reason: 'Project not found.' })
  })

  it('fails closed (never throws) on a project lookup error', async () => {
    const fake = createFakeSupabase({ project: () => ({ data: null, error: { message: 'db down' } }) })
    const result = await assertMayOffer(asClient(fake), {
      projectId: PROJECT_ID,
      offeredByUserId: CUSTODIAN_ID,
      workspaceId: null,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(500)
  })
})

describe('assertMayRespond', () => {
  const parties = { fromUserId: CUSTODIAN_ID, toUserId: RECIPIENT_ID, offeredBy: CUSTODIAN_ID }

  it('permits only to_user_id to accept', () => {
    expect(assertMayRespond({ parties, actorUserId: RECIPIENT_ID, action: 'accept' })).toEqual({ ok: true })
  })

  it('refuses an accept attempted by anyone other than to_user_id', () => {
    const result = assertMayRespond({ parties, actorUserId: STRANGER_ID, action: 'accept' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)

    const fromCustodian = assertMayRespond({ parties, actorUserId: CUSTODIAN_ID, action: 'accept' })
    expect(fromCustodian.ok).toBe(false)
  })

  it('permits only to_user_id to decline', () => {
    expect(assertMayRespond({ parties, actorUserId: RECIPIENT_ID, action: 'decline' })).toEqual({ ok: true })
    expect(assertMayRespond({ parties, actorUserId: STRANGER_ID, action: 'decline' }).ok).toBe(false)
  })

  it('permits offered_by or from_user_id to withdraw', () => {
    expect(assertMayRespond({ parties, actorUserId: CUSTODIAN_ID, action: 'withdraw' })).toEqual({ ok: true })

    const workspaceOffered = { fromUserId: CUSTODIAN_ID, toUserId: RECIPIENT_ID, offeredBy: WORKSPACE_ADMIN_ID }
    expect(assertMayRespond({ parties: workspaceOffered, actorUserId: WORKSPACE_ADMIN_ID, action: 'withdraw' })).toEqual({
      ok: true,
    })
    expect(assertMayRespond({ parties: workspaceOffered, actorUserId: CUSTODIAN_ID, action: 'withdraw' })).toEqual({
      ok: true,
    })
  })

  it('refuses a withdraw attempted by the recipient', () => {
    const result = assertMayRespond({ parties, actorUserId: RECIPIENT_ID, action: 'withdraw' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
  })
})

describe('describeTransferEffect', () => {
  it('names all five things a transfer does not change', () => {
    const sentence = describeTransferEffect()
    for (const term of ['authorship', 'ownership', 'credit', 'royalty entitlement', 'signature authority']) {
      expect(sentence.toLowerCase()).toContain(term)
    }
  })

  it('states what a transfer DOES change — who holds and administers the record', () => {
    const sentence = describeTransferEffect().toLowerCase()
    expect(sentence).toContain('holds and administers')
  })

  it('never throws', () => {
    expect(() => describeTransferEffect()).not.toThrow()
  })
})
