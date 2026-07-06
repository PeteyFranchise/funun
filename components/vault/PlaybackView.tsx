'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { readinessLabel } from '@/lib/vault/readiness'
import { StemsUpload } from '@/components/vault/StemsUpload'

export type TrackView = {
  id: string
  number: number
  title: string
  durationSeconds: number | null
  isrc: string | null
  iswc: string | null
  bpm: number | null
  language: string | null
  audioUrl: string | null          // signed URL for the share/master playback
  instrumentalUrl: string | null   // signed URL for the instrumental (null when absent)
  hasStems: boolean                // whether a stems ZIP exists
  stemsUrl: string | null          // signed download URL for stems ZIP (null when absent)
  credits: { name: string; role: string; split: number }[]
  splitTotal: number
}

function fmt(s: number | null): string {
  if (!s && s !== 0) return '—'
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

// Deterministic bar heights so the waveform is stable per track.
function bars(seed: string, n = 56): number[] {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    h = (h * 1103515245 + 12345) >>> 0
    out.push(0.25 + ((h >>> 8) % 100) / 100 * 0.75)
  }
  return out
}

export function PlaybackView({
  releaseTitle,
  artist,
  coverUrl,
  tracks,
  projectId,
  userId,
  canManage,
  readinessScore,
  exportSlot,
  miniLeft = '252px',
}: {
  releaseTitle: string
  artist: string | null
  coverUrl: string | null
  tracks: TrackView[]
  projectId: string
  userId: string
  canManage: boolean
  readinessScore: number
  /** Reserved slot for Plan 06 Export Pack panel — pass an Export Pack button/trigger here. */
  exportSlot?: React.ReactNode
  /** Left offset of the fixed mini-player — '252px' inside the app shell, '0' on no-shell pages. */
  miniLeft?: string
}) {
  const [currentId, setCurrentId] = useState(tracks[0]?.id ?? '')
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [source, setSource] = useState<'master' | 'instrumental'>('master')
  const audioRef = useRef<HTMLAudioElement>(null)

  const current = useMemo(() => tracks.find(t => t.id === currentId) ?? tracks[0], [tracks, currentId])
  const wave = useMemo(() => bars(currentId || 'x'), [currentId])
  const duration = current?.durationSeconds ?? 0
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0

  // Reset to master when switching tracks or when instrumental is no longer available.
  useEffect(() => {
    setSource('master')
    setPosition(0)
  }, [currentId])

  const activeAudioUrl = source === 'instrumental' && current?.instrumentalUrl
    ? current.instrumentalUrl
    : current?.audioUrl ?? null

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    if (playing) el.play().catch(() => setPlaying(false))
    else el.pause()
  }, [playing, currentId, source])

  function selectTrack(id: string) {
    setCurrentId(id)
    setPosition(0)
    setPlaying(true)
  }

  function seekToFraction(f: number) {
    const el = audioRef.current
    const d = duration || el?.duration || 0
    const t = f * d
    setPosition(t)
    if (el) el.currentTime = t
  }

  const { label: readinessLabelText } = readinessLabel(readinessScore)

  if (!current) return <p className="px-9 py-8 text-lavdim">No tracks in this release yet.</p>

  return (
    <div className="flex-1 px-9 py-[30px] pb-[110px]">
      <div className="grid gap-7 lg:grid-cols-[300px_1fr_320px]">
        {/* Left — tracklist + files */}
        <div className="rounded-card border border-hair bg-card p-5">
          <div className="mb-4 text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">Tracks</div>
          <ul className="space-y-1">
            {tracks.map(t => {
              const active = t.id === current.id
              return (
                <li key={t.id}>
                  <button
                    onClick={() => selectTrack(t.id)}
                    className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-[10px] text-left transition ${active ? 'bg-card2' : 'hover:bg-white/5'}`}
                  >
                    <span className="tnum w-5 flex-none text-[13px] text-lavdim">{t.number}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[14px] font-semibold ${active ? 'gtext' : 'text-white'}`}>
                        {t.title}
                      </span>
                    </span>
                    <span className="tnum flex-none text-[12.5px] text-lavdim">{fmt(t.durationSeconds)}</span>
                  </button>
                </li>
              )
            })}
          </ul>

          {/* Files section */}
          <div className="mt-5 border-t border-hair pt-4">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">Files</div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-lav">Master</span>
              <span className={current.audioUrl ? 'text-emerald-400' : 'text-lavdim'}>
                {current.audioUrl ? 'Uploaded' : 'Missing'}
              </span>
            </div>

            {/* Instrumental + Stems rows (managed by StemsUpload) */}
            <StemsUpload
              projectId={projectId}
              trackId={current.id}
              userId={userId}
              hasStemsFile={current.hasStems}
              hasInstrumental={Boolean(current.instrumentalUrl)}
              canManage={canManage}
            />
          </div>

          {/* Inline readiness widget (D-02, placement 2) */}
          <div className="mt-4 border-t border-hair pt-4">
            <Link
              href={`/vault/${projectId}`}
              className="block text-[13px] font-semibold text-lavdim transition hover:text-white"
            >
              Readiness {readinessScore}/100 · {readinessLabelText} →
            </Link>
          </div>
        </div>

        {/* Center — now playing */}
        <div className="flex flex-col items-center">
          <div
            className="aspect-square w-full max-w-[420px] rounded-[22px] bg-gradient-to-br from-brandindigo/40 to-brandfuchsia/30 bg-cover bg-center shadow-[0_20px_60px_-20px_rgba(0,0,0,.7)]"
            style={coverUrl ? { backgroundImage: `url('${coverUrl}')` } : undefined}
          />
          <div className="mt-6 text-center">
            <div className="text-[26px] font-extrabold tracking-[-.01em] text-white">{current.title}</div>
            <div className="mt-1 text-[15px] font-medium text-lavdim">
              {artist ? `${artist} · ` : ''}
              {releaseTitle}
            </div>
          </div>

          {/* Master / Instrumental toggle — only shown when instrumental exists (D-08) */}
          {current.instrumentalUrl && (
            <div className="mt-5 inline-flex rounded-[10px] border border-hairstrong bg-card2 p-1 text-[13px] font-bold">
              {(['master', 'instrumental'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={`rounded-[7px] px-4 py-[7px] capitalize ${source === s ? 'bg-grad text-white' : 'text-lavdim'}`}
                >
                  {s === 'master' ? 'Master' : 'Instrumental'}
                </button>
              ))}
            </div>
          )}

          {/* Download stems button — separate from transport (D-04); only shown when stems exist (D-08) */}
          {current.stemsUrl && (
            <div className="mt-3">
              <a
                href={current.stemsUrl}
                download
                className="inline-flex items-center gap-2 rounded-[9px] border border-hairstrong bg-card2 px-4 py-2 text-[13px] font-bold text-white transition hover:opacity-90"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
                </svg>
                Download stems
              </a>
            </div>
          )}

          {/* Waveform */}
          <div className="mt-6 flex h-[72px] w-full max-w-[520px] items-center gap-[3px]">
            {wave.map((h, i) => {
              const filled = (i / wave.length) * 100 <= pct
              return (
                <button
                  key={i}
                  onClick={() => seekToFraction(i / wave.length)}
                  className="flex-1"
                  style={{ height: `${h * 100}%` }}
                  aria-label="seek"
                >
                  <span
                    className="block h-full w-full rounded-[2px]"
                    style={{
                      background: filled
                        ? 'linear-gradient(180deg,#818CF8,#D946EF)'
                        : 'rgba(199,203,247,.18)',
                    }}
                  />
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex w-full max-w-[520px] justify-between text-[12.5px] font-semibold text-lavdim tnum">
            <span>{fmt(position)}</span>
            <span>{fmt(duration || current.durationSeconds)}</span>
          </div>

          {/* Transport */}
          <div className="mt-5 flex items-center gap-7 text-lav">
            <button aria-label="shuffle" className="opacity-70 hover:opacity-100">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>
            </button>
            <button
              aria-label="previous"
              onClick={() => {
                const i = tracks.findIndex(t => t.id === current.id)
                if (i > 0) selectTrack(tracks[i - 1].id)
              }}
              className="hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M6 5v14h2V5zm3 7 9 7V5z" /></svg>
            </button>
            <button
              aria-label={playing ? 'pause' : 'play'}
              onClick={() => setPlaying(p => !p)}
              disabled={!activeAudioUrl}
              className="flex h-[78px] w-[78px] items-center justify-center rounded-full bg-grad text-white shadow-cta disabled:opacity-40"
            >
              {playing ? (
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor"><path d="M7 5h4v14H7zm6 0h4v14h-4z" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-8 w-8 translate-x-[2px]" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>
              )}
            </button>
            <button
              aria-label="next"
              onClick={() => {
                const i = tracks.findIndex(t => t.id === current.id)
                if (i < tracks.length - 1) selectTrack(tracks[i + 1].id)
              }}
              className="hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M16 5v14h2V5zM6 5v14l9-7z" /></svg>
            </button>
            <button aria-label="repeat" className="opacity-70 hover:opacity-100">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" /></svg>
            </button>
          </div>
          {!activeAudioUrl && (
            <p className="mt-3 text-[12.5px] text-lavdim">No master uploaded for this track yet.</p>
          )}

          {/* Export Pack slot — reserved for Plan 06 */}
          {exportSlot && <div className="mt-5">{exportSlot}</div>}
        </div>

        {/* Right — credits & metadata */}
        <div className="space-y-6">
          <div className="rounded-card border border-hair bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">Credits &amp; splits</div>
              {current.credits.length > 0 && (
                <span
                  className={`rounded-full border px-[10px] py-[3px] text-[11.5px] font-bold ${current.splitTotal === 100 ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400' : 'border-money/30 bg-money/10 text-money2'}`}
                >
                  {current.splitTotal === 100 ? '100% resolved' : `${current.splitTotal}%`}
                </span>
              )}
            </div>
            {current.credits.length === 0 ? (
              <p className="text-[13px] text-lavdim">No credits captured yet.</p>
            ) : (
              <ul className="space-y-3">
                {current.credits.map((c, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-grad text-[12px] font-extrabold text-white">
                      {initials(c.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-white">{c.name}</span>
                      <span className="block text-[12px] text-lavdim">{c.role}</span>
                    </span>
                    <span className="tnum text-[13px] font-bold text-lav">{c.split}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-card border border-hair bg-card p-5">
            <div className="mb-4 text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">Metadata</div>
            <dl className="space-y-[10px] text-[13.5px]">
              {[
                ['ISRC', current.isrc],
                ['ISWC', current.iswc],
                ['BPM', current.bpm != null ? String(current.bpm) : null],
                ['Language', current.language],
                ['Duration', fmt(current.durationSeconds)],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-4">
                  <dt className="text-lavdim">{k}</dt>
                  <dd className="tnum truncate text-right font-semibold text-white">{v || '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {/* Persistent mini-player */}
      <div className="fixed bottom-0 right-0 z-20 flex items-center gap-4 border-t border-hair bg-[#0b0a16]/95 px-9 py-3 backdrop-blur" style={{ left: miniLeft }}>
        <div
          className="h-11 w-11 flex-none rounded-[8px] bg-gradient-to-br from-brandindigo/40 to-brandfuchsia/30 bg-cover bg-center"
          style={coverUrl ? { backgroundImage: `url('${coverUrl}')` } : undefined}
        />
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-bold text-white">{current.title}</div>
          <div className="truncate text-[12px] text-lavdim">{artist ?? releaseTitle}</div>
        </div>
        <button
          onClick={() => setPlaying(p => !p)}
          disabled={!activeAudioUrl}
          className="ml-2 flex h-9 w-9 flex-none items-center justify-center rounded-full bg-grad text-white disabled:opacity-40"
          aria-label={playing ? 'pause' : 'play'}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor"><path d="M7 5h4v14H7zm6 0h4v14h-4z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] translate-x-[1px]" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>
          )}
        </button>
        <div className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-[rgba(199,203,247,.14)]">
          <div className="absolute inset-y-0 left-0 rounded-full bg-grad" style={{ width: `${pct}%` }} />
        </div>
        <span className="tnum flex-none text-[12px] font-semibold text-lavdim">
          {fmt(position)} / {fmt(duration || current.durationSeconds)}
        </span>
      </div>

      {/* Hidden audio element drives real playback when audio exists. */}
      <audio
        ref={audioRef}
        src={activeAudioUrl ?? undefined}
        onTimeUpdate={e => setPosition(e.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  )
}
