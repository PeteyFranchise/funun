'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LyricsPanel } from '@/components/vault/LyricsPanel'

// Public-only track shape (D-11: names+roles credits, no split/splitTotal;
// D-09: per-track lyrics text so the panel can hide when absent). This is a
// deliberately distinct type from PlaybackView's private `TrackView` — the
// two players never share a track shape (see 09-03-PLAN.md Warning-1).
export type PublicTrackView = {
  id: string
  number: number
  title: string
  durationSeconds: number | null
  audioUrl: string | null
  credits: { name: string; role: string }[]
  lyrics: string | null
}

function fmt(s: number | null): string {
  if (!s && s !== 0) return '—'
  const total = Math.round(s)
  const m = Math.floor(total / 60)
  const sec = total % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

export function PublicPlaybackView({
  releaseTitle,
  artist,
  coverUrl,
  tracks,
  allowResharing,
  avatarUrl,
  monthlyListeners,
  verified,
}: {
  releaseTitle: string
  artist: string | null
  coverUrl: string | null
  tracks: PublicTrackView[]
  projectId: string
  allowResharing: boolean
  /** Optional meta-block extras (D-01 §6) — omitted from the row when not provided. */
  avatarUrl?: string | null
  monthlyListeners?: number | null
  verified?: boolean
}) {
  const router = useRouter()
  const [currentId, setCurrentId] = useState(tracks[0]?.id ?? '')
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  const [menuOpen, setMenuOpen] = useState(false)
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const current = useMemo(() => tracks.find(t => t.id === currentId) ?? tracks[0], [tracks, currentId])
  const duration = current?.durationSeconds ?? 0
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0
  const releaseType = tracks.length === 1 ? 'Single' : tracks.length <= 6 ? 'EP' : 'Album'

  useEffect(() => {
    setPosition(0)
  }, [currentId])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    if (playing) el.play().catch(() => setPlaying(false))
    else el.pause()
  }, [playing, currentId])

  // Click-outside-to-close for the overflow menu (D-14) — reuses the
  // CollaboratorPicker mousedown-listener pattern.
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [menuOpen])

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

  function shareCaption(): string {
    return `Listen to '${current?.title ?? releaseTitle}' by ${artist ?? 'Unknown Artist'} on Funūn`
  }

  async function copyLink() {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    await navigator.clipboard.writeText(`${shareCaption()} → ${url}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Web-Share-first, clipboard-fallback (D-05) — .share() must be the first
  // synchronous statement in the handler, no leading await.
  async function shareTrack() {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const caption = shareCaption()
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: caption, url })
        return
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return
      }
    }
    await navigator.clipboard.writeText(`${caption} → ${url}`)
    setShared(true)
    setTimeout(() => setShared(false), 1500)
  }

  if (!current) return <p className="px-9 py-8 text-lavdim">No tracks in this release yet.</p>

  return (
    <div className="relative min-h-screen bg-ink text-white">
      <div className="relative mx-auto max-w-[560px]">
        {/* App bar */}
        <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-[26px] py-[30px]">
          <button
            aria-label="Back"
            onClick={() => router.back()}
            className="flex h-[42px] w-[42px] items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-md"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-[14px] font-bold uppercase tracking-[.18em] text-white/85">Now Playing</span>
          <div ref={menuRef} className="relative">
            <button
              aria-label="More options"
              onClick={() => setMenuOpen(o => !o)}
              className="flex h-[42px] w-[42px] items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-md"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-[50px] z-40 min-w-[200px] rounded-xl border border-hair bg-card py-[6px] shadow-[0_12px_30px_-10px_rgba(0,0,0,.5)]">
                <button
                  onClick={() => {
                    setCreditsOpen(true)
                    setMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-3 px-[14px] py-[10px] text-left text-[15px] font-semibold text-white hover:bg-card2"
                >
                  View credits
                </button>
                {current.lyrics && (
                  <button
                    onClick={() => {
                      setLyricsOpen(true)
                      setMenuOpen(false)
                    }}
                    className="flex w-full items-center gap-3 px-[14px] py-[10px] text-left text-[15px] font-semibold text-white hover:bg-card2"
                  >
                    View lyrics
                  </button>
                )}
                <button
                  onClick={() => {
                    copyLink()
                    setMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-3 px-[14px] py-[10px] text-left text-[15px] font-semibold text-white hover:bg-card2"
                >
                  {copied ? 'Link copied!' : 'Copy link'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Hero art */}
        <div className="relative h-[560px] w-full overflow-hidden">
          <div
            className="absolute inset-0 bg-gradient-to-br from-brandindigo/40 to-brandfuchsia/30 bg-cover"
            style={{
              ...(coverUrl ? { backgroundImage: `url('${coverUrl}')` } : {}),
              backgroundPosition: 'center 32%',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(8,7,13,.45) 0%, transparent 26%, transparent 50%, rgba(8,7,13,.6) 82%, #08070d 100%)',
            }}
          />
          {/* Meta block */}
          <div className="absolute inset-x-0 bottom-0 px-[34px] pb-[26px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-[6px] text-[12px] font-bold text-white backdrop-blur-md">
              FUNŪN · Artist profile
            </span>
            <div className="mt-3 text-[14px] font-bold uppercase tracking-[.2em] text-white/70">{releaseType}</div>
            <div className="mt-1 text-[58px] font-black leading-none tracking-[-.01em] text-white">{current.title}</div>
            <div className="mt-3 flex items-center gap-2">
              {avatarUrl && (
                <span
                  className="h-[30px] w-[30px] flex-none rounded-full bg-cover bg-center"
                  style={{ backgroundImage: `url('${avatarUrl}')` }}
                />
              )}
              <span className="text-[19px] font-semibold text-white">{artist ?? releaseTitle}</span>
              {verified && (
                <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] flex-none text-brandindigo" fill="currentColor" aria-label="verified">
                  <path d="M12 2 15 6l5 1-3.5 3.5L17 16l-5-2.5L7 16l.5-5.5L4 7l5-1z" />
                </svg>
              )}
              {monthlyListeners != null && (
                <span className="text-[15px] text-lavdim">· {monthlyListeners.toLocaleString()} monthly listeners</span>
              )}
            </div>
          </div>
        </div>

        {/* Player */}
        <div className="px-[34px] pb-8 pt-6">
          <div
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            className="relative h-[6px] w-full cursor-pointer rounded-[3px] bg-[rgba(199,203,247,.16)]"
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect()
              const frac = (e.clientX - rect.left) / rect.width
              seekToFraction(Math.min(1, Math.max(0, frac)))
            }}
          >
            <div className="absolute inset-y-0 left-0 rounded-[3px] bg-grad" style={{ width: `${pct}%` }} />
            <div
              className="absolute top-1/2 h-[15px] w-[15px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
              style={{ left: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[14px] font-semibold text-lavdim tnum">
            <span>{fmt(position)}</span>
            <span>{fmt(duration || current.durationSeconds)}</span>
          </div>

          {/* Transport */}
          <div className="mt-6 flex items-center justify-center gap-[42px] text-lav">
            <button aria-label="shuffle" className="opacity-70 hover:opacity-100">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
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
              disabled={!current.audioUrl}
              className="flex h-[78px] w-[78px] items-center justify-center rounded-full bg-grad text-white shadow-[0_18px_44px_-12px_rgba(217,70,239,.65)] disabled:opacity-40"
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
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </button>
          </div>
          {!current.audioUrl && (
            <p className="mt-3 text-center text-[12.5px] text-lavdim">No audio available for this track yet.</p>
          )}

          {/* Visitor Share affordance — omitted server-side (not CSS-hidden) when
              allow_resharing is false (D-07). */}
          {allowResharing && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={shareTrack}
                className="inline-flex items-center gap-[9px] rounded-[11px] border border-hairstrong bg-card px-[22px] py-[13px] text-[15px] font-bold text-white"
              >
                {shared ? 'Link copied!' : 'Share'}
              </button>
            </div>
          )}

          {/* Up-next */}
          <div className="mt-9">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold uppercase tracking-[.16em] text-lavdim">
                More from {artist ?? 'this artist'}
              </span>
            </div>
            <ul className="mt-3 space-y-1">
              {tracks.map(t => {
                const active = t.id === current.id
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => selectTrack(t.id)}
                      className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left hover:bg-white/5"
                    >
                      <span
                        className="h-12 w-12 flex-none rounded-[10px] bg-gradient-to-br from-brandindigo/40 to-brandfuchsia/30 bg-cover bg-center"
                        style={coverUrl ? { backgroundImage: `url('${coverUrl}')` } : undefined}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[17px] font-semibold ${active ? 'gtext' : 'text-white'}`}>
                          {t.title}
                        </span>
                        <span className="block text-[14px] text-lavdim">
                          {releaseType} · {releaseTitle}
                        </span>
                      </span>
                      {active ? (
                        <svg aria-label="now playing" viewBox="0 0 24 24" className="h-4 w-4 flex-none text-brandindigo" fill="currentColor">
                          <rect x="4" y="10" width="3" height="8" />
                          <rect x="10.5" y="6" width="3" height="12" />
                          <rect x="17" y="2" width="3" height="16" />
                        </svg>
                      ) : (
                        <span className="tnum flex-none text-[14px] text-lavdim">{fmt(t.durationSeconds)}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>

      {/* View credits — names + roles only, no split percentage anywhere (D-11) */}
      {creditsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
          onClick={() => setCreditsOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-hair bg-card p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[16px] font-bold text-white">Credits</span>
              <button
                aria-label="Close credits"
                onClick={() => setCreditsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white hover:bg-white/10"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
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
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <LyricsPanel
        open={lyricsOpen}
        onClose={() => setLyricsOpen(false)}
        trackTitle={current.title}
        lyricsText={current.lyrics ?? ''}
      />

      {/* Hidden audio element drives real playback — only the share MP3 URL,
          never metadata.master. */}
      <audio
        ref={audioRef}
        src={current.audioUrl ?? undefined}
        onTimeUpdate={e => setPosition(e.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  )
}
