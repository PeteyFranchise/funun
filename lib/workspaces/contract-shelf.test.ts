import {
  buildWorkspaceContractShelf,
  normalizeWorkspaceDocumentRows,
  normalizeWorkspaceEvidenceRows,
  resolveWorkspaceEvidenceState,
} from '@/lib/workspaces/contract-shelf'
import { normalizeWorkspaceRosterRows } from '@/lib/workspaces/room-data'

const WORKSPACE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const RELATIONSHIP_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const MEMBER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const UPLOADER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const EVIDENCE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const DOCUMENT_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-09-12T16:00:00.000Z').getTime()

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    id: EVIDENCE_ID,
    relationship_id: RELATIONSHIP_ID,
    document_id: DOCUMENT_ID,
    declared_scope: 'Recording administration',
    declared_by: UPLOADER_ID,
    effective_from: null,
    expires_at: null,
    superseded_at: null,
    uploaded_at: '2026-09-10T12:00:00.000Z',
    witnessed_by_signature: false,
    confirmed_by_subject_at: '2026-09-11T12:00:00.000Z',
    ...overrides,
  }
}

describe('workspace Contract Locker normalization', () => {
  it('keeps only visible relationship evidence and marks malformed lifecycle dates', () => {
    const rows = normalizeWorkspaceEvidenceRows(
      [
        evidence({ expires_at: 'not-a-date', private_payload: 'never forward this' }),
        evidence({ id: '22222222-2222-4222-8222-222222222222', relationship_id: PROJECT_ID }),
      ],
      new Set([RELATIONSHIP_ID])
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(expect.objectContaining({
      id: EVIDENCE_ID,
      relationshipId: RELATIONSHIP_ID,
      hasMalformedDate: true,
    }))
    expect(JSON.stringify(rows)).not.toContain('private_payload')
    expect(JSON.stringify(rows)).not.toContain('never forward this')
  })

  it('accepts only the migration-193 document summary shape and strips private fields', () => {
    const rows = normalizeWorkspaceDocumentRows(
      [{
        id: DOCUMENT_ID,
        project_id: PROJECT_ID,
        track_id: null,
        type: 'split_sheet',
        status: 'signed',
        signed_at: '2026-09-11T12:00:00.000Z',
        file_url: 'https://private.example/document.pdf',
        document_data: { signer: 'private@example.com' },
        verification_summary: 'private analysis',
      }],
      new Set([DOCUMENT_ID]),
      false
    )

    expect(rows).toEqual([{
      id: DOCUMENT_ID,
      projectId: PROJECT_ID,
      type: 'split_sheet',
      status: 'signed',
      signedAt: '2026-09-11T12:00:00.000Z',
      personallyReadable: false,
    }])
    expect(JSON.stringify(rows)).not.toContain('private.example')
    expect(JSON.stringify(rows)).not.toContain('private@example.com')
    expect(JSON.stringify(rows)).not.toContain('private analysis')
  })

  it('rejects unknown document types, statuses, ids, and malformed signed dates', () => {
    expect(normalizeWorkspaceDocumentRows([
      { id: DOCUMENT_ID, type: 'secret_contract', status: 'signed' },
      { id: DOCUMENT_ID, type: 'split_sheet', status: 'legally_valid' },
      { id: 'bad', type: 'split_sheet', status: 'signed' },
      { id: DOCUMENT_ID, type: 'split_sheet', status: 'signed', signed_at: 'bad-date' },
    ], new Set([DOCUMENT_ID]), false)).toEqual([])
  })
})

describe('workspace agreement evidence lifecycle', () => {
  const base = {
    confirmedAt: '2026-09-11T12:00:00.000Z',
    documentId: DOCUMENT_ID,
    effectiveFrom: null,
    expiresAt: null,
    supersededAt: null,
    hasMalformedDate: false,
  }

  it('prioritizes record issues, supersession, expiry, and future effectiveness', () => {
    expect(resolveWorkspaceEvidenceState({ ...base, hasMalformedDate: true }, NOW)).toBe('record_issue')
    expect(resolveWorkspaceEvidenceState({ ...base, supersededAt: '2026-09-01T00:00:00.000Z' }, NOW)).toBe('superseded')
    expect(resolveWorkspaceEvidenceState({ ...base, expiresAt: '2026-09-01T00:00:00.000Z' }, NOW)).toBe('expired')
    expect(resolveWorkspaceEvidenceState({ ...base, effectiveFrom: '2026-10-01' }, NOW)).toBe('not_yet_effective')
  })

  it('keeps missing-document, awaiting-confirmation, and confirmed states distinct', () => {
    expect(resolveWorkspaceEvidenceState({ ...base, documentId: null }, NOW)).toBe('document_not_linked')
    expect(resolveWorkspaceEvidenceState({ ...base, confirmedAt: null }, NOW)).toBe('awaiting_confirmation')
    expect(resolveWorkspaceEvidenceState(base, NOW)).toBe('confirmed_record')
  })
})

describe('workspace Contract Locker shelf presentation', () => {
  const rosterRows = normalizeWorkspaceRosterRows([
    {
      id: RELATIONSHIP_ID,
      workspace_id: WORKSPACE_ID,
      member_user_id: MEMBER_ID,
      professional_role: 'Producer',
      state: 'accepted',
    },
  ], WORKSPACE_ID)

  it('groups by Member and project while withholding canonical links for workspace-only reads', () => {
    const evidenceRows = normalizeWorkspaceEvidenceRows([evidence()], new Set([RELATIONSHIP_ID]))
    const documentRows = normalizeWorkspaceDocumentRows([{
      id: DOCUMENT_ID,
      project_id: PROJECT_ID,
      type: 'split_sheet',
      status: 'signed',
      signed_at: '2026-09-11T12:00:00.000Z',
    }], new Set([DOCUMENT_ID]), false)
    const data = buildWorkspaceContractShelf({
      rosterRows,
      evidenceRows,
      documentRows,
      profiles: new Map([
        [MEMBER_ID, { id: MEMBER_ID, artistName: 'Maya Reyes', handle: 'maya' }],
        [UPLOADER_ID, { id: UPLOADER_ID, artistName: 'Team Lead', handle: 'lead' }],
      ]),
      projectTitles: new Map([[PROJECT_ID, 'Heartburn']]),
      now: NOW,
    })

    expect(data.recordCount).toBe(1)
    expect(data.groups).toHaveLength(1)
    expect(data.groups[0]).toEqual(expect.objectContaining({
      memberDisplayName: 'Maya Reyes',
      memberHandle: 'maya',
    }))
    expect(data.groups[0].records[0]).toEqual(expect.objectContaining({
      projectLabel: 'Heartburn',
      documentTypeLabel: 'Split Sheet',
      documentState: 'signed',
      evidenceState: 'confirmed_record',
      uploadedByDisplayName: 'Team Lead',
      canonicalHref: null,
    }))
  })

  it('links only a personally readable document to its canonical Member surface', () => {
    const evidenceRows = normalizeWorkspaceEvidenceRows([evidence()], new Set([RELATIONSHIP_ID]))
    const documentRows = normalizeWorkspaceDocumentRows([{
      id: DOCUMENT_ID,
      project_id: null,
      type: 'hire_right',
      status: 'pending',
      signed_at: null,
    }], new Set([DOCUMENT_ID]), true)

    const data = buildWorkspaceContractShelf({
      rosterRows,
      evidenceRows,
      documentRows,
      profiles: new Map(),
      projectTitles: new Map(),
      now: NOW,
    })

    expect(data.groups[0].records[0]).toEqual(expect.objectContaining({
      projectLabel: 'Standalone agreement',
      documentState: 'pending',
      canonicalHref: `/contracts?view=documents&document=${DOCUMENT_ID}`,
    }))
  })

  it('shows visible evidence without inventing metadata for an unreadable private document', () => {
    const evidenceRows = normalizeWorkspaceEvidenceRows([evidence()], new Set([RELATIONSHIP_ID]))
    const data = buildWorkspaceContractShelf({
      rosterRows,
      evidenceRows,
      documentRows: [],
      profiles: new Map(),
      projectTitles: new Map(),
      now: NOW,
    })

    expect(data.groups[0].records[0]).toEqual(expect.objectContaining({
      documentType: null,
      documentTypeLabel: 'Supporting agreement',
      documentState: 'unavailable',
      projectLabel: 'Member-controlled document',
      canonicalHref: null,
    }))
  })
})
