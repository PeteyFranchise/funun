import { loadShortlistEntries } from './shortlists'
import { computeStage3 } from '@/lib/vault/stage3'

// ─── loadShortlistEntries — sync-library admission gate (26-06) ──────────
// isRightsReady's contract changed from `is_public` to
// `has_admitted_sync_listing` (lib/deals/catalog.ts). This is a THIRD
// production caller of the shared isRightsReady helper (not itself an
// inline `is_public !== true` duplicate — it already delegated to the
// helper) that must be wired with the same sync_listings-derived signal
// so "still rights ready" does not silently fail closed for every saved
// shortlist entry (Rule 3 — blocking type error / Rule 1 — correctness).

jest.mock('@/lib/vault/stage3', () => ({
  computeStage3: jest.fn(),
}))

const mockedComputeStage3 = computeStage3 as jest.MockedFunction<typeof computeStage3>

function tableBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'in']) {
    builder[m] = jest.fn(() => builder)
  }
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null })
  return builder
}

function shortlistRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sl-1',
    vault_project_id: 'proj-1',
    created_by: 'saver-1',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    title: 'Test Track',
    type: 'single',
    vault_readiness_score: 100,
    content_id_registered: false,
    content_id_dismissed_until: null,
    tracks: [],
    vault_documents: [],
    ...overrides,
  }
}

function makeService(opts: { shortlists: unknown[]; projects: unknown[]; admittedProjectIds: string[] }) {
  const admitted = opts.admittedProjectIds.map(id => ({ vault_project_id: id }))
  return {
    from: jest.fn((table: string) => {
      if (table === 'buyer_shortlists') return tableBuilder(opts.shortlists)
      if (table === 'vault_projects') return tableBuilder(opts.projects)
      if (table === 'sync_listings') return tableBuilder(admitted)
      return tableBuilder([])
    }),
    auth: {
      admin: {
        getUserById: jest.fn(async () => ({ data: { user: { user_metadata: { display_name: 'Saver' } } } })),
      },
    },
  }
}

beforeEach(() => {
  mockedComputeStage3.mockReset()
  mockedComputeStage3.mockReturnValue({
    required: [],
    recommended: [],
    complete: [],
    requiredComplete: 0,
    requiredTotal: 0,
    canContinue: true,
    sampleBlock: false,
  })
})

describe('loadShortlistEntries — sync-library admission gate', () => {
  it('marks stillRightsReady true for a saved project with an admitted sync listing', async () => {
    const service = makeService({
      shortlists: [shortlistRow()],
      projects: [projectRow()],
      admittedProjectIds: ['proj-1'],
    })

    const result = await loadShortlistEntries(service as never, 'org-1')

    expect(result).toHaveLength(1)
    expect(result[0].stillRightsReady).toBe(true)
  })

  it('marks stillRightsReady false when the project has no admitted sync listing, even if otherwise ready', async () => {
    const service = makeService({
      shortlists: [shortlistRow()],
      projects: [projectRow()],
      admittedProjectIds: [],
    })

    const result = await loadShortlistEntries(service as never, 'org-1')

    expect(result).toHaveLength(1)
    expect(result[0].stillRightsReady).toBe(false)
  })
})
