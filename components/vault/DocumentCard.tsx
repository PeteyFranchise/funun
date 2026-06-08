'use client'

import type { DocRequirement, DocStatus } from '@/lib/vault/stage3'

const STATUS_META: Record<
  DocStatus,
  { label: string; badge: string; dot: string }
> = {
  missing: {
    label: 'Missing',
    badge: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
    dot: 'bg-rose-400',
  },
  pending: {
    label: 'Pending',
    badge: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    dot: 'bg-amber-400',
  },
  signed: {
    label: 'Signed',
    badge: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    dot: 'bg-emerald-400',
  },
}

// Left-border accent by severity + status (our theme, not the brief hexes).
function accent(req: DocRequirement): string {
  if (req.status === 'signed') return 'border-l-emerald-400/70 bg-emerald-400/[0.03]'
  if (req.severity === 'recommended') return 'border-l-amber-400/70 bg-amber-400/[0.03]'
  return 'border-l-rose-500/70 bg-rose-500/[0.04]'
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DocumentCard({
  req,
  onOpen,
  onMarkSigned,
  busy,
}: {
  req: DocRequirement
  onOpen: (req: DocRequirement) => void
  onMarkSigned: (req: DocRequirement) => void
  busy?: boolean
}) {
  const meta = STATUS_META[req.status]
  const scopeLabel =
    req.scope === 'project'
      ? 'Whole project'
      : req.scope === 'collaborator'
        ? `${req.collaboratorRole ?? 'Collaborator'} · ${req.trackTitle}`
        : req.trackTitle

  return (
    <div
      className={`rounded-xl border border-white/10 border-l-2 p-4 ${accent(req)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{req.title}</p>
          {scopeLabel && (
            <p className="mt-0.5 truncate text-xs text-white/40">{scopeLabel}</p>
          )}
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${meta.badge}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
      </div>

      <p
        className={`mt-2 text-xs ${
          req.severity === 'required' && req.status !== 'signed'
            ? 'text-rose-300/90'
            : 'text-white/50'
        }`}
      >
        {req.protects}
      </p>

      <div className="mt-3 flex items-center gap-2">
        {req.status === 'signed' ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
            <CheckIcon /> Complete
          </span>
        ) : (
          <>
            <button
              onClick={() => onOpen(req)}
              disabled={busy}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {req.status === 'pending' ? 'Review / regenerate' : `Generate ${req.title}`}
            </button>
            {req.status === 'pending' && req.documentId && (
              <button
                onClick={() => onMarkSigned(req)}
                disabled={busy}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-40"
              >
                Mark signed
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
