'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AddTrackForm } from '@/components/vault/AddTrackForm'

export type PlayerTrack = {
  id: string
  track_number?: number
  title?: string
  isrc: string | null
  duration_seconds?: number | null
  explicit?: boolean
  audioUrl: string | null // short-lived signed URL, or null if no audio yet
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

export function TrackList({
  projectId,
  tracks,
  canManage,
}: {
  projectId: string
  tracks: PlayerTrack[]
  canManage: boolean
}) {
  const router = useRouter()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [liveDuration, setLiveDuration] = useState(0)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  async function upload(trackId: string, file: File) {
    setUploadingId(trackId)
    setError(null)
    try {
      const duration = await readDuration(file)
      const fd = new FormData()
      fd.append('file', file)
      if (duration != null) fd.append('duration', String(duration))
      const res = await fetch(`/api/vault/${projectId}/tracks/${trackId}/audio`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? 'Upload failed')
        return
      }
      router.refresh()
    } finally {
      setUploadingId(null)
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

      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}

      <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
        {tracks.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-white/40">No tracks yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {tracks.map((t, i) => {
              const isCurrent = currentId === t.id
              const hasAudio = Boolean(t.audioUrl)
              const isUploading = uploadingId === t.id
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
                    <p className="truncate text-xs text-white/40">
                      {t.isrc ? t.isrc : hasAudio ? 'Audio uploaded' : 'No audio yet'}
                    </p>
                  </div>

                  {/* Right side: duration or upload */}
                  <div className="flex shrink-0 items-center gap-3">
                    {hasAudio && (
                      <span className="text-xs tabular-nums text-white/40">
                        {fmt(t.duration_seconds)}
                      </span>
                    )}
                    {canManage && (
                      <label
                        className={`cursor-pointer rounded-md border border-white/10 px-2 py-1 text-xs transition hover:border-white/30 ${
                          isUploading ? 'text-white/40' : 'text-white/60 hover:text-white'
                        }`}
                      >
                        {isUploading ? 'Uploading…' : hasAudio ? 'Replace' : 'Upload audio'}
                        <input
                          type="file"
                          accept="audio/*"
                          className="hidden"
                          disabled={isUploading}
                          onChange={e => {
                            const f = e.target.files?.[0]
                            if (f) void upload(t.id, f)
                            e.target.value = ''
                          }}
                        />
                      </label>
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
