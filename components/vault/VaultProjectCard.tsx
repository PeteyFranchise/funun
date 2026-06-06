import Link from 'next/link'
import type { VaultProject } from '@/types'
import { VAULT_PROJECT_TYPE_LABELS } from '@/types'
import { readinessLabel, type ReadinessTone } from '@/lib/vault/readiness'

const STATUS_LABELS: Record<VaultProject['status'], string> = {
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

function ReadinessRing({ score, tone }: { score: number; tone: ReadinessTone }) {
  const radius = 22
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - score / 100)
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
        <circle cx="28" cy="28" r={radius} fill="none" strokeWidth="4" className="stroke-white/10" />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={TONE_CLASSES[tone].ring}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-sm font-semibold ${TONE_CLASSES[tone].text}`}>
        {score}
      </span>
    </div>
  )
}

type VaultProjectCardData = Pick<
  VaultProject,
  'id' | 'title' | 'type' | 'status' | 'genre' | 'cover_art_url' | 'vault_readiness_score' | 'release_date'
>

function releaseLineFor(project: VaultProjectCardData): string | null {
  if (!project.release_date) return null
  const formatted = new Date(project.release_date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return project.status === 'released' ? `Released ${formatted}` : `Releases ${formatted}`
}

type Props = {
  project: VaultProjectCardData
  completeItems: number
  totalItems: number
}

export function VaultProjectCard({ project, completeItems, totalItems }: Props) {
  const score = project.vault_readiness_score
  const { label, tone } = readinessLabel(score)
  const releaseLine = releaseLineFor(project)

  return (
    <Link
      href={`/vault/${project.id}`}
      className="group flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/25 hover:bg-white/[0.06]"
    >
      <div className="flex items-start gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-indigo-500/40 to-fuchsia-500/30">
          {project.cover_art_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={project.cover_art_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-white/70">
              {VAULT_PROJECT_TYPE_LABELS[project.type].charAt(0)}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{project.title}</p>
          <p className="mt-0.5 text-xs uppercase tracking-wide text-white/40">
            {VAULT_PROJECT_TYPE_LABELS[project.type]}
            {project.genre ? ` · ${project.genre}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-block rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/60">
              {STATUS_LABELS[project.status]}
            </span>
            {releaseLine && <span className="text-[11px] text-white/40">{releaseLine}</span>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-white/5 pt-3">
        <ReadinessRing score={score} tone={tone} />
        <div className="min-w-0">
          <p className={`text-sm font-medium ${TONE_CLASSES[tone].text}`}>{label}</p>
          <p className="text-xs text-white/40">
            Vault Readiness · {completeItems}/{totalItems} items complete
          </p>
        </div>
      </div>
    </Link>
  )
}
