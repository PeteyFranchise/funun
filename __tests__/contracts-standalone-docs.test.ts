import { fetchContractRows, mergeContractRows } from '@/app/(artist)/contracts/page'
import type { ContractRow } from '@/components/contracts/ContractLocker'

// ─── Contract Locker standalone (projectless) document query ──────────────
// RESEARCH Pitfall 2 / gap fix 2 (P17-05): the original query only reaches
// vault_documents by nesting FROM vault_projects, so a project_id IS NULL
// row is unreachable no matter how correctly it was inserted. This proves
// the second, direct query surfaces it and that the merge never duplicates
// a document appearing in both sources.

function chain(data: unknown) {
  const q: Record<string, jest.Mock> = {}
  q.select = jest.fn(() => q)
  q.eq = jest.fn(() => q)
  q.is = jest.fn(() => Promise.resolve({ data, error: null }))
  // .eq(...) alone must also resolve when .is(...) isn't chained after it
  // (the project-nested query ends at .eq()).
  q.eq.mockImplementation(() => Object.assign(Promise.resolve({ data, error: null }), q))
  return q
}

describe('fetchContractRows — standalone document query + merge', () => {
  it('includes a projectless vault_documents row via the direct query', async () => {
    const projectChain = chain([]) // no projects/nested docs
    const standaloneDoc = {
      id: 'doc-standalone-1',
      type: 'split_sheet',
      status: 'signed',
      signed_at: '2026-07-20T00:00:00.000Z',
      source: 'generated',
      verification_status: undefined,
      verification_checks: undefined,
      verification_summary: null,
      document_data: { split_sheet_id: 'sheet-1', esign: { completedAt: '2026-07-20T00:00:00.000Z' } },
    }
    const standaloneChain = chain([standaloneDoc])

    const from = jest.fn((table: string) => {
      if (table === 'vault_projects') return projectChain
      if (table === 'vault_documents') return standaloneChain
      throw new Error(`Unexpected table: ${table}`)
    })

    const supabase = { from } as unknown as Parameters<typeof fetchContractRows>[0]
    const { rows } = await fetchContractRows(supabase, 'user-1')

    expect(from).toHaveBeenCalledWith('vault_documents')
    expect(standaloneChain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(standaloneChain.is).toHaveBeenCalledWith('project_id', null)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'doc-standalone-1',
      unattached: true,
      splitSheetId: 'sheet-1',
    })
  })

  it('never duplicates a document that appears in both sources', () => {
    const shared: ContractRow = {
      id: 'doc-shared',
      type: 'split_sheet',
      label: 'Split Sheet',
      projectTitle: 'Song A',
      status: 'signed',
      source: 'generated',
      detail: 'Song A',
      needsFixing: false,
      splitTotal: 100,
      writers: 2,
      signedAt: null,
      unattached: false,
      splitSheetId: null,
    }
    const standaloneCopy: ContractRow = { ...shared, unattached: true, projectTitle: '', splitSheetId: 'sheet-2' }

    const merged = mergeContractRows([shared], [standaloneCopy])

    expect(merged).toHaveLength(1)
    expect(merged[0]).toEqual(shared)
  })

  it('merges project-nested rows and standalone rows without duplication when ids differ', () => {
    const nested: ContractRow = {
      id: 'doc-nested',
      type: 'split_sheet',
      label: 'Split Sheet',
      projectTitle: 'Song B',
      status: 'pending',
      source: 'generated',
      detail: 'Song B',
      needsFixing: false,
      splitTotal: null,
      writers: null,
      signedAt: null,
      unattached: false,
      splitSheetId: null,
    }
    const standalone: ContractRow = {
      id: 'doc-standalone-2',
      type: 'split_sheet',
      label: 'Split Sheet',
      projectTitle: '',
      status: 'signed',
      source: 'generated',
      detail: 'Unattached',
      needsFixing: false,
      splitTotal: null,
      writers: null,
      signedAt: null,
      unattached: true,
      splitSheetId: 'sheet-3',
    }

    const merged = mergeContractRows([nested], [standalone])
    expect(merged.map(r => r.id).sort()).toEqual(['doc-nested', 'doc-standalone-2'])
  })
})
