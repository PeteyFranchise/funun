import {
  canGenerate,
  generateIdentifier,
  upcCheckDigit,
  mod3736CheckChar,
  type ArtistIdentifierProfile,
  type ArtistIdentifierCounters,
  type PlatformIdentifierState,
} from './generate'
import { isValidUpc } from './validate'
import { GENERATABLE_SCHEME_IDS, IDENTIFIER_GUIDE } from './identifier-guide'

function profile(overrides: Partial<ArtistIdentifierProfile> = {}): ArtistIdentifierProfile {
  return {
    gs1_company_prefix: null,
    grid_issuer_code: null,
    catalog_number_prefix: null,
    isrc_country_code: null,
    isrc_registrant_code: null,
    ...overrides,
  }
}

function counters(overrides: Partial<ArtistIdentifierCounters> = {}): ArtistIdentifierCounters {
  return {
    identifier_counters: {},
    isrc_year_counters: {},
    ...overrides,
  }
}

function platformState(overrides: Partial<PlatformIdentifierState> = {}): PlatformIdentifierState {
  return {
    grid_issuer_code: null,
    grid_release_counter: 0,
    ...overrides,
  }
}

const CENTRALLY_ALLOCATED_IDS = Object.values(IDENTIFIER_GUIDE)
  .filter(e => e.assignment.mode === 'centrally_allocated')
  .map(e => e.id)

describe('canGenerate — centrally-allocated schemes are ALWAYS refused', () => {
  it('refuses every centrally-allocated scheme even with a fully populated profile/platform config', () => {
    const fullProfile = profile({
      gs1_company_prefix: '060123',
      grid_issuer_code: 'ABCDE',
      catalog_number_prefix: 'FUN',
      isrc_country_code: 'US',
      isrc_registrant_code: 'S1Z',
    })
    const fullPlatform = platformState({ grid_issuer_code: '2425G', grid_release_counter: 100 })
    for (const id of CENTRALLY_ALLOCATED_IDS) {
      const result = canGenerate(id, fullProfile, fullPlatform)
      expect(result.eligible).toBe(false)
      if (!result.eligible) expect(result.reason).toBeTruthy()
    }
  })

  it('the centrally-allocated set and GENERATABLE_SCHEME_IDS are disjoint', () => {
    for (const id of CENTRALLY_ALLOCATED_IDS) {
      expect(GENERATABLE_SCHEME_IDS as readonly string[]).not.toContain(id)
    }
  })
})

describe('canGenerate — grid (platform_issued, D-16f)', () => {
  it('is eligible from the platform config when Funūn has a registered issuer code', () => {
    const result = canGenerate('grid', profile(), platformState({ grid_issuer_code: '2425G' }))
    expect(result.eligible).toBe(true)
    if (result.eligible) expect(result.source).toBe('platform')
  })

  it('is NOT eligible when neither the platform nor the artist has an issuer code', () => {
    const result = canGenerate('grid', profile(), platformState({ grid_issuer_code: null }))
    expect(result.eligible).toBe(false)
  })

  it("prefers the artist's own issuer code when present, overriding the platform path", () => {
    const result = canGenerate(
      'grid',
      profile({ grid_issuer_code: 'LABEL' }),
      platformState({ grid_issuer_code: '2425G' })
    )
    expect(result.eligible).toBe(true)
    if (result.eligible) expect(result.source).toBe('artist')
  })

  it('never depends on an artist-held GRid prefix when the platform path is available', () => {
    const result = canGenerate('grid', profile({ grid_issuer_code: null }), platformState({ grid_issuer_code: '2425G' }))
    expect(result.eligible).toBe(true)
  })
})

describe('canGenerate — upc (self_assign_with_prefix, artist-only per D-16f)', () => {
  it('is NOT eligible without a gs1_company_prefix, and the reason states Funūn does not issue UPCs', () => {
    const result = canGenerate('upc', profile(), platformState())
    expect(result.eligible).toBe(false)
    if (!result.eligible) {
      expect(result.reason.toLowerCase()).toMatch(/gs1|prefix/)
      expect(result.reason.toLowerCase()).toMatch(/does not issue|not issue/)
    }
  })

  it('is eligible with a gs1_company_prefix on file', () => {
    const result = canGenerate('upc', profile({ gs1_company_prefix: '060123' }), platformState())
    expect(result.eligible).toBe(true)
  })

  it('is never eligible via the platform config alone — Funūn holds no GS1 prefix', () => {
    const result = canGenerate('upc', profile(), platformState({ grid_issuer_code: '2425G' }))
    expect(result.eligible).toBe(false)
  })
})

describe('canGenerate — catalog_number (no_authority, artist prefix)', () => {
  it('is not eligible with no catalog_number_prefix', () => {
    const result = canGenerate('catalog_number', profile(), platformState())
    expect(result.eligible).toBe(false)
  })

  it('is eligible with a catalog_number_prefix on file', () => {
    const result = canGenerate('catalog_number', profile({ catalog_number_prefix: 'FUN' }), platformState())
    expect(result.eligible).toBe(true)
  })
})

describe('canGenerate — isrc (self_assign_with_prefix)', () => {
  it('is not eligible without a valid country/registrant code', () => {
    expect(canGenerate('isrc', profile(), platformState()).eligible).toBe(false)
  })

  it('is eligible with a valid country + registrant code', () => {
    const result = canGenerate(
      'isrc',
      profile({ isrc_country_code: 'US', isrc_registrant_code: 'S1Z' }),
      platformState()
    )
    expect(result.eligible).toBe(true)
  })
})

describe('check digit algorithms', () => {
  it('upcCheckDigit computes the correct GS1 mod-10 check digit (published example)', () => {
    // 036000291452 is a real, published UPC-A (check-digit-valid).
    expect(upcCheckDigit('03600029145')).toBe(2)
  })

  it('mod3736CheckChar validates against the published GRid example A1-2425G-ABC1234002-M', () => {
    expect(mod3736CheckChar('A12425GABC1234002')).toBe('M')
  })

  it('UPC and GRid check digits use different, non-interchangeable algorithms', () => {
    // Feeding the same numeric body through both must not coincidentally agree.
    const upc = upcCheckDigit('03600029145')
    const grid = mod3736CheckChar('A103600029145000')
    expect(typeof upc).toBe('number')
    expect(typeof grid).toBe('string')
  })
})

describe('generateIdentifier — grid (platform-issued, global counter)', () => {
  it('mints an 18-character alphanumeric code with a valid ISO 7064 Mod 37,36 check character', () => {
    const result = generateIdentifier('grid', profile(), counters(), platformState({ grid_issuer_code: '2425G' }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      const compact = result.value.replace(/-/g, '')
      expect(compact).toHaveLength(18)
      expect(compact).toMatch(/^A1[0-9A-Z]{5}[0-9A-Z]{10}[0-9A-Z*]$/)
      const body = compact.slice(0, 17)
      const check = compact.slice(17)
      expect(mod3736CheckChar(body)).toBe(check)
    }
  })

  it('two sequential platform-issued mints yield distinct, non-decreasing release numbers (T-16-11-9)', () => {
    const startState = platformState({ grid_issuer_code: '2425G', grid_release_counter: 0 })
    const first = generateIdentifier('grid', profile(), counters(), startState)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = generateIdentifier('grid', profile(), counters(), first.nextPlatformState)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.value).not.toBe(first.value)
    expect(second.nextPlatformState.grid_release_counter).toBeGreaterThan(
      first.nextPlatformState.grid_release_counter - 1
    )
    expect(second.nextPlatformState.grid_release_counter).toBeGreaterThanOrEqual(
      first.nextPlatformState.grid_release_counter
    )
  })

  it('draws the release number from the GLOBAL platform counter, not a per-artist one, and leaves artist counters untouched', () => {
    const startCounters = counters({ identifier_counters: { grid: 999 } })
    const result = generateIdentifier(
      'grid',
      profile(),
      startCounters,
      platformState({ grid_issuer_code: '2425G', grid_release_counter: 5 })
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.nextPlatformState.grid_release_counter).toBe(6)
      // Artist's own counters (unrelated to the platform-issued path) must
      // be returned unchanged.
      expect(result.nextArtistCounters.identifier_counters.grid).toBe(999)
    }
  })

  it("uses the artist's own counter (not the platform counter) when the artist holds their own issuer code", () => {
    const result = generateIdentifier(
      'grid',
      profile({ grid_issuer_code: 'LABEL' }),
      counters({ identifier_counters: { grid: 3 } }),
      platformState({ grid_issuer_code: '2425G', grid_release_counter: 100 })
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('artist')
      expect(result.nextArtistCounters.identifier_counters.grid).toBe(4)
      // Platform's global counter must be untouched by an artist-owned mint.
      expect(result.nextPlatformState.grid_release_counter).toBe(100)
    }
  })

  it('refuses to mint when GRid generation is unavailable (no issuer code anywhere)', () => {
    const result = generateIdentifier('grid', profile(), counters(), platformState({ grid_issuer_code: null }))
    expect(result.ok).toBe(false)
  })

  it('refuses to mint a second GRid when the release already has one (distributor-GRid conflict rule, T-16-11-10)', () => {
    const result = generateIdentifier(
      'grid',
      profile(),
      counters(),
      platformState({ grid_issuer_code: '2425G' }),
      'A1-2425G-ABC1234002-M'
    )
    expect(result.ok).toBe(false)
  })
})

describe('generateIdentifier — upc', () => {
  it('produces a 12-digit GTIN that passes the mod-10 check and the existing isValidUpc()', () => {
    const result = generateIdentifier('upc', profile({ gs1_company_prefix: '060123' }), counters(), platformState())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatch(/^\d{12}$/)
      expect(isValidUpc(result.value)).toBe(true)
      const first11 = result.value.slice(0, 11)
      const check = Number(result.value[11])
      expect(upcCheckDigit(first11)).toBe(check)
    }
  })

  it('is structurally impossible without a gs1_company_prefix — no force flag exists', () => {
    const result = generateIdentifier('upc', profile(), counters(), platformState())
    expect(result.ok).toBe(false)
  })

  it('increments only the upc counter, leaving catalog_number and grid counters untouched', () => {
    const startCounters = counters({ identifier_counters: { upc: 0, catalog_number: 7, grid: 2 } })
    const result = generateIdentifier(
      'upc',
      profile({ gs1_company_prefix: '060123' }),
      startCounters,
      platformState()
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.nextArtistCounters.identifier_counters.upc).toBe(1)
      expect(result.nextArtistCounters.identifier_counters.catalog_number).toBe(7)
      expect(result.nextArtistCounters.identifier_counters.grid).toBe(2)
    }
  })
})

describe('generateIdentifier — catalog_number', () => {
  it('produces prefix + zero-padded sequence', () => {
    const result = generateIdentifier(
      'catalog_number',
      profile({ catalog_number_prefix: 'FUN' }),
      counters({ identifier_counters: { catalog_number: 6 } }),
      platformState()
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('FUN-0007')
  })
})

describe('generateIdentifier — isrc (unchanged output format)', () => {
  it('mints a formatted ISRC matching the existing formatIsrc() shape', () => {
    const result = generateIdentifier(
      'isrc',
      profile({ isrc_country_code: 'US', isrc_registrant_code: 'S1Z' }),
      counters({ isrc_year_counters: { '26': 13 } }),
      platformState()
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatch(/^US-S1Z-\d{2}-\d{5}$/)
      expect(result.nextArtistCounters.isrc_year_counters['26']).toBe(14)
    }
  })
})

describe('generateIdentifier — purity', () => {
  it('never mutates input arguments', () => {
    const inputCounters = counters({ identifier_counters: { catalog_number: 1 } })
    const inputPlatform = platformState({ grid_issuer_code: '2425G', grid_release_counter: 0 })
    const frozenCounters = JSON.parse(JSON.stringify(inputCounters))
    const frozenPlatform = JSON.parse(JSON.stringify(inputPlatform))

    generateIdentifier('catalog_number', profile({ catalog_number_prefix: 'FUN' }), inputCounters, inputPlatform)
    generateIdentifier('grid', profile(), inputCounters, inputPlatform)

    expect(inputCounters).toEqual(frozenCounters)
    expect(inputPlatform).toEqual(frozenPlatform)
  })
})

describe('generateIdentifier — exhaustion returns null/failure rather than wrapping or colliding', () => {
  it('refuses when the UPC item-reference space under the prefix is exhausted', () => {
    // 11-digit body budget with an 11-digit prefix leaves 0 digits for the
    // item reference — any counter > 0 must fail rather than truncate.
    const result = generateIdentifier(
      'upc',
      profile({ gs1_company_prefix: '06012345678' }),
      counters({ identifier_counters: { upc: 1 } }),
      platformState()
    )
    expect(result.ok).toBe(false)
  })

  it('refuses when the GRid release-number space (10 digits) is exhausted', () => {
    const result = generateIdentifier(
      'grid',
      profile(),
      counters(),
      platformState({ grid_issuer_code: '2425G', grid_release_counter: 9999999999 })
    )
    expect(result.ok).toBe(false)
  })
})
