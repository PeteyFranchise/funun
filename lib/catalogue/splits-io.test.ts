import { loadWorkSplits, applyWorkSplits } from './splits-io'
import type { LivingDraftParty } from './splits'

// ─── lib/catalogue/splits-io.ts — the single service-role split-sheet
// accessor for Phase 37.1. Reads use table builders; writes use the
// service-only transactional RPC added by migration 172. Neither helper
// performs authentication or access reasoning of its own.

function tableBuilder(resolved: { data: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'delete', 'insert']) {
    builder[m] = jest.fn(() => builder)
  }
  builder.maybeSingle = jest.fn(async () => ({ data: resolved.data, error: resolved.error ?? null }))
  // Some chains (the parties select) are awaited directly without a
  // terminal method call — `.then` makes the builder itself thenable.
  builder.then = (resolve: (v: unknown) => void) =>
    resolve({ data: resolved.data, error: resolved.error ?? null })
  return builder
}

type FakeSheetRow = { id: string; status: string } | null
type FakePartyRow = {
  id: string
  collaborator_id: string | null
  user_id: string | null
  name: string
  split_percentage: number
  writer_designation: string | null
}

function makeClient(opts: {
  sheet?: FakeSheetRow
  parties?: FakePartyRow[]
  sheetError?: { message: string }
  partyError?: { message: string }
  rpcError?: { message: string }
} = {}) {
  const sheetBuilder = tableBuilder({ data: opts.sheet ?? null, error: opts.sheetError })
  const partiesBuilder = tableBuilder({ data: opts.parties ?? [], error: opts.partyError })
  const from = jest.fn((table: string) => {
    if (table === 'split_sheets') return sheetBuilder
    if (table === 'split_sheet_parties') return partiesBuilder
    throw new Error(`Unexpected table: ${table}`)
  })
  const rpc = jest.fn().mockResolvedValue({ data: {}, error: opts.rpcError ?? null })
  const client = { from, rpc } as unknown as Parameters<typeof loadWorkSplits>[0]
  return { client, sheetBuilder, partiesBuilder, rpc }
}

describe('loadWorkSplits', () => {
  it('selects the living-draft sheet for the work, and its parties', async () => {
    const { client, sheetBuilder, partiesBuilder } = makeClient({
      sheet: { id: 'sheet-1', status: 'draft' },
      parties: [
        { id: 'p1', collaborator_id: 'collab-1', user_id: null, name: 'Alice', split_percentage: 50, writer_designation: 'composer' },
        { id: 'p2', collaborator_id: 'collab-2', user_id: null, name: 'Ben', split_percentage: 50, writer_designation: null },
      ],
    })

    const result = await loadWorkSplits(client, 'work-1')

    expect(result).toEqual({
      sheetId: 'sheet-1',
      status: 'draft',
      parties: [
        { collaboratorId: 'collab-1', userId: null, name: 'Alice', splitPercentage: 50, writerDesignation: 'composer' },
        { collaboratorId: 'collab-2', userId: null, name: 'Ben', splitPercentage: 50, writerDesignation: null },
      ],
    })
    expect(sheetBuilder.eq).toHaveBeenCalledWith('work_id', 'work-1')
    expect(sheetBuilder.in).toHaveBeenCalledWith('status', ['draft', 'countered'])
    expect(partiesBuilder.eq).toHaveBeenCalledWith('split_sheet_id', 'sheet-1')
  })

  it('returns null when the work has no living-draft sheet', async () => {
    const { client } = makeClient({ sheet: null })
    const result = await loadWorkSplits(client, 'work-none')
    expect(result).toBeNull()
  })

  it('does not turn a database read failure into a missing split sheet', async () => {
    const { client } = makeClient({ sheetError: { message: 'database unavailable' } })
    await expect(loadWorkSplits(client, 'work-1')).rejects.toThrow('Could not load work split sheet')
  })

  it('does not acknowledge a partial party read', async () => {
    const { client } = makeClient({
      sheet: { id: 'sheet-1', status: 'draft' },
      partyError: { message: 'database unavailable' },
    })
    await expect(loadWorkSplits(client, 'work-1')).rejects.toThrow('Could not load work split parties')
  })
})

describe('applyWorkSplits', () => {
  const parties: LivingDraftParty[] = [
    { collaboratorId: 'collab-1', name: 'Alice', splitPercentage: 50, writerDesignation: 'lyricist' },
    { collaboratorId: 'collab-2', name: 'Ben', splitPercentage: 50 },
  ]

  it('replaces the redrafted set through one transactional RPC', async () => {
    const { client, rpc } = makeClient()

    const result = await applyWorkSplits(client, 'sheet-1', parties)

    expect(result).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('replace_split_sheet_parties_transactional', {
      p_sheet_id: 'sheet-1',
      p_parties: [
        { collaborator_id: 'collab-1', user_id: null, name: 'Alice', split_percentage: 50, writer_designation: 'lyricist' },
        { collaborator_id: 'collab-2', user_id: null, name: 'Ben', split_percentage: 50, writer_designation: null },
      ],
      p_sheet_updates: {},
    })
  })

  it('refuses a party set whose percentages do not sum to 100, writing nothing', async () => {
    const { client, rpc } = makeClient()
    const badParties: LivingDraftParty[] = [
      { collaboratorId: 'collab-1', name: 'Alice', splitPercentage: 40 },
      { collaboratorId: 'collab-2', name: 'Ben', splitPercentage: 40 },
    ]

    const result = await applyWorkSplits(client, 'sheet-1', badParties)

    expect(result).toEqual({ ok: false, reason: expect.any(String) })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('atomically replaces the sheet with an empty party set', async () => {
    const { client, rpc } = makeClient()

    const result = await applyWorkSplits(client, 'sheet-1', [])

    expect(result).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('replace_split_sheet_parties_transactional', {
      p_sheet_id: 'sheet-1', p_parties: [], p_sheet_updates: {},
    })
  })

  it('reports a transactional replacement failure', async () => {
    const { client } = makeClient({ rpcError: { message: 'injected failure' } })

    await expect(applyWorkSplits(client, 'sheet-1', parties)).resolves.toEqual({
      ok: false, reason: 'injected failure',
    })
  })
})
