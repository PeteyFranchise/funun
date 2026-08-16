import type { SupabaseClient } from '@supabase/supabase-js'
import { computeStage3, type Stage3Result } from '@/lib/vault/stage3'
import { isRightsReady } from '@/lib/deals/catalog'
import type { SelectsTrack } from './types'

// ─── resolveTracksWithRightsReady (31-04, moved 31-10) ─────────────────────
// Read-time rights-ready evaluation for a Selects' tracks. Mirrors
// lib/deals/shortlists.ts's loadShortlistEntries pattern EXACTLY:
// isRightsReady (lib/deals/catalog.ts) is the SINGLE authority, called
// directly here — never re-derived — so a track that has since lost
// readiness (score dropped, sync-library admission withdrawn) degrades
// loudly (rights_ready: false) rather than silently staying flagged ready.
//
// Extracted from app/api/admin/selects/[id]/tracks/route.ts (31-04) into
// lib/ (31-10) so app/(admin)/admin/selects/[id]/page.tsx's server-rendered
// builder detail page can import the SAME implementation the API route
// uses — mirrors lib/deals/catalog-query.ts's loadCatalogPage doc comment
// ("a Next.js route module may only export HTTP method handlers... any
// other export fails Next's route type-checking at build time"). Both the
// GET /api/admin/selects/[id]/tracks route and the SSR detail page call
// this ONE function — never a second, parallel rights-ready computation
// (T-26-24-style single-authority discipline).

const SELECTS_TRACK_COLUMNS =
  'id, selects_id, track_id, note, position, added_by, source, removed_at, removed_by, created_at'

type TrackRow = {
  id: string
  project_id: string
  title: string | null
  writers: string[] | null
  producers: string[] | null
  mixing_engineer: string | null
  mastering_engineer: string | null
  has_sample: boolean | null
  sample_details: string | null
}

type ProjectRow = {
  id: string
  title: string
  type: string
  content_id_registered: boolean | null
  content_id_dismissed_until: string | null
  vault_readiness_score: number | null
  vault_documents: {
    id: string
    type: string
    status: string
    track_id: string | null
    document_data: Record<string, unknown> | null
  }[]
}

export type SelectsTrackWithRights = SelectsTrack & {
  rights_ready: boolean
  track: { id: string; title: string | null; project_id: string } | null
}

export async function resolveTracksWithRightsReady(
  service: SupabaseClient,
  selectsId: string,
  includeRemoved: boolean
): Promise<SelectsTrackWithRights[]> {
  let query = service
    .from('selects_tracks')
    .select(SELECTS_TRACK_COLUMNS)
    .eq('selects_id', selectsId)
    .order('position', { ascending: true })
  if (!includeRemoved) query = query.is('removed_at', null)

  const { data } = await query
  const rows = (data ?? []) as SelectsTrack[]
  if (rows.length === 0) return []

  const trackIds = Array.from(new Set(rows.map(r => r.track_id)))
  const { data: trackRows } = await service
    .from('tracks')
    .select(
      'id, project_id, title, writers, producers, mixing_engineer, mastering_engineer, has_sample, sample_details'
    )
    .in('id', trackIds)
  const tracks = (trackRows ?? []) as TrackRow[]
  const trackById = new Map(tracks.map(t => [t.id, t]))

  const projectIds = Array.from(new Set(tracks.map(t => t.project_id)))
  const { data: projectRows } =
    projectIds.length > 0
      ? await service
          .from('vault_projects')
          .select(
            'id, title, type, content_id_registered, content_id_dismissed_until, vault_readiness_score, vault_documents (id, type, status, track_id, document_data)'
          )
          .in('id', projectIds)
      : { data: [] as ProjectRow[] }
  const projects = (projectRows ?? []) as ProjectRow[]
  const projectById = new Map(projects.map(p => [p.id, p]))

  // 26-06 admission signal — ONE batched sync_listings lookup (SAME
  // status='admitted' authority lib/deals/shortlists.ts and
  // lib/deals/catalog-query.ts use), T-26-24.
  const { data: admittedRows } =
    projectIds.length > 0
      ? await service
          .from('sync_listings')
          .select('vault_project_id')
          .eq('status', 'admitted')
          .in('vault_project_id', projectIds)
      : { data: [] as { vault_project_id: string }[] }
  const admittedProjectIds = new Set(
    ((admittedRows ?? []) as { vault_project_id: string }[]).map(r => r.vault_project_id)
  )

  const stage3ByProject = new Map<string, Stage3Result>()

  return rows.map(row => {
    const trackRow = trackById.get(row.track_id)
    if (!trackRow) {
      // Defensive fallback — ON DELETE CASCADE from tracks means this row
      // would normally be gone too, but degrade loudly rather than throw.
      return { ...row, rights_ready: false, track: null }
    }

    const project = projectById.get(trackRow.project_id)
    let rightsReady = false
    if (project) {
      let stage3 = stage3ByProject.get(project.id)
      if (!stage3) {
        const projectTracks = tracks.filter(t => t.project_id === project.id)
        stage3 = computeStage3(
          project,
          projectTracks,
          project.vault_documents ?? [],
          project.vault_readiness_score ?? 0
        )
        stage3ByProject.set(project.id, stage3)
      }
      rightsReady = isRightsReady(
        { ...project, has_admitted_sync_listing: admittedProjectIds.has(project.id) },
        stage3
      )
    }

    return {
      ...row,
      rights_ready: rightsReady,
      track: { id: trackRow.id, title: trackRow.title, project_id: trackRow.project_id },
    }
  })
}
