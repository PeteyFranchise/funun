import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import type { Opportunity, OpportunityType } from '@/types'
import { OPPORTUNITY_TYPE_LABELS } from '@/types'
import { getDemoAntenna } from '@/lib/antenna/demo'
import { OpportunityCard } from '@/components/antenna/OpportunityCard'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

type Row = { opportunity: Opportunity; score: number; projectTitle: string }

export default async function AntennaPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const { type } = await searchParams
  let rows: Row[] = []

  if (DEMO) {
    rows = getDemoAntenna().map(m => ({
      opportunity: m.opportunity,
      score: m.score,
      projectTitle: m.projectTitle,
    }))
  } else {
    const supabase = createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('opportunity_matches')
      .select('match_score, project:vault_projects(title), opportunity:opportunities(*)')
      .eq('user_id', user?.id ?? '')
      .order('match_score', { ascending: false })

    rows = ((data ?? []) as unknown as {
      match_score: number
      project: { title: string } | null
      opportunity: Opportunity | null
    }[])
      .filter(r => r.opportunity && r.opportunity.active)
      .map(r => ({
        opportunity: r.opportunity as Opportunity,
        score: r.match_score,
        projectTitle: r.project?.title ?? '',
      }))
      .sort((a, b) => {
        if (a.opportunity.pete_exclusive !== b.opportunity.pete_exclusive) {
          return a.opportunity.pete_exclusive ? -1 : 1
        }
        return b.score - a.score
      })
  }

  const types = Array.from(new Set(rows.map(r => r.opportunity.type))) as OpportunityType[]
  const filtered = type ? rows.filter(r => r.opportunity.type === type) : rows

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="border-b border-white/10 pb-6">
        <h1 className="font-serif text-3xl font-semibold text-white" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
          The Antenna
        </h1>
        <p className="mt-1 text-sm text-white/50">
          Opportunities from labels, supervisors, curators and bookers — ranked by how well your
          vault fits. Strong matches surface first.
        </p>
      </header>

      {types.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/antenna"
            className={`rounded-full border px-3 py-1 text-xs transition ${
              !type ? 'border-white/40 text-white' : 'border-white/10 text-white/50 hover:text-white'
            }`}
          >
            All
          </Link>
          {types.map(t => (
            <Link
              key={t}
              href={`/antenna?type=${t}`}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                type === t ? 'border-white/40 text-white' : 'border-white/10 text-white/50 hover:text-white'
              }`}
            >
              {OPPORTUNITY_TYPE_LABELS[t]}
            </Link>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <p className="text-lg font-medium text-white">No matches yet</p>
          <p className="mt-1 max-w-sm text-sm text-white/50">
            As you complete projects in your vault, the Antenna surfaces opportunities you&rsquo;re a
            strong fit for. Raise a project&rsquo;s readiness to unlock more.
          </p>
          <Link
            href="/vault"
            className="mt-6 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Go to your vault
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filtered.map(r => (
            <OpportunityCard
              key={r.opportunity.id}
              opportunity={r.opportunity}
              score={r.score}
              matchProjectTitle={r.projectTitle}
            />
          ))}
        </div>
      )}
    </div>
  )
}
