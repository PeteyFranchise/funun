import { trackClearance, type TrackClearanceInput } from '@/lib/sync-library/track-clearance'
import { SYNC_READINESS_KEYS } from '@/lib/sync-library/readiness'
import type { Stage3Result } from '@/lib/vault/stage3'
import type { ReadinessItem } from '@/types'

function stage3(over: Partial<Stage3Result> = {}): Stage3Result {
  return {
    required: [], recommended: [], complete: [],
    requiredComplete: 3, requiredTotal: 3,
    canContinue: true, sampleBlock: false,
    ...over,
  } as Stage3Result
}

const sixComplete: ReadinessItem[] = SYNC_READINESS_KEYS.map(
  key => ({ key, status: 'complete' }) as unknown as ReadinessItem
)

function input(over: Partial<TrackClearanceInput> = {}): TrackClearanceInput {
  return {
    exposure: { trackId: 't1', audioFileUrl: 'a.wav', listingStatus: 'admitted' },
    project: { has_admitted_sync_listing: true, type: 'single' },
    readinessItems: sixComplete,
    stage3: stage3(),
    aiProvenance: { status: 'clear' },
    ...over,
  }
}

describe('trackClearance — D-11 three buyer-facing states', () => {
  it('rights_ready when every fact is complete and AI provenance is clear', () => {
    const r = trackClearance(input())
    expect(r.status).toBe('rights_ready')
    expect(r.outstanding).toEqual([])
  })

  it('unavailable for a terminal listing, and ONLY then — the one state both authorities share', () => {
    for (const s of ['withdrawn', 'removed', 'rejected'] as const) {
      const r = trackClearance(input({ exposure: { trackId: 't1', audioFileUrl: 'a.wav', listingStatus: s } }))
      expect(r.status).toBe('unavailable')
      expect(r.outstanding[0].key).toBe(`listing_${s}`)
    }
  })

  it('clearance_required with unsigned documents, itemised as REQUIRED', () => {
    const r = trackClearance(input({ stage3: stage3({ requiredComplete: 1, requiredTotal: 3, canContinue: false }) }))
    expect(r.status).toBe('clearance_required')
    expect(r.outstanding).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'required_documents', kind: 'required' })])
    )
  })

  it('a blocking sample is HUMAN_REVIEW, not something the artist can clear', () => {
    const r = trackClearance(input({ stage3: stage3({ sampleBlock: true, requiredComplete: 0 }) }))
    expect(r.outstanding).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'sample_clearance', kind: 'human_review' })])
    )
  })

  it('AI provenance unresolved can NEVER reach rights_ready — absence of a disqualifier is not clearance', () => {
    const r = trackClearance(input({ aiProvenance: { status: 'unresolved', reason: 'no work link' } }))
    expect(r.status).toBe('clearance_required')
    expect(r.outstanding).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'ai_provenance', kind: 'human_review' })])
    )
  })

  it('a NULL aiProvenance (50-02 not yet landed) behaves as unresolved, never as silence', () => {
    const r = trackClearance(input({ aiProvenance: null }))
    expect(r.status).toBe('clearance_required')
    expect(r.outstanding.some(i => i.key === 'ai_provenance')).toBe(true)
  })

  it('a disqualifying AI verdict is REQUIRED and carries its own reasons', () => {
    const r = trackClearance(input({ aiProvenance: { status: 'disqualified', reasons: ['wholly AI master'] } }))
    expect(r.outstanding).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'ai_provenance', kind: 'required', reason: 'wholly AI master' })])
    )
  })

  it("an 'unreleased' project with the six keys supplied is NOT penalised — only the coverage gap is", () => {
    const r = trackClearance(input({ project: { has_admitted_sync_listing: true, type: 'unreleased' } }))
    expect(r.status).toBe('rights_ready')
  })

  it('a coverage gap is HUMAN_REVIEW with nothing for the artist to do — it is a Funūn defect', () => {
    const twoOfSix = sixComplete.slice(0, 2)
    const r = trackClearance(input({ readinessItems: twoOfSix }))
    expect(r.status).toBe('clearance_required')
    const item = r.outstanding.find(i => i.key === 'readiness_coverage')
    expect(item?.kind).toBe('human_review')
    expect(item?.reason).toContain('Nothing for you to do')
  })

  it('NEVER returns an exposure decision — clearance cannot hide a track', () => {
    const states = new Set<string>()
    states.add(trackClearance(input()).status)
    states.add(trackClearance(input({ stage3: stage3({ requiredComplete: 0 }) })).status)
    states.add(trackClearance(input({ exposure: { trackId: 't1', audioFileUrl: 'a.wav', listingStatus: 'withdrawn' } })).status)
    for (const s of states) expect(['rights_ready', 'clearance_required', 'unavailable']).toContain(s)
    expect(states.has('not_admitted')).toBe(false)
    expect(states.has('no_playable_master')).toBe(false)
  })
})
