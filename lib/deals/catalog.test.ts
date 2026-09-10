import {
  isRightsReady,
  isAdmittedToSyncLibrary,
  normalizeKeySignature,
  buildCatalogFilter,
  projectMatchesKeyBpm,
  projectMatchesDescriptors,
  projectMatchesUsageCleared,
  descriptorsToDisplay,
  catalogRightsFromStage3,
  CATALOG_READINESS_THRESHOLD,
  type CatalogProjectLike,
  type CatalogTrackWithMetadata,
} from './catalog'
import type { ReadinessItem } from '@/types'
import type { Stage3Result } from '@/lib/vault/stage3'
import { readinessItemsForProject } from '@/lib/vault/readiness'
import { SYNC_READINESS_KEYS } from '@/lib/sync-library/readiness'

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

// Builds a Stage3Result exercising rightsBadge's three branches directly
// (requiredComplete/requiredTotal/sampleBlock/canContinue), rather than
// reusing the zero-requirements `stage3()` fixture above which always reads
// as 'contact' (requiredComplete === 0).
function stage3WithRequirements(opts: {
  requiredComplete: number
  requiredTotal: number
  canContinue: boolean
  sampleBlock?: boolean
}): Stage3Result {
  return {
    required: [],
    recommended: [],
    complete: [],
    requiredComplete: opts.requiredComplete,
    requiredTotal: opts.requiredTotal,
    canContinue: opts.canContinue,
    sampleBlock: opts.sampleBlock ?? false,
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

// ─── Entry-gate fixture (2026-09-10) ─────────────────────────────────────
// A single with every signature signed and a finished master, and
// DELIBERATELY no distributor, no ISRC and no ISWC — exactly the song the
// owner named on 2026-09-09 as the one the old aggregate-score gate got
// wrong. Items come from the REAL Wave 1 engine (readinessItemsForProject),
// never hand-built, so a change to how any item is derived surfaces here
// instead of being masked by a fixture that agrees with itself.
const RELEASE_ADMIN_KEYS = ['isrc_codes', 'pro_registration', 'mlc_registration', 'distributor']

type EntryGateOverrides = {
  tracks?: {
    id: string
    isrc: string | null
    iswc: string | null
    metadata: Record<string, unknown> | null
  }[]
  assets?: { type: string }[]
  documents?: { type: string; status: string }[]
}

function completeComposers(): Record<string, unknown> {
  return { composers: [{ name: 'Jane Writer', role: 'composer_lyricist', pro: 'ascap', split: 100 }] }
}

function entryGateItems(overrides: EntryGateOverrides = {}): ReadinessItem[] {
  return readinessItemsForProject({
    type: 'single',
    // Release admin, deliberately absent — the gate must not care.
    distributor: null,
    tracks: overrides.tracks ?? [
      { id: 'track-1', isrc: null, iswc: null, metadata: completeComposers() },
    ],
    assets: overrides.assets ?? [{ type: 'cover_art' }],
    documents: overrides.documents ?? [
      { type: 'copyright_registration', status: 'signed' },
      { type: 'hire_right', status: 'signed' },
      { type: 'split_sheet', status: 'signed' },
    ],
  })
}

/** The complete six, with exactly ONE item forced to a given status. */
function entryGateItemsWith(key: string, status: ReadinessItem['status']): ReadinessItem[] {
  return entryGateItems().map(i => (i.key === key ? { ...i, status } : i))
}

describe('isRightsReady — the six-item sync-catalogue entry gate (2026-09-09 decision)', () => {
  const ADMITTED: CatalogProjectLike = { has_admitted_sync_listing: true }

  it('fixture is honest: the six entry items read complete, the release-admin items do not', () => {
    const statusByKey = Object.fromEntries(entryGateItems().map(i => [i.key, i.status]))
    for (const key of SYNC_READINESS_KEYS) {
      expect(statusByKey[key]).toBe('complete')
    }
    for (const key of RELEASE_ADMIN_KEYS) {
      expect(statusByKey[key]).toBe('missing')
    }
  })

  it('is true when admitted, all six entry items complete, and stage3.canContinue', () => {
    expect(isRightsReady(ADMITTED, stage3(true), entryGateItems())).toBe(true)
  })

  // Six separate cases — one per decided entry item.
  it.each([...SYNC_READINESS_KEYS])('is false when the "%s" entry item is missing', key => {
    expect(isRightsReady(ADMITTED, stage3(true), entryGateItemsWith(key, 'missing'))).toBe(false)
  })

  // 'warning' is not 'complete' — the SAME rule missingSyncItems() applies
  // to the staff worklist, so the two surfaces agree on what "done" means.
  it.each([...SYNC_READINESS_KEYS])('is false when the "%s" entry item reads warning', key => {
    expect(isRightsReady(ADMITTED, stage3(true), entryGateItemsWith(key, 'warning'))).toBe(false)
  })

  it('is false when the project is not admitted to the sync library, however complete the six are', () => {
    expect(isRightsReady({ has_admitted_sync_listing: false }, stage3(true), entryGateItems())).toBe(false)
    expect(isRightsReady({ has_admitted_sync_listing: null }, stage3(true), entryGateItems())).toBe(false)
  })

  it('is false when stage3.canContinue is false', () => {
    expect(isRightsReady(ADMITTED, stage3(false), entryGateItems())).toBe(false)
  })

  it('fails closed on an empty readiness-item list — "nothing to check" is never "ready"', () => {
    expect(isRightsReady(ADMITTED, stage3(true), [])).toBe(false)
  })

  it('fails closed when an entry item is ABSENT from the list rather than incomplete', () => {
    const missingVisualAsset = entryGateItems().filter(i => i.key !== 'visual_asset')
    expect(isRightsReady(ADMITTED, stage3(true), missingVisualAsset)).toBe(false)
  })

  // ─── THE NAMED TEST — the entire reason this gate changed ───────────────
  // Owner decision 2026-09-09: "a song with every signature in place and a
  // finished master reads as unlicensable because nobody picked a
  // distributor." All six entry items complete; aggregate readiness score
  // 50, TEN POINTS BELOW the old CATALOG_READINESS_THRESHOLD of 60,
  // precisely because there is no distributor and no ISRC. It must PASS.
  //
  // The score is carried on the project row on purpose. isRightsReady no
  // longer reads it — CatalogProjectLike does not even declare the field —
  // and this test exists to prove that. Reverting the middle condition to
  // `vault_readiness_score >= CATALOG_READINESS_THRESHOLD` turns exactly
  // this test red and leaves the rest of this file green (mutation-verified
  // 2026-09-10).
  it('PASSES with all six items complete but a LOW aggregate readiness score (50 — no distributor, no ISRC)', () => {
    const projectWithLowAggregateScore = {
      has_admitted_sync_listing: true,
      vault_readiness_score: 50,
    }
    expect(projectWithLowAggregateScore.vault_readiness_score).toBeLessThan(CATALOG_READINESS_THRESHOLD)
    expect(isRightsReady(projectWithLowAggregateScore, stage3(true), entryGateItems())).toBe(true)
  })

  it('ignores isrc_codes, pro_registration, mlc_registration and distributor entirely', () => {
    // Present-and-missing (the fixture) already passes above. Flipping all
    // four release-admin items to complete changes nothing...
    const releaseAdminComplete = entryGateItems().map(i =>
      RELEASE_ADMIN_KEYS.includes(i.key) ? { ...i, status: 'complete' as const } : i
    )
    expect(isRightsReady(ADMITTED, stage3(true), releaseAdminComplete)).toBe(true)

    // ...and neither does dropping them from the list altogether.
    const withoutReleaseAdmin = entryGateItems().filter(i => !RELEASE_ADMIN_KEYS.includes(i.key))
    expect(isRightsReady(ADMITTED, stage3(true), withoutReleaseAdmin)).toBe(true)
  })

  it('an unreleased project can never enter the catalogue — four of the six items do not apply to it', () => {
    // readinessItemsForProject filters by applies_to: 'unreleased' gates on
    // audio_files + split_sheets only. Fails closed, matching the old
    // behaviour (an unreleased project could not reach 60 either).
    const unreleasedItems = readinessItemsForProject({
      type: 'unreleased',
      tracks: [{ id: 'track-1', isrc: null, iswc: null, metadata: completeComposers() }],
      assets: [{ type: 'cover_art' }],
      documents: [
        { type: 'copyright_registration', status: 'signed' },
        { type: 'hire_right', status: 'signed' },
        { type: 'split_sheet', status: 'signed' },
      ],
    })
    expect(unreleasedItems.some(i => i.key === 'visual_asset')).toBe(false)
    expect(isRightsReady(ADMITTED, stage3(true), unreleasedItems)).toBe(false)
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

describe('descriptorsToDisplay', () => {
  it('turns a fully-tagged track into the expected display labels', () => {
    const track = {
      metadata: {
        descriptors: {
          moods: ['driving', 'chill'],
          energy: 'high',
          vocal: 'vocal',
          instruments: ['piano', 'synth'],
        },
      },
    }
    expect(descriptorsToDisplay(track)).toEqual({
      mood: 'Driving',
      energy: 'High energy',
      vocal: 'Vocal',
      instruments: ['Piano', 'Synth'],
    })
  })

  it('uses the FIRST confirmed mood as the headline mood', () => {
    const track = { metadata: { descriptors: { moods: ['chill', 'driving'], energy: null, vocal: null } } }
    expect(descriptorsToDisplay(track).mood).toBe('Chill')
  })

  it('returns blank/empty display fields for an untagged track', () => {
    expect(descriptorsToDisplay({ metadata: null })).toEqual({
      mood: '',
      energy: '',
      vocal: '',
      instruments: [],
    })
    expect(descriptorsToDisplay({ metadata: {} })).toEqual({
      mood: '',
      energy: '',
      vocal: '',
      instruments: [],
    })
  })

  it('drops off-vocabulary values rather than throwing', () => {
    const track = {
      metadata: {
        descriptors: { moods: ['not-a-real-mood'], energy: 'extreme', vocal: 'both', instruments: ['kazoo'] },
      },
    }
    expect(descriptorsToDisplay(track)).toEqual({ mood: '', energy: '', vocal: '', instruments: [] })
  })
})

describe('catalogRightsFromStage3', () => {
  it('maps a fully-cleared, all-required-complete stage3 to "ok"', () => {
    const s3 = stage3WithRequirements({ requiredComplete: 3, requiredTotal: 3, canContinue: true })
    expect(catalogRightsFromStage3(s3)).toBe('ok')
  })

  it('maps a partially-complete stage3 to "part"', () => {
    const s3 = stage3WithRequirements({ requiredComplete: 1, requiredTotal: 3, canContinue: true })
    expect(catalogRightsFromStage3(s3)).toBe('part')
  })

  it('maps a stage3 with nothing complete yet to "req"', () => {
    const s3 = stage3WithRequirements({ requiredComplete: 0, requiredTotal: 3, canContinue: false })
    expect(catalogRightsFromStage3(s3)).toBe('req')
  })

  it('maps a sample-blocked stage3 to "req" even if otherwise complete', () => {
    const s3 = stage3WithRequirements({
      requiredComplete: 3,
      requiredTotal: 3,
      canContinue: false,
      sampleBlock: true,
    })
    expect(catalogRightsFromStage3(s3)).toBe('req')
  })
})
