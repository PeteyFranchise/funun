import { POST } from '@/app/api/sync-library/admin/[listingId]/route'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { createNotification } from '@/lib/notifications'
import { logStaffAction } from '@/lib/staff/audit'

// ─── Why this test exists ────────────────────────────────────────────────
// Plan 50-03, two defects in one route.
//
// 1. THE EXPOSURE DISAGREEMENT (50-RESEARCH.md §7). The admit gate asked for
//    the six sync items BY NAME via syncReadinessForTrack's onlyKeys. The
//    buyer surfaces did not — all five isRightsReady call sites built their
//    lists from the release applies_to registry, which emits only
//    audio_files and split_sheets for 'unreleased'. So staff could admit a
//    song, the artist was notified, and no buyer could ever see it.
//
//    SUPERSEDED 2026-10-11 by owner decision D-11, and this file now pins the
//    replacement. The divergence was dissolved rather than repaired: readiness
//    stopped controlling discovery entirely, so the refusal that defended
//    against it defends against nothing. Admission now requires a playable
//    master, staff quality judgment, sufficient identity/metadata and a valid
//    project type — NOT clearance documents. The compare-and-set work in (2)
//    below is untouched by D-11 and every one of its cases is unchanged.
//
// 2. NON-ATOMIC DECISION WRITES (Pass 4 M-04). Both writes updated by id
//    alone, so a decision landing on an already-decided row reported success
//    and could still notify an artist about an admission it did not make.
//
// FLAT __tests__/ path on purpose: a bracketed path like
// `app/api/.../[listingId]/...` parses as a regex character class and matches
// ZERO tests — one of this repo's two known harness traps (50-RESEARCH.md
// Pitfall 8). Importing the bracketed route module is fine; only the TEST
// file's own path matters.
//
// Mocking style follows __tests__/antenna-apply-atomic.test.ts. The staff
// gate is mocked so these exercise gate LOGIC, not authorization — which is
// covered elsewhere.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))
jest.mock('@/lib/admin/gate', () => ({ requireStaff: jest.fn() }))
jest.mock('@/lib/notifications', () => ({ createNotification: jest.fn() }))
jest.mock('@/lib/staff/audit', () => ({ logStaffAction: jest.fn() }))
jest.mock('@/lib/social/notifications', () => ({
  buildSyncLibraryAdmittedNotification: jest.fn(() => ({})),
  buildSyncLibraryRejectedNotification: jest.fn(() => ({})),
}))

const COMPLETE_DOCS = [
  { id: 'd1', type: 'copyright_registration', status: 'signed', track_id: 't1', document_data: {} },
  { id: 'd2', type: 'hire_right', status: 'signed', track_id: 't1', document_data: {} },
  { id: 'd3', type: 'split_sheet', status: 'signed', track_id: 't1', document_data: {} },
]

/** Composer metadata complete enough that the metadata family reads 'complete'. */
const COMPLETE_METADATA = {
  composers: [
    { name: 'A Writer', role: 'composer_author', split: 100, pro: 'ascap', ipi: '00000000000' },
  ],
}

type Opts = {
  projectType: string
  listingStatus?: string
  /** Rows the decision UPDATE reports back. [] simulates a lost race. */
  updatedRows?: { id: string }[]
  /** 2026-10-11 (D-11): null exercises the no-playable-master refusal. */
  audioFileUrl?: string | null
  /** 2026-10-11 (D-11): [] exercises "outstanding clearance work". */
  documents?: unknown[]
}

function mockService(opts: Opts) {
  const update = jest.fn()
  const project = {
    id: 'p1',
    type: opts.projectType,
    tracks: [
      {
        id: 't1',
        title: 'A Song',
        isrc: null,
        iswc: null,
        // 2026-10-11 (D-11): the admit bar requires a BOUND audio object, so
        // every fixture needs one. Note what its absence did while this file
        // was being updated — the three compare-and-set cases below failed for
        // a reason that had nothing to do with the CAS.
        audio_file_url: 'audioFileUrl' in opts ? opts.audioFileUrl : 'track-audio/artist-1/t1.wav',
        metadata: COMPLETE_METADATA,
        producers: [],
        mixing_engineer: null,
        mastering_engineer: null,
      },
    ],
    vault_documents: opts.documents ?? COMPLETE_DOCS,
    vault_assets: [{ id: 'a1', type: 'cover_art' }],
  }

  const from = jest.fn((table: string) => {
    if (table === 'sync_listings') {
      return {
        select: jest.fn((cols: string) => {
          // The admitted-count recount after a successful write.
          if (cols === 'id') {
            return { eq: jest.fn(() => ({ eq: jest.fn(async () => ({ data: [] })) })) }
          }
          // The initial listing load.
          return {
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({
                data: {
                  id: 'L1',
                  status: opts.listingStatus ?? 'pending_admit',
                  artist_user_id: 'artist-1',
                  track_id: 't1',
                  vault_project_id: 'p1',
                  quality_ok: true,
                },
                error: null,
              })),
            })),
          }
        }),
        update: update.mockReturnValue({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              select: jest.fn(async () => ({
                data: opts.updatedRows ?? [{ id: 'L1' }],
                error: null,
              })),
            })),
          })),
        }),
      }
    }
    if (table === 'tracks') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: { title: 'A Song' } })) })),
        })),
      }
    }
    if (table === 'vault_projects') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: project, error: null })) })),
        })),
      }
    }
    throw new Error(`unmocked table: ${table}`)
  })

  ;(createServiceClient as jest.Mock).mockReturnValue({ from })
  return { from, update }
}

function decide(decision: 'admit' | 'reject', reason?: string) {
  return POST(
    new Request('http://test.local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, reason }),
    }),
    { params: Promise.resolve({ listingId: 'L1' }) }
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: 'staff-1' }, role: 'leadership' })
  ;(createNotification as jest.Mock).mockResolvedValue(undefined)
  ;(logStaffAction as jest.Mock).mockResolvedValue(undefined)
})

describe('the admit gate agrees with the buyer gate', () => {
  // ─── REVERSED 2026-10-11 by owner decision D-11 ───────────────────────
  // This case and the one after it used to assert a 409 for an 'unreleased'
  // listing, on the grounds that the buyer-side readiness registry could not
  // answer the six-key question so no buyer would ever see the song. D-11
  // removes the premise: readiness no longer controls discovery, so an
  // unanswerable readiness question is no longer a reason to withhold
  // admission. Replaced with the must-ADMIT case the plan calls for, rather
  // than deleted, because "an unreleased track with outstanding clearance work
  // IS admitted" is the single behaviour D-11 most needs pinned.
  it("ADMITS an 'unreleased' track with NOTHING signed — clearance does not gate admission (D-11)", async () => {
    const { update } = mockService({ projectType: 'unreleased', documents: [] })
    const res = await decide('admit')

    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalled()
    expect(await res.json()).toEqual({ data: { listingId: 'L1', status: 'admitted' } })
  })

  it("REFUSES a track with no playable master, and writes nothing", async () => {
    // The precondition that REPLACED the readiness refusal. D-11 requires a
    // real bound audio object, "not merely the existence of a tracks row" —
    // admitting without one publishes a listing no buyer can play.
    const { update } = mockService({ projectType: 'unreleased', audioFileUrl: null })
    const res = await decide('admit')
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(update).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
    expect(body.data.exposure).toBe('no_playable_master')
  })

  it('names the missing master and NEVER blames the project type or the paperwork', async () => {
    // Review H-03, caught twice in prose, then made an assertion. Retargeted at
    // the new message rather than dropped — the discipline it enforces (never
    // pressure staff into relabelling a truthful 'unreleased') is unchanged by
    // D-11, and under D-11 the message must not blame clearance either.
    mockService({ projectType: 'unreleased', audioFileUrl: null })
    const body = await (await decide('admit')).json()
    const message: string = body.error

    // Names the actual cause and what to do about it.
    expect(message).toContain('no playable master')
    expect(message).toContain('Upload the finished master')
    // Explicitly clears the paperwork of blame.
    expect(message).toContain('Outstanding rights paperwork is not a reason')

    // And blames the type in none of the forms the reviews rejected.
    for (const forbidden of [
      'change type',
      'change the project type',
      'project type is ineligible',
      'type must be',
      'relabel',
    ]) {
      expect(message.toLowerCase()).not.toContain(forbidden)
    }
  })

  it("ADMITS a 'single' with the same complete paperwork, unchanged", async () => {
    const { update } = mockService({ projectType: 'single' })
    const res = await decide('admit')
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalled()
    expect(await res.json()).toEqual({ data: { listingId: 'L1', status: 'admitted' } })
  })

  it("still refuses a 'snippet' on the pre-existing TYPE gate, before the new check", async () => {
    const { update } = mockService({ projectType: 'snippet' })
    const res = await decide('admit')
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(update).not.toHaveBeenCalled()
    // The type gate's own shape, not the master check's — it still runs FIRST.
    expect(body.data.projectType).toBe('snippet')
    expect(body.data.exposure).toBeUndefined()
  })

  it("leaves the REJECT path reachable for an 'unreleased' listing", async () => {
    const { update } = mockService({ projectType: 'unreleased' })
    const res = await decide('reject', 'Not a fit')
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalled()
  })
})

describe('both decision writes carry the status they validated', () => {
  it('admit: zero changed rows is a 409 conflict, with no notification', async () => {
    const { update } = mockService({ projectType: 'single', updatedRows: [] })
    const res = await decide('admit')
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(update).toHaveBeenCalled()
    expect(body.error).toContain('changed while the decision was being made')
    // Asserting the status alone would pass even if this still fired.
    expect(createNotification).not.toHaveBeenCalled()
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('reject: zero changed rows is a 409 conflict, with no notification', async () => {
    const { update } = mockService({ projectType: 'single', updatedRows: [] })
    const res = await decide('reject', 'No')
    expect(res.status).toBe(409)
    expect(update).toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('one changed row leaves every existing behaviour intact', async () => {
    mockService({ projectType: 'single', updatedRows: [{ id: 'L1' }] })
    const res = await decide('admit')
    expect(res.status).toBe(200)
    expect(logStaffAction).toHaveBeenCalled()
  })
})
