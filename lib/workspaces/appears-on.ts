import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Appears-on: the read-only third vault lane (D-27, D-35) ───────────────
//
// This module EXTENDS Phase 21's "Shared with me" lane (`project_members`,
// migration 078) rather than forking a parallel data path (38-RESEARCH.md
// Open Question 3): both lanes read `vault_projects` through the SAME
// RLS-scoped client, and the only difference between the two is WHICH
// branch of `vault_projects`' SELECT policy admitted the row —
// `project_member_role()` for "Shared with me", `workspace_project_
// permission()` (migration 186) for this one. The caller does the
// narrowing by passing `excludeProjectIds` (the already-resolved owned +
// shared ids, exactly as `app/(artist)/vault/page.tsx` already resolves
// them for the shared lane); this module never re-derives or duplicates
// that resolution.
//
// Appears-on rows are excluded from personal dashboard and scoreboard math
// exactly as Phase 21's shared rows already are (21-SPEC.md ③) — a
// producer's or engineer's shelf of records they contributed to but do not
// hold must never inflate their OWN catalogue counts. `partitionVaultLanes`
// below is the pure function a caller uses to enforce that exclusion,
// mirroring the Vault page's existing owned-query construction that keeps
// shared rows out of personal totals "for free" by never widening the
// `.eq('user_id', me)` filter.
//
// The shelf is READ-ONLY. Appearing on a record is a contribution fact, not
// an authority grant (docs/architecture/ACCOUNT-TYPES.md: professional
// roles, workspace relationships and rights records are three separate
// things, and none may be inferred from another). This module therefore
// exports no write helper, never imports a service-role client, and no
// exported function name begins with `update`, `create`, `delete` or
// `save`.

export type AppearsOnRow = {
  projectId: string
  title: string
  /** The Member who currently holds/administers the record (D-28's
   *  canonical meaning of `vault_projects.user_id` — record custody, never
   *  rights ownership). */
  holderUserId: string
  holderName: string | null
  /** The CALLER's own contribution role on the workspace whose attachment
   *  reaches this project (`workspace_roster_relationships.
   *  professional_role`) — deliberately NOT a `project_members`-style
   *  owner/co-owner/editor/viewer project role, which means nothing on a
   *  record the caller does not hold. A producer or engineer sees the
   *  signal that matters to them (D-35), not a project-role label that
   *  implies an authority they were never granted. */
  contributionRole: string | null
  readOnly: true
}

type ProjectRow = { id: string; title: string; user_id: string }
type AttachmentRow = { project_id: string; workspace_id: string }
type RelationshipRow = { workspace_id: string; professional_role: string | null }
type HolderProfileRow = { id: string; artist_name: string | null }

/**
 * Rows the caller contributed to via a workspace-derived path and does not
 * hold. Reads through the RLS-SCOPED client passed in (never service-role)
 * so migration 186's `workspace_project_permission()` branch is the row
 * filter, not application code (T-38-13-03) — `.neq('user_id', userId)`
 * and, when present, `.not('id', 'in', ...)` are sent to the database as a
 * belt-and-suspenders qualifier, but the JS-side filter below is what this
 * module's own tests exercise and what actually guarantees the two truths
 * this function must hold regardless of what a query happens to return:
 * the caller's own custodianship never appears here, and a row already
 * resolved by the owned or shared lane never appears twice.
 */
export async function resolveAppearsOnRows(
  supabase: SupabaseClient,
  args: { userId: string; excludeProjectIds: readonly string[] }
): Promise<AppearsOnRow[]> {
  const { userId } = args
  if (!userId) return []

  const excludeIds = Array.from(new Set(args.excludeProjectIds)).filter(Boolean)

  let query = supabase.from('vault_projects').select('id, title, user_id').neq('user_id', userId)
  if (excludeIds.length > 0) {
    query = query.not('id', 'in', `(${excludeIds.join(',')})`)
  }

  const { data, error } = await query
  if (error) return []

  const excludeSet = new Set(excludeIds)
  const rows = ((data ?? []) as ProjectRow[]).filter(
    (row) => row.user_id !== userId && !excludeSet.has(row.id)
  )
  if (rows.length === 0) return []

  const projectIds = rows.map((r) => r.id)
  const holderIds = Array.from(new Set(rows.map((r) => r.user_id)))

  const [{ data: attachmentRows }, { data: holderProfiles }] = await Promise.all([
    supabase
      .from('workspace_attachments')
      .select('project_id, workspace_id')
      .in('project_id', projectIds)
      .is('detached_at', null),
    supabase.from('user_profiles').select('id, artist_name').in('id', holderIds),
  ])

  const workspaceIdByProjectId = new Map(
    ((attachmentRows ?? []) as AttachmentRow[]).map((a) => [a.project_id, a.workspace_id])
  )
  const workspaceIds = Array.from(new Set(Array.from(workspaceIdByProjectId.values())))

  let relationshipRows: RelationshipRow[] = []
  if (workspaceIds.length > 0) {
    const { data: relData } = await supabase
      .from('workspace_roster_relationships')
      .select('workspace_id, professional_role')
      .eq('member_user_id', userId)
      .eq('state', 'accepted')
      .in('workspace_id', workspaceIds)
    relationshipRows = (relData ?? []) as RelationshipRow[]
  }
  const roleByWorkspaceId = new Map(relationshipRows.map((r) => [r.workspace_id, r.professional_role]))

  const holderNameById = new Map(
    ((holderProfiles ?? []) as HolderProfileRow[]).map((p) => [p.id, p.artist_name])
  )

  return rows.map((row) => {
    const workspaceId = workspaceIdByProjectId.get(row.id) ?? null
    return {
      projectId: row.id,
      title: row.title,
      holderUserId: row.user_id,
      holderName: holderNameById.get(row.user_id) ?? null,
      contributionRole: workspaceId ? (roleByWorkspaceId.get(workspaceId) ?? null) : null,
      readOnly: true,
    }
  })
}

export type VaultLanePartition = {
  owned: ReadonlySet<string>
  shared: ReadonlySet<string>
  appearsOn: ReadonlySet<string>
}

/**
 * Three disjoint id sets with a documented precedence: OWNED wins over
 * SHARED, SHARED wins over APPEARS-ON. A project id present in more than
 * one input array resolves to exactly one lane here — it is never rendered
 * on two shelves at once, and the union of the three returned sets never
 * contains a duplicate by construction (each id is added to at most one
 * set).
 */
export function partitionVaultLanes(args: {
  ownedIds: readonly string[]
  sharedIds: readonly string[]
  appearsOnIds: readonly string[]
}): VaultLanePartition {
  const owned = new Set(args.ownedIds)

  const shared = new Set<string>()
  for (const id of args.sharedIds) {
    if (!owned.has(id)) shared.add(id)
  }

  const appearsOn = new Set<string>()
  for (const id of args.appearsOnIds) {
    if (!owned.has(id) && !shared.has(id)) appearsOn.add(id)
  }

  return { owned, shared, appearsOn }
}
