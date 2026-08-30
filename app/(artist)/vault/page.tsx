import Link from 'next/link'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import type { VaultProjectStatus } from '@/types'
import { readinessItemsForProject } from '@/lib/vault/readiness'
import type { VaultProjectRow } from '@/lib/vault/demo'
import { getDemoProjects } from '@/lib/vault/demo-store'
import { VaultBrowser } from '@/components/vault/VaultBrowser'
import { VaultProjectCard, type VaultCard } from '@/components/vault/VaultProjectCard'
import type { ProjectRole } from '@/lib/vault/membership'
import { Topbar, TopbarSearch } from '@/components/layout/Topbar'
import { CatalogueShelf } from '@/components/catalogue/CatalogueShelf'
import type { CatalogueCard, CatalogueWorkCard, CatalogueWorkContributor } from '@/components/catalogue/WorkCard'
import { latestVersion, type WorkVersionRecord } from '@/lib/catalogue/versions'
import type { Work } from '@/types/catalogue'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

function laneFor(status: VaultProjectStatus, releaseDate: string | null): VaultCard['lane'] {
  if (status === 'released') return 'live'
  if (releaseDate) return 'scheduled'
  return 'draft'
}

// ─── My Catalogue — the works query shapes (S-03, S-01) ─────────────────
// One embedded select shared by the owned-works query and the
// member-works query below, mirroring exactly how the existing Releases
// query above embeds tracks/vault_assets/vault_documents/tool_outputs on
// vault_projects. `work_members` is embedded here for its RLS-visible
// slice only: migration 136's `work_members_select` policy returns the
// FULL roster to the work's owner but only the VIEWER'S OWN row to a
// contribute-tier member — so a work this viewer merely belongs to shows
// just themselves in the contributor cluster, never a stranger's row it
// was never allowed to see. This is RLS working as designed, not a bug.
const WORKS_EMBED = `
  *,
  work_versions (id, source, created_at),
  lyric_blocks (id, updated_at),
  work_members (id, user_id, collaborator_id, tier)
`

type WorkVersionEmbed = { id: string; source: 'hum' | 'upload'; created_at: string }
type LyricBlockEmbed = { id: string; updated_at: string }
type WorkMemberEmbed = { id: string; user_id: string | null; collaborator_id: string | null; tier: string }
type WorkRow = Work & {
  work_versions: WorkVersionEmbed[] | null
  lyric_blocks: LyricBlockEmbed[] | null
  work_members: WorkMemberEmbed[] | null
}

function initialOf(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  return trimmed ? trimmed[0]!.toUpperCase() : '?'
}

/**
 * Maps one `WorkRow` to `WorkCard.tsx`'s `CatalogueWorkCard`. Pure
 * presentation glue — the numeral comes from `latestVersion()`
 * (lib/catalogue/versions.ts, consumed not reimplemented); nothing here
 * re-derives a numeral of its own.
 */
function buildWorkCard(
  work: WorkRow,
  ctx: {
    viewerId: string
    viewerArtistName: string | null
    collabNameById: Map<string, string>
    workOwnerNameById: Map<string, string | null>
    sheetByWorkId: Map<string, { status: CatalogueWorkCard['splitsStatus']; partyCount: number }>
  }
): CatalogueWorkCard {
  const versions = work.work_versions ?? []
  const blocks = work.lyric_blocks ?? []
  const members = work.work_members ?? []

  const versionRecords: WorkVersionRecord[] = versions.map(v => ({
    id: v.id,
    source: v.source,
    label: null,
    created_at: v.created_at,
    audio_path: '',
    audio_ext: '',
    duration_seconds: null,
  }))
  const latest = latestVersion(versionRecords)

  const ownerName =
    work.user_id === ctx.viewerId ? ctx.viewerArtistName : (ctx.workOwnerNameById.get(work.user_id) ?? null)

  // The owner's own work_members row always has collaborator_id === null
  // (POST /api/works, plan 05) — that null is what distinguishes the
  // owner's dot from a collaborator's, not a separate stored flag.
  const contributors: CatalogueWorkContributor[] = members.map(m => {
    const isOwner = !m.collaborator_id
    const name = isOwner ? ownerName : (ctx.collabNameById.get(m.collaborator_id ?? '') ?? null)
    return { id: m.id, initial: initialOf(name), name, isOwner }
  })

  const timestamps = [work.updated_at, ...versions.map(v => v.created_at), ...blocks.map(b => b.updated_at)]
  const lastActivityAt = timestamps.reduce((max, t) => (t && t > max ? t : max), work.created_at)

  const sheet = ctx.sheetByWorkId.get(work.id)

  return {
    kind: 'work',
    id: work.id,
    title: work.title,
    versionCount: versionRecords.length,
    latestVersionNumeral: latest ? latest.numeral : null,
    blockCount: blocks.length,
    contributors,
    splitsStatus: sheet ? sheet.status : 'none',
    writerCount: sheet ? sheet.partyCount : 0,
    lastActivityAt,
  }
}

export default async function VaultPage() {
  let projects: VaultProjectRow[] = []
  let artist: string | null = null
  let error: { message: string } | null = null
  // "Shared with me" lane (③) — populated only in the live (non-demo) path
  // below. Kept as a wholly separate array from `projects`/`cards`; never
  // merged into the owned grid or its counts.
  let sharedProjects: VaultProjectRow[] = []
  let sharedOwnerNameById = new Map<string, string | null>()
  let sharedRoleByProjectId = new Map<string, ProjectRole>()

  // My Catalogue's own arrays — [] by default so the demo path (which has
  // no `works` table at all) renders the shelf's empty state instead of
  // erroring, exactly like every other demo-mode branch on this page.
  let ownedWorks: WorkRow[] = []
  let memberWorks: WorkRow[] = []
  let collabNameById = new Map<string, string>()
  let workOwnerNameById = new Map<string, string | null>()
  let sheetByWorkId = new Map<string, { status: CatalogueWorkCard['splitsStatus']; partyCount: number }>()
  // The signed-in viewer's own id — captured once, straight from the auth
  // call, and threaded into buildWorkCard() as-is below. Deliberately NOT
  // re-derived from `ownedWorks[0]?.user_id` or similar: for a viewer who
  // owns nothing but is a member of someone else's work, that array-based
  // guess would silently resolve to the WRONG person (the other work's
  // owner), which would then make the ownerName branch below misfire.
  let viewerId: string | null = null

  if (DEMO) {
    projects = await getDemoProjects()
    artist = 'Maya Reyes'
  } else {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    viewerId = user?.id ?? null

    // NOTE: this owned query stays exactly `.eq('user_id', me)` — it must
    // keep excluding shared rows by construction so ③'s scoreboard
    // exclusion is satisfied "for free". Do not widen it for the shared
    // lane below; that is a wholly separate, parallel query.
    const [{ data: profile }, res, membershipRes, ownedWorksRes, workMembershipRes] = await Promise.all([
      supabase.from('user_profiles').select('artist_name').eq('id', user?.id ?? '').maybeSingle(),
      supabase
        .from('vault_projects')
        .select(
          `
        *,
        tracks (id, isrc, iswc, metadata),
        vault_assets (id, type),
        vault_documents (id, type, status),
        tool_outputs (id, tool_slug)
      `
        )
        .eq('user_id', user?.id ?? '')
        .order('created_at', { ascending: false }),
      // "Shared with me": rows RLS (migration 078) already makes visible.
      // A project you also own is not "shared with you" — the role='owner'
      // filter here plus the ownedProjectIds filter below both guard
      // against that (belt-and-suspenders per 21-03-PLAN.md).
      supabase
        .from('project_members')
        .select('project_id, role')
        .eq('user_id', user?.id ?? '')
        .neq('role', 'owner'),
      // My Catalogue — works owned by the viewer (S-03's first new query).
      supabase.from('works').select(WORKS_EMBED).eq('user_id', user?.id ?? '').order('created_at', { ascending: false }),
      // My Catalogue — which works the viewer is a MEMBER of, resolved to
      // full rows in a second pass below (S-03's second new query),
      // mirroring the shared-vault-project pattern two queries down.
      supabase.from('work_members').select('work_id').eq('user_id', user?.id ?? ''),
    ])

    artist = profile?.artist_name ?? null
    projects = (res.data ?? []) as VaultProjectRow[]
    error = res.error
    ownedWorks = (ownedWorksRes.data ?? []) as unknown as WorkRow[]

    const ownedProjectIds = new Set(projects.map(p => p.id))
    const sharedMemberships = ((membershipRes.data ?? []) as { project_id: string; role: string }[]).filter(
      m => m.role !== 'owner' && !ownedProjectIds.has(m.project_id)
    )
    sharedRoleByProjectId = new Map(sharedMemberships.map(m => [m.project_id, m.role as ProjectRole]))
    const sharedProjectIds = sharedMemberships.map(m => m.project_id)

    if (sharedProjectIds.length > 0) {
      const { data: sharedData } = await supabase
        .from('vault_projects')
        .select(
          `
        *,
        tracks (id, isrc, iswc, metadata),
        vault_assets (id, type),
        vault_documents (id, type, status),
        tool_outputs (id, tool_slug)
      `
        )
        .in('id', sharedProjectIds)
        .order('created_at', { ascending: false })

      sharedProjects = (sharedData ?? []) as VaultProjectRow[]

      const ownerIds = Array.from(new Set(sharedProjects.map(p => p.user_id)))
      if (ownerIds.length > 0) {
        const { data: owners } = await supabase
          .from('user_profiles')
          .select('id, artist_name')
          .in('id', ownerIds)
        sharedOwnerNameById = new Map(
          ((owners ?? []) as { id: string; artist_name: string | null }[]).map(o => [o.id, o.artist_name])
        )
      }
    }

    // My Catalogue — resolve membership work ids to full rows, excluding
    // anything already owned (an owner's own membership row would
    // otherwise duplicate the owned list, same guard POST /api/works'
    // sibling GET route already applies).
    const ownedWorkIds = new Set(ownedWorks.map(w => w.id))
    const memberWorkIds = Array.from(
      new Set(
        ((workMembershipRes.data ?? []) as { work_id: string }[])
          .map(m => m.work_id)
          .filter(id => !ownedWorkIds.has(id))
      )
    )

    if (memberWorkIds.length > 0) {
      const { data: memberWorksData } = await supabase
        .from('works')
        .select(WORKS_EMBED)
        .in('id', memberWorkIds)
        .order('created_at', { ascending: false })
      memberWorks = (memberWorksData ?? []) as unknown as WorkRow[]
    }

    const allWorks = [...ownedWorks, ...memberWorks]
    const allWorkIds = allWorks.map(w => w.id)

    // ─── Splits state — service role, same RLS-avoidance precedent plan
    // 05/12 already established for lib/catalogue/splits-io.ts. Migration
    // 137's own header records that it changed NO row-level security on
    // `split_sheets`/`split_sheet_parties` (still initiator/party-only,
    // migration 064's pair) — so a contribute-tier member's session
    // client cannot see another owner's sheet row at all. A card that
    // silently read "No sheet yet" for every work the viewer doesn't own
    // would be wrong, not just incomplete, so this one small read runs
    // service-role, scoped to exactly the work ids this page already
    // decided the viewer may see. ──────────────────────────────────────
    if (allWorkIds.length > 0) {
      const service = createServiceClient()
      const { data: sheetRows } = await service
        .from('split_sheets')
        .select('work_id, status, split_sheet_parties (id)')
        .in('work_id', allWorkIds)
        .order('created_at', { ascending: false })

      type SheetRow = {
        work_id: string
        status: CatalogueWorkCard['splitsStatus']
        split_sheet_parties: { id: string }[] | null
      }
      for (const row of (sheetRows ?? []) as SheetRow[]) {
        // 37.1 creates exactly one sheet per work; a work_id with more
        // than one row would only arise from a later phase's addenda —
        // the first (newest, per the ordering above) wins.
        if (!sheetByWorkId.has(row.work_id)) {
          sheetByWorkId.set(row.work_id, {
            status: row.status,
            partyCount: (row.split_sheet_parties ?? []).length,
          })
        }
      }
    }

    // ─── Contributor names — collaborator rows + member-work owners ────
    // Mirrors this same file's own sharedOwnerNameById resolution above,
    // extended to a second, disjoint id set (work owners, not project
    // owners) rather than folded into that query — a wrong merge there
    // would touch the Releases shelf's own data path, which this plan
    // may not touch (S-03's prohibition).
    const collaboratorIds = Array.from(
      new Set(
        allWorks.flatMap(w => (w.work_members ?? []).map(m => m.collaborator_id).filter((id): id is string => Boolean(id)))
      )
    )
    const memberWorkOwnerIds = Array.from(new Set(memberWorks.map(w => w.user_id)))

    const [{ data: collabRows }, { data: workOwnerProfiles }] = await Promise.all([
      collaboratorIds.length > 0
        ? supabase.from('collaborators').select('id, name').in('id', collaboratorIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      memberWorkOwnerIds.length > 0
        ? supabase.from('user_profiles').select('id, artist_name').in('id', memberWorkOwnerIds)
        : Promise.resolve({ data: [] as { id: string; artist_name: string | null }[] }),
    ])
    collabNameById = new Map(((collabRows ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]))
    workOwnerNameById = new Map(
      ((workOwnerProfiles ?? []) as { id: string; artist_name: string | null }[]).map(p => [p.id, p.artist_name])
    )
  }

  // ─── My Catalogue — the merge (RESEARCH Pitfall 4) ───────────────────
  // The merge between plan 05's `works` table and any pre-37 project
  // typed `unreleased` happens HERE, in application code, never in SQL —
  // that is precisely what lets the one existing production row keep
  // validating against `vault_projects.type`'s unchanged CHECK constraint
  // (no migration touches it) while still surfacing on this new shelf.
  // Both the owned and the "shared with me" project lists are checked —
  // a legacy unreleased project can, in principle, be shared too.
  const legacyWorkCards: CatalogueCard[] = [...projects, ...sharedProjects]
    .filter(p => p.type === 'unreleased')
    .map(p => ({ kind: 'legacy' as const, id: p.id, title: p.title, lastActivityAt: p.updated_at }))

  const workCardContext = { viewerId: viewerId ?? '', viewerArtistName: artist, collabNameById, workOwnerNameById, sheetByWorkId }
  const catalogueCards: CatalogueCard[] = [
    ...ownedWorks.map(w => buildWorkCard(w, workCardContext)),
    ...memberWorks.map(w => buildWorkCard(w, workCardContext)),
    ...legacyWorkCards,
  ].sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1))

  // ─── Releases — UNCHANGED cards/derivation, minus one exclusion ──────
  // The only permitted change to this existing code path (S-03's own
  // prohibition) is dropping `unreleased`-typed rows from the grid they
  // used to render in: the demo dataset's own `demo-unreleased-1` row is
  // proof they DID appear here before this plan. Everything else below —
  // the readiness derivation, the card shape, the counts, the empty
  // state — is byte-for-byte what this page already had.
  const releaseProjects = projects.filter(p => p.type !== 'unreleased')
  const releaseSharedProjects = sharedProjects.filter(p => p.type !== 'unreleased')

  const cards: VaultCard[] = releaseProjects.map(project => {
    const items = readinessItemsForProject({
      type: project.type,
      distributor: (project as { distributor?: string | null }).distributor ?? null,
      tracks: project.tracks,
      assets: project.vault_assets,
      documents: project.vault_documents,
      tool_outputs: project.tool_outputs,
    })
    return {
      id: project.id,
      title: project.title,
      type: project.type,
      artist,
      status: project.status,
      score: project.vault_readiness_score,
      completeItems: items.filter(i => i.status === 'complete').length,
      totalItems: items.length,
      trackCount: project.tracks?.length ?? 0,
      releaseDate: project.release_date,
      coverUrl: project.cover_art_url,
      lane: laneFor(project.status, project.release_date),
    }
  })

  // Shared cards: same readiness derivation as the owned cards above, but
  // `artist` resolves to the OWNER's name (not the viewer's), and the card
  // carries `sharedBy`/`viewerRole` so VaultProjectCard renders the ③
  // badge instead of an owner-only edit affordance.
  const sharedCards: VaultCard[] = releaseSharedProjects.map(project => {
    const items = readinessItemsForProject({
      type: project.type,
      distributor: (project as { distributor?: string | null }).distributor ?? null,
      tracks: project.tracks,
      assets: project.vault_assets,
      documents: project.vault_documents,
      tool_outputs: project.tool_outputs,
    })
    const ownerName = sharedOwnerNameById.get(project.user_id) ?? null
    return {
      id: project.id,
      title: project.title,
      type: project.type,
      artist: ownerName,
      status: project.status,
      score: project.vault_readiness_score,
      completeItems: items.filter(i => i.status === 'complete').length,
      totalItems: items.length,
      trackCount: project.tracks?.length ?? 0,
      releaseDate: project.release_date,
      coverUrl: project.cover_art_url,
      lane: laneFor(project.status, project.release_date),
      sharedBy: { ownerName },
      viewerRole: sharedRoleByProjectId.get(project.id) ?? 'viewer',
    }
  })

  // Two shelves, one line: this replaces the releases-only subtitle with
  // a count for each (S-03's own IA decision — "one roof, two shelves").
  const sub = `${catalogueCards.length} song${catalogueCards.length === 1 ? '' : 's'} in My Catalogue · ${cards.length} release${cards.length === 1 ? '' : 's'}`

  return (
    <>
      <Topbar title="Your Sound Vault" subtitle={sub}>
        <TopbarSearch placeholder="Search releases" />
        <Link
          href="/vault/new"
          className="inline-flex items-center gap-[9px] rounded-[10px] bg-grad px-5 py-3 text-[15px] font-bold text-white shadow-cta"
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New project
        </Link>
      </Topbar>

      <div className="flex-1 px-9 py-[30px]">
        {/*
          The catalogue shelf, then the Releases grid — one roof, two
          shelves (S-03). Everything from here down (the error branch, the
          empty state, VaultBrowser, the shared-with-me section) is
          untouched: same query, same cards, same counts, same subtitle,
          same empty state — S-03's own prohibition names all four and
          this plan adds nothing to this block beyond the shelf above it.
        */}
        <CatalogueShelf cards={catalogueCards} />

        {error ? (
          <p className="rounded-card border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            Couldn’t load your vault: {error.message}
          </p>
        ) : cards.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <p className="text-lg font-semibold text-white">Your vault is empty</p>
            <p className="mt-1 max-w-sm text-sm text-lavdim">
              Every single, snippet, EP, album, and unreleased idea lives here. Start by adding your
              first project.
            </p>
            <Link
              href="/vault/new"
              className="mt-6 inline-flex items-center gap-2 rounded-[10px] bg-grad px-5 py-3 text-sm font-bold text-white shadow-cta"
            >
              Create your first project
            </Link>
          </div>
        ) : (
          <VaultBrowser cards={cards} />
        )}

        {sharedCards.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-6 text-[19px] font-bold tracking-[-.01em] text-white">Shared with me</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {sharedCards.map(card => (
                <VaultProjectCard key={card.id} card={card} />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
