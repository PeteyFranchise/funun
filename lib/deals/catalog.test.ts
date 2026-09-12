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
import type { ReadinessItem, VaultProjectType } from '@/types'
import { computeStage3, STAGE3_CONTINUE_THRESHOLD, type Stage3Result } from '@/lib/vault/stage3'
import { rightsBadge } from '@/lib/sync-library/gate'
import { readinessItemsForProject } from '@/lib/vault/readiness'
import {
  SYNC_READINESS_KEYS,
  SYNC_ELIGIBLE_PROJECT_TYPES,
  isSyncEligibleProjectType,
  isSyncEntryComplete,
} from '@/lib/sync-library/readiness'

// Builds a Stage3Result exercising rightsBadge's three branches directly
// (requiredComplete/requiredTotal/sampleBlock/canContinue), rather than
// reusing a zero-requirements fixture, which would always read as 'contact'
// (requiredComplete === 0).
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
  /** The project type handed to the REAL readiness engine. */
  type?: VaultProjectType
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
    type: overrides.type ?? 'single',
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
  const ADMITTED: CatalogProjectLike = { has_admitted_sync_listing: true, type: 'single' }

  it('fixture is honest: the six entry items read complete, the release-admin items do not', () => {
    const statusByKey = Object.fromEntries(entryGateItems().map(i => [i.key, i.status]))
    for (const key of SYNC_READINESS_KEYS) {
      expect(statusByKey[key]).toBe('complete')
    }
    for (const key of RELEASE_ADMIN_KEYS) {
      expect(statusByKey[key]).toBe('missing')
    }
  })

  it('is true when admitted, of an eligible type, and all six entry items complete', () => {
    expect(isRightsReady(ADMITTED, entryGateItems())).toBe(true)
  })

  // Six separate cases — one per decided entry item.
  it.each([...SYNC_READINESS_KEYS])('is false when the "%s" entry item is missing', key => {
    expect(isRightsReady(ADMITTED, entryGateItemsWith(key, 'missing'))).toBe(false)
  })

  // 'warning' is not 'complete' — the SAME rule missingSyncItems() applies
  // to the staff worklist, so the two surfaces agree on what "done" means.
  it.each([...SYNC_READINESS_KEYS])('is false when the "%s" entry item reads warning', key => {
    expect(isRightsReady(ADMITTED, entryGateItemsWith(key, 'warning'))).toBe(false)
  })

  it('is false when the project is not admitted to the sync library, however complete the six are', () => {
    expect(
      isRightsReady({ has_admitted_sync_listing: false, type: 'single' }, entryGateItems())
    ).toBe(false)
    expect(
      isRightsReady({ has_admitted_sync_listing: null, type: 'single' }, entryGateItems())
    ).toBe(false)
  })

  // The `is false when stage3.canContinue is false` case that stood here
  // was DELETED on 2026-09-10 (third pass), not fixed up: canContinue is no
  // longer an input to this gate at all. The reason it went, and the test
  // that replaced it, are in the "sampled tracks" describe block below.

  it('fails closed on an empty readiness-item list — "nothing to check" is never "ready"', () => {
    expect(isRightsReady(ADMITTED, [])).toBe(false)
  })

  it('fails closed when an entry item is ABSENT from the list rather than incomplete', () => {
    const missingVisualAsset = entryGateItems().filter(i => i.key !== 'visual_asset')
    expect(isRightsReady(ADMITTED, missingVisualAsset)).toBe(false)
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
      type: 'single' as const,
      vault_readiness_score: 50,
    }
    expect(projectWithLowAggregateScore.vault_readiness_score).toBeLessThan(CATALOG_READINESS_THRESHOLD)
    expect(isRightsReady(projectWithLowAggregateScore, entryGateItems())).toBe(true)
  })

  it('ignores isrc_codes, pro_registration, mlc_registration and distributor entirely', () => {
    // Present-and-missing (the fixture) already passes above. Flipping all
    // four release-admin items to complete changes nothing...
    const releaseAdminComplete = entryGateItems().map(i =>
      RELEASE_ADMIN_KEYS.includes(i.key) ? { ...i, status: 'complete' as const } : i
    )
    expect(isRightsReady(ADMITTED, releaseAdminComplete)).toBe(true)

    // ...and neither does dropping them from the list altogether.
    const withoutReleaseAdmin = entryGateItems().filter(i => !RELEASE_ADMIN_KEYS.includes(i.key))
    expect(isRightsReady(ADMITTED, withoutReleaseAdmin)).toBe(true)
  })

  it('fails closed when an entry item is ABSENT because the registry did not emit it', () => {
    // readinessItemsForProject filters by applies_to. This is the BACKSTOP
    // path, no longer the type rule — see the project-type describe below.
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
    expect(isRightsReady(ADMITTED, unreleasedItems)).toBe(false)
  })
})

// ─── The project-TYPE condition (2026-09-10, second pass) ─────────────────
// The sync catalogue licenses released-format recordings. Owner confirmed
// 2026-09-09 that 'unreleased' has nothing to do with it; 'snippet' is a
// promo clip, not a licensable recording.
//
// Every test below hands isRightsReady an item list in which ALL SIX entry
// items read 'complete' — deliberately, so the verdict can only come from
// the type rule. Nothing here is allowed to pass or fail incidentally on a
// missing readiness item.
describe('isRightsReady — the project-type allowlist (SYNC_ELIGIBLE_PROJECT_TYPES)', () => {
  const INELIGIBLE_TYPES: VaultProjectType[] = ['snippet', 'unreleased']

  function admitted(type: VaultProjectType): CatalogProjectLike {
    return { has_admitted_sync_listing: true, type }
  }

  it.each([...SYNC_ELIGIBLE_PROJECT_TYPES])(
    'a project of type %s with all six items complete PASSES the gate',
    type => {
      const items = entryGateItems({ type })
      const statusByKey = Object.fromEntries(items.map(i => [i.key, i.status]))
      for (const key of SYNC_READINESS_KEYS) {
        expect(statusByKey[key]).toBe('complete')
      }
      expect(isRightsReady(admitted(type), items)).toBe(true)
    }
  )

  // ─── THE REGRESSION THIS EXISTS TO PREVENT ─────────────────────────────
  // Before SYNC_ELIGIBLE_PROJECT_TYPES, 'snippet'/'unreleased' were kept
  // out of the catalogue ONLY as a side effect of the readiness registry's
  // applies_to tables (types/index.ts READINESS_ITEMS) not emitting four of
  // the six entry items for them. Adding `applies_to: [... 'unreleased']`
  // to any one of those items — a perfectly reasonable future edit made for
  // release-readiness reasons — would silently have made unreleased
  // projects catalogue-eligible.
  //
  // This test SIMULATES that future edit: the item list is built from a
  // 'single' (so the registry emits, and completes, all six) and then handed
  // to the gate with an ineligible project type. It stands in for "the
  // registry started emitting all six items for this type." The gate must
  // still refuse, on the type rule alone.
  //
  // MUTATION-VERIFIED 2026-09-10: deleting the
  // `if (!isSyncEligibleProjectType(project.type)) return false` line from
  // lib/deals/catalog.ts turns exactly these cases red and leaves the rest
  // of this file green.
  it.each(INELIGIBLE_TYPES)(
    'type %s is REFUSED even when the readiness registry supplies all six items complete',
    type => {
      // Built as a 'single' on purpose — every one of the six is present
      // and 'complete', which is precisely what today's registry would NOT
      // produce for this type. That is the point.
      const allSixComplete = entryGateItems()
      const statusByKey = Object.fromEntries(allSixComplete.map(i => [i.key, i.status]))
      for (const key of SYNC_READINESS_KEYS) {
        expect(statusByKey[key]).toBe('complete')
      }
      // Sanity: the ONLY thing standing between this and a pass is the type.
      expect(isSyncEntryComplete(allSixComplete)).toBe(true)
      expect(isRightsReady(admitted('single'), allSixComplete)).toBe(true)

      expect(isRightsReady(admitted(type), allSixComplete)).toBe(false)
    }
  )

  it.each(INELIGIBLE_TYPES)(
    'type %s is refused even on an ADMITTED project with the six complete',
    type => {
      expect(isSyncEligibleProjectType(type)).toBe(false)
      expect(isRightsReady(admitted(type), entryGateItems())).toBe(false)
    }
  )

  it('the allowlist is the only difference — same items, opposite verdicts', () => {
    const items = entryGateItems()
    expect(isRightsReady(admitted('album'), items)).toBe(true)
    expect(isRightsReady(admitted('unreleased'), items)).toBe(false)
  })
})

// ─── Sampled tracks (owner decision 2026-09-09, wired 2026-09-10) ─────────
// ".planning/deliberations/sync-catalogue-entry-and-samples.md — DECIDED:
// sampled tracks ARE included, in the default browse", carrying a label
// reading "Contains a sample — licensing needs clearance first" and
// promising no timeline.
//
// That decision and the entry gate CONTRADICTED EACH OTHER IN CODE until
// this block was written. The gate ended `return stage3.canContinue`, and
// canContinue is `readinessScore >= CONTINUE_THRESHOLD && !sampleBlock`
// (lib/vault/stage3.ts). So an uncleared sample failed the gate, the song
// never reached a buyer, and the "Contains a sample" label — which had
// ALREADY SHIPPED, rendered by components/buyer/CatalogBrowserLight.tsx —
// was unreachable in production. Copy for a state the gate forbade.
//
// The tests below pin BOTH halves of the resolution: the sampled track now
// enters the catalogue, AND it arrives carrying the right label.
describe('isRightsReady — a sampled track is LISTED, not hidden (2026-09-09 decision)', () => {
  const ADMITTED_SINGLE: CatalogProjectLike = { has_admitted_sync_listing: true, type: 'single' }

  // A Stage3Result for a song whose sample clearance is NOT signed. Every
  // other rights document IS signed (requiredComplete === requiredTotal),
  // so nothing but the sample can be responsible for a verdict here.
  // canContinue is false because that is what computeStage3 really returns
  // for this song — the fixture must not flatter the gate.
  function sampleBlockedStage3(): Stage3Result {
    return stage3WithRequirements({
      requiredComplete: 3,
      requiredTotal: 3,
      canContinue: false,
      sampleBlock: true,
    })
  }

  // ─── THE TEST THIS CHANGE EXISTS FOR ───────────────────────────────────
  // MUTATION-VERIFIED 2026-09-10: restoring `return stage3.canContinue` as
  // the last line of isRightsReady (and its `stage3` parameter) turns
  // exactly this test red.
  it('PASSES the gate with an UNCLEARED SAMPLE — all six entry items complete, eligible type, admitted', () => {
    const items = entryGateItems()
    // Sanity: nothing but the sample rule could decide this case.
    expect(isSyncEntryComplete(items)).toBe(true)
    expect(isSyncEligibleProjectType('single')).toBe(true)
    expect(sampleBlockedStage3().sampleBlock).toBe(true)

    expect(isRightsReady(ADMITTED_SINGLE, items)).toBe(true)
  })

  // The other half: being listed is only correct if the buyer is TOLD. This
  // proves the "Contains a sample" label is now reachable end to end — the
  // same Stage3Result the artist's pipeline treats as blocking maps, on the
  // buyer side, to the 'req' code CatalogBrowserLight renders as "Contains
  // a sample".
  it('and reads as the "Contains a sample" rights code — the label is now REACHABLE', () => {
    const s3 = sampleBlockedStage3()
    expect(rightsBadge(s3)).toBe('contact')
    expect(catalogRightsFromStage3(s3)).toBe('req')
  })

  // The contrast case: a clean song with the same six items reads 'ready'/
  // 'ok'. Listing a sampled track did not flatten the two states into one.
  it('a CLEAN track with the same six items passes and reads "ready"/"ok"', () => {
    const items = entryGateItems()
    expect(isRightsReady(ADMITTED_SINGLE, items)).toBe(true)

    const cleanStage3 = stage3WithRequirements({
      requiredComplete: 3,
      requiredTotal: 3,
      canContinue: true,
      sampleBlock: false,
    })
    expect(rightsBadge(cleanStage3)).toBe('ready')
    expect(catalogRightsFromStage3(cleanStage3)).toBe('ok')
  })

  // ─── The guard that keeps this fix from becoming a different bug ────────
  // canContinue answers the ARTIST's question — "may this project advance
  // to Stage 4, Generate Assets?" — and an uncleared sample MUST keep
  // blocking there, because you cannot distribute a track with an uncleared
  // sample. Only the SYNC gate stopped borrowing it. If someone later
  // "simplifies" the sample rule out of computeStage3 on the strength of
  // the decision above, this fails.
  it('does NOT weaken the release pipeline: computeStage3 still returns canContinue: false on an uncleared sample', () => {
    const project = {
      id: 'p1',
      title: 'Sampled single',
      type: 'single',
      content_id_registered: false,
      content_id_dismissed_until: null,
    }
    const tracks = [
      {
        id: 'track-1',
        title: 'Sampled single',
        has_sample: true,
        sample_details: 'Four bars from an uncleared 1974 break',
      },
    ]
    // A readiness score WELL above STAGE3_CONTINUE_THRESHOLD, so the only
    // thing that can make canContinue false is the sample.
    const result = computeStage3(project, tracks, [], 100)
    expect(100).toBeGreaterThanOrEqual(STAGE3_CONTINUE_THRESHOLD)
    expect(result.sampleBlock).toBe(true)
    expect(result.canContinue).toBe(false)
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
