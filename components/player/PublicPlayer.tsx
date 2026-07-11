'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useShare } from '@/components/player/useShare'

// Public, stream-only "now playing" experience for /r/[projectId] (Phase 9
// D-01). Deliberately NOT the owner's PlaybackView: no master/stems toggle,
// no file-status, no ISRC/ISWC/BPM, and no split percentages — a public
// share link must never expose private rights data. Credits (names + roles
// only, D-11) and static lyrics (D-08/D-12) are reachable from the overflow
// menu (D-14). Share uses the Web Share API with a clipboard fallback (D-05),
// gated for visitors by the artist's allow_resharing toggle (D-07).

export type PublicCredit = { name: string; role: string }

export type PublicTrack = {
  id: string
  number: number
  title: string
  durationSeconds: number | null
  audioUrl: string | null
  credits: PublicCredit[]
  lyrics: string | null
}

function fmt(s: number | null): string {
  if (!s && s !== 0) return '-:--'
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function currentShareUrl(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin + window.location.pathname
}

export function PublicPlayer({
  releaseTitle,
  artist,
  coverUrl,
  tracks,
  allowResharing,
  viewerIsOwner,
}: {
  releaseTitle: string
  artist: string | null
  coverUrl: string | null
  tracks: PublicTrack[]
  /** Artist opt-in that lets non-owner visitors reshare (D-07). */
  allowResharing: boolean
  /** The owner always sees Share regardless of the toggle (D-04/D-07). */
  viewerIsOwner: boolean
}) {
  const [currentId, setCurrentId] = useState(tracks[0]?.id ?? '')
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sheet, setSheet] = useState<null | 'credits' | 'lyrics'>(null)

  const audioRef = useRef<HTMLAudioElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const { toast, notify } = useToast()
  const { share, copyLink } = useShare(notify)

  const current = useMemo(() => tracks.find(t => t.id === currentId) ?? tracks[0], [tracks, currentId])
  const duration = current?.durationSeconds ?? 0
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0

  const canShare = viewerIsOwner || allowResharing
  const hasLyrics = Boolean(current?.lyrics && current.lyrics.trim())
  const hasCredits = (current?.credits.length ?? 0) > 0
  const menuHasItems = hasCredits || hasLyrics || canShare

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    if (playing) el.play().catch(() => setPlaying(false))
    else el.pause()
  }, [playing, currentId])

  // Close the overflow menu on any outside pointer press (matches the
  // codebase's existing picker/menu dismissal pattern).
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  function selectTrack(id: string) {
    setCurrentId(id)
    setPosition(0)
    setPlaying(true)
  }

  function nextTrack() {
    if (tracks.length <= 1) return
    if (shuffle) {
      const others = tracks.filter(t => t.id !== current?.id)
      selectTrack(others[Math.floor(others.length * pseudoRandom(position))].id)
      return
    }
    const i = tracks.findIndex(t => t.id === current?.id)
    if (i < tracks.length - 1) selectTrack(tracks[i + 1].id)
  }

  function prevTrack() {
    const i = tracks.findIndex(t => t.id === current?.id)
    if (i > 0) selectTrack(tracks[i - 1].id)
  }

  function seekToFraction(f: number) {
    const el = audioRef.current
    const d = duration || el?.duration || 0
    const t = f * d
    setPosition(t)
    if (el) el.currentTime = t
  }

  function onEnded() {
    if (repeat) {
      seekToFraction(0)
      setPlaying(true)
      return
    }
    const i = tracks.findIndex(t => t.id === current?.id)
    if (shuffle || i < tracks.length - 1) nextTrack()
    else setPlaying(false)
  }

  function doShare() {
    setMenuOpen(false)
    if (!current) return
    share({ url: currentShareUrl(), title: current.title, artist })
  }

  if (!current) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink text-lavdim">
        <p>This release has no tracks yet.</p>
      </div>
    )
  }

  const upNext = tracks.filter(t => t.id !== current.id)

  return (
    <div className="min-h-screen bg-ink text-white">
      {/* App bar */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-hair bg-ink/70 px-[clamp(20px,4vw,48px)] py-4 backdrop-blur-xl">
        <button
          onClick={() => (typeof window !== 'undefined' ? window.history.back() : undefined)}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-hairstrong bg-card text-lav hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="mx-auto flex items-center gap-2">
          <span className="gtext text-[15px] font-black tracking-[.06em]">FUNŪN</span>
          <span className="text-[10px] font-bold uppercase tracking-[.22em] text-lavdim">· Now playing</span>
        </div>
        {menuHasItems ? (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              aria-label="More options"
              aria-expanded={menuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-hairstrong bg-card text-lav hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-11 z-50 w-52 animate-[funun-fade-up_.18s_ease-out] overflow-hidden rounded-[12px] border border-hairstrong bg-card2 py-1 shadow-[0_20px_50px_-16px_rgba(0,0,0,.8)]">
                {hasCredits && <MenuItem label="View credits" onClick={() => { setMenuOpen(false); setSheet('credits') }} />}
                {hasLyrics && <MenuItem label="View lyrics" onClick={() => { setMenuOpen(false); setSheet('lyrics') }} />}
                {canShare && <MenuItem label="Copy link" onClick={() => { setMenuOpen(false); copyLink(currentShareUrl()) }} />}
                {canShare && <MenuItem label="Share" onClick={doShare} />}
              </div>
            )}
          </div>
        ) : (
          <span className="h-9 w-9" aria-hidden />
        )}
      </header>

      <main className="mx-auto flex w-full max-w-[560px] flex-col items-center px-6 pb-24 pt-8">
        {/* Hero art with scrim */}
        <div className="relative aspect-square w-full max-w-[440px] overflow-hidden rounded-[24px] shadow-[0_28px_80px_-24px_rgba(0,0,0,.8)]">
          <div
            className="h-full w-full bg-gradient-to-br from-brandindigo/40 to-brandfuchsia/30 bg-cover bg-center"
            style={coverUrl ? { backgroundImage: `url('${coverUrl}')` } : undefined}
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(10,10,15,.55)_100%)]" />
        </div>

        {/* Title + artist */}
        <div className="mt-7 w-full text-center">
          <div className="text-[26px] font-extrabold tracking-[-.01em]">{current.title}</div>
          <div className="mt-1 text-[15px] font-medium text-lavdim">
            {artist ? `${artist} · ` : ''}
            {releaseTitle}
          </div>
        </div>

        {/* Scrub bar */}
        <button
          className="group relative mt-7 h-[6px] w-full max-w-[440px] cursor-pointer rounded-full bg-[rgba(199,203,247,.16)]"
          aria-label="Seek"
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect()
            seekToFraction(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)))
          }}
        >
          <span className="absolute inset-y-0 left-0 rounded-full bg-grad" style={{ width: `${pct}%` }} />
          <span className="absolute top-1/2 h-[13px] w-[13px] -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100" style={{ left: `calc(${pct}% - 6px)` }} />
        </button>
        <div className="mt-2 flex w-full max-w-[440px] justify-between text-[12.5px] font-semibold text-lavdim tnum">
          <span>{fmt(position)}</span>
          <span>{fmt(duration || current.durationSeconds)}</span>
        </div>

        {/* Transport */}
        <div className="mt-6 flex items-center gap-7 text-lav">
          <button
            aria-label="Shuffle"
            aria-pressed={shuffle}
            onClick={() => setShuffle(s => !s)}
            className={shuffle ? 'text-brandindigo' : 'opacity-70 hover:opacity-100'}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>
          </button>
          <button aria-label="Previous" onClick={prevTrack} className="hover:text-white">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M6 5v14h2V5zm3 7 9 7V5z" /></svg>
          </button>
          <button
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => setPlaying(p => !p)}
            disabled={!current.audioUrl}
            className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-grad text-white shadow-cta disabled:opacity-40"
          >
            {playing ? (
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor"><path d="M7 5h4v14H7zm6 0h4v14h-4z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-8 w-8 translate-x-[2px]" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>
            )}
          </button>
          <button aria-label="Next" onClick={nextTrack} className="hover:text-white">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M16 5v14h2V5zM6 5v14l9-7z" /></svg>
          </button>
          <button
            aria-label="Repeat"
            aria-pressed={repeat}
            onClick={() => setRepeat(r => !r)}
            className={repeat ? 'text-brandindigo' : 'opacity-70 hover:opacity-100'}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" /></svg>
          </button>
        </div>
        {!current.audioUrl && <p className="mt-3 text-[12.5px] text-lavdim">This track isn&apos;t available to stream yet.</p>}

        {/* More from artist */}
        {upNext.length > 0 && (
          <div className="mt-11 w-full">
            <div className="mb-3 text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">
              More from {artist ?? releaseTitle}
            </div>
            <ul className="space-y-1">
              {upNext.map(t => (
                <li key={t.id}>
                  <button
                    onClick={() => selectTrack(t.id)}
                    className="flex w-full items-center gap-3 rounded-[10px] px-3 py-[10px] text-left transition hover:bg-white/5"
                  >
                    <span className="tnum w-5 flex-none text-[13px] text-lavdim">{t.number}</span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white">{t.title}</span>
                    <span className="tnum flex-none text-[12.5px] text-lavdim">{fmt(t.durationSeconds)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      {/* Slide-up sheets — player keeps running underneath (D-08). */}
      {sheet && (
        <Sheet title={sheet === 'lyrics' ? 'Lyrics' : 'Credits'} subtitle={current.title} onClose={() => setSheet(null)}>
          {sheet === 'lyrics' ? (
            <p className="whitespace-pre-wrap text-[15px] leading-[1.7] text-lav">{current.lyrics}</p>
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
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      )}

      {toast}

      {/* Stream-only playback — always the share MP3 (audio_file_url), never the master. */}
      <audio
        ref={audioRef}
        src={current.audioUrl ?? undefined}
        onTimeUpdate={e => setPosition(e.currentTarget.currentTime)}
        onEnded={onEnded}
      />
    </div>
  )
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full px-4 py-[10px] text-left text-[14px] font-semibold text-lav hover:bg-white/5 hover:text-white"
    >
      {label}
    </button>
  )
}

function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative max-h-[75vh] w-full max-w-[560px] animate-[funun-slide-up_.28s_ease-out] overflow-y-auto rounded-t-[22px] border border-hairstrong bg-card px-6 pb-10 pt-5">
        <div className="mx-auto mb-4 h-[5px] w-10 rounded-full bg-hairstrong" />
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">{title}</div>
            <div className="mt-1 text-[17px] font-extrabold tracking-[-.01em]">{subtitle}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full border border-hairstrong text-lav hover:text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// Deterministic "randomness" for shuffle so no Math.random() at module load
// and stable within a tick — good enough for casual shuffle.
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 99991 + 7) * 10000
  return x - Math.floor(x)
}
