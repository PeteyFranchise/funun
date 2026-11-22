import type { SupabaseClient } from '@supabase/supabase-js'
import type { VaultProjectType, SyncListingStatus } from '@/types'
import type { StaffRole } from '@/lib/admin/staff-role'
import { computeStage3 } from '@/lib/vault/stage3'
import { readinessItemsForProject } from '@/lib/vault/readiness'
import { isProfileVisibleTo } from '@/lib/trust-safety/contracts'
import { loadBlockedIds } from '@/lib/green-room/discover'
import { readDescriptors } from '@/lib/metadata/schema'
import { syncReadinessForTrack, missingSyncItems } from '@/lib/sync-library/readiness'
import { isSyncEligibleProjectType } from '@/lib/sync-library/readiness'
import {
  trackExposure,
  resolveListingStatus,
  type ListingStatusRow,
} from '@/lib/sync-library/track-exposure'
import {
  isReadWithheld,
  STAFF_RIGHTS_DETAIL_WITHHELD,
} from '@/lib/deals/buyer-song-unit-read-withholding'
import {
  trackClearance,
  clearanceToCatalogRights,
  type TrackClearance,
} from '@/lib/sync-library/track-clearance'
import {
  projectMatchesKeyBpm,
  projectMatchesDescriptors,
  projectMatchesUsageCleared,
  descriptorsToDisplay,
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
  tracks (id, title, bpm, key_signature, audio_file_url, metadata, writers, producers, mixing_engineer, mastering_engineer, has_sample, sample_details, isrc, iswc),
  vault_documents (id, type, status, track_id, document_data),
  vault_assets (id, type)
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
    /**
     * D-11's proof of a playable finished master. trackExposure requires it;
     * omitting it from the select above fails CLOSED (every track reads
     * no_playable_master and the catalogue empties), which is the safe
     * direction but still a bug.
     */
    audio_file_url: string | null
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
  // 2026-09-10: the six-item catalogue entry gate includes `visual_asset`
  // (cover art), which readinessItemsForProject() derives from vault_assets
  // — NOT from vault_projects.cover_art_url, which is only a denormalized
  // display mirror written alongside the asset row (see
  // app/api/vault/[projectId]/assets/route.ts). Selecting the asset rows is
  // what keeps this gate reading the same source the readiness engine and
  // migration 070's DB trigger already read.
  vault_assets: { id: string; type: string }[]
}

// ─── CatalogStaffLayer (30-08) ─────────────────────────────────────────
// Attached to a CatalogCard ONLY when loadCatalogPage's staffMode param is
// a server-resolved role — buyers/anon never see this field (T-30-02).
// readinessStatus: 'admitted' when the representative track's own
// sync_listings row is admitted; otherwise derived from
// syncReadinessForTrack (30-01, the sync-specific subset of the Wave 1
// engine) — 'needs_completion' when anything is missing, 'pending_admit'
// when the track's own readiness checklist is clear but not yet admitted.
// CONSEQUENCE OF THE 2026-09-10 ENTRY-GATE CHANGE, stated rather than left
// to surprise someone: this label is derived from SYNC_READINESS_KEYS, the
// SAME list isRightsReady() now gates on, so narrowing that list to the six
// decided entry items moved this label too. A track missing only an ISRC
// used to read needs_completion and now reads pending_admit. That is
// intended — staff should see exactly the bar the catalogue enforces, so
// 'pending_admit' means "will be visible to buyers the moment it is
// admitted" rather than "clear on a checklist the catalogue disagrees with".
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

// 261121-qt2 Task 1: catalogueWithheld is a REAL signal carried out of this
// query, not recomputed by a caller. It answers one question only — "did
// buyer_catalogue_row suppress this caller's rows?" — and is REQUIRED, never
// optional. An optional boolean lets a caller forget to set it and read
// `undefined`, which is falsy, which silently means "not withheld": the
// exact fail-open shape this phase has spent a week removing. Required means
// every caller is a compile error until it is handled.
export type CatalogPageResult = {
  data: CatalogCardWithStaff[]
  page: number
  pageSize: number
  catalogueWithheld: boolean
}

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
    // Genuinely empty, not suppressed. 261121-qt2: a buyer with nothing to
    // see must be told "nothing in here yet", never "clearance is being
    // confirmed" — the two are different facts and the UI can no longer
    // guess between them from rows.length alone.
    return { data: [], page, pageSize: PAGE_SIZE, catalogueWithheld: false }
  }

  // Sync-library admission (26-06, T-26-24): ONE batched sync_listings
  // query scoped to this page's project ids resolves which projects have
  // at least one ADMITTED song, mapped onto each project before the
  // isRightsReady gate runs below — replaces the removed `.eq('is_public',
  // true)` membership filter above.
  //
  // 2026-09-10 (defect 4): this query also selects `track_id`. Admission is
  // SONG-level — staff admit one track, not a project — and the card the
  // buyer reads has to describe THAT song. See admittedTrackIdsByProject
  // below and its use at the representative-track choice.
  // 2026-10-11 (owner decision D-11, plan 50-05 Task 3): this query no longer
  // filters `.eq('status', 'admitted')`. Exposure is decided per track by
  // trackExposure, whose contract is "the status of THIS track's own listing
  // row" — including the terminal states, which rank above everything. Fetching
  // only the admitted rows would hand that function a filtered view and let it
  // answer 'not_admitted' where the truth is 'unavailable'. Same ONE batched
  // query, scoped to this page's project ids; `created_at` comes along because
  // resolveListingStatus needs it to pick the latest terminal row.
  //
  // Still buyer-safe: `staff_notes` is deliberately NOT selected here. The
  // staff-only batch below remains separate so a buyer/anon read never fetches
  // staff commentary.
  const { data: listingRows } = await service
    .from('sync_listings')
    .select('vault_project_id, track_id, status, created_at')
    .in(
      'vault_project_id',
      projects.map(p => p.id)
    )
  // "projectId:trackId" -> every listing row that track has ever had.
  // resolveListingStatus collapses it to the one row that describes the track
  // now (active wins; terminal rows are history — migration 096's partial
  // unique index allows re-submission after a terminal outcome, so both can
  // coexist on one track).
  //
  // KEYED BY PROJECT AND TRACK, not by track alone. tracks.id is a primary key,
  // so in production a track id already belongs to exactly one project and the
  // project half is redundant — which is precisely the argument for including
  // it. A lookup that is correct only because of an invariant it does not check
  // is the shape of a cross-tenant disclosure, and this one is applying an
  // admission decision; the composite key costs nothing and makes a listing
  // unable to reach a track on any other project.
  const listingRowsByTrack = new Map<string, ListingStatusRow[]>()
  const listingKey = (projectId: string, trackId: string) => `${projectId}:${trackId}`
  for (const r of (listingRows ?? []) as {
    vault_project_id: string
    track_id: string | null
    status: SyncListingStatus
    created_at: string | null
  }[]) {
    // A listing with no track_id names no song, so it can expose none (D-11:
    // exposure is per exact track). Skipped rather than treated as a
    // project-wide admission, which is what the pre-D-11 fallback did.
    if (!r.track_id) continue
    const key = listingKey(r.vault_project_id, r.track_id)
    const rows = listingRowsByTrack.get(key) ?? []
    rows.push({ status: r.status, created_at: r.created_at })
    listingRowsByTrack.set(key, rows)
  }

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
  //
  // A FAILED lookup for a real buyer is deliberately NOT caught here. The
  // exclusion below is the only thing keeping a blocked artist's catalogue
  // out of this buyer's results, so an unreadable block set means this
  // function cannot produce a result it is allowed to return — and an empty
  // page would be a worse lie than an error, since it renders as "nothing
  // matched". The throw carries loadBlockedIds' generic BLOCK_LOOKUP_FAILED
  // message, never a Postgres string, so every caller (two server-rendered
  // catalogue pages, two API routes) surfaces a plain failure.
  const blockedIds = buyerUserId ? await loadBlockedIds(service, buyerUserId) : new Set<string>()

  // Usage-cleared filter (D-15): one batched existence check against
  // project_license_terms, not a per-project query.
  let preclearedProjectIds = new Set<string>()
  // 50.5 Task 2 — WITHHELD. This existence check is against
  // project_license_terms, so one project row clears every song in it. Fail
  // closed: match nothing rather than vouch for songs whose terms were never
  // written. The filter affordance is removed from the buyer UI alongside this,
  // so an empty result is not what a user sees.
  if (filter.usageCleared && !isReadWithheld('usage_cleared_filter')) {
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
    // vault_projects.type is TEXT in the row shape; narrowed ONCE here and
    // reused by the eligibility check, the readiness engine, the clearance
    // evaluator and the staff layer below, so all four read the same value.
    const projectType = project.type as VaultProjectType

    // ─── Project type: an ADMISSION precondition, re-checked here ────────
    // D-11's admission bar includes "a valid project type", and staff enforce
    // it at the admission route. Re-checking it at the read surface is defence
    // in depth, not a second definition — SYNC_ELIGIBLE_PROJECT_TYPES stays the
    // single authority and is consumed, never restated.
    //
    // It is deliberately NOT part of exposure. trackExposure's input type
    // cannot express a project type at all, which is how D-11's "a truthful
    // `unreleased` project label does not block it" is guaranteed rather than
    // asserted — and 'unreleased' is inside the eligible set, so this check
    // does not reintroduce that block. What it still excludes is a format that
    // was never licensable, e.g. 'snippet'.
    if (!isSyncEligibleProjectType(projectType)) continue

    // ─── D-11: EXPOSURE IS DECIDED PER TRACK ────────────────────────────
    // What this replaced, stated plainly because the defect is subtle: this
    // line used to be a project-level `isRightsReady(project, readinessItems)`
    // refusal, where `readinessItems` came from readinessItemsForProject —
    // which spans EVERY track on the project. One incomplete sibling made that
    // list incomplete, the whole project failed the gate, and an admitted
    // complete track was hidden behind its unfinished EP-mate. D-11:
    //
    //   "A complete admitted track is never hidden because a sibling track on
    //    the same EP or album is incomplete."
    //
    // So each track is asked about itself, from its OWN listing row and its own
    // bound master. A project contributes its exposed tracks and is skipped
    // entirely when it has none.
    const exposedTracks = tracks.filter(
      t =>
        trackExposure({
          trackId: t.id,
          audioFileUrl: t.audio_file_url,
          listingStatus: resolveListingStatus(listingRowsByTrack.get(listingKey(project.id, t.id)) ?? []),
        }).status === 'exposed'
    )
    if (exposedTracks.length === 0) continue

    // Readiness is still computed — but as a CLEARANCE input now, never a
    // visibility gate (D-11 moved the six sync keys to the clearance question;
    // see syncReadinessCoverage's rename note in lib/deals/catalog.ts). Computed
    // ONCE per project and reused by the clearance evaluator and the staff layer
    // below, so there is no second independently-derived readiness signal.
    const readinessItems = readinessItemsForProject({
      type: projectType,
      tracks,
      assets: project.vault_assets ?? [],
      documents: project.vault_documents ?? [],
    })

    // ─── Clearance: the BADGE, never a filter ───────────────────────────
    // Evaluated per exposed track through the single trackClearance authority.
    // `aiProvenance: null` is the documented interim argument until plan 50-02
    // lands: trackClearance treats null as unresolved and can never return
    // 'rights_ready' for it, so every track currently reads
    // 'clearance_required'. That is honest (AI involvement genuinely is not
    // established yet), it fails closed, and — this is the D-11 point — it
    // changes NO exposure outcome. A non-ready clearance moves a badge and
    // routes the buyer to Funūn; it never removes a track from the catalogue.
    const clearanceByTrack = new Map<string, TrackClearance>()
    for (const t of exposedTracks) {
      clearanceByTrack.set(
        t.id,
        trackClearance({
          exposure: {
            trackId: t.id,
            audioFileUrl: t.audio_file_url,
            listingStatus: resolveListingStatus(listingRowsByTrack.get(listingKey(project.id, t.id)) ?? []),
          },
          project: { has_admitted_sync_listing: true, type: projectType },
          readinessItems,
          stage3,
          aiProvenance: null,
        })
      )
    }

    if (!projectMatchesKeyBpm(tracks, filter)) continue
    if (!projectMatchesDescriptors(tracks, filter)) continue
    if (!projectMatchesUsageCleared(preclearedProjectIds.has(project.id), filter)) continue

    // ─── The representative track (2026-09-10, defect 4) ────────────────
    // This is the song whose mood/energy/vocal/instruments the buyer reads
    // on the card, and — via repListing below — whose staff readiness label
    // and notes are shown.
    //
    // It used to be `tracks.find(t => readDescriptors(t.metadata) != null)`:
    // chosen purely by which track happened to be TAGGED, with no relation
    // to which track was actually ADMITTED. On a multi-track project that
    // shows a buyer one song's descriptors for a project admitted on a
    // DIFFERENT song — the card says "sparse, ambient, no vocal" about a
    // recording nobody may license. Admission is song-level (26-06); the
    // card must follow admission, not tagging.
    //
    // Order of preference, most specific first:
    //   1. an ADMITTED track that is also descriptor-tagged — correct AND
    //      it has something to display;
    //   2. any ADMITTED track — correct, even if it renders blank
    //      descriptors. A blank field is honest; another song's data is not;
    //   3. the pre-2026-09-10 rule (first tagged track, else the first
    //      track). Reached only when NO admitted track id resolves against
    //      this project's rows — a listing whose track_id is null, or a
    //      track that has since been deleted from the project. The gate
    //      above has already established the project IS admitted, so
    //      returning no card at all would hide a listed song over a display
    //      detail; the old behaviour is the safer fallback.
    //   2026-10-11 (D-11, plan 50-05 Task 3): the candidate set is now the
    //      EXPOSED tracks rather than the merely-admitted ones, and the third
    //      fallback is GONE. It used to reach for any track on the project when
    //      no admitted id resolved — safe under the old project-level gate,
    //      which had already established the project was admitted. Under
    //      per-track exposure that premise no longer holds: `exposedTracks` is
    //      non-empty by the check above, so a fallback to a non-exposed track
    //      could only ever describe the card with a song no buyer may have.
    const representativeTrack =
      exposedTracks.find(t => readDescriptors(t.metadata) != null) ?? exposedTracks[0]
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
      // D-11 makes the buyer-facing rights answer binary — rights ready, or
      // contact Funūn — so the badge comes from the representative exposed
      // track's CLEARANCE rather than from catalogRightsFromStage3's
      // project-level Stage3 tri-state. rightsBadge is not bypassed: it is
      // consumed inside trackClearance, which only adds the two facts it never
      // considered (the terminal listing state and AI provenance). 'part'
      // therefore stops being emitted here; the distinction it drew survives
      // itemised in TrackClearance.outstanding, which S5c renders.
      // 50.5 Task 2 — WITHHELD. The badge below reads the REPRESENTATIVE
      // exposed track's clearance and renders it for the whole card, so a
      // multi-song project shows one sibling's answer as every song's. Until
      // the row is one captured song, fail closed to 'req' (contact Funūn)
      // rather than publish a borrowed answer. Note this is also what every
      // song resolves to today anyway, because aiProvenance is passed null
      // below and trackClearance treats unresolved as not cleared.
      rights: isReadWithheld('buyer_clearance_badge')
        ? 'req'
        : clearanceToCatalogRights(clearanceByTrack.get(representativeTrack.id)?.status),
      // The DISTINCT signal. Reusing 'req' above made withheld and open
      // identical, so a deleted call site changed nothing observable and the
      // negative control could not fail. `rightsWithheld` is what the badge
      // and the tests actually read.
      rightsWithheld: isReadWithheld('buyer_clearance_badge') || undefined,
      // C-01 (.planning/deliberations/2026-10-05-pass-5-rights-eligibility-
      // review.md): admission is song-level (26-06), so a card must never
      // imply a track is licensable just because a project sibling is
      // admitted. Built from `admittedTracks` (per-track admission,
      // computed above for the representative-track pick), not the full
      // `tracks` array -- a never-reviewed sibling must not ride along on
      // its admitted sibling's coattails. Every downstream consumer
      // inherits this with no code change of its own:
      // components/buyer/CatalogBrowser.tsx's card renderer,
      // app/api/admin/selects/catalog/route.ts's staff search (whose own
      // header comment already claims "nothing not-admitted can be
      // searched here at all" -- that claim becomes true only after this
      // change), app/selects/[token]/page.tsx's public Suggested Songs
      // widget, and lib/deals/catalog-sample.ts's mapCardsToLightRows.
      tracks: exposedTracks.map(t => ({
        id: t.id,
        title: t.title,
        bpm: t.bpm,
        keySignature: t.key_signature,
        // D-11's second result, carried per track so the two Selects
        // consumers that flatten this array (app/api/admin/selects/catalog/
        // route.ts and app/selects/[token]/page.tsx) inherit the right answer
        // without either file changing. Additive: neither reads it yet.
        clearance: clearanceByTrack.get(t.id)?.status ?? 'clearance_required',
      })),
    }

    // 30-08: attach the staff-only layer — never for buyers/anon (staffMode
    // null skips this block entirely, leaving `card.staff` undefined).
    if (staffMode) {
      const projectListings = listingsByProject.get(project.id) ?? []
      const inProgress = projectListings.some(l => IN_PROGRESS_LISTING_STATUSES.has(l.status))
      const repListing = representativeTrack
        ? projectListings.find(l => l.track_id === representativeTrack.id) ?? null
        : null
      // 50.5 Task 2 — WITHHELD fallback. The second clause takes a note
      // written about a DIFFERENT song in the same project and shows it on
      // this one. Use only this song's own note.
      const artistNotes = isReadWithheld('staff_sibling_note_fallback')
        ? repListing?.staff_notes ?? null
        : repListing?.staff_notes ?? projectListings.find(l => l.staff_notes != null)?.staff_notes ?? null

      let readinessStatus: CatalogStaffLayer['readinessStatus']
      if (repListing?.status === 'admitted') {
        readinessStatus = 'admitted'
      } else if (representativeTrack) {
        const items = syncReadinessForTrack({
          type: projectType,
          track: {
            id: representativeTrack.id,
            isrc: representativeTrack.isrc,
            iswc: representativeTrack.iswc,
            metadata: representativeTrack.metadata,
            // 2026-09-10 (defect 1): without these the hire_right item reads
            // 'missing' on a self-produced recording, and this staff label
            // would say needs_completion for a song the buyer gate admits.
            producers: representativeTrack.producers,
            mixing_engineer: representativeTrack.mixing_engineer,
            mastering_engineer: representativeTrack.mastering_engineer,
          },
          assets: project.vault_assets ?? [],
          documents: project.vault_documents ?? [],
        })
        readinessStatus = missingSyncItems(items).length > 0 ? 'needs_completion' : 'pending_admit'
      } else {
        readinessStatus = 'needs_completion'
      }

      // 50.5 Task 2 — WITHHELD. This fraction is summed across the whole
      // PROJECT (stage3.requiredComplete / requiredTotal), so it names no song,
      // no requirement and no person. It is a progress bar nobody can act on,
      // shown where staff need a to-do list. Task 10 replaces it with the
      // per-song action list; until then it says so rather than implying the
      // number describes this song.
      const rightsDetail = isReadWithheld('staff_rights_detail')
        ? STAFF_RIGHTS_DETAIL_WITHHELD
        : `${stage3.requiredComplete}/${stage3.requiredTotal} required rights documents signed${stage3.sampleBlock ? ' — sample clearance blocking' : ''}`

      card.staff = { readinessStatus, rightsDetail, artistNotes, inProgress }
    }

    cards.push(card)
  }

  // 50.5 Task 2 — WITHHELD: the buyer catalogue row itself.
  //
  // Every card above is built from a vault_projects row: its id, title, genre
  // and artwork are the PROJECT's, and the UI renders them under "Song /
  // Artist". Softening the licence copy does not fix that; the row is the
  // defect. Tasks 8 and 9 replace it with one captured song plus matching
  // playback, and this comes off then.
  //
  // STAFF KEEP THEIR ROWS. They need to work the queue, they can see the
  // project context, and the staff layer is separately withheld above.
  //
  // This is a GUARD, not a removal: sync_listings held zero rows at the last
  // preflight (2026-10-11), so no buyer sees a change today. It fails closed
  // the moment a song is admitted.
  // 261121-qt2 Task 1: this is the ONE true source of catalogueWithheld —
  // never recomputed from rows.length by a caller. STAFF ARE NOT SUPPRESSED
  // (the staffMode === null half of this same guard), so a staff caller
  // reads false here even though the flag itself is on. "The flag is on"
  // and "this caller's rows were suppressed" are different facts, and only
  // the second is what the empty state is about.
  if (staffMode === null && isReadWithheld('buyer_catalogue_row')) {
    return { data: [], page, pageSize: PAGE_SIZE, catalogueWithheld: true }
  }

  return { data: cards, page, pageSize: PAGE_SIZE, catalogueWithheld: false }
}
