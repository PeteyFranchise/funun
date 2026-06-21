import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import type { Opportunity } from '@/types'
import { getDemoAntenna } from '@/lib/antenna/demo'
import { AntennaBrowser, type AntennaRow } from '@/components/antenna/AntennaBrowser'
import { Topbar } from '@/components/layout/Topbar'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

export default async function AntennaPage() {
  let rows: AntennaRow[] = []

  if (DEMO) {
    rows = getDemoAntenna().map(m => ({ opportunity: m.opportunity, score: m.score }))
  } else {
    const supabase = createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('opportunity_matches')
      .select('match_score, opportunity:opportunities(*)')
      .eq('user_id', user?.id ?? '')
      .order('match_score', { ascending: false })

    rows = ((data ?? []) as unknown as { match_score: number; opportunity: Opportunity | null }[])
      .filter(r => r.opportunity && r.opportunity.active)
      .map(r => ({ opportunity: r.opportunity as Opportunity, score: r.match_score }))
      .sort((a, b) => {
        if (a.opportunity.pete_exclusive !== b.opportunity.pete_exclusive) {
          return a.opportunity.pete_exclusive ? -1 : 1
        }
        return b.score - a.score
      })
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
