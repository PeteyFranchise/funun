import { readinessItemsForProject } from '@/lib/vault/readiness'
import type { VaultProjectType } from '@/types'
import {
  SYNC_READINESS_KEYS,
  SYNC_ELIGIBLE_PROJECT_TYPES,
  isSyncEligibleProjectType,
  syncReadinessForTrack,
  missingSyncItems,
  isSyncEntryComplete,
  isSyncMetadataComplete,
  type SyncReadinessInput,
} from './readiness'

// Keys the sync-catalogue entry gate deliberately does NOT require.
// isrc_codes / pro_registration / mlc_registration joined this list on
// 2026-09-10: the owner decision of 2026-09-09 classes them as release
// admin a music supervisor has no stake in. visual_asset LEFT this list on
// the same day — cover art is now an entry requirement.
const NON_ENTRY_KEYS = [
  'isrc_codes',
  'pro_registration',
  'mlc_registration',
  'distributor',
  'epk',
  'caption_copy',
  'tiktok_strategy',
]

function completeTrackMetadata(): Record<string, unknown> {
  return {
    composers: [{ name: 'Jane Writer', role: 'composer_lyricist', pro: 'ascap', split: 100 }],
  }
}

const COMPLETE_INPUT: SyncReadinessInput = {
  type: 'single',
  track: {
    id: 'track-1',
    isrc: 'US-ABC-26-00001',
    iswc: 'T-123456789-1',
    metadata: completeTrackMetadata(),
  },
  assets: [{ type: 'cover_art' }],
  documents: [
    { type: 'copyright_registration', status: 'signed' },
    { type: 'hire_right', status: 'signed' },
    { type: 'split_sheet', status: 'signed' },
  ],
}

/**
 * The same fixture with no distributor, no ISRC and no ISWC — a song with
 * every signature signed and a finished master, which the pre-2026-09-10
 * aggregate-score gate read as unlicensable. Every ENTRY item still
 * complete.
 */
const NO_RELEASE_ADMIN_INPUT: SyncReadinessInput = {
  ...COMPLETE_INPUT,
  track: { ...COMPLETE_INPUT.track, isrc: null, iswc: null },
}

describe('SYNC_READINESS_KEYS', () => {
  it('excludes every non-entry key — release admin never gates the catalogue', () => {
    for (const key of NON_ENTRY_KEYS) {
      expect((SYNC_READINESS_KEYS as readonly string[]).includes(key)).toBe(false)
    }
  })

  // ─── DRIFT GUARD ───────────────────────────────────────────────────────
  // Pins the owner decision of 2026-09-09 (.planning/deliberations/
  // sync-catalogue-entry-and-samples.md, "DECIDED — what it takes to enter
  // the sync catalogue"). This list is the SINGLE definition of catalogue
  // entry — it drives isRightsReady() AND the staff pending_admit label —
  // so re-adding isrc_codes / pro_registration / mlc_registration, or
  // dropping visual_asset, must fail here and be an explicit decision
  // rather than a quiet edit.
  it('is exactly the six decided entry requirements', () => {
    expect(SYNC_READINESS_KEYS).toEqual([
      'split_sheets',
      'copyright',
      'hire_right',
      'audio_files',
      'metadata',
      'visual_asset',
    ])
    expect(SYNC_READINESS_KEYS).toHaveLength(6)
  })
})

describe('SYNC_ELIGIBLE_PROJECT_TYPES', () => {
  // ─── DRIFT GUARD ───────────────────────────────────────────────────────
  // Mirrors the SYNC_READINESS_KEYS guard above. This array decides WHO may
  // be licensed through the sync catalogue at all — adding 'unreleased' or
  // 'snippet' is an owner decision (the owner confirmed on 2026-09-09 that
  // unreleased work is out of scope), never a quiet edit.
  it('is exactly the three released formats', () => {
    expect(SYNC_ELIGIBLE_PROJECT_TYPES).toEqual(['single', 'ep', 'album'])
    expect(SYNC_ELIGIBLE_PROJECT_TYPES).toHaveLength(3)
  })

  it('covers every VaultProjectType — the ineligible two are named, not merely absent', () => {
    const ALL_TYPES: VaultProjectType[] = ['single', 'snippet', 'ep', 'album', 'unreleased']
    const eligible = ALL_TYPES.filter(isSyncEligibleProjectType)
    const ineligible = ALL_TYPES.filter(t => !isSyncEligibleProjectType(t))
    expect(eligible).toEqual(['single', 'ep', 'album'])
    expect(ineligible).toEqual(['snippet', 'unreleased'])
  })

  it('isSyncEligibleProjectType fails closed on snippet and unreleased', () => {
    expect(isSyncEligibleProjectType('snippet')).toBe(false)
    expect(isSyncEligibleProjectType('unreleased')).toBe(false)
  })

  // The rule must not be re-derived from the readiness registry — that
  // accidental coupling is exactly what this constant replaced.
  it('is independent of the readiness registry: the six items say nothing about type', () => {
    const allSixComplete = readinessItemsForProject({
      type: 'single',
      tracks: [{ id: 'track-1', isrc: null, iswc: null, metadata: completeTrackMetadata() }],
      assets: [{ type: 'cover_art' }],
      documents: [
        { type: 'copyright_registration', status: 'signed' },
        { type: 'hire_right', status: 'signed' },
        { type: 'split_sheet', status: 'signed' },
      ],
    })
    // isSyncEntryComplete answers ONLY "are the six done?" — it is true here
    // regardless of which project the items came from. The type rule lives
    // one layer up, in isRightsReady (lib/deals/catalog.test.ts pins it).
    expect(isSyncEntryComplete(allSixComplete)).toBe(true)
    expect(isSyncEligibleProjectType('unreleased')).toBe(false)
  })
})

describe('syncReadinessForTrack', () => {
  it('returns only items whose key is in SYNC_READINESS_KEYS', () => {
    const items = syncReadinessForTrack(COMPLETE_INPUT)
    expect(items).toHaveLength(SYNC_READINESS_KEYS.length)
    for (const item of items) {
      expect((SYNC_READINESS_KEYS as readonly string[])).toContain(item.key)
    }
    for (const key of NON_ENTRY_KEYS) {
      expect(items.some(i => i.key === key)).toBe(false)
    }
  })

  it('reads all six entry items as complete for a fully-covered single track', () => {
    const byKey = Object.fromEntries(syncReadinessForTrack(COMPLETE_INPUT).map(i => [i.key, i.status]))
    for (const key of SYNC_READINESS_KEYS) {
      expect(byKey[key]).toBe('complete')
    }
  })

  it('resolves visual_asset from the project assets, not from a cover_art_url mirror', () => {
    const withCoverArt = syncReadinessForTrack(COMPLETE_INPUT)
    expect(withCoverArt.find(i => i.key === 'visual_asset')?.status).toBe('complete')

    const withoutAssets = syncReadinessForTrack({ ...COMPLETE_INPUT, assets: [] })
    expect(withoutAssets.find(i => i.key === 'visual_asset')?.status).toBe('missing')
    expect(missingSyncItems(withoutAssets).some(i => i.key === 'visual_asset')).toBe(true)
  })

  it('a missing ISRC/ISWC no longer surfaces at all — release admin left the list', () => {
    const items = syncReadinessForTrack(NO_RELEASE_ADMIN_INPUT)
    expect(items.some(i => i.key === 'isrc_codes')).toBe(false)
    expect(items.some(i => i.key === 'pro_registration')).toBe(false)
    expect(items.some(i => i.key === 'mlc_registration')).toBe(false)
    expect(missingSyncItems(items)).toEqual([])
  })

  it('delegates status computation to readinessItemsForProject — identical single-track input produces identical statuses', () => {
    const items = syncReadinessForTrack(COMPLETE_INPUT)
    const expected = readinessItemsForProject({
      type: COMPLETE_INPUT.type,
      tracks: [COMPLETE_INPUT.track],
      assets: COMPLETE_INPUT.assets,
      documents: COMPLETE_INPUT.documents,
    }).filter(i => (SYNC_READINESS_KEYS as readonly string[]).includes(i.key))

    expect(items.map(i => ({ key: i.key, status: i.status }))).toEqual(
      expected.map(i => ({ key: i.key, status: i.status }))
    )
  })
})

describe('missingSyncItems', () => {
  it('returns only items whose status is not complete', () => {
    const items = syncReadinessForTrack({
      ...COMPLETE_INPUT,
      assets: [],
      documents: [{ type: 'split_sheet', status: 'signed' }],
    })
    const missing = missingSyncItems(items)
    expect(missing.every(i => i.status !== 'complete')).toBe(true)
    expect(missing.map(i => i.key).sort()).toEqual(['copyright', 'hire_right', 'visual_asset'])
  })
})

// ─── isSyncEntryComplete — the catalogue entry gate predicate ────────────

describe('isSyncEntryComplete', () => {
  it('is true when every one of the six entry items reads complete', () => {
    expect(isSyncEntryComplete(syncReadinessForTrack(COMPLETE_INPUT))).toBe(true)
  })

  it('is true for a song with no distributor, no ISRC and no ISWC — the whole point of the six-item gate', () => {
    expect(isSyncEntryComplete(syncReadinessForTrack(NO_RELEASE_ADMIN_INPUT))).toBe(true)
  })

  it.each([...SYNC_READINESS_KEYS])('is false when the "%s" item is missing', key => {
    const items = syncReadinessForTrack(COMPLETE_INPUT).map(i =>
      i.key === key ? { ...i, status: 'missing' as const } : i
    )
    expect(isSyncEntryComplete(items)).toBe(false)
  })

  it('is false when an item reads warning rather than complete', () => {
    const items = syncReadinessForTrack(COMPLETE_INPUT).map(i =>
      i.key === 'split_sheets' ? { ...i, status: 'warning' as const } : i
    )
    expect(isSyncEntryComplete(items)).toBe(false)
  })

  it('fails closed on an absent key and on an empty list', () => {
    const withoutCoverArt = syncReadinessForTrack(COMPLETE_INPUT).filter(i => i.key !== 'visual_asset')
    expect(isSyncEntryComplete(withoutCoverArt)).toBe(false)
    expect(isSyncEntryComplete([])).toBe(false)
  })
})

describe('isSyncMetadataComplete', () => {
  it('is true when the metadata item is complete', () => {
    expect(isSyncMetadataComplete(syncReadinessForTrack(COMPLETE_INPUT))).toBe(true)
  })

  // The metadata FAMILY collapsed from four keys to one on 2026-09-10 (see
  // METADATA_FAMILY_KEYS). This is the behaviour change that consequence
  // implies for the STAFF admit gate — stated as a test rather than left to
  // be discovered: a missing ISRC/ISWC no longer blocks admission.
  it('is true for a track with no ISRC and no ISWC — release admin left the metadata family', () => {
    expect(isSyncMetadataComplete(syncReadinessForTrack(NO_RELEASE_ADMIN_INPUT))).toBe(true)
  })

  it('is false when the metadata item is incomplete', () => {
    const items = syncReadinessForTrack({
      ...COMPLETE_INPUT,
      track: { ...COMPLETE_INPUT.track, metadata: { composers: [] } },
    })
    expect(isSyncMetadataComplete(items)).toBe(false)
  })

  it('fails closed when no metadata-family items are present', () => {
    expect(isSyncMetadataComplete([])).toBe(false)
    expect(isSyncMetadataComplete(syncReadinessForTrack(COMPLETE_INPUT).filter(i => i.key !== 'metadata'))).toBe(
      false
    )
  })
})
