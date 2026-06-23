'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { evaluateBenchmarks, type BenchmarkInput, type MetricStatus } from '@/lib/benchmarks/engine'
import { unlockSummary, type GateState } from '@/lib/benchmarks/opportunity-map'

const STATUS_STYLE: Record<MetricStatus, { chip: string; bar: string; label: string }> = {
  ahead: { chip: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30', bar: '#34D399', label: 'Ahead' },
  on_track: { chip: 'text-money2 bg-money/10 border-money/30', bar: '#F59E0B', label: 'Close' },
  behind: { chip: 'text-rose-400 bg-rose-500/10 border-rose-500/30', bar: '#F43F5E', label: 'Behind' },
}

const GATE_STYLE: Record<GateState, { chip: string; dot: string }> = {
  qualifies: { chip: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30', dot: '#34D399' },
  almost: { chip: 'text-money2 bg-money/10 border-money/30', dot: '#F59E0B' },
  locked: { chip: 'text-lavdim bg-white/[.04] border-hairstrong', dot: '#7c80b4' },
}

function Field({
  label,
  value,
  onChange,
  suffix,
  step = 0.1,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  suffix: string
  step?: number
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-lavdim">{label}</span>
      <div className="mt-1 flex items-center gap-1 rounded-[9px] border border-hair bg-card px-3 py-2">
        <input
          type="number"
          value={Number.isFinite(value) ? value : ''}
          onChange={e => onChange(Number(e.target.value) || 0)}
          step={step}
          min={0}
          className="w-full bg-transparent text-[15px] text-white focus:outline-none tnum"
        />
        <span className="text-[12px] text-lavdim">{suffix}</span>
      </div>
    </label>
  )
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function BenchmarkView({
  initial,
  genre,
  canSave = false,
}: {
  initial: BenchmarkInput
  genre: string | null
  /** True for a signed-in artist — enables persisting metrics to the profile. */
  canSave?: boolean
}) {
  const [input, setInput] = useState<BenchmarkInput>(initial)
  const [open, setOpen] = useState<string | null>(null)
  const [save, setSave] = useState<SaveState>('idle')
  const result = useMemo(() => evaluateBenchmarks(input, genre), [input, genre])
  const unlocked = useMemo(() => unlockSummary(result), [result])
  const set = (k: keyof BenchmarkInput, n: number) => {
    setInput(p => ({ ...p, [k]: n }))
    setSave('idle')
  }

  async function persist() {
    setSave('saving')
    try {
      const res = await fetch('/api/benchmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      setSave(res.ok ? 'saved' : 'error')
    } catch {
      setSave('error')
    }
  }

  return (
    <div className="grid gap-7 lg:grid-cols-[320px_1fr]">
      {/* Your metrics (manual entry until a data feed is connected) */}
      <div className="h-fit rounded-card border border-hair bg-card p-6">
        <div className="text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">Your metrics</div>
        <div className="mt-4 space-y-3">
          <Field label="Monthly listeners" value={input.monthlyListeners} onChange={n => set('monthlyListeners', n)} suffix="" step={100} />
          <Field label="Saves-to-streams" value={input.savesToStreamsPct} onChange={n => set('savesToStreamsPct', n)} suffix="%" />
          <Field label="Follower growth / mo" value={input.followerGrowthPctMonthly} onChange={n => set('followerGrowthPctMonthly', n)} suffix="%" />
          <Field label="Engagement / post" value={input.engagementRatePct} onChange={n => set('engagementRatePct', n)} suffix="%" />
          <Field label="Playlist adds / mo" value={input.playlistAddsPerMonth} onChange={n => set('playlistAddsPerMonth', n)} suffix="/mo" step={1} />
        </div>
        {canSave && (
          <button
            onClick={persist}
            disabled={save === 'saving'}
            className="mt-4 w-full rounded-[10px] bg-grad px-4 py-[11px] text-[13.5px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(217,70,239,.5)] disabled:opacity-60"
          >
            {save === 'saving' ? 'Saving…' : save === 'saved' ? 'Saved ✓' : 'Save & sync to Antenna'}
          </button>
        )}
        {save === 'saved' && (
          <p className="mt-2 text-[12px] font-medium text-emerald-400">
            Your Antenna now gates opportunities against these numbers.
          </p>
        )}
        {save === 'error' && (
          <p className="mt-2 text-[12px] font-medium text-rose-400">Couldn&rsquo;t save — try again.</p>
        )}
        <p className="mt-4 text-[11.5px] leading-[1.5] text-lavdim">
          Enter your numbers for now — automatic Spotify / social syncing is coming. Benchmarks are
          seeded from Funūn&rsquo;s framework and sharpen as the artist dataset grows.
        </p>
      </div>

      {/* Comparison */}
      <div>
        <div className="mb-5 rounded-[16px] border border-brandindigo/30 bg-[linear-gradient(150deg,rgba(129,140,248,.14),rgba(217,70,239,.08))] px-5 py-4">
          <div className="text-[12px] font-bold uppercase tracking-[.14em] text-brandindigo">
            {result.stage.label} artist · {result.genre}
          </div>
          <div className="mt-1 text-[15px] font-semibold text-white">
            {result.onTrackCount}/{result.metrics.length} metrics at breakthrough pace. Next threshold:{' '}
            <span className="text-money2">{result.stage.nextThresholdLabel}</span>.
          </div>
        </div>

        {/* What this unlocks in Antenna — the live bridge to the opportunities room */}
        <div className="mb-3 rounded-[16px] border border-hair bg-card p-[18px]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] flex-none" fill="none" stroke="#818CF8" strokeWidth={1.8}>
                <path d="M13 2 3 14h7l-1 8 10-12h-7z" strokeLinejoin="round" />
              </svg>
              <span className="text-[12px] font-bold uppercase tracking-[.14em] text-lavdim">
                What this unlocks in Antenna
              </span>
            </div>
            <Link href="/antenna" className="whitespace-nowrap text-[12.5px] font-semibold text-brandindigo">
              Open Antenna →
            </Link>
          </div>

          <div className="mt-4 space-y-[11px]">
            {unlocked.map(({ type, label, gate }) => {
              const g = GATE_STYLE[gate.state]
              return (
                <div key={type} className="flex items-center gap-3">
                  <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: g.dot }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-bold text-white">{label}</span>
                      <span className={`flex-none rounded-full border px-[9px] py-[2px] text-[11px] font-bold ${g.chip}`}>
                        {gate.label}
                      </span>
                    </div>
                    <p className="mt-[3px] text-[12.5px] leading-[1.45] text-lav">{gate.reason}</p>
                  </div>
                  {gate.state === 'qualifies' && (
                    <Link
                      href="/antenna"
                      className="flex-none whitespace-nowrap text-[12.5px] font-bold text-brandindigo"
                    >
                      Pitch →
                    </Link>
                  )}
                </div>
              )
            })}
          </div>

          <p className="mt-4 border-t border-hair pt-3 text-[11.5px] leading-[1.5] text-lavdim">
            Cross a benchmark and the matching opportunities flip to{' '}
            <span className="text-emerald-400">Qualifies</span> in your Antenna.
          </p>
        </div>

        <div className="space-y-3">
          {result.metrics.map(m => {
            const s = STATUS_STYLE[m.status]
            const pct = Math.max(4, Math.min(100, (m.value / m.target) * 100))
            const isOpen = open === m.key
            return (
              <div key={m.key} className="rounded-[14px] border border-hair bg-card p-[18px]">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[16px] font-bold text-white">{m.label}</div>
                  <span className={`flex-none rounded-full border px-3 py-[4px] text-[12px] font-bold ${s.chip}`}>{s.label}</span>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <span className="tnum text-[22px] font-extrabold text-white">
                    {m.value}
                    <span className="text-[13px] font-semibold text-lavdim">{m.unit}</span>
                  </span>
                  <div className="relative h-[8px] flex-1 overflow-hidden rounded-full bg-[rgba(199,203,247,.12)]">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.bar }} />
                    <span className="absolute right-0 top-1/2 h-[14px] -translate-y-1/2 border-l border-dashed border-white/50" title="benchmark" />
                  </div>
                  <span className="tnum flex-none text-[13px] font-semibold text-lavdim">
                    target {m.target}
                    {m.unit}
                  </span>
                </div>

                <p className="mt-3 text-[13.5px] leading-[1.5] text-lav">{m.detail}</p>

                {m.status !== 'ahead' && (
                  <>
                    <button
                      onClick={() => setOpen(isOpen ? null : m.key)}
                      className="mt-3 text-[13px] font-semibold text-brandindigo"
                    >
                      {isOpen ? 'Hide actions' : 'Show the 3 actions that move this →'}
                    </button>
                    {isOpen && (
                      <ol className="mt-3 space-y-2 border-t border-hair pt-3">
                        {m.actions.map((a, i) => (
                          <li key={i} className="flex gap-3 text-[13.5px] text-lav">
                            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-grad text-[11px] font-extrabold text-white">
                              {i + 1}
                            </span>
                            {a}
                          </li>
                        ))}
                      </ol>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
