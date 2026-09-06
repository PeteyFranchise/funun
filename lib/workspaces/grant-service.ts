import type { SupabaseClient } from '@supabase/supabase-js'
import {
  WORKSPACE_PERMISSION_VALUES,
  isStructurallyExcludedCapability,
  type WorkspacePermission,
} from '@/lib/workspaces/permissions'
import {
  assertGrantIsIssuable,
  filterGrantableByAuthority,
  type GrantIssuanceResult,
} from '@/lib/workspaces/grants'
import { isWorkspaceAccessLive } from '@/lib/workspaces/roster'
import { loadRelationshipTier } from '@/lib/workspaces/roster-service'
import type { RosterRelationshipState, WorkspaceAuthorityTier } from '@/lib/workspaces/types'

// ─── The use-time authority (D-49, D-16, D-21, D-39, custody D-01/D-09) ────
//
// (1) THIS MODULE IS THE ONE USE-TIME AUTHORITY. No surface anywhere in this
// codebase may read `workspace_grants` directly to decide whether a
// permission is currently held — every consumer (the workspace catalogue,
// the Appears-on shelf, this plan's own grants route) must call
// `resolveEffectivePermissions` or `assertMayExercise` instead. A grant row
// existing and being unrevoked is necessary but never sufficient; only this
// module's re-derivation decides sufficiency.
//
// (2) NOTHING IS CACHED, BY DESIGN. `resolveEffectivePermissions` performs a
// full re-derivation — live membership, live relationship, live evidence
// tier, live grant rows — on every single call. A module-level cache, a
// request-scoped memo, or any structure that lets a second call within the
// same process reuse a first call's result would silently reintroduce
// exactly the failure D-49 exists to prevent: a grant that keeps working
// after the granter's own access or the underlying relationship has been
// reduced. Do not add one, even for a hot path.
//
// (3) THE RESOLVER RETURNS PERMISSION NAMES ONLY. It never resolves, signs,
// or returns a storage path or URL of any kind, and never imports a storage
// or signed-URL helper. This is deliberate: a use-time authority that also
// knew how to mint a signed URL would become the general path-signing
// accessor that custody D-09 forbids ("no grant may become a shortcut
// around the existing narrow, asset-class-specific accessors").
//
// (4) CLEAN-MASTER ACCESS THROUGH A GRANT STILL ONLY AUTHORISES THE SAME
// NARROW ACCESSOR. `access_clean_masters` appearing in the set this module
// returns means the caller is entitled to ask the existing, non-workspace
// clean-master accessor for a file — it is not itself that accessor, and it
// never widens what that accessor will hand back (custody D-01, D-09).

const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set(WORKSPACE_PERMISSION_VALUES)

function isKnownWorkspacePermission(value: string): value is WorkspacePermission {
  return KNOWN_PERMISSIONS.has(value)
}

const EMPTY_PERMISSIONS: ReadonlySet<WorkspacePermission> = new Set()

type WorkspaceMembershipRow = { status: string }
type RosterRelationshipRow = {
  id: string
  state: RosterRelationshipState
  effective_from: string | null
  terminates_on: string | null
}
type WorkspaceGrantRow = { permission: string; project_id: string | null }

/**
 * The single use-time authority (D-49's second, harder clause). Re-derives,
 * on every call and from nothing but live rows: an active workspace
 * membership for `actorUserId`, a live roster relationship between the
 * workspace and `subjectMemberId`, that relationship's current authority
 * tier, and the unrevoked grant rows attached to it — then narrows those
 * grants to the requested project and drops any authority-tier permission
 * the current tier does not support. Returns an empty set at the first
 * failing step; never throws.
 */
export async function resolveEffectivePermissions(
  supabase: SupabaseClient,
  args: {
    workspaceId: string
    actorUserId: string
    subjectMemberId: string
    projectId?: string | null
    now?: number
  }
): Promise<ReadonlySet<WorkspacePermission>> {
  const { workspaceId, actorUserId, subjectMemberId, now } = args
  const projectId = args.projectId ?? null

  // Step 1: the actor must hold a currently active membership in the
  // workspace. A missing row, a lookup error, or any non-'active' status
  // all fail closed to an empty set.
  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('status')
    .eq('workspace_id', workspaceId)
    .eq('user_id', actorUserId)
    .maybeSingle()

  if (membershipError) return EMPTY_PERMISSIONS
  const membershipRow = membership as WorkspaceMembershipRow | null
  if (!membershipRow || membershipRow.status !== 'active') return EMPTY_PERMISSIONS

  // Step 2: the roster relationship this grant set attaches to must be
  // live right now — a grant cannot outlive the relationship it depends on,
  // even when its own row is unrevoked (D-49).
  const { data: relationship, error: relationshipError } = await supabase
    .from('workspace_roster_relationships')
    .select('id, state, effective_from, terminates_on')
    .eq('workspace_id', workspaceId)
    .eq('member_user_id', subjectMemberId)
    .in('state', ['proposed', 'accepted'])
    .maybeSingle()

  if (relationshipError) return EMPTY_PERMISSIONS
  const relationshipRow = relationship as RosterRelationshipRow | null
  if (!relationshipRow) return EMPTY_PERMISSIONS

  const live = isWorkspaceAccessLive({
    state: relationshipRow.state,
    effectiveFrom: relationshipRow.effective_from,
    effectiveEnd: relationshipRow.terminates_on,
    now,
  })
  if (!live) return EMPTY_PERMISSIONS

  // Step 3: the relationship's authority tier, recomputed from live
  // evidence on this call — never a stored column (D-16, D-39).
  const tierResult = await loadRelationshipTier(supabase, {
    relationshipId: relationshipRow.id,
    state: relationshipRow.state,
    now,
  })
  if (!tierResult.ok) return EMPTY_PERMISSIONS

  // Step 4: unrevoked grant rows for this exact relationship.
  const { data: grantRows, error: grantError } = await supabase
    .from('workspace_grants')
    .select('permission, project_id')
    .eq('workspace_id', workspaceId)
    .eq('relationship_id', relationshipRow.id)
    .is('revoked_at', null)

  if (grantError) return EMPTY_PERMISSIONS

  const applicable = ((grantRows ?? []) as WorkspaceGrantRow[]).filter(
    (row) => row.project_id === null || row.project_id === projectId
  )

  const requested = new Set<WorkspacePermission>()
  for (const row of applicable) {
    if (isKnownWorkspacePermission(row.permission)) requested.add(row.permission)
  }

  // Step 5: drop any authority-tier permission the current tier does not
  // support. `filterGrantableByAuthority` is the one implementation of this
  // rule (plan 38-01); this module never re-implements it.
  return new Set(filterGrantableByAuthority(requested, tierResult.tier))
}

export type ExerciseResult =
  | { ok: true; permission: WorkspacePermission }
  | { ok: false; status: 403; error: string }

/**
 * Refuses before any query when `permission` is not a recognized
 * `WorkspacePermission` or is a structurally excluded capability name
 * (D-42) — a raw string can never buy its way past this check regardless of
 * what any grant row happens to store. Otherwise re-derives the effective
 * set via `resolveEffectivePermissions` and succeeds only when it is
 * present.
 */
export async function assertMayExercise(
  supabase: SupabaseClient,
  args: {
    workspaceId: string
    actorUserId: string
    subjectMemberId: string
    projectId?: string | null
    permission: string
    now?: number
  }
): Promise<ExerciseResult> {
  const { permission } = args

  if (isStructurallyExcludedCapability(permission)) {
    return {
      ok: false,
      status: 403,
      error: `"${permission}" is structurally excluded and can never be exercised (D-42)`,
    }
  }

  if (!isKnownWorkspacePermission(permission)) {
    return { ok: false, status: 403, error: `"${permission}" is not a recognized workspace permission` }
  }

  const effective = await resolveEffectivePermissions(supabase, args)
  if (!effective.has(permission)) {
    return {
      ok: false,
      status: 403,
      error: `This workspace does not currently hold "${permission}" for this Member`,
    }
  }

  return { ok: true, permission }
}

/**
 * The grant-time half of D-49. Resolves the granter's own effective set
 * (via `resolveEffectivePermissions`, scoped to the same workspace/
 * subject/project) and the relationship's current authority tier, then
 * delegates the subset-and-tier decision entirely to
 * `assertGrantIsIssuable` (plan 38-01) — this function never re-implements
 * that check.
 */
export async function assertGrantIssuable(
  supabase: SupabaseClient,
  args: {
    workspaceId: string
    granterUserId: string
    relationshipId: string
    subjectMemberId: string
    projectId?: string | null
    requested: readonly string[]
    now?: number
  }
): Promise<GrantIssuanceResult> {
  const granterHolds = await resolveEffectivePermissions(supabase, {
    workspaceId: args.workspaceId,
    actorUserId: args.granterUserId,
    subjectMemberId: args.subjectMemberId,
    projectId: args.projectId,
    now: args.now,
  })

  const { data: relationship, error: relationshipError } = await supabase
    .from('workspace_roster_relationships')
    .select('state')
    .eq('id', args.relationshipId)
    .eq('workspace_id', args.workspaceId)
    .maybeSingle()

  let relationshipTier: WorkspaceAuthorityTier = 'none'

  if (!relationshipError && relationship) {
    const tierResult = await loadRelationshipTier(supabase, {
      relationshipId: args.relationshipId,
      state: (relationship as { state: RosterRelationshipState }).state,
      now: args.now,
    })
    if (tierResult.ok) relationshipTier = tierResult.tier
  }

  return assertGrantIsIssuable({
    requested: new Set(args.requested),
    granterHolds,
    relationshipTier,
  })
}

// ─── Sensitive-use logging obligation (D-40) ────────────────────────────
// The three bundle-excluded permissions whose every exercise — not just
// every issuance — must produce a `logWorkspaceAction` row. Named here
// (rather than only in lib/workspaces/permissions.ts's bundle-exclusion
// set) because "must be logged on use" is a use-time obligation this
// module owns, distinct from "must not appear in a bundle" which
// permissions.ts owns.
export const SENSITIVE_USE_LOG_REQUIRED: ReadonlySet<WorkspacePermission> = new Set([
  'access_clean_masters',
  'view_private_rights_identifiers',
  'view_earnings',
])

export function mustLogUse(permission: WorkspacePermission): boolean {
  return SENSITIVE_USE_LOG_REQUIRED.has(permission)
}
