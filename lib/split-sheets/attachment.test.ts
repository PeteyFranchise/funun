import {
  suggestTrackMatches,
  detectTrackConflicts,
  describeSignedTitle,
} from '@/lib/split-sheets/attachment'
import { POST as attachPOST } from '@/app/api/split-sheets/[id]/attach/route'
import { POST as detachPOST } from '@/app/api/split-sheets/[id]/detach/route'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

// ─── suggestTrackMatches ────────────────────────────────────────────────

describe('suggestTrackMatches', () => {
  it('ranks an exact title match first and marks it as the suggestion', () => {
    const matches = suggestTrackMatches('Neon Hours', [
      { id: 't1', title: 'Neon Hours' },
      { id: 't2', title: 'Midnight Drive' },
    ])
    expect(matches[0].id).toBe('t1')
    expect(matches[0].suggested).toBe(true)
    expect(matches[1].suggested).toBe(false)
  })

  it('discounts a parenthesized remix/feature decoration rather than treating it as a mismatch', () => {
    const matches = suggestTrackMatches('Neon Hours', [
      { id: 't1', title: 'Neon Hours (feat. Aria)' },
      { id: 't2', title: 'Completely Different Song' },
    ])
    expect(matches[0].id).toBe('t1')
    expect(matches[0].suggested).toBe(true)
  })

  it('a rename produces a weak or zero match — NEVER a confident wrong suggestion', () => {
    const matches = suggestTrackMatches('Old Working Title', [
      { id: 't1', title: 'Totally Renamed Song' },
      { id: 't2', title: 'Also Unrelated' },
    ])
    // No candidate may be marked suggested when nothing actually matches —
    // a wrong confident suggestion on a legal document is worse than none.
    expect(matches.every(m => !m.suggested)).toBe(true)
  })

  it('never marks more than one leading candidate', () => {
    const matches = suggestTrackMatches('Neon Hours', [
      { id: 't1', title: 'Neon Hours' },
      { id: 't2', title: 'Neon Hour' },
      { id: 't3', title: 'Neon Hours Reprise' },
    ])
    expect(matches.filter(m => m.suggested)).toHaveLength(1)
  })

  it('orders by descending similarity score', () => {
    const matches = suggestTrackMatches('Neon Hours', [
      { id: 't1', title: 'Completely Unrelated' },
      { id: 't2', title: 'Neon Hours' },
    ])
    expect(matches[0].id).toBe('t2')
    expect(matches[0].score).toBeGreaterThanOrEqual(matches[1].score)
  })
})

// ─── detectTrackConflicts ────────────────────────────────────────────────

describe('detectTrackConflicts', () => {
  it('flags a track claimed by more than one sheet', () => {
    const conflicts = detectTrackConflicts([
      { sheetId: 'sheet-a', trackId: 'track-1' },
      { sheetId: 'sheet-b', trackId: 'track-1' },
      { sheetId: 'sheet-c', trackId: 'track-2' },
    ])
    expect(conflicts).toEqual([{ trackId: 'track-1', sheetIds: expect.arrayContaining(['sheet-a', 'sheet-b']) }])
  })

  it('reports nothing when every track has at most one claiming sheet', () => {
    const conflicts = detectTrackConflicts([
      { sheetId: 'sheet-a', trackId: 'track-1' },
      { sheetId: 'sheet-b', trackId: 'track-2' },
    ])
    expect(conflicts).toHaveLength(0)
  })

  it('ignores project-level attachments (null track id) — never flags those as conflicts', () => {
    const conflicts = detectTrackConflicts([
      { sheetId: 'sheet-a', trackId: null },
      { sheetId: 'sheet-b', trackId: null },
    ])
    expect(conflicts).toHaveLength(0)
  })

  it('never resolves anything — it only reports the claiming sheet ids', () => {
    const conflicts = detectTrackConflicts([
      { sheetId: 'sheet-a', trackId: 'track-1' },
      { sheetId: 'sheet-b', trackId: 'track-1' },
    ])
    expect(conflicts[0].sheetIds).toHaveLength(2)
  })
})

// ─── describeSignedTitle ─────────────────────────────────────────────────

describe('describeSignedTitle', () => {
  it('returns a structured record, not a rendered sentence', () => {
    const record = describeSignedTitle('Old Title', 'New Title')
    expect(record).toEqual({ signedAs: 'Old Title', currentTitle: 'New Title', diverges: true })
  })

  it('diverges is false when the titles are the same modulo normalization', () => {
    const record = describeSignedTitle('Neon Hours', 'neon hours')
    expect(record.diverges).toBe(false)
  })

  it('never implies the document should be regenerated (no such field exists)', () => {
    const record = describeSignedTitle('Old Title', 'New Title')
    expect(Object.keys(record).sort()).toEqual(['currentTitle', 'diverges', 'signedAs'])
  })
})

// ─── Mocked-client route tests: attach v2 + detach ──────────────────────

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

type CallLog = { method: string; table: string; args: unknown[] }[]

function makeBuilder(tableName: string, result: { data: unknown; error?: unknown }, log: CallLog) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'is', 'insert', 'update', 'delete']) {
    builder[method] = (...args: unknown[]) => {
      log.push({ method, table: tableName, args })
      return builder
    }
  }
  builder.maybeSingle = async () => result
  builder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected)
  return builder
}

function buildClient(
  userId: string | null | undefined,
  tableResults: Record<string, { data: unknown; error?: unknown }>,
  log: CallLog
) {
  const buildersByTable: Record<string, ReturnType<typeof makeBuilder>> = {}
  const from = jest.fn((table: string) => {
    if (!buildersByTable[table]) {
      buildersByTable[table] = makeBuilder(table, tableResults[table] ?? { data: null, error: null }, log)
    }
    return buildersByTable[table]
  })
  const client: Record<string, unknown> = { from }
  if (userId !== undefined) {
    client.auth = { getUser: jest.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) }
  }
  return client
}

function insertPayload(log: CallLog, table: string) {
  return log.find(c => c.table === table && c.method === 'insert')?.args[0] as Record<string, unknown> | undefined
}

function updatePayloads(log: CallLog, table: string) {
  return log.filter(c => c.table === table && c.method === 'update').map(c => c.args[0])
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /api/split-sheets/[id]/attach — authorization matrix (T-17-12/T-18-13)', () => {
  it('401s without a session', async () => {
    const log: CallLog = []
    ;(createApiClient as jest.Mock).mockResolvedValue(buildClient(null, {}, log))
    const res = await attachPOST(
      jsonRequest('http://test.local/api/split-sheets/sheet-1/attach', { vault_project_id: 'project-1' }),
      { params: Promise.resolve({ id: 'sheet-1' }) }
    )
    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('403s when the caller is not a party on the sheet', async () => {
    const log: CallLog = []
    ;(createApiClient as jest.Mock).mockResolvedValue(
      buildClient(
        'stranger',
        {
          split_sheets: {
            data: {
              id: 'sheet-1',
              initiator_user_id: 'initiator-1',
              status: 'executed',
              vault_project_id: null,
              track_id: null,
              split_sheet_parties: [{ user_id: 'user-a' }],
            },
          },
          vault_projects: { data: { id: 'project-1' } },
        },
        log
      )
    )
    const res = await attachPOST(
      jsonRequest('http://test.local/api/split-sheets/sheet-1/attach', { vault_project_id: 'project-1' }),
      { params: Promise.resolve({ id: 'sheet-1' }) }
    )
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('403s when the caller is a party but does not own the destination project', async () => {
    const log: CallLog = []
    ;(createApiClient as jest.Mock).mockResolvedValue(
      buildClient(
        'user-a',
        {
          split_sheets: {
            data: {
              id: 'sheet-1',
              initiator_user_id: 'initiator-1',
              status: 'executed',
              vault_project_id: null,
              track_id: null,
              split_sheet_parties: [{ user_id: 'user-a' }],
            },
          },
          vault_projects: { data: null },
        },
        log
      )
    )
    const res = await attachPOST(
      jsonRequest('http://test.local/api/split-sheets/sheet-1/attach', { vault_project_id: 'project-1' }),
      { params: Promise.resolve({ id: 'sheet-1' }) }
    )
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('P18-04: a NON-executed sheet may now attach (the executed-only gate is removed)', async () => {
    const log: CallLog = []
    ;(createApiClient as jest.Mock).mockResolvedValue(
      buildClient(
        'initiator-1',
        {
          split_sheets: {
            data: {
              id: 'sheet-1',
              initiator_user_id: 'initiator-1',
              status: 'draft',
              vault_project_id: null,
              track_id: null,
              split_sheet_parties: [],
            },
          },
          vault_projects: { data: { id: 'project-1' } },
          split_sheet_attachments: { data: null },
          vault_documents: { data: [] },
        },
        log
      )
    )
    ;(createServiceClient as jest.Mock).mockReturnValue(buildClient(undefined, {}, log))

    const res = await attachPOST(
      jsonRequest('http://test.local/api/split-sheets/sheet-1/attach', { vault_project_id: 'project-1' }),
      { params: Promise.resolve({ id: 'sheet-1' }) }
    )
    expect(res.status).toBe(200)
  })

  it('T-18-14: 403s when the supplied track does not belong to the destination project', async () => {
    const log: CallLog = []
    ;(createApiClient as jest.Mock).mockResolvedValue(
      buildClient(
        'initiator-1',
        {
          split_sheets: {
            data: {
              id: 'sheet-1',
              initiator_user_id: 'initiator-1',
              status: 'executed',
              vault_project_id: null,
              track_id: null,
              split_sheet_parties: [],
            },
          },
          vault_projects: { data: { id: 'project-1' } },
          tracks: { data: null }, // track not found under this project
        },
        log
      )
    )
    const res = await attachPOST(
      jsonRequest('http://test.local/api/split-sheets/sheet-1/attach', {
        vault_project_id: 'project-1',
        track_id: 'track-from-elsewhere',
      }),
      { params: Promise.resolve({ id: 'sheet-1' }) }
    )
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('writes the attachment row, the origin fields, and the caller’s own document row when everything checks out', async () => {
    const log: CallLog = []
    ;(createApiClient as jest.Mock).mockResolvedValue(
      buildClient(
        'initiator-1',
        {
          split_sheets: {
            data: {
              id: 'sheet-1',
              initiator_user_id: 'initiator-1',
              status: 'executed',
              vault_project_id: null,
              track_id: null,
              split_sheet_parties: [],
            },
          },
          vault_projects: { data: { id: 'project-1' } },
          tracks: { data: { id: 'track-1' } },
          split_sheet_attachments: { data: null }, // no existing attachment
          vault_documents: {
            data: [{ id: 'doc-1', document_data: { split_sheet_id: 'sheet-1' }, project_id: null }],
          },
        },
        log
      )
    )
    ;(createServiceClient as jest.Mock).mockReturnValue(buildClient(undefined, {}, log))

    const res = await attachPOST(
      jsonRequest('http://test.local/api/split-sheets/sheet-1/attach', {
        vault_project_id: 'project-1',
        track_id: 'track-1',
      }),
      { params: Promise.resolve({ id: 'sheet-1' }) }
    )

    expect(res.status).toBe(200)
    const insert = insertPayload(log, 'split_sheet_attachments')
    expect(insert).toMatchObject({ split_sheet_id: 'sheet-1', vault_project_id: 'project-1', track_id: 'track-1' })
    const sheetUpdates = updatePayloads(log, 'split_sheets')
    expect(sheetUpdates).toContainEqual({ vault_project_id: 'project-1', track_id: 'track-1' })
    const docUpdates = updatePayloads(log, 'vault_documents')
    expect(docUpdates).toContainEqual({ project_id: 'project-1', track_id: 'track-1' })
  })

  it('idempotent re-attach: an identical triple is a no-op success, never a duplicate insert', async () => {
    const log: CallLog = []
    ;(createApiClient as jest.Mock).mockResolvedValue(
      buildClient(
        'initiator-1',
        {
          split_sheets: {
            data: {
              id: 'sheet-1',
              initiator_user_id: 'initiator-1',
              status: 'executed',
              vault_project_id: 'project-1',
              track_id: 'track-1',
              split_sheet_parties: [],
            },
          },
          vault_projects: { data: { id: 'project-1' } },
          tracks: { data: { id: 'track-1' } },
          split_sheet_attachments: { data: { id: 'existing-attachment' } }, // already exists
          vault_documents: {
            data: [{ id: 'doc-1', document_data: { split_sheet_id: 'sheet-1' }, project_id: 'project-1' }],
          },
        },
        log
      )
    )
    ;(createServiceClient as jest.Mock).mockReturnValue(buildClient(undefined, {}, log))

    const res = await attachPOST(
      jsonRequest('http://test.local/api/split-sheets/sheet-1/attach', {
        vault_project_id: 'project-1',
        track_id: 'track-1',
      }),
      { params: Promise.resolve({ id: 'sheet-1' }) }
    )

    expect(res.status).toBe(200)
    expect(insertPayload(log, 'split_sheet_attachments')).toBeUndefined()
  })

  it('two-project attach: a sheet already attached elsewhere gets a SECOND attachment row, not a moved primary document', async () => {
    const log: CallLog = []
    ;(createApiClient as jest.Mock).mockResolvedValue(
      buildClient(
        'initiator-1',
        {
          split_sheets: {
            data: {
              id: 'sheet-1',
              initiator_user_id: 'initiator-1',
              status: 'executed',
              vault_project_id: 'project-1', // origin already set (the single)
              track_id: null,
              split_sheet_parties: [],
            },
          },
          vault_projects: { data: { id: 'project-2' } }, // attaching to a SECOND project (the album)
          split_sheet_attachments: { data: null },
          vault_documents: {
            // the caller's own doc row already points at the FIRST (primary) project
            data: [{ id: 'doc-1', document_data: { split_sheet_id: 'sheet-1' }, project_id: 'project-1' }],
          },
        },
        log
      )
    )
    ;(createServiceClient as jest.Mock).mockReturnValue(buildClient(undefined, {}, log))

    const res = await attachPOST(
      jsonRequest('http://test.local/api/split-sheets/sheet-1/attach', { vault_project_id: 'project-2' }),
      { params: Promise.resolve({ id: 'sheet-1' }) }
    )

    expect(res.status).toBe(200)
    expect(insertPayload(log, 'split_sheet_attachments')).toMatchObject({
      split_sheet_id: 'sheet-1',
      vault_project_id: 'project-2',
    })
    // The primary document row is untouched — it still points at project-1,
    // never duplicated and never moved to project-2 (design section 2c).
    expect(updatePayloads(log, 'vault_documents')).toHaveLength(0)
  })
})

describe('POST /api/split-sheets/[id]/detach — non-destruction property (T-18-15)', () => {
  it('same double authorization check as attach: 403 when not a party', async () => {
    const log: CallLog = []
    ;(createApiClient as jest.Mock).mockResolvedValue(
      buildClient(
        'stranger',
        {
          split_sheets: {
            data: { id: 'sheet-1', initiator_user_id: 'initiator-1', split_sheet_parties: [] },
          },
        },
        log
      )
    )
    const res = await detachPOST(
      jsonRequest('http://test.local/api/split-sheets/sheet-1/detach', { vault_project_id: 'project-1' }),
      { params: Promise.resolve({ id: 'sheet-1' }) }
    )
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('removes ONLY the attachment row and nulls the caller’s own doc row — nothing else is ever deleted', async () => {
    const log: CallLog = []
    ;(createApiClient as jest.Mock).mockResolvedValue(
      buildClient(
        'initiator-1',
        {
          split_sheets: {
            data: { id: 'sheet-1', initiator_user_id: 'initiator-1', split_sheet_parties: [] },
          },
          vault_projects: { data: { id: 'project-1' } },
          vault_documents: {
            data: [
              {
                id: 'doc-1',
                document_data: { split_sheet_id: 'sheet-1' },
                project_id: 'project-1',
                track_id: 'track-1',
              },
            ],
          },
        },
        log
      )
    )
    ;(createServiceClient as jest.Mock).mockReturnValue(buildClient(undefined, {}, log))

    const res = await detachPOST(
      jsonRequest('http://test.local/api/split-sheets/sheet-1/detach', {
        vault_project_id: 'project-1',
        track_id: 'track-1',
      }),
      { params: Promise.resolve({ id: 'sheet-1' }) }
    )

    expect(res.status).toBe(200)

    // The attachment relationship is removed...
    const attachmentDelete = log.find(c => c.table === 'split_sheet_attachments' && c.method === 'delete')
    expect(attachmentDelete).toBeDefined()

    // ...the caller's own document row is nulled back to unattached...
    expect(updatePayloads(log, 'vault_documents')).toContainEqual({ project_id: null, track_id: null })

    // ...and NOTHING is ever deleted from split_sheets, split_sheet_parties,
    // or vault_documents — the whole point of detach.
    const destructiveDeletes = log.filter(
      c => c.method === 'delete' && c.table !== 'split_sheet_attachments'
    )
    expect(destructiveDeletes).toHaveLength(0)
  })

  it('a non-primary detach leaves the caller’s own document row untouched', async () => {
    const log: CallLog = []
    ;(createApiClient as jest.Mock).mockResolvedValue(
      buildClient(
        'initiator-1',
        {
          split_sheets: {
            data: { id: 'sheet-1', initiator_user_id: 'initiator-1', split_sheet_parties: [] },
          },
          vault_projects: { data: { id: 'project-2' } },
          vault_documents: {
            // the doc row's primary is project-1, not the project-2 being detached
            data: [
              { id: 'doc-1', document_data: { split_sheet_id: 'sheet-1' }, project_id: 'project-1', track_id: null },
            ],
          },
        },
        log
      )
    )
    ;(createServiceClient as jest.Mock).mockReturnValue(buildClient(undefined, {}, log))

    const res = await detachPOST(
      jsonRequest('http://test.local/api/split-sheets/sheet-1/detach', { vault_project_id: 'project-2' }),
      { params: Promise.resolve({ id: 'sheet-1' }) }
    )

    expect(res.status).toBe(200)
    expect(updatePayloads(log, 'vault_documents')).toHaveLength(0)
  })
})
