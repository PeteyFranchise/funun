import type { SupabaseClient } from '@supabase/supabase-js'
import type { VaultProjectType } from '@/types'

// ─── The workspace catalogue — a query over attachments, never a copy ──────
// (D-23, D-25, D-26, D-49, custody D-01/D-09/D-04). This module is a QUERY
// over live `workspace_attachments` rows joined to their `vault_projects`
// rows. As of migration 194 that join happens inside
// `public.workspace_catalogue_page` — a STABLE SECURITY DEFINER function
// that applies the SAME six hops migration 192's `workspace_project_permission`
// applies per row (kill switch, live attachment, active unexpired
// membership, accepted in-window relationship, unrevoked grant on that
// relationship, custody binding, live delegation lineage) to a whole page in
// one statement. THAT FUNCTION IS THE ROW FILTER. This module deliberately
// adds NO application-layer `WHERE` that duplicates that decision — doing so
// would make the access boundary a convention enforced twice in two places
// rather than a single structure enforced once, which custody D-04's
// doctrine forbids. Do not add one.
//
// Field-level exposure is a SEPARATE axis from row-level access. A row
// appears at all under `view_summaries`; `view_metadata` and
// `view_private_rights_identifiers` decide which optional `fields` keys are
// populated. Those two decisions are ALSO made in the database — every
// conditionally exposed column arrives already NULLed out when the caller
// does not hold the matching permission, and the function reports the two
// permissions as booleans so this module can tell "withheld" from "genuinely
// null" without a second query. This module never reads `workspace_grants`
// itself, directly or indirectly, for that decision.
//
// This reader never resolves, signs, or returns a storage path or URL of
// any kind (custody D-01/D-09). It is a browsing surface over identifying
// project metadata only — audio, document and asset access all go through
// their own narrow, asset-class-specific accessors, never through here.
//
// THE N+1 (F18) WAS FIXED BY FOLDING THE COMPUTATION INTO ONE QUERY, NOT BY
// CACHING IT (R-10 / WSR-20). The previous version of this module called
// `grant-service.ts`'s per-project permission resolver — itself up to four
// sequential queries — once per project inside a `for` loop, so a hundred
// attached projects cost four hundred round trips in a single HTTP request
// (403 statements for a hundred-project workspace, all told). The obvious
// remedy, memoising the resolved permission set, is BANNED: D-49 makes a
// revoked grant, a terminated relationship, an expired seat or a custody
// transfer take effect on the very NEXT read, and a cache here would
// reintroduce exactly the staleness that decision exists to prevent. So the
// work is done once per PAGE instead of once per project, and it is still
// done live: two identical consecutive calls issue two RPC calls, and the
// database re-reads every hop on each of them. There is nothing to cache and
// nothing to invalidate. Do not add a cache to this module.

/** The page ceiling and default. These MUST match migration 194's own
 * `LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)` clamp — the SQL
 * clamps because an unbounded page on a SECURITY DEFINER function is a
 * denial-of-service surface, and this side clamps so a caller cannot reach
 * past it from either direction. Change one and you must change the other. */
export const WORKSPACE_CATALOGUE_PAGE_MAX = 200
export const WORKSPACE_CATALOGUE_PAGE_DEFAULT = 50

/** One row of `public.workspace_catalogue_page`, exactly as migration 194
 * declares it. That declared column list is the security contract; this type
 * is its TypeScript mirror and must not gain a key the SQL does not
 * return. */
type WorkspaceCataloguePageRow = {
  project_id: string
  holder_user_id: string
  title: string
  type: VaultProjectType
  release_date: string | null
  vault_readiness_score: number
  can_view_metadata: boolean
  can_view_private_rights_identifiers: boolean
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

/** Clamp to the same window migration 194 clamps to. A non-finite or absent
 * value takes the default rather than being forwarded as `NaN`. */
function clampLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return WORKSPACE_CATALOGUE_PAGE_DEFAULT
  }
  return Math.min(Math.max(Math.trunc(value), 1), WORKSPACE_CATALOGUE_PAGE_MAX)
}

function clampOffset(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(Math.trunc(value), 0)
}

/**
 * Returns one `WorkspaceCatalogueEntry` per project on the requested PAGE of
 * live attachments that `public.workspace_catalogue_page` currently admits
 * for `args.actorUserId` in `args.workspaceId` — never an entry for a
 * detached attachment, never one for a project the caller's grants do not
 * currently reach, and never one whose custody has moved to a different
 * Member. That decision is migration 194's, made inside the query itself and
 * re-derived live on every call, not re-implemented here.
 *
 * Returns `[]` immediately, without ever calling the RPC, when the caller
 * has no currently ACTIVE membership in the workspace — mirrors
 * `requireWorkspaceAccess`'s fail-closed posture, but performed here
 * directly because this function may be called from a context (e.g. a GET
 * route) where that gate has already run at the HTTP layer and this module
 * still must not assume it.
 *
 * FAILS CLOSED on any RPC error: an empty page, never a partially populated
 * one. (`lib/security/rate-limit.ts`'s `checkRateLimit` is the other
 * `supabase.rpc()` call site in this repo and its fail-OPEN posture is
 * deliberate for an abuse-annoyance surface — it is exactly wrong here.)
 */
export async function loadWorkspaceCatalogue(
  supabase: SupabaseClient,
  args: {
    workspaceId: string
    actorUserId: string
    projectId?: string | null
    limit?: number
    offset?: number
  }
): Promise<WorkspaceCatalogueEntry[]> {
  const { workspaceId, actorUserId } = args
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

  const { data, error } = await supabase.rpc('workspace_catalogue_page', {
    p_workspace_id: workspaceId,
    p_uid: actorUserId,
    p_limit: clampLimit(args.limit),
    p_offset: clampOffset(args.offset),
    p_project_id: projectId,
  })

  if (error) return []
  if (!Array.isArray(data)) return []
  const rows = data as WorkspaceCataloguePageRow[]
  if (rows.length === 0) return []

  // One batched lookup for the whole page — already a single statement
  // before this change, and still a single statement after it. The function
  // deliberately does NOT join `user_profiles` itself: a SECURITY DEFINER
  // function has no business bypassing that table's RLS.
  const holderIds = Array.from(new Set(rows.map((row) => row.holder_user_id)))
  const holderNameById = new Map<string, string | null>()
  const { data: holders } = await supabase
    .from('user_profiles')
    .select('id, artist_name')
    .in('id', holderIds)
  for (const row of (holders ?? []) as { id: string; artist_name: string | null }[]) {
    holderNameById.set(row.id, row.artist_name)
  }

  return rows.map((row) => {
    const fields: WorkspaceCatalogueEntry['fields'] = {}

    // The values themselves already arrived NULLed out when the flag is
    // false — the flag decides whether the KEY exists at all, which is what
    // distinguishes "withheld" from "genuinely null" for the consumer.
    if (row.can_view_metadata) {
      fields.metadata = {
        genre: row.genre,
        subGenre: row.sub_genre,
        label: row.label,
        publisher: row.publisher,
        cLine: row.c_line,
        pLine: row.p_line,
        copyrightYear: row.copyright_year,
        primaryLanguage: row.primary_language,
        contactName: row.contact_name,
        contactEmail: row.contact_email,
        contactPhone: row.contact_phone,
      }
    }

    if (row.can_view_private_rights_identifiers) {
      fields.privateRightsIdentifiers = { upc: row.upc }
    }

    return {
      projectId: row.project_id,
      title: row.title,
      type: row.type,
      releaseDate: row.release_date,
      readinessScore: row.vault_readiness_score,
      // The holder's user id is used here and discarded — it never reaches
      // the returned entry, which carries a display name or nothing.
      holderDisplayName: holderNameById.get(row.holder_user_id) ?? null,
      fields,
    }
  })
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
