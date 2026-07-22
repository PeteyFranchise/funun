// §7 recipient-side identity-correction action on POST /api/approve/[token]
// (18-01 Task 4). Mocked-Supabase style matching docuseal-webhook.test.ts:
// a fake service client records every write so a test can assert both what
// happened and, more importantly, what did NOT (T-18-01b).

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

function makeService(partyRow: Record<string, unknown> | null) {
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
        return Promise.resolve({ data: null, error: null })
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
  it('writes ONLY the allowlisted fields to the token-matched party row', async () => {
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
    })
    expect(partyUpdate!.values).not.toHaveProperty('note')
    expect(partyUpdate!.values).not.toHaveProperty('approval_status')
  })

  it('also overwrites the linked collaborators row when the party has a collaborator_id', async () => {
    const { client, recorded } = makeService(basePartyRow())
    mockCreateServiceClient.mockReturnValue(client)

    await POST(jsonRequest({ action: 'update_identity', legal_name: 'Jane Smith' }), ctx())

    const collabUpdate = recorded.updates.find(u => u.table === 'collaborators')
    expect(collabUpdate).toBeDefined()
    expect(collabUpdate!.matchId).toBe(COLLABORATOR_ID)
    expect(collabUpdate!.values).toEqual({ legal_name: 'Jane Smith' })
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
