import {
  WORKSPACE_PERMISSION_VALUES,
  PERMISSION_TIER,
  isStructurallyExcludedCapability,
  type WorkspacePermission,
} from '@/lib/workspaces/permissions'
import type { WorkspaceAuthorityTier } from '@/lib/workspaces/types'

// ─── Grant subset check — one function, both checkpoints (D-49) ─────────
// Pure, fail-closed, zero-I/O — mirrors lib/staff/scope.ts's shape exactly:
// takes already-fetched sets, no Supabase client, no throw. This module is
// the ONE place "is this a subset" is decided. It is called identically at
// grant time (plan 38-09's issuance route, before writing a workspace_grant
// row) and at use time (plan 38-09's re-check helper, before honoring an
// already-issued grant on a write). 38-RESEARCH.md's Don't Hand-Roll row
// flags exactly the failure mode this module exists to prevent: two
// independent implementations of "is this a subset" drifting apart is the
// duplication that produces the D-49 gap — a grant that outlives the
// granter's own access or relationship because the use-time check forgot a
// case the grant-time check remembered (or vice versa).

const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set(WORKSPACE_PERMISSION_VALUES)

function isKnownPermission(value: string): value is WorkspacePermission {
  return KNOWN_PERMISSIONS.has(value)
}

/**
 * True only when every requested permission is a recognized
 * WorkspacePermission AND is held by the granter. Accepts `string` on the
 * requested side so an unvalidated request-body value is rejected inside
 * this function rather than trusted by its type — an unrecognized string
 * (including a structurally excluded capability name like
 * `manage_payouts`) always fails closed. An empty request is refused too:
 * a grant of nothing is not a valid grant. Never throws.
 */
export function isSubsetGrant(
  requested: ReadonlySet<string>,
  granterHolds: ReadonlySet<WorkspacePermission>
): boolean {
  if (requested.size === 0) return false
  for (const value of requested) {
    if (!isKnownPermission(value)) return false
    if (!granterHolds.has(value)) return false
  }
  return true
}

/**
 * Removes authority-tier permissions from `requested` unless `tier` is
 * `authority` (D-16, D-21, D-39 — an authority permission is only issuable
 * while the relationship is document-supported). Operational-tier
 * permissions are always kept. Never throws.
 */
export function filterGrantableByAuthority(
  requested: ReadonlySet<WorkspacePermission>,
  tier: WorkspaceAuthorityTier
): WorkspacePermission[] {
  const kept: WorkspacePermission[] = []
  for (const permission of requested) {
    if (PERMISSION_TIER[permission] === 'authority' && tier !== 'authority') continue
    kept.push(permission)
  }
  return kept
}

export type GrantIssuanceResult =
  | { ok: true; permissions: WorkspacePermission[] }
  | { ok: false; reason: string }

/**
 * The single server-side gate a grant must pass before it may be issued
 * (and, called again with the same arguments, before an already-issued
 * grant may be honored at use time — D-49). Checks run in this order so
 * the failure reason always names the specific offending permission
 * (D-49: "refused otherwise, not hidden in UI") rather than a generic
 * message:
 *
 *   1. unknown value — not a recognized permission or excluded capability
 *   2. structural exclusion — a payout/tax capability name (D-42)
 *   3. authority tier — an authority permission without a document-
 *      supported relationship (D-16, D-21)
 *   4. granter subset — a permission the granter does not themselves hold
 *
 * Never throws.
 */
export function assertGrantIsIssuable(args: {
  requested: ReadonlySet<string>
  granterHolds: ReadonlySet<WorkspacePermission>
  relationshipTier: WorkspaceAuthorityTier
}): GrantIssuanceResult {
  const { requested, granterHolds, relationshipTier } = args

  if (requested.size === 0) {
    return { ok: false, reason: 'grant request is empty — a grant of nothing is not a valid grant' }
  }

  const permissions: WorkspacePermission[] = []

  for (const value of requested) {
    if (!isKnownPermission(value) && !isStructurallyExcludedCapability(value)) {
      return { ok: false, reason: `"${value}" is not a recognized workspace permission` }
    }

    if (isStructurallyExcludedCapability(value)) {
      return {
        ok: false,
        reason: `"${value}" is structurally excluded and can never be granted to a workspace (D-42)`,
      }
    }

    const permission = value as WorkspacePermission

    if (PERMISSION_TIER[permission] === 'authority' && relationshipTier !== 'authority') {
      return {
        ok: false,
        reason: `"${permission}" is an authority-tier permission and requires a document-supported relationship`,
      }
    }

    if (!granterHolds.has(permission)) {
      return { ok: false, reason: `"${permission}" exceeds what the granter holds` }
    }

    permissions.push(permission)
  }

  return { ok: true, permissions }
}
