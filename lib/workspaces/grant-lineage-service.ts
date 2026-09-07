import type { SupabaseClient } from '@supabase/supabase-js'
import {
  WORKSPACE_PERMISSION_VALUES,
  type WorkspacePermission,
} from '@/lib/workspaces/permissions'
import {
  isGrantChainLive,
  MEMBER_CONSENT_SOURCE,
  type GrantChainRow,
} from '@/lib/workspaces/grant-lineage'

// ─── The I/O half of the lineage walk (R-01, D-21, D-49, finding F6) ───────
// This module loads the already-fetched rows `lib/workspaces/grant-lineage.ts`'s
// pure `isGrantChainLive` needs, and hands the decision to that walker —
// it never re-implements "is this chain live" itself (style precedent:
// `lib/workspaces/roster-service.ts` wrapping `lib/workspaces/roster.ts`).
//
// NOTHING IS CACHED, BY DESIGN — the identical doctrine
// `lib/workspaces/grant-service.ts`'s header item (2) states for the
// use-time authority applies here to the lineage dimension specifically: a
// memoised chain result would let a revoked root keep authorising
// descendants past the moment of revocation, which is exactly the D-49
// failure this whole layer exists to prevent. `resolveLivePermissionsForRelationship`
// and `resolveConsentRootPermissions` both re-load the chain and re-walk it
// on every single call. Do not add a module-level or request-scoped cache
// here, even for a hot path.
//
// SQL TWIN. `public.workspace_grant_lineage_live` (migration 192) is the
// authoritative enforcement of this same decision at the RLS layer —
// `lib/workspaces/grant-lineage.ts`'s own header names it as this module's
// SQL-side counterpart. The two must be changed together: a change to
// which links count as "live" here without a matching SQL change would let
// the TypeScript-side and SQL-side authorities silently drift apart.

const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set(WORKSPACE_PERMISSION_VALUES)

function isKnownWorkspacePermission(value: string): value is WorkspacePermission {
  return KNOWN_PERMISSIONS.has(value)
}

const EMPTY_PERMISSIONS: ReadonlySet<WorkspacePermission> = new Set()

type WorkspaceGrantChainRow = {
  id: string
  parent_grant_id: string | null
  source: string
  permission: string
  project_id: string | null
  revoked_at: string | null
  relationship_id: string
}

export type GrantChainLoadResult =
  | { ok: true; rows: GrantChainRow[] }
  | { ok: false; status: 500; error: string }

/**
 * Loads every `workspace_grants` row for one relationship in ONE query,
 * regardless of chain depth — the caller (this module's other two exports)
 * then hands the whole set to `isGrantChainLive` per candidate row, rather
 * than this function issuing a query per hop. Deliberately does NOT filter
 * out revoked rows: the walker needs to SEE a revoked ancestor in order to
 * refuse the chain it belongs to. Fails closed to `{ ok: false }` on any
 * select error. Never throws.
 */
export async function loadRelationshipGrantChain(
  supabase: SupabaseClient,
  args: { workspaceId: string; relationshipId: string }
): Promise<GrantChainLoadResult> {
  const { data, error } = await supabase
    .from('workspace_grants')
    .select('id, parent_grant_id, source, permission, project_id, revoked_at, relationship_id')
    .eq('workspace_id', args.workspaceId)
    .eq('relationship_id', args.relationshipId)

  if (error) {
    return {
      ok: false,
      status: 500,
      error: 'Could not load the grant lineage for this relationship.',
    }
  }

  const rows: GrantChainRow[] = ((data ?? []) as WorkspaceGrantChainRow[]).map((row) => ({
    id: row.id,
    parentGrantId: row.parent_grant_id,
    source: row.source,
    permission: row.permission,
    projectId: row.project_id,
    revokedAt: row.revoked_at,
    relationshipId: row.relationship_id,
  }))

  return { ok: true, rows }
}

/**
 * The use-time half of the lineage walk. Loads the chain set once, then for
 * every unrevoked row scoped to the requested project (or relationship-wide,
 * `projectId === null`), asks `isGrantChainLive` whether ITS OWN chain —
 * walked all the way to a live member-consent root — is live, and keeps the
 * permission only when it is. A revoked root therefore drops every
 * descendant's permission from the returned set in the same call, with no
 * cascade job. Returns an empty set on any load error. `now` is accepted
 * for signature symmetry with the resolver family in `grant-service.ts`;
 * liveness here is revocation- and lineage-based only
 * (`isGrantChainLive` has no time-windowed clause), so it is not read.
 * Never memoised — two calls with the same arguments issue two queries.
 */
export async function resolveLivePermissionsForRelationship(
  supabase: SupabaseClient,
  args: {
    workspaceId: string
    relationshipId: string
    projectId?: string | null
    now?: number
  }
): Promise<ReadonlySet<WorkspacePermission>> {
  const projectId = args.projectId ?? null

  const chain = await loadRelationshipGrantChain(supabase, {
    workspaceId: args.workspaceId,
    relationshipId: args.relationshipId,
  })
  if (!chain.ok) return EMPTY_PERMISSIONS

  const result = new Set<WorkspacePermission>()

  for (const row of chain.rows) {
    if (row.revokedAt !== null) continue
    if (row.projectId !== null && row.projectId !== projectId) continue
    if (!isKnownWorkspacePermission(row.permission)) continue

    const liveness = isGrantChainLive({ grantId: row.id, rows: chain.rows })
    if (liveness.ok) result.add(row.permission)
  }

  return result
}

/**
 * What `assertGrantIssuable` uses as `granterHolds` (F6). Returns only the
 * permission set carried by the relationship's own live `source =
 * member_consent` root rows — the subject Member's own consent, which a
 * workspace admin may relay onward but never exceed (D-21, D-49). Unlike
 * `resolveLivePermissionsForRelationship`, this deliberately does NOT
 * include delegated (non-root) rows: a delegated grant relays consent, it
 * is never itself a source of further authority. Returns an empty set on
 * any load error. Never memoised.
 */
export async function resolveConsentRootPermissions(
  supabase: SupabaseClient,
  args: { workspaceId: string; relationshipId: string; projectId?: string | null }
): Promise<ReadonlySet<WorkspacePermission>> {
  const projectId = args.projectId ?? null

  const chain = await loadRelationshipGrantChain(supabase, {
    workspaceId: args.workspaceId,
    relationshipId: args.relationshipId,
  })
  if (!chain.ok) return EMPTY_PERMISSIONS

  const result = new Set<WorkspacePermission>()

  for (const row of chain.rows) {
    if (row.source !== MEMBER_CONSENT_SOURCE) continue
    if (row.revokedAt !== null) continue
    if (row.projectId !== null && row.projectId !== projectId) continue
    if (!isKnownWorkspacePermission(row.permission)) continue

    const liveness = isGrantChainLive({ grantId: row.id, rows: chain.rows })
    if (liveness.ok) result.add(row.permission)
  }

  return result
}
