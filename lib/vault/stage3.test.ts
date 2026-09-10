// ─── The release pipeline must NOT weaken when the sync gate loosens ─────
// The owner decided (2026-09-09) that a sampled track IS listed in the sync
// catalogue, labelled "Contains a sample". Two gates were then changed so
// an uncleared sample stops hiding a song from BUYERS: isRightsReady()
// (lib/deals/catalog.ts, 2026-09-10) and the staff admit route
// (app/api/sync-library/admin/[listingId]/route.ts, this change).
//
// computeStage3() answers a DIFFERENT question — "may this artist advance
// to Stage 4, Generate Assets, and distribute?" — and for that question an
// uncleared sample must keep blocking, because you cannot distribute a
// track with an uncleared sample. These tests exist so nobody reads the
// catalogue decision as licence to simplify the sample rule out of the
// artist's release path.
//
// (The 2026-09-10 deliberation record claims a file at this path already
// pinned this. It did not exist. It does now.)
import { computeStage3 } from '@/lib/vault/stage3'
import { hireCreditsOf } from '@/lib/vault/hire-credits'

const PROJECT = { id: 'proj-1', title: 'Midnight Run', type: 'single' }

const SAMPLED_TRACK = {
  id: 'track-1',
  title: 'Midnight Run',
  writers: ['Jane Writer'],
  producers: [],
  mixing_engineer: null,
  mastering_engineer: null,
  has_sample: true,
  sample_details: 'Amen break',
}

const CLEAN_TRACK = { ...SAMPLED_TRACK, has_sample: false, sample_details: null }

describe('computeStage3 — an uncleared sample still blocks the artist release path', () => {
  it('returns canContinue: false for an uncleared sample even at a perfect readiness score', () => {
    const stage3 = computeStage3(PROJECT, [SAMPLED_TRACK], [], 100)

    expect(stage3.sampleBlock).toBe(true)
    expect(stage3.canContinue).toBe(false)
  })

  it('returns canContinue: true once the sample clearance is signed', () => {
    const stage3 = computeStage3(
      PROJECT,
      [SAMPLED_TRACK],
      [{ id: 'doc-1', type: 'sample_clearance', status: 'signed', track_id: 'track-1' }],
      100
    )

    expect(stage3.sampleBlock).toBe(false)
    expect(stage3.canContinue).toBe(true)
  })

  it('still gates on the readiness threshold for a track with no sample at all', () => {
    expect(computeStage3(PROJECT, [CLEAN_TRACK], [], 59).canContinue).toBe(false)
    expect(computeStage3(PROJECT, [CLEAN_TRACK], [], 60).canContinue).toBe(true)
  })
})

// ─── hireCreditsOf — extracted from section 3, behaviour unchanged ───────
// The readiness engine reads this SAME derivation to tell "no producer
// agreement is required" apart from "a producer agreement is missing"
// (lib/vault/readiness.ts). These pin that the extraction did not change
// what computeStage3() has always considered a hired collaborator.
describe('hireCreditsOf — the one definition of a hired collaborator', () => {
  it('reads producers, then the mixing engineer, then the mastering engineer', () => {
    expect(
      hireCreditsOf({
        producers: ['Marcus Beats', 'Ola'],
        mixing_engineer: 'Dee Mixdown',
        mastering_engineer: 'Ana Masters',
      })
    ).toEqual([
      { name: 'Marcus Beats', role: 'Producer' },
      { name: 'Ola', role: 'Producer' },
      { name: 'Dee Mixdown', role: 'Mixing engineer' },
      { name: 'Ana Masters', role: 'Mastering engineer' },
    ])
  })

  it('skips blank and whitespace-only credits, and trims the rest', () => {
    expect(
      hireCreditsOf({
        producers: ['', '   ', '  Marcus Beats  '],
        mixing_engineer: '   ',
        mastering_engineer: null,
      })
    ).toEqual([{ name: 'Marcus Beats', role: 'Producer' }])
  })

  it('returns nothing for a self-produced recording', () => {
    expect(hireCreditsOf({ producers: null, mixing_engineer: null, mastering_engineer: null })).toEqual([])
    expect(hireCreditsOf({ producers: [], mixing_engineer: '', mastering_engineer: '' })).toEqual([])
  })

  it('still produces ONE HireRight requirement per person across several tracks', () => {
    // The grouping computeStage3 does on top of hireCreditsOf: a producer
    // who worked on two tracks is one document, not two.
    const stage3 = computeStage3(
      PROJECT,
      [
        { ...CLEAN_TRACK, id: 't1', producers: ['Marcus Beats'] },
        { ...CLEAN_TRACK, id: 't2', producers: ['Marcus Beats'] },
      ],
      [],
      100
    )
    const hireRights = [...stage3.required, ...stage3.complete].filter(r => r.tool === 'hireright')
    expect(hireRights).toHaveLength(1)
    expect(hireRights[0].collaborator).toBe('Marcus Beats')
    expect(hireRights[0].collaboratorRole).toBe('Producer')
  })
})
