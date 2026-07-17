'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GreenRoomPersonResult } from '@/lib/green-room/discover'
import { OPEN_TO_VALUES } from '@/types'

// ─── People Search / Discover (Plan 12-09) ───────────────────────────────
// A discovery module inside the Green Room. Server enforces every privacy
// rule (public-only, block exclusion, public-safe columns); this component
// only renders what /api/green-room/discover returns and gates the message
// action to non-self results.

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Any role' },
  { value: 'artist', label: 'Artist' },
  { value: 'producer', label: 'Producer' },
  { value: 'songwriter', label: 'Songwriter' },
  { value: 'recording_artist', label: 'Recording Artist' },
  { value: 'mixing_engineer', label: 'Mixing Engineer' },
  { value: 'music_supervisor', label: 'Music Supervisor' },
  { value: 'anr', label: 'A&R' },
  { value: 'manager', label: 'Manager' },
  { value: 'attorney', label: 'Attorney' },
]

const OPEN_TO_LABELS: Record<string, string> = {
  collabs: 'Collaboration',
  sync: 'Sync',
  features: 'Features',
  production: 'Production',
  writing: 'Writing',
  management: 'Management',
  booking: 'Booking',
}

const RELATIONSHIP_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Anyone' },
  { value: 'following', label: 'People I follow' },
  { value: 'connected', label: 'My connections' },
  { value: 'outside_network', label: 'Outside my network' },
]

const CAPABILITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All members' },
  { value: 'artist', label: 'Artists' },
  { value: 'industry', label: 'Industry' },
]

type Filters = {
  q: string
  role: string
  openTo: string
  genre: string
  location: string
  relationship: string
  capability: string
}

const EMPTY_FILTERS: Filters = {
  q: '',
  role: '',
  openTo: '',
  genre: '',
  location: '',
  relationship: '',
  capability: '',
}

function buildQuery(filters: Filters, cursor: string | null): string {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.role) params.set('role', filters.role)
  if (filters.openTo) params.set('openTo', filters.openTo)
  if (filters.genre) params.set('genre', filters.genre)
  if (filters.location) params.set('location', filters.location)
  if (filters.relationship) params.set('relationship', filters.relationship)
  if (filters.capability) params.set('capability', filters.capability)
  if (cursor) params.set('cursor', cursor)
  return params.toString()
}

export function PeopleSearch() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS)
  const [results, setResults] = useState<GreenRoomPersonResult[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  const runSearch = useCallback(async (active: Filters, cursor: string | null) => {
    const id = ++requestId.current
    if (cursor) setLoadingMore(true)
    else setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/green-room/discover?${buildQuery(active, cursor)}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not search people')
      if (id !== requestId.current) return
      setResults(prev => (cursor ? [...prev, ...(data.results ?? [])] : (data.results ?? [])))
      setNextCursor(data.nextCursor ?? null)
    } catch (err) {
      if (id !== requestId.current) return
      setError(err instanceof Error ? err.message : 'Could not search people')
    } finally {
      if (id === requestId.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [])

  useEffect(() => {
    runSearch(applied, null)
  }, [applied, runSearch])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setApplied(filters)
  }

  function reset() {
    setFilters(EMPTY_FILTERS)
    setApplied(EMPTY_FILTERS)
  }

  const hasFilters = Object.values(applied).some(Boolean)

  return (
    <section
      aria-label="People search"
      className="rounded-[26px] border border-white/10 bg-white/[0.03] p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-white">Find people</h2>
        {hasFilters && (
          <button
            type="button"
            onClick={reset}
            className="text-xs font-bold uppercase tracking-[.14em] text-white/50 hover:text-white/80"
          >
            Clear
          </button>
        )}
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <input
          type="search"
          value={filters.q}
          onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
          placeholder="Search by name, handle, role, or genre"
          aria-label="Search people by keyword"
          className="w-full rounded-[14px] border border-white/12 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-emerald-300/40 focus:outline-none"
        />

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <FilterSelect
            label="Role"
            value={filters.role}
            onChange={v => setFilters(f => ({ ...f, role: v }))}
            options={ROLE_OPTIONS}
          />
          <FilterSelect
            label="Open to"
            value={filters.openTo}
            onChange={v => setFilters(f => ({ ...f, openTo: v }))}
            options={[
              { value: '', label: 'Any intent' },
              ...OPEN_TO_VALUES.map(v => ({ value: v, label: OPEN_TO_LABELS[v] ?? v })),
            ]}
          />
          <FilterSelect
            label="Relationship"
            value={filters.relationship}
            onChange={v => setFilters(f => ({ ...f, relationship: v }))}
            options={RELATIONSHIP_OPTIONS}
          />
          <FilterSelect
            label="Member type"
            value={filters.capability}
            onChange={v => setFilters(f => ({ ...f, capability: v }))}
            options={CAPABILITY_OPTIONS}
          />
          <input
            type="text"
            value={filters.genre}
            onChange={e => setFilters(f => ({ ...f, genre: e.target.value }))}
            placeholder="Genre"
            aria-label="Filter by genre"
            className="rounded-[12px] border border-white/12 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-emerald-300/40 focus:outline-none"
          />
          <input
            type="text"
            value={filters.location}
            onChange={e => setFilters(f => ({ ...f, location: e.target.value }))}
            placeholder="Location"
            aria-label="Filter by location"
            className="rounded-[12px] border border-white/12 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-emerald-300/40 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-[14px] bg-gradient-to-r from-emerald-400 to-fuchsia-500 px-4 py-3 text-sm font-black text-black transition hover:opacity-90"
        >
          Search
        </button>
      </form>

      <div className="mt-5 space-y-3">
        {error && (
          <p className="rounded-[14px] border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
            {error}
          </p>
        )}

        {loading && <p className="py-6 text-center text-sm text-white/45">Searching…</p>}

        {!loading && !error && results.length === 0 && (
          <p className="py-8 text-center text-sm text-white/45">
            {hasFilters ? 'No members match these filters yet.' : 'Search to discover members across the network.'}
          </p>
        )}

        {results.map(person => (
          <PersonCard key={person.id} person={person} />
        ))}

        {nextCursor && !loading && (
          <button
            type="button"
            onClick={() => runSearch(applied, nextCursor)}
            disabled={loadingMore}
            className="w-full rounded-[14px] border border-white/12 px-4 py-3 text-sm font-bold text-white/70 hover:text-white disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Show more'}
          </button>
        )}
      </div>
    </section>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        className="rounded-[12px] border border-white/12 bg-black/30 px-3 py-2 text-sm text-white focus:border-emerald-300/40 focus:outline-none"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value} className="bg-[#111]">
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function PersonCard({ person }: { person: GreenRoomPersonResult }) {
  const [following, setFollowing] = useState(person.relationship === 'following')
  const [followBusy, setFollowBusy] = useState(false)
  const canFollow = person.relationship === 'outside_network'
  const canMessage = person.relationship !== 'self'

  async function follow() {
    if (followBusy || following) return
    setFollowBusy(true)
    setFollowing(true) // optimistic
    const res = await fetch('/api/follows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ followeeId: person.id }),
    })
    setFollowBusy(false)
    if (!res.ok) setFollowing(false) // revert
  }

  return (
    <article className="rounded-[18px] border border-white/10 bg-black/25 p-4">
      <div className="flex items-start gap-3">
        {person.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={person.avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-black text-white/60">
            {person.displayName.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <a href={person.profileHref} className="truncate text-sm font-black text-white hover:underline">
              {person.displayName}
            </a>
            {person.verified && (
              <span title="Verified" className="text-emerald-300" aria-label="Verified member">
                ✓
              </span>
            )}
          </div>
          {person.handle && <p className="truncate text-xs text-white/45">@{person.handle}</p>}
          <p className="mt-1 text-[11px] font-bold uppercase tracking-[.12em] text-emerald-200/70">
            {person.reasonLabel}
          </p>

          {person.headline && <p className="mt-2 line-clamp-2 text-sm text-white/60">{person.headline}</p>}

          {(person.roles.length > 0 || person.genre || person.location) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {person.roles.slice(0, 3).map(role => (
                <Chip key={role}>{role}</Chip>
              ))}
              {person.genre && <Chip>{person.genre}</Chip>}
              {person.location && <Chip>{person.location}</Chip>}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={person.profileHref}
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-white/80 hover:text-white"
            >
              View profile
            </a>
            {canMessage && (
              <a
                href={`/messages?with=${person.id}`}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-white/80 hover:text-white"
              >
                Message
              </a>
            )}
            {canFollow && (
              <button
                type="button"
                onClick={follow}
                disabled={followBusy || following}
                className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-black text-black transition hover:bg-white disabled:opacity-60"
              >
                {following ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/65">
      {children}
    </span>
  )
}
