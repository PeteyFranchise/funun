import type { Submission } from '@/types'

const STATUS_STYLES: Record<Submission['status'], string> = {
  draft: 'border-white/15 text-white/50',
  sent: 'border-[#818CF8]/40 bg-[#818CF8]/10 text-[#A8AFF5]',
  viewed: 'border-[#60A5FA]/40 bg-[#60A5FA]/10 text-[#93C5FD]',
  responded: 'border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F4C77B]',
  accepted: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  declined: 'border-rose-400/40 bg-rose-400/10 text-rose-300',
  no_response: 'border-white/15 text-white/40',
}

const STATUS_LABELS: Record<Submission['status'], string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  responded: 'Responded',
  accepted: 'Accepted',
  declined: 'Declined',
  no_response: 'No response',
}

/**
 * Shared outreach history for a project. Surfaces every submission row —
 * whether it came from PitchPlug ("mark as sent") or an Antenna application —
 * so the artist has one timeline per project.
 */
export function SubmissionHistory({ submissions }: { submissions: Submission[] }) {
  if (submissions.length === 0) {
    return (
      <p className="text-sm text-white/40">
        No outreach yet. Pitches you send with PitchPlug and Antenna applications show up here.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {submissions.map(s => (
        <li
          key={s.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{s.destination_name}</p>
            <p className="text-xs text-white/40">
              {s.destination_type === 'antenna' ? 'Antenna application' : s.destination_type}
              {s.submitted_at
                ? ` · ${new Date(s.submitted_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}`
                : ''}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${STATUS_STYLES[s.status]}`}
          >
            {STATUS_LABELS[s.status]}
          </span>
        </li>
      ))}
    </ul>
  )
}
