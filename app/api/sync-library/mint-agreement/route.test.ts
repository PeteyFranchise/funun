import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { docusealProvider } from '@/lib/esign/docuseal'
import { renderBlanketAgreement } from '@/lib/vault/pdf/blanket-agreement'
import { BLANKET_AGREEMENT_VERSION, getCurrentBlanketAgreement } from '@/lib/sync-library/agreement'
import { POST } from './route'

// ─── POST /api/sync-library/mint-agreement (26-04 Task 2) ──────────────
// Colocated route test, mirroring app/api/sync-library/submit/route.test.ts's
// mock-client conventions. Covers: 401 unauthenticated, sign-once (existing
// signed / existing pending agreement returned without a second mint), 409
// with no pending sync-library submission to sign for, and a first mint
// that calls docusealProvider.createRequest exactly once and persists
// exactly one vault_documents row via the lightweight document_data.esign
// path (never esign_envelopes).

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/esign/docuseal', () => ({
  docusealProvider: { createRequest: jest.fn() },
}))

jest.mock('@/lib/vault/pdf/blanket-agreement', () => ({
  renderBlanketAgreement: jest.fn(),
}))

const USER_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_EMAIL = 'artist@test.local'

type QueryResult = { data: unknown; error: unknown }

/** A minimal chainable Supabase query-builder stand-in — mirrors
 * app/api/sync-library/submit/route.test.ts's makeQuery, extended with
 * order/limit/single for this route's existing-agreement lookup and insert. */
function makeQuery(result: QueryResult = { data: null, error: null }) {
  const builder: {
    eq: jest.Mock
    in: jest.Mock
    select: jest.Mock
    order: jest.Mock
    limit: jest.Mock
    maybeSingle: jest.Mock
    single: jest.Mock
    then: (resolve: (v: QueryResult) => void) => void
  } = {
    eq: jest.fn(() => builder),
    in: jest.fn(() => builder),
    select: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    maybeSingle: jest.fn(async () => result),
    single: jest.fn(async () => result),
    then: resolve => resolve(result),
  }
  return builder
}

function mockApiClient(user: { id: string; email: string } | null = { id: USER_UUID, email: USER_EMAIL }) {
  return { auth: { getUser: jest.fn(async () => ({ data: { user } })) } }
}

function mockServiceClient(
  options: {
    existingAgreement?: { id: string; status: string; signed_at: string | null; document_data: unknown } | null
    cohortExists?: boolean
    profile?: { artist_name: string | null } | null
    insertResult?: QueryResult
    cohortDetail?: { id: string; status: string }[]
  } = {}
) {
  const {
    existingAgreement = null,
    cohortExists = true,
    profile = { artist_name: 'Test Artist' },
    insertResult = { data: { id: 'doc-1' }, error: null },
    cohortDetail = [],
  } = options

  const vaultDocsSelectSpy = jest.fn(() => makeQuery({ data: existingAgreement, error: null }))
  const vaultDocsInsertSpy = jest.fn(() => makeQuery(insertResult))

  let syncListingsSelectCallCount = 0
  const syncListingsSelectSpy = jest.fn(() => {
    syncListingsSelectCallCount += 1
    // 1st call = cohort-existence gate check; 2nd = advance-on-mint detail.
    if (syncListingsSelectCallCount === 1) {
      return makeQuery({ data: cohortExists ? [{ id: 'listing-1' }] : [], error: null })
    }
    return makeQuery({ data: cohortDetail, error: null })
  })
  const syncListingsUpdateSpy = jest.fn(() => makeQuery({ data: null, error: null }))

  const userProfilesSelectSpy = jest.fn(() => makeQuery({ data: profile, error: null }))

  const from = jest.fn((table: string) => {
    if (table === 'vault_documents') return { select: vaultDocsSelectSpy, insert: vaultDocsInsertSpy }
    if (table === 'sync_listings') return { select: syncListingsSelectSpy, update: syncListingsUpdateSpy }
    if (table === 'user_profiles') return { select: userProfilesSelectSpy }
    throw new Error(`unexpected service table: ${table}`)
  })

  return {
    from,
    vaultDocsSelectSpy,
    vaultDocsInsertSpy,
    syncListingsSelectSpy,
    syncListingsUpdateSpy,
    userProfilesSelectSpy,
  }
}

function createRequestResult(overrides: Partial<{ requestId: string }> = {}) {
  return {
    requestId: overrides.requestId ?? 'req-123',
    templateId: 'tmpl-1',
    signers: [
      {
        email: USER_EMAIL,
        role: 'Party1',
        externalId: USER_UUID,
        submitterId: 'sub-1',
        slug: 'slug-abc',
        embedSrc: 'https://docuseal.com/s/slug-abc',
      },
    ],
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(renderBlanketAgreement as jest.Mock).mockResolvedValue(Buffer.from([1, 2, 3]))
  ;(docusealProvider.createRequest as jest.Mock).mockResolvedValue(createRequestResult())
})

describe('POST /api/sync-library/mint-agreement', () => {
  it('returns 401 when unauthenticated', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockApiClient(null))
    ;(createServiceClient as jest.Mock).mockReturnValue(mockServiceClient())

    const res = await POST(new Request('http://t.local/api/sync-library/mint-agreement', { method: 'POST' }))

    expect(res.status).toBe(401)
    expect(docusealProvider.createRequest).not.toHaveBeenCalled()
  })

  it('returns the existing SIGNED agreement without minting a second one', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockApiClient())
    const service = mockServiceClient({
      existingAgreement: {
        id: 'doc-existing',
        status: 'signed',
        signed_at: '2026-08-01T00:00:00Z',
        document_data: {
          esign: {
            provider: 'docuseal',
            requestId: 'req-old',
            signers: [{ name: 'Test Artist', email: USER_EMAIL, status: 'signed' }],
          },
        },
      },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(new Request('http://t.local/api/sync-library/mint-agreement', { method: 'POST' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toMatchObject({ agreementId: 'doc-existing', status: 'signed' })
    expect(docusealProvider.createRequest).not.toHaveBeenCalled()
    expect(service.vaultDocsInsertSpy).not.toHaveBeenCalled()
  })

  it('returns the existing PENDING agreement without minting a second one', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockApiClient())
    const service = mockServiceClient({
      existingAgreement: {
        id: 'doc-existing',
        status: 'pending',
        signed_at: null,
        document_data: {
          esign: {
            provider: 'docuseal',
            requestId: 'req-old',
            signers: [{ name: 'Test Artist', email: USER_EMAIL, status: 'pending' }],
            embedSlug: 'slug-old',
            embedSrc: 'https://docuseal.com/s/slug-old',
          },
        },
      },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(new Request('http://t.local/api/sync-library/mint-agreement', { method: 'POST' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toMatchObject({
      agreementId: 'doc-existing',
      status: 'pending',
      embed: { slug: 'slug-old', src: 'https://docuseal.com/s/slug-old' },
    })
    expect(docusealProvider.createRequest).not.toHaveBeenCalled()
    expect(service.vaultDocsInsertSpy).not.toHaveBeenCalled()
  })

  it('returns 409 when the artist has no pending sync-library submission to sign for', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockApiClient())
    const service = mockServiceClient({ cohortExists: false })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(new Request('http://t.local/api/sync-library/mint-agreement', { method: 'POST' }))

    expect(res.status).toBe(409)
    expect(docusealProvider.createRequest).not.toHaveBeenCalled()
    expect(service.vaultDocsInsertSpy).not.toHaveBeenCalled()
  })

  it('on first mint calls docusealProvider.createRequest once and persists one vault_documents row', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockApiClient())
    const service = mockServiceClient({
      cohortDetail: [
        { id: 'listing-1', status: 'applied' },
        { id: 'listing-2', status: 'invited' },
      ],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(new Request('http://t.local/api/sync-library/mint-agreement', { method: 'POST' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(docusealProvider.createRequest).toHaveBeenCalledTimes(1)
    const call = (docusealProvider.createRequest as jest.Mock).mock.calls[0][0]
    expect(call.title).toBe(getCurrentBlanketAgreement().title)
    expect(call.embedded).toBe(true)
    expect(call.signers).toHaveLength(1)
    expect(call.signers[0]).toMatchObject({ role: 'Party1', externalId: USER_UUID, email: USER_EMAIL })

    expect(service.vaultDocsInsertSpy).toHaveBeenCalledTimes(1)
    const insertedRow = (service.vaultDocsInsertSpy as jest.Mock).mock.calls[0][0]
    expect(insertedRow).toMatchObject({
      user_id: USER_UUID,
      type: 'blanket_agreement',
      status: 'pending',
      source: 'generated',
    })
    expect(insertedRow.document_data.esign).toMatchObject({
      provider: 'docuseal',
      requestId: 'req-123',
      agreementVersion: BLANKET_AGREEMENT_VERSION,
    })

    // Sign-once cohort advance: applied/invited -> agreement_pending.
    expect(service.syncListingsUpdateSpy).toHaveBeenCalledWith({ status: 'agreement_pending' })

    expect(body.data).toMatchObject({
      agreementId: 'doc-1',
      status: 'pending',
      agreementVersion: BLANKET_AGREEMENT_VERSION,
      embed: { slug: 'slug-abc', src: 'https://docuseal.com/s/slug-abc' },
    })
  })

  it('never creates an esign_envelopes row (lightweight document_data.esign path only)', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockApiClient())
    const service = mockServiceClient()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await POST(new Request('http://t.local/api/sync-library/mint-agreement', { method: 'POST' }))

    const calledTables = (service.from as jest.Mock).mock.calls.map(c => c[0])
    expect(calledTables).not.toContain('esign_envelopes')
    expect(calledTables).not.toContain('esign_envelope_signers')
  })
})
