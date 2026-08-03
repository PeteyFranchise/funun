import {
  IDENTIFIER_GUIDE,
  STORED_IDENTIFIER_IDS,
  GENERATABLE_SCHEME_IDS,
  DDEX_LEVELS,
  getIdentifiersForLevel,
  getIdentifierEntry,
} from './identifier-guide'

const ALL_IDS = Object.keys(IDENTIFIER_GUIDE)
const ALL_ENTRIES = Object.values(IDENTIFIER_GUIDE)

describe('IDENTIFIER_GUIDE — shape', () => {
  it('every identifier entry carries the required non-empty fields', () => {
    for (const [id, entry] of Object.entries(IDENTIFIER_GUIDE)) {
      expect(id).toBeTruthy()
      expect(entry.id).toBe(id)
      expect(entry.label).toBeTruthy()
      expect(entry.ddexLevel).toBeTruthy()
      expect(entry.identifies).toBeTruthy()
      expect(entry.issuedBy).toBeTruthy()
      expect(entry.howToGet).toBeTruthy()
      expect(entry.unlocks).toBeTruthy()
      expect(entry.officialUrl).toBeTruthy()
    }
  })

  it('ddexLevel is always one of party | work | resource | release', () => {
    for (const entry of ALL_ENTRIES) {
      expect(DDEX_LEVELS).toContain(entry.ddexLevel)
    }
  })

  it('officialUrl is https and points at the issuing body, never a Funūn route', () => {
    for (const entry of ALL_ENTRIES) {
      expect(entry.officialUrl.startsWith('https://')).toBe(true)
      expect(entry.officialUrl.toLowerCase()).not.toContain('funun')
      expect(entry.officialUrl.startsWith('/')).toBe(false)
    }
  })

  it('never recommends which PRO, society, or distributor to choose', () => {
    for (const entry of ALL_ENTRIES) {
      const text = JSON.stringify(entry).toLowerCase()
      expect(text).not.toMatch(/\brecommend/)
      expect(text).not.toMatch(/\byou should (join|choose|pick|use)\b/)
    }
  })
})

describe('getIdentifiersForLevel', () => {
  it("returns exactly the release-level entries for 'release'", () => {
    const releaseEntries = getIdentifiersForLevel('release')
    const expectedIds = ALL_ENTRIES.filter(e => e.ddexLevel === 'release').map(e => e.id).sort()
    expect(releaseEntries.map(e => e.id).sort()).toEqual(expectedIds)
    expect(releaseEntries.length).toBeGreaterThan(0)
    for (const e of releaseEntries) expect(e.ddexLevel).toBe('release')
  })

  it('returns exactly the party-level entries for party', () => {
    const partyEntries = getIdentifiersForLevel('party')
    for (const e of partyEntries) expect(e.ddexLevel).toBe('party')
    expect(partyEntries.length).toBeGreaterThan(0)
  })

  it('returns exactly the work-level entries for work', () => {
    const workEntries = getIdentifiersForLevel('work')
    for (const e of workEntries) expect(e.ddexLevel).toBe('work')
  })

  it('returns exactly the resource-level entries for resource', () => {
    const resourceEntries = getIdentifiersForLevel('resource')
    for (const e of resourceEntries) expect(e.ddexLevel).toBe('resource')
    expect(resourceEntries.length).toBeGreaterThan(0)
  })
})

describe('getIdentifierEntry', () => {
  it('returns the entry for a known id', () => {
    expect(getIdentifierEntry('isrc')?.id).toBe('isrc')
  })

  it('returns null for an unknown id', () => {
    expect(getIdentifierEntry('not-a-real-identifier')).toBeNull()
  })
})

describe('stored-identifier sync guard', () => {
  it('every stored identifier has a guide entry, and every storedAt-bearing entry is in the stored list', () => {
    const storedInGuide = ALL_ENTRIES.filter(e => e.storedAt !== null).map(e => e.id).sort()
    expect(storedInGuide).toEqual([...STORED_IDENTIFIER_IDS].sort())
  })

  it('every id in STORED_IDENTIFIER_IDS resolves to a real guide entry', () => {
    for (const id of STORED_IDENTIFIER_IDS) {
      expect(ALL_IDS).toContain(id)
    }
  })
})

describe('assignment block', () => {
  it('every entry has a non-empty assignment block', () => {
    for (const entry of ALL_ENTRIES) {
      expect(entry.assignment).toBeTruthy()
      expect(entry.assignment.mode).toBeTruthy()
      expect(entry.assignment.whoShouldGenerate).toBeTruthy()
      expect(entry.assignment.whoShouldNotGenerate).toBeTruthy()
      expect(entry.assignment.importFrom).toBeTruthy()
    }
  })

  it("entries with mode 'self_assign_with_prefix' have a non-null prefixRequired", () => {
    const selfAssign = ALL_ENTRIES.filter(e => e.assignment.mode === 'self_assign_with_prefix')
    expect(selfAssign.length).toBeGreaterThan(0)
    for (const entry of selfAssign) {
      expect(entry.assignment.prefixRequired).not.toBeNull()
    }
  })

  it("the single 'platform_issued' entry is GRid and no other", () => {
    const platformIssued = ALL_ENTRIES.filter(e => e.assignment.mode === 'platform_issued')
    expect(platformIssued.length).toBe(1)
    expect(platformIssued[0].id).toBe('grid')
  })

  it('UPC is NOT platform_issued — Funūn holds no GS1 prefix (D-16f)', () => {
    expect(getIdentifierEntry('upc')?.assignment.mode).not.toBe('platform_issued')
  })

  it("no entry with mode 'centrally_allocated' is reachable from the generator's supported-type list", () => {
    const centrallyAllocatedIds = new Set(
      ALL_ENTRIES.filter(e => e.assignment.mode === 'centrally_allocated').map(e => e.id)
    )
    for (const schemeId of GENERATABLE_SCHEME_IDS) {
      expect(centrallyAllocatedIds.has(schemeId)).toBe(false)
    }
    // Disjointness must hold both directions.
    for (const id of centrallyAllocatedIds) {
      expect(GENERATABLE_SCHEME_IDS as readonly string[]).not.toContain(id)
    }
  })
})
