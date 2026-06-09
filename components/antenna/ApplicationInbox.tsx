import type { MatchBreakdown } from '@/types'
import { MatchScoreBar } from './MatchScoreBreakdown'

export type Applicant = {
  matchId: string
  artistName: string
  projectTitle: string
  projectType: string
  readiness: number
  score: number
  breakdown: MatchBreakdown | null
  note: string | null
  appliedAt: string | null
}

export function ApplicationInbox({ applicants }: { applicants: Applicant[] }) {
  if (applicants.length === 0) {
    return (
      <p className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-white/50">
        No applications yet. Matched artists can apply with a project from their vault — they&rsquo;ll
        appear here with their readiness and match score.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {applicants.map(a => (
        <div key={a.matchId} className="rounded-xl border border-[#1A1838] bg-[#0E0D1E] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-white">{a.artistName}</p>
              <p className="text-sm text-white/50">
                {a.projectTitle} · {a.projectType}
              </p>
            </div>
            <div className="w-40">
              <MatchScoreBar score={a.score} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/40">
            <span>Vault readiness {a.readiness}/100</span>
            {a.appliedAt && (
              <span>
                Applied{' '}
                {new Date(a.appliedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            )}
          </div>

          {a.note && (
            <p className="mt-3 whitespace-pre-wrap rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm text-white/70">
              {a.note}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
