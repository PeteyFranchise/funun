import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import type { VaultProjectType } from '@/types'
import { VAULT_PROJECT_TYPE_LABELS } from '@/types'
import { readinessItemsForProject } from '@/lib/vault/readiness'
import type { VaultProjectRow } from '@/lib/vault/demo'
import { getDemoProjects } from '@/lib/vault/demo-store'
import { VaultProjectCard } from '@/components/vault/VaultProjectCard'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const TYPE_ORDER: VaultProjectType[] = ['single', 'snippet', 'ep', 'album', 'unreleased']

const TYPE_BLURBS: Record<VaultProjectType, string> = {
  single: 'One track, full release package',
  snippet: '15–60 second clips built for social',
  ep: '3–6 track projects',
  album: 'Full-length projects and discography entries',
  unreleased: 'Demos, works in progress, shelved ideas',
}

export default async function VaultPage() {
  let projects: VaultProjectRow[] = []
  let error: { message: string } | null = null

  if (DEMO) {
    projects = await getDemoProjects()
  } else {
    const supabase = createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const res = await supabase
      .from('vault_projects')
      .select(
        `
        *,
        tracks (id, isrc),
        vault_assets (id, type),
        vault_documents (id, type, status),
        tool_outputs (id, tool_slug)
      `
      )
      .eq('user_id', user?.id ?? '')
      .order('created_at', { ascending: false })

    projects = (res.data ?? []) as VaultProjectRow[]
    error = res.error
  }

  const byType = TYPE_ORDER.map(type => ({
    type,
    projects: projects.filter(p => p.type === type),
  })).filter(group => group.projects.length > 0)

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Sound Vault</h1>
          <p className="mt-1 text-sm text-white/50">
            Your full discography — every project, every type, in one place.
          </p>
        </div>
        <Link
          href="/vault/new"
          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
        >
          <span className="text-lg leading-none">+</span> New project
        </Link>
      </header>

      {error ? (
        <p className="mt-10 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          Couldn’t load your vault: {error.message}
        </p>
      ) : projects.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <p className="text-lg font-medium text-white">Your vault is empty</p>
          <p className="mt-1 max-w-sm text-sm text-white/50">
            Every single, snippet, EP, album, and unreleased idea lives here. Start by adding your
            first project.
          </p>
          <Link
            href="/vault/new"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            <span className="text-lg leading-none">+</span> Create your first project
          </Link>
        </div>
      ) : (
        <div className="mt-10 space-y-12">
          {byType.map(group => (
            <section key={group.type}>
              <div className="mb-4 flex items-baseline gap-3">
                <h2 className="text-lg font-semibold text-white">
                  {VAULT_PROJECT_TYPE_LABELS[group.type]}s
                </h2>
                <span className="text-sm text-white/40">{group.projects.length}</span>
                <span className="text-sm text-white/30">· {TYPE_BLURBS[group.type]}</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.projects.map(project => {
                  const items = readinessItemsForProject({
                    type: project.type,
                    tracks: project.tracks,
                    assets: project.vault_assets,
                    documents: project.vault_documents,
                    tool_outputs: project.tool_outputs,
                  })
                  return (
                    <VaultProjectCard
                      key={project.id}
                      project={project}
                      completeItems={items.filter(i => i.status === 'complete').length}
                      totalItems={items.length}
                    />
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
