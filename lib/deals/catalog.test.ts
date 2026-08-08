import {
  isRightsReady,
  isAdmittedToSyncLibrary,
  normalizeKeySignature,
  buildCatalogFilter,
  projectMatchesKeyBpm,
  projectMatchesDescriptors,
  projectMatchesUsageCleared,
  CATALOG_READINESS_THRESHOLD,
  type CatalogProjectLike,
  type CatalogTrackWithMetadata,
} from './catalog'
import type { Stage3Result } from '@/lib/vault/stage3'

function stage3(canContinue: boolean): Stage3Result {
  return {
    required: [],
    recommended: [],
    complete: [],
    requiredComplete: 0,
    requiredTotal: 0,
    canContinue,
    sampleBlock: false,
  }
}

describe('isAdmittedToSyncLibrary', () => {
  it('is true only when has_admitted_sync_listing is exactly true', () => {
    expect(isAdmittedToSyncLibrary({ has_admitted_sync_listing: true })).toBe(true)
  })

  it('fails closed on false and null', () => {
    expect(isAdmittedToSyncLibrary({ has_admitted_sync_listing: false })).toBe(false)
    expect(isAdmittedToSyncLibrary({ has_admitted_sync_listing: null })).toBe(false)
  })
})

describe('isRightsReady', () => {
  const readyProject: CatalogProjectLike = {
    has_admitted_sync_listing: true,
    vault_readiness_score: CATALOG_READINESS_THRESHOLD,
  }

  it('is false when the project is not admitted to the sync library, regardless of readiness', () => {
    expect(isRightsReady({ ...readyProject, has_admitted_sync_listing: false }, stage3(true))).toBe(false)
    expect(isRightsReady({ ...readyProject, has_admitted_sync_listing: null }, stage3(true))).toBe(false)
  })

  it('is false when admitted but readiness is below the threshold', () => {
    const project = { ...readyProject, vault_readiness_score: CATALOG_READINESS_THRESHOLD - 1 }
    expect(isRightsReady(project, stage3(true))).toBe(false)
  })

  it('is false when admitted and at/above threshold but stage3.canContinue is false', () => {
    expect(isRightsReady(readyProject, stage3(false))).toBe(false)
  })

  it('is true when admitted, at/above threshold, and stage3.canContinue is true', () => {
    expect(isRightsReady(readyProject, stage3(true))).toBe(true)
  })

  it('is true exactly at the threshold boundary (inclusive comparison)', () => {
    const project = { ...readyProject, vault_readiness_score: CATALOG_READINESS_THRESHOLD }
    expect(isRightsReady(project, stage3(true))).toBe(true)
  })

  it('fails closed on a missing/null readiness score', () => {
    expect(isRightsReady({ ...readyProject, vault_readiness_score: null }, stage3(true))).toBe(false)
  })
})

describe('normalizeKeySignature', () => {
  it('normalizes varied major-key notations to the same canonical value', () => {
    const canonical = normalizeKeySignature('F major')
    expect(canonical).toBe('F')
    expect(normalizeKeySignature('F')).toBe(canonical)
    expect(normalizeKeySignature('Fmaj')).toBe(canonical)
  })

  it('normalizes varied minor-key notations to the same canonical value', () => {
    const canonical = normalizeKeySignature('F minor')
    expect(canonical).toBe('Fm')
    expect(normalizeKeySignature('Fmin')).toBe(canonical)
    expect(normalizeKeySignature('Fm')).toBe(canonical)
  })

  it('normalizes sharp and flat accidentals, including unicode symbols', () => {
    expect(normalizeKeySignature('C#')).toBe('C#')
    expect(normalizeKeySignature('C♯ minor')).toBe('C#m')
    expect(normalizeKeySignature('Eb major')).toBe('Eb')
    expect(normalizeKeySignature('Bbmin')).toBe('Bbm')
    expect(normalizeKeySignature('B♭')).toBe('Bb')
  })

  it('is case-insensitive on the note letter', () => {
    expect(normalizeKeySignature('f major')).toBe('F')
    expect(normalizeKeySignature('bb minor')).toBe('Bbm')
  })

  it('returns null for null, undefined, empty, and unparseable input', () => {
    expect(normalizeKeySignature(null)).toBeNull()
    expect(normalizeKeySignature(undefined)).toBeNull()
    expect(normalizeKeySignature('')).toBeNull()
    expect(normalizeKeySignature('   ')).toBeNull()
    expect(normalizeKeySignature('unknown')).toBeNull()
  })
})

describe('buildCatalogFilter', () => {
  it('drops unrecognized/invalid values rather than throwing', () => {
    const filter = buildCatalogFilter({
      genre: 'not-a-real-genre',
      mood: 'not-a-real-mood',
      energy: 'extreme',
      vocal: 'both',
      bpmMin: 'abc',
      bpmMax: '-5',
    })
    expect(filter.genre).toBeNull()
    expect(filter.mood).toBeNull()
    expect(filter.energy).toBeNull()
    expect(filter.vocal).toBeNull()
    expect(filter.bpmMin).toBeNull()
    expect(filter.bpmMax).toBeNull()
  })

  it('accepts valid genre/mood/energy/vocal values', () => {
    const filter = buildCatalogFilter({ genre: 'pop', mood: 'chill', energy: 'high', vocal: 'vocal' })
    expect(filter.genre).toBe('pop')
    expect(filter.mood).toBe('chill')
    expect(filter.energy).toBe('high')
    expect(filter.vocal).toBe('vocal')
  })

  it('parses usageCleared from "true"/"1" and defaults to false otherwise', () => {
    expect(buildCatalogFilter({ usageCleared: 'true' }).usageCleared).toBe(true)
    expect(buildCatalogFilter({ usageCleared: '1' }).usageCleared).toBe(true)
    expect(buildCatalogFilter({ usageCleared: 'false' }).usageCleared).toBe(false)
    expect(buildCatalogFilter({}).usageCleared).toBe(false)
  })

  it('normalizes and dedupes a comma-separated key list', () => {
    const filter = buildCatalogFilter({ key: 'F major,Fmaj,Bbmin' })
    expect(filter.keys.sort()).toEqual(['Bbm', 'F'])
  })

  it('parses and rounds valid bpm bounds', () => {
    const filter = buildCatalogFilter({ bpmMin: '90.4', bpmMax: '120.6' })
    expect(filter.bpmMin).toBe(90)
    expect(filter.bpmMax).toBe(121)
  })

  it('clears both bounds when min is greater than max', () => {
    const filter = buildCatalogFilter({ bpmMin: '150', bpmMax: '100' })
    expect(filter.bpmMin).toBeNull()
    expect(filter.bpmMax).toBeNull()
  })
})

const NO_FILTER = buildCatalogFilter({})

describe('projectMatchesKeyBpm', () => {
  it('matches a project when exactly one of several tracks matches the BPM range', () => {
    const filter = buildCatalogFilter({ bpmMin: '120', bpmMax: '130' })
    const tracks = [{ bpm: 80 }, { bpm: 125 }, { bpm: 200 }]
    expect(projectMatchesKeyBpm(tracks, filter)).toBe(true)
  })

  it('excludes a project whose tracks all have null bpm when a BPM filter is active', () => {
    const filter = buildCatalogFilter({ bpmMin: '120', bpmMax: '130' })
    const tracks = [{ bpm: null }, { bpm: null }]
    expect(projectMatchesKeyBpm(tracks, filter)).toBe(false)
  })

  it('includes a project whose tracks all have null bpm when no BPM filter is active', () => {
    const tracks = [{ bpm: null }, { bpm: null }]
    expect(projectMatchesKeyBpm(tracks, NO_FILTER)).toBe(true)
  })

  it('treats BPM range boundaries as inclusive on both ends', () => {
    const filter = buildCatalogFilter({ bpmMin: '120', bpmMax: '130' })
    expect(projectMatchesKeyBpm([{ bpm: 120 }], filter)).toBe(true)
    expect(projectMatchesKeyBpm([{ bpm: 130 }], filter)).toBe(true)
    expect(projectMatchesKeyBpm([{ bpm: 119 }], filter)).toBe(false)
    expect(projectMatchesKeyBpm([{ bpm: 131 }], filter)).toBe(false)
  })

  it('excludes a project whose tracks all have null key_signature when a key filter is active', () => {
    const filter = buildCatalogFilter({ key: 'F' })
    const tracks = [{ key_signature: null }, { key_signature: null }]
    expect(projectMatchesKeyBpm(tracks, filter)).toBe(false)
  })

  it('includes a project whose tracks all have null key_signature when no key filter is active', () => {
    const tracks = [{ key_signature: null }, { key_signature: null }]
    expect(projectMatchesKeyBpm(tracks, NO_FILTER)).toBe(true)
  })

  it('matches a project when exactly one of several tracks matches the key filter, any notation', () => {
    const filter = buildCatalogFilter({ key: 'F major' })
    const tracks = [{ key_signature: 'C' }, { key_signature: 'Fmaj' }, { key_signature: null }]
    expect(projectMatchesKeyBpm(tracks, filter)).toBe(true)
  })
})

describe('projectMatchesDescriptors', () => {
  const withDescriptors = (
    moods: string[],
    energy: string | null,
    vocal: string | null
  ): CatalogTrackWithMetadata => ({ metadata: { descriptors: { moods, energy, vocal } } })

  it('matches when no mood/energy/vocal filter is active, regardless of track descriptors', () => {
    expect(projectMatchesDescriptors([{ metadata: null }], NO_FILTER)).toBe(true)
  })

  it('matches a project when any one track has the filtered mood', () => {
    const filter = buildCatalogFilter({ mood: 'chill' })
    const tracks = [withDescriptors(['driving'], null, null), withDescriptors(['chill'], null, null)]
    expect(projectMatchesDescriptors(tracks, filter)).toBe(true)
  })

  it('excludes a project when no track has the filtered mood', () => {
    const filter = buildCatalogFilter({ mood: 'chill' })
    const tracks = [withDescriptors(['driving'], null, null)]
    expect(projectMatchesDescriptors(tracks, filter)).toBe(false)
  })

  it('matches on energy and vocal independently', () => {
    const energyFilter = buildCatalogFilter({ energy: 'high' })
    expect(projectMatchesDescriptors([withDescriptors([], 'high', null)], energyFilter)).toBe(true)
    expect(projectMatchesDescriptors([withDescriptors([], 'low', null)], energyFilter)).toBe(false)

    const vocalFilter = buildCatalogFilter({ vocal: 'instrumental' })
    expect(projectMatchesDescriptors([withDescriptors([], null, 'instrumental')], vocalFilter)).toBe(true)
    expect(projectMatchesDescriptors([withDescriptors([], null, 'vocal')], vocalFilter)).toBe(false)
  })

  it('excludes a track with no descriptors object at all when a filter is active', () => {
    const filter = buildCatalogFilter({ mood: 'chill' })
    expect(projectMatchesDescriptors([{ metadata: null }], filter)).toBe(false)
  })
})

describe('projectMatchesUsageCleared', () => {
  it('matches regardless of pre-cleared-terms state when the filter is inactive', () => {
    expect(projectMatchesUsageCleared(false, NO_FILTER)).toBe(true)
    expect(projectMatchesUsageCleared(true, NO_FILTER)).toBe(true)
  })

  it('matches only projects with pre-cleared terms when the filter is active', () => {
    const filter = buildCatalogFilter({ usageCleared: 'true' })
    expect(projectMatchesUsageCleared(true, filter)).toBe(true)
    expect(projectMatchesUsageCleared(false, filter)).toBe(false)
  })
})
