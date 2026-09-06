import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveEffectivePermissions } from '@/lib/workspaces/grant-service'
import type { WorkspacePermission } from '@/lib/workspaces/permissions'
import type { VaultProjectType } from '@/types'

// ─── The workspace catalogue — a query over attachments, never a copy ──────
// (D-23, D-25, D-26, D-49, custody D-01/D-09/D-04). This module is a QUERY
// over live `workspace_attachments` rows joined to their `vault_projects`
// rows through the RLS-SCOPED client the caller passes in. Migration 186's
// `workspace_project_permission()` policy branch on `vault_projects` IS the
// row filter: a project the caller's grant does not currently cover simply
// never joins through, and comes back `null` on the nested `vault_projects`
// key below. This module deliberately adds NO application-layer `WHERE`
// that duplicates that decision — doing so would make the access boundary a
// convention enforced twice in two places rather than a single structure
// enforced once, which custody D-04's doctrine forbids. Do not add one.
//
// Field-level exposure is a SEPARATE axis from row-level access. Once a
// project row is visible at all, this module calls
// `resolveEffectivePermissions` (lib/workspaces/grant-service.ts) — the ONE
// use-time authority (D-49) — to decide which optional `fields` keys are
// populated. This module never reads `workspace_grants` itself, directly or
// indirectly, for that decision.
//
// This reader never resolves, signs, or returns a storage path or URL of
// any kind (custody D-01/D-09). It is a browsing surface over identifying
// project metadata only — audio, document and asset access all go through
// their own narrow, asset-class-specific accessors, never through here.

type VaultProjectHolderRow = {
  id: string
  user_id: string
  title: string
  type: VaultProjectType
  release_date: string | null
  vault_readiness_score: number
  genre: string | null
  sub_genre: string | null
  label: string | null
  publisher: string | null
  c_line: string | null
  p_line: string | null
  copyright_year: number | null
  primary_language: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  upc: string | null
}

type WorkspaceAttachmentRow = {
  project_id: string
  vault_projects: VaultProjectHolderRow | VaultProjectHolderRow[] | null
}

export type WorkspaceCatalogueMetadataFields = {
  genre: string | null
  subGenre: string | null
  label: string | null
  publisher: string | null
  cLine: string | null
  pLine: string | null
  copyrightYear: number | null
  primaryLanguage: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
}

export type WorkspaceCatalogueEntry = {
  projectId: string
  title: string
  type: VaultProjectType
  releaseDate: string | null
  readinessScore: number
  holderDisplayName: string | null
  fields: {
    metadata?: WorkspaceCatalogueMetadataFields
    privateRightsIdentifiers?: { upc: string | null }
    // `earnings` is deliberately never a key on this object, under any
    // resolved permission set — no earnings feature exists anywhere in this
    // codebase yet, so there is nothing for `view_earnings` to expose here.
  }
}

// PostgREST returns a nested single-row embed as an object when the
// relationship is many-to-one (as it is here — one attachment names exactly
// one project), but some client configurations shape it as a one-element
// array. Normalizing both shapes to `T | null` keeps the rest of this module
// from caring which one it received.
function normalizeProjectRow(
  value: VaultProjectHolderRow | VaultProjectHolderRow[] | null
): VaultProjectHolderRow | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/**
 * Returns one `WorkspaceCatalogueEntry` per LIVE attachment the RLS-scoped
 * `supabase` client can see for `args.workspaceId` — never an entry for a
 * detached attachment, and never a project row the caller's resolved
 * permissions do not currently expose row-level access to at all (that
 * decision is migration 186's, made inside the query itself, not
 * re-implemented here).
 *
 * Returns `[]` immediately, without ever querying `workspace_attachments`
 * or `vault_projects`, when the caller has no currently ACTIVE membership in
 * the workspace — mirrors `requireWorkspaceAccess`'s fail-closed posture,
 * but performed here directly because this function may be called from a
 * context (e.g. a GET route) where that gate has already run at the HTTP
 * layer and this module still must not assume it.
 */
export async function loadWorkspaceCatalogue(
  supabase: SupabaseClient,
  args: { workspaceId: string; actorUserId: string; projectId?: string | null; now?: number }
): Promise<WorkspaceCatalogueEntry[]> {
  const { workspaceId, actorUserId, now } = args
  const projectId = args.projectId ?? null

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('status')
    .eq('workspace_id', workspaceId)
    .eq('user_id', actorUserId)
    .maybeSingle()

  if (membershipError) return []
  const membershipRow = membership as { status: string } | null
  if (!membershipRow || membershipRow.status !== 'active') return []

  let query = supabase
    .from('workspace_attachments')
    .select(
      `
      project_id,
      vault_projects (
        id, user_id, title, type, release_date, vault_readiness_score,
        genre, sub_genre, label, publisher, c_line, p_line, copyright_year,
        primary_language, contact_name, contact_email, contact_phone, upc
      )
    `
    )
    .eq('workspace_id', workspaceId)
    .is('detached_at', null)

  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) return []

  const attachments = (data ?? []) as unknown as WorkspaceAttachmentRow[]

  const liveProjects: VaultProjectHolderRow[] = []
  for (const row of attachments) {
    const project = normalizeProjectRow(row.vault_projects)
    // A `null` here means migration 186's `workspace_project_permission()`
    // policy declined to join `vault_projects` through for this row — the
    // access boundary resolved entirely by that policy, not by a WHERE
    // clause in this module.
    if (project) liveProjects.push(project)
  }

  const holderIds = Array.from(new Set(liveProjects.map((p) => p.user_id)))
  const holderNameById = new Map<string, string | null>()
  if (holderIds.length > 0) {
    const { data: holders } = await supabase
      .from('user_profiles')
      .select('id, artist_name')
      .in('id', holderIds)
    for (const row of (holders ?? []) as { id: string; artist_name: string | null }[]) {
      holderNameById.set(row.id, row.artist_name)
    }
  }

  const entries: WorkspaceCatalogueEntry[] = []

  for (const project of liveProjects) {
    // The ONE use-time authority (D-49) — re-derived fresh for every
    // project, never cached, never read from `workspace_grants` directly.
    const permissions = await resolveEffectivePermissions(supabase, {
      workspaceId,
      actorUserId,
      subjectMemberId: project.user_id,
      projectId: project.id,
      now,
    })

    const fields: WorkspaceCatalogueEntry['fields'] = {}

    if (permissions.has('view_metadata' as WorkspacePermission)) {
      fields.metadata = {
        genre: project.genre,
        subGenre: project.sub_genre,
        label: project.label,
        publisher: project.publisher,
        cLine: project.c_line,
        pLine: project.p_line,
        copyrightYear: project.copyright_year,
        primaryLanguage: project.primary_language,
        contactName: project.contact_name,
        contactEmail: project.contact_email,
        contactPhone: project.contact_phone,
      }
    }

    if (permissions.has('view_private_rights_identifiers' as WorkspacePermission)) {
      fields.privateRightsIdentifiers = { upc: project.upc }
    }

    entries.push({
      projectId: project.id,
      title: project.title,
      type: project.type,
      releaseDate: project.release_date,
      readinessScore: project.vault_readiness_score,
      holderDisplayName: holderNameById.get(project.user_id) ?? null,
      fields,
    })
  }

  return entries
}

export type WorkspaceCatalogueSummary = {
  total: number
  byType: Record<VaultProjectType, number>
  byReadinessBand: { low: number; medium: number; high: number }
}

// Band cutoffs are a display-only convenience for this summary — they carry
// no gating meaning and are wholly independent of `lib/vault/readiness.ts`'s
// item-level scoring, which remains the single source of truth for whether
// a project IS ready to submit.
function readinessBand(score: number): keyof WorkspaceCatalogueSummary['byReadinessBand'] {
  if (score >= 80) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

/**
 * Counts by project type and by readiness band over the ONE catalogue array
 * given to it. Deliberately performs no cross-workspace deduplication: a
 * project attached to two workspaces is returned by two SEPARATE
 * `loadWorkspaceCatalogue` calls (one per workspace), and this function
 * summarises exactly the entries it is handed — it never merges results
 * across calls or workspaces. This is D-26 at the summary layer: one
 * canonical project, many views, and a count taken per view rather than per
 * project.
 */
export function summariseCatalogue(
  entries: readonly WorkspaceCatalogueEntry[]
): WorkspaceCatalogueSummary {
  const byType: Record<VaultProjectType, number> = {
    single: 0,
    snippet: 0,
    ep: 0,
    album: 0,
    unreleased: 0,
  }
  const byReadinessBand = { low: 0, medium: 0, high: 0 }

  for (const entry of entries) {
    byType[entry.type] += 1
    byReadinessBand[readinessBand(entry.readinessScore)] += 1
  }

  return { total: entries.length, byType, byReadinessBand }
}
