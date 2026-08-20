export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getStaffRole } from '@/lib/admin/gate'
import { attachUserEmails } from '@/lib/admin/user-emails'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { SyncLibraryAdmin } from '@/components/admin/SyncLibraryAdmin'
import type { ArtistPickOption, SyncLibraryQueueRow } from '@/components/admin/SyncLibraryAdmin'
import { SyncReadinessWorklist } from '@/components/admin/SyncReadinessWorklist'
import {
  buildWorklist,
  type WorklistListingRow,
  type WorklistLookups,
  type WorklistProjectInput,
  type WorklistTrackInput,
} from '@/lib/sync-library/worklist'
import type { SyncListingEntrySource, SyncListingStatus, VaultProjectType } from '@/types'

// ─── /admin/sync-library ────────────────────────────────────────────────
// Staff curation surface (26-10-PLAN.md), extended (30-09-PLAN.md) with the
// Sync Readiness worklist. Gated to leadership + ae — the exact role set
// the backing routes allow (requireStaff(['leadership','ae']) in
// app/api/sync-library/invite; admit/reject and quality-review are now
// leadership-only per 30-CONTEXT.md's access decision — see
// app/api/sync-library/admin/[listingId]/route.ts and .../quality/route.ts;
// the remove route stays leadership-only, unchanged). bd is not part of the
// "broader permissioned-staff curation role" per 26-CONTEXT.md.
//
// The worklist section below is built server-side via buildWorklist() over
// data this page already batch-loads (listings/tracks/projects/artists),
// widened minimally with the sync-readiness-specific columns
// (quality_ok/staff_notes, isrc/iswc/metadata, project type, per-project
// documents) — avoiding a client round-trip to GET /api/sync-library/
// worklist while reusing the exact same pure shaper (30-05) so the two
// surfaces never drift (30-CONTEXT.md "Reuse that engine; do not rebuild
// it").

type ListingRow = {
  id: string
  status: SyncListingStatus
  entry_source: SyncListingEntrySource
  artist_user_id: string
  track_id: string
  vault_project_id: string
  applied_at: string
  rejection_reason: string | null
  removal_reason: string | null
  quality_ok: boolean | null
  staff_notes: string | null
}

// Bounds the invite picker's artist pool query — a client-filtered picker,
// not a paginated list (mirrors lib/trust-safety/verification.ts's
// loadMembersForVerification limit(200) convention).
const ARTIST_POOL_LIMIT = 300

export default async function AdminSyncLibraryPage() {
  // Explicit per-page staff check — layout redirect alone is not relied
  // upon as the authority decision (project convention; see lib/admin/gate.ts).
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const role = getStaffRole(user)
  if (role !== 'leadership' && role !== 'ae') redirect('/')
  const isLeadership = role === 'leadership'

  const service = createServiceClient()

  const { data: listingsRaw } = await service
    .from('sync_listings')
    .select(
      'id, status, entry_source, artist_user_id, track_id, vault_project_id, applied_at, rejection_reason, removal_reason, quality_ok, staff_notes'
    )
    .order('applied_at', { ascending: true })

  const listings = (listingsRaw ?? []) as ListingRow[]

  const trackIds = Array.from(new Set(listings.map(l => l.track_id)))
  const projectIds = Array.from(new Set(listings.map(l => l.vault_project_id)))
  const artistIds = Array.from(new Set(listings.map(l => l.artist_user_id)))

  // Widened over the pre-30-09 shape (was: 'id, title' for both tracks and
  // projects) to also carry the Sync Readiness worklist's inputs
  // (isrc/iswc/metadata per track, type per project) — one extra
  // vault_documents query for the shared, project-level readiness signals
  // syncReadinessForTrack() needs (mirrors GET /api/sync-library/worklist's
  // own batching exactly).
  const [{ data: trackRows }, { data: projectRows }, { data: artistProfiles }, { data: documentRows }] =
    await Promise.all([
      trackIds.length > 0
        ? service.from('tracks').select('id, title, isrc, iswc, metadata').in('id', trackIds)
        : Promise.resolve({
            data: [] as { id: string; title: string | null; isrc: string | null; iswc: string | null; metadata: Record<string, unknown> | null }[],
          }),
      projectIds.length > 0
        ? service.from('vault_projects').select('id, title, type').in('id', projectIds)
        : Promise.resolve({ data: [] as { id: string; title: string | null; type: VaultProjectType }[] }),
      artistIds.length > 0
        ? service.from('user_profiles').select('id, artist_name').in('id', artistIds)
        : Promise.resolve({ data: [] as { id: string; artist_name: string | null }[] }),
      projectIds.length > 0
        ? service.from('vault_documents').select('project_id, type, status').in('project_id', projectIds)
        : Promise.resolve({ data: [] as { project_id: string | null; type: string; status: string }[] }),
    ])

  const trackTitleById = new Map((trackRows ?? []).map(t => [t.id, t.title]))
  const projectTitleById = new Map((projectRows ?? []).map(p => [p.id, p.title]))
  const artistNameById = new Map((artistProfiles ?? []).map(p => [p.id, p.artist_name]))

  // ─── Sync Readiness worklist assembly ──────────────────────────────────
  // buildWorklist() (30-05) is the single shaper — its own internal
  // isTerminal()/'admitted' filter narrows the full listings list down to
  // exactly the open (applied/invited/agreement_pending/pending_admit) rows
  // the worklist route also returns, so the full listings array can be
  // passed straight through without a second query.
  const documentsByProject = new Map<string, { type: string; status: string }[]>()
  for (const doc of documentRows ?? []) {
    if (!doc.project_id) continue
    const list = documentsByProject.get(doc.project_id) ?? []
    list.push({ type: doc.type, status: doc.status })
    documentsByProject.set(doc.project_id, list)
  }

  const worklistTracksById = new Map<string, WorklistTrackInput>(
    (trackRows ?? []).map(t => [
      t.id,
      { id: t.id, title: t.title, isrc: t.isrc, iswc: t.iswc, metadata: t.metadata },
    ])
  )
  const worklistProjectsById = new Map<string, WorklistProjectInput>(
    (projectRows ?? []).map(p => [
      p.id,
      { title: p.title, type: p.type, documents: documentsByProject.get(p.id) ?? [] },
    ])
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

  const worklistLookups: WorklistLookups = {
    tracksById: worklistTracksById,
    projectsById: worklistProjectsById,
    artistNameById,
  }

  const worklistRows = buildWorklist(worklistListings, worklistLookups)

  // user_profiles has no email column (it lives on auth.users) — attach it
  // per-artist via the admin API, mirroring app/(admin)/admin/deals/page.tsx
  // and app/(admin)/admin/capability-requests/page.tsx's identical pattern.
  // Attach emails via the Auth Admin API — deduplicated, concurrency-capped,
  // and cached for reuse by the artist-pool lookup below, so an id that is
  // both a listing artist and in the pool is fetched once and no section fans
  // out an unbounded getUserById burst on every page load (audit #11).
  const artistEmailById = new Map<string, string>()
  await attachUserEmails(service, artistIds, { cache: artistEmailById })

  const rows: SyncLibraryQueueRow[] = listings.map(l => ({
    listingId: l.id,
    status: l.status,
    entrySource: l.entry_source,
    artistName: artistNameById.get(l.artist_user_id) ?? null,
    artistEmail: artistEmailById.get(l.artist_user_id) ?? '',
    songTitle: trackTitleById.get(l.track_id) ?? 'Unknown song',
    projectTitle: projectTitleById.get(l.vault_project_id) ?? 'Unknown project',
    appliedAt: l.applied_at,
    rejectionReason: l.rejection_reason,
    removalReason: l.removal_reason,
  }))

  // Invite picker pool — every artist account, searchable by name/email
  // (26-UI-SPEC.md Screen F "a field to pick the artist"). No dedicated
  // artist-search-by-email endpoint exists in this plan's file scope
  // (26-05's invite route only accepts profileId) — the bounded pool +
  // client-side filter in SyncLibraryAdmin keeps this in-scope without a
  // new API route.
  const { data: artistPoolRaw } = await service
    .from('user_profiles')
    .select('id, artist_name')
    .eq('member_type', 'artist')
    .order('artist_name', { ascending: true })
    .limit(ARTIST_POOL_LIMIT)

  const artistPoolRows = (artistPoolRaw ?? []) as { id: string; artist_name: string | null }[]
  // Reuses artistEmailById as the cache — pool artists already resolved above
  // (listing artists) are not re-fetched, and the pool fans out at the capped
  // concurrency rather than up to ARTIST_POOL_LIMIT at once (audit #11).
  await attachUserEmails(service, artistPoolRows.map(row => row.id), { cache: artistEmailById })
  const artistPool: ArtistPickOption[] = artistPoolRows.map(row => ({
    profileId: row.id,
    artistName: row.artist_name,
    email: artistEmailById.get(row.id) ?? '',
  }))

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-semibold text-[color:var(--ink)]">Sync Library</h1>
      <p className="mt-2 max-w-2xl text-[13px] text-[color:var(--ink-3)]">
        Invite artists and curate every submitted song — one consistent admit/reject gate for
        invited and self-applied songs alike, oldest first.
      </p>
      <SyncLibraryAdmin initialRows={rows} artistPool={artistPool} isLeadership={isLeadership} />

      <h2 className="mt-10 text-xl font-semibold text-[color:var(--ink)]">Sync Readiness</h2>
      <p className="mt-2 max-w-2xl text-[13px] text-[color:var(--ink-3)]">
        Every incomplete track, with exactly what&apos;s missing. Guide the artist team through the
        gaps — incomplete isn&apos;t rejected.
      </p>
      <div className="mt-6">
        <SyncReadinessWorklist rows={worklistRows} isLeadership={isLeadership} />
      </div>
    </div>
  )
}
