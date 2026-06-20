'use client'

import { useState } from 'react'
import type { EligibilityResult, EligibilityGate } from '@/lib/eligibility/direct-overlay'

export type CoachRelease = {
  projectId: string
  title: string
  result: EligibilityResult
  /** DDEX RDR-N neighbouring-rights readiness summary. */
  rdr: { coreCount: number; recommendedCount: number; total: number }
}

const GATE_STATE = {
  pass: { tile: 'bg-emerald-400/12', stroke: '#34D399' },
  fail: { tile: 'bg-rose-500/12', stroke: '#F43F5E' },
  needs_input: { tile: 'bg-money/12', stroke: '#F59E0B' },
} as const

function GateIcon({ status }: { status: EligibilityGate['status'] }) {
  const c = GATE_STATE[status].stroke
  if (status === 'pass')
    return (
      <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="m20 6-11 11-5-5" /></svg>
    )
  if (status === 'fail')
    return (
      <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5m0 3h.01" /></svg>
    )
  return (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7m0 3h.01" /></svg>
  )
}

function tierBanner(result: EligibilityResult) {
  if (result.tier === 'tier2')
    return { cls: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400', title: 'Tier 2 — streaming withdrawal eligible', sub: 'Direct sync, library AND digital-withdrawal deals are open to this release.' }
  if (result.tier === 'tier1')
    return { cls: 'border-brandindigo/30 bg-brandindigo/10 text-brandindigo', title: 'Tier 1 — sync & commercial-library ready', sub: 'This release qualifies for direct sync and commercial-library deals.' }
  return { cls: 'border-money/30 bg-money/10 text-money2', title: 'Not yet eligible', sub: 'Clear the blockers below to unlock direct sync & library deals.' }
}

export function RightsCoach({ releases }: { releases: CoachRelease[] }) {
  const [selectedId, setSelectedId] = useState(releases[0]?.projectId ?? '')
  const current = releases.find(r => r.projectId === selectedId) ?? releases[0]

  if (!current) {
    return <p className="text-[14px] text-lavdim">Add a release to your vault to see its deal eligibility.</p>
  }

  const { result } = current
  const banner = tierBanner(result)
  const firstBlocker = result.blockers[0]
  const pct = result.progress.total > 0 ? Math.round((result.progress.passed / result.progress.total) * 100) : 0

  return (
    <div className="grid gap-7 lg:grid-cols-[300px_1fr]">
      {/* Release selector */}
      <div className="rounded-card border border-hair bg-card p-5">
        <div className="mb-4 text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">Your releases</div>
        <ul className="space-y-1">
          {releases.map(r => {
            const active = r.projectId === selectedId
            const t = r.result.tier
            return (
              <li key={r.projectId}>
                <button
                  onClick={() => setSelectedId(r.projectId)}
                  className={`flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-[10px] text-left transition ${active ? 'bg-card2' : 'hover:bg-white/5'}`}
                >
                  <span className={`truncate text-[14px] font-semibold ${active ? 'text-white' : 'text-lav'}`}>{r.title}</span>
                  <span
                    className={`flex-none rounded-full px-2 py-[2px] text-[11px] font-bold ${t === 'tier2' ? 'bg-emerald-400/12 text-emerald-400' : t === 'tier1' ? 'bg-brandindigo/12 text-brandindigo' : 'bg-money/12 text-money2'}`}
                  >
                    {t === 'tier2' ? 'Tier 2' : t === 'tier1' ? 'Tier 1' : '—'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Eligibility detail */}
      <div>
        <div className={`mb-5 rounded-[16px] border px-5 py-4 ${banner.cls}`}>
          <div className="text-[16px] font-extrabold">{banner.title}</div>
          <div className="mt-1 text-[13.5px] font-medium text-white/80">{banner.sub}</div>
        </div>

        <div className="mb-5">
          <div className="mb-[10px] flex justify-between text-[14px] font-semibold text-lav">
            <span>Tier 1 gates</span>
            <span className="tnum">
              {result.progress.passed} of {result.progress.total} passed
            </span>
          </div>
          <div className="h-[9px] overflow-hidden rounded-[5px] bg-[rgba(199,203,247,.12)]">
            <div className="h-full rounded-[5px] bg-grad" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Neighbouring rights (DDEX RDR — master/SoundExchange side) */}
        <div className="mb-5 flex items-center justify-between rounded-[14px] border border-hair bg-card px-[18px] py-[14px]">
          <div>
            <div className="text-[14px] font-bold text-white">Neighbouring rights (DDEX RDR)</div>
            <div className="mt-[2px] text-[12.5px] text-lavdim">
              {current.rdr.coreCount}/{current.rdr.total} register-ready · {current.rdr.recommendedCount} pay-out-ready
              for SoundExchange / PPL
            </div>
          </div>
          <span
            className={`flex-none rounded-full border px-3 py-[5px] text-[12px] font-bold ${current.rdr.total > 0 && current.rdr.recommendedCount === current.rdr.total ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400' : current.rdr.coreCount > 0 ? 'border-money/30 bg-money/10 text-money2' : 'border-rose-500/30 bg-rose-500/10 text-rose-400'}`}
          >
            {current.rdr.total > 0 && current.rdr.recommendedCount === current.rdr.total
              ? 'Recommended'
              : current.rdr.coreCount > 0
                ? 'Core'
                : 'Add performers'}
          </span>
        </div>

        <div className="mb-[18px] rounded-[16px] border border-brandindigo/30 bg-[linear-gradient(155deg,rgba(129,140,248,.14),rgba(217,70,239,.1))] p-[22px]">
          <div className="mb-3 text-[13px] font-bold uppercase tracking-[.04em] text-brandindigo">AI Rights Coach</div>
          <p className="text-[16px] font-semibold leading-[1.45] text-white">
            {firstBlocker ? (
              <>
                Next: <b className="text-money2">{firstBlocker.label.toLowerCase()}</b>.{' '}
                {firstBlocker.remedy ?? 'Resolve this to move toward a direct deal.'}
              </>
            ) : result.tier === 'tier1' ? (
              <>You&rsquo;re Tier-1 clear. Confirm your writers&rsquo; societies allow digital withdrawal to reach Tier 2.</>
            ) : (
              <>This release is fully cleared for direct sync, library, and streaming-withdrawal deals.</>
            )}
          </p>
        </div>

        <div className="mb-[14px] text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">
          Eligibility gates
        </div>
        {result.gates.map(gate => (
          <div key={gate.key} className="mb-3 flex items-center gap-4 rounded-[14px] border border-hair bg-card px-[18px] py-4">
            <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-[11px] ${GATE_STATE[gate.status].tile}`}>
              <GateIcon status={gate.status} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-bold text-white">{gate.label}</span>
                <span className="rounded-full border border-hair bg-card2 px-2 py-[1px] text-[10.5px] font-bold text-lavdim">
                  Tier {gate.tier}
                </span>
              </div>
              <div className="mt-[3px] text-[13px] text-lavdim">{gate.detail}</div>
              {gate.status !== 'pass' && gate.remedy && (
                <div className="mt-[6px] text-[12.5px] font-semibold text-brandindigo">→ {gate.remedy}</div>
              )}
            </div>
            <span
              className={`flex-none text-[13px] font-bold ${gate.status === 'pass' ? 'text-emerald-400' : gate.status === 'fail' ? 'text-rose-400' : 'text-money2'}`}
            >
              {gate.status === 'pass' ? 'Passed' : gate.status === 'fail' ? 'Blocked' : 'Confirm'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
