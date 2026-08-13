'use client'

import { useMemo, useState } from 'react'
import type { SyncListingEntrySource, SyncListingStatus } from '@/types'

// ─── SyncLibraryAdmin ───────────────────────────────────────────────────
// Staff-facing Sync Library section — composes three existing admin
// analogs (26-PATTERNS.md): BuyerOrgsAdmin/StaffAdmin's collapsed
// toggle-form idiom (invite panel), CapabilityRequestsAdmin's optimistic
// decision state machine (admit/reject), and DealsQueue's filter chips +
// relative-time formatting (curation queue). All classes are `.fncon`
// CSS-variable tokens (26-UI-SPEC.md Design System note) — never
// bg-ink/text-lav here.
//
// One consistent human curation gate (26-CONTEXT.md decision #2): invited
// vs self-applied renders as a metadata label on the SAME row, not a
// separate lane. Only `pending_admit` rows carry Admit/Reject actions —
// the backing route's isValidTransition() (lib/sync-library/submission.ts)
// is the sole legal authority; this UI mirrors that edge set for display
// only.
//
// LEADERSHIP-ONLY CURATION (30-CONTEXT.md access decision, 30-09-PLAN.md):
// Admit/Reject and the leadership-only Remove action are all rendered ONLY
// when `isLeadership` is true — an AE browses the queue (sees status,
// entry source, age) but never sees a curation control. This is a UX
// mirror, NOT the security boundary: both the admit/reject route
// (requireStaff(['leadership'])) and the remove route independently
// enforce leadership-only access regardless (T-26-35 / T-30-06), so
// hiding these buttons here is defense-in-depth, never the sole gate.
//
// Admitting is additionally gated server-side by the inclusion gate
// (evaluateInclusionGate, 30-04) — an admit attempt on a track that hasn't
// finished its Sync Readiness checklist / quality review returns 409 with
// a "needs completion" message; the UI surfaces that inline on the row
// (never a generic error) and leaves the row's status unchanged — the
// track stays in the Sync Readiness worklist, not rejected.

export type SyncLibraryQueueRow = {
  listingId: string
  status: SyncListingStatus
  entrySource: SyncListingEntrySource
  artistName: string | null
  artistEmail: string
  songTitle: string
  projectTitle: string
  appliedAt: string
  rejectionReason: string | null
  removalReason: string | null
}

export type ArtistPickOption = {
  profileId: string
  artistName: string | null
  email: string
}

type StageFilter = 'needs_review' | 'ready_to_admit' | 'admitted' | 'rejected' | 'all'

const STAGE_FILTERS: { value: StageFilter; label: string }[] = [
  { value: 'needs_review', label: 'Needs review' },
  { value: 'ready_to_admit', label: 'Ready to admit' },
  { value: 'admitted', label: 'Admitted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
]

const CHIP_BASE = 'rounded-full border px-2.5 py-1 text-[11px] font-medium transition'
const CHIP_ON = 'border-[color:var(--indigo)]/40 bg-[color:var(--indigo)]/15 text-[color:var(--indigo)]'
const CHIP_OFF = 'border-[color:var(--border)] text-[color:var(--ink-3)] hover:border-[color:var(--border-2)]'

// Admin admission-queue status chip (26-UI-SPEC.md Status Chip Semantics —
// Admin table). applied/invited/agreement_pending all read as "Needs
// review" — the artist hasn't reached the staff gate yet. withdrawn is not
// in the UI-SPEC table (an artist-initiated exit) but can still appear
// here, muted like TrackList.tsx's own withdrawn/removed treatment.
const QUEUE_CHIP: Record<SyncListingStatus, { label: string; className: string }> = {
  applied: {
    label: 'Needs review',
    className: 'border-[color:var(--amber-line)] bg-[color:var(--amber-bg)] text-[color:var(--amber-fg)]',
  },
  invited: {
    label: 'Needs review',
    className: 'border-[color:var(--amber-line)] bg-[color:var(--amber-bg)] text-[color:var(--amber-fg)]',
  },
  agreement_pending: {
    label: 'Needs review',
    className: 'border-[color:var(--amber-line)] bg-[color:var(--amber-bg)] text-[color:var(--amber-fg)]',
  },
  pending_admit: {
    label: 'Ready to admit',
    className: 'border-[color:var(--indigo)]/30 bg-[color:var(--indigo)]/10 text-[color:var(--indigo)]',
  },
  admitted: {
    label: 'Admitted',
    className: 'border-[color:var(--green-line)] bg-[color:var(--green-bg)] text-[color:var(--green-fg)]',
  },
  rejected: {
    label: 'Rejected',
    className: 'border-[color:var(--rose-line)] bg-[color:var(--rose-bg)] text-[color:var(--rose-fg)]',
  },
  withdrawn: {
    label: 'Withdrawn',
    className: 'border-[color:var(--border)] bg-[color:var(--panel-2)] text-[color:var(--ink-3)]',
  },
  removed: {
    label: 'Removed',
    className: 'border-[color:var(--rose-line)] bg-[color:var(--rose-bg)] text-[color:var(--rose-fg)]',
  },
}

const ENTRY_SOURCE_LABEL: Record<SyncListingEntrySource, string> = {
  admin_invited: 'Invited',
  self_applied: 'Self-applied',
}

function matchesFilter(status: SyncListingStatus, filter: StageFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'needs_review') {
    return status === 'applied' || status === 'invited' || status === 'agreement_pending'
  }
  if (filter === 'ready_to_admit') return status === 'pending_admit'
  if (filter === 'admitted') return status === 'admitted'
  return status === 'rejected'
}

// Reused verbatim from DealsQueue.tsx (26-PATTERNS.md — "reuse verbatim
// per UI-SPEC Screen F").
function formatTimeSince(iso: string): string {
  const created = new Date(iso).getTime()
  if (Number.isNaN(created)) return 'Unknown age'
  const diffMs = Date.now() - created
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days >= 1) return `${days}d ago`
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  if (hours >= 1) return `${hours}h ago`
  const minutes = Math.max(0, Math.floor(diffMs / (1000 * 60)))
  return `${minutes}m ago`
}

async function parseError(res: Response): Promise<string> {
  const json = await res.json().catch(() => ({}))
  return (json as { error?: string }).error ?? 'Something went wrong — please try again.'
}

export function SyncLibraryAdmin({
  initialRows,
  artistPool,
  isLeadership,
}: {
  initialRows: SyncLibraryQueueRow[]
  artistPool: ArtistPickOption[]
  isLeadership: boolean
}) {
  const [rows, setRows] = useState<SyncLibraryQueueRow[]>(initialRows)
  const [stageFilter, setStageFilter] = useState<StageFilter>('needs_review')

  const [pendingId, setPendingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reasonByListing, setReasonByListing] = useState<Record<string, string>>({})
  // Per-row "needs completion" message from the admit route's 409 gate
  // response (30-04) — kept separate from actionError so it renders inline
  // on the specific row rather than as a page-level banner, and the row's
  // status stays untouched (CONTEXT.md "Incomplete ≠ rejected").
  const [needsCompletionByListing, setNeedsCompletionByListing] = useState<Record<string, string>>({})
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null)
  const [removeReasonByListing, setRemoveReasonByListing] = useState<Record<string, string>>({})

  // Invite panel state — collapsed toggle-form idiom.
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteQuery, setInviteQuery] = useState('')
  const [selectedArtist, setSelectedArtist] = useState<ArtistPickOption | null>(null)
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)

  const visibleRows = rows.filter(row => matchesFilter(row.status, stageFilter))

  const artistMatches = useMemo(() => {
    const q = inviteQuery.trim().toLowerCase()
    if (!q || selectedArtist) return []
    return artistPool
      .filter(
        a =>
          (a.artistName ?? '').toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          a.profileId.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [inviteQuery, selectedArtist, artistPool])

  const handleDecision = async (listingId: string, decision: 'admit' | 'reject') => {
    setPendingId(listingId)
    setActionError(null)
    setNeedsCompletionByListing(prev => {
      const next = { ...prev }
      delete next[listingId]
      return next
    })
    try {
      const reason = decision === 'reject' ? reasonByListing[listingId]?.trim() : undefined
      const res = await fetch(`/api/sync-library/admin/${listingId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, ...(reason ? { reason } : {}) }),
      })
      // 30-04's admit route returns 409 when the inclusion gate isn't clear
      // yet (checklist incomplete and/or quality review not passed) — this
      // is NOT a failure, it's "not yet eligible." Surface it inline on
      // the row, pointing at the Sync Readiness worklist, and leave the
      // row's status untouched rather than throwing a generic error.
      if (res.status === 409 && decision === 'admit') {
        const json = await res.json().catch(() => ({}))
        const message =
          (json as { error?: string }).error ??
          'This track needs to finish its Sync Readiness checklist and/or pass quality review before it can be admitted.'
        setNeedsCompletionByListing(prev => ({ ...prev, [listingId]: message }))
        return
      }
      if (!res.ok) throw new Error(await parseError(res))
      const nextStatus: SyncListingStatus = decision === 'admit' ? 'admitted' : 'rejected'
      setRows(prev =>
        prev.map(r =>
          r.listingId === listingId
            ? {
                ...r,
                status: nextStatus,
                rejectionReason: decision === 'reject' ? (reason ?? null) : r.rejectionReason,
              }
            : r
        )
      )
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setPendingId(null)
    }
  }

  const handleRemove = async (listingId: string) => {
    setPendingId(listingId)
    setActionError(null)
    try {
      const reason = removeReasonByListing[listingId]?.trim()
      const res = await fetch(`/api/sync-library/admin/${listingId}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reason ? { reason } : {}),
      })
      if (!res.ok) throw new Error(await parseError(res))
      setRows(prev =>
        prev.map(r =>
          r.listingId === listingId ? { ...r, status: 'removed', removalReason: reason ?? null } : r
        )
      )
      setConfirmingRemoveId(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setPendingId(null)
    }
  }

  const handleInvite = async () => {
    if (!selectedArtist) {
      setInviteError('Select an artist first.')
      return
    }
    setInviting(true)
    setInviteError(null)
    setInviteSuccess(null)
    try {
      const res = await fetch('/api/sync-library/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: selectedArtist.profileId }),
      })
      if (!res.ok) throw new Error(await parseError(res))
      setInviteSuccess(`Invited ${selectedArtist.artistName ?? selectedArtist.email}.`)
      setSelectedArtist(null)
      setInviteQuery('')
      setShowInviteForm(false)
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="mt-6">
      {inviteSuccess && (
        <div className="mb-4 rounded-lg border border-[color:var(--green-line)] bg-[color:var(--green-bg)] px-4 py-3 text-[13px] text-[color:var(--green-fg)]">
          {inviteSuccess}
          <button
            className="ml-3 text-xs underline opacity-60 hover:opacity-100"
            onClick={() => setInviteSuccess(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {actionError && (
        <div className="mb-4 rounded-lg border border-[color:var(--rose-line)] bg-[color:var(--rose-bg)] px-4 py-3 text-[13px] text-[color:var(--rose-fg)]">
          {actionError}
          <button
            className="ml-3 text-xs underline opacity-60 hover:opacity-100"
            onClick={() => setActionError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Invite panel — collapsed toggle-form idiom (BuyerOrgsAdmin.tsx:285 /
          StaffAdmin.tsx's fncon-cta equivalent). */}
      {!showInviteForm && (
        <button
          onClick={() => {
            setShowInviteForm(true)
            setInviteError(null)
          }}
          className="fncon-cta mb-4 rounded-lg px-4 py-2.5 text-[13px] font-bold shadow transition hover:opacity-90"
        >
          + Invite artist
        </button>
      )}

      {showInviteForm && (
        <div className="mt-1 mb-4 rounded-[10px] border border-[color:var(--indigo)]/30 bg-[color:var(--panel)] p-4">
          <h3 className="mb-3 text-[13px] font-bold text-[color:var(--ink-2)]">
            Invite an artist to the Sync Library
          </h3>
          {inviteError && <p className="mb-3 text-[13px] text-[color:var(--rose-fg)]">{inviteError}</p>}
          <div className="relative">
            <label className="mb-1 block text-[13px] font-bold text-[color:var(--ink-2)]">Artist *</label>
            <input
              value={
                selectedArtist
                  ? `${selectedArtist.artistName ?? 'Unnamed account'} — ${selectedArtist.email}`
                  : inviteQuery
              }
              onChange={e => {
                setSelectedArtist(null)
                setInviteQuery(e.target.value)
              }}
              placeholder="Search by name or email"
              className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
            />
            {artistMatches.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] shadow-lg">
                {artistMatches.map(a => (
                  <button
                    key={a.profileId}
                    type="button"
                    onClick={() => {
                      setSelectedArtist(a)
                      setInviteQuery('')
                    }}
                    className="block w-full px-3 py-2 text-left text-[13px] text-[color:var(--ink)] hover:bg-[color:var(--indigo)]/10"
                  >
                    <span className="font-semibold">{a.artistName ?? 'Unnamed account'}</span>
                    <span className="ml-2 text-[color:var(--ink-3)]">{a.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleInvite}
              disabled={inviting || !selectedArtist}
              className="rounded-lg bg-[color:var(--ink)] px-4 py-2 text-[13px] font-bold text-[color:var(--ground)] transition hover:opacity-90 disabled:opacity-50"
            >
              {inviting ? 'Sending…' : 'Send invite'}
            </button>
            <button
              onClick={() => {
                setShowInviteForm(false)
                setSelectedArtist(null)
                setInviteQuery('')
                setInviteError(null)
              }}
              className="rounded-lg border border-[color:var(--border)] px-4 py-2 text-[13px] text-[color:var(--ink-2)] transition hover:text-[color:var(--ink)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Curation queue — DealsQueue-style filter chips + relative time. */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)] p-8 text-center">
          <p className="text-[14px] font-semibold text-[color:var(--ink-2)]">No submissions yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[12px] text-[color:var(--ink-3)]">
            Artist-submitted and invited songs will appear here for review, oldest first.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {STAGE_FILTERS.map(f => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStageFilter(f.value)}
                className={`${CHIP_BASE} ${stageFilter === f.value ? CHIP_ON : CHIP_OFF}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {visibleRows.length === 0 ? (
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)] p-6 text-center text-[12px] text-[color:var(--ink-3)]">
                No songs match this filter.
              </div>
            ) : (
              visibleRows.map(row => {
                const chip = QUEUE_CHIP[row.status]
                const isPending = pendingId === row.listingId
                return (
                  <div key={row.listingId} className="rounded-xl border border-[color:var(--border)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-bold text-[color:var(--ink)]">{row.songTitle}</p>
                        <p className="mt-0.5 truncate text-[12px] text-[color:var(--ink-3)]">
                          {row.artistName ?? 'Unnamed account'} · {row.artistEmail} · {row.projectTitle}
                        </p>
                        <p className="mt-1 text-[11px] text-[color:var(--ink-3)]">
                          {ENTRY_SOURCE_LABEL[row.entrySource]} · Submitted {formatTimeSince(row.appliedAt)}
                        </p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${chip.className}`}>
                        {chip.label}
                      </span>
                    </div>

                    {row.status === 'rejected' && row.rejectionReason && (
                      <p className="mt-2 text-[11px] text-[color:var(--rose-fg)]">Reason: {row.rejectionReason}</p>
                    )}
                    {row.status === 'removed' && row.removalReason && (
                      <p className="mt-2 text-[11px] text-[color:var(--rose-fg)]">Reason: {row.removalReason}</p>
                    )}

                    {row.status === 'pending_admit' && needsCompletionByListing[row.listingId] && (
                      <p className="mt-2 text-[11px] text-[color:var(--amber-fg)]">
                        {needsCompletionByListing[row.listingId]} See the Sync Readiness worklist below.
                      </p>
                    )}

                    {/* Admit/Reject — LEADERSHIP-ONLY, mirroring the Remove
                        action below; the route independently enforces this
                        (T-30-06) regardless of what renders here. */}
                    {row.status === 'pending_admit' && isLeadership && (
                      <div className="mt-3">
                        <input
                          value={reasonByListing[row.listingId] ?? ''}
                          onChange={e =>
                            setReasonByListing(prev => ({ ...prev, [row.listingId]: e.target.value }))
                          }
                          placeholder="Reason (optional, shown to the artist if rejected)"
                          className="mb-2 w-full max-w-md rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-1.5 text-[12px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleDecision(row.listingId, 'admit')}
                            disabled={isPending}
                            className="rounded-lg bg-[color:var(--ink)] px-3 py-1.5 text-[12px] font-bold text-[color:var(--ground)] transition hover:opacity-90 disabled:opacity-50"
                          >
                            {isPending ? 'Working…' : 'Admit'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecision(row.listingId, 'reject')}
                            disabled={isPending}
                            className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-[12px] text-[color:var(--ink-2)] transition hover:text-[color:var(--ink)] disabled:opacity-50"
                          >
                            {isPending ? 'Working…' : 'Reject'}
                          </button>
                        </div>
                      </div>
                    )}
                    {row.status === 'pending_admit' && !isLeadership && (
                      <p className="mt-3 text-[11px] text-[color:var(--ink-3)]">
                        Awaiting a leadership admit/reject decision.
                      </p>
                    )}

                    {/* Leadership-only takedown — rendered ONLY when isLeadership;
                        the remove route independently enforces
                        requireStaff(['leadership']) regardless (T-26-35). */}
                    {row.status === 'admitted' && isLeadership && (
                      <div className="mt-3">
                        {confirmingRemoveId === row.listingId ? (
                          <div className="rounded-lg border border-[color:var(--rose-line)] bg-[color:var(--rose-bg)] p-3">
                            <p className="mb-2 text-[12px] text-[color:var(--rose-fg)]">
                              Remove &quot;{row.songTitle}&quot; from the Sync Library? It will stop appearing in
                              Browse the Catalogue immediately.
                            </p>
                            <input
                              value={removeReasonByListing[row.listingId] ?? ''}
                              onChange={e =>
                                setRemoveReasonByListing(prev => ({ ...prev, [row.listingId]: e.target.value }))
                              }
                              placeholder="Reason (optional, shown to the artist)"
                              className="mb-2 w-full max-w-md rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-1.5 text-[12px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:outline-none"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleRemove(row.listingId)}
                                disabled={isPending}
                                className="rounded-lg border border-[color:var(--rose-line)] px-3 py-1.5 text-[12px] font-bold text-[color:var(--rose-fg)] transition hover:opacity-80 disabled:opacity-50"
                              >
                                {isPending ? 'Working…' : 'Remove'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingRemoveId(null)}
                                disabled={isPending}
                                className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-[12px] text-[color:var(--ink-2)] transition hover:text-[color:var(--ink)] disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmingRemoveId(row.listingId)}
                            className="rounded-lg border border-[color:var(--rose-line)] px-3 py-1.5 text-[12px] font-semibold text-[color:var(--rose-fg)] transition hover:opacity-80"
                          >
                            Remove from Sync Library
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}
