import { trackExposure } from '@/lib/sync-library/track-exposure'
import { trackClearance } from '@/lib/sync-library/track-clearance'
import { SYNC_READINESS_KEYS } from '@/lib/sync-library/readiness'
import type { Stage3Result } from '@/lib/vault/stage3'
import type { ReadinessItem } from '@/types'

// ─── Why this test exists ────────────────────────────────────────────────
// Owner decision D-11, the clause it is most emphatic about:
//
//   "A complete admitted track is never hidden because a sibling track on the
//    same EP or album is incomplete."
//
// The model this replaced aggregated to the PROJECT: one representative track
// decided whether the whole project appeared, so an incomplete sibling could
// suppress a finished, admitted, licensable recording. Nothing in the suite
// covered it.
//
// This asserts the property against the two authorities. It deliberately also
// asserts the incomplete sibling is NOT exposed — a test that only checks the
// good track is present would pass against a function that exposes everything.
//
// Flat __tests__/ path: a bracketed path parses as a regex character class and
// matches zero tests, one of this repo's two known harness traps.
//
// WHAT THIS DOES NOT CLAIM: it does not prove the buyer catalogue or Selects
// consume these authorities. Those consumers are plan 50-05 Tasks 3 and 7, and
// Task 7 is H-2-gated. Until they land, this proves the AUTHORITIES behave
// per D-11 — not that any surface asks them.

const EP_PROJECT = { has_admitted_sync_listing: true, type: 'album' as const }

const sixComplete: ReadinessItem[] = SYNC_READINESS_KEYS.map(
  key => ({ key, status: 'complete' }) as unknown as ReadinessItem
)

const cleanStage3 = {
  required: [], recommended: [], complete: [],
  requiredComplete: 3, requiredTotal: 3, canContinue: true, sampleBlock: false,
} as Stage3Result

/** Track 1: admitted, playable, every fact complete. */
const COMPLETE_SIBLING = { trackId: 'track-complete', audioFileUrl: 'track-audio/w1/v1.wav', listingStatus: 'admitted' as const }

/** Track 2: same project, never admitted, no master. */
const INCOMPLETE_SIBLING = { trackId: 'track-incomplete', audioFileUrl: null, listingStatus: null }

describe('an incomplete sibling cannot hide a complete admitted track (D-11)', () => {
  it('exposes the complete admitted track', () => {
    expect(trackExposure(COMPLETE_SIBLING)).toEqual({ status: 'exposed' })
  })

  it('does NOT expose the incomplete sibling — so the test cannot pass by exposing everything', () => {
    expect(trackExposure(INCOMPLETE_SIBLING)).toEqual({ status: 'not_admitted' })
  })

  it('reaches opposite answers for two tracks on the SAME project, which is the whole point', () => {
    const a = trackExposure(COMPLETE_SIBLING).status
    const b = trackExposure(INCOMPLETE_SIBLING).status
    expect(a).not.toBe(b)
    expect(a).toBe('exposed')
  })

  it('still exposes the complete track when the sibling has outstanding clearance work', () => {
    // The sibling being messy is not even expressible as an input here, which
    // is the structural guarantee. This asserts the consequence.
    expect(trackExposure(COMPLETE_SIBLING).status).toBe('exposed')
    const clearance = trackClearance({
      exposure: COMPLETE_SIBLING,
      project: EP_PROJECT,
      readinessItems: sixComplete,
      stage3: cleanStage3,
      aiProvenance: { status: 'clear' },
    })
    expect(clearance.status).toBe('rights_ready')
  })

  it('NEGATIVE CONTROL: nulling the complete track\'s master removes its exposure', () => {
    // Without this, every assertion above would pass against a trackExposure
    // that returned 'exposed' unconditionally.
    expect(trackExposure({ ...COMPLETE_SIBLING, audioFileUrl: null })).toEqual({
      status: 'no_playable_master',
    })
  })

  it('NEGATIVE CONTROL: withdrawing the complete track removes it from every surface', () => {
    expect(trackExposure({ ...COMPLETE_SIBLING, listingStatus: 'withdrawn' })).toEqual({
      status: 'unavailable', reason: 'withdrawn',
    })
    const clearance = trackClearance({
      exposure: { ...COMPLETE_SIBLING, listingStatus: 'withdrawn' },
      project: EP_PROJECT,
      readinessItems: sixComplete,
      stage3: cleanStage3,
      aiProvenance: { status: 'clear' },
    })
    expect(clearance.status).toBe('unavailable')
  })
})
