import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import {
  buildWorklist,
  type WorklistListingRow,
  type WorklistLookups,
  type WorklistProjectInput,
  type WorklistTrackInput,
} from '@/lib/sync-library/worklist'
import type { VaultProjectType } from '@/types'

// ─── GET /api/sync-library/worklist ─────────────────────────────────────
// Staff-facing Sync Readiness worklist (30-CONTEXT.md "A worklist queue in
// Sync Library lists every incomplete track + exactly what's missing").
// A shared READ surface — visible to any staff role (leadership/ae/bd/anr),
// unlike the leadership-only admit/reject/quality-review WRITES (30-04);
// browsing the worklist is not a curation action.
//
// T-30-01 (Elevation of Privilege): requireStaff() (default ALL_STAFF_ROLES)
// is the FIRST statement, before any DB read.
// T-30-02 (Information Disclosure): rows are assembled server-side from the
// service-role client only — no client-supplied flag controls visibility.
//
// Batched (mirrors app/(admin)/admin/sync-library/page.tsx's discipline —
// T-16-21-style, never N+1): ONE query for the non-terminal/non-admitted
// listings, then ONE query each for the referenced tracks, vault_projects,
// vault_documents, and artist names. Missing-item derivation is entirely
// delegated to buildWorklist()/syncReadinessForTrack() (30-01) — this route
// never recomputes readiness itself.
//
// Tracks are selected WITHOUT has_sample/sample_details. Those columns are
// missing on the live remote today (a pre-existing schema drift discovered
// in 30-04, tracked in deferred-items.md, unrelated to this plan) — and
// syncReadinessForTrack()/missingSyncItems() never read them, so they are
// deliberately left out of this SELECT rather than mirrored in from
// lib/deals/catalog-query.ts's PROJECT_COLUMNS.

const OPEN_STATUSES = ['applied', 'invited', 'agreement_pending', 'pending_admit'] as const

type ListingRow = {
  id: string
  status: string
  track_id: string
  vault_project_id: string
  artist_user_id: string
  applied_at: string
  quality_ok: boolean | null
  staff_notes: string | null
}

type TrackRow = {
  id: string
  title: string | null
  isrc: string | null
  iswc: string | null
  metadata: Record<string, unknown> | null
  // 2026-09-10: the hire-credit columns. The readiness engine uses them to
  // tell "no producer agreement is required" (a self-produced recording)
  // apart from "a producer agreement is missing". Omitting them would keep
  // this worklist showing "Producer agreements — missing" against songs the
  // admit route now admits without one — sending a staff member hunting for
  // a document that does not need to exist.
  producers: string[] | null
  mixing_engineer: string | null
  mastering_engineer: string | null
}

type ProjectRow = {
  id: string
  title: string | null
  type: VaultProjectType
}

type DocumentRow = {
  project_id: string | null
  type: string
  status: string
}

// 2026-09-10: `visual_asset` (cover art) joined SYNC_READINESS_KEYS, and
// readinessItemsForProject derives it from vault_assets — one more batched
// query, scoped to the same project ids, never a per-listing lookup.
type AssetRow = {
  project_id: string | null
  type: string
}

type ArtistRow = { id: string; artist_name: string | null }

export async function GET() {
  // T-30-01: staff-gate-first, before any DB read. Default ALL_STAFF_ROLES
  // — the worklist is a shared read surface for every staff role; only
  // curation writes (admit/reject/quality-review, 30-04) are leadership-only.
  const auth = await requireStaff()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const service = createServiceClient()

  const { data: listingsRaw, error: listingsError } = await service
    .from('sync_listings')
    .select('id, status, track_id, vault_project_id, artist_user_id, applied_at, quality_ok, staff_notes')
    .in('status', OPEN_STATUSES)
    .order('applied_at', { ascending: true })
  if (listingsError) {
    return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  }
  const listings = (listingsRaw ?? []) as ListingRow[]

  if (listings.length === 0) {
    return NextResponse.json({ data: [] })
  }

  const trackIds = Array.from(new Set(listings.map(l => l.track_id)))
  const projectIds = Array.from(new Set(listings.map(l => l.vault_project_id)))
  const artistIds = Array.from(new Set(listings.map(l => l.artist_user_id)))

  // Batched: ONE query per referenced table, scoped to this page's
  // collected ids — never a per-listing query (mirrors AdminSyncLibraryPage
  // and loadCatalogPage's discipline).
  const [
    { data: trackRows },
    { data: projectRows },
    { data: documentRows },
    { data: assetRows },
    { data: artistRows },
  ] = await Promise.all([
    service
      .from('tracks')
      .select('id, title, isrc, iswc, metadata, producers, mixing_engineer, mastering_engineer')
      .in('id', trackIds),
    service.from('vault_projects').select('id, title, type').in('id', projectIds),
    service.from('vault_documents').select('project_id, type, status').in('project_id', projectIds),
    service.from('vault_assets').select('project_id, type').in('project_id', projectIds),
    service.from('user_profiles').select('id, artist_name').in('id', artistIds),
  ])

  const tracksById = new Map<string, WorklistTrackInput>(
    ((trackRows ?? []) as TrackRow[]).map(t => [
      t.id,
      {
        id: t.id,
        title: t.title,
        isrc: t.isrc,
        iswc: t.iswc,
        metadata: t.metadata,
        producers: t.producers,
        mixing_engineer: t.mixing_engineer,
        mastering_engineer: t.mastering_engineer,
      },
    ])
  )

  const documentsByProject = new Map<string, { type: string; status: string }[]>()
  for (const doc of (documentRows ?? []) as DocumentRow[]) {
    if (!doc.project_id) continue
    const list = documentsByProject.get(doc.project_id) ?? []
    list.push({ type: doc.type, status: doc.status })
    documentsByProject.set(doc.project_id, list)
  }

  const assetsByProject = new Map<string, { type: string }[]>()
  for (const asset of (assetRows ?? []) as AssetRow[]) {
    if (!asset.project_id) continue
    const list = assetsByProject.get(asset.project_id) ?? []
    list.push({ type: asset.type })
    assetsByProject.set(asset.project_id, list)
  }

  const projectsById = new Map<string, WorklistProjectInput>(
    ((projectRows ?? []) as ProjectRow[]).map(p => [
      p.id,
      {
        title: p.title,
        type: p.type,
        assets: assetsByProject.get(p.id) ?? [],
        documents: documentsByProject.get(p.id) ?? [],
      },
    ])
  )

  const artistNameById = new Map<string, string | null>(
    ((artistRows ?? []) as ArtistRow[]).map(a => [a.id, a.artist_name])
  )

  const worklistListings: WorklistListingRow[] = listings.map(l => ({
    id: l.id,
    status: l.status,
    trackId: l.track_id,
    projectId: l.vault_project_id,
    artistUserId: l.artist_user_id,
    appliedAt: l.applied_at,
    qualityOk: l.quality_ok,
    staffNotes: l.staff_notes,
  }))

  const lookups: WorklistLookups = { tracksById, projectsById, artistNameById }

  const rows = buildWorklist(worklistListings, lookups)

  return NextResponse.json({ data: rows })
}
