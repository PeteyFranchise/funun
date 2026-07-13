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
    // Emerging-stage scenario. Keeps the pitch's headline saves gap (3.1 vs 5.2
    // → editorial Locked) while spanning the full range: engagement clears its
    // bar (brand Qualifies) and follower growth is close (label Almost).
    initial = {
      monthlyListeners: 6200,
      savesToStreamsPct: 3.1,
      followerGrowthPctMonthly: 7,
      engagementRatePct: 4.2,
      playlistAddsPerMonth: 7,
    }
  } else {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('artist_profiles')
      .select('genre, monthly_listeners, sound_identity')
      .eq('id', user?.id ?? '')
      .maybeSingle()
    genre = profile?.genre ?? null
    // Prefill from the last saved snapshot if present, else from the profile.
    const saved = (profile?.sound_identity as { benchmarks?: BenchmarkInput } | null)?.benchmarks
    initial = saved
      ? { ...saved }
      : { ...initial, monthlyListeners: profile?.monthly_listeners ?? 0 }
  }

  return (
    <>
      <Topbar
        title="Breakthrough Benchmarks"
        subtitle="How your growth compares to artists who broke through at your stage, in your genre"
      />
      <div className="flex-1 px-9 py-[30px]">
        <BenchmarkView initial={initial} genre={genre} canSave={!DEMO} />
      </div>
    </>
  )
}
