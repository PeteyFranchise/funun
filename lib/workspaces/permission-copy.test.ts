import { readFileSync } from 'fs'
import path from 'path'
import {
  AUTHORITY_TIER_TAG,
  describePermissionForMember,
  PERMISSION_PLAIN_COPY,
  SENSITIVE_PERMISSION_TAG,
  STRUCTURAL_EXCLUSION_FOOTNOTE,
} from '@/lib/workspaces/permission-copy'
import {
  isBundleExcluded,
  PERMISSION_TIER,
  STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES,
  WORKSPACE_PERMISSION_VALUES,
} from '@/lib/workspaces/permissions'

// ─── The Member-facing permission vocabulary (WSR-27, D-37, D-40, D-42) ───
// Written as iterations over WORKSPACE_PERMISSION_VALUES rather than a
// hardcoded name list, mirroring lib/workspaces/permissions.test.ts: the
// suite must fail the moment a permission joins the catalogue without a
// plain-language sentence, not silently render a Member a blank row.
//
// The source-text assertion below mirrors
// __tests__/workspace-structural-exclusions.test.ts's own readFileSync
// approach. This file is a .test.ts and is therefore NOT walked by that
// repository-level suite, which is exactly why the two excluded capability
// names may be probed from here without either literal ever appearing in
// application source — and they are imported from permissions.ts rather
// than restated, so the probe cannot drift from the real exclusion list.

const MODULE_PATH = path.join(process.cwd(), 'lib/workspaces/permission-copy.ts')
const MODULE_SOURCE = readFileSync(MODULE_PATH, 'utf8')

// A database slug as this codebase writes them: two or more lowercase
// words joined by underscores (view_metadata, access_clean_masters).
const SLUG_SHAPED = /\b[a-z]+(?:_[a-z]+)+\b/

const ALL_MEMBER_FACING_STRINGS = [
  ...Object.values(PERMISSION_PLAIN_COPY),
  AUTHORITY_TIER_TAG,
  SENSITIVE_PERMISSION_TAG,
  STRUCTURAL_EXCLUSION_FOOTNOTE,
]

describe('PERMISSION_PLAIN_COPY exhaustiveness', () => {
  it('has exactly one entry per catalogue permission and no extras', () => {
    expect(Object.keys(PERMISSION_PLAIN_COPY).sort()).toEqual(
      [...WORKSPACE_PERMISSION_VALUES].sort()
    )
  })

  it('gives every one of the nineteen permissions a non-empty sentence', () => {
    expect(WORKSPACE_PERMISSION_VALUES.length).toBe(19)
    for (const permission of WORKSPACE_PERMISSION_VALUES) {
      const copy = PERMISSION_PLAIN_COPY[permission]
      expect(typeof copy).toBe('string')
      expect({ permission, copy: copy.trim() }).toEqual({ permission, copy })
      expect(copy.length).toBeGreaterThan(0)
    }
  })

  it('never repeats a sentence across two permissions', () => {
    const copies = Object.values(PERMISSION_PLAIN_COPY)
    expect(new Set(copies).size).toBe(copies.length)
  })
})

describe('structural exclusion (D-42)', () => {
  it('names neither excluded capability as a key', () => {
    const keys = Object.keys(PERMISSION_PLAIN_COPY)
    const offending = STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES.filter((name) =>
      keys.includes(name)
    )
    expect(offending).toEqual([])
  })

  it('names neither excluded capability anywhere in the module source text', () => {
    const offending = STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES.filter((name) =>
      MODULE_SOURCE.includes(name)
    )
    expect(offending).toEqual([])
  })

  it('exports a page-bottom footnote that states the absence without naming a slug', () => {
    expect(STRUCTURAL_EXCLUSION_FOOTNOTE).toBe(
      "Payout and tax details are never part of any workspace request — there's no permission for it, here or anywhere in Funūn."
    )
    expect(SLUG_SHAPED.test(STRUCTURAL_EXCLUSION_FOOTNOTE)).toBe(false)
  })
})

describe('no Member ever reads a slug or an ops-facing label', () => {
  it.each(WORKSPACE_PERMISSION_VALUES)('%s copy contains no slug-shaped token', (permission) => {
    const copy = PERMISSION_PLAIN_COPY[permission]
    expect({ permission, slugFound: SLUG_SHAPED.test(copy) }).toEqual({
      permission,
      slugFound: false,
    })
  })

  it('no Member-facing string anywhere in this module is slug-shaped', () => {
    const offending = ALL_MEMBER_FACING_STRINGS.filter((value) => SLUG_SHAPED.test(value))
    expect(offending).toEqual([])
  })

  // D-37: a stored document is "attached" or "uploaded", never "verified" —
  // Funūn does not attest to the contents of a file somebody uploaded.
  it('no Member-facing string uses the word "verified" about a stored document', () => {
    const offending = ALL_MEMBER_FACING_STRINGS.filter((value) => /verified/i.test(value))
    expect(offending).toEqual([])
  })
})

describe('the two tag strings (UI-SPEC Copywriting Contract)', () => {
  it('exports the authority-tier tag verbatim', () => {
    expect(AUTHORITY_TIER_TAG).toBe('Needs a signed agreement')
  })

  it('exports the sensitive-permission tag verbatim', () => {
    expect(SENSITIVE_PERMISSION_TAG).toBe('Granted one at a time · every use logged')
  })
})

describe('describePermissionForMember', () => {
  it.each(WORKSPACE_PERMISSION_VALUES)('%s composes from the catalogue, never duplicates it', (permission) => {
    const described = describePermissionForMember(permission)
    expect(described).toEqual({
      permission,
      copy: PERMISSION_PLAIN_COPY[permission],
      tier: PERMISSION_TIER[permission],
      sensitive: isBundleExcluded(permission),
      tags: described.tags,
    })
  })

  it('returns the authority-tier tag for exactly the authority-tier permissions', () => {
    for (const permission of WORKSPACE_PERMISSION_VALUES) {
      const { tags } = describePermissionForMember(permission)
      expect({ permission, tagged: tags.includes(AUTHORITY_TIER_TAG) }).toEqual({
        permission,
        tagged: PERMISSION_TIER[permission] === 'authority',
      })
    }
  })

  it('returns the sensitive tag for exactly the three bundle-excluded permissions', () => {
    const tagged = WORKSPACE_PERMISSION_VALUES.filter((permission) =>
      describePermissionForMember(permission).tags.includes(SENSITIVE_PERMISSION_TAG)
    )
    expect([...tagged].sort()).toEqual(
      ['access_clean_masters', 'view_earnings', 'view_private_rights_identifiers'].sort()
    )
  })

  // The UI-SPEC designs no dual-tag row because no catalogue value is both
  // authority-tier and bundle-excluded. This asserts that premise rather
  // than assuming it — if a future permission is both, this fails and the
  // surface's visual contract has to be revisited before it ships.
  it('never returns both tags for the same permission', () => {
    const both = WORKSPACE_PERMISSION_VALUES.filter((permission) => {
      const { tags } = describePermissionForMember(permission)
      return tags.includes(AUTHORITY_TIER_TAG) && tags.includes(SENSITIVE_PERMISSION_TAG)
    })
    expect(both).toEqual([])
  })

  it('returns no tags for an ordinary operational permission', () => {
    expect(describePermissionForMember('view_metadata').tags).toEqual([])
  })

  it('never throws for any catalogue value', () => {
    for (const permission of WORKSPACE_PERMISSION_VALUES) {
      expect(() => describePermissionForMember(permission)).not.toThrow()
    }
  })
})
