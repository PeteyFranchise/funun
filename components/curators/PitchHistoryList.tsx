import type { PitchStatus } from '@/types'

// ─── PitchHistoryList ─────────────────────────────────────────────────
// Per-project pitch history inside /launchpad/[projectId] (PITCH-03).
// Reuses DocumentCard's STATUS_META badge triad retargeted to PitchStatus
// — pending/accepted/declined only, NO 'opened' state (D-10).

export type PitchHistoryRow = {
  id: string
  curatorName: string
  trackTitle: string
  status: PitchStatus
  sent_at: string
  decline_reason: string | null
}

const STATUS_META: Record<PitchStatus, { label: string; badge: string; dot: string }> = {
  pending: {
    label: 'Pending',
    badge: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    dot: 'bg-amber-400',
  },
  accepted: {
    label: 'Accepted',
    badge: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    dot: 'bg-emerald-400',
  },
  declined: {
    label: 'Declined',
    badge: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
    dot: 'bg-rose-400',
  },
}

// Optional empty-state copy override — the curator-portal read-only view
// (06-05) needs different copy ("No pitches yet" / "When artists pitch
// your playlist, you'll see them here.") than the artist-facing launchpad
// history. Defaults preserve the original artist-facing copy exactly.
export type PitchHistoryEmptyState = { heading: string; body: string }

export function PitchHistoryList({
  pitches,
  emptyState,
}: {
  pitches: PitchHistoryRow[]
  emptyState?: PitchHistoryEmptyState
}) {
  if (pitches.length === 0) {
    const heading = emptyState?.heading ?? 'No pitches sent yet'
    const body =
      emptyState?.body ??
      'Select curators from the directory to send your first pitch for this project.'
    return (
      <div className="rounded-xl border border-white/10 p-6 text-center">
        <p className="text-[15px] font-bold text-white">{heading}</p>
        <p className="mt-1.5 text-[13px] text-white/40">{body}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {pitches.map(pitch => {
        const meta = STATUS_META[pitch.status]
        return (
          <div key={pitch.id} className="rounded-xl border border-white/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{pitch.curatorName}</p>
                <p className="mt-0.5 truncate text-xs text-white/40">
                  {pitch.trackTitle} · Sent {new Date(pitch.sent_at).toLocaleDateString()}
                </p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${meta.badge}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
            </div>
            {pitch.status === 'declined' && pitch.decline_reason && (
              <p className="mt-2 text-xs italic text-white/40">{pitch.decline_reason}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
