'use client'

import { useState } from 'react'
import { industryRoleLabel } from '@/lib/industry-roles'

// ─── CapabilityRequestsAdmin ──────────────────────────────────────────────
// Admin-facing counterpart to Plan 03's CapabilityCta. Mirrors MembersAdmin's
// list state machine (optimistic removal, error banner, date formatting).
// role_slugs render read-only — the badge was already chosen at request
// time (D-11); this queue is display + approve/deny only, no override UI.

export type CapabilityRequest = {
  grantId: string
  profileId: string
  artistName: string | null
  email: string
  capability: 'artist' | 'industry'
  roleSlugs: string[]
  requestedAt: string
}

function formatRequested(dateString: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
      new Date(dateString)
    )
  } catch {
    return dateString
  }
}

export function CapabilityRequestsAdmin({
  initialRequests,
}: {
  initialRequests: CapabilityRequest[]
}) {
  const [requests, setRequests] = useState<CapabilityRequest[]>(initialRequests)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleDecision = async (grantId: string, decision: 'approve' | 'deny') => {
    setPendingId(grantId)
    setActionError(null)
    try {
      const res = await fetch(`/api/capabilities/approve/${grantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Something went wrong — please try again.')
      }
      setRequests(prev => prev.filter(r => r.grantId !== grantId))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="mt-6">
      {actionError && (
        <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-300">
          {actionError}
          <button
            className="ml-3 text-xs underline opacity-60 hover:opacity-100"
            onClick={() => setActionError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {requests.length === 0 ? (
        <p className="mt-4 text-[14px] text-white/50">No pending capability requests.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map(request => (
            <div key={request.grantId} className="rounded-xl border border-white/10 p-4">
              <p className="truncate text-[14px] font-bold text-white">
                {request.artistName ?? 'Unnamed account'}
              </p>
              <p className="mt-0.5 text-[12px] text-lavdim">
                {request.email} · Requested {formatRequested(request.requestedAt)}
              </p>
              <p className="mt-2 text-[12px] font-semibold text-white/70">
                Requesting {request.capability} access
              </p>
              {request.roleSlugs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {request.roleSlugs.map(slug => (
                    <span
                      key={slug}
                      className="rounded-full border border-hair bg-card2 px-2 py-0.5 text-[11px] text-lav"
                    >
                      {industryRoleLabel(slug)}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleDecision(request.grantId, 'approve')}
                  disabled={pendingId === request.grantId}
                  className="rounded-lg bg-white px-3 py-1.5 text-[12px] font-bold text-black transition hover:bg-white/90 disabled:opacity-50"
                >
                  {pendingId === request.grantId ? 'Working…' : 'Approve'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDecision(request.grantId, 'deny')}
                  disabled={pendingId === request.grantId}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-white/60 transition hover:text-white disabled:opacity-50"
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
