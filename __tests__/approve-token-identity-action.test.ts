// §7 recipient-side identity-correction action on POST /api/approve/[token]
// (18-01 Task 4). Mocked-Supabase style matching docuseal-webhook.test.ts:
// a fake service client records every write so a test can assert both what
// happened and, more importantly, what did NOT (T-18-01b).
//
// Updated 260926-v1w (Ruling 2 / Finding D): the collaborators write-back
// used to overwrite ALL FIVE identity fields, silently discarding
// legal_name/pro/ipi/administrator whenever a caller's payload happened to
// include publishing_designee (object-spread semantics — the LAST key
// wins, and publishing_designee has no matching column on `collaborators`,
// so the whole `update(update)` call would 42703 with the old code, or
// silently drop fields depending on client behaviour). This file now
// asserts the CORRECTED, person-scoped-only write-back.

const mockCreateServiceClient = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}))
jest.mock('@/lib/email', () => ({ sendEmail: jest.fn() }))

import { POST } from '@/app/api/approve/[token]/route'

const TOKEN = 'a'.repeat(64)
const PARTY_ID = 'party-1'
const OTHER_PARTY_ID = 'party-2'
const COLLABORATOR_ID = 'collab-1'
const SHEET_ID = 'sheet-1'

type Recorded = { updates: { table: string; values: Record<string, unknown>; matchCol: string; matchId: string }[] }

function makeService(
  partyRow: Record<string, unknown> | null,
  opts?: { failUpdateTable?: string }
) {
  const recorded: Recorded = { updates: [] }

  const from = jest.fn((table: string) => {
    const q: Record<string, unknown> = {}
    q.select = jest.fn(() => q)
    q.eq = jest.fn(() => q)
    q.maybeSingle = jest.fn(() =>
      Promise.resolve({ data: table === 'split_sheet_parties' ? partyRow : null, error: null })
    )
    q.update = jest.fn((values: Record<string, unknown>) => ({
      eq: jest.fn((col: string, val: string) => {
        recorded.updates.push({ table, values, matchCol: col, matchId: val })
        const error = opts?.failUpdateTable === table ? { message: `injected failure: ${table}` } : null
        return Promise.resolve({ data: null, error })
      }),
    }))
    return q
  })

  return { client: { from }, recorded }
}

function basePartyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PARTY_ID,
    collaborator_id: COLLABORATOR_ID,
    approval_status: 'pending',
    token_expires_at: null,
    split_sheets: {
      id: SHEET_ID,
      song_name: 'Ocean Drive',
      status: 'draft',
      initiator_user_id: 'initiator-1',
    },
    ...overrides,
  }
}

function jsonRequest(body: unknown) {
  return new Request(`http://test.local/api/approve/${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function ctx() {
  return { params: Promise.resolve({ token: TOKEN }) }
}

beforeEach(() => {
  mockCreateServiceClient.mockReset()
})

describe('POST /api/approve/[token] — update_identity action', () => {
  it('writes the allowlisted identity fields PLUS the provenance stamp to the token-matched party row', async () => {
    const { client, recorded } = makeService(basePartyRow())
    mockCreateServiceClient.mockReturnValue(client)

    const res = await POST(
      jsonRequest({
        action: 'update_identity',
        legal_name: 'Jane Smith',
        pro: 'ascap',
        ipi: '123456789',
        publishing_designee: 'Jane Publishing',
        administrator: 'Some Admin Co',
        // Unlisted/extra fields must be silently dropped, never persisted —
        // no free-text field, structurally (P18-13).
        note: 'please pay me faster',
        approval_status: 'approved',
      }),
      ctx()
    )

    expect(res.status).toBe(200)
    const partyUpdate = recorded.updates.find(u => u.table === 'split_sheet_parties')
    expect(partyUpdate).toBeDefined()
    expect(partyUpdate!.matchId).toBe(PARTY_ID)
    expect(partyUpdate!.values).toEqual({
      legal_name: 'Jane Smith',
      pro: 'ascap',
      ipi: '123456789',
      publishing_designee: 'Jane Publishing',
      administrator: 'Some Admin Co',
      // Finding C: 'token_holder_submitted', never 'party_asserted' — this
      // records only that the token holder POSTed the value.
      identity_source: 'token_holder_submitted',
      identity_submitted_at: expect.any(String),
    })
    expect(partyUpdate!.values).not.toHaveProperty('note')
    expect(partyUpdate!.values).not.toHaveProperty('approval_status')
  })

  it('propagates ONLY the person-scoped fields (legal_name/pro/ipi) to the linked collaborators row — never publishing_designee/administrator (Ruling 2, Finding D)', async () => {
    const { client, recorded } = makeService(basePartyRow())
    mockCreateServiceClient.mockReturnValue(client)

    const res = await POST(
      jsonRequest({
        action: 'update_identity',
        legal_name: 'Jane Smith',
        pro: 'ascap',
        ipi: '123456789',
        publishing_designee: 'Jane Publishing',
        administrator: 'Some Admin Co',
      }),
      ctx()
    )

    expect(res.status).toBe(200)

    // The party row keeps all five fields — the freeze/gate lives on this
    // sheet's OWN row, which is exactly where a work-specific choice
    // belongs.
    const partyUpdate = recorded.updates.find(u => u.table === 'split_sheet_parties')
    expect(partyUpdate!.values).toMatchObject({
      publishing_designee: 'Jane Publishing',
      administrator: 'Some Admin Co',
    })

    // The collaborators row — this exact regression the defect shipped —
    // gets ONLY the person-scoped subset. Before the fix, a payload
    // containing publishing_designee would silently discard legal_name,
    // pro, ipi and administrator from this write (or 42703, depending on
    // client version) because collaborators has no publishing_designee
    // column.
    const collabUpdate = recorded.updates.find(u => u.table === 'collaborators')
    expect(collabUpdate).toBeDefined()
    expect(collabUpdate!.matchId).toBe(COLLABORATOR_ID)
    expect(collabUpdate!.values).toEqual({
      legal_name: 'Jane Smith',
      pro: 'ascap',
      ipi: '123456789',
    })
    expect(collabUpdate!.values).not.toHaveProperty('publishing_designee')
    expect(collabUpdate!.values).not.toHaveProperty('administrator')
  })

  it('skips the collaborators write entirely when the payload has no person-scoped fields (never issues a no-op UPDATE)', async () => {
    const { client, recorded } = makeService(basePartyRow())
    mockCreateServiceClient.mockReturnValue(client)

    const res = await POST(
      jsonRequest({ action: 'update_identity', publishing_designee: 'Jane Publishing', administrator: 'Some Admin Co' }),
      ctx()
    )

    expect(res.status).toBe(200)
    expect(recorded.updates.find(u => u.table === 'collaborators')).toBeUndefined()
  })

  it('surfaces a non-200 when the collaborators write-back fails, instead of a silent 200 (the swallowed-error defect)', async () => {
    const { client, recorded } = makeService(basePartyRow(), { failUpdateTable: 'collaborators' })
    mockCreateServiceClient.mockReturnValue(client)

    const res = await POST(jsonRequest({ action: 'update_identity', legal_name: 'Jane Smith' }), ctx())

    expect(res.status).not.toBe(200)
    // The party row's own write already succeeded — this proves the
    // failure surfaced is the collaborators write, not a masked earlier one.
    expect(recorded.updates.some(u => u.table === 'split_sheet_parties')).toBe(true)
    expect(recorded.updates.some(u => u.table === 'collaborators')).toBe(true)
  })

  it('never writes to another party row — the update target is resolved strictly from the token (T-18-01b)', async () => {
    const { client, recorded } = makeService(basePartyRow())
    mockCreateServiceClient.mockReturnValue(client)

    await POST(jsonRequest({ action: 'update_identity', legal_name: 'Jane Smith' }), ctx())

    for (const u of recorded.updates.filter(x => x.table === 'split_sheet_parties')) {
      expect(u.matchId).toBe(PARTY_ID)
      expect(u.matchId).not.toBe(OTHER_PARTY_ID)
    }
  })

  it('is allowed even when the party has already approved (distinct action from approve/counter)', async () => {
    const { client } = makeService(basePartyRow({ approval_status: 'approved' }))
    mockCreateServiceClient.mockReturnValue(client)

    const res = await POST(jsonRequest({ action: 'update_identity', pro: 'bmi' }), ctx())
    expect(res.status).toBe(200)
  })

  it.each(['esign_pending', 'executed'])(
    'refuses the write past the freeze boundary (sheet status %s)',
    async status => {
      const { client, recorded } = makeService(
        basePartyRow({ split_sheets: { id: SHEET_ID, song_name: 'Ocean Drive', status, initiator_user_id: 'initiator-1' } })
      )
      mockCreateServiceClient.mockReturnValue(client)

      const res = await POST(jsonRequest({ action: 'update_identity', legal_name: 'Jane Smith' }), ctx())
      expect(res.status).toBe(409)
      expect(recorded.updates).toHaveLength(0)
    }
  )

  it('rejects an invalid or missing token with a generic error', async () => {
    const { client } = makeService(null)
    mockCreateServiceClient.mockReturnValue(client)

    const res = await POST(jsonRequest({ action: 'update_identity', legal_name: 'Jane Smith' }), ctx())
    expect(res.status).toBe(404)
  })

  it('returns 400 when no recognized identity field is present in the body', async () => {
    const { client } = makeService(basePartyRow())
    mockCreateServiceClient.mockReturnValue(client)

    const res = await POST(jsonRequest({ action: 'update_identity', note: 'hello' }), ctx())
    expect(res.status).toBe(400)
  })
})
