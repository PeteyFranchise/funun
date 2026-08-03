import type { SupabaseClient } from '@supabase/supabase-js'
import { computeStage3 } from '@/lib/vault/stage3'
import { isProfileVisibleTo } from '@/lib/trust-safety/contracts'
import { loadBlockedIds } from '@/lib/green-room/discover'
import {
  isRightsReady,
  projectMatchesKeyBpm,
  projectMatchesDescriptors,
  projectMatchesUsageCleared,
  type CatalogFilter,
  type CatalogCard,
} from '@/lib/deals/catalog'

// ─── loadCatalogPage (D-16, T-16-17/T-16-18/T-16-20/T-16-21) ──────────────
// The I/O half of the buyer catalog: queries vault_projects SERVER-SIDE
// ONLY via the service-role client (never a direct PostgREST surface to the
// buyer client, mirroring the people-search doctrine) so is_public + Phase
// 13 visibility + block exclusion cannot be bypassed. Stage 3 is computed
// per project from a BOUNDED, paged fetch — never across the whole table
// per request (T-16-21).
//
// Lives in lib/ (not the route.ts file) because Next.js route modules may
// only export HTTP method handlers plus a small route-config set — any
// other export fails Next's route type-checking at build time. Both
// GET /api/buyer/catalog and app/(buyer-portal)/buyers/catalog/page.tsx's
// server-rendered first page import this one implementation, so the
// privacy gate can never drift between the two call sites (mirrors
// lib/deals/request-target.ts's authorizeRequestTarget precedent).

const PAGE_SIZE = 20

const PROJECT_COLUMNS = `
  id, title, type, genre, is_public, vault_readiness_score, user_id,
  cover_art_url, content_id_registered, content_id_dismissed_until,
  tracks (id, title, bpm, key_signature, metadata, writers, producers, mixing_engineer, mastering_engineer, has_sample, sample_details),
  vault_documents (id, type, status, track_id, document_data)
`

type CatalogProjectRow = {
  id: string
  title: string
  type: string
  genre: string | null
  is_public: boolean | null
  vault_readiness_score: number | null
  user_id: string
  cover_art_url: string | null
  content_id_registered: boolean | null
  content_id_dismissed_until: string | null
  tracks: {
    id: string
    title: string | null
    bpm: number | null
    key_signature: string | null
    metadata: Record<string, unknown> | null
    writers: string[] | null
    producers: string[] | null
    mixing_engineer: string | null
    mastering_engineer: string | null
    has_sample: boolean | null
    sample_details: string | null
  }[]
  vault_documents: {
    id: string
    type: string
    status: string
    track_id: string | null
    document_data: Record<string, unknown> | null
  }[]
}

export type CatalogPageResult = { data: CatalogCard[]; page: number; pageSize: number }

export async function loadCatalogPage(
  service: SupabaseClient,
  buyerUserId: string,
  filter: CatalogFilter,
  page: number
): Promise<CatalogPageResult> {
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = service
    .from('vault_projects')
    .select(PROJECT_COLUMNS)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filter.genre) query = query.eq('genre', filter.genre)

  const { data } = await query
  const projects = (data ?? []) as unknown as CatalogProjectRow[]

  if (projects.length === 0) {
    return { data: [], page, pageSize: PAGE_SIZE }
  }

  // Batch owner visibility + block resolution (T-16-17/T-16-18) — one
  // query each, never per-row.
  const ownerIds = Array.from(new Set(projects.map(p => p.user_id)))
  const { data: ownerRows } = await service
    .from('user_profiles')
    .select('id, profile_visibility')
    .in('id', ownerIds)
  const visibilityByOwner = new Map(
    ((ownerRows ?? []) as { id: string; profile_visibility: string | null }[]).map(o => [
      o.id,
      o.profile_visibility === 'connections_only' ? ('connections_only' as const) : ('public' as const),
    ])
  )
  const blockedIds = await loadBlockedIds(service, buyerUserId)

  // Usage-cleared filter (D-15): one batched existence check against
  // project_license_terms, not a per-project query.
  let preclearedProjectIds = new Set<string>()
  if (filter.usageCleared) {
    const { data: termsRows } = await service
      .from('project_license_terms')
      .select('vault_project_id')
      .in(
        'vault_project_id',
        projects.map(p => p.id)
      )
    preclearedProjectIds = new Set(
      ((termsRows ?? []) as { vault_project_id: string }[]).map(t => t.vault_project_id)
    )
  }

  const cards: CatalogCard[] = []
  for (const project of projects) {
    // Buyers are a fully separate account model (D-11) — never a follower
    // or connection of the artist, so viewerIsOwner/viewerIsConnection are
    // always false here.
    const visibility = visibilityByOwner.get(project.user_id) ?? 'public'
    if (!isProfileVisibleTo(visibility, false, false)) continue
    if (blockedIds.has(project.user_id)) continue

    const tracks = project.tracks ?? []
    const stage3 = computeStage3(project, tracks, project.vault_documents ?? [], project.vault_readiness_score ?? 0)
    if (!isRightsReady(project, stage3)) continue

    if (!projectMatchesKeyBpm(tracks, filter)) continue
    if (!projectMatchesDescriptors(tracks, filter)) continue
    if (!projectMatchesUsageCleared(preclearedProjectIds.has(project.id), filter)) continue

    cards.push({
      id: project.id,
      title: project.title,
      type: project.type,
      genre: project.genre,
      coverArtUrl: project.cover_art_url,
      tracks: tracks.map(t => ({ id: t.id, title: t.title, bpm: t.bpm, keySignature: t.key_signature })),
    })
  }

  return { data: cards, page, pageSize: PAGE_SIZE }
}
