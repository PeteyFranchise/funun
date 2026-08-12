'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  USAGE_TYPE_VALUES,
  USAGE_TYPE_LABELS,
  TERRITORY_VALUES,
  TERRITORY_LABELS,
  type UsageType,
  type Territory,
} from '@/lib/deals/schema'
import { buildRequestBody } from '@/lib/deals/request-payload'
import { FNBL_CSS } from '@/components/buyer/fnbl-theme'
import { LoginRegisterModal } from '@/components/buyer/LoginRegisterModal'

// ─── CatalogBrowserLight ──────────────────────────────────────────────────
// The buyer browse surface — a faithful recreation of Claude Design's LIGHT
// buyer catalogue (mockups/buyer-catalogue.html). Buyer side is LIGHT to
// distinguish it from the dark artist side (owner decision, 2026-08-03).
//
// Slice 2a — working browse: filter dropdowns, search, sort, chips, live count,
// empty state (client-side over `rows`).
// Slice 2b — experience: the sticky audio player (audition a track) + the
// License request modal (the buyer's conversion action). Playback is a
// simulated playhead (the fixture has no preview audio); the request form shows
// a success toast — wiring Send to /api/buyer/requests (16-06) + live data +
// server-side filtering are slices 1.5/2c. Which songs reach the catalogue is
// an open decision — see .planning/deliberations/buyer-catalogue-inclusion-model.md.
// Design CSS is ported scoped under `.fnbl` so it never leaks into the dark app.
//
// 22-03: mounted `embedded` from app/sync/catalog/page.tsx (23-02: renamed
// from app/(buyer-portal)/buyers/catalog/page.tsx)
// so it renders inside the shared BuyerTopNav shell without drawing a
// second, competing header or re-injecting the layout's already-injected
// FNBL_CSS base tokens (nav-reconciliation Option A).

export type CatalogRights = 'ok' | 'part' | 'req'
export type Dynamics = 'twin' | 'steady' | 'build' | 'fade' | 'peak'

export type CatalogRow = {
  id: string
  title: string
  artist: string
  coverUrl: string | null
  gradient: string
  genres: string
  energy: string
  length: string
  versions: number
  rights: CatalogRights
  dynamics: Dynamics
  mood: string
  vocal: string
  instruments: string[]
  // 22-02 (slice 2c) — the real vault_projects id + track options the
  // License modal needs to build a POST /api/buyer/requests body. Live rows
  // carry the real ids; SAMPLE_CATALOG_ROWS carries synthetic ones (a submit
  // over the fixture is expected to 404 at the route's authorization gate).
  vaultProjectId: string
  tracks: { id: string; title: string }[]
}

type FilterKey = 'Vocals' | 'Mood' | 'Dynamics' | 'Energy' | 'Length' | 'Instruments' | 'Genres' | 'Rights'

const FILTER_OPTIONS: Record<FilterKey, string[]> = {
  Vocals: ['Instrumental', 'Vocal', 'Either'],
  Mood: ['Cinematic', 'Hopeful', 'Driving', 'Warm', 'Pensive'],
  Dynamics: ['Builds', 'Steady', 'Two peaks', 'Fades'],
  Energy: ['Low', 'Low-Medium', 'Medium', 'Medium-High', 'High'],
  Length: ['Under 1:00', '1:00–2:30', '2:30–4:00', 'Over 4:00'],
  Instruments: ['Piano', 'Strings', 'Guitar', 'Synth', 'Brass'],
  Genres: ['Alt-Pop', 'Electronic', 'Soul', 'Folk', 'Indie Rock', 'Cinematic', 'Jazz', 'Acoustic', 'Ambient', 'Synthwave', 'Downtempo', 'Singer-Songwriter', 'Alternative', 'Pop'],
  Rights: ['Rights ready', 'Partial', 'Contact required'],
}
const FILTER_KEYS = Object.keys(FILTER_OPTIONS) as FilterKey[]
const SORTS = ['Best match', 'Newest', 'Most licensed', 'Shortest first'] as const

const RIGHTS_LABEL: Record<CatalogRights, string> = { ok: 'Rights ready', part: 'Partial rights', req: 'Contact required' }
const RIGHTS_FILTER_LABEL: Record<CatalogRights, string> = { ok: 'Rights ready', part: 'Partial', req: 'Contact required' }
const DYN_LABEL: Record<Dynamics, string> = { build: 'Builds', steady: 'Steady', twin: 'Two peaks', peak: 'Two peaks', fade: 'Fades' }

const MEDIA = ['All media', 'Digital / online', 'Broadcast', 'Theatrical', 'Internal / non-broadcast']
// Term select renders these labels but STORES the integer month count the
// route's z.number().int() term_months expects (22-02 Task 3).
const TERM_OPTIONS = [
  { label: '1 year', months: 12 },
  { label: '2 years', months: 24 },
  { label: '5 years', months: 60 },
  { label: 'In perpetuity', months: 1200 },
] as const

function lenToSeconds(len: string): number {
  const [m, s] = len.split(':').map(Number)
  return (m || 0) * 60 + (s || 0)
}
function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
function lengthBucket(len: string): string {
  const s = lenToSeconds(len)
  if (s < 60) return 'Under 1:00'
  if (s <= 150) return '1:00–2:30'
  if (s <= 240) return '2:30–4:00'
  return 'Over 4:00'
}

function rowMatches(row: CatalogRow, sel: Record<FilterKey, Set<string>>, q: string): boolean {
  const query = q.trim().toLowerCase()
  if (query && !`${row.title} ${row.artist}`.toLowerCase().includes(query)) return false
  if (sel.Vocals.size && !(sel.Vocals.has(row.vocal) || sel.Vocals.has('Either'))) return false
  if (sel.Mood.size && !sel.Mood.has(row.mood)) return false
  if (sel.Dynamics.size && !sel.Dynamics.has(DYN_LABEL[row.dynamics])) return false
  if (sel.Energy.size && !sel.Energy.has(row.energy)) return false
  if (sel.Length.size && !sel.Length.has(lengthBucket(row.length))) return false
  if (sel.Instruments.size && !row.instruments.some(i => sel.Instruments.has(i))) return false
  if (sel.Genres.size && ![...sel.Genres].some(g => row.genres.includes(g))) return false
  if (sel.Rights.size && !sel.Rights.has(RIGHTS_FILTER_LABEL[row.rights])) return false
  return true
}

function DynGlyph({ shape }: { shape: Dynamics }) {
  const f = '#DED7FB'
  const paths: Record<Dynamics, JSX.Element> = {
    twin: (<><path d="M0 26 22 7l22 19z" fill={f} /><path d="M56 26 78 4l22 22z" fill={f} /></>),
    steady: <rect x="0" y="18" width="100" height="8" rx="3" fill={f} />,
    build: <path d="M0 26 34 22 68 10 100 0v26z" fill={f} />,
    fade: (<><path d="M0 4 30 6l34 12 36 8v-4L64 14 30 2 0 0z" fill={f} /><rect x="0" y="20" width="100" height="6" rx="3" fill={f} /></>),
    peak: (<><path d="M0 26 20 16l18 10z" fill={f} /><path d="M44 26 72 2l28 24z" fill={f} /></>),
  }
  return (<svg className="dyn" width="104" height="26" viewBox="0 0 104 26" aria-hidden>{paths[shape]}</svg>)
}

function RightsBadge({ rights }: { rights: CatalogRights }) {
  const icon = rights === 'ok'
    ? (<><path d="M12 3 4 7v6c0 5 3.4 7.4 8 8 4.6-.6 8-3 8-8V7z" /><path d="m9 12 2 2 4-4" /></>)
    : rights === 'part'
      ? (<><circle cx="12" cy="12" r="9" /><path d="M12 3v18a9 9 0 0 0 0-18" /></>)
      : (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 8 9 5 9-5" /></>)
  return (<span className={`rights ${rights}`}><svg className="icn" viewBox="0 0 24 24">{icon}</svg>{RIGHTS_LABEL[rights]}</span>)
}

const Chevron = () => (<svg className="icn" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>)
const Tick = () => (<svg className="icn tick" viewBox="0 0 24 24"><path d="m20 6-11 11-5-5" /></svg>)
const Check = () => (<svg viewBox="0 0 24 24"><path d="m20 6-11 11-5-5" /></svg>)
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="fld"><label>{label}</label>{children}</div>
)

export function CatalogBrowserLight({
  rows,
  isPublic = false,
  embedded = false,
}: {
  rows: CatalogRow[]
  isPublic?: boolean
  // 22-03: when true, the surrounding app/(buyer-portal)/layout.tsx has
  // already mounted the shared BuyerTopNav + injected FNBL_CSS once for the
  // whole portal — this component must not draw a second, competing header
  // or re-inject the base tokens. The non-embedded branch (isPublic) stays
  // fully self-contained for the currently-unused public route.
  embedded?: boolean
}) {
  const emptySel = () => FILTER_KEYS.reduce((a, k) => ({ ...a, [k]: new Set<string>() }), {} as Record<FilterKey, Set<string>>)

  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Record<FilterKey, Set<string>>>(emptySel)
  const [sort, setSort] = useState<(typeof SORTS)[number]>('Best match')
  const [open, setOpen] = useState<string | null>(null)

  // ── slice 2b: player + modal + toast state ──
  const [playId, setPlayId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0) // seconds
  const [favs, setFavs] = useState<Set<string>>(new Set())
  const [modalId, setModalId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // 23-07: gates any engagement (License / shortlist) — and the isPublic
  // Login button — behind the Login/Register modal for a logged-out
  // visitor. Browsing + simulated playback stay ungated.
  const [authModalOpen, setAuthModalOpen] = useState(false)
  // Header burger menu (guest item set — signed-in variant is a later step).
  const [menuOpen, setMenuOpen] = useState(false)
  // Which view the auth modal opens on, so menu items can target login /
  // register / "talk to a sales rep" directly.
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login')
  const [authSource, setAuthSource] = useState<'register' | 'sales_rep'>('register')
  const router = useRouter()
  const openAuth = (tab: 'login' | 'register', src: 'register' | 'sales_rep' = 'register') => {
    setAuthTab(tab)
    setAuthSource(src)
    setMenuOpen(false)
    setAuthModalOpen(true)
  }
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── slice 2c: License modal form state (wired to buildRequestBody) ──
  const [muUsage, setMuUsage] = useState<UsageType | ''>('')
  const [muTerritory, setMuTerritory] = useState<Territory | ''>('')
  const [muTermMonths, setMuTermMonths] = useState<number>(TERM_OPTIONS[0].months)
  const [muExclusivity, setMuExclusivity] = useState(false)
  const [muOffer, setMuOffer] = useState('')
  const [muMedia, setMuMedia] = useState(MEDIA[0])
  const [muMessage, setMuMessage] = useState('')
  const [muTrackIds, setMuTrackIds] = useState<string[]>([])
  const [muSubmitting, setMuSubmitting] = useState(false)
  const [muError, setMuError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const out = rows.filter(r => rowMatches(r, sel, q))
    if (sort === 'Shortest first') out.sort((a, b) => lenToSeconds(a.length) - lenToSeconds(b.length))
    else if (sort === 'Newest') out.reverse()
    return out
  }, [rows, sel, q, sort])

  const playRow = playId ? rows.find(r => r.id === playId) ?? null : null
  const modalRow = modalId ? rows.find(r => r.id === modalId) ?? null : null
  const dur = playRow ? lenToSeconds(playRow.length) : 0

  // simulated playhead
  useEffect(() => {
    if (!playing || !playRow) return
    const t = setInterval(() => {
      setProgress(p => {
        if (p + 1 >= dur) { setPlaying(false); return dur }
        return p + 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [playing, playRow, dur])

  // Reset the License modal's form whenever a new row is opened, and
  // default-select the track when a row has exactly one.
  useEffect(() => {
    if (!modalId) return
    const row = rows.find(r => r.id === modalId) ?? null
    setMuUsage('')
    setMuTerritory('')
    setMuTermMonths(TERM_OPTIONS[0].months)
    setMuExclusivity(false)
    setMuOffer('')
    setMuMedia(MEDIA[0])
    setMuMessage('')
    setMuTrackIds(row && row.tracks.length === 1 ? [row.tracks[0].id] : [])
    setMuError(null)
  }, [modalId, rows])

  function play(id: string) {
    if (id === playId) { setPlaying(p => !p); return }
    setPlayId(id); setProgress(0); setPlaying(true)
  }
  function step(delta: number) {
    if (!playRow) return
    const idx = rows.findIndex(r => r.id === playRow.id)
    const next = rows[(idx + delta + rows.length) % rows.length]
    setPlayId(next.id); setProgress(0); setPlaying(true)
  }
  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const pct = (e.clientX - el.getBoundingClientRect().left) / el.offsetWidth
    setProgress(Math.max(0, Math.min(1, pct)) * dur)
  }
  function toggleFav(id: string) {
    setFavs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }
  // ── slice 2c: real POST /api/buyer/requests via buildRequestBody ──
  // The route derives org from the session and re-authorizes the target
  // project + tracks server-side (T-22-02-01/02) — this handler only builds
  // and sends the D-07 dimensions, never trusts the row, and never adds a
  // server-owned field to the payload.
  async function submitRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!modalRow) return

    const result = buildRequestBody(
      {
        usageType: muUsage,
        territory: muTerritory,
        termMonths: muTermMonths,
        exclusivity: muExclusivity,
        offer: muOffer,
        media: muMedia,
        message: muMessage,
        trackIds: muTrackIds,
      },
      { vaultProjectId: modalRow.vaultProjectId }
    )
    if (!result.ok) {
      setMuError(result.error)
      return
    }

    setMuSubmitting(true)
    setMuError(null)
    try {
      const res = await fetch('/api/buyer/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.body),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: { id: string }; error?: string }
      if (!res.ok || !json.data) {
        setMuError(json.error ?? 'Failed to submit request. Please check your entries and try again.')
        return
      }
      const successMessage = `License request sent to ${modalRow.artist || 'the artist'}`
      setModalId(null)
      showToast(successMessage)
    } finally {
      setMuSubmitting(false)
    }
  }

  function toggle(key: FilterKey, value: string) {
    setSel(prev => { const n = new Set(prev[key]); n.has(value) ? n.delete(value) : n.add(value); return { ...prev, [key]: n } })
  }
  function resetKey(key: FilterKey) { setSel(prev => ({ ...prev, [key]: new Set<string>() })) }
  function removeChip(key: FilterKey, value: string) {
    setSel(prev => { const n = new Set(prev[key]); n.delete(value); return { ...prev, [key]: n } })
  }
  function clearAll() { setSel(emptySel()); setQ('') }

  const activeChips = FILTER_KEYS.flatMap(k => [...sel[k]].map(v => ({ key: k, value: v })))
  const activeCount = activeChips.length + (q.trim() ? 1 : 0)

  return (
    <div className={embedded ? undefined : 'fnbl'} onClick={() => { setOpen(null); setMenuOpen(false) }}>
      <style>{embedded ? CSS : `${FNBL_CSS}${CSS}`}</style>

      {!embedded && (
        <header>
          <div className="bar">
            <nav aria-label="Primary">
              <button className="navb" type="button" onClick={() => { clearAll(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><svg className="icn" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg><span>Browse</span></button>
              {isPublic && <button className="navb" type="button" onClick={() => openAuth('login')}><svg className="icn" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg><span>Login</span></button>}
            </nav>
            <div className="lock">
              <div className="mark">
                <svg className="cratelogo" viewBox="0 0 48 48" role="img" aria-label="The Crate"><defs><linearGradient id="cratemk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6D5AE0" /><stop offset="1" stopColor="#B22BC9" /></linearGradient></defs><rect x="11.4" y="8.6" width="12.2" height="15.4" rx="1.3" transform="rotate(-9 17.5 16.3)" fill="#fff" stroke="url(#cratemk)" strokeWidth="1.9" opacity=".52" /><rect x="24.4" y="8.6" width="12.2" height="15.4" rx="1.3" transform="rotate(9 30.5 16.3)" fill="#fff" stroke="url(#cratemk)" strokeWidth="1.9" opacity=".72" /><rect x="17.7" y="5.4" width="12.6" height="18.6" rx="1.3" fill="#fff" stroke="url(#cratemk)" strokeWidth="1.9" /><circle cx="24" cy="13.4" r="4.2" fill="none" stroke="url(#cratemk)" strokeWidth="1.9" /><circle cx="24" cy="13.4" r="1.5" fill="none" stroke="url(#cratemk)" strokeWidth="1.5" opacity=".65" /><rect x="3.4" y="23.2" width="41.2" height="4.3" rx="2.15" fill="url(#cratemk)" /><path d="M6.9 27.5h34.2l-2.6 11.1A2.9 2.9 0 0 1 35.7 41H12.3a2.9 2.9 0 0 1-2.8-2.4z" fill="url(#cratemk)" /><rect x="10.4" y="31.3" width="27.2" height="2" rx="1" fill="#fff" /><rect x="18.6" y="35.3" width="10.8" height="2.9" rx="1.45" fill="#fff" /></svg>
                <div className="wordmark"><span className="the gtext">The</span><span className="gtext">Crate</span></div>
              </div>
              <div className="powered"><i />powered by <b>Funūn</b><i /></div>
            </div>
            <div className="right">
              {!isPublic && <button className="iconb" type="button" aria-label="License queue" onClick={() => router.push('/sync/requests')}><svg className="icn" viewBox="0 0 24 24"><path d="M6.5 7h14l-1.5 8.6a2 2 0 0 1-2 1.65H9.9a2 2 0 0 1-1.96-1.6L6.5 7z" /><path d="M6.5 7 5.6 3.4H2.8" /><circle cx="10" cy="20.4" r="1.5" /><circle cx="18" cy="20.4" r="1.5" /></svg><span className="cnt">0</span></button>}
              <div className="menuwrap">
                <button className="iconb" type="button" aria-label="Menu" aria-haspopup="true" aria-expanded={menuOpen} onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}><svg className="icn hamb" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
              <div className={`menu ${menuOpen ? 'open' : ''}`} role="menu" onClick={e => e.stopPropagation()}>
                {isPublic && (
                  <>
                    <button className="mi" type="button" role="menuitem" onClick={() => openAuth('register')}><svg className="icn" viewBox="0 0 24 24"><circle cx="9" cy="8" r="4" /><path d="M2.5 20a6.5 6.5 0 0 1 11-4.7" /><path d="M18 13v6M15 16h6" /></svg>Register</button>
                    <button className="mi" type="button" role="menuitem" onClick={() => openAuth('login')}><svg className="icn" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>Login</button>
                    <button className="mi" type="button" role="menuitem" onClick={() => openAuth('register', 'sales_rep')}><svg className="icn" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" /></svg>Contact a sales rep</button>
                    <div className="msep" />
                  </>
                )}
                <a className="mi" href="/help" role="menuitem" onClick={() => setMenuOpen(false)}><svg className="icn" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.6 9.2a2.5 2.5 0 0 1 4.6 1.3c0 1.6-2.2 2-2.2 3.6" /><path d="M12 17.2h.01" /></svg>Help / How licensing works</a>
                <a className="mi" href="/blog" role="menuitem" onClick={() => setMenuOpen(false)}><svg className="icn" viewBox="0 0 24 24"><path d="M5 3.5h9L19 8v12.5H5z" /><path d="M9 12h6M9 15.5h6M9 8.5h3" /></svg>Blog</a>
              </div>
            </div>
          </div>
          </div>
          <p className="tagline">Dig for your sound — every track we represent, in one place.</p>
        </header>
      )}

      <div className="wrap">
        <div className="tabs" role="tablist">
          <button className="tab on" type="button">Browse &amp; Search</button>
          <button className="tab" type="button">Similarity Search</button>
          <button className="tab" type="button">Funūn Playlists</button>
          <button className="tab dim" type="button">My Playlists</button>
          <button className="tab dim" type="button">My Favorites</button>
        </div>

        <div className="sbar">
          <div className="sfield">
            <svg className="icn" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by song, artist or lyrics" aria-label="Search the catalogue" />
          </div>
          <div className="scope"><button className="scopeb" type="button"><span>All</span><svg className="icn" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg></button></div>
        </div>

        <div className="filters">
          {FILTER_KEYS.map(key => {
            const count = sel[key].size
            return (
              <div className="fdd" key={key}>
                <button className={`fbtn ${count ? 'on' : ''}`} type="button" onClick={e => { e.stopPropagation(); setOpen(o => (o === key ? null : key)) }}>
                  {key}{count > 0 && <span className="n">{count}</span>}<Chevron />
                </button>
                <div className={`panel ${open === key ? 'open' : ''}`} style={{ left: 0, top: 'calc(100% + 10px)' }} onClick={e => e.stopPropagation()}>
                  <div className="ph">{key}</div>
                  {FILTER_OPTIONS[key].map(opt => (
                    <button key={opt} className={`o ${sel[key].has(opt) ? 'on' : ''}`} type="button" onClick={() => toggle(key, opt)}>
                      <span className="cbx"><Check /></span>{opt}
                    </button>
                  ))}
                  <div className="foot">
                    <button className="rs" type="button" onClick={() => resetKey(key)}>Reset</button>
                    <button className="ap" type="button" onClick={() => setOpen(null)}>Apply</button>
                  </div>
                </div>
              </div>
            )
          })}
          <div className="fdd">
            <button className="fbtn" type="button" onClick={e => { e.stopPropagation(); setOpen(o => (o === 'Sort' ? null : 'Sort')) }}>Sort by<Chevron /></button>
            <div className={`panel ${open === 'Sort' ? 'open' : ''}`} style={{ right: 0, top: 'calc(100% + 10px)' }} onClick={e => e.stopPropagation()}>
              <div className="ph">Sort by</div>
              {SORTS.map(s => (
                <button key={s} className={`o ${sort === s ? 'on' : ''}`} type="button" onClick={() => { setSort(s); setOpen(null) }}>{s}<Tick /></button>
              ))}
            </div>
          </div>
        </div>

        {activeChips.length > 0 && (
          <div className="chips">
            <span className="lbl">Active</span>
            {activeChips.map(({ key, value }) => (
              <span className="chip" key={`${key}:${value}`}>
                <em>{key}:</em> {value}
                <button type="button" aria-label={`Remove ${value}`} onClick={() => removeChip(key, value)}><svg className="icn" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
              </span>
            ))}
            <button className="clearall" type="button" onClick={clearAll}>Clear all</button>
          </div>
        )}

        <div className="rmeta">
          <span className="n">{filtered.length.toLocaleString()} tracks</span>
          <span className="s">Sorted by {sort}</span>
          {activeCount > 0 && (
            <span className="fa"><svg className="icn" viewBox="0 0 24 24"><path d="M3 5h18l-7 8v6l-4-2v-4z" /></svg>{activeCount} filter{activeCount === 1 ? '' : 's'} active</span>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="empty show">
            <div className="ei"><svg className="icn" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M8 11h6" /></svg></div>
            <h3>No tracks match those filters</h3>
            <p>Nothing in the catalogue fits every filter you have applied. Try removing one, or widen the mood and energy range.</p>
            <button className="cta" type="button" onClick={clearAll}>Clear all filters</button>
          </div>
        ) : (
          <div className="cols" style={{ marginTop: 8 }}>
            {filtered.map(row => (
              <div className={`trow ${playId === row.id ? 'playing' : ''}`} key={row.id}>
                <div className="song">
                  <div className="art" style={row.coverUrl ? { backgroundImage: `url('${row.coverUrl}')` } : { background: row.gradient }}>
                    <button className="pb" type="button" aria-label={playId === row.id && playing ? `Pause ${row.title}` : `Play ${row.title}`} onClick={() => play(row.id)}>
                      {playId === row.id && playing
                        ? (<svg viewBox="0 0 24 24"><path d="M8 5h3.2v14H8zM12.8 5H16v14h-3.2z" /></svg>)
                        : (<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>)}
                    </button>
                  </div>
                  <div className="idt">
                    <div className="sname">{row.title}</div>
                    <div className="sby">by <b>{row.artist}</b></div>
                    <RightsBadge rights={row.rights} />
                  </div>
                </div>
                <div className="meta">
                  <div className="gen">{row.genres}</div>
                  <div className="dyn"><DynGlyph shape={row.dynamics} /></div>
                  <div className="energy">{row.energy}</div>
                  <div className="len">{row.length}</div>
                  <button className="vers" type="button">+ {row.versions}</button>
                </div>
                <div className="acts">
                  <button className="kebab" type="button" aria-label={`More options for ${row.title}`}><svg className="icn" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /></svg></button>
                  <button className="lic" type="button" onClick={() => (isPublic ? setAuthModalOpen(true) : setModalId(row.id))}>License</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {filtered.length > 0 && <button className="loadmore" type="button">Load more tracks</button>}
      </div>

      {/* ── slice 2b: sticky mini player ── */}
      {playRow && (
        <div className={`mini up`} role="region" aria-label="Player">
          <div className="in">
            <div className="ma" style={playRow.coverUrl ? { backgroundImage: `url('${playRow.coverUrl}')` } : { background: playRow.gradient }} />
            <div className="mi"><div className="mt">{playRow.title}</div><div className="mb">{playRow.artist}</div></div>
            <div className="mctl">
              <button className="sk" type="button" aria-label="Previous" onClick={() => step(-1)}><svg viewBox="0 0 24 24"><path d="M18 5v14l-11-7zM6 5h2v14H6z" /></svg></button>
              <button className="mplay" type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(p => !p)}>
                {playing ? (<svg viewBox="0 0 24 24"><path d="M8 5h3.2v14H8zM12.8 5H16v14h-3.2z" /></svg>) : (<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>)}
              </button>
              <button className="sk" type="button" aria-label="Next" onClick={() => step(1)}><svg viewBox="0 0 24 24"><path d="M6 5v14l11-7zM16 5h2v14h-2z" /></svg></button>
            </div>
            <div className="mprog">
              <span>{fmt(progress)}</span>
              <div className="mtrack" onClick={seek}><div className="f" style={{ width: `${dur ? (progress / dur) * 100 : 0}%` }} /></div>
              <span>{playRow.length}</span>
            </div>
            <div className="mvol"><svg className="icn" viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M16 9a4 4 0 0 1 0 6" /></svg><div className="vt"><div className="f" /></div></div>
            <div className="mr">
              <button className={`hbtn ${favs.has(playRow.id) ? 'on' : ''}`} type="button" aria-label="Add to favorites" onClick={() => (isPublic ? setAuthModalOpen(true) : toggleFav(playRow.id))}>
                <svg className="icn" viewBox="0 0 24 24"><path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.3a5 5 0 0 0 0-7.1z" /></svg>
              </button>
              <button className="mlic" type="button" onClick={() => (isPublic ? setAuthModalOpen(true) : setModalId(playRow.id))}>License</button>
            </div>
          </div>
        </div>
      )}

      {/* ── slice 2b: License request modal ── */}
      {modalRow && (
        <div className="scrim open" onClick={() => setModalId(null)}>
          <form className="modal" onClick={e => e.stopPropagation()} onSubmit={submitRequest}>
            <div className="mh">
              <div className="ma2" style={modalRow.coverUrl ? { backgroundImage: `url('${modalRow.coverUrl}')` } : { background: modalRow.gradient }} />
              <div><h2>Request a license</h2><p>{modalRow.title} · by {modalRow.artist}</p></div>
              <button className="x" type="button" aria-label="Close" onClick={() => setModalId(null)}><svg className="icn" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <div className="mb2">
              <p className="lead">Tell the artist how you&rsquo;d use it. Within their pre-cleared terms this moves fast; anything below their floor routes to a quick negotiation.</p>
              <Field label="Tracks">
                <div className="trklist">
                  {modalRow.tracks.map(t => (
                    <label className="trk" key={t.id}>
                      <input
                        type="checkbox"
                        checked={muTrackIds.includes(t.id)}
                        onChange={() =>
                          setMuTrackIds(prev => (prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]))
                        }
                      />
                      {t.title}
                    </label>
                  ))}
                  {modalRow.tracks.length === 0 && <p className="note">This project has no tracks to request.</p>}
                </div>
              </Field>
              <div className="f2">
                <Field label="Use type">
                  <select value={muUsage} onChange={e => setMuUsage(e.target.value as UsageType | '')}>
                    <option value="">Select a use type</option>
                    {USAGE_TYPE_VALUES.map(v => (
                      <option key={v} value={v}>{USAGE_TYPE_LABELS[v]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Media">
                  <select value={muMedia} onChange={e => setMuMedia(e.target.value)}>
                    {MEDIA.map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Term">
                  <select value={muTermMonths} onChange={e => setMuTermMonths(Number(e.target.value))}>
                    {TERM_OPTIONS.map(t => (
                      <option key={t.months} value={t.months}>{t.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Territory">
                  <select value={muTerritory} onChange={e => setMuTerritory(e.target.value as Territory | '')}>
                    <option value="">Select a territory</option>
                    {TERRITORY_VALUES.map(v => (
                      <option key={v} value={v}>{TERRITORY_LABELS[v]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Exclusivity">
                  <select value={String(muExclusivity)} onChange={e => setMuExclusivity(e.target.value === 'true')}>
                    <option value="false">Non-exclusive</option>
                    <option value="true">Exclusive</option>
                  </select>
                </Field>
                <Field label="Offer (gross fee)">
                  <input type="text" value={muOffer} onChange={e => setMuOffer(e.target.value)} placeholder="$4,500" />
                </Field>
              </div>
              <Field label="Message">
                <textarea
                  rows={3}
                  value={muMessage}
                  onChange={e => setMuMessage(e.target.value)}
                  placeholder="Placing in a Q4 indie feature trailer — 30-second hero cut…"
                />
              </Field>
              {muError && <p className="err">{muError}</p>}
            </div>
            <div className="mf">
              <span className="note">You&rsquo;ll get a confirmation and can track this in your requests.</span>
              <button className="cancel" type="button" onClick={() => setModalId(null)}>Cancel</button>
              <button className="send" type="submit" disabled={muSubmitting}>{muSubmitting ? 'Sending…' : 'Send request'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ── slice 2b: toast ── */}
      <div className={`toast ${toast ? 'show' : ''}`} role="status">
        <svg className="icn" viewBox="0 0 24 24"><path d="M12 3 4 7v6c0 5 3.4 7.4 8 8 4.6-.6 8-3 8-8V7z" /><path d="m9 12 2 2 4-4" /></svg>
        {toast}
      </div>

      {/* 23-07: Login/Register modal — the isPublic engagement gate */}
      <LoginRegisterModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} initialTab={authTab} initialSource={authSource} />
    </div>
  )
}

// Claude Design's light catalogue CSS, scoped under `.fnbl`. The base
// token block + `.fnbl *`/`.fnbl .icn`/`.fnbl .gtext` shared rules moved to
// components/buyer/fnbl-theme.ts (FNBL_CSS, 22-03) so the whole buyer
// portal single-sources them; everything catalogue-specific stays here.
const CSS = `
.fnbl .wrap{max-width:1380px;margin:0 auto;padding:0 32px;}
.fnbl button{font-family:inherit;cursor:pointer;}
.fnbl{--gut:40px;}
.fnbl .bar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:24px;padding:22px var(--gut) 0;}
.fnbl .bar nav{display:flex;align-items:center;gap:8px;}
.fnbl .bar .right{justify-self:end;display:flex;align-items:center;gap:8px;}
.fnbl .navb{display:inline-flex;align-items:center;gap:10px;background:none;border:none;border-radius:10px;padding:11px 14px;font-size:13.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--indigo);}
.fnbl .navb svg{width:19px;height:19px;stroke-width:2;}
.fnbl .navb:hover{background:var(--wash);color:var(--fuchsia);}
.fnbl .iconb{position:relative;width:44px;height:44px;border-radius:11px;border:none;background:none;color:var(--indigo);display:flex;align-items:center;justify-content:center;}
.fnbl .iconb svg{width:21px;height:21px;stroke-width:2;}
.fnbl .iconb .hamb{stroke-width:2.6;}
.fnbl .iconb:hover{background:var(--wash);color:var(--fuchsia);}
.fnbl .iconb .cnt{position:absolute;top:3px;right:2px;min-width:18px;height:18px;border-radius:999px;background:var(--grad);color:#fff;font-size:10.5px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 5px;border:2px solid var(--page);}
.fnbl .lock{display:flex;flex-direction:column;align-items:center;gap:0;}
.fnbl .mark{display:flex;align-items:center;gap:13px;}
.fnbl .cratelogo{width:44px;height:44px;flex:none;display:block;}
.fnbl .wordmark{font-size:33px;font-weight:900;letter-spacing:-.022em;line-height:1;white-space:nowrap;}
.fnbl .wordmark .the{font-size:16px;font-weight:800;letter-spacing:.24em;text-transform:uppercase;vertical-align:5px;margin-right:6px;}
.fnbl .powered{display:flex;align-items:center;gap:7px;margin-top:9px;font-size:10.5px;font-weight:700;letter-spacing:.19em;text-transform:uppercase;color:var(--ink-3);white-space:nowrap;}
.fnbl .powered i{display:block;width:16px;height:1px;background:var(--line-2);}
.fnbl .powered b{font-weight:900;letter-spacing:.13em;}
.fnbl .tagline{margin:16px auto 0;text-align:center;font-size:16.5px;color:var(--ink-2);max-width:52ch;line-height:1.5;padding:0 var(--gut);}
@media (max-width:860px){
  .fnbl{--gut:24px;}
  .fnbl .bar{grid-template-columns:auto 1fr auto;}
  .fnbl .lock{align-items:flex-start;}
  .fnbl .bar nav .navb span{display:none;}
  .fnbl .bar nav .navb{padding:11px;}
  .fnbl .wordmark{font-size:26px;}
  .fnbl .cratelogo{width:36px;height:36px;}
  .fnbl .tagline{text-align:left;margin-left:0;font-size:15px;}
}
.fnbl .menuwrap{position:relative;display:flex;align-items:center;}
.fnbl .menu{position:absolute;right:0;top:calc(100% + 14px);z-index:80;background:var(--page);border:1px solid var(--line);border-radius:16px;padding:8px;box-shadow:0 26px 60px -18px rgba(36,26,77,.28);min-width:252px;display:none;}
.fnbl .menu.open{display:block;}
.fnbl .menu .mi{display:flex;align-items:center;gap:13px;padding:13px 14px;border-radius:11px;font-size:15px;font-weight:600;color:var(--ink);background:none;border:none;width:100%;text-align:left;text-decoration:none;white-space:nowrap;}
.fnbl .menu .mi:hover{background:var(--wash);color:var(--indigo);}
.fnbl .menu .mi svg{width:20px;height:20px;stroke-width:1.9;color:var(--indigo);flex:none;}
.fnbl .menu .msep{height:1px;background:var(--line);margin:7px 10px;}
.fnbl .tabs{display:flex;background:var(--wash);border-radius:999px;padding:5px;margin:38px auto 0;gap:2px;}
.fnbl .tab{flex:1;border:none;background:none;border-radius:999px;padding:14px 12px;font-size:13px;font-weight:800;letter-spacing:.075em;text-transform:uppercase;color:var(--indigo);white-space:nowrap;}
.fnbl .tab:hover{background:var(--wash-2);}
.fnbl .tab.on{background:var(--grad);color:#fff;box-shadow:0 8px 20px -9px rgba(109,90,224,.55);}
.fnbl .tab.dim{color:#9C95BE;}
.fnbl .sbar{display:flex;margin-top:22px;background:var(--wash);border-radius:999px;padding:6px;gap:6px;transition:background .2s;}
.fnbl .sbar:focus-within{background:var(--wash-2);}
.fnbl .sfield{flex:1;display:flex;align-items:center;gap:14px;padding-left:22px;min-width:0;}
.fnbl .sfield>svg{width:24px;height:24px;flex:none;color:var(--indigo);stroke-width:2.1;}
.fnbl .sfield input{flex:1;min-width:0;background:none;border:none;outline:none;font:500 19px/1 'Inter',system-ui,sans-serif;color:var(--ink);padding:18px 0;}
.fnbl .sfield input::placeholder{color:var(--ink-3);}
.fnbl .scope{position:relative;flex:none;}
.fnbl .scopeb{height:100%;display:flex;align-items:center;gap:12px;background:var(--grad);border:none;border-radius:999px;padding:0 26px;color:#fff;font-size:17px;font-weight:800;box-shadow:0 10px 24px -10px rgba(109,90,224,.55);}
.fnbl .scopeb svg{width:17px;height:17px;stroke:#fff;stroke-width:3;}
.fnbl .filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(124px,1fr));gap:10px;margin-top:26px;}
.fnbl .fdd{position:relative;min-width:0;}
.fnbl .fbtn{width:100%;display:flex;align-items:center;justify-content:center;gap:6px;background:#fff;border:1.5px solid var(--line-2);border-radius:999px;padding:13px 8px;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--indigo);white-space:nowrap;min-width:0;}
.fnbl .fbtn:hover{border-color:var(--indigo);background:var(--wash);}
.fnbl .fbtn.on{background:var(--grad);border-color:transparent;color:#fff;}
.fnbl .fbtn .n{font-size:10.5px;font-weight:800;background:rgba(255,255,255,.3);border-radius:999px;padding:2px 6px;}
.fnbl .fbtn svg{width:12px;height:12px;stroke-width:3;opacity:.75;flex:none;}
.fnbl .panel{position:absolute;z-index:70;background:#fff;border:1px solid var(--line);border-radius:16px;padding:10px;box-shadow:0 26px 60px -18px rgba(36,26,77,.28);display:none;min-width:230px;}
.fnbl .panel.open{display:block;}
.fnbl .panel .ph{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;font-weight:800;color:var(--ink-3);padding:8px 12px 10px;}
.fnbl .panel .o{display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:10px;font-size:15px;font-weight:600;color:var(--ink);background:none;border:none;width:100%;text-align:left;}
.fnbl .panel .o:hover{background:var(--wash);}
.fnbl .panel .o .tick{width:18px;height:18px;flex:none;color:var(--indigo);opacity:0;margin-left:auto;}
.fnbl .panel .o.on .tick{opacity:1;}
.fnbl .panel .o.on{color:var(--indigo);font-weight:700;}
.fnbl .cbx{width:19px;height:19px;border-radius:5px;border:1.6px solid var(--line-2);flex:none;display:flex;align-items:center;justify-content:center;background:#fff;}
.fnbl .cbx svg{width:12px;height:12px;stroke:#fff;stroke-width:3.4;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0;}
.fnbl .o.on .cbx{background:var(--grad);border-color:transparent;}
.fnbl .o.on .cbx svg{opacity:1;}
.fnbl .panel .foot{display:flex;gap:8px;padding:10px 6px 4px;margin-top:6px;border-top:1px solid var(--line);}
.fnbl .panel .foot button{flex:1;border-radius:9px;padding:11px;font-size:13.5px;font-weight:800;border:none;}
.fnbl .panel .foot .ap{background:var(--grad);color:#fff;}
.fnbl .panel .foot .rs{background:var(--wash);color:var(--indigo);}
.fnbl .chips{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px;margin-top:24px;}
.fnbl .chips .lbl{font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:800;color:var(--ink-3);}
.fnbl .chip{display:inline-flex;align-items:center;gap:9px;background:var(--wash);border:1px solid var(--line);border-radius:999px;padding:8px 9px 8px 15px;font-size:13.5px;font-weight:700;color:var(--ink);white-space:nowrap;}
.fnbl .chip em{font-style:normal;color:var(--ink-2);font-weight:600;}
.fnbl .chip button{width:20px;height:20px;border-radius:50%;border:none;background:var(--line);color:var(--ink-2);display:flex;align-items:center;justify-content:center;padding:0;}
.fnbl .chip button:hover{background:var(--req-fg);color:#fff;}
.fnbl .chip button svg{width:11px;height:11px;stroke-width:3.4;}
.fnbl .clearall{background:none;border:none;color:var(--indigo);font-size:13.5px;font-weight:800;text-decoration:underline;text-underline-offset:3px;}
.fnbl .clearall:hover{color:var(--fuchsia);}
.fnbl .rmeta{display:flex;align-items:baseline;gap:14px;margin-top:40px;}
.fnbl .rmeta .n{font-size:21px;font-weight:800;}
.fnbl .rmeta .s{font-size:15px;color:var(--ink-2);font-weight:500;}
.fnbl .rmeta .fa{margin-left:auto;display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:800;color:var(--indigo);background:var(--wash);border:1px solid var(--line);border-radius:999px;padding:6px 13px;white-space:nowrap;}
.fnbl .rmeta .fa svg{width:13px;height:13px;stroke-width:2.6;}
.fnbl .cols{margin-top:8px;}
.fnbl .trow{display:flex;align-items:center;gap:20px;padding:16px 6px;border-top:1px solid var(--line);}
.fnbl .idt{min-width:0;}
.fnbl .meta{display:flex;align-items:center;gap:20px;flex:0 1 auto;min-width:0;}
.fnbl .meta .gen{width:170px;line-height:1.35;white-space:normal;}
.fnbl .meta .dyn{width:104px;flex:none;}
.fnbl .meta .energy{width:104px;}
.fnbl .meta .len{width:52px;text-align:right;}
.fnbl .acts{display:flex;align-items:center;gap:8px;flex:0 0 auto;margin-left:auto;}
@media (max-width:1180px){.fnbl .meta .dyn{display:none;}}
@media (max-width:1040px){.fnbl .meta .gen{display:none;}}
@media (max-width:900px){.fnbl .meta .energy{display:none;}}
@media (max-width:940px){.fnbl .tabs{overflow-x:auto;}.fnbl .tab{flex:0 0 auto;}}
@media (max-width:640px){
  .fnbl .cols{margin-top:16px;}
  .fnbl .trow{background:#fff;border:1px solid var(--line);border-radius:14px;padding:15px 16px;margin-bottom:12px;box-shadow:0 6px 18px -13px rgba(36,26,77,.2);}
  .fnbl .trow:hover{background:#fff;}
  .fnbl .art{width:56px;height:56px;}
}
@media (max-width:720px){
  .fnbl .trow{flex-wrap:wrap;gap:12px 16px;}
  .fnbl .song{flex:1 1 100%;}
  .fnbl .meta{order:2;flex:1 1 auto;}
  .fnbl .acts{order:3;flex:0 0 auto;margin-left:auto;}
}
@media (max-width:520px){
  .fnbl .meta .len{display:none;}
  .fnbl .acts{flex:1 1 100%;}
  .fnbl .lic{flex:1 1 auto;width:auto;}
  .fnbl .kebab{margin-left:auto;}
}
.fnbl .trow:hover{background:#FBFAFF;}
.fnbl .trow.playing{background:linear-gradient(90deg,rgba(109,90,224,.09),rgba(178,43,201,.04) 62%,transparent);box-shadow:inset 3px 0 0 0 var(--indigo);}
.fnbl .song{display:flex;align-items:center;gap:18px;min-width:0;flex:1 1 auto;}
.fnbl .song>div:last-child{min-width:0;}
.fnbl .art{width:66px;height:66px;border-radius:6px;flex:none;position:relative;background-size:cover;background-position:center;border:1px solid var(--line);overflow:hidden;}
.fnbl .art .pb{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(36,26,77,.52);border:none;padding:0;opacity:0;transition:opacity .16s;}
.fnbl .art:hover .pb,.fnbl .trow.playing .pb{opacity:1;}
.fnbl .art .pb svg{width:24px;height:24px;fill:#fff;stroke:none;}
.fnbl .sname{font-size:19px;font-weight:600;color:var(--indigo);line-height:1.25;}
.fnbl .trow.playing .sname{font-weight:800;}
.fnbl .sby{font-size:16px;color:var(--ink-2);margin-top:4px;white-space:nowrap;}
.fnbl .sby b{font-weight:600;color:var(--ink-2);}
.fnbl .vers{display:inline-flex;align-items:center;gap:6px;border:1.5px solid var(--line-2);border-radius:999px;padding:8px 17px;font-size:16px;font-weight:600;color:var(--indigo);background:#fff;white-space:nowrap;}
.fnbl .vers:hover{border-color:var(--indigo);background:var(--wash);}
.fnbl .gen{font-size:16px;color:var(--indigo);line-height:1.45;}
.fnbl .dyn{display:block;}
.fnbl .energy{font-size:16px;color:var(--indigo);}
.fnbl .len{font-size:16px;color:var(--indigo);font-variant-numeric:tabular-nums;}
.fnbl .kebab{width:34px;height:34px;border-radius:8px;border:none;background:none;color:var(--ink-3);display:flex;align-items:center;justify-content:center;margin:0 auto;}
.fnbl .kebab:hover{background:var(--wash);color:var(--indigo);}
.fnbl .kebab svg{width:20px;height:20px;}
.fnbl .lic{flex:none;width:124px;border:none;border-radius:10px;background:var(--wash);color:var(--indigo);font-size:14.5px;font-weight:800;padding:13px 0;text-align:center;}
.fnbl .lic:hover{background:var(--grad);color:#fff;box-shadow:0 10px 24px -12px rgba(109,90,224,.6);}
.fnbl .rights{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:800;padding:4px 9px;border-radius:6px;margin-top:9px;letter-spacing:.02em;white-space:nowrap;}
.fnbl .rights svg{width:12px;height:12px;stroke-width:2.4;flex:none;}
.fnbl .rights.ok{color:var(--ok-fg);background:var(--ok-bg);border:1px solid var(--ok-line);}
.fnbl .rights.part{color:var(--part-fg);background:var(--part-bg);border:1px solid var(--part-line);}
.fnbl .rights.req{color:var(--req-fg);background:var(--req-bg);border:1px solid var(--req-line);}
.fnbl .loadmore{display:block;margin:44px auto 0;border:1.5px solid var(--line-2);background:#fff;border-radius:999px;padding:16px 42px;font-size:14.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--indigo);white-space:nowrap;}
.fnbl .loadmore:hover{border-color:var(--indigo);background:var(--wash);}
.fnbl .empty{display:none;flex-direction:column;align-items:center;text-align:center;padding:86px 20px 60px;}
.fnbl .empty.show{display:flex;}
.fnbl .empty .ei{width:70px;height:70px;border-radius:18px;background:var(--wash);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--indigo);margin-bottom:22px;}
.fnbl .empty .ei svg{width:31px;height:31px;stroke-width:1.7;}
.fnbl .empty h3{font-size:24px;font-weight:800;margin:0;}
.fnbl .empty p{font-size:16px;color:var(--ink-2);margin:11px 0 0;line-height:1.55;max-width:48ch;}
.fnbl .empty .cta{margin-top:24px;border:none;border-radius:10px;background:var(--grad);color:#fff;font-size:15px;font-weight:800;padding:15px 26px;}
.fnbl .mini{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--line);box-shadow:0 -14px 40px -18px rgba(36,26,77,.22);z-index:80;transform:translateY(100%);transition:transform .34s cubic-bezier(.22,.61,.36,1);}
.fnbl .mini.up{transform:none;}
.fnbl .mini .in{max-width:1380px;margin:0 auto;padding:16px 32px;display:flex;align-items:center;gap:22px;}
.fnbl .mini .ma{width:56px;height:56px;border-radius:6px;flex:none;background-size:cover;background-position:center;border:1px solid var(--line);}
.fnbl .mini .mi{width:210px;flex:none;min-width:0;}
.fnbl .mini .mt{font-size:16px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fnbl .mini .mb{font-size:14px;color:var(--ink-2);}
.fnbl .mctl{display:flex;align-items:center;gap:16px;flex:none;}
.fnbl .mctl .sk{background:none;border:none;color:var(--indigo);display:flex;align-items:center;justify-content:center;padding:0;}
.fnbl .mctl .sk svg{width:22px;height:22px;fill:currentColor;stroke:none;}
.fnbl .mplay{width:48px;height:48px;border-radius:50%;border:none;background:var(--grad);display:flex;align-items:center;justify-content:center;box-shadow:0 12px 28px -10px rgba(109,90,224,.6);}
.fnbl .mplay svg{width:18px;height:18px;fill:#fff;stroke:none;}
.fnbl .mprog{flex:1;display:flex;align-items:center;gap:14px;font-size:13.5px;color:var(--ink-2);font-variant-numeric:tabular-nums;min-width:90px;}
.fnbl .mtrack{flex:1;height:6px;border-radius:3px;background:var(--wash-2);position:relative;cursor:pointer;}
.fnbl .mtrack .f{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--grad);}
.fnbl .mtrack .f::after{content:"";position:absolute;right:-7px;top:50%;transform:translateY(-50%);width:15px;height:15px;border-radius:50%;background:#fff;border:2px solid var(--indigo);}
.fnbl .mvol{display:flex;align-items:center;gap:10px;color:var(--indigo);flex:none;}
.fnbl .mvol svg{width:20px;height:20px;}
.fnbl .mvol .vt{width:82px;height:6px;border-radius:3px;background:var(--wash-2);position:relative;}
.fnbl .mvol .vt .f{position:absolute;left:0;top:0;bottom:0;width:64%;border-radius:3px;background:var(--indigo);}
.fnbl .mini .mr{display:flex;align-items:center;gap:12px;flex:none;}
.fnbl .hbtn{width:42px;height:42px;border-radius:9px;border:1.5px solid var(--line-2);background:#fff;color:var(--ink-3);display:flex;align-items:center;justify-content:center;}
.fnbl .hbtn:hover{border-color:var(--indigo);color:var(--indigo);}
.fnbl .hbtn.on{color:var(--fuchsia);border-color:var(--fuchsia);background:#FDF0FE;}
.fnbl .hbtn.on svg{fill:var(--fuchsia);}
.fnbl .hbtn svg{width:19px;height:19px;}
.fnbl .mlic{border:none;border-radius:9px;background:var(--grad);color:#fff;font-size:14.5px;font-weight:800;padding:14px 22px;box-shadow:0 12px 28px -12px rgba(109,90,224,.6);}
.fnbl .toast{position:fixed;left:50%;bottom:130px;transform:translate(-50%,18px);background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 20px;display:flex;align-items:center;gap:12px;font-size:14.5px;font-weight:700;color:var(--ink);box-shadow:0 26px 60px -18px rgba(36,26,77,.3);z-index:95;opacity:0;pointer-events:none;transition:opacity .24s,transform .24s;}
.fnbl .toast.show{opacity:1;transform:translate(-50%,0);}
.fnbl .toast svg{width:19px;height:19px;stroke:var(--ok-fg);stroke-width:2.6;fill:none;}
.fnbl .scrim{position:fixed;inset:0;background:rgba(36,26,77,.42);backdrop-filter:blur(3px);z-index:90;display:none;align-items:flex-start;justify-content:center;padding:30px;overflow-y:auto;}
.fnbl .scrim.open{display:flex;}
.fnbl .modal{background:#fff;border-radius:20px;width:100%;max-width:640px;box-shadow:0 50px 110px -30px rgba(36,26,77,.55);overflow:hidden;margin:auto;max-height:calc(100vh - 60px);display:flex;flex-direction:column;}
.fnbl .modal .mh{padding:30px 34px 22px;border-bottom:1px solid var(--line);display:flex;align-items:flex-start;gap:18px;flex:none;}
.fnbl .modal .mh .ma2{width:62px;height:62px;border-radius:8px;background-size:cover;background-position:center;flex:none;border:1px solid var(--line);}
.fnbl .modal .mh h2{margin:0;font-size:23px;font-weight:800;}
.fnbl .modal .mh p{margin:6px 0 0;font-size:15px;color:var(--ink-2);}
.fnbl .modal .mh .x{margin-left:auto;background:none;border:none;color:var(--ink-3);padding:4px;}
.fnbl .modal .mh .x svg{width:22px;height:22px;stroke-width:2.4;}
.fnbl .modal .mb2{padding:26px 34px 8px;overflow-y:auto;flex:1;min-height:0;}
.fnbl .modal .lead{font-size:15.5px;color:var(--ink-2);line-height:1.55;margin:0 0 22px;}
.fnbl .fld{margin-bottom:18px;}
.fnbl .fld label{display:block;font-size:11px;letter-spacing:.15em;text-transform:uppercase;font-weight:800;color:var(--ink-3);margin-bottom:8px;}
.fnbl .fld input,.fnbl .fld select,.fnbl .fld textarea{width:100%;border:1.5px solid var(--line-2);border-radius:10px;padding:13px 14px;font:500 15px 'Inter',system-ui,sans-serif;color:var(--ink);background:#fff;outline:none;}
.fnbl .fld input:focus,.fnbl .fld select:focus,.fnbl .fld textarea:focus{border-color:var(--indigo);box-shadow:0 0 0 3px rgba(109,90,224,.16);}
.fnbl .f2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.fnbl .trklist{display:flex;flex-direction:column;gap:10px;}
.fnbl .trk{display:flex;align-items:center;gap:10px;font:500 15px 'Inter',system-ui,sans-serif;color:var(--ink);}
.fnbl .trk input{width:17px;height:17px;accent-color:var(--indigo);}
.fnbl .err{color:var(--req-fg);font-size:13.5px;font-weight:600;margin:0 0 4px;}
.fnbl .modal .mf{padding:20px 34px 28px;display:flex;align-items:center;gap:14px;border-top:1px solid var(--line);flex:none;background:#fff;flex-wrap:wrap;}
.fnbl .modal .mf .note{font-size:13px;color:var(--ink-3);line-height:1.45;flex:1;min-width:180px;}
.fnbl .modal .mf .send{border:none;border-radius:10px;background:var(--grad);color:#fff;font-size:15px;font-weight:800;padding:15px 26px;flex:none;box-shadow:0 12px 28px -12px rgba(109,90,224,.6);}
.fnbl .modal .mf .send:disabled{opacity:.6;cursor:not-allowed;}
.fnbl .modal .mf .cancel{border:1.5px solid var(--line-2);background:#fff;border-radius:10px;color:var(--indigo);font-size:15px;font-weight:700;padding:15px 20px;flex:none;}
@media (max-width:900px){
  .fnbl .f2{grid-template-columns:1fr;}
}
`
