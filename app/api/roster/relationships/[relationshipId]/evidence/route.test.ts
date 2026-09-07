import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { GET, PATCH } from './route'

// ─── R-08 / WSR-14 (finding F8) — the Member half of propose-then-confirm ──
// A workspace draft confers nothing until the relationship's own named
// Member confirms it here. These tests assert that only that Member can,
// that a document is required to do so, that an evidence id belonging to a
// different relationship cannot be reached through this path, and that a
// withdrawal clears the confirmation without ever removing the row (D-46).

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const MEMBER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const WORKSPACE_ADMIN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const RELATIONSHIP_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const OTHER_RELATIONSHIP_ID = '22222222-2222-2222-2222-222222222222'
const DOCUMENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const EVIDENCE_ID = '11111111-1111-1111-1111-111111111111'
const NOW_ISO = '2026-09-06T00:00:00.000Z'

function buildSessionClient(userId: string) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: userId, app_metadata: {} } } }) },
    from: jest.fn((table: string) => {
      if (table === 'user_profiles') {
        const q: Record<string, unknown> = {}
        q.select = () => q
        q.eq = () => q
        q.maybeSingle = async () => ({ data: { id: userId }, error: null })
        return q
      }
      throw new Error(`unexpected table on the session client: ${table}`)
    }),
  }
}

type EvidenceRow = Record<string, unknown> & { id: string; relationship_id: string }

type ServiceCalls = {
  updates: Record<string, unknown>[]
  deleteCalled: boolean
  auditRows: Record<string, unknown>[]
}

function baseEvidenceRow(overrides: Partial<EvidenceRow> = {}): EvidenceRow {
  return {
    id: EVIDENCE_ID,
    relationship_id: RELATIONSHIP_ID,
    document_id: DOCUMENT_ID,
    declared_scope: 'Pitch this catalogue for sync placements.',
    declared_by: WORKSPACE_ADMIN_ID,
    effective_from: null,
    expires_at: null,
    superseded_at: null,
    superseded_by: null,
    uploaded_at: NOW_ISO,
    witnessed_by_signature: false,
    confirmed_by_subject_at: null,
    confirmed_by_subject: null,
    ...overrides,
  }
}

function buildServiceClient(opts: {
  accessEnabled?: boolean
  relationship?: Record<string, unknown> | null
  evidenceRow?: EvidenceRow | null
  evidenceList?: EvidenceRow[]
}) {
  const calls: ServiceCalls = { updates: [], deleteCalled: false, auditRows: [] }

  const client = {
    calls,
    from: jest.fn((table: string) => {
      if (table === 'workspace_access_config') {
        const q: Record<string, unknown> = {}
        q.select = () => q
        q.eq = () => q
        q.maybeSingle = async () => ({
          data: { enabled: opts.accessEnabled ?? true },
          error: null,
        })
        return q
      }

      if (table === 'workspace_roster_relationships') {
        const q: Record<string, unknown> = {}
        q.select = () => q
        q.eq = () => q
        q.maybeSingle = async () => ({
          data:
            opts.relationship === undefined
              ? { id: RELATIONSHIP_ID, workspace_id: WORKSPACE_ID, member_user_id: MEMBER_ID }
              : opts.relationship,
          error: null,
        })
        return q
      }

      if (table === 'workspace_agreement_evidence') {
        // Honours the filters the route applies, so the cross-relationship
        // case below is a real filter miss rather than a stubbed answer.
        const filters: Record<string, unknown> = {}
        const q: Record<string, unknown> = {}
        q.select = () => q
        q.eq = (column: string, value: unknown) => {
          filters[column] = value
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
        q.order = async () => ({
          data: (opts.evidenceList ?? []).filter(
            (row) =>
              filters.relationship_id === undefined ||
              filters.relationship_id === row.relationship_id
          ),
          error: null,
        })
        const matched = () => {
          const row = opts.evidenceRow === undefined ? baseEvidenceRow() : opts.evidenceRow
          if (!row) return null
          if (filters.id !== undefined && filters.id !== row.id) return null
          if (
            filters.relationship_id !== undefined &&
            filters.relationship_id !== row.relationship_id
          ) {
            return null
          }
          return row
        }
        q.maybeSingle = async () => ({ data: matched(), error: null })
        q.single = async () => {
          const row = matched()
          const applied = calls.updates[calls.updates.length - 1] ?? {}
          return { data: { ...row, ...applied }, error: null }
        }
        return q
      }

      if (table === 'workspace_audit_log') {
        return {
          insert: async (row: Record<string, unknown>) => {
            calls.auditRows.push(row)
            return { error: null }
          },
        }
      }

      throw new Error(`unexpected table on the service client: ${table}`)
    }),
  }

  return client
}

const params = () => Promise.resolve({ relationshipId: RELATIONSHIP_ID })

function getRequest() {
  return new Request(`http://t.local/api/roster/relationships/${RELATIONSHIP_ID}/evidence`)
}

function patchRequest(body: unknown) {
  return new Request(`http://t.local/api/roster/relationships/${RELATIONSHIP_ID}/evidence`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/roster/relationships/[relationshipId]/evidence', () => {
  it('lists the proposed evidence for the named Member with scope, provenance, confirmation state and document id', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient(MEMBER_ID))
    ;(createServiceClient as jest.Mock).mockReturnValue(
      buildServiceClient({ evidenceList: [baseEvidenceRow()] })
    )

    const res = await GET(getRequest(), { params: params() })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].declaredScope).toBe('Pitch this catalogue for sync placements.')
    expect(body.data[0].documentId).toBe(DOCUMENT_ID)
    expect(body.data[0].isConfirmedBySubject).toBe(false)
    expect(body.data[0].confirmedBySubjectAt).toBeNull()
    // describeProvenance's two-label vocabulary, unextended (D-37).
    expect(['Uploaded by the rights holder', 'Signature witnessed by Funun']).toContain(
      body.data[0].stateLabel
    )

    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('document_data')
    expect(serialized).not.toContain('storage_path')
    expect(serialized).not.toContain('signedUrl')
  })

  it('returns a generic 403 to anyone the relationship does not name', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient(WORKSPACE_ADMIN_ID))
    ;(createServiceClient as jest.Mock).mockReturnValue(
      buildServiceClient({ evidenceList: [baseEvidenceRow()] })
    )

    const res = await GET(getRequest(), { params: params() })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).not.toMatch(/not found|does not exist/i)
  })
})

describe('PATCH — confirm', () => {
  it('sets both confirmation columns for the named Member and returns the updated row', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient(MEMBER_ID))
    const service = buildServiceClient({})
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(patchRequest({ evidenceId: EVIDENCE_ID, action: 'confirm' }), {
      params: params(),
    })
    expect(res.status).toBe(200)

    expect(service.calls.updates).toHaveLength(1)
    expect(service.calls.updates[0].confirmed_by_subject).toBe(MEMBER_ID)
    expect(typeof service.calls.updates[0].confirmed_by_subject_at).toBe('string')

    const body = await res.json()
    expect(body.data.isConfirmedBySubject).toBe(true)

    expect(service.calls.auditRows[0]).toMatchObject({
      action: 'workspace.evidence.confirmed',
      actor_user_id: MEMBER_ID,
      subject_member_id: MEMBER_ID,
    })
    // The audit row carries the evidence id and the declared scope only.
    expect(Object.keys(service.calls.auditRows[0].changes as object).sort()).toEqual([
      'declaredScope',
      'evidenceId',
    ])
  })

  it('refuses 403 for a workspace owner or admin who is not the named Member', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient(WORKSPACE_ADMIN_ID))
    const service = buildServiceClient({})
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(patchRequest({ evidenceId: EVIDENCE_ID, action: 'confirm' }), {
      params: params(),
    })
    expect(res.status).toBe(403)
    expect(service.calls.updates).toHaveLength(0)
  })

  it('refuses 409 when the row has no document', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient(MEMBER_ID))
    const service = buildServiceClient({ evidenceRow: baseEvidenceRow({ document_id: null }) })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(patchRequest({ evidenceId: EVIDENCE_ID, action: 'confirm' }), {
      params: params(),
    })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/document/i)
    expect(service.calls.updates).toHaveLength(0)
  })

  it('is idempotent on an already-confirmed row', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient(MEMBER_ID))
    const service = buildServiceClient({
      evidenceRow: baseEvidenceRow({
        confirmed_by_subject_at: NOW_ISO,
        confirmed_by_subject: MEMBER_ID,
      }),
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(patchRequest({ evidenceId: EVIDENCE_ID, action: 'confirm' }), {
      params: params(),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.isConfirmedBySubject).toBe(true)
  })

  it('cannot reach an evidence id belonging to a different relationship', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient(MEMBER_ID))
    const service = buildServiceClient({
      evidenceRow: baseEvidenceRow({ relationship_id: OTHER_RELATIONSHIP_ID }),
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(patchRequest({ evidenceId: EVIDENCE_ID, action: 'confirm' }), {
      params: params(),
    })
    expect(res.status).toBe(404)
    expect(service.calls.updates).toHaveLength(0)
  })

  it('refuses 400 for an unknown action', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient(MEMBER_ID))
    const service = buildServiceClient({})
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(patchRequest({ evidenceId: EVIDENCE_ID, action: 'approve' }), {
      params: params(),
    })
    expect(res.status).toBe(400)
    expect(service.calls.updates).toHaveLength(0)
  })
})

describe('PATCH — withdraw', () => {
  it('clears both confirmation columns and never removes the row (D-46)', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient(MEMBER_ID))
    const service = buildServiceClient({
      evidenceRow: baseEvidenceRow({
        confirmed_by_subject_at: NOW_ISO,
        confirmed_by_subject: MEMBER_ID,
      }),
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(patchRequest({ evidenceId: EVIDENCE_ID, action: 'withdraw' }), {
      params: params(),
    })
    expect(res.status).toBe(200)

    expect(service.calls.deleteCalled).toBe(false)
    expect(service.calls.updates).toEqual([
      { confirmed_by_subject_at: null, confirmed_by_subject: null },
    ])

    const body = await res.json()
    expect(body.data.isConfirmedBySubject).toBe(false)

    expect(service.calls.auditRows[0]).toMatchObject({
      action: 'workspace.evidence.confirmation_withdrawn',
      actor_user_id: MEMBER_ID,
      subject_member_id: MEMBER_ID,
    })
  })
})

describe('the D-56 kill switch', () => {
  it('returns 503 from GET when workspace access is off', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient(MEMBER_ID))
    ;(createServiceClient as jest.Mock).mockReturnValue(
      buildServiceClient({ accessEnabled: false, evidenceList: [baseEvidenceRow()] })
    )

    const res = await GET(getRequest(), { params: params() })
    expect(res.status).toBe(503)
  })

  it('returns 503 from PATCH when workspace access is off', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient(MEMBER_ID))
    const service = buildServiceClient({ accessEnabled: false })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(patchRequest({ evidenceId: EVIDENCE_ID, action: 'confirm' }), {
      params: params(),
    })
    expect(res.status).toBe(503)
    expect(service.calls.updates).toHaveLength(0)
  })
})
