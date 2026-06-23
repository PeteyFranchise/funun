import Link from 'next/link'
import type { Opportunity } from '@/types'
import { OPPORTUNITY_TYPE_LABELS } from '@/types'
import { deadlineLabel } from '@/lib/antenna/display'
import type { GateState, OpportunityGate } from '@/lib/benchmarks/opportunity-map'

// Benchmark-gate badge colours — mirrors the Benchmarks room.
const GATE_CHIP: Record<GateState, string> = {
  qualifies: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  almost: 'text-money2 bg-money/10 border-money/30',
  locked: 'text-lavdim bg-white/[.04] border-hairstrong',
}

// ─── Opportunity row (.opp) ──────────────────────────────────────────
// Match-% ring + type eyebrow + title + benchmark gate + tags + deadline + CTA.
export function OpportunityCard({
  opportunity,
  score = 0,
  gate,
}: {
  opportunity: Opportunity
  score?: number
  matchProjectTitle?: string
  /** Benchmark readiness for this opportunity type, from the artist's metrics. */
  gate?: OpportunityGate | null
}) {
  const tags = [...opportunity.genres, ...opportunity.mood_tags].slice(0, 3)
  const deadline = deadlineLabel(opportunity.response_deadline ?? opportunity.deadline) ?? 'Ongoing'

  return (
    <div className="flex items-center gap-5 rounded-[16px] border border-hair bg-card px-[22px] py-5">
      {/* match ring */}
      <div
        className="flex h-16 w-16 flex-none items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(#818CF8 0%, #D946EF ${score}%, rgba(199,203,247,.14) ${score}% 100%)`,
        }}
      >
        <span className="flex h-[50px] w-[50px] items-center justify-center rounded-full bg-[#0c0b1a]">
          <span className="gtext tnum text-[18px] font-extrabold">{score}</span>
        </span>
      </div>

      {/* info */}
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-bold uppercase tracking-[.12em] text-lavdim">
          {OPPORTUNITY_TYPE_LABELS[opportunity.type]}
          {opportunity.pete_exclusive ? ' · Exclusive' : ''}
        </div>
        <div className="mt-1 text-[18.5px] font-bold tracking-[-.01em] text-white">
          {opportunity.title}
        </div>
        {gate && (
          <div className="mt-2 flex flex-wrap items-center gap-x-[10px] gap-y-1">
            <span className={`flex-none rounded-full border px-[9px] py-[2px] text-[11px] font-bold ${GATE_CHIP[gate.state]}`}>
              {gate.label}
            </span>
            <span className="text-[12.5px] text-lav">{gate.reason}</span>
            {gate.state !== 'qualifies' && (
              <Link
                href="/benchmarks"
                className="whitespace-nowrap text-[12.5px] font-semibold text-brandindigo"
              >
                Fix in Benchmarks →
              </Link>
            )}
          </div>
        )}
        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.map(t => (
              <span
                key={t}
                className="rounded-full border border-hair bg-card2 px-[11px] py-1 text-[12px] font-semibold text-lav"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* right: deadline + pitch */}
      <div className="flex flex-col items-end gap-[14px]">
        <div className="flex items-center gap-[7px] text-[12.5px] font-medium text-lavdim">
          <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" strokeLinecap="round" />
          </svg>
          {deadline}
        </div>
        <Link
          href={`/antenna/${opportunity.id}`}
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-[10px] bg-grad px-4 py-[11px] text-[13.5px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(217,70,239,.5)]"
        >
          <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          Pitch with PitchPlug
        </Link>
      </div>
    </div>
  )
}
