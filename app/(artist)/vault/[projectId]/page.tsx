import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import type { VaultProjectStatus, VaultProjectType } from '@/types'
import { VAULT_PROJECT_TYPE_LABELS } from '@/types'
import { readinessItemsForProject, readinessLabel, type ReadinessTone } from '@/lib/vault/readiness'
import { getDemoProject } from '@/lib/vault/demo-store'
import { AddTrackForm } from '@/components/vault/AddTrackForm'
import { EditProjectForm } from '@/components/vault/EditProjectForm'
import { CoverArtUpload } from '@/components/vault/CoverArtUpload'
import { AssetUpload } from '@/components/vault/AssetUpload'
import { DocumentManager } from '@/components/vault/DocumentManager'
import { ToolsPanel } from '@/components/tools/ToolsPanel'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const STATUS_LABELS: Record<VaultProjectStatus, string> = {
  in_progress: 'In progress',
  vault_ready: 'Vault ready',
  submitted: 'Submitted',
  released: 'Released',
  archived: 'Archived',
  shelved: 'Shelved',
}

const TONE_CLASSES: Record<ReadinessTone, { ring: string; text: string }> = {
  red: { ring: 'stroke-rose-500', text: 'text-rose-400' },
  amber: { ring: 'stroke-amber-400', text: 'text-amber-300' },
  green: { ring: 'stroke-emerald-400', text: 'text-emerald-300' },
}

// Shape the detail page needs — superset of the list query, works for both
// the live Supabase rows and the demo store.
type DetailProject = {
  id: string
  title: string
  type: VaultProjectType
  status: VaultProjectStatus
  genre: string | null
  sub_genre: string | null
  cover_art_url: string | null
  release_date: string | null
  vault_readiness_score: number
  notes: string | null
  tracks: { id: string; title?: string; track_number?: number; isrc: string | null; duration_seconds?: number | null }[]
  vault_assets: { id: string; type: string; url?: string }[]
  vault_documents: { id: string; type: string; status: string }[]
  tool_outputs: {
    id: string
    tool_slug: string
    title?: string | null
    output?: Record<string, unknown>
  }[]
}

function ReadinessRing({ score, tone }: { score: number; tone: ReadinessTone }) {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - score / 100)
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <circle cx="40" cy="40" r={radius} fill="none" strokeWidth="6" className="stroke-white/10" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={TONE_CLASSES[tone].ring}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center text-2xl font-semibold ${TONE_CLASSES[tone].text}`}
      >
        {score}
      </span>
    </div>
  )
}

function releaseLine(p: Pick<DetailProject, 'release_date' | 'status'>): string | null {
  if (!p.release_date) return null
  const formatted = new Date(p.release_date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return p.status === 'released' ? `Released ${formatted}` : `Releases ${formatted}`
}

function formatDuration(seconds?: number | null): string | null {
  if (!seconds || seconds <= 0) return null
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const STATUS_DOT: Record<'complete' | 'warning' | 'missing', string> = {
  complete: 'bg-emerald-400',
  warning: 'bg-amber-400',
  missing: 'bg-white/20',
}

export default async function VaultProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  let project: DetailProject | null = null

  if (DEMO) {
    project = (await getDemoProject(projectId)) as DetailProject | null
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
        tracks (id, title, track_number, isrc, duration_seconds),
        vault_assets (id, type, url),
        vault_documents (id, type, status),
        tool_outputs (id, tool_slug, title, output)
      `
      )
      .eq('id', projectId)
      .eq('user_id', user?.id ?? '')
      .maybeSingle()

    project = (data as DetailProject | null) ?? null
  }

  if (!project) notFound()

  const items = readinessItemsForProject({
    type: project.type,
    tracks: project.tracks,
    assets: project.vault_assets,
    documents: project.vault_documents,
    tool_outputs: project.tool_outputs,
  })
  const completeCount = items.filter(i => i.status === 'complete').length
  const earnedPoints = items.filter(i => i.status === 'complete').reduce((sum, i) => sum + i.points, 0)
  const totalPoints = items.reduce((sum, i) => sum + i.points, 0)
  const { label, tone } = readinessLabel(project.vault_readiness_score)
  const release = releaseLine(project)

  const tracks = [...project.tracks].sort(
    (a, b) => (a.track_number ?? 0) - (b.track_number ?? 0)
  )

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/vault" className="text-sm text-white/50 transition hover:text-white">
        ← Back to Sound Vault
      </Link>

      {/* Header */}
      <header className="mt-6 flex flex-col gap-6 border-b border-white/10 pb-8 sm:flex-row sm:items-start">
        <CoverArtUpload
          projectId={project.id}
          coverUrl={project.cover_art_url}
          fallbackLetter={VAULT_PROJECT_TYPE_LABELS[project.type].charAt(0)}
        />

        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-white/40">
            {VAULT_PROJECT_TYPE_LABELS[project.type]}
            {project.genre ? ` · ${project.genre}` : ''}
            {project.sub_genre ? ` · ${project.sub_genre}` : ''}
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-white">{project.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-block rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-white/60">
              {STATUS_LABELS[project.status]}
            </span>
            {release && <span className="text-xs text-white/40">{release}</span>}
          </div>
          {project.notes && <p className="mt-4 max-w-2xl text-sm text-white/60">{project.notes}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:items-end">
          <ReadinessRing score={project.vault_readiness_score} tone={tone} />
          <div className="text-right">
            <p className={`text-sm font-semibold ${TONE_CLASSES[tone].text}`}>{label}</p>
            <p className="text-xs text-white/40">Vault Readiness Score</p>
          </div>
        </div>
      </header>

      <div className="mt-6 flex justify-end">
        <EditProjectForm
          projectId={project.id}
          initial={{
            title: project.title,
            type: project.type,
            status: project.status,
            genre: project.genre,
            sub_genre: project.sub_genre,
            release_date: project.release_date,
            notes: project.notes,
          }}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-5">
        {/* Readiness checklist */}
        <section className="lg:col-span-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-white">Vault Readiness</h2>
            <span className="text-sm text-white/40">
              {completeCount}/{items.length} items · {earnedPoints}/{totalPoints} pts
            </span>
          </div>
          <ul className="mt-4 space-y-2">
            {items.map(item => (
              <li
                key={item.key}
                className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3"
              >
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[item.status]}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`text-sm font-medium ${
                        item.status === 'complete' ? 'text-white' : 'text-white/80'
                      }`}
                    >
                      {item.label}
                    </p>
                    <span className="shrink-0 text-xs text-white/40">{item.points} pts</span>
                  </div>
                  <p className="mt-0.5 text-xs text-white/40">{item.description}</p>
                  {item.status !== 'complete' && item.action_label && (
                    <span className="mt-1 inline-block text-xs text-indigo-300">
                      {item.action_label}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Contents sidebar */}
        <aside className="space-y-6 lg:col-span-2">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Tracks <span className="text-white/40">{tracks.length}</span>
            </h3>
            {tracks.length === 0 ? (
              <p className="mt-2 text-xs text-white/40">No tracks uploaded yet.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {tracks.map((t, i) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-white/80">
                      <span className="text-white/40">{t.track_number ?? i + 1}.</span>{' '}
                      {t.title ?? 'Untitled track'}
                    </span>
                    <span className="shrink-0 text-xs text-white/40">
                      {t.isrc ? t.isrc : formatDuration(t.duration_seconds) ?? 'No ISRC'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <AddTrackForm projectId={project.id} />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white">
              Assets <span className="text-white/40">{project.vault_assets.length}</span>
            </h3>
            {project.vault_assets.length === 0 ? (
              <p className="mt-2 text-xs text-white/40">No assets yet.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {project.vault_assets.map(a => (
                  <span
                    key={a.id}
                    className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/60"
                  >
                    {a.type.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}
            <AssetUpload projectId={project.id} />
          </div>

          <DocumentManager projectId={project.id} documents={project.vault_documents} />
        </aside>
      </div>

      <ToolsPanel projectId={project.id} outputs={project.tool_outputs} />
    </div>
  )
}
