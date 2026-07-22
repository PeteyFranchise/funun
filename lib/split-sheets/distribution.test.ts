import { buildFanoutRows, type BuildFanoutRowsInput } from '@/lib/split-sheets/distribution'

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

// NOTE (18-03): the POST /api/split-sheets/[id]/attach authorization-matrix
// tests that used to live in this file moved to
// lib/split-sheets/attachment.test.ts, alongside the new detach and
// track-verification tests — the route's behavior changed (the
// executed-only gate is removed per P18-04, and it now accepts an optional
// track_id), so its tests now live next to the attachment module they
// exercise rather than beside the unrelated fan-out builder.
