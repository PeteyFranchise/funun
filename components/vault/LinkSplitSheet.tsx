'use client'

// ─── Vault-side attach direction (design section 3) ────────────────────
// "The artist is usually in the Vault when they realize the sheet is
// missing, not browsing the Locker" — this is the direction that matters
// more than it looks. Offers the caller's unattached sheets with the
// fuzzy suggestion computed against THIS project's track titles, and lets
// the artist attach without leaving the page. Also surfaces every split
// sheet already covering this release (via split_sheet_attachments, not
// just vault_documents — design section 5) with the same section 7 edge
// cases the Locker-side panel shows: divergent signed-as titles, a
// track-removed hint, and a same-track conflict flag.
//
// Deliberately kept type-agnostic where it costs nothing: no split-sheet
// vocabulary is baked into the attach/detach wiring itself (it's a plain
// "document id + project id [+ track id]" relationship), since the
// roadmap's contract-library work will want the same shape for other
// document types. No abstraction is built for a type that doesn't exist
// yet — this component simply doesn't hardcode assumptions it doesn't
// need to.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { suggestTrackMatches, describeSignedTitle, type TrackCandidate } from '@/lib/split-sheets/attachment'

const WHOLE_RELEASE = '__whole_release__'

export type AvailableSheet = {
  id: string
  songName: string
  status: string
  source: 'funun' | 'uploaded'
}

export type AttachedSheetRow = {
  sheetId: string
  songName: string
  status: string
  source: 'funun' | 'uploaded'
  trackId: string | null
  trackTitle: string | null
  possiblyTrackRemoved: boolean
  conflict: boolean
}

export function LinkSplitSheet({
  projectId,
  tracks,
  availableSheets,
  attachedSheets,
}: {
  projectId: string
  tracks: TrackCandidate[]
  availableSheets: AvailableSheet[]
  attachedSheets: AttachedSheetRow[]
}) {
  const router = useRouter()
  const [sheetId, setSheetId] = useState(availableSheets[0]?.id ?? '')
  const [trackChoice, setTrackChoice] = useState<string>(WHOLE_RELEASE)
  const [busy, setBusy] = useState(false)
  const [detachingKey, setDetachingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedSheet = availableSheets.find(s => s.id === sheetId) ?? null
  const matches = useMemo(
    () => (selectedSheet ? suggestTrackMatches(selectedSheet.songName, tracks) : []),
    [selectedSheet, tracks]
  )

  async function attach() {
    if (!sheetId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/split-sheets/${sheetId}/attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vault_project_id: projectId,
          track_id: trackChoice === WHOLE_RELEASE ? undefined : trackChoice,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Could not attach this sheet.')
        return
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function detach(row: AttachedSheetRow) {
    const key = `${row.sheetId}:${row.trackId ?? ''}`
    setDetachingKey(key)
    setError(null)
    try {
      const res = await fetch(`/api/split-sheets/${row.sheetId}/detach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vault_project_id: projectId, track_id: row.trackId ?? undefined }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Could not detach this sheet.')
        return
      }
      router.refresh()
    } finally {
      setDetachingKey(null)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">Split sheets covering this release</h2>

      {attachedSheets.length === 0 ? (
        <p className="text-xs text-white/40">
          No split sheet is attached yet. That&apos;s fine — attach one below whenever it exists.
        </p>
      ) : (
        <ul className="space-y-2">
          {attachedSheets.map(row => {
            const key = `${row.sheetId}:${row.trackId ?? ''}`
            const signed = row.trackTitle ? describeSignedTitle(row.songName, row.trackTitle) : null
            return (
              <li key={key} className="rounded-lg border border-white/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{row.songName}</p>
                    <p className="mt-0.5 text-xs text-white/40">
                      {row.trackTitle ? row.trackTitle : 'Whole release'} ·{' '}
                      {row.source === 'uploaded' ? 'uploaded' : 'generated'} · {row.status.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <button
                    onClick={() => detach(row)}
                    disabled={detachingKey === key}
                    className="flex-none rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-40"
                  >
                    {detachingKey === key ? 'Detaching…' : 'Detach'}
                  </button>
                </div>
                {signed && signed.diverges && (
                  <p className="mt-2 text-xs text-amber-300/90">
                    Signed as &ldquo;{signed.signedAs}&rdquo; · now &ldquo;{signed.currentTitle}&rdquo;
                  </p>
                )}
                {row.possiblyTrackRemoved && (
                  <p className="mt-2 text-xs text-white/40">
                    Track reference cleared — the song this was attached to may have been deleted.
                  </p>
                )}
                {row.conflict && (
                  <p className="mt-2 text-xs text-rose-300">
                    Another split sheet is also attached to this song — resolve which one governs it.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="border-t border-white/10 pt-4">
        <h3 className="text-sm font-medium text-white">Link an existing split sheet</h3>
        {availableSheets.length === 0 ? (
          <p className="mt-1 text-xs text-white/40">Every split sheet you own is already attached here.</p>
        ) : (
          <>
            <div className="mt-2 space-y-2">
              <select
                value={sheetId}
                onChange={e => {
                  setSheetId(e.target.value)
                  setTrackChoice(WHOLE_RELEASE)
                }}
                className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white"
              >
                {availableSheets.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.songName} ({s.source === 'uploaded' ? 'uploaded' : 'generated'})
                  </option>
                ))}
              </select>

              {tracks.length > 0 && (
                <select
                  value={trackChoice}
                  onChange={e => setTrackChoice(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white"
                >
                  <option value={WHOLE_RELEASE}>This covers the whole release</option>
                  {matches.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                      {m.suggested ? ' — suggested match' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <button
              onClick={attach}
              disabled={busy || !sheetId}
              className="mt-3 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {busy ? 'Attaching…' : 'Attach'}
            </button>
          </>
        )}
        {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
      </div>
    </section>
  )
}
