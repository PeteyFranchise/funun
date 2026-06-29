import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import type { VaultProjectType } from '@/types'
import { VAULT_PROJECT_TYPE_LABELS } from '@/types'
import { readinessItemsForProject, readinessLabel } from '@/lib/vault/readiness'
import type { VaultProjectRow } from '@/lib/vault/demo'
import { getDemoProjects } from '@/lib/vault/demo-store'
import { VaultProjectCard } from '@/components/vault/VaultProjectCard'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// ─── Credits preview row shape ────────────────────────────────
// Partial select from collaborators joined to split_sheet_parties → split_sheets.
type CreditPreviewRow = {
  id: string
  name: string
  split_sheet_parties: Array<{
    role: string | null
    split_sheets: {
      song_name: string | null
    } | null
  }>
}

const TYPE_ORDER: VaultProjectType[] = ['single', 'snippet', 'ep', 'album', 'unreleased']

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-white/40">{sub}</p>}
    </div>
  )
}

export default async function DashboardPage() {
  let projects: VaultProjectRow[] = []
  let creditsPreview: CreditPreviewRow[] = []

  if (DEMO) {
    projects = await getDemoProjects()
    // DEMO branch renders no credits preview (D-05)
  } else {
    const supabase = createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data } = await supabase
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
      .order('created_at', { ascending: false })

    projects = (data ?? []) as VaultProjectRow[]

    // Credits preview: rows where this user is the claimed collaborator.
    // Authorized by the "Claimed users see own credits" RLS policy (plan 01, T-04-11).
    const { data: creditsData } = await supabase
      .from('collaborators')
      .select('id, name, split_sheet_parties(role, split_sheets(song_name))')
      .eq('claimed_by', user?.id ?? '')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(3)

    creditsPreview = (creditsData ?? []) as unknown as CreditPreviewRow[]
  }

  const creditsCount = creditsPreview.length

  const total = projects.length
  const avgScore =
    total > 0
      ? Math.round(projects.reduce((sum, p) => sum + p.vault_readiness_score, 0) / total)
      : 0
  const readyCount = projects.filter(p => readinessLabel(p.vault_readiness_score).canSubmit).length

  // Upcoming releases: dated, not yet released, soonest first.
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = projects
    .filter(p => p.release_date && p.release_date >= today && p.status !== 'released')
    .sort((a, b) => (a.release_date! < b.release_date! ? -1 : 1))
    .slice(0, 5)

  const typeCounts = TYPE_ORDER.map(type => ({
    type,
    count: projects.filter(p => p.type === type).length,
  })).filter(t => t.count > 0)

  const recent = projects.slice(0, 6)

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-white/50">Your release pipeline at a glance.</p>
        </div>
        <Link
          href="/vault/new"
          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
        >
          <span className="text-lg leading-none">+</span> New project
        </Link>
      </header>

      {total === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <p className="text-lg font-medium text-white">Welcome to Funūn</p>
          <p className="mt-1 max-w-sm text-sm text-white/50">
            Your Sound Vault is empty. Create your first project to start tracking its readiness.
          </p>
          <Link
            href="/vault/new"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            <span className="text-lg leading-none">+</span> Create your first project
          </Link>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Projects" value={total} />
            <StatCard label="Avg readiness" value={`${avgScore}`} sub="out of 100" />
            <StatCard label="Ready to submit" value={readyCount} sub="score 80+" />
            <StatCard label="Upcoming" value={upcoming.length} sub="scheduled releases" />
          </div>

          {/* Type breakdown */}
          <div className="mt-4 flex flex-wrap gap-2">
            {typeCounts.map(t => (
              <Link
                key={t.type}
                href="/vault"
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/60 transition hover:border-white/25 hover:text-white"
              >
                {VAULT_PROJECT_TYPE_LABELS[t.type]}s · {t.count}
              </Link>
            ))}
          </div>

          {/* My Credits preview — only when the user has claimed credits (D-05) */}
          {creditsCount > 0 && (
            <section className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                  My Credits
                </h2>
                <Link
                  href="/collaborators?tab=credits"
                  className="text-sm text-white/50 transition hover:text-white"
                >
                  View all credits →
                </Link>
              </div>
              <ul className="space-y-2">
                {creditsPreview.map(credit => {
                  // First split sheet party entry for preview display
                  const party = credit.split_sheet_parties?.[0]
                  const songName = party?.split_sheets?.song_name ?? null
                  const role = party?.role ?? null
                  return (
                    <li
                      key={credit.id}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                    >
                      <div>
                        <p className="text-sm text-white">{songName ?? '—'}</p>
                        <p className="text-xs text-lavdim">{credit.name}</p>
                      </div>
                      {role && (
                        <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/70">
                          {role}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Recent projects */}
            <section className="lg:col-span-2">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-white">Recent projects</h2>
                <Link href="/vault" className="text-sm text-white/50 transition hover:text-white">
                  View all →
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {recent.map(project => {
                  const items = readinessItemsForProject({
                    type: project.type,
                    distributor: (project as { distributor?: string | null }).distributor ?? null,
                    tracks: project.tracks,
                    assets: project.vault_assets,
                    documents: project.vault_documents,
                    tool_outputs: project.tool_outputs,
                  })
                  return (
                    <VaultProjectCard
                      key={project.id}
                      card={{
                        id: project.id,
                        title: project.title,
                        type: project.type,
                        artist: null,
                        status: project.status,
                        score: project.vault_readiness_score,
                        completeItems: items.filter(i => i.status === 'complete').length,
                        totalItems: items.length,
                        trackCount: project.tracks?.length ?? 0,
                        releaseDate: project.release_date,
                        coverUrl: project.cover_art_url,
                        lane:
                          project.status === 'released'
                            ? 'live'
                            : project.release_date
                              ? 'scheduled'
                              : 'draft',
                      }}
                    />
                  )
                })}
              </div>
            </section>

            {/* Upcoming releases */}
            <aside>
              <h2 className="mb-4 text-lg font-semibold text-white">Upcoming releases</h2>
              {upcoming.length === 0 ? (
                <p className="text-sm text-white/40">
                  No scheduled releases. Add a target release date to a project to see it here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {upcoming.map(p => (
                    <li key={p.id}>
                      <Link
                        href={`/vault/${p.id}`}
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 transition hover:border-white/25"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-white">
                            {p.title}
                          </span>
                          <span className="text-xs text-white/40">
                            {VAULT_PROJECT_TYPE_LABELS[p.type]}
                          </span>
                        </span>
                        <span className="shrink-0 pl-3 text-xs text-white/60">
                          {new Date(p.release_date!).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            timeZone: 'UTC',
                          })}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
