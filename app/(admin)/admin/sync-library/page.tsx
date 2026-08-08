export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getStaffRole } from '@/lib/admin/gate'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { SyncLibraryAdmin } from '@/components/admin/SyncLibraryAdmin'
import type { ArtistPickOption, SyncLibraryQueueRow } from '@/components/admin/SyncLibraryAdmin'
import type { SyncListingEntrySource, SyncListingStatus } from '@/types'

// ─── /admin/sync-library ────────────────────────────────────────────────
// Staff curation surface (26-10-PLAN.md). Gated to leadership + ae — the
// exact role set the backing routes allow (requireStaff(['leadership','ae'])
// in app/api/sync-library/invite and .../admin/[listingId]; only the
// remove route is tighter, leadership-only). bd is not part of the
// "broader permissioned-staff curation role" per 26-CONTEXT.md.

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
      'id, status, entry_source, artist_user_id, track_id, vault_project_id, applied_at, rejection_reason, removal_reason'
    )
    .order('applied_at', { ascending: true })

  const listings = (listingsRaw ?? []) as ListingRow[]

  const trackIds = Array.from(new Set(listings.map(l => l.track_id)))
  const projectIds = Array.from(new Set(listings.map(l => l.vault_project_id)))
  const artistIds = Array.from(new Set(listings.map(l => l.artist_user_id)))

  const [{ data: trackRows }, { data: projectRows }, { data: artistProfiles }] = await Promise.all([
    trackIds.length > 0
      ? service.from('tracks').select('id, title').in('id', trackIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    projectIds.length > 0
      ? service.from('vault_projects').select('id, title').in('id', projectIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    artistIds.length > 0
      ? service.from('user_profiles').select('id, artist_name').in('id', artistIds)
      : Promise.resolve({ data: [] as { id: string; artist_name: string | null }[] }),
  ])

  const trackTitleById = new Map((trackRows ?? []).map(t => [t.id, t.title]))
  const projectTitleById = new Map((projectRows ?? []).map(p => [p.id, p.title]))
  const artistNameById = new Map((artistProfiles ?? []).map(p => [p.id, p.artist_name]))

  // user_profiles has no email column (it lives on auth.users) — attach it
  // per-artist via the admin API, mirroring app/(admin)/admin/deals/page.tsx
  // and app/(admin)/admin/capability-requests/page.tsx's identical pattern.
  const artistEmailById = new Map<string, string>()
  await Promise.all(
    artistIds.map(async id => {
      try {
        const { data: authUser } = await service.auth.admin.getUserById(id)
        artistEmailById.set(id, authUser?.user?.email ?? '')
      } catch {
        artistEmailById.set(id, '')
      }
    })
  )

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
  const artistPool: ArtistPickOption[] = await Promise.all(
    artistPoolRows.map(async row => {
      let email = ''
      try {
        const { data: authUser } = await service.auth.admin.getUserById(row.id)
        email = authUser?.user?.email ?? ''
      } catch {
        email = ''
      }
      return { profileId: row.id, artistName: row.artist_name, email }
    })
  )

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-semibold text-[color:var(--ink)]">Sync Library</h1>
      <p className="mt-2 max-w-2xl text-[13px] text-[color:var(--ink-3)]">
        Invite artists and curate every submitted song — one consistent admit/reject gate for
        invited and self-applied songs alike, oldest first.
      </p>
      <SyncLibraryAdmin initialRows={rows} artistPool={artistPool} isLeadership={isLeadership} />
    </div>
  )
}
