'use client'

import { useMemo, useState } from 'react'
import type { Opportunity, OpportunityType } from '@/types'
import { OPPORTUNITY_TYPE_LABELS } from '@/types'
import { OpportunityCard } from './OpportunityCard'

export type AntennaRow = { opportunity: Opportunity; score: number }

export function AntennaBrowser({ rows }: { rows: AntennaRow[] }) {
  const types = useMemo(
    () => Array.from(new Set(rows.map(r => r.opportunity.type))) as OpportunityType[],
    [rows]
  )
  const tags = useMemo(
    () => Array.from(new Set(rows.flatMap(r => [...r.opportunity.genres, ...r.opportunity.mood_tags]))).slice(0, 6),
    [rows]
  )

  const [selected, setSelected] = useState<Set<OpportunityType>>(new Set(types))
  const [minMatch, setMinMatch] = useState(0)

  const toggle = (t: OpportunityType) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })

  const countOf = (t: OpportunityType) => rows.filter(r => r.opportunity.type === t).length
  const shown = rows.filter(r => selected.has(r.opportunity.type) && r.score >= minMatch)

  return (
    <div className="grid gap-7 lg:grid-cols-[1fr_290px]">
      {/* List */}
      <div className="flex flex-col gap-[14px]">
        <div className="mb-1 flex items-center gap-[14px] rounded-[14px] border border-brandindigo/30 bg-[linear-gradient(150deg,rgba(129,140,248,.14),rgba(217,70,239,.08))] px-5 py-4">
          <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] flex-none" fill="none" stroke="#818CF8" strokeWidth={1.8}>
            <path d="M13 2 3 14h7l-1 8 10-12h-7z" strokeLinejoin="round" />
          </svg>
          <div className="text-[14.5px] font-semibold text-white">
            Higher readiness unlocks premium matches.{' '}
            <b className="text-brandindigo">Raise a release to 90+</b> to surface direct-deal
            opportunities.
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="text-[14px] text-lavdim">No matches with these filters.</p>
        ) : (
          shown.map(r => <OpportunityCard key={r.opportunity.id} opportunity={r.opportunity} score={r.score} />)
        )}
      </div>

      {/* Filter panel */}
      <div className="h-fit rounded-[16px] border border-hair bg-[#0b0a16] p-[22px]">
        <div className="mb-[18px] text-[13px] font-bold uppercase tracking-[.14em] text-lavdim">Filters</div>

        <div className="mb-[22px]">
          <div className="mb-3 text-[13.5px] font-bold text-white">Opportunity type</div>
          {types.map(t => {
            const on = selected.has(t)
            return (
              <button
                key={t}
                onClick={() => toggle(t)}
                className="mb-[11px] flex w-full items-center gap-[11px] text-[14px] font-medium text-lav"
              >
                <span
                  className={[
                    'flex h-[19px] w-[19px] flex-none items-center justify-center rounded-[5px]',
                    on ? 'bg-grad' : 'border-[1.5px] border-hairstrong',
                  ].join(' ')}
                >
                  {on && (
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <path d="m20 6-11 11-5-5" />
                    </svg>
                  )}
                </span>
                {OPPORTUNITY_TYPE_LABELS[t]}
                <span className="ml-auto text-[12.5px] text-lavdim">{countOf(t)}</span>
              </button>
            )
          })}
        </div>

        <div className="mb-[22px]">
          <div className="mb-3 text-[13.5px] font-bold text-white">Minimum match</div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={minMatch}
            onChange={e => setMinMatch(Number(e.target.value))}
            className="w-full accent-brandfuchsia"
          />
          <div className="flex justify-between text-[12.5px] font-semibold text-lavdim">
            <span className="tnum">{minMatch}%</span>
            <span>any</span>
          </div>
        </div>

        {tags.length > 0 && (
          <div>
            <div className="mb-3 text-[13.5px] font-bold text-white">Sound &amp; mood</div>
            <div className="flex flex-wrap gap-2">
              {tags.map(t => (
                <span
                  key={t}
                  className="rounded-full border border-hair bg-card2 px-[11px] py-1 text-[12px] font-semibold text-lav"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
