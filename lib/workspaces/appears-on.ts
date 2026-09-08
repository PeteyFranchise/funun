import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Appears-on: the read-only third vault lane (D-27, D-35) ───────────────
//
// This module EXTENDS Phase 21's "Shared with me" lane (migration 078's
// project-membership table) rather than forking a parallel data path (38-RESEARCH.md
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
//
// ─── R-09 / WSR-21 correction (phase 38.0.2) ───────────────────────────────
//
// The first version of this module shipped with two defects, both fixed
// below and both worth recording, because the first one is a mistake this
// codebase is structurally prone to repeating.
//
// DEFECT 1 — a row appeared with no relationship naming the caller.
// `resolveAppearsOnRows` reads `vault_projects` through the RLS client, so a
// row came back purely because `workspace_project_permission(...,
// 'view_summaries')` admitted it — that is, because of DELEGATED WORKSPACE
// ACCESS. `contributionRole` was looked up afterwards and could be `null`,
// but a null never excluded the row, so a workspace admin who contributed
// nothing to a record still saw it on their personal "Appears on" shelf.
// That is a contribution claim they never earned. Delegated access is not
// contribution credit — the same principle D-43 states one layer up, where
// workspace membership creates no credit, authorship or ownership. Access
// and credit are different things and this module used to conflate them.
// The admission ticket is now an ACCEPTED `workspace_roster_relationships`
// row naming the caller on a workspace whose live attachment reaches the
// project; a project with no such relationship is dropped entirely.
//
// DEFECT 2 — multi-workspace attachments were silently overwritten.
// `new Map(attachmentRows.map(a => [a.project_id, a.workspace_id]))` kept
// only the LAST attachment per project, so a project attached to two
// workspaces lost one without a trace — possibly the caller's own, which
// turned a genuine contributor's role into `null`. Attachments are now
// accumulated into a `Map<projectId, workspaceId[]>` and intersected with
// the relationships the caller actually holds.

export type AppearsOnRow = {
  projectId: string
  title: string
  /** The Member who currently holds/administers the record (D-28's
   *  canonical meaning of `vault_projects.user_id` — record custody, never
   *  rights ownership). */
  holderUserId: string
  holderName: string | null
  /** The CALLER's own contribution role, read from the ACCEPTED
   *  `workspace_roster_relationships` row that admitted this project
   *  (`professional_role`) — deliberately NOT a Phase-21-membership-style
   *  owner/co-owner/editor/viewer project role, which means nothing on a
   *  record the caller does not hold. A producer or engineer sees the
   *  signal that matters to them (D-35), not a project-role label that
   *  implies an authority they were never granted.
   *
   *  `null` here means the admitting relationship names no professional
   *  role, NOT that no relationship exists — since R-09 a row with no
   *  accepted relationship naming the caller is not returned at all. The
   *  relationship is the admission ticket; the role is only a label on it,
   *  and an unlabelled contributor is still a contributor. */
  contributionRole: string | null
  readOnly: true
}

type ProjectRow = { id: string; title: string; user_id: string }
type AttachmentRow = { project_id: string; workspace_id: string }
type RelationshipRow = {
  workspace_id: string
  professional_role: string | null
  accepted_at: string | null
}
type HolderProfileRow = { id: string; artist_name: string | null }

/**
 * Orders two of the caller's accepted relationships when a project is
 * attached to more than one workspace the caller belongs to. Earliest
 * `accepted_at` wins; a null `accepted_at` sorts AFTER any timestamp (an
 * undated acceptance is treated as the least established, never as the
 * oldest); a remaining tie breaks on `workspace_id` ascending.
 *
 * Determinism is the whole point, not tidiness. The chosen relationship
 * decides which contribution role a human reads on their own shelf, so an
 * order-dependent answer would make that label flip between two page loads
 * that differ only in the order Postgres happened to return attachment
 * rows — the shelf would appear to change for no reason. The rule is
 * therefore written here rather than left to whatever `.get()` last wrote.
 */
function compareCallerRelationships(a: RelationshipRow, b: RelationshipRow): number {
  if (a.accepted_at !== b.accepted_at) {
    if (a.accepted_at === null) return 1
    if (b.accepted_at === null) return -1
    if (a.accepted_at < b.accepted_at) return -1
    if (a.accepted_at > b.accepted_at) return 1
  }
  if (a.workspace_id < b.workspace_id) return -1
  if (a.workspace_id > b.workspace_id) return 1
  return 0
}

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
 *
 * Since R-09/WSR-21 there is a third truth, and it is the one the RLS
 * client cannot supply: a row is returned ONLY when an accepted
 * `workspace_roster_relationships` row NAMES THE CALLER on a workspace
 * whose live attachment reaches the project. What the query admitted is a
 * question about access; what this function returns is a claim about
 * contribution, and the two are not the same question.
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

  const [attachmentResult, holderProfileResult] = await Promise.all([
    supabase
      .from('workspace_attachments')
      .select('project_id, workspace_id')
      .in('project_id', projectIds)
      .is('detached_at', null),
    supabase.from('user_profiles').select('id, artist_name').in('id', holderIds),
  ])

  // The attachment query decides ADMISSION, so an error here fails closed:
  // an unknown attachment set cannot be told apart from an empty one, and
  // guessing in the caller's favour is exactly the credit-inflation R-09
  // forbids. (The holder-profile query below decides nothing and therefore
  // degrades to a null display name instead of emptying the shelf.)
  if (attachmentResult.error) return []

  // Every LIVE attachment per project, accumulated. The previous form,
  // `new Map(attachmentRows.map(a => [a.project_id, a.workspace_id]))`, kept
  // only the LAST attachment for each project, so a project attached to two
  // workspaces silently lost one — possibly the caller's own, which turned a
  // genuine contributor's role into a null.
  const workspaceIdsByProjectId = new Map<string, string[]>()
  for (const attachment of (attachmentResult.data ?? []) as AttachmentRow[]) {
    const existing = workspaceIdsByProjectId.get(attachment.project_id)
    if (existing) existing.push(attachment.workspace_id)
    else workspaceIdsByProjectId.set(attachment.project_id, [attachment.workspace_id])
  }

  const workspaceIdSet = new Set<string>()
  for (const ids of workspaceIdsByProjectId.values()) {
    for (const id of ids) workspaceIdSet.add(id)
  }
  const workspaceIds = Array.from(workspaceIdSet)
  if (workspaceIds.length === 0) return []

  // The relationships the caller ACTUALLY holds — accepted, and naming the
  // caller by `member_user_id`. `accepted_at` comes along because it is the
  // primary sort key when more than one of these reaches the same project.
  const { data: relData, error: relError } = await supabase
    .from('workspace_roster_relationships')
    .select('workspace_id, professional_role, accepted_at')
    .eq('member_user_id', userId)
    .eq('state', 'accepted')
    .in('workspace_id', workspaceIds)
  if (relError) return []

  const relationshipByWorkspaceId = new Map<string, RelationshipRow>()
  for (const relationship of (relData ?? []) as RelationshipRow[]) {
    if (!relationshipByWorkspaceId.has(relationship.workspace_id)) {
      relationshipByWorkspaceId.set(relationship.workspace_id, relationship)
    }
  }

  const holderNameById = new Map(
    ((holderProfileResult.data ?? []) as HolderProfileRow[]).map((p) => [p.id, p.artist_name])
  )

  // R-09/WSR-21's actual requirement: build the result from the projects an
  // accepted relationship NAMES THE CALLER on, not from every project the
  // query returned. Delegated workspace access is not contribution credit,
  // so the relationship is the admission ticket and `professional_role` is
  // only a label printed on it — a project the caller reaches purely through
  // a workspace grant is dropped here rather than surfacing with a null role.
  const appearsOnRows: AppearsOnRow[] = []
  for (const row of rows) {
    const callerRelationships: RelationshipRow[] = []
    for (const workspaceId of workspaceIdsByProjectId.get(row.id) ?? []) {
      const relationship = relationshipByWorkspaceId.get(workspaceId)
      if (relationship) callerRelationships.push(relationship)
    }
    if (callerRelationships.length === 0) continue

    const admitting = callerRelationships.reduce((best, candidate) =>
      compareCallerRelationships(candidate, best) < 0 ? candidate : best
    )

    appearsOnRows.push({
      projectId: row.id,
      title: row.title,
      holderUserId: row.user_id,
      holderName: holderNameById.get(row.user_id) ?? null,
      contributionRole: admitting.professional_role ?? null,
      readOnly: true,
    })
  }

  return appearsOnRows
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
