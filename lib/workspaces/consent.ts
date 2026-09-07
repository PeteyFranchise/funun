import {
  WORKSPACE_PERMISSION_VALUES,
  PERMISSION_TIER,
  isStructurallyExcludedCapability,
  type WorkspacePermission,
} from '@/lib/workspaces/permissions'
import type { RosterRelationshipState, WorkspaceAuthorityTier } from '@/lib/workspaces/types'

// ─── The Member-root consent assertion (R-01, D-21, finding F6) ──────────
// Pure, zero-I/O module — no Supabase client, no side effects (style
// precedent: lib/workspaces/grants.ts's shape: a `KNOWN_PERMISSIONS` set, a
// type guard, a tagged-union result, and an ordered fail-closed assertion
// function).
//
// THIS MODULE IS THE ROOT OF GRANT AUTHORITY. `assertGrantIsIssuable`
// (lib/workspaces/grants.ts) answers "may a granter relay a permission it
// already holds" — but that question has no answer for the very first
// grant on a relationship, because nothing holds anything yet. The subject
// Member is different: the relationship's `member_user_id` IS the rights
// holder for the operational permissions their own relationship concerns,
// and — once the relationship is document-supported — for the
// authority-tier permissions too. A Member consenting for the first time
// therefore needs no prior grant to point to; they hold the right they are
// consenting to by virtue of being the Member, not by virtue of an existing
// `workspace_grants` row.
//
// THIS MODULE MUST NEVER IMPORT `@/lib/workspaces/grant-service` AND MUST
// NEVER CALL `resolveEffectivePermissions`. Deriving the Member's own
// authority from existing grant rows is precisely the circular dependency
// that made the whole layer inert (finding F6): `assertGrantIssuable`
// computes `granterHolds` by calling `resolveEffectivePermissions`, whose
// Step 4 reads `workspace_grants` rows for the same relationship — with
// zero rows in existence, that set is always empty, and every possible
// first grant is refused forever. Consulting that resolver here, even
// indirectly, would reintroduce the exact deadlock this module exists to
// break. `lib/workspaces/consent.test.ts` asserts this module's own source
// text names no such import, mirroring how
// `__tests__/workspace-structural-exclusions.test.ts` asserts about
// application source elsewhere in this codebase.

const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set(WORKSPACE_PERMISSION_VALUES)

function isKnownPermission(value: string): value is WorkspacePermission {
  return KNOWN_PERMISSIONS.has(value)
}

// ─── Result shape ────────────────────────────────────────────────────────
// Same shape as lib/workspaces/grants.ts's `GrantIssuanceResult` — a Member
// consent and a workspace delegation are both, in the end, "a set of
// permissions became grantable or did not," and callers benefit from one
// shared narrowing pattern across both.
export type MemberConsentResult =
  | { ok: true; permissions: WorkspacePermission[] }
  | { ok: false; reason: string }

/**
 * The single gate a Member's own consent must pass before it may seed a
 * `source = 'member_consent'` grant row (R-01). Checks run in this fixed
 * order so the failure reason always names the specific problem:
 *
 *   1. identity — the consenting caller must be the relationship's named
 *      Member (Spoofing, T-38.0.1-03-04); this check lives here, first, so
 *      the calling route cannot forget it.
 *   2. relationship state — must be `accepted`; a proposed, refused,
 *      blocked or ended relationship confers nothing.
 *   3. non-empty request — a consent to nothing is not a consent.
 *   4. per requested value: recognized permission or excluded capability
 *      name — an unrecognised string is refused, naming it.
 *   5. structural exclusion (D-42) — checked before anything that could
 *      approve, so `manage_payouts`/`view_tax_information` can never slip
 *      through this path either.
 *   6. authority tier — an authority-tier permission is refused unless
 *      `relationshipTier` is `authority` (D-16, D-21).
 *
 * Deliberately has NO subset-of-existing-grants check of any kind — that
 * check is check 4 of `assertGrantIsIssuable` (lib/workspaces/grants.ts)
 * and does not apply to a root consent, which is what makes this the root
 * rather than a delegation. Never throws for any input, including `null`
 * and non-string members of the requested set (the requested type is
 * `ReadonlySet<string>`, so a caller cannot construct a set literal
 * containing `null` under strict TypeScript — the never-throw guarantee is
 * about defensive handling of unexpected string content, not runtime type
 * coercion of non-string values).
 */
export function assertMemberMayConsent(args: {
  requested: ReadonlySet<string>
  relationshipState: RosterRelationshipState
  relationshipMemberUserId: string
  consentingUserId: string
  relationshipTier: WorkspaceAuthorityTier
}): MemberConsentResult {
  const {
    requested,
    relationshipState,
    relationshipMemberUserId,
    consentingUserId,
    relationshipTier,
  } = args

  // ─── Check 1: identity (Spoofing, T-38.0.1-03-04) ──────────────────────
  if (consentingUserId !== relationshipMemberUserId) {
    return {
      ok: false,
      reason: 'only the relationship\'s named Member may consent to permissions on it',
    }
  }

  // ─── Check 2: relationship must be accepted ────────────────────────────
  if (relationshipState !== 'accepted') {
    return {
      ok: false,
      reason: `relationship state "${relationshipState}" is not accepted — consent requires an accepted relationship`,
    }
  }

  // ─── Check 3: non-empty request ────────────────────────────────────────
  if (requested.size === 0) {
    return { ok: false, reason: 'consent request is empty — a consent to nothing is not a consent' }
  }

  const permissions: WorkspacePermission[] = []

  for (const value of requested) {
    // ─── Check 4: recognized permission or known excluded capability ────
    if (!isKnownPermission(value) && !isStructurallyExcludedCapability(value)) {
      return { ok: false, reason: `"${value}" is not a recognized workspace permission` }
    }

    // ─── Check 5: structural exclusion (D-42) ────────────────────────────
    if (isStructurallyExcludedCapability(value)) {
      return {
        ok: false,
        reason: `"${value}" is structurally excluded and can never be consented to (D-42)`,
      }
    }

    const permission = value as WorkspacePermission

    // ─── Check 6: authority tier (D-16, D-21) ────────────────────────────
    if (PERMISSION_TIER[permission] === 'authority' && relationshipTier !== 'authority') {
      return {
        ok: false,
        reason: `"${permission}" is an authority-tier permission and requires a document-supported relationship`,
      }
    }

    permissions.push(permission)
  }

  return { ok: true, permissions }
}
