// ─── Generalized identifier generator ────────────────────────────────
// The "prefix + counter + check digit" utility, generalized from the
// working ISRC precedent (lib/metadata/identifiers.ts's
// nextDesignation/currentIsrcYear/formatIsrc) to cover every
// self-assignable / platform-issued scheme (D-16e/D-16f):
//
//   • platform_issued        — 'grid' only: minted under Funūn's OWN
//                               issuer code, from a single GLOBAL counter
//                               shared across all artists (T-16-11-9).
//   • self_assign_with_prefix / no_authority — 'upc', 'catalog_number',
//                               'isrc': minted from a prefix on the
//                               ARTIST's own profile, from that artist's
//                               per-scheme counter.
//   • centrally_allocated     — everything else: NEVER generated. There
//                               is no force flag or override parameter —
//                               eligibility is structural, checked inside
//                               this module, not advisory UI copy
//                               (T-16-11-6).
//
// Pure functions throughout: generating never mutates its inputs; the
// caller (the API route) persists the returned counter/value state.

import {
  currentIsrcYear,
  formatIsrc,
  isValidCountry,
  isValidRegistrant,
  nextDesignation,
} from '@/lib/metadata/identifiers'
import { GENERATABLE_SCHEME_IDS, getIdentifierEntry } from '@/lib/metadata/identifier-guide'

export type GeneratableScheme = (typeof GENERATABLE_SCHEME_IDS)[number]

export type ArtistIdentifierProfile = {
  /** The artist's OWN GS1 company prefix. Funūn holds none of its own (D-16f). */
  gs1_company_prefix: string | null
  /** OPTIONAL artist/label-owned GRid issuer code — overrides the platform path when present. */
  grid_issuer_code: string | null
  /** The artist's own label/catalog prefix, e.g. "FUN". */
  catalog_number_prefix: string | null
  isrc_country_code: string | null
  isrc_registrant_code: string | null
}

export type ArtistIdentifierCounters = {
  /** Per-scheme sequential counters for the artist's own prefixes (upc, catalog_number, and an artist-owned grid override). */
  identifier_counters: Record<string, number>
  /** Per-year ISRC designation counters — unchanged shape from migration 007. */
  isrc_year_counters: Record<string, number>
}

export type PlatformIdentifierState = {
  /** Funūn's own registered GRid issuer code. NULL = generation unavailable (pre-registration state, by design). */
  grid_issuer_code: string | null
  /** The GLOBAL release-number counter every platform-issued GRid advances, shared across ALL artists. */
  grid_release_counter: number
}

export type EligibilityResult =
  | { eligible: true; source: 'platform' | 'artist'; usingPrefix: string }
  | { eligible: false; reason: string }

/**
 * Eligibility is checked here, not in the UI — no scheme outside
 * GENERATABLE_SCHEME_IDS is ever eligible, regardless of what a caller
 * supplies for profile/platformConfig (T-16-11-6). `scheme` is
 * deliberately typed as `string`, not the narrow GeneratableScheme union,
 * because this same guard must hold at runtime against unchecked network
 * input (the API route), not merely at compile time.
 */
export function canGenerate(
  scheme: string,
  profile: ArtistIdentifierProfile,
  platformConfig: PlatformIdentifierState
): EligibilityResult {
  if (!(GENERATABLE_SCHEME_IDS as readonly string[]).includes(scheme)) {
    const entry = getIdentifierEntry(scheme)
    const label = entry?.label ?? scheme
    const body = entry?.issuedBy ?? 'a central issuing body'
    return {
      eligible: false,
      reason: `${label} is centrally allocated by ${body} — Funūn never generates it.`,
    }
  }

  if (scheme === 'grid') {
    const artistCode = (profile.grid_issuer_code ?? '').trim()
    if (artistCode) return { eligible: true, source: 'artist', usingPrefix: artistCode }
    const platformCode = (platformConfig.grid_issuer_code ?? '').trim()
    if (platformCode) return { eligible: true, source: 'platform', usingPrefix: platformCode }
    return {
      eligible: false,
      reason:
        "Funūn has not yet registered a GRid issuer code, and you haven't added your own — GRid generation is unavailable until one is configured.",
    }
  }

  if (scheme === 'upc') {
    const prefix = (profile.gs1_company_prefix ?? '').trim()
    if (!prefix) {
      return {
        eligible: false,
        reason:
          "You don't have a GS1 company prefix on file, and Funūn does not issue UPCs — most independent artists get theirs free from their distributor at delivery.",
      }
    }
    return { eligible: true, source: 'artist', usingPrefix: prefix }
  }

  if (scheme === 'catalog_number') {
    const prefix = (profile.catalog_number_prefix ?? '').trim()
    if (!prefix) {
      return {
        eligible: false,
        reason: 'Set your own label/catalog prefix in settings before generating catalog numbers.',
      }
    }
    return { eligible: true, source: 'artist', usingPrefix: prefix }
  }

  // scheme === 'isrc'
  const country = profile.isrc_country_code ?? ''
  const registrant = profile.isrc_registrant_code ?? ''
  if (!isValidCountry(country) || !isValidRegistrant(registrant)) {
    return {
      eligible: false,
      reason: 'Set your ISRC country and registrant code in Settings before generating ISRCs.',
    }
  }
  return { eligible: true, source: 'artist', usingPrefix: `${country}${registrant}` }
}

// ─── UPC — GS1 mod-10 (weighted 3-1 alternating over 11 digits) ───────
/** GS1 check digit for the 11-digit UPC-A body (odd positions x3, even x1). */
export function upcCheckDigit(first11: string): number {
  if (!/^\d{11}$/.test(first11)) return -1
  let oddSum = 0
  let evenSum = 0
  for (let i = 0; i < 11; i++) {
    const digit = Number(first11[i])
    // i is 0-indexed; 1-indexed position = i+1. Odd positions (1,3,5,...) -> i even.
    if (i % 2 === 0) oddSum += digit
    else evenSum += digit
  }
  return (10 - ((oddSum * 3 + evenSum) % 10)) % 10
}

function buildUpc(prefix: string, itemRefCounter: number): string | null {
  const cleanPrefix = prefix.replace(/\D/g, '')
  if (!cleanPrefix || cleanPrefix.length > 11 || itemRefCounter < 0) return null
  const itemRefLen = 11 - cleanPrefix.length
  const itemRefStr = String(itemRefCounter)
  if (itemRefStr.length > itemRefLen) return null // exhausted — never truncate/wrap
  const first11 = cleanPrefix + itemRefStr.padStart(itemRefLen, '0')
  return first11 + String(upcCheckDigit(first11))
}

// ─── GRid — ISO/IEC 7064:1983 "pure system" MOD 37,36 ─────────────────
// Alphabet: 0-9 -> 0..9, A-Z -> 10..35 (36 symbols); '*' (value 36) is the
// exception character, never expected to appear in a well-formed GRid.
// NOT the same algorithm as UPC's mod-10 or ISWC's mod-10 check digit —
// this produces an ALPHANUMERIC check CHARACTER, verified against the
// published example A1-2425G-ABC1234002-M.
const MOD3736_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function mod3736Value(ch: string): number {
  const idx = MOD3736_ALPHABET.indexOf(ch)
  if (idx === -1) throw new Error(`Invalid MOD 37,36 character: ${ch}`)
  return idx
}

export function mod3736CheckChar(data: string): string {
  const M = 37
  let p = 36 // radix — the "pure system" MOD 37-36 initial product
  for (const ch of data.toUpperCase()) {
    const a = mod3736Value(ch)
    let s = (p + a) % M
    if (s === 0) s = M
    p = (s * 2) % M
  }
  const checkValue = (M - p) % M
  return checkValue < 36 ? MOD3736_ALPHABET[checkValue] : '*'
}

function buildGrid(issuerCode: string, releaseCounter: number): string | null {
  const code = issuerCode.toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (code.length !== 5 || releaseCounter < 0) return null
  const releaseNumberStr = String(releaseCounter)
  if (releaseNumberStr.length > 10) return null // exhausted — never truncate/wrap
  const releaseNumber = releaseNumberStr.padStart(10, '0')
  const body = `A1${code}${releaseNumber}`
  return `${body}${mod3736CheckChar(body)}`
}

// ─── Catalog number — no issuing body, prefix + zero-padded sequence ──
function buildCatalogNumber(prefix: string, counter: number): string {
  return `${prefix}-${String(counter).padStart(4, '0')}`
}

// ─── Generation result ─────────────────────────────────────────────────
export type GenerateSuccess = {
  ok: true
  scheme: GeneratableScheme
  value: string
  source: 'platform' | 'artist'
  /** New artist counters — only the minted scheme's counter changes; siblings pass through untouched. */
  nextArtistCounters: ArtistIdentifierCounters
  /** New platform state — only changes for a platform-issued GRid mint; otherwise passes through untouched. */
  nextPlatformState: PlatformIdentifierState
}
export type GenerateFailure = { ok: false; reason: string }
export type GenerateResult = GenerateSuccess | GenerateFailure

/**
 * Mint the next code for `scheme`. Eligibility (canGenerate) is re-checked
 * HERE, unconditionally — there is no force flag, no override parameter,
 * and no "generate anyway" path; a caller cannot opt out (T-16-11-5,
 * T-16-11-6). `existingValue` is the target's CURRENT value for this
 * scheme (project.grid, project.upc, project.catalog_number, or
 * track.isrc) — when non-null, generation is refused outright: one
 * release/track, one code, whatever its provenance (T-16-11-10, and the
 * same "don't double-mint over an existing value" invariant the original
 * ISRC route already enforced).
 *
 * Pure: never mutates `profile`, `counters`, or `platformState` — every
 * returned object is a fresh copy. The caller persists the result.
 */
export function generateIdentifier(
  scheme: string,
  profile: ArtistIdentifierProfile,
  counters: ArtistIdentifierCounters,
  platformState: PlatformIdentifierState,
  existingValue: string | null = null
): GenerateResult {
  if (existingValue) {
    return { ok: false, reason: 'This identifier is already set — clear it first to mint a new one.' }
  }

  const eligibility = canGenerate(scheme, profile, platformState)
  if (!eligibility.eligible) return { ok: false, reason: eligibility.reason }

  if (scheme === 'grid') {
    if (eligibility.source === 'platform') {
      const nextCounter = platformState.grid_release_counter + 1
      const value = buildGrid(eligibility.usingPrefix, nextCounter)
      if (!value) return { ok: false, reason: 'The platform GRid release-number space is exhausted.' }
      return {
        ok: true,
        scheme: 'grid',
        value,
        source: 'platform',
        nextArtistCounters: counters,
        nextPlatformState: { ...platformState, grid_release_counter: nextCounter },
      }
    }
    // Artist-owned issuer code override — draws from the ARTIST's counter,
    // never the platform's global one (the collision this module exists
    // to prevent).
    const last = Number(counters.identifier_counters.grid ?? 0)
    const nextCounter = (Number.isFinite(last) ? last : 0) + 1
    const value = buildGrid(eligibility.usingPrefix, nextCounter)
    if (!value) return { ok: false, reason: 'Your GRid release-number space is exhausted.' }
    return {
      ok: true,
      scheme: 'grid',
      value,
      source: 'artist',
      nextArtistCounters: {
        ...counters,
        identifier_counters: { ...counters.identifier_counters, grid: nextCounter },
      },
      nextPlatformState: platformState,
    }
  }

  if (scheme === 'upc') {
    const last = Number(counters.identifier_counters.upc ?? 0)
    const nextCounter = (Number.isFinite(last) ? last : 0) + 1
    const value = buildUpc(eligibility.usingPrefix, nextCounter)
    if (!value) return { ok: false, reason: 'Your UPC item-reference space is exhausted for this prefix.' }
    return {
      ok: true,
      scheme: 'upc',
      value,
      source: 'artist',
      nextArtistCounters: {
        ...counters,
        identifier_counters: { ...counters.identifier_counters, upc: nextCounter },
      },
      nextPlatformState: platformState,
    }
  }

  if (scheme === 'catalog_number') {
    const last = Number(counters.identifier_counters.catalog_number ?? 0)
    const nextCounter = (Number.isFinite(last) ? last : 0) + 1
    const value = buildCatalogNumber(eligibility.usingPrefix, nextCounter)
    return {
      ok: true,
      scheme: 'catalog_number',
      value,
      source: 'artist',
      nextArtistCounters: {
        ...counters,
        identifier_counters: { ...counters.identifier_counters, catalog_number: nextCounter },
      },
      nextPlatformState: platformState,
    }
  }

  // scheme === 'isrc' — mirrors identifiers.ts's existing, working
  // precedent exactly (currentIsrcYear/nextDesignation/formatIsrc); output
  // format is unchanged from the dedicated ISRC route.
  const year = currentIsrcYear()
  const designation = nextDesignation(counters.isrc_year_counters, year)
  if (designation == null) {
    return { ok: false, reason: `You've issued all 99,999 ISRCs for 20${year}. Wait for the next year.` }
  }
  const country = profile.isrc_country_code ?? ''
  const registrant = profile.isrc_registrant_code ?? ''
  const value = formatIsrc(country, registrant, year, designation)
  return {
    ok: true,
    scheme: 'isrc',
    value,
    source: 'artist',
    nextArtistCounters: {
      ...counters,
      isrc_year_counters: { ...counters.isrc_year_counters, [year]: designation },
    },
    nextPlatformState: platformState,
  }
}
