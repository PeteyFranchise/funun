import { createServerClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { BenchmarkView } from '@/components/benchmarks/BenchmarkView'
import type { BenchmarkInput } from '@/lib/benchmarks/engine'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

export default async function BenchmarksPage() {
  let genre: string | null = null
  let initial: BenchmarkInput = {
    monthlyListeners: 0,
    savesToStreamsPct: 0,
    followerGrowthPctMonthly: 0,
    engagementRatePct: 0,
    playlistAddsPerMonth: 0,
  }

  if (DEMO) {
    genre = 'R&B'
    // Emerging-stage scenario — the saves-ratio gap from the pitch.
    initial = {
      monthlyListeners: 6200,
      savesToStreamsPct: 3.1,
      followerGrowthPctMonthly: 5,
      engagementRatePct: 2.8,
      playlistAddsPerMonth: 7,
    }
  } else {
    const supabase = createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('artist_profiles')
      .select('genre, monthly_listeners')
      .eq('id', user?.id ?? '')
      .maybeSingle()
    genre = profile?.genre ?? null
    initial = { ...initial, monthlyListeners: profile?.monthly_listeners ?? 0 }
  }

  return (
    <>
      <Topbar
        title="Breakthrough Benchmarks"
        subtitle="How your growth compares to artists who broke through at your stage, in your genre"
      />
      <div className="flex-1 px-9 py-[30px]">
        <BenchmarkView initial={initial} genre={genre} />
      </div>
    </>
  )
}
