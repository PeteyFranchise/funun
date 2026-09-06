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
}

const DEFAULT_HANDLERS: Handlers = {
  project: () => ({ data: { id: PROJECT_ID, user_id: CUSTODIAN_ID }, error: null }),
}

// F1 hotfix (2026-09-06): assertMayOffer no longer looks at workspace
// membership or attachments at all — it never queries `workspace_members`
// or `workspace_attachments` — so this fake only ever needs to answer
// `vault_projects`. A query against either of the removed tables now
// throwing here is itself a regression signal.
function createFakeSupabase(overrides: Partial<Handlers> = {}) {
  const handlers: Handlers = { ...DEFAULT_HANDLERS, ...overrides }

  const projectMaybeSingle = jest.fn(async () => handlers.project())
  const projectEq = jest.fn(() => ({ maybeSingle: projectMaybeSingle }))
  const projectSelect = jest.fn(() => ({ eq: projectEq }))

  const from = jest.fn((table: string) => {
    if (table === 'vault_projects') return { select: projectSelect }
    throw new Error(`Unexpected table: ${table} — assertMayOffer must not query workspace authority anymore (F1)`)
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

  // F1 hotfix (2026-09-06): a workspace owner/admin is no longer permitted
  // to offer on the custodian's behalf, regardless of role, membership
  // status, or attachment — the branch that used to grant this was
  // DELETED, not narrowed. These four cases replace the pre-hotfix
  // "permits an owner/admin with a live attachment" test, which asserted
  // exactly the behavior this hotfix removes. Three cases below.
  it("refuses an active workspace admin who is not the project's custodian, live attachment or not", async () => {
    const fake = createFakeSupabase()
    const result = await assertMayOffer(asClient(fake), {
      projectId: PROJECT_ID,
      offeredByUserId: WORKSPACE_ADMIN_ID,
      workspaceId: WORKSPACE_ID,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
    // The whole point of the fix: no workspace-authority lookup happens at
    // all for a non-custodian offerer.
    expect(fake.from).not.toHaveBeenCalledWith('workspace_members')
    expect(fake.from).not.toHaveBeenCalledWith('workspace_attachments')
  })

  it("refuses an active workspace owner who is not the project's custodian", async () => {
    const fake = createFakeSupabase()
    const result = await assertMayOffer(asClient(fake), {
      projectId: PROJECT_ID,
      offeredByUserId: WORKSPACE_ADMIN_ID,
      workspaceId: WORKSPACE_ID,
    })
    expect(result).toEqual({
      ok: false,
      status: 403,
      reason:
        "Only the record's current custodian may offer a custody transfer — workspace administration is access authority, never custody authority, and cannot offer on a Member's behalf (D-29).",
    })
  })

  it('refuses a non-custodian offerer even with no workspaceId supplied', async () => {
    const fake = createFakeSupabase()
    const result = await assertMayOffer(asClient(fake), {
      projectId: PROJECT_ID,
      offeredByUserId: WORKSPACE_ADMIN_ID,
      workspaceId: null,
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

  // F1 hotfix (2026-09-06): defence in depth against self-dealing. This
  // scenario is not reachable through assertMayOffer today (offered_by is
  // always the custodian, and from_user_id <> to_user_id is a DB CHECK), but
  // assertMayRespond is a pure function tested independently of that
  // guarantee — proving it refuses self-resolution even if a future change
  // to assertMayOffer ever re-widens who may offer.
  it('refuses an accept where the responder is also the offerer, even if they are named as to_user_id', () => {
    const selfDealing = { fromUserId: CUSTODIAN_ID, toUserId: WORKSPACE_ADMIN_ID, offeredBy: WORKSPACE_ADMIN_ID }
    const result = assertMayRespond({ parties: selfDealing, actorUserId: WORKSPACE_ADMIN_ID, action: 'accept' })
    expect(result).toEqual({
      ok: false,
      status: 403,
      reason:
        'The party who offered this transfer cannot also accept it — custody transfer is two-sided, never unilateral (D-29).',
    })
  })

  it('refuses a decline where the responder is also the offerer', () => {
    const selfDealing = { fromUserId: CUSTODIAN_ID, toUserId: WORKSPACE_ADMIN_ID, offeredBy: WORKSPACE_ADMIN_ID }
    const result = assertMayRespond({ parties: selfDealing, actorUserId: WORKSPACE_ADMIN_ID, action: 'decline' })
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
