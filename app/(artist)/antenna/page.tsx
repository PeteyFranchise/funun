import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import type { Opportunity } from '@/types'
import { getDemoAntenna } from '@/lib/antenna/demo'
import { AntennaBrowser, type AntennaRow } from '@/components/antenna/AntennaBrowser'
import { Topbar } from '@/components/layout/Topbar'
import { evaluateBenchmarks, type BenchmarkInput } from '@/lib/benchmarks/engine'
import { gateForOpportunity } from '@/lib/benchmarks/opportunity-map'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// Mirrors the Benchmarks room's demo scenario so the unlock loop is visible end-to-end.
const DEMO_BENCHMARKS: BenchmarkInput = {
  monthlyListeners: 6200,
  savesToStreamsPct: 3.1,
  followerGrowthPctMonthly: 7,
  engagementRatePct: 4.2,
  playlistAddsPerMonth: 7,
}

export default async function AntennaPage() {
  let rows: AntennaRow[] = []
  let genre: string | null = null
  let benchmarkInput: BenchmarkInput | null = null
  // Whether the artist has saved real metrics — false hides metric-gated badges
  // so we never show a misleading "Locked" from absent data.
  let metricsKnown = false

  if (DEMO) {
    rows = getDemoAntenna().map(m => ({ opportunity: m.opportunity, score: m.score }))
    genre = 'R&B'
    benchmarkInput = DEMO_BENCHMARKS
    metricsKnown = true
  } else {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const [{ data }, { data: profile }] = await Promise.all([
      supabase
        .from('opportunity_matches')
        .select('match_score, opportunity:opportunities(*)')
        .eq('user_id', user?.id ?? '')
        .order('match_score', { ascending: false }),
      supabase
        .from('artist_profiles')
        .select('genre, monthly_listeners, sound_identity')
        .eq('id', user?.id ?? '')
        .maybeSingle(),
    ])

    rows = ((data ?? []) as unknown as { match_score: number; opportunity: Opportunity | null }[])
      .filter(r => r.opportunity && r.opportunity.active)
      .map(r => ({ opportunity: r.opportunity as Opportunity, score: r.match_score }))
      .sort((a, b) => {
        if (a.opportunity.pete_exclusive !== b.opportunity.pete_exclusive) {
          return a.opportunity.pete_exclusive ? -1 : 1
        }
        return b.score - a.score
      })

    genre = profile?.genre ?? null
    const saved = (profile?.sound_identity as { benchmarks?: BenchmarkInput } | null)?.benchmarks
    if (saved) {
      benchmarkInput = saved
      metricsKnown = true
    } else {
      // No saved metrics yet — still gate audience-based types off monthly listeners.
      benchmarkInput = {
        monthlyListeners: profile?.monthly_listeners ?? 0,
        savesToStreamsPct: 0,
        followerGrowthPctMonthly: 0,
        engagementRatePct: 0,
        playlistAddsPerMonth: 0,
      }
      metricsKnown = false
    }
  }

  // Attach the benchmark gate to each opportunity (the Benchmarks→Antenna bridge).
  if (benchmarkInput) {
    const result = evaluateBenchmarks(benchmarkInput, genre)
    rows = rows.map(r => ({
      ...r,
      gate: gateForOpportunity(r.opportunity.type, result, { metricsKnown }),
    }))
  }

  const sub = `${rows.length} match${rows.length === 1 ? '' : 'es'} · ranked by fit to your sound, audience & readiness`

  return (
    <>
      <Topbar title="Your Antenna" subtitle={sub} />
      <div className="flex-1 px-9 py-[30px]">
        {rows.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <p className="text-lg font-semibold text-white">No matches yet</p>
            <p className="mt-1 max-w-sm text-sm text-lavdim">
              As you complete projects in your vault, the Antenna surfaces opportunities you&rsquo;re a
              strong fit for. Raise a project&rsquo;s readiness to unlock more.
            </p>
            <Link
              href="/vault"
              className="mt-6 rounded-[10px] bg-grad px-5 py-3 text-sm font-bold text-white shadow-cta"
            >
              Go to your vault
            </Link>
          </div>
        ) : (
          <AntennaBrowser rows={rows} />
        )}
      </div>
    </>
  )
}
