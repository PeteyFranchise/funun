import { authorizeRequestTarget } from './request-target'
import { computeStage3 } from '@/lib/vault/stage3'
import { isProfileVisibleTo } from '@/lib/trust-safety/contracts'
import { isBlockedRelativeTo } from '@/lib/trust-safety/block-check'

// ─── authorizeRequestTarget — sync-library admission gate (26-06) ────────
// Replaces the beta `is_public !== true` inline check with a sync_listings
// admitted-row lookup routed through the SAME isAdmittedToSyncLibrary
// helper lib/deals/catalog.ts's isRightsReady uses (T-26-24 — no drift
// between the two gates). Everything downstream of the admission gate
// (Stage 3, visibility, block-check) is mocked here so this test isolates
// the gate itself.

jest.mock('@/lib/vault/stage3', () => ({
  computeStage3: jest.fn(),
}))
jest.mock('@/lib/trust-safety/contracts', () => ({
  isProfileVisibleTo: jest.fn(),
}))
jest.mock('@/lib/trust-safety/block-check', () => ({
  isBlockedRelativeTo: jest.fn(),
}))

const mockedComputeStage3 = computeStage3 as jest.MockedFunction<typeof computeStage3>
const mockedIsProfileVisibleTo = isProfileVisibleTo as jest.MockedFunction<typeof isProfileVisibleTo>
const mockedIsBlockedRelativeTo = isBlockedRelativeTo as jest.MockedFunction<typeof isBlockedRelativeTo>

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    title: 'Test Track',
    user_id: 'owner-1',
    type: 'single',
    is_public: true,
    vault_readiness_score: 100,
    content_id_registered: false,
    content_id_dismissed_until: null,
    tracks: [{ id: 'track-1', title: 'Track One' }],
    vault_documents: [],
    ...overrides,
  }
}

// Chainable query-builder spy — mirrors catalog-query.test.ts's tableBuilder,
// terminating on maybeSingle() rather than an awaitable `.then`.
function tableBuilder(row: unknown | null) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'limit']) {
    builder[m] = jest.fn(() => builder)
  }
  builder.maybeSingle = jest.fn(async () => ({ data: row, error: null }))
  return builder
}

function makeService(opts: {
  project?: unknown | null
  admittedListing?: unknown | null
  owner?: unknown | null
}) {
  const project = 'project' in opts ? opts.project : projectRow()
  const admittedListing = 'admittedListing' in opts ? opts.admittedListing : { id: 'listing-1' }
  const owner = 'owner' in opts ? opts.owner : { id: 'owner-1', profile_visibility: 'public' }

  return {
    from: jest.fn((table: string) => {
      if (table === 'vault_projects') return tableBuilder(project)
      if (table === 'sync_listings') return tableBuilder(admittedListing)
      if (table === 'user_profiles') return tableBuilder(owner)
      return tableBuilder(null)
    }),
  }
}

beforeEach(() => {
  mockedComputeStage3.mockReset()
  mockedIsProfileVisibleTo.mockReset()
  mockedIsBlockedRelativeTo.mockReset()
  mockedComputeStage3.mockReturnValue({
    required: [],
    recommended: [],
    complete: [],
    requiredComplete: 0,
    requiredTotal: 0,
    canContinue: true,
    sampleBlock: false,
  })
  mockedIsProfileVisibleTo.mockReturnValue(true)
  mockedIsBlockedRelativeTo.mockResolvedValue(false)
})

describe('authorizeRequestTarget — sync-library admission gate', () => {
  it('returns ok:false when the project has no admitted sync listing, even if otherwise ready', async () => {
    const service = makeService({ admittedListing: null })

    const result = await authorizeRequestTarget(service as never, 'buyer-1', 'proj-1')

    expect(result).toEqual({ ok: false })
  })

  it('returns ok:true through the gate when the project has an admitted sync listing', async () => {
    const service = makeService({})

    const result = await authorizeRequestTarget(service as never, 'buyer-1', 'proj-1')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.project.id).toBe('proj-1')
    }
  })

  it('returns ok:false when the project cannot be found, regardless of admission', async () => {
    const service = makeService({ project: null })

    const result = await authorizeRequestTarget(service as never, 'buyer-1', 'proj-1')

    expect(result).toEqual({ ok: false })
  })

  it('still applies the visibility gate on top of admission (unchanged behavior)', async () => {
    const service = makeService({})
    mockedIsProfileVisibleTo.mockReturnValue(false)

    const result = await authorizeRequestTarget(service as never, 'buyer-1', 'proj-1')

    expect(result).toEqual({ ok: false })
  })

  it('still applies the block gate on top of admission (unchanged behavior)', async () => {
    const service = makeService({})
    mockedIsBlockedRelativeTo.mockResolvedValue(true)

    const result = await authorizeRequestTarget(service as never, 'buyer-1', 'proj-1')

    expect(result).toEqual({ ok: false })
  })

  it('still applies the Stage 3 gate on top of admission (unchanged behavior)', async () => {
    const service = makeService({})
    mockedComputeStage3.mockReturnValue({
      required: [],
      recommended: [],
      complete: [],
      requiredComplete: 0,
      requiredTotal: 1,
      canContinue: false,
      sampleBlock: false,
    })

    const result = await authorizeRequestTarget(service as never, 'buyer-1', 'proj-1')

    expect(result).toEqual({ ok: false })
  })
})
