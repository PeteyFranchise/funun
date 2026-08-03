'use client'

import { useState } from 'react'
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
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <p className="text-sm font-semibold text-white/70">No saves yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-white/50">
          Save a project from the catalog and it will show up here for your whole org to see.
        </p>
        <Link
          href="/buyers/catalog"
          className="mt-4 inline-block text-xs font-medium text-indigo-300 transition hover:text-indigo-200"
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
          className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-white">{entry.projectTitle}</p>
              {entry.savedBy && (
                <p className="mt-0.5 text-[11px] text-white/40">
                  Saved by {entry.savedBy} on {formatDate(entry.savedAt)}
                </p>
              )}
            </div>
            {!entry.stillRightsReady && (
              <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                No longer rights-ready
              </span>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2">
            {entry.stillRightsReady ? (
              <Link
                href={`/buyers/requests/new?project=${entry.vaultProjectId}`}
                className="rounded-lg border border-indigo-400/30 bg-indigo-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-200 transition hover:bg-indigo-400/20"
              >
                Request license
              </Link>
            ) : (
              <span className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white/30">
                Request unavailable
              </span>
            )}
            <button
              type="button"
              onClick={() => remove(entry)}
              disabled={removingId === entry.id}
              className="rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-medium text-white/50 transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {removingId === entry.id ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
