import type { MatchBreakdown } from '@/types'
import { scoreColor, scoreLabel } from '@/lib/antenna/display'

export function MatchScoreBar({ score, showLabel }: { score: number; showLabel?: boolean }) {
  const color = scoreColor(score)
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color }}>
          {score}% match
        </span>
        {showLabel && <span className="text-xs text-white/40">{scoreLabel(score)}</span>}
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

export function MatchScoreBreakdown({ breakdown }: { breakdown: MatchBreakdown }) {
  return (
    <div className="space-y-3">
      {breakdown.factors.map(f => {
        const pct = f.max === 0 ? 0 : Math.round((f.earned / f.max) * 100)
        return (
          <div key={f.key}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/80">{f.label}</span>
              <span className="text-white/50">
                {f.earned}/{f.max}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#818CF8]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-0.5 text-xs text-white/40">{f.detail}</p>
          </div>
        )
      })}
    </div>
  )
}
