import Link from 'next/link'
import type { Opportunity } from '@/types'
import { OPPORTUNITY_TYPE_LABELS } from '@/types'
import { TYPE_COLORS, deadlineLabel } from '@/lib/antenna/display'
import { MatchScoreBar } from './MatchScoreBreakdown'

export function OpportunityCard({
  opportunity,
  score,
  matchProjectTitle,
}: {
  opportunity: Opportunity
  score?: number
  matchProjectTitle?: string
}) {
  const color = TYPE_COLORS[opportunity.type]
  const pete = opportunity.pete_exclusive
  const deadline = deadlineLabel(opportunity.response_deadline ?? opportunity.deadline)

  return (
    <Link
      href={`/antenna/${opportunity.id}`}
      className={`block rounded-xl border p-5 transition hover:border-white/30 ${
        pete ? 'border-l-[3px] bg-[#0F0D00]' : 'border-[#1A1838] bg-[#0E0D1E]'
      }`}
      style={pete ? { borderColor: '#F59E0B', borderLeftColor: '#F59E0B' } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{ color, backgroundColor: `${color}1A` }}
        >
          {OPPORTUNITY_TYPE_LABELS[opportunity.type]}
        </span>
        {pete && (
          <span className="rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2.5 py-0.5 text-xs font-medium text-[#F59E0B]">
            Pete&rsquo;s Network
          </span>
        )}
      </div>

      <h3 className="mt-3 text-base font-semibold text-white">{opportunity.title}</h3>
      {opportunity.description && (
        <p className="mt-1 line-clamp-2 text-sm text-white/50">{opportunity.description}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40">
        {opportunity.compensation && <span>{opportunity.compensation}</span>}
        {deadline && <span>{deadline}</span>}
        {opportunity.slots_available > 0 && (
          <span>
            {Math.max(0, opportunity.slots_available - opportunity.slots_filled)} slot
            {opportunity.slots_available - opportunity.slots_filled === 1 ? '' : 's'} open
          </span>
        )}
      </div>

      {score != null && (
        <div className="mt-4">
          <MatchScoreBar score={score} showLabel />
          {matchProjectTitle && (
            <p className="mt-1 text-xs text-white/40">Best fit: {matchProjectTitle}</p>
          )}
        </div>
      )}
    </Link>
  )
}
