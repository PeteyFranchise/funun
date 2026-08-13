import { readinessItemsForProject } from '@/lib/vault/readiness'
import {
  SYNC_READINESS_KEYS,
  syncReadinessForTrack,
  missingSyncItems,
  isSyncMetadataComplete,
  type SyncReadinessInput,
} from './readiness'

const RELEASE_ONLY_KEYS = ['visual_asset', 'distributor', 'epk', 'caption_copy', 'tiktok_strategy']

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
  documents: [
    { type: 'copyright_registration', status: 'signed' },
    { type: 'hire_right', status: 'signed' },
    { type: 'split_sheet', status: 'signed' },
  ],
}

describe('SYNC_READINESS_KEYS', () => {
  it('excludes every release-only key', () => {
    for (const key of RELEASE_ONLY_KEYS) {
      expect((SYNC_READINESS_KEYS as readonly string[]).includes(key)).toBe(false)
    }
  })

  it('is exactly the sync-relevant subset', () => {
    expect(SYNC_READINESS_KEYS).toEqual([
      'audio_files',
      'split_sheets',
      'copyright',
      'isrc_codes',
      'pro_registration',
      'mlc_registration',
      'hire_right',
      'metadata',
    ])
  })
})

describe('syncReadinessForTrack', () => {
  it('returns only items whose key is in SYNC_READINESS_KEYS', () => {
    const items = syncReadinessForTrack(COMPLETE_INPUT)
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect((SYNC_READINESS_KEYS as readonly string[])).toContain(item.key)
    }
    for (const key of RELEASE_ONLY_KEYS) {
      expect(items.some(i => i.key === key)).toBe(false)
    }
  })

  it('reads metadata/isrc_codes/pro_registration as complete for a fully-covered single track', () => {
    const items = syncReadinessForTrack(COMPLETE_INPUT)
    const byKey = Object.fromEntries(items.map(i => [i.key, i]))
    expect(byKey.metadata.status).toBe('complete')
    expect(byKey.isrc_codes.status).toBe('complete')
    expect(byKey.pro_registration.status).toBe('complete')
  })

  it('reads isrc_codes as missing when the track has no ISRC, and surfaces it via missingSyncItems', () => {
    const input: SyncReadinessInput = {
      ...COMPLETE_INPUT,
      track: { ...COMPLETE_INPUT.track, isrc: null },
    }
    const items = syncReadinessForTrack(input)
    const isrcItem = items.find(i => i.key === 'isrc_codes')
    expect(isrcItem?.status).toBe('missing')
    expect(missingSyncItems(items).some(i => i.key === 'isrc_codes')).toBe(true)
  })

  it('delegates status computation to readinessItemsForProject — identical single-track input produces identical statuses', () => {
    const items = syncReadinessForTrack(COMPLETE_INPUT)
    const expected = readinessItemsForProject({
      type: COMPLETE_INPUT.type,
      tracks: [COMPLETE_INPUT.track],
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
      track: { ...COMPLETE_INPUT.track, isrc: null, iswc: null },
    })
    const missing = missingSyncItems(items)
    expect(missing.every(i => i.status !== 'complete')).toBe(true)
    expect(missing.some(i => i.key === 'isrc_codes')).toBe(true)
    expect(missing.some(i => i.key === 'pro_registration')).toBe(true)
  })
})

describe('isSyncMetadataComplete', () => {
  it('is true when metadata/isrc_codes/pro_registration/mlc_registration are all complete', () => {
    const items = syncReadinessForTrack(COMPLETE_INPUT)
    expect(isSyncMetadataComplete(items)).toBe(true)
  })

  it('is false when any metadata-family item is incomplete', () => {
    const items = syncReadinessForTrack({
      ...COMPLETE_INPUT,
      track: { ...COMPLETE_INPUT.track, isrc: null },
    })
    expect(isSyncMetadataComplete(items)).toBe(false)
  })

  it('fails closed when no metadata-family items are present', () => {
    expect(isSyncMetadataComplete([])).toBe(false)
  })
})
