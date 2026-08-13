'use client'

import { useState } from 'react'
import type { WorklistRow } from '@/lib/sync-library/worklist'

// ─── SyncReadinessWorklist ──────────────────────────────────────────────
// Staff-facing "what's missing per track" worklist (30-05's GET /api/sync-
// library/worklist). Renders EXACTLY the rows the worklist route returns —
// no client-side readiness recompute (30-CONTEXT.md "Reuse that engine; do
// not rebuild it" + this plan's prohibition). Leadership gets inline
// quality-review (pass/fail + optional note) and guidance staff-notes
// controls, POSTing to the leadership-only quality route (30-04); any
// other staff role (ae/bd/anr) sees the identical rows READ-ONLY — browse,
// not curate (30-CONTEXT.md access decision). All classes are `.fncon`
// CSS-variable tokens, mirroring SyncLibraryAdmin.tsx's token vocabulary —
// never .fnbl/bg-ink/text-lav here.

const CHIP_BASE = 'rounded-full border px-2.5 py-1 text-[11px] font-medium transition'

const MISSING_CHIP =
  'rounded-full border border-[color:var(--amber-line)] bg-[color:var(--amber-bg)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--amber-fg)]'

// Open-status label for a worklist row — the worklist route only ever
// returns non-terminal, non-admitted listings (buildWorklist's own filter),
// so this covers every status that can appear here.
const STATUS_LABEL: Record<string, string> = {
  applied: 'Applied',
  invited: 'Invited',
  agreement_pending: 'Agreement pending',
  pending_admit: 'Ready to admit',
}

// Reused verbatim from SyncLibraryAdmin.tsx (DealsQueue.tsx origin,
// 26-PATTERNS.md — "reuse verbatim per UI-SPEC Screen F").
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

function qualityBadge(qualityOk: boolean | null): { label: string; className: string } {
  if (qualityOk === true) {
    return {
      label: 'Quality: pass',
      className: 'border-[color:var(--green-line)] bg-[color:var(--green-bg)] text-[color:var(--green-fg)]',
    }
  }
  if (qualityOk === false) {
    return {
      label: 'Quality: fail',
      className: 'border-[color:var(--rose-line)] bg-[color:var(--rose-bg)] text-[color:var(--rose-fg)]',
    }
  }
  return {
    label: 'Quality: not reviewed',
    className: 'border-[color:var(--border)] text-[color:var(--ink-3)]',
  }
}

export function SyncReadinessWorklist({
  rows: initialRows,
  isLeadership,
}: {
  rows: WorklistRow[]
  isLeadership: boolean
}) {
  const [rows, setRows] = useState<WorklistRow[]>(initialRows)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [qualityNoteByListing, setQualityNoteByListing] = useState<Record<string, string>>({})
  const [staffNotesDraftByListing, setStaffNotesDraftByListing] = useState<Record<string, string>>({})

  const handleQualityDecision = async (listingId: string, qualityOk: boolean) => {
    setPendingId(listingId)
    setActionError(null)
    try {
      const note = qualityNoteByListing[listingId]?.trim()
      const res = await fetch(`/api/sync-library/admin/${listingId}/quality`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality_ok: qualityOk, ...(note ? { quality_note: note } : {}) }),
      })
      if (!res.ok) throw new Error(await parseError(res))
      setRows(prev => prev.map(r => (r.listingId === listingId ? { ...r, qualityOk } : r)))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setPendingId(null)
    }
  }

  const handleSaveStaffNotes = async (listingId: string) => {
    setPendingId(listingId)
    setActionError(null)
    try {
      const draft = staffNotesDraftByListing[listingId] ?? ''
      const res = await fetch(`/api/sync-library/admin/${listingId}/quality`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_notes: draft }),
      })
      if (!res.ok) throw new Error(await parseError(res))
      const trimmed = draft.trim()
      setRows(prev =>
        prev.map(r => (r.listingId === listingId ? { ...r, staffNotes: trimmed === '' ? null : trimmed } : r))
      )
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setPendingId(null)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)] p-8 text-center">
        <p className="text-[14px] font-semibold text-[color:var(--ink-2)]">Nothing on the worklist</p>
        <p className="mx-auto mt-1 max-w-sm text-[12px] text-[color:var(--ink-3)]">
          Every submitted song has cleared its Sync Readiness checklist — incomplete tracks will show up
          here with exactly what&apos;s missing.
        </p>
      </div>
    )
  }

  return (
    <div>
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

      <div className="flex flex-col gap-2">
        {rows.map(row => {
          const isPending = pendingId === row.listingId
          const badge = qualityBadge(row.qualityOk)
          return (
            <div key={row.listingId} className="rounded-xl border border-[color:var(--border)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold text-[color:var(--ink)]">{row.trackTitle}</p>
                  <p className="mt-0.5 truncate text-[12px] text-[color:var(--ink-3)]">
                    {row.artistName ?? 'Unnamed account'} · {row.projectTitle}
                  </p>
                  <p className="mt-1 text-[11px] text-[color:var(--ink-3)]">
                    {STATUS_LABEL[row.status] ?? row.status} · Submitted {formatTimeSince(row.appliedAt)}
                  </p>
                </div>
                <span className={`${CHIP_BASE} ${badge.className}`}>{badge.label}</span>
              </div>

              {/* Exactly what's missing — the worklist route's missing[], never
                  recomputed here. */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {row.missing.length === 0 ? (
                  <span
                    className={`${CHIP_BASE} border-[color:var(--green-line)] bg-[color:var(--green-bg)] text-[color:var(--green-fg)]`}
                  >
                    Checklist complete
                  </span>
                ) : (
                  row.missing.map(item => (
                    <span key={item.key} className={MISSING_CHIP}>
                      {item.label}
                    </span>
                  ))
                )}
              </div>

              {isLeadership ? (
                <div className="mt-3 flex flex-col gap-2 border-t border-[color:var(--border)] pt-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[color:var(--ink-2)]">
                      Quality review
                    </label>
                    <input
                      value={qualityNoteByListing[row.listingId] ?? ''}
                      onChange={e =>
                        setQualityNoteByListing(prev => ({ ...prev, [row.listingId]: e.target.value }))
                      }
                      placeholder="Note (optional — audio quality / genuine sync fit)"
                      className="mb-2 w-full max-w-md rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-1.5 text-[12px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleQualityDecision(row.listingId, true)}
                        disabled={isPending}
                        className="rounded-lg border border-[color:var(--green-line)] px-3 py-1.5 text-[12px] font-bold text-[color:var(--green-fg)] transition hover:opacity-80 disabled:opacity-50"
                      >
                        {isPending ? 'Working…' : 'Pass'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQualityDecision(row.listingId, false)}
                        disabled={isPending}
                        className="rounded-lg border border-[color:var(--rose-line)] px-3 py-1.5 text-[12px] font-bold text-[color:var(--rose-fg)] transition hover:opacity-80 disabled:opacity-50"
                      >
                        {isPending ? 'Working…' : 'Fail'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[color:var(--ink-2)]">
                      Guidance notes for the artist team
                    </label>
                    <textarea
                      value={staffNotesDraftByListing[row.listingId] ?? row.staffNotes ?? ''}
                      onChange={e =>
                        setStaffNotesDraftByListing(prev => ({ ...prev, [row.listingId]: e.target.value }))
                      }
                      rows={2}
                      placeholder="What the team should do to close the gap"
                      className="w-full max-w-md rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-1.5 text-[12px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveStaffNotes(row.listingId)}
                      disabled={isPending}
                      className="mt-2 rounded-lg bg-[color:var(--ink)] px-3 py-1.5 text-[12px] font-bold text-[color:var(--ground)] transition hover:opacity-90 disabled:opacity-50"
                    >
                      {isPending ? 'Saving…' : 'Save notes'}
                    </button>
                  </div>
                </div>
              ) : (
                row.staffNotes && (
                  <p className="mt-3 border-t border-[color:var(--border)] pt-3 text-[12px] text-[color:var(--ink-3)]">
                    <span className="font-semibold text-[color:var(--ink-2)]">Guidance:</span> {row.staffNotes}
                  </p>
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
