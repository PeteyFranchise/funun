import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { buildCatalogFilter, type CatalogRightsCode } from '@/lib/deals/catalog'
import { loadCatalogPage } from '@/lib/deals/catalog-query'

// ─── GET /api/admin/selects/catalog (31-10 deviation — Rule 2) ────────────
// The Selects builder's Crate-search pane needs a client-callable, staff-
// scoped catalog search. Neither existing catalogue surface fits: GET
// /api/buyer/catalog requires a buyer_members row (a pure staff account —
// AE/BD with no buyer membership — gets 403 there), and the staff-aware
// catalogue (app/sync/catalog/page.tsx, 30-08) is SSR-only with no
// fetchable API. This route is the staff-gated twin of GET
// /api/buyer/catalog: SAME buildCatalogFilter + loadCatalogPage authority
// (T-26-24 — no parallel query implementation), gated by requireStaff()
// instead of a buyer_members row, buyerUserId passed as null (matching
// app/sync/catalog/page.tsx's own staff-without-membership branch) and
// staffMode passed through so loadCatalogPage's existing staff layer stays
// available if a future plan wants it.
//
// Every returned project has already passed loadCatalogPage's internal
// isRightsReady gate (Family B "catalogue-only" contract, 31-UI-SPEC) — a
// Selects can only ever hold Crate tracks, so nothing not-admitted can be
// searched here at all; flattened to TRACK-level rows since a Selects add
// operates on track_id, not project id.
export const dynamic = 'force-dynamic'

export type SelectsCatalogTrackHit = {
  trackId: string
  projectId: string
  title: string
  artist: string
  genre: string | null
  mood: string
  energy: string
  vocal: string
  rights: CatalogRightsCode
  bpm: number | null
  keySignature: string | null
}

export async function GET(request: Request) {
  const auth = await requireStaff()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const searchParams = new URL(request.url).searchParams
  const filter = buildCatalogFilter({
    genre: searchParams.get('genre'),
    mood: searchParams.get('mood'),
    energy: searchParams.get('energy'),
    vocal: searchParams.get('vocal'),
    usageCleared: searchParams.get('usageCleared'),
    key: searchParams.get('key'),
    bpmMin: searchParams.get('bpmMin'),
    bpmMax: searchParams.get('bpmMax'),
  })

  const rawPage = Number(searchParams.get('page'))
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1

  const service = createServiceClient()
  const result = await loadCatalogPage(service, null, filter, page, auth.staffRole)

  const hits: SelectsCatalogTrackHit[] = []
  for (const card of result.data) {
    for (const track of card.tracks) {
      hits.push({
        trackId: track.id,
        projectId: card.id,
        title: track.title || card.title,
        artist: card.artist,
        genre: card.genre,
        mood: card.mood,
        energy: card.energy,
        vocal: card.vocal,
        rights: card.rights,
        bpm: track.bpm,
        keySignature: track.keySignature,
      })
    }
  }

  return NextResponse.json({ data: hits, page: result.page, pageSize: result.pageSize })
}
