import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import type { ReadinessItem } from '@/types'
import { VAULT_PROJECT_TYPE_LABELS } from '@/types'
import { readinessItemsForProject, readinessLabel } from '@/lib/vault/readiness'
import { getDemoProject } from '@/lib/vault/demo-store'
import type { VaultProjectRow } from '@/lib/vault/demo'
import { Topbar } from '@/components/layout/Topbar'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// status → gate visual variant
const VARIANT = {
  complete: { tile: 'bg-emerald-400/12', stroke: '#34D399' },
  warning: { tile: 'bg-money/12', stroke: '#F59E0B' },
  missing: { tile: 'bg-rose-500/12', stroke: '#F43F5E' },
} as const

function CheckIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m20 6-11 11-5-5" />
    </svg>
  )
}
function ClockIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}
function AlertIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5m0 3h.01" />
    </svg>
  )
}

function GateRow({ item, projectId }: { item: ReadinessItem; projectId: string }) {
  const v = VARIANT[item.status]
  const Icon = item.status === 'complete' ? CheckIcon : item.status === 'warning' ? ClockIcon : AlertIcon
  return (
    <div className="mb-3 flex items-center gap-4 rounded-[14px] border border-hair bg-card px-[18px] py-4">
      <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-[11px] ${v.tile}`}>
        <Icon color={v.stroke} />
      </div>
      <div className="flex-1">
        <div className="text-[16px] font-bold text-white">{item.label}</div>
        <div className="mt-[3px] text-[13px] text-lavdim">{item.description}</div>
      </div>
      {item.status === 'complete' ? (
        <span className="text-[13px] font-bold text-emerald-400">Passed</span>
      ) : (
        <Link
          href={`/vault/${projectId}`}
          className={[
            'rounded-[9px] px-4 py-[9px] text-[13.5px] font-bold text-white',
            item.status === 'missing'
              ? 'bg-grad shadow-[0_8px_20px_-8px_rgba(217,70,239,.5)]'
              : 'border border-hairstrong bg-card2',
          ].join(' ')}
        >
          {item.status === 'missing' ? 'Fix it →' : 'Continue'}
        </Link>
      )}
    </div>
  )
}

async function loadProject(projectId: string): Promise<{ project: VaultProjectRow; artist: string | null } | null> {
  if (DEMO) {
    const project = await getDemoProject(projectId)
    return project ? { project, artist: 'Maya Reyes' } : null
  }
  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const [{ data: profile }, { data: project }] = await Promise.all([
    supabase.from('artist_profiles').select('artist_name').eq('id', user?.id ?? '').maybeSingle(),
    supabase
      .from('vault_projects')
      .select(
        `*, tracks (id, isrc, iswc, metadata), vault_assets (id, type), vault_documents (id, type, status), tool_outputs (id, tool_slug)`
      )
      .eq('id', projectId)
      .eq('user_id', user?.id ?? '')
      .maybeSingle(),
  ])
  return project ? { project: project as VaultProjectRow, artist: profile?.artist_name ?? null } : null
}

export default async function ReadinessPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const loaded = await loadProject(projectId)
  if (!loaded) notFound()
  const { project, artist } = loaded

  const items = readinessItemsForProject({
    type: project.type,
    tracks: project.tracks,
    assets: project.vault_assets,
    documents: project.vault_documents,
    tool_outputs: project.tool_outputs,
  })
  const total = items.length
  const complete = items.filter(i => i.status === 'complete').length
  const score = project.vault_readiness_score
  const { label } = readinessLabel(score)
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0
  const firstBlocker = items.find(i => i.status !== 'complete')

  return (
    <>
      <Topbar
        title="Release readiness"
        subtitle={`${project.title}${artist ? ` · ${artist}` : ''} · ${VAULT_PROJECT_TYPE_LABELS[project.type]} — raise your score to unlock opportunities`}
      >
        <span className="inline-flex items-center gap-[9px] rounded-[10px] border border-hairstrong bg-card2 px-5 py-3 text-[15px] font-bold text-white">
          Ask your coach
        </span>
      </Topbar>

      <div className="grid flex-1 gap-[30px] px-9 py-[30px] lg:grid-cols-[392px_1fr]">
        {/* Score column */}
        <div className="flex flex-col">
          <div
            className="mx-auto mt-2 flex h-[300px] w-[300px] items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(#818CF8 0%, #D946EF ${score}%, rgba(199,203,247,.12) ${score}% 100%)`,
            }}
          >
            <div className="flex h-[244px] w-[244px] flex-col items-center justify-center rounded-full bg-[#0c0b1a]">
              <div className="gtext tnum text-[92px] font-black leading-[.9] tracking-[-.04em]">{score}</div>
              <div className="mt-[6px] text-[20px] font-semibold text-lavdim">/ 100</div>
              <div className="gtext mt-3 text-[13px] font-bold uppercase tracking-[.14em]">{label}</div>
            </div>
          </div>

          <div className="mt-[26px]">
            <div className="mb-[10px] flex justify-between text-[14px] font-semibold text-lav">
              <span>Readiness gates</span>
              <span className="tnum">
                {complete} of {total} complete
              </span>
            </div>
            <div className="h-[9px] overflow-hidden rounded-[5px] bg-[rgba(199,203,247,.12)]">
              <div className="h-full rounded-[5px] bg-grad" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="mt-[26px] rounded-[16px] border border-brandindigo/30 bg-[linear-gradient(155deg,rgba(129,140,248,.14),rgba(217,70,239,.1))] p-[22px]">
            <div className="mb-3 text-[13px] font-bold uppercase tracking-[.04em] text-brandindigo">
              AI Rights Coach
            </div>
            <p className="text-[16px] font-semibold leading-[1.45] text-white">
              {firstBlocker ? (
                <>
                  Resolve <b className="text-money2">{firstBlocker.label.toLowerCase()}</b> next to raise
                  your score and unlock more <b className="text-money2">Antenna opportunities</b> for this
                  release.
                </>
              ) : (
                <>This release is fully deal-ready — every gate is passed. Pitch it with confidence.</>
              )}
            </p>
          </div>
        </div>

        {/* Gates */}
        <div>
          <div className="mb-[18px] text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">
            What unlocks money &amp; opportunities
          </div>
          {items.map(item => (
            <GateRow key={item.key} item={item} projectId={projectId} />
          ))}
        </div>
      </div>
    </>
  )
}
