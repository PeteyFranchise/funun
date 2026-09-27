// The four behaviours the pre-fix gate could not see (quick task
// 260926-v1w). Mocked service/api clients, no real database, no real
// DocuSeal call, no real PDF render — matching the existing mint-envelope
// mock style used elsewhere in this suite
// (__tests__/docuseal-webhook.test.ts, __tests__/adversarial-review-fixes.test.ts).
//
// resolvePartyIdentitiesForSheet() and identity-policy.ts are NOT mocked —
// this test drives the REAL resolver and the REAL gate predicate against a
// fake Supabase client, so it proves the actual resolution/gate logic, not
// a restatement of it.
//
// DRY-RUN NOTE (per the plan's mandate): "mint refuses on drift" cannot be
// dry-run against the pre-fix tree by running this file against it — the
// pre-fix mint route has no identity-drift gate at all, so the 409 branch
// and the zero-call assertions below do not exist as code to import. The
// negative fact was instead confirmed by reading the pre-fix route
// directly (`git show 3499f7f2:app/api/split-sheets/[id]/mint-envelope/route.ts`):
// no `identityDriftSinceLastAction` import, no 409 response before the
// counsel gate. Absence of the mechanism is the pre-fix failure mode this
// test exists to close.

const mockCreateApiClient = jest.fn()
const mockCreateServiceClient = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createApiClient: (...args: unknown[]) => mockCreateApiClient(...args),
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}))

const mockRenderSplitSheet = jest.fn()
jest.mock('@/lib/vault/pdf/split-sheet', () => ({
  renderSplitSheet: (...args: unknown[]) => mockRenderSplitSheet(...args),
  partyRoleTag: (index: number) => `Party${index + 1}`,
}))

const mockCreateRequest = jest.fn()
jest.mock('@/lib/esign/docuseal', () => ({
  docusealProvider: { createRequest: (...args: unknown[]) => mockCreateRequest(...args) },
  DOCUSEAL_EMBED_BASE: 'https://docuseal.test',
}))

const mockSendSignatureInvite = jest.fn()
jest.mock('@/lib/split-sheets/esign-invite', () => ({
  sendSignatureInvite: (...args: unknown[]) => mockSendSignatureInvite(...args),
}))

import { POST as mintEnvelope } from '@/app/api/split-sheets/[id]/mint-envelope/route'
import { resolvePartyIdentitiesForSheet } from '@/lib/split-sheets/resolve-party-identities.server'
import { identityDigest } from '@/lib/split-sheets/identity-policy'

const USER_ID = 'initiator-1'
const SHEET_ID = 'sheet-1'

type Recorded = {
  inserts: { table: string; values: unknown }[]
  updates: { table: string; values: unknown }[]
  rpcs: { name: string; args: unknown }[]
}

/** A chainable, thenable fake query-builder result — `.select()`/`.eq()`/
 * `.in()` return itself (so any chain length works), `.maybeSingle()` /
 * `.single()` resolve to `terminal`, and awaiting the object DIRECTLY
 * (no terminal method) also resolves to `terminal` — matching how
 * supabase-js's builder is thenable at every step. */
function chain(terminal: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {}
  obj.select = jest.fn(() => obj)
  obj.eq = jest.fn(() => obj)
  obj.in = jest.fn(() => obj)
  obj.maybeSingle = jest.fn(() => Promise.resolve(terminal))
  obj.single = jest.fn(() => Promise.resolve(terminal))
  ;(obj as unknown as { then: Promise<unknown>['then'] }).then = (resolve, reject) =>
    Promise.resolve(terminal).then(resolve, reject)
  return obj
}

function makeApiClient(sheetRow: Record<string, unknown> | null) {
  const auth = { getUser: jest.fn(() => Promise.resolve({ data: { user: { id: USER_ID } } })) }
  const from = jest.fn(() => chain({ data: sheetRow, error: null }))
  return { auth, from }
}

function party(overrides: Record<string, unknown> = {}) {
  return {
    id: 'party-1',
    collaborator_id: null,
    user_id: null,
    name: 'Jane Smith',
    email: 'jane@test.local',
    role: 'composer_lyricist',
    split_percentage: 50,
    approval_status: 'pending',
    identity_source: 'unknown',
    identity_digest_at_approval: null as string | null,
    legal_name: 'Jane Smith',
    pro: 'ASCAP',
    ipi: '00000000001',
    publishing_designee: 'Frozen Publishing',
    administrator: 'Frozen Admin Co',
    ...overrides,
  }
}

/** The service client's `.from('split_sheets')` resolver read needs the
 * full identity-column projection; the route's own apiClient ownership
 * check needs only the narrowed non-identity columns. Both read from the
 * SAME underlying sheet fixture here for consistency. */
function makeServiceClient(config: {
  status: 'draft' | 'approved'
  parties: ReturnType<typeof party>[]
  historyRows?: unknown[]
}) {
  const recorded: Recorded = { inserts: [], updates: [], rpcs: [] }

  const sheetForResolver = { id: SHEET_ID, status: config.status, split_sheet_parties: config.parties }

  const from = jest.fn((table: string) => {
    if (table === 'split_sheets') {
      const obj = chain({ data: sheetForResolver, error: null }) as Record<string, unknown>
      obj.update = jest.fn((values: unknown) => {
        recorded.updates.push({ table, values })
        return chain({ data: null, error: null })
      })
      return obj
    }
    if (table === 'esign_envelopes') {
      const obj = chain({ data: config.historyRows ?? [], error: null }) as Record<string, unknown>
      obj.insert = jest.fn((values: unknown) => {
        recorded.inserts.push({ table, values })
        return chain({ data: { id: 'env-test-1' }, error: null })
      })
      return obj
    }
    if (table === 'split_sheet_parties') {
      const obj = chain({ data: [], error: null }) as Record<string, unknown> // no existing approval tokens
      obj.update = jest.fn((values: unknown) => {
        recorded.updates.push({ table, values })
        return chain({ data: null, error: null })
      })
      return obj
    }
    if (table === 'esign_envelope_signers') {
      const obj = chain({ data: null, error: null }) as Record<string, unknown>
      obj.insert = jest.fn((values: unknown) => {
        recorded.inserts.push({ table, values })
        return chain({ data: null, error: null })
      })
      return obj
    }
    if (table === 'user_profiles') {
      return chain({ data: { artist_name: 'Test Artist' }, error: null })
    }
    if (table === 'collaborators') {
      return chain({ data: [], error: null })
    }
    return chain({ data: null, error: null })
  })

  const rpc = jest.fn((name: string) => {
    recorded.rpcs.push({ name, args: {} })
    if (name === 'claim_esign_mint') return Promise.resolve({ data: 'claimed', error: null })
    if (name === 'record_esign_mint_provider') return Promise.resolve({ data: true, error: null })
    return Promise.resolve({ data: true, error: null })
  })

  return { client: { from, rpc }, recorded }
}

function mintRequest() {
  return new Request(`http://test.local/api/split-sheets/${SHEET_ID}/mint-envelope`, { method: 'POST' })
}

function mintCtx() {
  return { params: Promise.resolve({ id: SHEET_ID }) }
}

beforeEach(() => {
  mockCreateApiClient.mockReset()
  mockCreateServiceClient.mockReset()
  mockRenderSplitSheet.mockReset()
  mockCreateRequest.mockReset()
  mockSendSignatureInvite.mockReset()
  mockRenderSplitSheet.mockResolvedValue(Buffer.from([1, 2, 3]))
  mockCreateRequest.mockResolvedValue({
    requestId: 'docuseal-req-1',
    templateId: 'tmpl-1',
    signers: [{ externalId: 'party-1', submitterId: 'sub-1', slug: 'slug-1', email: 'jane@test.local' }],
  })
  mockSendSignatureInvite.mockResolvedValue({ email: 'jane@test.local', ok: true })
})

describe('Behaviour 1 — three surfaces, one answer (Ruling 2 in one assertion)', () => {
  it('a claimed party resolves the LIVE profile’s PRO but the PARTY ROW’s publishing_designee, and every surface reads this exact return', async () => {
    const sheetRow = {
      id: SHEET_ID,
      status: 'draft',
      split_sheet_parties: [
        party({
          id: 'party-9',
          collaborator_id: 'collab-9',
          pro: 'ASCAP', // stored on the party row
          publishing_designee: 'Frozen Publishing', // stored on the party row
        }),
      ],
    }
    const service = {
      from: jest.fn((table: string) => {
        if (table === 'split_sheets') return chain({ data: sheetRow, error: null })
        if (table === 'collaborators') return chain({ data: [{ id: 'collab-9', claimed_by: 'user-9' }], error: null })
        if (table === 'user_profiles') {
          return chain({
            data: [
              {
                id: 'user-9',
                pro: 'BMI', // the LIVE profile disagrees with the party row
                ipi: '00000000099',
                publisher: 'Live Publishing', // the live profile ALSO disagrees here
                administrator: 'Live Admin',
                legal_first_name: 'Live',
                legal_middle_name: null,
                legal_last_name: 'Name',
                legal_name_suffix: null,
              },
            ],
            error: null,
          })
        }
        return chain({ data: null, error: null })
      }),
    }
    mockCreateServiceClient.mockReturnValue(service)

    // The resolver is the ONE function every reader calls (pinned by
    // __tests__/split-sheet-identity-boundary.test.ts) — driving it once
    // here and asserting the Ruling 2 split IS the "three surfaces, one
    // answer" proof: there is only one code path that could disagree with
    // itself, and this is it.
    const result = await resolvePartyIdentitiesForSheet(SHEET_ID)
    const identity = result.parties[0].identity

    // Person-scoped: the LIVE profile wins.
    expect(identity.pro).toBe('BMI')
    // Work-specific: the PARTY ROW wins, even though the profile disagrees —
    // this is the exact defect the old live-identity.ts resolver had.
    expect(identity.publishing_designee).toBe('Frozen Publishing')
  })
})

describe('Behaviour 2 — mint refuses on drift (Ruling 1)', () => {
  it('409s with a structured conflicts array and calls createRequest, renderSplitSheet and claim_esign_mint ZERO times', async () => {
    const staleBaselineDigest = identityDigest({
      legal_name: 'Jane Smith',
      pro: 'BMI', // what was true when this party approved
      ipi: '00000000001',
      publishing_designee: 'Frozen Publishing',
      administrator: 'Frozen Admin Co',
    })

    const partyRow = party({
      pro: 'ASCAP', // has since changed — this is the drift
      identity_digest_at_approval: staleBaselineDigest,
    })

    const apiSheetRow = {
      id: SHEET_ID,
      status: 'approved',
      song_name: 'Ocean Drive',
      artist_name: null,
      album_project_title: null,
      record_label: null,
      split_sheet_parties: [{ id: partyRow.id, name: partyRow.name, email: partyRow.email, role: partyRow.role, split_percentage: partyRow.split_percentage }],
    }

    mockCreateApiClient.mockReturnValue(makeApiClient(apiSheetRow))
    const { client, recorded } = makeServiceClient({ status: 'approved', parties: [partyRow] })
    mockCreateServiceClient.mockReturnValue(client)

    const res = await mintEnvelope(mintRequest(), mintCtx())
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(Array.isArray(body.conflicts)).toBe(true)
    expect(body.conflicts.length).toBeGreaterThan(0)
    expect(body.conflicts[0]).toMatchObject({ partyId: partyRow.id, partyName: partyRow.name })

    // "No spend, nothing frozen" — asserted explicitly, not by implication.
    expect(mockCreateRequest).toHaveBeenCalledTimes(0)
    expect(mockRenderSplitSheet).toHaveBeenCalledTimes(0)
    expect(recorded.rpcs.filter(r => r.name === 'claim_esign_mint')).toHaveLength(0)
    expect(recorded.inserts).toHaveLength(0)
  })
})

describe('Behaviour 3 — mint proceeds with no baseline (fast lane unaffected)', () => {
  it('mints normally from draft when identity_digest_at_approval is null on every party, and the envelope insert carries a non-null party_identity_snapshot', async () => {
    const partyRow = party({ identity_digest_at_approval: null })

    const apiSheetRow = {
      id: SHEET_ID,
      status: 'draft',
      song_name: 'Ocean Drive',
      artist_name: null,
      album_project_title: null,
      record_label: null,
      split_sheet_parties: [{ id: partyRow.id, name: partyRow.name, email: partyRow.email, role: partyRow.role, split_percentage: partyRow.split_percentage }],
    }

    mockCreateApiClient.mockReturnValue(makeApiClient(apiSheetRow))
    const { client, recorded } = makeServiceClient({ status: 'draft', parties: [partyRow] })
    mockCreateServiceClient.mockReturnValue(client)

    const res = await mintEnvelope(mintRequest(), mintCtx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.fastLane).toBe(true)
    expect(mockCreateRequest).toHaveBeenCalledTimes(1)

    const envelopeInsert = recorded.inserts.find(i => i.table === 'esign_envelopes')
    expect(envelopeInsert).toBeDefined()
    const insertedValues = envelopeInsert!.values as { party_identity_snapshot: unknown }
    expect(insertedValues.party_identity_snapshot).not.toBeNull()
    expect(Array.isArray(insertedValues.party_identity_snapshot)).toBe(true)
    expect((insertedValues.party_identity_snapshot as unknown[]).length).toBeGreaterThan(0)
  })
})

describe('Behaviour 4 — the correction payload no longer self-destructs (resolver level)', () => {
  it('a party row carrying publishing_designee still resolves the other four fields (Ruling 2, Finding D)', async () => {
    const sheetRow = {
      id: SHEET_ID,
      status: 'draft',
      split_sheet_parties: [
        party({
          id: 'party-5',
          collaborator_id: 'collab-5',
          legal_name: 'Row Legal Name',
          pro: 'ASCAP',
          ipi: '00000000005',
          publishing_designee: 'Row Publishing', // present on the row
          administrator: 'Row Admin',
        }),
      ],
    }
    const service = {
      from: jest.fn((table: string) => {
        if (table === 'split_sheets') return chain({ data: sheetRow, error: null })
        if (table === 'collaborators') return chain({ data: [{ id: 'collab-5', claimed_by: 'user-5' }], error: null })
        if (table === 'user_profiles') {
          return chain({
            data: [
              {
                id: 'user-5',
                pro: 'BMI',
                ipi: '00000000099',
                publisher: 'Live Publishing',
                administrator: 'Live Admin',
                legal_first_name: 'Live',
                legal_middle_name: null,
                legal_last_name: 'Name',
                legal_name_suffix: null,
              },
            ],
            error: null,
          })
        }
        return chain({ data: null, error: null })
      }),
    }
    mockCreateServiceClient.mockReturnValue(service)

    const result = await resolvePartyIdentitiesForSheet(SHEET_ID)
    const identity = result.parties[0].identity

    // Person-scoped fields resolve from the live profile...
    expect(identity.pro).toBe('BMI')
    expect(identity.ipi).toBe('00000000099')
    expect(identity.legal_name).toBe('Live Name')
    // ...and publishing_designee being PRESENT on the row does not discard
    // them, nor does it get overwritten itself (work-specific, row wins).
    expect(identity.publishing_designee).toBe('Row Publishing')
    expect(identity.administrator).toBe('Row Admin')
  })
})
