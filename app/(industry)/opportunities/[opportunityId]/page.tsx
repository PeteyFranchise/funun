import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import type { Opportunity, MatchBreakdown } from '@/types'
import { OPPORTUNITY_TYPE_LABELS } from '@/types'
import { TYPE_COLORS, deadlineLabel } from '@/lib/antenna/display'
import { getDemoOpportunity, getDemoAntenna } from '@/lib/antenna/demo'
import { ApplicationInbox, type Applicant } from '@/components/antenna/ApplicationInbox'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

export default async function OpportunityInboxPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>
}) {
  const { opportunityId } = await params

  let opportunity: Opportunity | null = null
  let applicants: Applicant[] = []

  if (DEMO) {
    opportunity = getDemoOpportunity(opportunityId)
    const m = getDemoAntenna().find(x => x.opportunity.id === opportunityId)
    if (opportunity && m) {
      applicants = [
        {
          matchId: 'demo-match-1',
          artistName: 'Demo Artist',
          projectTitle: m.projectTitle,
          projectType: 'single',
          readiness: 90,
          score: m.score,
          breakdown: m.breakdown,
          note: 'Big fan of the catalog — this track sits right in the pocket you described.',
          appliedAt: '2026-06-02T00:00:00Z',
        },
      ]
    }
  } else {
    const supabase = createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data: opp } = await supabase
      .from('opportunities')
      .select('*')
      .eq('id', opportunityId)
      .eq('created_by', user?.id ?? '')
      .maybeSingle()
    opportunity = (opp as Opportunity) ?? null

    if (opportunity) {
      const { data: matches } = await supabase
        .from('opportunity_matches')
        .select('id, user_id, match_score, breakdown, applied_at, project:vault_projects(title, type, vault_readiness_score)')
        .eq('opportunity_id', opportunityId)
        .eq('applied', true)
        .order('match_score', { ascending: false })

      const rows = (matches ?? []) as unknown as {
        id: string
        user_id: string
        match_score: number
        breakdown: MatchBreakdown | null
        applied_at: string | null
        project: { title: string; type: string; vault_readiness_score: number } | null
      }[]

      const userIds = Array.from(new Set(rows.map(r => r.user_id)))
      const projectTitles = rows.map(r => r.project?.title).filter(Boolean) as string[]

      const [{ data: profiles }, { data: subs }] = await Promise.all([
        userIds.length
          ? supabase.from('artist_profiles').select('id, artist_name').in('id', userIds)
          : Promise.resolve({ data: [] as { id: string; artist_name: string | null }[] }),
        projectTitles.length
          ? supabase
              .from('submissions')
              .select('destination_name, pitch_text')
              .eq('destination_type', 'antenna')
              .eq('destination_name', opportunity.title)
          : Promise.resolve({ data: [] as { destination_name: string; pitch_text: string | null }[] }),
      ])

      const nameById = new Map(
        ((profiles ?? []) as { id: string; artist_name: string | null }[]).map(p => [
          p.id,
          p.artist_name,
        ])
      )
      const note = ((subs ?? []) as { pitch_text: string | null }[])[0]?.pitch_text ?? null

      applicants = rows.map(r => ({
        matchId: r.id,
        artistName: nameById.get(r.user_id) ?? 'Artist',
        projectTitle: r.project?.title ?? '—',
        projectType: r.project?.type ?? '',
        readiness: r.project?.vault_readiness_score ?? 0,
        score: r.match_score,
        breakdown: r.breakdown,
        note,
        appliedAt: r.applied_at,
      }))
    }
  }

  if (!opportunity) notFound()

  const color = TYPE_COLORS[opportunity.type]
  const deadline = deadlineLabel(opportunity.response_deadline ?? opportunity.deadline)

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/opportunities" className="text-sm text-white/50 transition hover:text-white">
        ← Opportunities
      </Link>

      <header className="mt-4 border-b border-white/10 pb-6">
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ color, backgroundColor: `${color}1A` }}
          >
            {OPPORTUNITY_TYPE_LABELS[opportunity.type]}
          </span>
          {!opportunity.active && (
            <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-xs text-white/40">
              Closed
            </span>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-white">{opportunity.title}</h1>
        <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-white/50">
          {deadline && <span>{deadline}</span>}
          <span>
            {opportunity.slots_filled}/{opportunity.slots_available} slots filled
          </span>
        </div>
      </header>

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-white">
          Applications {applicants.length > 0 && <span className="text-white/40">· {applicants.length}</span>}
        </h2>
        <ApplicationInbox applicants={applicants} />
      </div>
    </div>
  )
}
