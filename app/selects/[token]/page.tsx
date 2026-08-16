import { cache } from 'react'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { createServiceClient, createServerClient } from '@/lib/supabase/server'
import { getPreviewSignedUrl } from '@/lib/watermark/signed-url'
import { getStaffRole } from '@/lib/admin/staff-role'
import { buildCatalogFilter } from '@/lib/deals/catalog'
import { loadCatalogPage } from '@/lib/deals/catalog-query'
import { resolveSelectsByToken, loadPublicSelectsTracks } from '@/lib/selects/public-resolve'
import { SELECTS_VIEWER_COOKIE } from '@/lib/selects/viewer-cookie'
import SelectsPlayer, {
  type PlayerAttribution,
  type PlayerReaction,
  type PlayerTrack,
  type SuggestedTrack,
  type SelectsPlayerData,
} from '@/components/selects-player/SelectsPlayer'

type Props = { params: Promise<{ token: string }> }

const OG_TITLE_FALLBACK = "This link isn't live. · Funūn"
const SUGGESTED_LIMIT = 5

function truncate(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}

function formatUpdated(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = now - then
  if (diffMs < 0 || Number.isNaN(diffMs)) return 'recently'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── resolvePlayerData — the ONE query this route runs, deduped across ────
// generateMetadata + the page component via React's cache() (same request,
// same result — avoids running this twice per request). Resolved SOLELY by
// selects.share_token — see resolveSelectsByToken; there is no id path.
const resolvePlayerData = cache(async (token: string): Promise<SelectsPlayerData | null> => {
  const service = createServiceClient()
  const selects = await resolveSelectsByToken(service, token)
  if (!selects) return null

  const [{ data: orgRow }, { data: aeAuthUser }] = await Promise.all([
    service.from('buyer_orgs').select('name').eq('id', selects.buyer_org_id).maybeSingle(),
    service.auth.admin.getUserById(selects.created_by),
  ])
  const orgName = (orgRow as { name: string } | null)?.name ?? 'your team'
  const aeName =
    (aeAuthUser?.user?.user_metadata as { display_name?: string } | undefined)?.display_name?.trim() ||
    'Your Funūn AE'

  const rows = await loadPublicSelectsTracks(service, selects.id)

  const trackIds = Array.from(new Set(rows.map(r => r.track_id)))
  const { data: trackRows } =
    trackIds.length > 0
      ? await service.from('tracks').select('id, project_id, title, duration_seconds').in('id', trackIds)
      : { data: [] as { id: string; project_id: string; title: string | null; duration_seconds: number | null }[] }
  const trackById = new Map(
    ((trackRows ?? []) as { id: string; project_id: string; title: string | null; duration_seconds: number | null }[]).map(
      t => [t.id, t]
    )
  )

  const projectIds = Array.from(new Set([...trackById.values()].map(t => t.project_id)))
  const { data: projectRows } =
    projectIds.length > 0
      ? await service.from('vault_projects').select('id, cover_art_url, user_id').in('id', projectIds)
      : { data: [] as { id: string; cover_art_url: string | null; user_id: string }[] }
  const projectById = new Map(
    ((projectRows ?? []) as { id: string; cover_art_url: string | null; user_id: string }[]).map(p => [p.id, p])
  )

  const ownerIds = Array.from(new Set([...projectById.values()].map(p => p.user_id)))
  const { data: ownerRows } =
    ownerIds.length > 0
      ? await service.from('user_profiles').select('id, artist_name').in('id', ownerIds)
      : { data: [] as { id: string; artist_name: string | null }[] }
  const artistNameByOwner = new Map(
    ((ownerRows ?? []) as { id: string; artist_name: string | null }[]).map(o => [o.id, o.artist_name ?? ''])
  )

  // Attribution — who added each track (AE vs client), one lookup per
  // unique added_by (typically 1-2 people, never a per-page-load N-scan).
  const adderIds = Array.from(new Set(rows.map(r => r.added_by).filter((id): id is string => !!id)))
  const adderById = new Map<string, PlayerAttribution>()
  await Promise.all(
    adderIds.map(async id => {
      try {
        const { data: u } = await service.auth.admin.getUserById(id)
        const name =
          (u?.user?.user_metadata as { display_name?: string } | undefined)?.display_name?.trim() || 'A teammate'
        const isStaff = u?.user ? getStaffRole({ app_metadata: u.user.app_metadata }) != null : false
        adderById.set(id, { name, kind: isStaff ? 'ae' : 'client' })
      } catch {
        adderById.set(id, { name: 'A teammate', kind: 'ae' })
      }
    })
  )

  // Audio — the ONLY accessor (31-12): resolved server-side via
  // getPreviewSignedUrl, per track_id, never the master bucket.
  const previewByTrackId = new Map<string, Awaited<ReturnType<typeof getPreviewSignedUrl>>>()
  await Promise.all(
    trackIds.map(async id => {
      previewByTrackId.set(id, await getPreviewSignedUrl(id))
    })
  )

  // Hydrate the current viewer's own reactions — an authenticated Client
  // Partner via reacted_by, or a returning guest via the funun_svk cookie
  // (set client-side on first visit, see SelectsPlayer.tsx's ensureViewerKey).
  const cookieStore = await cookies()
  const viewerKeyCookie = cookieStore.get(SELECTS_VIEWER_COOKIE)?.value ?? null
  const serverClient = await createServerClient()
  const {
    data: { user: viewerUser },
  } = await serverClient.auth.getUser()

  let isClientPartner = false
  if (viewerUser) {
    const { data: member } = await service.from('buyer_members').select('user_id').eq('user_id', viewerUser.id).maybeSingle()
    isClientPartner = member != null
  }

  const reactionByRowId = new Map<string, PlayerReaction>()
  const rowIds = rows.map(r => r.id)
  if (rowIds.length > 0 && (viewerUser || viewerKeyCookie)) {
    let query = service.from('selects_reactions').select('selects_track_id, reaction').in('selects_track_id', rowIds)
    query = viewerUser ? query.eq('reacted_by', viewerUser.id) : query.eq('viewer_key', viewerKeyCookie!)
    const { data: reactionRows } = await query
    for (const r of (reactionRows ?? []) as { selects_track_id: string; reaction: PlayerReaction }[]) {
      reactionByRowId.set(r.selects_track_id, r.reaction)
    }
  }

  const tracks: PlayerTrack[] = rows.map(row => {
    const trackRow = trackById.get(row.track_id)
    const project = trackRow ? projectById.get(trackRow.project_id) : undefined
    const artist = project ? artistNameByOwner.get(project.user_id) || 'Unknown Artist' : 'Unknown Artist'
    return {
      rowId: row.id,
      trackId: row.track_id,
      title: trackRow?.title ?? 'Untitled',
      artist,
      durationSeconds: trackRow?.duration_seconds ?? null,
      coverArtUrl: project?.cover_art_url ?? null,
      note: row.note,
      attribution: row.added_by ? (adderById.get(row.added_by) ?? null) : null,
      reaction: reactionByRowId.get(row.id) ?? null,
      preview: previewByTrackId.get(row.track_id) ?? { status: 'processing' },
    }
  })

  // Suggested Songs — a lightweight rights-ready sample sourced from the
  // SAME catalogue query the buyer catalogue uses (lib/deals/catalog*),
  // excluding tracks already curated into this Selects. NOT the AI Vibe
  // Match tool (out of scope, see .planning notes on project_vibe_match_tool
  // — this is a seed of it, per 31-UI-SPEC).
  const alreadyIncluded = new Set(trackIds)
  const suggested: SuggestedTrack[] = []
  try {
    const catalogPage = await loadCatalogPage(service, null, buildCatalogFilter({}), 1, null)
    outer: for (const card of catalogPage.data) {
      for (const t of card.tracks) {
        if (suggested.length >= SUGGESTED_LIMIT) break outer
        if (alreadyIncluded.has(t.id)) continue
        suggested.push({
          trackId: t.id,
          title: t.title ?? card.title,
          artist: card.artist,
          coverArtUrl: card.coverArtUrl,
          durationSeconds: null,
        })
      }
    }
  } catch {
    // Suggested Songs is a nice-to-have enrichment — never fail the core
    // player render if the catalogue query has a transient issue.
  }

  return {
    token,
    name: selects.name,
    coverNote: selects.cover_note,
    orgName,
    aeName,
    updatedLabel: formatUpdated(selects.updated_at),
    status: selects.status as SelectsPlayerData['status'],
    isClientPartner,
    tracks,
    suggested,
  }
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const data = await resolvePlayerData(token)
  if (!data) {
    return { title: OG_TITLE_FALLBACK, description: undefined }
  }

  const title = `${data.name} · A Selects from Funūn`
  const description = data.coverNote
    ? truncate(data.coverNote, 160)
    : `${data.tracks.length} track${data.tracks.length === 1 ? '' : 's'} curated for ${data.orgName}.`

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

// ─── the safe "leaks nothing" invalid/expired-token state (R12) ──────────
function InvalidLinkState() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        textAlign: 'center',
        background: '#0a0a0f',
        color: '#ffffff',
        fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,sans-serif',
      }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        stroke="#7c80b4"
        fill="none"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 15L15 9" />
        <path d="M11 6l1-1a3.5 3.5 0 0 1 5 5l-1 1" />
        <path d="M13 18l-1 1a3.5 3.5 0 0 1-5-5l1-1" />
      </svg>
      <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0 }}>This link isn&rsquo;t live.</h1>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: '#C7CBF7', maxWidth: 360, margin: 0 }}>
        Links expire or get swapped out — ping whoever sent it and they can send you a fresh one.
      </p>
    </div>
  )
}

export default async function SelectsPlayerPage({ params }: Props) {
  const { token } = await params
  // Resolved ONLY via selects.share_token (resolveSelectsByToken) — there
  // is deliberately no id-addressable variant of this route (R11/R12).
  const data = await resolvePlayerData(token)
  if (!data) {
    return <InvalidLinkState />
  }
  return <SelectsPlayer data={data} />
}
