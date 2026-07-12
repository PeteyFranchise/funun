// Wave 0 RED — Phase 9 (rich-member-profile). Defines the contract 09-01b's
// lib/profile/validate.ts must satisfy: sanitizeProfileRoles() (PROFILE-02)
// and filterOpenTo() (PROFILE-04). This module does not exist yet — these
// tests are expected to fail until 09-01b creates it.

import { sanitizeProfileRoles, filterOpenTo } from '@/lib/profile/validate'
import { OPEN_TO_VALUES } from '@/types'

// ─── sanitizeProfileRoles ──────────────────────────────────────────────────

describe('sanitizeProfileRoles', () => {
  it('accepts a valid preset role', () => {
    const input: unknown = [{ kind: 'preset', slug: 'artist' }]
    expect(sanitizeProfileRoles(input)).toEqual([{ kind: 'preset', slug: 'artist' }])
  })

  it('accepts a valid custom role', () => {
    const input: unknown = [{ kind: 'custom', label: 'Mixing engineer' }]
    expect(sanitizeProfileRoles(input)).toEqual([{ kind: 'custom', label: 'Mixing engineer' }])
  })

  it('rejects an unknown preset slug', () => {
    const input: unknown = [{ kind: 'preset', slug: 'astronaut' }]
    expect(sanitizeProfileRoles(input)).toEqual([])
  })

  it('rejects a custom entry with an empty label', () => {
    const input: unknown = [{ kind: 'custom', label: '' }]
    expect(sanitizeProfileRoles(input)).toEqual([])
  })

  it('rejects a custom entry with a 40+ character label', () => {
    const input: unknown = [{ kind: 'custom', label: 'x'.repeat(41) }]
    expect(sanitizeProfileRoles(input)).toEqual([])
  })

  it('returns an empty array for a non-array payload', () => {
    expect(sanitizeProfileRoles('not-an-array')).toEqual([])
    expect(sanitizeProfileRoles(null)).toEqual([])
    expect(sanitizeProfileRoles(undefined)).toEqual([])
  })
})

// ─── filterOpenTo ───────────────────────────────────────────────────────────

describe('filterOpenTo', () => {
  it('keeps only strings that are valid OpenTo enum values', () => {
    const input: unknown[] = [...OPEN_TO_VALUES, 'not-a-real-value', 42, null]
    expect(filterOpenTo(input)).toEqual(OPEN_TO_VALUES)
  })

  it('drops unknown enum strings', () => {
    expect(filterOpenTo(['sync', 'astral-projection'])).toEqual(['sync'])
  })
})
