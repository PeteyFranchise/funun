import {
  WORKSPACE_PERMISSION_VALUES,
  PERMISSION_TIER,
  PERMISSION_LABELS,
  WORKSPACE_PERMISSION_BUNDLES,
  STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES,
  isBundleExcluded,
  isStructurallyExcludedCapability,
  type WorkspacePermission,
} from '@/lib/workspaces/permissions'

// ─── Permission catalogue behavior contract ───────────────────────────────
// Written as iterations over the exported arrays rather than hardcoded name
// lists, so the suite fails the moment a permission is added without a
// tier, label, or bundle audit (mirrors lib/client-partners/health.ts's
// paired test convention).

const AUTHORITY_TIER_PERMISSIONS: readonly WorkspacePermission[] = [
  'request_signatures',
  'edit_rights_information',
  'approve_releases',
  'deliver_assets',
  'act_on_behalf',
]

const BUNDLE_EXCLUDED_PERMISSIONS: readonly WorkspacePermission[] = [
  'access_clean_masters',
  'view_private_rights_identifiers',
  'view_earnings',
]

describe('lib/workspaces/permissions catalogue', () => {
  it('holds exactly 19 grantable permissions', () => {
    expect(WORKSPACE_PERMISSION_VALUES.length).toBe(19)
  })

  it('has no duplicate permission literals', () => {
    expect(new Set(WORKSPACE_PERMISSION_VALUES).size).toBe(WORKSPACE_PERMISSION_VALUES.length)
  })
})

describe('lib/workspaces/permissions PERMISSION_TIER', () => {
  it('assigns authority tier to exactly the five authority permissions', () => {
    for (const permission of AUTHORITY_TIER_PERMISSIONS) {
      expect(PERMISSION_TIER[permission]).toBe('authority')
    }
  })

  it('assigns operational tier to every other catalogue permission', () => {
    for (const permission of WORKSPACE_PERMISSION_VALUES) {
      if ((AUTHORITY_TIER_PERMISSIONS as readonly string[]).includes(permission)) continue
      expect(PERMISSION_TIER[permission]).toBe('operational')
    }
  })

  it('has a tier entry for every member of WORKSPACE_PERMISSION_VALUES', () => {
    for (const permission of WORKSPACE_PERMISSION_VALUES) {
      expect(PERMISSION_TIER[permission]).toBeDefined()
    }
  })
})

describe('lib/workspaces/permissions PERMISSION_LABELS', () => {
  it('has a non-empty label for every member of WORKSPACE_PERMISSION_VALUES', () => {
    for (const permission of WORKSPACE_PERMISSION_VALUES) {
      expect(typeof PERMISSION_LABELS[permission]).toBe('string')
      expect(PERMISSION_LABELS[permission].length).toBeGreaterThan(0)
    }
  })
})

describe('lib/workspaces/permissions isBundleExcluded (D-40)', () => {
  it('is true for each of the three D-40 bundle-excluded permissions', () => {
    for (const permission of BUNDLE_EXCLUDED_PERMISSIONS) {
      expect(isBundleExcluded(permission)).toBe(true)
    }
  })

  it('is false for every non-excluded catalogue permission', () => {
    for (const permission of WORKSPACE_PERMISSION_VALUES) {
      if ((BUNDLE_EXCLUDED_PERMISSIONS as readonly string[]).includes(permission)) continue
      expect(isBundleExcluded(permission)).toBe(false)
    }
  })
})

describe('lib/workspaces/permissions WORKSPACE_PERMISSION_BUNDLES (D-19, D-40)', () => {
  it('never contains a bundle-excluded permission in any bundle', () => {
    for (const [bundleName, permissions] of Object.entries(WORKSPACE_PERMISSION_BUNDLES)) {
      for (const permission of permissions) {
        expect({ bundleName, permission, excluded: isBundleExcluded(permission) }).toEqual({
          bundleName,
          permission,
          excluded: false,
        })
      }
    }
  })

  it('only names permissions that are members of WORKSPACE_PERMISSION_VALUES', () => {
    const known = new Set<string>(WORKSPACE_PERMISSION_VALUES)
    for (const permissions of Object.values(WORKSPACE_PERMISSION_BUNDLES)) {
      for (const permission of permissions) {
        expect(known.has(permission)).toBe(true)
      }
    }
  })

  it('has at least one bundle', () => {
    expect(Object.keys(WORKSPACE_PERMISSION_BUNDLES).length).toBeGreaterThan(0)
  })
})

describe('lib/workspaces/permissions structural payout/tax exclusion (D-42)', () => {
  it('shares no member between STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES and WORKSPACE_PERMISSION_VALUES', () => {
    const grantable = new Set<string>(WORKSPACE_PERMISSION_VALUES)
    const intersection = STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES.filter((value) =>
      grantable.has(value)
    )
    expect(intersection).toEqual([])
  })

  it('isStructurallyExcludedCapability returns true for each excluded capability name', () => {
    for (const value of STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES) {
      expect(isStructurallyExcludedCapability(value)).toBe(true)
    }
  })

  it('isStructurallyExcludedCapability returns false for every catalogue permission', () => {
    for (const permission of WORKSPACE_PERMISSION_VALUES) {
      expect(isStructurallyExcludedCapability(permission)).toBe(false)
    }
  })
})
