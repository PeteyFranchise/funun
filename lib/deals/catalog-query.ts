import type { SupabaseClient } from '@supabase/supabase-js'
import type { VaultProjectType } from '@/types'
import type { StaffRole } from '@/lib/admin/staff-role'
import { computeStage3 } from '@/lib/vault/stage3'
import { isProfileVisibleTo } from '@/lib/trust-safety/contracts'
import { loadBlockedIds } from '@/lib/green-room/discover'
import { readDescriptors } from '@/lib/metadata/schema'
import { syncReadinessForTrack, missingSyncItems } from '@/lib/sync-library/readiness'
import {
  isRightsReady,
  projectMatchesKeyBpm,
  projectMatchesDescriptors,
  projectMatchesUsageCleared,
  descriptorsToDisplay,
  catalogRightsFromStage3,
  type CatalogFilter,
  type CatalogCard,
} from '@/lib/deals/catalog'

// ─── loadCatalogPage (D-16, T-16-17/T-16-18/T-16-20/T-16-21) ──────────────
// The I/O half of the buyer catalog: queries vault_projects SERVER-SIDE
// ONLY via the service-role client (never a direct PostgREST surface to the
// buyer client, mirroring the people-search doctrine) so sync-library
// admission + Phase 13 visibility + block exclusion cannot be bypassed.
// Stage 3 is computed per project from a BOUNDED, paged fetch — never
// across the whole table per request (T-16-21).
//
// 26-06: catalogue membership is admission-driven, replacing the beta
// `is_public` gate. has_admitted_sync_listing is resolved per project via
// ONE batched sync_listings query (status = 'admitted') scoped to this
// page's project ids, then passed into isRightsReady — the SAME
// isAdmittedToSyncLibrary authority lib/deals/request-target.ts's
// authorizeRequestTarget uses (T-26-24 — no drift between the two gates).
//
// Lives in lib/ (not the route.ts file) because Next.js route modules may
// only export HTTP method handlers plus a small route-config set — any
// other export fails Next's route type-checking at build time. Both
// GET /api/buyer/catalog and app/sync/catalog/page.tsx's (23-02: renamed
// from app/(buyer-portal)/buyers/catalog/page.tsx) server-rendered first
// page import this one implementation, so the
// privacy gate can never drift between the two call sites (mirrors
// lib/deals/request-target.ts's authorizeRequestTarget precedent).
//
// 23-03: buyerUserId is `string | null` — a null caller is a logged-out
// public catalog visitor (RESEARCH Pitfall 3). loadBlockedIds's `.or(...)`
// filter is built against a uuid column, so passing an empty/anonymous
// sentinel through it throws `invalid input syntax for type uuid` rather
// than degrading gracefully. A visitor with no account can neither block
// nor be blocked (`blocks` rows only ever reference real auth.users ids),
// so the fix is to skip block resolution entirely when buyerUserId is
// null — NOT to fork a parallel public implementation (single-
// implementation doctrine, see the paragraph above).
//
// 30-07: enriches each CatalogCard with the real authored display fields
// (artist/mood/energy/vocal/instruments) and the real tri-state rights code
// — the minimal 22-05 slice this phase needs. artist resolves from the SAME
// batched user_profiles query already run for visibility (no new query);
// mood/energy/vocal/instruments come from the project's first descriptor-
// tagged track via descriptorsToDisplay(); rights reuses the stage3 already
// computed for the isRightsReady gate via catalogRightsFromStage3(), never
// recomputed or hardcoded. loadCatalogPage stays the single implementation
// — no parallel query module.
//
// 30-08: role-aware staff layers on this SAME query. When a caller passes a
// non-null, SERVER-RESOLVED staffMode (app/sync/catalog/page.tsx resolves
// this via getStaffRole(user) — never a client flag, T-30-02), each card
// additionally carries an optional `staff` object (readinessStatus,
// rightsDetail, artistNotes, inProgress) via ONE extra batched sync_listings
// query scoped to this page's project ids. When staffMode is null (every
// buyer/anon call, unchanged), no extra query runs and no card carries
// `staff` — the buyer-facing output stays byte-identical to before this
// plan. isRightsReady/isAdmittedToSyncLibrary above are NOT touched by
// staffMode — the buyer-visible row SET never changes for staff.

const PAGE_SIZE = 20

const PROJECT_COLUMNS = `
  id, title, type, genre, vault_readiness_score, user_id,
  cover_art_url, content_id_registered, content_id_dismissed_until,
  tracks (id, title, bpm, key_signature, metadata, writers, producers, mixing_engineer, mastering_engineer, has_sample, sample_details, isrc, iswc),
  vault_documents (id, type, status, track_id, document_data)
`

type CatalogProjectRow = {
  id: string
  title: string
  type: string
  genre: string | null
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
    isrc: string | null
    iswc: string | null
  }[]
  vault_documents: {
    id: string
    type: string
    status: string
    track_id: string | null
    document_data: Record<string, unknown> | null
  }[]
}

// ─── CatalogStaffLayer (30-08) ─────────────────────────────────────────
// Attached to a CatalogCard ONLY when loadCatalogPage's staffMode param is
// a server-resolved role — buyers/anon never see this field (T-30-02).
// readinessStatus: 'admitted' when the representative track's own
// sync_listings row is admitted; otherwise derived from
// syncReadinessForTrack (30-01, the sync-specific subset of the Wave 1
// engine) — 'needs_completion' when anything is missing, 'pending_admit'
// when the track's own readiness checklist is clear but not yet admitted.
// rightsDetail summarizes the SAME stage3 already computed above for the
// isRightsReady gate (never a second rights definition). artistNotes is
// sync_listings.staff_notes (migration 107). inProgress flags a project
// with another listing still moving through the gate (non-admitted,
// non-terminal — T-30-12), which the buyer-visible row set never surfaces.
export type CatalogStaffLayer = {
  readinessStatus: 'admitted' | 'pending_admit' | 'needs_completion'
  rightsDetail: string
  artistNotes: string | null
  inProgress: boolean
}

type CatalogCardWithStaff = CatalogCard & { staff?: CatalogStaffLayer }

// Non-admitted, non-terminal listing statuses (mirrors LEGAL_TRANSITIONS'
// pre-admission states, lib/sync-library/submission.ts) — a project with
// any listing in one of these is "in progress" toward admission.
const IN_PROGRESS_LISTING_STATUSES = new Set(['applied', 'invited', 'agreement_pending', 'pending_admit'])

export type CatalogPageResult = { data: CatalogCardWithStaff[]; page: number; pageSize: number }

export async function loadCatalogPage(
  service: SupabaseClient,
  buyerUserId: string | null,
  filter: CatalogFilter,
  page: number,
  staffMode: StaffRole | null = null
): Promise<CatalogPageResult> {
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = service
    .from('vault_projects')
    .select(PROJECT_COLUMNS)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filter.genre) query = query.eq('genre', filter.genre)

  const { data } = await query
  const projects = (data ?? []) as unknown as CatalogProjectRow[]

  if (projects.length === 0) {
    return { data: [], page, pageSize: PAGE_SIZE }
  }

  // Sync-library admission (26-06, T-26-24): ONE batched sync_listings
  // query scoped to this page's project ids resolves which projects have
  // at least one ADMITTED song, mapped onto each project before the
  // isRightsReady gate runs below — replaces the removed `.eq('is_public',
  // true)` membership filter above.
  const { data: admittedRows } = await service
    .from('sync_listings')
    .select('vault_project_id')
    .eq('status', 'admitted')
    .in(
      'vault_project_id',
      projects.map(p => p.id)
    )
  const admittedProjectIds = new Set(
    ((admittedRows ?? []) as { vault_project_id: string }[]).map(r => r.vault_project_id)
  )

  // 30-08: staff-layer batch — ONE additional batched query, scoped to this
  // page's project ids, run ONLY when staffMode is a server-resolved role.
  // Selects EVERY status (not just 'admitted') so readinessStatus/
  // inProgress can see in-flight listings the buyer-facing admittedRows
  // query above deliberately excludes. Buyer/anon calls (staffMode null)
  // never run this query.
  const listingsByProject = new Map<
    string,
    { status: string; track_id: string; staff_notes: string | null }[]
  >()
  if (staffMode) {
    const { data: staffListingRows } = await service
      .from('sync_listings')
      .select('vault_project_id, status, track_id, staff_notes')
      .in(
        'vault_project_id',
        projects.map(p => p.id)
      )
    for (const row of (staffListingRows ?? []) as {
      vault_project_id: string
      status: string
      track_id: string
      staff_notes: string | null
    }[]) {
      const list = listingsByProject.get(row.vault_project_id) ?? []
      list.push({ status: row.status, track_id: row.track_id, staff_notes: row.staff_notes })
      listingsByProject.set(row.vault_project_id, list)
    }
  }

  // Batch owner visibility + artist-name resolution (T-16-17/T-16-18,
  // 30-07) in the SAME single user_profiles query — no second batched
  // query, and no per-row lookup (mirrors app/(admin)/admin/sync-library/
  // page.tsx's artistNameById pattern, folded into the existing select).
  const ownerIds = Array.from(new Set(projects.map(p => p.user_id)))
  const { data: ownerRows } = await service
    .from('user_profiles')
    .select('id, profile_visibility, artist_name')
    .in('id', ownerIds)
  const ownerProfileRows = (ownerRows ?? []) as {
    id: string
    profile_visibility: string | null
    artist_name: string | null
  }[]
  const visibilityByOwner = new Map(
    ownerProfileRows.map(o => [
      o.id,
      o.profile_visibility === 'connections_only' ? ('connections_only' as const) : ('public' as const),
    ])
  )
  const artistNameByOwner = new Map(ownerProfileRows.map(o => [o.id, o.artist_name ?? '']))
  // Anonymous visitor: skip block resolution entirely (Pitfall 3) — there
  // is no real account id to check blocks against, and blockedIds stays
  // an empty set so the exclusion check below is inert for anon reads.
  const blockedIds = buyerUserId ? await loadBlockedIds(service, buyerUserId) : new Set<string>()

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

  const cards: CatalogCardWithStaff[] = []
  for (const project of projects) {
    // Buyers are a fully separate account model (D-11) — never a follower
    // or connection of the artist, so viewerIsOwner/viewerIsConnection are
    // always false here.
    const visibility = visibilityByOwner.get(project.user_id) ?? 'public'
    if (!isProfileVisibleTo(visibility, false, false)) continue
    if (blockedIds.has(project.user_id)) continue

    const tracks = project.tracks ?? []
    const stage3 = computeStage3(project, tracks, project.vault_documents ?? [], project.vault_readiness_score ?? 0)
    const hasAdmittedSyncListing = admittedProjectIds.has(project.id)
    if (!isRightsReady({ ...project, has_admitted_sync_listing: hasAdmittedSyncListing }, stage3)) continue

    if (!projectMatchesKeyBpm(tracks, filter)) continue
    if (!projectMatchesDescriptors(tracks, filter)) continue
    if (!projectMatchesUsageCleared(preclearedProjectIds.has(project.id), filter)) continue

    // 30-07: enriched display fields — the representative track is the
    // FIRST track carrying confirmed descriptors (readDescriptors non-null),
    // falling back to the project's first track (blank display) when none
    // of its tracks are tagged yet. rights reuses the SAME stage3 already
    // computed above for the isRightsReady gate — never recomputed.
    const representativeTrack = tracks.find(t => readDescriptors(t.metadata) != null) ?? tracks[0]
    const display = representativeTrack
      ? descriptorsToDisplay(representativeTrack)
      : { mood: '', energy: '', vocal: '', instruments: [] }

    const card: CatalogCardWithStaff = {
      id: project.id,
      title: project.title,
      type: project.type,
      genre: project.genre,
      coverArtUrl: project.cover_art_url,
      artist: artistNameByOwner.get(project.user_id) ?? '',
      mood: display.mood,
      energy: display.energy,
      vocal: display.vocal,
      instruments: display.instruments,
      rights: catalogRightsFromStage3(stage3),
      tracks: tracks.map(t => ({ id: t.id, title: t.title, bpm: t.bpm, keySignature: t.key_signature })),
    }

    // 30-08: attach the staff-only layer — never for buyers/anon (staffMode
    // null skips this block entirely, leaving `card.staff` undefined).
    if (staffMode) {
      const projectListings = listingsByProject.get(project.id) ?? []
      const inProgress = projectListings.some(l => IN_PROGRESS_LISTING_STATUSES.has(l.status))
      const repListing = representativeTrack
        ? projectListings.find(l => l.track_id === representativeTrack.id) ?? null
        : null
      const artistNotes =
        repListing?.staff_notes ?? projectListings.find(l => l.staff_notes != null)?.staff_notes ?? null

      let readinessStatus: CatalogStaffLayer['readinessStatus']
      if (repListing?.status === 'admitted') {
        readinessStatus = 'admitted'
      } else if (representativeTrack) {
        const items = syncReadinessForTrack({
          type: project.type as VaultProjectType,
          track: {
            id: representativeTrack.id,
            isrc: representativeTrack.isrc,
            iswc: representativeTrack.iswc,
            metadata: representativeTrack.metadata,
          },
          documents: project.vault_documents ?? [],
        })
        readinessStatus = missingSyncItems(items).length > 0 ? 'needs_completion' : 'pending_admit'
      } else {
        readinessStatus = 'needs_completion'
      }

      const rightsDetail = `${stage3.requiredComplete}/${stage3.requiredTotal} required rights documents signed${stage3.sampleBlock ? ' — sample clearance blocking' : ''}`

      card.staff = { readinessStatus, rightsDetail, artistNotes, inProgress }
    }

    cards.push(card)
  }

  return { data: cards, page, pageSize: PAGE_SIZE }
}
