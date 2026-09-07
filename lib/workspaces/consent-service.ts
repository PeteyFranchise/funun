import type { SupabaseClient } from '@supabase/supabase-js'
import {
  WORKSPACE_PERMISSION_VALUES,
  type WorkspacePermission,
} from '@/lib/workspaces/permissions'
import { assertMemberMayConsent } from '@/lib/workspaces/consent'
import { MEMBER_CONSENT_SOURCE } from '@/lib/workspaces/grant-lineage'
import { loadRelationshipTier } from '@/lib/workspaces/roster-service'
import type { RosterRelationshipState } from '@/lib/workspaces/types'

// ─── The Member-root consent writer (R-01, D-21, D-49, finding F6) ────────
// I/O composition over the pure `lib/workspaces/consent.ts` assertion,
// mirroring `lib/workspaces/roster-service.ts`'s house shape: fetch the
// row, call the pure assertion, mutate, return a tagged union, never throw.
//
// THIS MODULE IS THE ONLY WRITER OF A `source = 'member_consent'` ROW IN
// THE CODEBASE. Migration 191's REVOKE (restated from migrations 182-185)
// leaves no client write path onto `workspace_grants` — the write here is
// service-role, and the Member's identity is proven by the caller (the
// consent route, plan 08) BEFORE this module runs, then RE-CHECKED inside
// `assertMemberMayConsent` — two enforcement points, as this codebase does
// everywhere else (D-49, migration 187's header doctrine). A caller who
// skips its own gate still cannot reach a write here under someone else's
// identity.
//
// No free-form request body reaches this module — every input is an
// already-typed function parameter, not a raw object — so there is no
// caller-supplied key to filter the way `pickContactFields`/
// `pickRosterFields` do. The equivalent discipline here is that every
// inserted row is built by NAMING each column explicitly, never by
// spreading an object, so a future edit cannot smuggle an extra column
// through this writer (T-38.0.1-06-04).

const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set(WORKSPACE_PERMISSION_VALUES)

function isKnownWorkspacePermission(value: string): value is WorkspacePermission {
  return KNOWN_PERMISSIONS.has(value)
}

export type ConsentServiceResult =
  | { ok: true; permissions: WorkspacePermission[] }
  | { ok: false; status: 400 | 403 | 404 | 500; error: string }

type RelationshipRow = {
  id: string
  workspace_id: string
  member_user_id: string
  state: RosterRelationshipState
}

type ExistingGrantRow = { permission: string }

async function loadRelationship(
  service: SupabaseClient,
  args: { workspaceId: string; relationshipId: string }
): Promise<{ ok: true; row: RelationshipRow } | { ok: false; status: 404 | 500; error: string }> {
  const { data, error } = await service
    .from('workspace_roster_relationships')
    .select('id, workspace_id, member_user_id, state')
    .eq('id', args.relationshipId)
    .eq('workspace_id', args.workspaceId)
    .maybeSingle()

  if (error) {
    return { ok: false, status: 500, error: 'Could not load the roster relationship.' }
  }

  const row = data as RelationshipRow | null
  if (!row) {
    return { ok: false, status: 404, error: 'Roster relationship not found.' }
  }

  return { ok: true, row }
}

/**
 * Seeds or extends a relationship's Member consent root (R-01, F6): the
 * one kind of grant that needs no prior grant to point to, because the
 * subject Member IS the rights holder for what they are consenting to.
 * Sequence: load the relationship; resolve its authority tier; call
 * `assertMemberMayConsent` with the loaded facts (identity, state,
 * requested set, tier) — a refusal there means NOTHING is written for any
 * permission in the request (all-or-nothing), and the reason names the
 * specific problem. On approval, reads the relationship's existing live
 * member-consent rows to skip duplicates (re-consenting to an already-live
 * permission is a no-op success, not a duplicate row), then inserts one
 * row per remaining permission with `source = MEMBER_CONSENT_SOURCE` and
 * `parent_grant_id = null`. Returns the permissions newly written by THIS
 * call. Never throws.
 */
export async function issueMemberConsent(
  service: SupabaseClient,
  args: {
    workspaceId: string
    relationshipId: string
    consentingUserId: string
    requested: readonly string[]
    projectId?: string | null
    now?: number
  }
): Promise<ConsentServiceResult> {
  const projectId = args.projectId ?? null

  const relationship = await loadRelationship(service, args)
  if (!relationship.ok) return relationship

  const tierResult = await loadRelationshipTier(service, {
    relationshipId: relationship.row.id,
    state: relationship.row.state,
    now: args.now,
  })
  if (!tierResult.ok) {
    return { ok: false, status: 500, error: 'Could not resolve the relationship authority tier.' }
  }

  const consent = assertMemberMayConsent({
    requested: new Set(args.requested),
    relationshipState: relationship.row.state,
    relationshipMemberUserId: relationship.row.member_user_id,
    consentingUserId: args.consentingUserId,
    relationshipTier: tierResult.tier,
  })

  if (!consent.ok) {
    return { ok: false, status: 403, error: consent.reason }
  }

  // Skip permissions already live as a member-consent row for this
  // relationship/project scope — re-consenting is a no-op success, never a
  // duplicate row.
  const { data: existingRows, error: existingError } = await service
    .from('workspace_grants')
    .select('permission')
    .eq('workspace_id', args.workspaceId)
    .eq('relationship_id', relationship.row.id)
    .eq('source', MEMBER_CONSENT_SOURCE)
    .is('revoked_at', null)

  if (existingError) {
    return { ok: false, status: 500, error: 'Could not check existing consent rows.' }
  }

  const existing = new Set(((existingRows ?? []) as ExistingGrantRow[]).map((row) => row.permission))
  const toInsert = consent.permissions.filter((permission) => !existing.has(permission))

  for (const permission of toInsert) {
    const { error: insertError } = await service.from('workspace_grants').insert({
      workspace_id: args.workspaceId,
      relationship_id: relationship.row.id,
      project_id: projectId,
      permission,
      source: MEMBER_CONSENT_SOURCE,
      parent_grant_id: null,
      granted_by: args.consentingUserId,
    })

    // The partial unique index (workspace_id, relationship_id, project_id,
    // permission WHERE revoked_at IS NULL) — same index the grants route
    // relies on — makes a race against a concurrent identical insert an
    // idempotent no-op rather than an error.
    if (insertError && insertError.code !== '23505') {
      return { ok: false, status: 500, error: insertError.message }
    }
  }

  return { ok: true, permissions: toInsert }
}

/**
 * Revokes permissions from a relationship's Member consent root. Refuses a
 * caller who is not the relationship's own `member_user_id`, before any
 * write. Sets `revoked_at`/`revoked_by` on the matching live member-consent
 * rows — NEVER deletes a row, preserving the history of what was held and
 * when (T-38.0.1-06-06). Revoking a root implicitly kills every delegated
 * descendant at the next read, because `isGrantChainLive`
 * (`lib/workspaces/grant-lineage.ts`, consumed by
 * `lib/workspaces/grant-lineage-service.ts`) refuses a chain with any
 * revoked ancestor — there is no cascade job and none is needed (D-49).
 * Never throws.
 */
export async function revokeMemberConsent(
  service: SupabaseClient,
  args: {
    workspaceId: string
    relationshipId: string
    consentingUserId: string
    permissions: readonly string[]
    now?: number
  }
): Promise<ConsentServiceResult> {
  const relationship = await loadRelationship(service, args)
  if (!relationship.ok) return relationship

  if (args.consentingUserId !== relationship.row.member_user_id) {
    return {
      ok: false,
      status: 403,
      error: "only the relationship's named Member may revoke their own consent",
    }
  }

  if (args.permissions.length === 0) {
    return { ok: false, status: 400, error: 'revoke request is empty — nothing to revoke' }
  }

  const revokedAt = new Date(args.now ?? Date.now()).toISOString()
  const revoked: WorkspacePermission[] = []

  for (const permission of args.permissions) {
    const { data: updated, error: updateError } = await service
      .from('workspace_grants')
      .update({ revoked_at: revokedAt, revoked_by: args.consentingUserId })
      .eq('workspace_id', args.workspaceId)
      .eq('relationship_id', relationship.row.id)
      .eq('source', MEMBER_CONSENT_SOURCE)
      .eq('permission', permission)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle()

    if (updateError) {
      return { ok: false, status: 500, error: updateError.message }
    }

    if (updated && isKnownWorkspacePermission(permission)) {
      revoked.push(permission)
    }
  }

  return { ok: true, permissions: revoked }
}
