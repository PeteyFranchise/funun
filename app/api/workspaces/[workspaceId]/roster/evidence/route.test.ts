import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { DELETE, GET, POST } from './route'

// ─── R-08 / WSR-14 / WSR-22 (finding F8) ─────────────────────────────────
// The workspace side of the propose-then-confirm model. Everything asserted
// here is about what a workspace admin can and cannot cause to be stored:
// a document is mandatory, it must be the subject Member's own document,
// the inserted row is inert (both confirmation columns null), and a
// malformed or inverted date window never reaches a column.
//
// Deliberately drives the REAL route handlers against in-memory Supabase
// stubs, so the assertions are on actual HTTP status codes and on the exact
// row handed to `.insert()` — not on a re-implementation of the rule.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ADMIN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MEMBER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const THIRD_PARTY_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const RELATIONSHIP_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const DOCUMENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const EVIDENCE_ID = '11111111-1111-1111-1111-111111111111'
const NOW_ISO = '2026-09-06T00:00:00.000Z'

type QueryResult = { data: unknown; error: unknown }

/** Minimal chainable PostgREST stub: every filter returns itself, every
 * terminal resolves to the supplied result. */
function chain(result: QueryResult) {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.in = () => q
  q.order = async () => result
  q.maybeSingle = async () => result
  q.single = async () => result
  return q
}

function buildSessionClient(opts: {
  role?: string
  evidenceRows?: unknown[]
}) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: ADMIN_ID, app_metadata: {} } } }) },
    from: jest.fn((table: string) => {
      if (table === 'workspace_members') {
        return chain({
          data: { role: opts.role ?? 'admin', status: 'active', expires_at: null },
          error: null,
        })
      }
      if (table === 'workspace_agreement_evidence') {
        return chain({ data: opts.evidenceRows ?? [], error: null })
      }
      throw new Error(`unexpected table on the session client: ${table}`)
    }),
  }
}

type ServiceCalls = {
  tables: string[]
  insertedRow: Record<string, unknown> | null
  updates: Record<string, unknown>[]
  deleteCalled: boolean
  auditRows: Record<string, unknown>[]
}

function buildServiceClient(opts: {
  relationship?: Record<string, unknown> | null
  document?: Record<string, unknown> | null
  existingEvidence?: Record<string, unknown> | null
}) {
  const calls: ServiceCalls = {
    tables: [],
    insertedRow: null,
    updates: [],
    deleteCalled: false,
    auditRows: [],
  }

  const client = {
    calls,
    from: jest.fn((table: string) => {
      calls.tables.push(table)

      if (table === 'workspace_access_config') {
        return chain({ data: { enabled: true }, error: null })
      }
      if (table === 'workspace_roster_relationships') {
        return chain({
          data:
            opts.relationship === undefined
              ? {
                  id: RELATIONSHIP_ID,
                  workspace_id: WORKSPACE_ID,
                  member_user_id: MEMBER_ID,
                  state: 'accepted',
                }
              : opts.relationship,
          error: null,
        })
      }
      if (table === 'vault_documents') {
        return chain({ data: opts.document ?? null, error: null })
      }
      if (table === 'workspace_audit_log') {
        return {
          insert: async (row: Record<string, unknown>) => {
            calls.auditRows.push(row)
            return { error: null }
          },
        }
      }
      if (table === 'workspace_agreement_evidence') {
        const q: Record<string, unknown> = {}
        q.select = () => q
        q.eq = () => q
        q.insert = (row: Record<string, unknown>) => {
          calls.insertedRow = row
          return q
        }
        q.update = (row: Record<string, unknown>) => {
          calls.updates.push(row)
          return q
        }
        q.delete = () => {
          calls.deleteCalled = true
          return q
        }
        q.maybeSingle = async () => ({ data: opts.existingEvidence ?? null, error: null })
        q.single = async () => {
          if (calls.updates.length > 0) {
            return {
              data: {
                id: EVIDENCE_ID,
                relationship_id: RELATIONSHIP_ID,
                ...calls.updates[calls.updates.length - 1],
              },
              error: null,
            }
          }
          const row = calls.insertedRow ?? {}
          return {
            data: { id: EVIDENCE_ID, uploaded_at: NOW_ISO, created_at: NOW_ISO, ...row },
            error: null,
          }
        }
        return q
      }
      throw new Error(`unexpected table on the service client: ${table}`)
    }),
  }

  return client
}

function postRequest(body: unknown) {
  return new Request(`http://t.local/api/workspaces/${WORKSPACE_ID}/roster/evidence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = () => Promise.resolve({ workspaceId: WORKSPACE_ID })

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    relationshipId: RELATIONSHIP_ID,
    declaredScope: 'Pitch this catalogue for sync placements.',
    documentId: DOCUMENT_ID,
    ...overrides,
  }
}

const subjectOwnedDocument = { user_id: MEMBER_ID, document_data: null }

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /api/workspaces/[workspaceId]/roster/evidence — the document is mandatory (WSR-14)', () => {
  it('refuses 400 when no documentId is supplied', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient({}))
    const service = buildServiceClient({ document: subjectOwnedDocument })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const body = validBody()
    delete (body as Record<string, unknown>).documentId

    const res = await POST(postRequest(body), { params: params() })
    expect(res.status).toBe(400)
    expect(service.calls.insertedRow).toBeNull()
  })
})

describe('POST — the document must be the subject Member own document (R-08)', () => {
  it('refuses 403 when the referenced document belongs to a third party', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient({}))
    const service = buildServiceClient({
      document: { user_id: THIRD_PARTY_ID, document_data: null },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(postRequest(validBody()), { params: params() })
    expect(res.status).toBe(403)
    expect(service.calls.insertedRow).toBeNull()
  })

  it('uses one identical message for a third-party document and a nonexistent one, so existence is never disclosed', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient({}))
    const thirdParty = buildServiceClient({
      document: { user_id: THIRD_PARTY_ID, document_data: null },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(thirdParty)
    const thirdPartyBody = await (await POST(postRequest(validBody()), { params: params() })).json()

    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient({}))
    const missing = buildServiceClient({ document: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(missing)
    const missingRes = await POST(postRequest(validBody()), { params: params() })
    const missingBody = await missingRes.json()

    expect(missingRes.status).toBe(403)
    expect(missingBody.error).toBe(thirdPartyBody.error)
    expect(missingBody.error).not.toMatch(/not found|does not exist|no such/i)
  })
})

describe('POST — the inserted row is a proposal and confers nothing (R-08, F8)', () => {
  it('inserts with both confirmation columns null and reports the row as unconfirmed', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient({}))
    const service = buildServiceClient({ document: subjectOwnedDocument })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(postRequest(validBody()), { params: params() })
    expect(res.status).toBe(201)

    expect(service.calls.insertedRow).toMatchObject({
      relationship_id: RELATIONSHIP_ID,
      document_id: DOCUMENT_ID,
      confirmed_by_subject_at: null,
      confirmed_by_subject: null,
    })

    const body = await res.json()
    expect(body.data.isConfirmedBySubject).toBe(false)
    expect(body.data.confirmedBySubjectAt).toBeNull()
  })
})

describe('POST — strict date validation (WSR-22)', () => {
  it('refuses 400 for a malformed effectiveFrom before reading the relationship or the document', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient({}))
    const service = buildServiceClient({ document: subjectOwnedDocument })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(postRequest(validBody({ effectiveFrom: '2026-02-30' })), {
      params: params(),
    })
    expect(res.status).toBe(400)
    // The only service-client table touched is the kill-switch config that
    // requireWorkspaceAccess consults before anything else.
    expect(service.calls.tables).not.toContain('workspace_roster_relationships')
    expect(service.calls.tables).not.toContain('vault_documents')
    expect(service.calls.insertedRow).toBeNull()
  })

  it('refuses 400 for a malformed expiresAt', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient({}))
    const service = buildServiceClient({ document: subjectOwnedDocument })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(postRequest(validBody({ expiresAt: 'whenever' })), { params: params() })
    expect(res.status).toBe(400)
    expect(service.calls.insertedRow).toBeNull()
  })

  it('refuses 400 naming both fields when expiresAt is at or before effectiveFrom', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient({}))
    const service = buildServiceClient({ document: subjectOwnedDocument })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      postRequest(
        validBody({ effectiveFrom: '2026-12-31', expiresAt: '2026-01-01T00:00:00.000Z' })
      ),
      { params: params() }
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('effectiveFrom')
    expect(body.error).toContain('expiresAt')
    expect(service.calls.insertedRow).toBeNull()
  })

  it('accepts a well-formed, correctly ordered window', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient({}))
    const service = buildServiceClient({ document: subjectOwnedDocument })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      postRequest(
        validBody({ effectiveFrom: '2026-01-01', expiresAt: '2026-12-31T00:00:00.000Z' })
      ),
      { params: params() }
    )
    expect(res.status).toBe(201)
    expect(service.calls.insertedRow).toMatchObject({
      effective_from: '2026-01-01',
      expires_at: '2026-12-31T00:00:00.000Z',
    })
  })
})

describe('POST — the existing gate and precondition are unchanged', () => {
  it('refuses a workspace member who cannot manage the roster', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient({ role: 'member' }))
    const service = buildServiceClient({ document: subjectOwnedDocument })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(postRequest(validBody()), { params: params() })
    expect(res.status).toBe(403)
    expect(service.calls.insertedRow).toBeNull()
  })

  it('refuses 409 when the roster relationship is not accepted', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient({}))
    const service = buildServiceClient({
      relationship: {
        id: RELATIONSHIP_ID,
        workspace_id: WORKSPACE_ID,
        member_user_id: MEMBER_ID,
        state: 'proposed',
      },
      document: subjectOwnedDocument,
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(postRequest(validBody()), { params: params() })
    expect(res.status).toBe(409)
    expect(service.calls.insertedRow).toBeNull()
  })
})

describe('GET /api/workspaces/[workspaceId]/roster/evidence', () => {
  it('reports the confirmation state per row without exposing the document contents', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(
      buildSessionClient({
        evidenceRows: [
          {
            id: EVIDENCE_ID,
            relationship_id: RELATIONSHIP_ID,
            declared_scope: 'Pitch this catalogue for sync placements.',
            declared_by: ADMIN_ID,
            effective_from: null,
            expires_at: null,
            superseded_at: null,
            superseded_by: null,
            uploaded_at: NOW_ISO,
            witnessed_by_signature: false,
            confirmed_by_subject_at: null,
          },
        ],
      })
    )
    ;(createServiceClient as jest.Mock).mockReturnValue(buildServiceClient({}))

    const res = await GET(
      new Request(
        `http://t.local/api/workspaces/${WORKSPACE_ID}/roster/evidence?relationshipId=${RELATIONSHIP_ID}`
      ),
      { params: params() }
    )
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].isConfirmedBySubject).toBe(false)
    expect(body.data[0].confirmedBySubjectAt).toBeNull()
    expect(body.data[0].stateLabel).toBe('Uploaded by the rights holder')

    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('document_data')
    expect(serialized).not.toContain('storage_path')
    expect(serialized).not.toContain('signedUrl')
  })
})

describe('DELETE /api/workspaces/[workspaceId]/roster/evidence — supersedes, never removes (D-46)', () => {
  it('sets superseded_at through an update and issues no row-removal call', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient({}))
    const service = buildServiceClient({
      existingEvidence: {
        id: EVIDENCE_ID,
        relationship_id: RELATIONSHIP_ID,
        superseded_at: null,
      },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await DELETE(
      new Request(`http://t.local/api/workspaces/${WORKSPACE_ID}/roster/evidence`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceId: EVIDENCE_ID }),
      }),
      { params: params() }
    )

    expect(res.status).toBe(200)
    expect(service.calls.deleteCalled).toBe(false)
    expect(service.calls.updates[0]).toHaveProperty('superseded_at')
  })
})
