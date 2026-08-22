'use client'

// ─── SelectsPlayer — the Family B client player (31-13) ───────────────────
// Built to the locked reference `.planning/design/phase-31-shareable-music-
// player.html` (Apple-Music-native dense list, docked mini-player pill,
// ••• sheet, Look 2 default + Glow Up toggle, three-circle app bar,
// full-width rows). This component receives ALREADY-RESOLVED data as props
// — including per-track preview URLs — and never calls
// lib/watermark/signed-url.ts's getPreviewSignedUrl itself: that accessor
// is server-only (service-role client, next/headers), so page.tsx (the SSR
// route) resolves every track's preview via getPreviewSignedUrl BEFORE this
// component ever mounts, and passes the result down as `preview` on each
// PlayerTrack. A track whose preview is still 'processing' shows an
// interim state here — tapping it prompts a page refresh rather than ever
// falling back to a master path (T-31-27 — this component has no import
// capable of resolving one).
//
// Scope note (plan 31-13, Task 2): full co-edit add/remove + the Removed
// tray are the marked 31.1 extension (schema is ready, no route here).
// This slice implements ONLY the Suggested Songs "+" add, and it is
// deliberately EPHEMERAL (React state, not persisted) — there is no public
// track-add API route in this plan's scope. A guest cannot add (gated to
// an authenticated Client Partner, per the plan's action text).

import { useEffect, useMemo, useRef, useState } from 'react'
import { SELP_CSS } from './theme'
import { SELECTS_VIEWER_COOKIE } from '@/lib/selects/viewer-cookie'
import { escapeHtml } from '@/lib/security/escape-html'

export type PlayerReaction = 'love' | 'pass' | 'more_like_this' | null
export type PlayerAttribution = { name: string; kind: 'ae' | 'client' } | null
export type PlayerPreview = { status: 'ready'; url: string } | { status: 'processing' }

export type PlayerTrack = {
  rowId: string
  trackId: string
  title: string
  artist: string
  durationSeconds: number | null
  coverArtUrl: string | null
  note: string | null
  attribution: PlayerAttribution
  reaction: PlayerReaction
  preview: PlayerPreview
}

export type SuggestedTrack = {
  trackId: string
  title: string
  artist: string
  coverArtUrl: string | null
  durationSeconds: number | null
}

export type SelectsStatusValue = 'sent' | 'approved' | 'changes_requested'

export type SelectsPlayerData = {
  token: string
  name: string
  coverNote: string | null
  orgName: string
  aeName: string
  updatedLabel: string
  status: SelectsStatusValue
  isClientPartner: boolean
  tracks: PlayerTrack[]
  suggested: SuggestedTrack[]
}

// ─── small pure helpers ─────────────────────────────────────────────────
function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const ACCENTS = [
  { accent: '#e8934a', g: 'linear-gradient(150deg,#D946EF,#7c3aed 55%,#1e1b4b)' },
  { accent: '#7c8cf0', g: 'linear-gradient(150deg,#6366F1,#312e81 60%,#0b1020)' },
  { accent: '#e0557a', g: 'linear-gradient(150deg,#F472B6,#be185d 55%,#3b0764)' },
  { accent: '#ef6ea0', g: 'linear-gradient(150deg,#FBBF77,#b45309 55%,#3b1a06)' },
  { accent: '#34d0e0', g: 'linear-gradient(150deg,#22D3EE,#0e7490 55%,#062a33)' },
]
function accentFor(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return ACCENTS[hash % ACCENTS.length]
}
function coverStyle(coverArtUrl: string | null, seed: string): React.CSSProperties {
  if (coverArtUrl) return { backgroundImage: `url('${coverArtUrl}')` }
  return { backgroundImage: accentFor(seed).g }
}

function ensureViewerKey(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${SELECTS_VIEWER_COOKIE}=([^;]*)`))
  if (match) return decodeURIComponent(match[1])
  const key =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `svk_${Date.now()}_${Math.random().toString(36).slice(2)}`
  document.cookie = `${SELECTS_VIEWER_COOKIE}=${encodeURIComponent(key)};path=/;max-age=31536000;samesite=lax`
  return key
}

// ─── icons (inline, matches the locked reference's stroke set) ───────────
const Icn = ({ children, className = 'icn' }: { children: React.ReactNode; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24">
    {children}
  </svg>
)
const BackIcon = () => (
  <Icn>
    <path d="M15 6l-6 6 6 6" />
  </Icn>
)
const GuestIcon = () => (
  <Icn className="icn guestic">
    <circle cx="12" cy="8.5" r="3.2" />
    <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
  </Icn>
)
const CartIcon = () => (
  <Icn>
    <path d="M6 6h15l-1.5 9h-12z" />
    <path d="M6 6 5 3H2" />
    <circle cx="9" cy="20" r="1.3" />
    <circle cx="18" cy="20" r="1.3" />
  </Icn>
)
const ShareIcon = () => (
  <Icn>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
  </Icn>
)
const SparkleIcon = () => (
  <Icn>
    <path d="M12 3l1.9 5.2L19 10l-5.1 1.8L12 17l-1.9-5.2L5 10l5.1-1.8z" />
    <path d="M18.7 15.4l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6z" />
  </Icn>
)
const ShuffleIcon = () => (
  <Icn>
    <path d="M17 2l4 4-4 4" />
    <path d="M3 6h4a4 4 0 0 1 4 4" />
    <path d="M17 22l4-4-4-4" />
    <path d="M21 18H7a4 4 0 0 1-4-4" />
  </Icn>
)
const DownloadIcon = () => (
  <Icn>
    <path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.4A3.5 3.5 0 0 1 18 18" />
    <path d="M12 11v6" />
    <path d="m9.5 14.5 2.5 2.5 2.5-2.5" />
  </Icn>
)
const CheckIcon = () => (
  <Icn>
    <path d="M20 6 9 17l-5-5" />
  </Icn>
)
const EditIcon = () => (
  <Icn>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </Icn>
)
const MoreIcon = () => (
  <svg className="icn" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="19" cy="12" r="1.7" />
  </svg>
)
const LoveIcon = () => (
  <Icn>
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
  </Icn>
)
const PassIcon = () => (
  <Icn>
    <path d="M17 14V3H8.5a2 2 0 0 0-2 1.6l-1.2 6A2 2 0 0 0 7.3 13H12l-1 4.2A1.9 1.9 0 0 0 14.6 18z" />
    <path d="M17 3h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-3" />
  </Icn>
)
const RefreshIcon = () => (
  <Icn>
    <path d="M21 12a9 9 0 1 1-2.7-6.4" />
    <path d="M21 3v5h-5" />
  </Icn>
)
const PlusIcon = () => (
  <Icn>
    <path d="M12 5v14M5 12h14" />
  </Icn>
)
const VibeIcon = () => (
  <Icn>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.6" />
    <circle cx="12" cy="12" r=".6" fill="currentColor" />
  </Icn>
)
const ArrowIcon = () => (
  <Icn className="varr icn">
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
  </Icn>
)
const VerifiedIcon = () => (
  <Icn className="vf icn">
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 2.5 2.5L16 9" />
  </Icn>
)
const LockIcon = () => (
  <Icn>
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Icn>
)
const CreditsIcon = () => (
  <Icn>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5" />
    <circle cx="12" cy="16" r=".6" fill="currentColor" />
  </Icn>
)
const MoreLikeIcon = () => (
  <Icn>
    <path d="M12 3l2.2 5.9L20 11l-5.8 2.1L12 19l-2.2-5.9L4 11l5.8-2.1z" />
  </Icn>
)
const PlayGlyph = () => <path d="M8 5v14l11-7z" />
const PauseGlyph = () => (
  <>
    <path d="M8 5h3.2v14H8z" />
    <path d="M12.8 5H16v14h-3.2z" />
  </>
)

// ─── the component ────────────────────────────────────────────────────────
export default function SelectsPlayer({ data }: { data: SelectsPlayerData }) {
  const [look, setLook] = useState<'1' | '2'>('2')
  const [tracks, setTracks] = useState<PlayerTrack[]>(data.tracks)
  const [suggested, setSuggested] = useState<SuggestedTrack[]>(data.suggested)
  const [addedSuggested, setAddedSuggested] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<SelectsStatusValue>(data.status)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState<{ kind: 'curated' | 'suggested'; index: number } | null>(
    tracks.length > 0 ? { kind: 'curated', index: 0 } : null
  )
  const [scrolled, setScrolled] = useState(false)
  const [sheetIndex, setSheetIndex] = useState<number | null>(null)
  const [gateOpen, setGateOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [cart, setCart] = useState<Set<string>>(new Set())

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewerKeyRef = useRef<string | null>(null)

  useEffect(() => {
    viewerKeyRef.current = ensureViewerKey()
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 300)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // `msg` is rendered as HTML (see the toast <span dangerouslySetInnerHTML
  // below) so callers may include trusted static markup like <b>. ANY
  // user/artist-controlled value interpolated in (track titles, labels, names)
  // MUST be wrapped in escapeHtml() first — otherwise it is a stored-XSS sink
  // on this public/token surface (2026-08-22 audit finding #1).
  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2400)
  }

  const currentTrack: PlayerTrack | SuggestedTrack | null = useMemo(() => {
    if (!current) return null
    return current.kind === 'curated' ? tracks[current.index] ?? null : suggested[current.index] ?? null
  }, [current, tracks, suggested])

  const currentPreview: PlayerPreview | null =
    current?.kind === 'curated' ? (tracks[current.index]?.preview ?? null) : null

  // ─── playback ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    if (current?.kind === 'curated' && currentPreview?.status === 'ready') {
      if (el.src !== currentPreview.url) el.src = currentPreview.url
      if (playing) el.play().catch(() => {})
      else el.pause()
    } else {
      el.pause()
    }
  }, [current, currentPreview, playing])

  function playCurated(index: number) {
    const track = tracks[index]
    if (!track) return
    if (track.preview.status === 'processing') {
      showToast('Still getting this preview ready — refresh in a moment')
      return
    }
    if (current?.kind === 'curated' && current.index === index) {
      setPlaying(p => !p)
    } else {
      setCurrent({ kind: 'curated', index })
      setPlaying(true)
    }
  }

  function playSuggested(index: number) {
    setCurrent({ kind: 'suggested', index })
    setPlaying(true)
    showToast(`Previewing — <b>${escapeHtml(suggested[index]?.title)}</b>`)
  }

  function togglePlay() {
    if (!current) {
      if (tracks.length > 0) setCurrent({ kind: 'curated', index: 0 })
    }
    setPlaying(p => !p)
  }

  function skipNext() {
    if (tracks.length === 0) return
    const nextIndex = current?.kind === 'curated' ? (current.index + 1) % tracks.length : 0
    setCurrent({ kind: 'curated', index: nextIndex })
    setPlaying(true)
  }

  function shuffle() {
    if (tracks.length === 0) return
    const idx = Math.floor(Math.random() * tracks.length)
    setCurrent({ kind: 'curated', index: idx })
    setPlaying(true)
    showToast(`Shuffling — <b>${escapeHtml(tracks[idx].title)}</b>`)
  }

  // ─── reactions ───────────────────────────────────────────────────────
  async function setReaction(rowId: string, reaction: PlayerReaction) {
    setTracks(ts => ts.map(t => (t.rowId === rowId ? { ...t, reaction } : t)))
    try {
      const res = await fetch(`/api/selects/${data.token}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectsTrackId: rowId, reaction, viewerKey: viewerKeyRef.current }),
      })
      if (!res.ok) throw new Error('failed')
      if (reaction === 'love') showToast(`Kept — <b>${escapeHtml(tracks.find(t => t.rowId === rowId)?.title)}</b>`)
      else if (reaction === 'pass') showToast(`Passed — <b>${escapeHtml(tracks.find(t => t.rowId === rowId)?.title)}</b>`)
    } catch {
      showToast("Couldn't save that — try again")
    }
  }

  // ─── approve / request changes ─────────────────────────────────────────
  async function respond(action: 'approve' | 'request_changes') {
    let reason: string | undefined
    if (action === 'request_changes') {
      reason = window.prompt("What would you like changed? (optional — this goes straight to your AE's queue)") ?? undefined
    }
    try {
      const res = await fetch(`/api/selects/${data.token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: reason || undefined }),
      })
      const body = (await res.json().catch(() => null)) as { data?: { status: SelectsStatusValue }; error?: string } | null
      if (!res.ok || !body?.data) {
        showToast(body?.error ?? "Couldn't do that right now")
        return
      }
      setStatus(body.data.status)
      showToast(action === 'approve' ? 'Approved — thanks!' : 'Sent <b>Request changes</b> to your AE')
    } catch {
      showToast("Couldn't reach Funūn — try again")
    }
  }

  // ─── download ────────────────────────────────────────────────────────
  async function requestDownload(trackId: string, label: string) {
    if (!data.isClientPartner) {
      setGateOpen(true)
      return
    }
    try {
      const res = await fetch(`/api/selects/${data.token}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId }),
      })
      const body = (await res.json().catch(() => null)) as { data?: { status: string; url?: string } } | null
      const result = body?.data
      if (!result) {
        showToast("Couldn't start that download")
        return
      }
      if (result.status === 'ok' && result.url) {
        window.location.href = result.url
        showToast(`Downloading watermarked preview — <b>${escapeHtml(label)}</b>`)
      } else if (result.status === 'gate') {
        setGateOpen(true)
      } else if (result.status === 'disabled') {
        showToast('Downloads are turned off for this Selects')
      } else if (result.status === 'capped') {
        showToast("This track is over the length limit set for this Selects")
      } else if (result.status === 'processing') {
        showToast('Preparing your download — try again in a moment')
      } else {
        showToast("Couldn't start that download")
      }
    } catch {
      showToast("Couldn't reach Funūn — try again")
    }
  }

  function downloadAll() {
    if (!data.isClientPartner) {
      setGateOpen(true)
      return
    }
    showToast('Downloading all watermarked previews…')
    tracks.forEach(t => requestDownload(t.trackId, t.title))
  }

  // ─── suggested add (ephemeral, client-only — see header) ──────────────
  function addSuggested(index: number) {
    const s = suggested[index]
    if (!s) return
    if (!data.isClientPartner) {
      showToast('Log in as a Client Partner to add tracks')
      return
    }
    if (addedSuggested.has(s.trackId)) return
    setAddedSuggested(prev => new Set(prev).add(s.trackId))
    setTracks(ts => [
      ...ts,
      {
        rowId: `suggested:${s.trackId}`,
        trackId: s.trackId,
        title: s.title,
        artist: s.artist,
        durationSeconds: s.durationSeconds,
        coverArtUrl: s.coverArtUrl,
        note: 'Added from suggestions',
        attribution: { name: 'You', kind: 'client' },
        reaction: null,
        preview: { status: 'processing' },
      },
    ])
    showToast(`Added — <b>${escapeHtml(s.title)}</b>`)
  }

  function refreshSuggested() {
    setSuggested(s => {
      const copy = [...s]
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
      }
      return copy
    })
    showToast('Refreshed suggestions')
  }

  function toggleLook() {
    setLook(l => (l === '1' ? '2' : '1'))
    showToast(look === '1' ? 'Flat view' : '✨ Glow Up View — on')
  }

  function share() {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {})
    showToast('Copied link to this <b>Selects</b>')
  }

  function licenseTrack(trackId: string, title: string) {
    setCart(c => new Set(c).add(trackId))
    showToast(`Added to licensing cart — <b>${escapeHtml(title)}</b>`)
    setSheetIndex(null)
  }

  const totalSeconds = tracks.reduce((sum, t) => sum + (t.durationSeconds ?? 0), 0)
  const totalMinutes = Math.round(totalSeconds / 60)
  const canApprove = status === 'sent' || status === 'changes_requested'
  const canRequestChanges = status === 'sent'
  const sheetTrack = sheetIndex != null ? tracks[sheetIndex] : null

  return (
    <div className={`selp look-${look}`}>
      <style>{SELP_CSS}</style>
      <div id="ambient" />

      <div className={`appbar${scrolled ? ' solid' : ''}`}>
        <button className="rnd" title="Back" onClick={() => window.history.back()}>
          <BackIcon />
        </button>
        <div className="brandmini">
          <span className="mk" />
          <span>Funūn</span>
          <span className="phon">(fuh-NOON)</span>
        </div>
        <div className="abtitle">{data.name}</div>
        <div className="spacer" />
        <button
          className={`rnd acct${data.isClientPartner ? ' pro' : ''}`}
          title={data.isClientPartner ? 'Client Partner' : 'Log in to download'}
          onClick={() => !data.isClientPartner && setGateOpen(true)}
        >
          {data.isClientPartner ? <span className="proav">CP</span> : <GuestIcon />}
        </button>
        <button className={`rnd cartbtn${cart.size > 0 ? ' has' : ''}`} title="Licensing cart" onClick={() => setDrawerOpen(true)}>
          <CartIcon />
          <span className="badge">{cart.size}</span>
        </button>
        <button className="rnd" title="Share this Selects" onClick={share}>
          <ShareIcon />
        </button>
      </div>

      <div className="col">
        <div className="leftcol">
          <div className="glowbar">
            <button className={`glowbtn${look === '1' ? ' on' : ''}`} onClick={toggleLook}>
              <SparkleIcon />
              <span>Glow Up View</span>
            </button>
          </div>

          <div className="hero">
            <div className="cover" style={currentTrack ? coverStyle(currentTrack.coverArtUrl, currentTrack.trackId) : undefined}>
              <div className="previewpill">
                <span className="d" />
                Preview
              </div>
            </div>
            <div className="herotext">
              <div className="chip-funun">
                <span className="logo">FUNŪN</span>
                <span className="sep">·</span>
                <span className="sub">Selects</span>
              </div>
              <h1 className="title">{data.name}</h1>
              <div className="byline">
                <b>{data.aeName}</b>
                <VerifiedIcon />
                <span className="ml">· for {data.orgName}</span>
              </div>
              <div className="updated">
                Updated {data.updatedLabel} · by {data.aeName}
              </div>
              {data.coverNote && <div className="note">{data.coverNote}</div>}
            </div>

            <div className="herorow">
              <button className="hc" title="Shuffle" onClick={shuffle}>
                <ShuffleIcon />
              </button>
              <button className="playpill" onClick={togglePlay}>
                <svg viewBox="0 0 24 24">{playing ? <PauseGlyph /> : <PlayGlyph />}</svg>
                <span>{playing ? 'Pause' : 'Play'}</span>
              </button>
              <button className="hc" title="Download all (watermarked)" onClick={downloadAll}>
                <DownloadIcon />
              </button>
            </div>

            <div className="bizrow">
              <button className="gbtn primary" disabled={!canApprove} onClick={() => respond('approve')}>
                <CheckIcon />
                Approve these
              </button>
              <button className="gbtn" disabled={!canRequestChanges} onClick={() => respond('request_changes')}>
                <EditIcon />
                Request changes
              </button>
            </div>
          </div>
        </div>

        <div className="listcol">
          <div className="listhead">
            <span className="l">Curated Tracks</span>
            <span className="cnt">
              {tracks.length} song{tracks.length === 1 ? '' : 's'}
              {totalMinutes > 0 ? ` · ${totalMinutes} min` : ''}
            </span>
            <span className="wm">
              <span className="d" />
              Previews watermarked
            </span>
          </div>

          <div id="tracks">
            {tracks.map((t, i) => {
              const isOn = current?.kind === 'curated' && current.index === i && playing
              return (
                <div key={t.rowId} className={`trk${isOn ? ' on' : ''}`}>
                  <button className="art" style={coverStyle(t.coverArtUrl, t.trackId)} onClick={() => playCurated(i)}>
                    <span className="eq">
                      <i />
                      <i />
                      <i />
                    </span>
                    {t.attribution?.kind === 'client' && (
                      <span className="who client" title={`Added by ${t.attribution.name}`}>
                        {t.attribution.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </button>
                  <div className="info" onClick={() => playCurated(i)}>
                    <div className="t">{t.title}</div>
                    <div className="sub">
                      <span className="artist">{t.artist}</span>
                      {t.note && (
                        <>
                          <span className="dot">·</span>
                          <span className="desc">
                            <span>
                              {t.note} &nbsp;•&nbsp; {t.note}
                            </span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="ctrls">
                    <button className="cbtn mm" title="More" onClick={() => setSheetIndex(i)}>
                      <MoreIcon />
                    </button>
                    <button
                      className={`cbtn love${t.reaction === 'love' ? ' on' : ''}`}
                      title="Keep"
                      onClick={() => setReaction(t.rowId, t.reaction === 'love' ? null : 'love')}
                    >
                      <LoveIcon />
                    </button>
                    <button
                      className={`cbtn pass${t.reaction === 'pass' ? ' on' : ''}`}
                      title="Pass"
                      onClick={() => setReaction(t.rowId, t.reaction === 'pass' ? null : 'pass')}
                    >
                      <PassIcon />
                    </button>
                    <button className="cbtn dl" title="Download watermarked preview" onClick={() => requestDownload(t.trackId, t.title)}>
                      <DownloadIcon />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="suggest">
            <div className="sgh">
              <div>
                <div className="sgt">Suggested Songs</div>
                <div className="sgs">More the algorithm found that could work for this project</div>
              </div>
              <button className="sgref" title="Refresh suggestions" onClick={refreshSuggested}>
                <RefreshIcon />
              </button>
            </div>
            <div>
              {suggested.map((s, i) => {
                const isPreviewing = current?.kind === 'suggested' && current.index === i
                const added = addedSuggested.has(s.trackId)
                return (
                  <div key={s.trackId} className={`srow2${isPreviewing ? ' nowprev' : ''}`} onClick={() => playSuggested(i)}>
                    <div className="sth" style={coverStyle(s.coverArtUrl, s.trackId)} />
                    <div className="sinfo">
                      <div className="stt">{s.title}</div>
                      <div className="sta">{s.artist}</div>
                    </div>
                    <button
                      className={`sgadd${added ? ' added' : ''}`}
                      title={added ? 'Added' : 'Add to the list'}
                      onClick={e => {
                        e.stopPropagation()
                        addSuggested(i)
                      }}
                    >
                      {added ? <CheckIcon /> : <PlusIcon />}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <a className="vibe" href="/sync/brief">
            <span className="vic">
              <VibeIcon />
            </span>
            <span className="vtx">
              <span className="vt">Here&rsquo;s the vibe I want</span>
              <span className="vs">
                Point us to a track from anywhere — Spotify, Apple Music, a link — and we&rsquo;ll match the vibe to
                rights-ready songs in our catalogue.
              </span>
            </span>
            <ArrowIcon />
          </a>
        </div>
      </div>

      <div className="footer">
        Previews are watermarked<span className="d" />
        Play, keep &amp; pass freely — no login<span className="d" />
        Downloading needs a free Client Partner account
      </div>

      <div className="miniwrap">
        <div className="mini">
          <div className="mth" style={currentTrack ? coverStyle(currentTrack.coverArtUrl, currentTrack.trackId) : undefined} />
          <div className="mtx">
            <div className="mtt">{currentTrack?.title ?? 'Nothing playing'}</div>
            <div className="mta">
              <span>{currentTrack?.artist ?? ''}</span>
              {currentTrack && (
                <span className="mprev">Preview</span>
              )}
            </div>
          </div>
          <button className="mplay" onClick={togglePlay}>
            <svg viewBox="0 0 24 24">{playing ? <PauseGlyph /> : <PlayGlyph />}</svg>
          </button>
          <button className="mnext" title="Next" onClick={skipNext}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 5v14l11-7zM16 5h2v14h-2z" />
            </svg>
          </button>
          <div className="mscrub">
            <div className="mfill" />
          </div>
        </div>
      </div>

      {/* ••• sheet */}
      <div className={`sheetbg${sheetTrack ? ' on' : ''}`} onClick={() => setSheetIndex(null)} />
      <div className={`sheet${sheetTrack ? ' on' : ''}`}>
        <div className="grip" />
        {sheetTrack && (
          <>
            <div className="sh">
              <div className="th" style={coverStyle(sheetTrack.coverArtUrl, sheetTrack.trackId)} />
              <div>
                <div className="nm">{sheetTrack.title}</div>
                <div className="ar">
                  {sheetTrack.artist} · {formatDuration(sheetTrack.durationSeconds)}
                </div>
                {sheetTrack.attribution && (
                  <div className="shby">
                    {sheetTrack.attribution.kind === 'client' ? 'Added by ' : 'Curated by '}
                    <b>{sheetTrack.attribution.name}</b>
                  </div>
                )}
              </div>
            </div>
            <div className="trio">
              <button className={sheetTrack.reaction === 'love' ? 'on' : ''} onClick={() => setReaction(sheetTrack.rowId, sheetTrack.reaction === 'love' ? null : 'love')}>
                <LoveIcon />
                Keep
              </button>
              <button
                onClick={() => {
                  setReaction(sheetTrack.rowId, sheetTrack.reaction === 'pass' ? null : 'pass')
                  setSheetIndex(null)
                }}
              >
                <PassIcon />
                Pass
              </button>
              <button
                onClick={() => {
                  share()
                }}
              >
                <ShareIcon />
                Share
              </button>
            </div>
            {sheetTrack.note && <div className="note">&ldquo;{sheetTrack.note}&rdquo;</div>}
            <div className="rows">
              <button className="srow primary" onClick={() => licenseTrack(sheetTrack.trackId, sheetTrack.title)}>
                <CartIcon />
                <div>
                  <div>License this track</div>
                  <div className="sub">Adds to your cart · opens the Deals room</div>
                </div>
              </button>
              <button className="srow" onClick={() => showToast(`Finding more like <b>${escapeHtml(sheetTrack.title)}</b>`)}>
                <MoreLikeIcon />
                <div>More like this</div>
              </button>
              <button className="srow" onClick={() => showToast('Opening credits &amp; rights…')}>
                <CreditsIcon />
                <div>View credits &amp; rights</div>
              </button>
              <button
                className="srow"
                onClick={() => {
                  setSheetIndex(null)
                  requestDownload(sheetTrack.trackId, sheetTrack.title)
                }}
              >
                <DownloadIcon />
                <div>Download watermarked preview</div>
                <span className="rt">{data.isClientPartner ? '' : 'needs account'}</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* cart / deals drawer */}
      <div className={`scrim-bg${drawerOpen ? ' on' : ''}`} onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(4,3,10,.6)', zIndex: 40, display: drawerOpen ? 'block' : 'none' }} />
      <div className="drawer" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(420px,92vw)', background: '#0a0912', borderLeft: '1px solid var(--border)', zIndex: 50, transform: drawerOpen ? 'none' : 'translateX(100%)', transition: 'transform .24s cubic-bezier(.4,0,.2,1)', display: 'flex', flexDirection: 'column' }}>
        <div className="dh" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 20, borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Licensing cart</h3>
            <div className="sub" style={{ fontSize: 12, color: 'var(--lavdim)', marginTop: 2 }}>
              Opens your deal in the Deals room
            </div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            style={{ marginLeft: 'auto', background: 'none', border: 0, color: 'var(--lavdim)', width: 32, height: 32, borderRadius: 8, fontSize: 20, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {cart.size === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--lavdim)', padding: 48, fontSize: 13.5, lineHeight: 1.6 }}>
              No tracks yet.
              <br />
              Use <b>License</b> in a track&rsquo;s ••• menu to line up a deal.
            </div>
          ) : (
            [...cart].map(trackId => {
              const t = tracks.find(tr => tr.trackId === trackId)
              if (!t) return null
              return (
                <div key={trackId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 11, borderRadius: 12, background: 'var(--panel)', border: '1px solid var(--border)', marginBottom: 9 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 9, ...coverStyle(t.coverArtUrl, t.trackId), backgroundSize: 'cover' }} />
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--lavdim)', marginTop: 2 }}>{t.artist}</div>
                  </div>
                  <button
                    onClick={() =>
                      setCart(c => {
                        const next = new Set(c)
                        next.delete(trackId)
                        return next
                      })
                    }
                    style={{ marginLeft: 'auto', background: 'none', border: 0, color: 'var(--lavdim)', fontSize: 16 }}
                  >
                    ×
                  </button>
                </div>
              )
            })
          )}
        </div>
        <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
          <button
            disabled={cart.size === 0}
            onClick={() => showToast('Your AE will follow up to finish this license')}
            style={{
              width: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 9,
              padding: 14,
              borderRadius: 13,
              border: 0,
              background: cart.size === 0 ? 'var(--panel2)' : 'var(--grad)',
              color: '#fff',
              fontSize: 14.5,
              fontWeight: 600,
              opacity: cart.size === 0 ? 0.4 : 1,
              cursor: cart.size === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Go to deal
          </button>
          <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--lavdim)', marginTop: 10 }}>
            You&rsquo;ll finish the license terms in the Deals room.
          </div>
        </div>
      </div>

      {/* download gate */}
      <div className={`modal${gateOpen ? ' on' : ''}`}>
        <div className="mcard">
          <div className="ic">
            <LockIcon />
          </div>
          <h3>Log in to download</h3>
          <p>
            Play, keep, pass, and approve freely — no login. Downloading a watermarked file to test-sync just needs a
            free Client Partner account — log in, or create one in seconds.
          </p>
          <a className="make" href="/sync/access" style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}>
            Create Free Client Partner Account
          </a>
          <a className="login" href="/sync/access" style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}>
            Log in
          </a>
          <button className="later" onClick={() => setGateOpen(false)}>
            Maybe later
          </button>
          <div className="fine">Downloads are always watermarked previews — never clean masters. The same rule applies in The Crate.</div>
        </div>
      </div>

      <div className={`toast${toast ? ' on' : ''}`}>
        <span className="d" />
        <span dangerouslySetInnerHTML={{ __html: toast ?? '' }} />
      </div>

      <audio ref={audioRef} onEnded={() => setPlaying(false)} />
    </div>
  )
}
