import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import type { Opportunity, MatchBreakdown } from '@/types'
import { OPPORTUNITY_TYPE_LABELS } from '@/types'
import { TYPE_COLORS, deadlineLabel } from '@/lib/antenna/display'
import { getDemoAntenna, getDemoOpportunity } from '@/lib/antenna/demo'
import { MatchScoreBar, MatchScoreBreakdown } from '@/components/antenna/MatchScoreBreakdown'
import { ApplyButton } from '@/components/antenna/ApplyButton'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

type MatchInfo = {
  score: number
  breakdown: MatchBreakdown | null
  applied: boolean
  projectId: string
  projectTitle: string
} | null

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>
}) {
  const { opportunityId } = await params

  let opportunity: Opportunity | null = null
  let match: MatchInfo = null
  let poster: { display_name: string; company: string | null; verified: boolean } | null = null

  if (DEMO) {
    opportunity = getDemoOpportunity(opportunityId)
    const m = getDemoAntenna().find(x => x.opportunity.id === opportunityId)
    if (m) {
      match = {
        score: m.score,
        breakdown: m.breakdown,
        applied: false,
        projectId: 'demo-single-1',
        projectTitle: m.projectTitle,
      }
    }
    poster = { display_name: 'Demo Music Supervisor', company: 'Skyline Sync', verified: true }
  } else {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data: opp } = await supabase
      .from('opportunities')
      .select('*')
      .eq('id', opportunityId)
      .maybeSingle()
    opportunity = (opp as Opportunity) ?? null

    if (opportunity) {
      const { data: m } = await supabase
        .from('opportunity_matches')
        .select('match_score, breakdown, applied, project_id, project:vault_projects(title)')
        .eq('opportunity_id', opportunityId)
        .eq('user_id', user?.id ?? '')
        .maybeSingle()
      if (m) {
        const row = m as unknown as {
          match_score: number
          breakdown: MatchBreakdown | null
          applied: boolean
          project_id: string
          project: { title: string } | null
        }
        match = {
          score: row.match_score,
          breakdown: row.breakdown,
          applied: row.applied,
          projectId: row.project_id,
          projectTitle: row.project?.title ?? 'your project',
        }
      }
      if (opportunity.industry_profile_id) {
        const { data: ip } = await supabase
          .from('industry_profiles')
          .select('display_name, company, verified')
          .eq('id', opportunity.industry_profile_id)
          .maybeSingle()
        poster = (ip as typeof poster) ?? null
      }
    }
  }

  if (!opportunity) notFound()

  const color = TYPE_COLORS[opportunity.type]
  const deadline = deadlineLabel(opportunity.response_deadline ?? opportunity.deadline)
  const slotsOpen = Math.max(0, opportunity.slots_available - opportunity.slots_filled)

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/antenna" className="text-sm text-white/50 transition hover:text-white">
        ← The Antenna
      </Link>

      <div
        className={`mt-4 rounded-2xl border p-6 ${
          opportunity.pete_exclusive ? 'border-l-[3px] bg-[#0F0D00]' : 'border-[#1A1838] bg-[#0E0D1E]'
        }`}
        style={
          opportunity.pete_exclusive ? { borderColor: '#F59E0B', borderLeftColor: '#F59E0B' } : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ color, backgroundColor: `${color}1A` }}
          >
            {OPPORTUNITY_TYPE_LABELS[opportunity.type]}
          </span>
          {opportunity.pete_exclusive && (
            <span className="rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2.5 py-0.5 text-xs font-medium text-[#F59E0B]">
              Pete&rsquo;s Network
            </span>
          )}
          {opportunity.exclusive && (
            <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-xs text-white/60">
              Studio / Founding
            </span>
          )}
        </div>

        <h1 className="mt-3 text-2xl font-semibold text-white">{opportunity.title}</h1>
        {poster && (
          <p className="mt-1 text-sm text-white/50">
            {poster.display_name}
            {poster.company ? ` · ${poster.company}` : ''}
            {poster.verified ? ' · Verified' : ''}
          </p>
        )}

        {opportunity.pete_exclusive && opportunity.pete_note && (
          <p className="mt-4 rounded-lg border border-[#F59E0B]/20 bg-[#F59E0B]/5 px-4 py-2.5 text-sm text-[#F4C77B]">
            {opportunity.pete_note}
          </p>
        )}

        {opportunity.description && (
          <p className="mt-4 whitespace-pre-wrap text-sm text-white/70">{opportunity.description}</p>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {opportunity.compensation && <Fact label="Compensation" value={opportunity.compensation} />}
          {deadline && <Fact label="Deadline" value={deadline} />}
          {opportunity.platform && <Fact label="Platform" value={opportunity.platform} />}
          {opportunity.genres.length > 0 && (
            <Fact label="Genres" value={opportunity.genres.join(', ')} />
          )}
          {opportunity.slots_available > 0 && (
            <Fact label="Slots" value={`${slotsOpen} of ${opportunity.slots_available} open`} />
          )}
        </dl>

        {opportunity.submission_requirements && (
          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-white/40">
              Submission requirements
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-white/70">
              {opportunity.submission_requirements}
            </p>
          </div>
        )}
      </div>

      {/* Match + apply */}
      {match ? (
        <div className="mt-6 rounded-2xl border border-[#1A1838] bg-[#0E0D1E] p-6">
          <h2 className="text-lg font-semibold text-white">Why you matched</h2>
          <div className="mt-4">
            <MatchScoreBar score={match.score} showLabel />
          </div>
          {match.breakdown && (
            <div className="mt-5">
              <MatchScoreBreakdown breakdown={match.breakdown} />
            </div>
          )}

          <div className="mt-6 border-t border-white/10 pt-6">
            {slotsOpen === 0 && opportunity.slots_available > 0 ? (
              <p className="text-sm text-white/50">All slots for this opportunity have been filled.</p>
            ) : (
              <ApplyButton
                opportunityId={opportunity.id}
                projectId={match.projectId}
                projectTitle={match.projectTitle}
                alreadyApplied={match.applied}
                demo={DEMO}
              />
            )}
          </div>
        </div>
      ) : (
        <p className="mt-6 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-white/50">
          You don&rsquo;t have a matched project for this opportunity yet. Raise a project&rsquo;s
          readiness in your vault to qualify.
        </p>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-white/40">{label}</dt>
      <dd className="mt-0.5 text-white/80">{value}</dd>
    </div>
  )
}
