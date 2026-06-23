import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import type { VaultProjectStatus } from '@/types'
import { readinessItemsForProject } from '@/lib/vault/readiness'
import type { VaultProjectRow } from '@/lib/vault/demo'
import { getDemoProjects } from '@/lib/vault/demo-store'
import { VaultBrowser } from '@/components/vault/VaultBrowser'
import type { VaultCard } from '@/components/vault/VaultProjectCard'
import { Topbar, TopbarSearch } from '@/components/layout/Topbar'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

function laneFor(status: VaultProjectStatus, releaseDate: string | null): VaultCard['lane'] {
  if (status === 'released') return 'live'
  if (releaseDate) return 'scheduled'
  return 'draft'
}

export default async function VaultPage() {
  let projects: VaultProjectRow[] = []
  let artist: string | null = null
  let error: { message: string } | null = null

  if (DEMO) {
    projects = await getDemoProjects()
    artist = 'Maya Reyes'
  } else {
    const supabase = createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const [{ data: profile }, res] = await Promise.all([
      supabase.from('artist_profiles').select('artist_name').eq('id', user?.id ?? '').maybeSingle(),
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
    ])

    artist = profile?.artist_name ?? null
    projects = (res.data ?? []) as VaultProjectRow[]
    error = res.error
  }

  const cards: VaultCard[] = projects.map(project => {
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

  const sub = `${cards.length} release${cards.length === 1 ? '' : 's'} · everything an industry partner needs to pay you or place your song`

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
      </div>
    </>
  )
}
