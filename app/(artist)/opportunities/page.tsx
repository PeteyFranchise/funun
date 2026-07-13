import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import type { Opportunity } from '@/types'
import { OPPORTUNITY_TYPE_LABELS } from '@/types'
import { TYPE_COLORS, deadlineLabel } from '@/lib/antenna/display'
import { DEMO_OPPORTUNITIES } from '@/lib/antenna/demo'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

type OppWithCounts = Opportunity & { matchCount: number; appliedCount: number }

export default async function OpportunitiesPage() {
  let opps: OppWithCounts[] = []

  if (DEMO) {
    opps = DEMO_OPPORTUNITIES.map(o => ({ ...o, matchCount: 3, appliedCount: 1 }))
  } else {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data } = await supabase
      .from('opportunities')
      .select('*, opportunity_matches (applied)')
      .eq('created_by', user?.id ?? '')
      .order('created_at', { ascending: false })

    opps = ((data ?? []) as (Opportunity & { opportunity_matches: { applied: boolean }[] })[]).map(
      o => ({
        ...o,
        matchCount: o.opportunity_matches?.length ?? 0,
        appliedCount: (o.opportunity_matches ?? []).filter(m => m.applied).length,
      })
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Your opportunities</h1>
          <p className="mt-1 text-sm text-white/50">
            Post what you need; the Antenna routes it to the best-fit artists and collects
            applications here.
          </p>
        </div>
        <Link
          href="/opportunities/new"
          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
        >
          <span className="text-lg leading-none">+</span> Post opportunity
        </Link>
      </header>

      {opps.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <p className="text-lg font-medium text-white">No opportunities yet</p>
          <p className="mt-1 max-w-sm text-sm text-white/50">
            Post your first opportunity and the Antenna will start matching artists to it.
          </p>
          <Link
            href="/opportunities/new"
            className="mt-6 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Post an opportunity
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {opps.map(o => {
            const color = TYPE_COLORS[o.type]
            const deadline = deadlineLabel(o.response_deadline ?? o.deadline)
            return (
              <Link
                key={o.id}
                href={`/opportunities/${o.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-[#1A1838] bg-[#0E0D1E] p-4 transition hover:border-white/30"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ color, backgroundColor: `${color}1A` }}
                    >
                      {OPPORTUNITY_TYPE_LABELS[o.type]}
                    </span>
                    {!o.active && (
                      <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-white/40">
                        Closed
                      </span>
                    )}
                    {o.pete_exclusive && (
                      <span className="rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-0.5 text-xs text-[#F59E0B]">
                        Pete&rsquo;s Network
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 truncate font-medium text-white">{o.title}</p>
                  {deadline && <p className="text-xs text-white/40">{deadline}</p>}
                </div>
                <div className="flex shrink-0 gap-6 text-center">
                  <div>
                    <p className="text-lg font-semibold text-white">{o.matchCount}</p>
                    <p className="text-xs text-white/40">matches</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-[#34D399]">{o.appliedCount}</p>
                    <p className="text-xs text-white/40">applied</p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
