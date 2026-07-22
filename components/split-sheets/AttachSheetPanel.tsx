'use client'

// ─── Locker-side attach direction (design section 3, "New route so it
// can be linked from anywhere") ─────────────────────────────────────────
// Project first, then track: the artist picks the release, then picks the
// song from that project's tracks, with the leading fuzzy candidate
// surfaced as a suggestion — never a preselection — plus an explicit
// "covers the whole release" option for the genuine project-level
// exception. Shows current attachments with a detach control, and the
// section 7 edge cases: divergent signed-as titles, a track-removed hint,
// and a same-track conflict flag. Nothing here is destructive — detach
// only ever calls POST .../detach, never a delete of the sheet itself.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { suggestTrackMatches, describeSignedTitle, type TrackCandidate } from '@/lib/split-sheets/attachment'

const WHOLE_RELEASE = '__whole_release__'

export type ProjectOption = { id: string; title: string; tracks: TrackCandidate[] }

export type CurrentAttachment = {
  projectId: string
  projectTitle: string
  trackId: string | null
  trackTitle: string | null
  /** Best-effort: a high-confidence fuzzy match exists despite a null track_id — likely a deleted track, not an explicit whole-release choice. */
  possiblyTrackRemoved: boolean
  /** Another sheet also claims this same track (design section 7 — flagged, never blocked). */
  conflict: boolean
}

export function AttachSheetPanel({
  sheetId,
  songName,
  source,
  status,
  projects,
  currentAttachments,
}: {
  sheetId: string
  songName: string
  source: 'funun' | 'uploaded'
  status: string
  projects: ProjectOption[]
  currentAttachments: CurrentAttachment[]
}) {
  const router = useRouter()
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [trackChoice, setTrackChoice] = useState<string>(WHOLE_RELEASE)
  const [busy, setBusy] = useState(false)
  const [detachingKey, setDetachingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedProject = projects.find(p => p.id === projectId) ?? null
  const matches = useMemo(
    () => (selectedProject ? suggestTrackMatches(songName, selectedProject.tracks) : []),
    [selectedProject, songName]
  )

  async function attach() {
    if (!projectId) return
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

  async function detach(a: CurrentAttachment) {
    const key = `${a.projectId}:${a.trackId ?? ''}`
    setDetachingKey(key)
    setError(null)
    try {
      const res = await fetch(`/api/split-sheets/${sheetId}/detach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vault_project_id: a.projectId, track_id: a.trackId ?? undefined }),
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-hair bg-card2 px-3 py-1 font-semibold text-lav">
          {source === 'uploaded' ? 'Uploaded PDF' : 'Generated in Funūn'}
        </span>
        <span className="rounded-full border border-hair bg-card2 px-3 py-1 font-semibold text-lavdim">
          Status: {status.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Current attachments */}
      <div>
        <h2 className="mb-2 text-sm font-bold text-white">Currently attached to</h2>
        {currentAttachments.length === 0 ? (
          <p className="rounded-[14px] border border-hair bg-card p-4 text-[13px] text-lavdim">
            Not linked to a release yet — that&apos;s fine. This sheet is a valid legal record either way, and
            you can attach it whenever the release exists.
          </p>
        ) : (
          <ul className="space-y-2">
            {currentAttachments.map(a => {
              const key = `${a.projectId}:${a.trackId ?? ''}`
              const signed = a.trackTitle ? describeSignedTitle(songName, a.trackTitle) : null
              return (
                <li key={key} className="rounded-[14px] border border-hair bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-white">{a.projectTitle}</p>
                      <p className="mt-0.5 text-[12.5px] text-lavdim">
                        {a.trackTitle ? a.trackTitle : 'Whole release'}
                      </p>
                    </div>
                    <button
                      onClick={() => detach(a)}
                      disabled={detachingKey === key}
                      className="flex-none rounded-[10px] border border-hair px-3 py-1.5 text-[12.5px] font-semibold text-lav transition hover:border-hairstrong disabled:opacity-50"
                    >
                      {detachingKey === key ? 'Detaching…' : 'Detach'}
                    </button>
                  </div>
                  {signed && signed.diverges && (
                    <p className="mt-2 text-[12px] text-money2">
                      Signed as &ldquo;{signed.signedAs}&rdquo; · now &ldquo;{signed.currentTitle}&rdquo;
                    </p>
                  )}
                  {a.possiblyTrackRemoved && (
                    <p className="mt-2 text-[12px] text-lavdim">
                      Track reference cleared — the song this was attached to may have been deleted.
                    </p>
                  )}
                  {a.conflict && (
                    <p className="mt-2 text-[12px] text-rose-400">
                      Another split sheet is also attached to this song — resolve which one governs it.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Attach picker */}
      <div className="rounded-[14px] border border-brandindigo/30 bg-brandindigo/5 p-4">
        <h2 className="text-[13px] font-bold text-white">Attach to a release</h2>
        {projects.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-lavdim">Create a Vault project first to attach this sheet.</p>
        ) : (
          <>
            <div className="mt-3 space-y-2">
              <select
                value={projectId}
                onChange={e => {
                  setProjectId(e.target.value)
                  setTrackChoice(WHOLE_RELEASE)
                }}
                className="w-full rounded-[10px] border border-hair bg-card2 px-3 py-2 text-[13px] text-white"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>

              {selectedProject && selectedProject.tracks.length > 0 && (
                <select
                  value={trackChoice}
                  onChange={e => setTrackChoice(e.target.value)}
                  className="w-full rounded-[10px] border border-hair bg-card2 px-3 py-2 text-[13px] text-white"
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
              disabled={busy || !projectId}
              className="mt-3 rounded-[10px] bg-brandindigo px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {busy ? 'Attaching…' : 'Attach'}
            </button>
          </>
        )}
        {error && <p className="mt-2 text-[12px] text-rose-400">{error}</p>}
      </div>
    </div>
  )
}
