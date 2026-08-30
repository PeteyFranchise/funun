import { loadWorkSplits, applyWorkSplits } from './splits-io'
import type { LivingDraftParty } from './splits'

// ─── lib/catalogue/splits-io.ts — the single service-role split-sheet
// accessor for Phase 37.1. Exercised entirely through an injected fake
// client with no `.rpc` and no `.auth` property at all (see makeClient
// below) — if either function under test ever reached for one, the fake
// would throw "not a function" and every test in this file would fail,
// which is what proves structurally that neither function reasons about
// access. No Supabase import anywhere in this file.

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
}

function makeClient(opts: { sheet?: FakeSheetRow; parties?: FakePartyRow[] } = {}) {
  const sheetBuilder = tableBuilder({ data: opts.sheet ?? null })
  const partiesBuilder = tableBuilder({ data: opts.parties ?? [] })
  const from = jest.fn((table: string) => {
    if (table === 'split_sheets') return sheetBuilder
    if (table === 'split_sheet_parties') return partiesBuilder
    throw new Error(`Unexpected table: ${table}`)
  })
  // Deliberately NO .rpc and NO .auth — see file header.
  const client = { from } as unknown as Parameters<typeof loadWorkSplits>[0]
  return { client, sheetBuilder, partiesBuilder }
}

describe('loadWorkSplits', () => {
  it('selects the living-draft sheet for the work, and its parties', async () => {
    const { client, sheetBuilder, partiesBuilder } = makeClient({
      sheet: { id: 'sheet-1', status: 'draft' },
      parties: [
        { id: 'p1', collaborator_id: 'collab-1', user_id: null, name: 'Alice', split_percentage: 50 },
        { id: 'p2', collaborator_id: 'collab-2', user_id: null, name: 'Ben', split_percentage: 50 },
      ],
    })

    const result = await loadWorkSplits(client, 'work-1')

    expect(result).toEqual({
      sheetId: 'sheet-1',
      status: 'draft',
      parties: [
        { collaboratorId: 'collab-1', userId: null, name: 'Alice', splitPercentage: 50 },
        { collaboratorId: 'collab-2', userId: null, name: 'Ben', splitPercentage: 50 },
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
})

describe('applyWorkSplits', () => {
  const parties: LivingDraftParty[] = [
    { collaboratorId: 'collab-1', name: 'Alice', splitPercentage: 50 },
    { collaboratorId: 'collab-2', name: 'Ben', splitPercentage: 50 },
  ]

  it('deletes the existing parties and reinserts the redrafted set', async () => {
    const { client, partiesBuilder } = makeClient()

    const result = await applyWorkSplits(client, 'sheet-1', parties)

    expect(result).toEqual({ ok: true })
    expect(partiesBuilder.delete).toHaveBeenCalled()
    expect(partiesBuilder.insert).toHaveBeenCalledWith([
      { split_sheet_id: 'sheet-1', collaborator_id: 'collab-1', user_id: null, name: 'Alice', split_percentage: 50 },
      { split_sheet_id: 'sheet-1', collaborator_id: 'collab-2', user_id: null, name: 'Ben', split_percentage: 50 },
    ])
  })

  it('refuses a party set whose percentages do not sum to 100, writing nothing', async () => {
    const { client, partiesBuilder } = makeClient()
    const badParties: LivingDraftParty[] = [
      { collaboratorId: 'collab-1', name: 'Alice', splitPercentage: 40 },
      { collaboratorId: 'collab-2', name: 'Ben', splitPercentage: 40 },
    ]

    const result = await applyWorkSplits(client, 'sheet-1', badParties)

    expect(result).toEqual({ ok: false, reason: expect.any(String) })
    expect(partiesBuilder.delete).not.toHaveBeenCalled()
    expect(partiesBuilder.insert).not.toHaveBeenCalled()
  })

  it('deletes and writes nothing further when the redraft empties the sheet', async () => {
    const { client, partiesBuilder } = makeClient()

    const result = await applyWorkSplits(client, 'sheet-1', [])

    expect(result).toEqual({ ok: true })
    expect(partiesBuilder.delete).toHaveBeenCalled()
    expect(partiesBuilder.insert).not.toHaveBeenCalled()
  })
})
