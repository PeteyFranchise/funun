'use client'

import { useState } from 'react'
import { isReadWithheld } from '@/lib/deals/buyer-song-unit-read-withholding'
import { syncContactHref } from '@/lib/sync-library/contact'
import Link from 'next/link'
import type { ShortlistEntry } from '@/lib/deals/shortlists'

// ─── ShortlistPanel (D-14c) ─────────────────────────────────────────────
// Read-mostly: every mutation is remove-from-shortlist (POST/save happens
// from CatalogBrowser). A stale entry (project has since gone private or
// fallen below readiness) degrades LOUDLY — a visible badge, request
// disabled — never a silent drop from the list.

function formatDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function ShortlistPanel({ initialEntries }: { initialEntries: ShortlistEntry[] }) {
  const [entries, setEntries] = useState<ShortlistEntry[]>(initialEntries)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function remove(entry: ShortlistEntry) {
    setRemovingId(entry.id)
    try {
      const res = await fetch(
        `/api/buyer/shortlists?vault_project_id=${encodeURIComponent(entry.vaultProjectId)}`,
        { method: 'DELETE' }
      )
      if (res.ok) {
        setEntries(prev => prev.filter(e => e.id !== entry.id))
      }
    } finally {
      setRemovingId(null)
    }
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-[color:var(--line)] bg-[var(--wash)] p-8 text-center">
        <p className="text-sm font-semibold text-[color:var(--ink-2)]">No saves yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-[color:var(--ink-3)]">
          Save a project from the catalog and it will show up here for your whole org to see.
        </p>
        <Link
          href="/sync/catalog"
          className="mt-4 inline-block text-xs font-medium text-[color:var(--indigo)] transition hover:text-[color:var(--fuchsia)]"
        >
          Browse catalog →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {entries.map(entry => (
        <div
          key={entry.id}
          className="rounded-xl border border-[color:var(--line)] bg-[var(--wash)] p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-[color:var(--ink)]">{entry.projectTitle}</p>
              {entry.savedBy && (
                <p className="mt-0.5 text-[11px] text-[color:var(--ink-3)]">
                  Saved by {entry.savedBy} on {formatDate(entry.savedAt)}
                </p>
              )}
            </div>
            {/* 2026-10-11 (owner decision D-11): the badge used to read "No
                longer rights-ready" and was driven by rights paperwork, which
                disabled the Request licence link for a song whose clearance was
                merely still in progress. Under D-11 outstanding clearance work
                never removes a track from The Crate and never blocks request
                intake, so this now reports AVAILABILITY — the track's listing
                was withdrawn/removed/rejected, its master is gone, or the
                project went private. A clearance-required entry stays
                requestable and says so below. */}
            {/* 50.5 Task 2 — the withheld branch comes FIRST. With
                availability fail-closed, the old branch would assert "No
                longer available" about every saved entry, which is a claim and
                a false one. */}
            {entry.availabilityWithheld && (
              <span className="rounded-full border border-[color:var(--line)] bg-[var(--wash-2)] px-2.5 py-0.5 text-[11px] font-semibold text-[color:var(--ink-3)]">
                Exact recording and clearance being confirmed
              </span>
            )}
            {!entry.availabilityWithheld && !entry.stillAvailable && (
              <span className="rounded-full border border-[color:var(--req-line)] bg-[var(--req-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[color:var(--req-fg)]">
                No longer available
              </span>
            )}
            {/* 50.5 Task 2 — WITHHELD. This badge read the first exposed
                sibling's clearance and showed it for the saved entry. With
                `clearance` now null, say the state is being confirmed rather
                than render nothing: a missing badge reads as "fine". */}
            {entry.stillAvailable && !isReadWithheld('shortlist_availability') && entry.clearance === 'clearance_required' && (
              <span className="rounded-full border border-[color:var(--line)] bg-[var(--wash-2)] px-2.5 py-0.5 text-[11px] font-semibold text-[color:var(--ink-3)]">
                Contact Funūn to clear
              </span>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2">
            {/* 50.5 Task 2 — WITHHELD. This link carried ONLY a project id into
                the request composer, which then offered every song on it. That
                is the alternate multi-song path. Route to a person instead. */}
            {entry.availabilityWithheld ? (
              <a
                href={syncContactHref(`Licensing enquiry: ${entry.projectTitle ?? 'saved song'}`)}
                className="rounded-lg border border-[color:var(--line)] bg-[var(--wash-2)] px-2.5 py-1.5 text-[11px] font-semibold text-[color:var(--indigo)] transition hover:bg-[var(--wash)]"
              >
                Email us about this
              </a>
            ) : entry.stillAvailable ? (
              <Link
                href={`/sync/requests/new?project=${entry.vaultProjectId}`}
                className="rounded-lg border border-[color:var(--line)] bg-[var(--wash-2)] px-2.5 py-1.5 text-[11px] font-semibold text-[color:var(--indigo)] transition hover:bg-[var(--wash)]"
              >
                Request license
              </Link>
            ) : (
              <span className="rounded-lg border border-[color:var(--line)] px-2.5 py-1.5 text-[11px] font-semibold text-[color:var(--ink-3)]">
                Request unavailable
              </span>
            )}
            <button
              type="button"
              onClick={() => remove(entry)}
              disabled={removingId === entry.id}
              className="rounded-lg border border-[color:var(--line-2)] px-2.5 py-1.5 text-[11px] font-medium text-[color:var(--ink-3)] transition hover:border-[color:var(--indigo)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {removingId === entry.id ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
