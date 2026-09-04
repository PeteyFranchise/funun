'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AddTrackForm } from '@/components/vault/AddTrackForm'
import type { SyncListingStatus } from '@/types'
import { createClient } from '@/lib/supabase/client'

export type PlayerTrack = {
  id: string
  track_number?: number
  title?: string
  isrc: string | null
  duration_seconds?: number | null
  explicit?: boolean
  audioUrl: string | null // signed URL for the share/MP3 — drives playback
  masterUrl?: string | null // signed URL for the master WAV (download only)
  masterExt?: string | null
}

function fmt(seconds?: number | null): string {
  if (seconds == null || !isFinite(seconds) || seconds <= 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Read an audio file's duration in the browser before upload.
function readDuration(file: File): Promise<number | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const a = document.createElement('audio')
    a.preload = 'metadata'
    a.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(isFinite(a.duration) ? a.duration : null)
    }
    a.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    a.src = url
  })
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  )
}

// One audio slot (Master WAV or MP3) — upload / replace.
function AudioSlot({
  label,
  present,
  uploading,
  accept,
  onPick,
}: {
  label: string
  present: boolean
  uploading: boolean
  accept: string
  onPick: (file: File) => void
}) {
  return (
    <label
      title={present ? `Replace ${label}` : `Upload ${label}`}
      className={`cursor-pointer rounded-md border px-2 py-1 text-xs transition ${
        present
          ? 'border-emerald-500/40 text-emerald-300 hover:border-emerald-400'
          : 'border-white/10 text-white/60 hover:border-white/30 hover:text-white'
      } ${uploading ? 'opacity-50' : ''}`}
    >
      {uploading ? '…' : present ? `${label} ✓` : `+ ${label}`}
      <input
        type="file"
        accept={accept}
        className="hidden"
        disabled={uploading}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) onPick(f)
          e.target.value = ''
        }}
      />
    </label>
  )
}

// One track's sync-library listing, as fetched by the playback-room page —
// the minimal shape TrackList needs to render the row's chip (26-07-PLAN).
export type TrackSyncStatus = {
  id: string
  status: SyncListingStatus
  rejection_reason: string | null
}

// Static (non-interactive) chip states — dot + pill border, never solid
// fill, mirroring DocumentCard.tsx's STATUS_META / VaultProjectCard.tsx's
// CHIP idiom exactly (26-UI-SPEC.md Status Chip Semantics). applied /
// invited / agreement_pending are handled separately below as the
// INTERACTIVE gradient "Sign agreement" / "Continue signing" chip — the
// DB-authoritative state machine (26-CONTEXT.md decision #2) supersedes
// UI-SPEC's superseded applied->under_review progression.
const SYNC_CHIP_STATIC: Partial<
  Record<SyncListingStatus, { label: string; badge: string; dot: string }>
> = {
  pending_admit: {
    label: 'In review',
    badge: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    dot: 'bg-amber-400',
  },
  admitted: {
    label: 'Live in Sync Library',
    badge: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    dot: 'bg-emerald-400',
  },
  rejected: {
    label: 'Not accepted',
    badge: 'border-rose-400/20 bg-rose-400/5 text-rose-300/80',
    dot: 'bg-rose-400/70',
  },
  withdrawn: {
    label: 'Withdrawn',
    badge: 'border-white/10 bg-white/5 text-lavdim',
    dot: 'bg-white/30',
  },
  removed: {
    label: 'Removed',
    badge: 'border-white/10 bg-white/5 text-lavdim',
    dot: 'bg-white/30',
  },
}

// The "+ Sync Library" row action + status chip, owner-scoped (rendered
// only when canManage — see TrackList below). Mirrors AudioSlot's ghost-
// pill idiom for the empty state (26-UI-SPEC.md Screen C).
function SyncLibraryCell({
  listing,
  hasSignedBlanketAgreement,
  submitting,
  onSubmit,
}: {
  listing?: TrackSyncStatus
  hasSignedBlanketAgreement: boolean
  submitting: boolean
  onSubmit: () => void
}) {
  if (!listing) {
    return (
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        title="Submit this song to the Sync Library"
        className={`rounded-md border px-2 py-1 text-xs font-semibold transition ${
          'border-white/10 text-white/60 hover:border-white/30 hover:text-white'
        } ${submitting ? 'opacity-50' : ''}`}
      >
        {submitting ? '…' : '+ Sync Library'}
      </button>
    )
  }

  // Pre-signed, sign-needed states — gradient interactive chip, mirrors
  // Phase 17's e-sign CTA treatment for the same class of action (26-UI-
  // SPEC.md Accent exception).
  if (listing.status === 'applied' || listing.status === 'invited' || listing.status === 'agreement_pending') {
    return (
      <Link
        href="/sync-library/agreement"
        className="rounded-md bg-grad px-2 py-1 text-xs font-semibold text-white shadow-cta transition hover:opacity-90"
      >
        {listing.status === 'agreement_pending' ? 'Continue signing' : 'Sign agreement'}
      </Link>
    )
  }

  const meta = SYNC_CHIP_STATIC[listing.status]
  if (!meta) return null

  const chip = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )

  return (
    <div className="flex flex-col items-end gap-0.5">
      {listing.status === 'admitted' ? (
        <Link href="/sync-library" title="View in the Sync Library">
          {chip}
        </Link>
      ) : (
        chip
      )}
      {/* Decision #4 — a song landing in pending_admit while the artist
          already has a signed blanket agreement skips the sign step;
          this indicator tells them why. */}
      {listing.status === 'pending_admit' && hasSignedBlanketAgreement && (
        <span className="text-[10px] text-white/40">Covered by your Sync Library agreement</span>
      )}
      {/* UI-phase decision #1 — optional staff rejection reason, shown to the artist. */}
      {listing.status === 'rejected' && listing.rejection_reason && (
        <span
          className="max-w-[160px] truncate text-[10px] text-rose-300/60"
          title={listing.rejection_reason}
        >
          {listing.rejection_reason}
        </span>
      )}
    </div>
  )
}

export function TrackList({
  projectId,
  tracks,
  canManage,
  syncStatusByTrack,
  hasSignedBlanketAgreement,
}: {
  projectId: string
  tracks: PlayerTrack[]
  canManage: boolean
  /** Owner's own sync-library listing per track, keyed by track id (26-07-PLAN). */
  syncStatusByTrack?: Record<string, TrackSyncStatus>
  /** Whether the artist already has a signed blanket agreement on file. */
  hasSignedBlanketAgreement?: boolean
}) {
  const router = useRouter()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [liveDuration, setLiveDuration] = useState(0)
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncSubmittingId, setSyncSubmittingId] = useState<string | null>(null)

  const current = tracks.find(t => t.id === currentId) ?? null
  const totalSeconds = tracks.reduce((s, t) => s + (t.duration_seconds ?? 0), 0)

  function toggle(track: PlayerTrack) {
    const el = audioRef.current
    if (!el || !track.audioUrl) return
    if (currentId === track.id) {
      if (playing) {
        el.pause()
      } else {
        void el.play()
      }
      return
    }
    setCurrentId(track.id)
    setTime(0)
    setLiveDuration(0)
    el.src = track.audioUrl
    void el.play()
  }

  function seek(value: number) {
    const el = audioRef.current
    if (!el) return
    el.currentTime = value
    setTime(value)
  }

  async function upload(trackId: string, file: File, role: 'master' | 'share') {
    setUploadingKey(`${trackId}:${role}`)
    setError(null)
    try {
      const duration = role === 'share' ? await readDuration(file) : null
      const intentResponse = await fetch(
        `/api/vault/${projectId}/tracks/${trackId}/audio/upload-intent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type, size: file.size, role }),
        }
      )
      const intentBody = (await intentResponse.json().catch(() => ({}))) as {
        data?: { path: string; token: string; contentType: string }
        error?: string
      }
      if (!intentResponse.ok || !intentBody.data) {
        setError(intentBody.error ?? 'Could not prepare upload')
        return
      }

      const intent = intentBody.data
      const { error: uploadError } = await createClient().storage
        .from('track-audio')
        .uploadToSignedUrl(intent.path, intent.token, file, {
          contentType: intent.contentType,
          upsert: false,
        })
      if (uploadError) {
        setError(uploadError.message)
        return
      }

      const res = await fetch(`/api/vault/${projectId}/tracks/${trackId}/audio/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: intent.path, role, duration }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? 'Upload failed')
        return
      }
      router.refresh()
    } catch {
      setError('Upload failed — please try again')
    } finally {
      setUploadingKey(null)
    }
  }

  // "+ Sync Library" row action (26-07-PLAN) — self-apply, ungated,
  // per-track. Server re-checks ownership independently (T-26-26); this
  // is a UI convenience, not the security boundary.
  async function submitToSyncLibrary(trackId: string) {
    setSyncSubmittingId(trackId)
    setError(null)
    try {
      const res = await fetch('/api/sync-library/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, trackIds: [trackId] }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError((json as { error?: string }).error ?? 'Something went wrong — please try again.')
        return
      }
      router.refresh()
    } finally {
      setSyncSubmittingId(null)
    }
  }

  const curDuration = current?.duration_seconds || liveDuration

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-white">Tracks</h2>
        <span className="text-sm text-white/40">
          {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
          {totalSeconds > 0 ? ` · ${fmt(totalSeconds)}` : ''}
        </span>
      </div>

      {canManage && (
        <p className="mt-1 text-xs text-white/40">
          Upload the <span className="text-white/70">master WAV</span> for distribution and an{' '}
          <span className="text-white/70">MP3</span> for playback &amp; sharing to industry.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}

      <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
        {tracks.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-white/40">No tracks yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {tracks.map((t, i) => {
              const isCurrent = currentId === t.id
              const hasAudio = Boolean(t.audioUrl)
              const hasMaster = Boolean(t.masterUrl)
              const summary =
                hasAudio && hasMaster
                  ? 'WAV master + MP3'
                  : hasMaster
                    ? 'WAV master'
                    : hasAudio
                      ? 'MP3 uploaded'
                      : 'No audio yet'
              return (
                <li
                  key={t.id}
                  className={`group flex items-center gap-3 px-3 py-2.5 transition ${
                    isCurrent ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  {/* Index / play control */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                    {hasAudio ? (
                      <button
                        onClick={() => toggle(t)}
                        aria-label={isCurrent && playing ? 'Pause' : 'Play'}
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-white transition ${
                          isCurrent
                            ? 'bg-emerald-500 hover:bg-emerald-400'
                            : 'bg-white/0 text-white/50 group-hover:bg-white group-hover:text-black'
                        }`}
                      >
                        {isCurrent && playing ? <PauseIcon /> : <PlayIcon />}
                      </button>
                    ) : (
                      <span className="text-sm text-white/30">{t.track_number ?? i + 1}</span>
                    )}
                  </div>

                  {/* Title + meta */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`truncate text-sm font-medium ${
                          isCurrent ? 'text-emerald-300' : 'text-white'
                        }`}
                      >
                        {t.title ?? 'Untitled track'}
                      </span>
                      {t.explicit && (
                        <span className="rounded bg-white/15 px-1 text-[10px] font-semibold text-white/70">
                          E
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-white/40">{t.isrc ? t.isrc : summary}</p>
                  </div>

                  {/* Right side: duration, master download, upload slots */}
                  <div className="flex shrink-0 items-center gap-2">
                    {hasAudio && (
                      <span className="text-xs tabular-nums text-white/40">
                        {fmt(t.duration_seconds)}
                      </span>
                    )}
                    {t.masterUrl && (
                      <a
                        href={t.masterUrl}
                        download={`${(t.title ?? 'master').replace(/[^\w.-]+/g, '_')}.${t.masterExt ?? 'wav'}`}
                        title="Download master WAV"
                        className="text-white/40 transition hover:text-white"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
                        </svg>
                      </a>
                    )}
                    {canManage && (
                      <div className="flex items-center gap-1.5">
                        <AudioSlot
                          label="WAV"
                          present={hasMaster}
                          uploading={uploadingKey === `${t.id}:master`}
                          accept=".wav,audio/wav,audio/x-wav"
                          onPick={f => void upload(t.id, f, 'master')}
                        />
                        <AudioSlot
                          label="MP3"
                          present={hasAudio}
                          uploading={uploadingKey === `${t.id}:share`}
                          accept="audio/*"
                          onPick={f => void upload(t.id, f, 'share')}
                        />
                      </div>
                    )}
                    {/* Sync Library row action (26-07-PLAN) — owner-only, matching
                        this file's existing canManage ownership convention; a
                        collaborator viewing someone else's project never sees this. */}
                    {canManage && (
                      <SyncLibraryCell
                        listing={syncStatusByTrack?.[t.id]}
                        hasSignedBlanketAgreement={Boolean(hasSignedBlanketAgreement)}
                        submitting={syncSubmittingId === t.id}
                        onSubmit={() => void submitToSyncLibrary(t.id)}
                      />
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {canManage && <AddTrackForm projectId={projectId} />}

      {/* Now-playing bar */}
      {current && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.05] p-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => toggle(current)}
              aria-label={playing ? 'Pause' : 'Play'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-400"
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {current.title ?? 'Untitled track'}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="w-9 text-right text-[11px] tabular-nums text-white/40">
                  {fmt(time)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={curDuration || 0}
                  step={0.1}
                  value={time}
                  onChange={e => seek(Number(e.target.value))}
                  className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-emerald-400"
                />
                <span className="w-9 text-[11px] tabular-nums text-white/40">
                  {fmt(curDuration)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <audio
        ref={audioRef}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={e => setLiveDuration(e.currentTarget.duration)}
        className="hidden"
      />
    </section>
  )
}
