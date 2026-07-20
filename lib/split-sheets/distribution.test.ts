import { buildFanoutRows, type BuildFanoutRowsInput } from '@/lib/split-sheets/distribution'
import { POST as attachPOST } from '@/app/api/split-sheets/[id]/attach/route'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const BASE: BuildFanoutRowsInput = {
  parties: [
    { user_id: 'user-a', name: 'Ada', email: 'ada@example.com' },
    { user_id: 'user-b', name: 'Bea', email: 'bea@example.com' },
    { user_id: null, name: 'Cleo (no account)', email: 'cleo@example.com' },
  ],
  sheet: { id: 'sheet-1', vault_project_id: 'project-1' },
  executedFileUrl: 'release-documents/sheet-1/executed.pdf',
  auditTrailUrl: 'release-documents/sheet-1/certificate.pdf',
  completedAt: '2026-07-20T12:00:00.000Z',
  requestId: 'docuseal-submission-1',
}

describe('buildFanoutRows — cross-account distribution (P17-06)', () => {
  it('emits one row per account-holding party only', () => {
    const rows = buildFanoutRows(BASE)
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.user_id).sort()).toEqual(['user-a', 'user-b'])
  })

  it('returns zero rows when no party has an account', () => {
    const rows = buildFanoutRows({
      ...BASE,
      parties: [{ user_id: null, name: 'Solo', email: 'solo@example.com' }],
    })
    expect(rows).toHaveLength(0)
  })

  it('every row points at the SAME storage path — no file duplication', () => {
    const rows = buildFanoutRows(BASE)
    const filePaths = new Set(rows.map(r => r.file_url))
    const auditPaths = new Set(rows.map(r => r.document_data.esign.auditTrailUrl))
    expect(filePaths.size).toBe(1)
    expect(auditPaths.size).toBe(1)
    expect([...filePaths][0]).toBe(BASE.executedFileUrl)
  })

  it('satisfies vault_documents_status_requires_evidence_chk on every row', () => {
    const rows = buildFanoutRows(BASE)
    for (const row of rows) {
      expect(row.status).toBe('signed')
      expect(row.signed_at).toBe(BASE.completedAt)
      expect(row.file_url).toBeTruthy()
      expect(row.document_data.esign.completedAt).toBe(BASE.completedAt)
    }
  })

  it('carries the sheet id in document_data.split_sheet_id and the project id from the sheet (NULL for standalone)', () => {
    const rows = buildFanoutRows(BASE)
    for (const row of rows) {
      expect(row.document_data.split_sheet_id).toBe('sheet-1')
      expect(row.project_id).toBe('project-1')
    }

    const standaloneRows = buildFanoutRows({ ...BASE, sheet: { id: 'sheet-2', vault_project_id: null } })
    for (const row of standaloneRows) {
      expect(row.project_id).toBeNull()
    }
  })

  it('includes every party (account or not) in each row’s signers list', () => {
    const rows = buildFanoutRows(BASE)
    for (const row of rows) {
      expect(row.document_data.esign.signers).toHaveLength(3)
      expect(row.document_data.esign.signers.every(s => s.status === 'signed')).toBe(true)
    }
  })
})

// ─── Attach route authorization matrix ─────────────────────────────────
function jsonRequest(body: unknown) {
  return new Request('http://test.local/api/split-sheets/sheet-1/attach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function buildApiClient({
  userId,
  sheet,
  ownsProject,
  ownDocs = [],
}: {
  userId: string | null
  sheet: Record<string, unknown> | null
  ownsProject: boolean
  ownDocs?: { id: string; document_data: Record<string, unknown> | null }[]
}) {
  const sheetQuery = {
    select: jest.fn(function (this: unknown) { return this }),
    eq: jest.fn(function (this: unknown) { return this }),
    maybeSingle: jest.fn(async () => ({ data: sheet, error: null })),
  }
  const projectQuery = {
    select: jest.fn(function (this: unknown) { return this }),
    eq: jest.fn(function (this: unknown) { return this }),
    maybeSingle: jest.fn(async () => ({ data: ownsProject ? { id: 'project-1' } : null, error: null })),
  }
  const docsQuery = {
    select: jest.fn(function (this: unknown) { return this }),
    eq: jest.fn(function (this: unknown) { return this }),
    is: jest.fn(async () => ({ data: ownDocs, error: null })),
  }

  const from = jest.fn((table: string) => {
    if (table === 'split_sheets') return sheetQuery
    if (table === 'vault_projects') return projectQuery
    if (table === 'vault_documents') return docsQuery
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    auth: { getUser: jest.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
    from,
  }
}

function buildServiceClient() {
  const sheetsUpdateEq = jest.fn(async () => ({ data: null, error: null }))
  const docsUpdateEq = jest.fn(async () => ({ data: null, error: null }))
  const from = jest.fn((table: string) => {
    if (table === 'split_sheets') return { update: jest.fn(() => ({ eq: sheetsUpdateEq })) }
    if (table === 'vault_documents') return { update: jest.fn(() => ({ eq: docsUpdateEq })) }
    throw new Error(`Unexpected table: ${table}`)
  })
  return { client: { from }, sheetsUpdateEq, docsUpdateEq }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /api/split-sheets/[id]/attach — authorization matrix (V4, T-17-12)', () => {
  it('401s without a session', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(buildApiClient({ userId: null, sheet: null, ownsProject: false }))
    const res = await attachPOST(jsonRequest({ vault_project_id: 'project-1' }), { params: Promise.resolve({ id: 'sheet-1' }) })
    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('403s when the caller is not a party on the sheet', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(
      buildApiClient({
        userId: 'stranger',
        sheet: { id: 'sheet-1', initiator_user_id: 'initiator-1', status: 'executed', split_sheet_parties: [{ user_id: 'user-a' }] },
        ownsProject: true,
      })
    )
    const res = await attachPOST(jsonRequest({ vault_project_id: 'project-1' }), { params: Promise.resolve({ id: 'sheet-1' }) })
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('403s when the caller is a party but does not own the destination project', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(
      buildApiClient({
        userId: 'user-a',
        sheet: { id: 'sheet-1', initiator_user_id: 'initiator-1', status: 'executed', split_sheet_parties: [{ user_id: 'user-a' }] },
        ownsProject: false,
      })
    )
    const res = await attachPOST(jsonRequest({ vault_project_id: 'project-1' }), { params: Promise.resolve({ id: 'sheet-1' }) })
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('400s when the sheet is not yet fully executed', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(
      buildApiClient({
        userId: 'initiator-1',
        sheet: { id: 'sheet-1', initiator_user_id: 'initiator-1', status: 'esign_pending', split_sheet_parties: [] },
        ownsProject: true,
      })
    )
    const res = await attachPOST(jsonRequest({ vault_project_id: 'project-1' }), { params: Promise.resolve({ id: 'sheet-1' }) })
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('attaches the sheet and the caller’s own document when both checks pass', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(
      buildApiClient({
        userId: 'initiator-1',
        sheet: { id: 'sheet-1', initiator_user_id: 'initiator-1', status: 'executed', split_sheet_parties: [] },
        ownsProject: true,
        ownDocs: [{ id: 'doc-1', document_data: { split_sheet_id: 'sheet-1' } }],
      })
    )
    const service = buildServiceClient()
    ;(createServiceClient as jest.Mock).mockReturnValue(service.client)

    const res = await attachPOST(jsonRequest({ vault_project_id: 'project-1' }), { params: Promise.resolve({ id: 'sheet-1' }) })

    expect(res.status).toBe(200)
    expect(service.sheetsUpdateEq).toHaveBeenCalledWith('id', 'sheet-1')
    expect(service.docsUpdateEq).toHaveBeenCalledWith('id', 'doc-1')
  })
})
