'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── FeaturedPicker ───────────────────────────────────────────────────
// Owner-only picker for artist_profiles.featured_project_id (PROFILE-05).
// The list is pre-filtered client-side to isPublic releases only —
// private drafts must never appear here (RESEARCH.md Pitfall 4). The API
// pre-check (Plan 01b's sanitize()) and migration 034's DB trigger are
// the authoritative backstops if a crafted request bypasses this UI.

export type FeaturedPickerRelease = {
  id: string
  title: string
  typeLabel: string
  year: string | null
  coverUrl: string | null
  isPublic: boolean
}

export function FeaturedPicker({
  releases,
  currentFeaturedId,
}: {
  releases: FeaturedPickerRelease[]
  currentFeaturedId: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Never show private drafts in the picker — public releases only.
  const publicReleases = releases.filter(r => r.isPublic)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  async function pin(id: string | null) {
    setBusy(true)
    setError(null)
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featured_project_id: id }),
    })
    setBusy(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Only public releases can be featured — publish it first.')
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-[9px] rounded-[11px] border border-hairstrong bg-card px-[22px] py-[13px] text-[15px] font-bold text-white"
      >
        {currentFeaturedId ? 'Change featured release' : 'Pin a release'}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 min-w-[280px] max-w-[340px] rounded-xl border border-hairstrong bg-card shadow-xl">
          {publicReleases.length === 0 ? (
            <p className="p-4 text-[13px] text-lavdim">
              Publish a release to pin it here as your Featured spotlight.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {publicReleases.map(r => (
                <li key={r.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => pin(r.id === currentFeaturedId ? null : r.id)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-card2 disabled:opacity-50"
                  >
                    <span
                      className="h-10 w-10 flex-none rounded-[8px] bg-gradient-to-br from-brandindigo/40 to-brandfuchsia/30 bg-cover bg-center"
                      style={r.coverUrl ? { backgroundImage: `url('${r.coverUrl}')` } : undefined}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-white">
                        {r.title}
                        {r.id === currentFeaturedId && (
                          <span className="ml-2 text-[11px] font-bold uppercase tracking-[.1em] text-brandindigo">
                            Featured
                          </span>
                        )}
                      </span>
                      <span className="block text-[12px] text-lavdim">
                        {r.typeLabel}
                        {r.year ? ` · ${r.year}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p className="border-t border-hair px-4 py-2 text-[12px] text-amber-300">{error}</p>
          )}
        </div>
      )}
    </div>
  )
}
