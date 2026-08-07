'use client'

import { useState } from 'react'
import Link from 'next/link'
import { GENRES } from '@/lib/genres'
import { MOOD_VALUES, MOOD_LABELS, ENERGY_VALUES, ENERGY_LABELS, VOCAL_VALUES, VOCAL_LABELS } from '@/lib/metadata/schema'
import type { CatalogCard } from '@/lib/deals/catalog'

// ─── CatalogBrowser (D-16) ──────────────────────────────────────────────
// Owns all filter state and pagination. Deliberately renders NO free-text
// search input (D-16) — genre, mood, energy, vocal, usage-cleared, key, and
// BPM range are the only dimensions. Every fetch goes through GET
// /api/buyer/catalog, which re-applies the server-side rights-ready +
// Phase 13 visibility + block gate — this component only ever renders
// display-safe fields the API already filtered (D-14a).

const FIELD_CLASS =
  'mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-400/50'
const CHIP_BASE = 'rounded-full border px-2.5 py-1 text-[11px] font-medium transition'
const CHIP_ON = 'border-indigo-400/40 bg-indigo-400/15 text-indigo-200'
const CHIP_OFF = 'border-white/15 text-white/50 hover:border-white/30'

type FilterState = {
  genre: string
  mood: string
  energy: string
  vocal: string
  usageCleared: boolean
  key: string
  bpmMin: string
  bpmMax: string
}

const EMPTY_FILTER: FilterState = {
  genre: '',
  mood: '',
  energy: '',
  vocal: '',
  usageCleared: false,
  key: '',
  bpmMin: '',
  bpmMax: '',
}

function buildQuery(filter: FilterState, page: number): string {
  const params = new URLSearchParams()
  if (filter.genre) params.set('genre', filter.genre)
  if (filter.mood) params.set('mood', filter.mood)
  if (filter.energy) params.set('energy', filter.energy)
  if (filter.vocal) params.set('vocal', filter.vocal)
  if (filter.usageCleared) params.set('usageCleared', 'true')
  if (filter.key.trim()) params.set('key', filter.key.trim())
  if (filter.bpmMin.trim()) params.set('bpmMin', filter.bpmMin.trim())
  if (filter.bpmMax.trim()) params.set('bpmMax', filter.bpmMax.trim())
  params.set('page', String(page))
  return params.toString()
}

export function CatalogBrowser({
  initialCards,
  initialPage,
  pageSize,
}: {
  initialCards: CatalogCard[]
  initialPage: number
  pageSize: number
}) {
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER)
  const [cards, setCards] = useState<CatalogCard[]>(initialCards)
  const [page, setPage] = useState(initialPage)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialCards.length >= pageSize)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [savingId, setSavingId] = useState<string | null>(null)

  async function runFetch(nextFilter: FilterState, nextPage: number, append: boolean) {
    setLoading(true)
    try {
      const res = await fetch(`/api/buyer/catalog?${buildQuery(nextFilter, nextPage)}`)
      const json = (await res.json().catch(() => ({}))) as { data?: CatalogCard[] }
      const results = json.data ?? []
      setCards(prev => (append ? [...prev, ...results] : results))
      setHasMore(results.length >= pageSize)
      setPage(nextPage)
    } finally {
      setLoading(false)
    }
  }

  function applyFilters() {
    void runFetch(filter, 1, false)
  }

  function loadMore() {
    void runFetch(filter, page + 1, true)
  }

  async function saveToShortlist(projectId: string) {
    setSavingId(projectId)
    try {
      const res = await fetch('/api/buyer/shortlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vault_project_id: projectId }),
      })
      if (res.ok) setSavedIds(prev => new Set(prev).add(projectId))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div>
      {/* Filters */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className="text-xs font-semibold text-white/70">Genre</label>
            <select
              value={filter.genre}
              onChange={e => setFilter(f => ({ ...f, genre: e.target.value }))}
              className={FIELD_CLASS}
            >
              <option value="">Any</option>
              {GENRES.map(g => (
                <option key={g.slug} value={g.slug}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-white/70">Mood</label>
            <select
              value={filter.mood}
              onChange={e => setFilter(f => ({ ...f, mood: e.target.value }))}
              className={FIELD_CLASS}
            >
              <option value="">Any</option>
              {MOOD_VALUES.map(m => (
                <option key={m} value={m}>
                  {MOOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-white/70">Energy</label>
            <select
              value={filter.energy}
              onChange={e => setFilter(f => ({ ...f, energy: e.target.value }))}
              className={FIELD_CLASS}
            >
              <option value="">Any</option>
              {ENERGY_VALUES.map(v => (
                <option key={v} value={v}>
                  {ENERGY_LABELS[v]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-white/70">Vocals</label>
            <select
              value={filter.vocal}
              onChange={e => setFilter(f => ({ ...f, vocal: e.target.value }))}
              className={FIELD_CLASS}
            >
              <option value="">Any</option>
              {VOCAL_VALUES.map(v => (
                <option key={v} value={v}>
                  {VOCAL_LABELS[v]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className="text-xs font-semibold text-white/70">Musical key</label>
            <input
              type="text"
              value={filter.key}
              onChange={e => setFilter(f => ({ ...f, key: e.target.value }))}
              placeholder="e.g. F, Bbm"
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-white/70">BPM min</label>
            <input
              type="number"
              min={0}
              value={filter.bpmMin}
              onChange={e => setFilter(f => ({ ...f, bpmMin: e.target.value }))}
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-white/70">BPM max</label>
            <input
              type="number"
              min={0}
              value={filter.bpmMax}
              onChange={e => setFilter(f => ({ ...f, bpmMax: e.target.value }))}
              className={FIELD_CLASS}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setFilter(f => ({ ...f, usageCleared: !f.usageCleared }))}
              className={`${CHIP_BASE} ${filter.usageCleared ? CHIP_ON : CHIP_OFF}`}
            >
              Usage cleared only
            </button>
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={applyFilters}
            disabled={loading}
            className="rounded-lg border border-indigo-400/30 bg-indigo-400/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Applying…' : 'Apply filters'}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="mt-6">
        {cards.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <p className="text-sm font-semibold text-white/70">No matching catalog</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-white/50">
              Try widening your filters — rights-ready catalog grows as more artists complete their
              readiness checklist.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(card => (
              <div key={card.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">{card.title}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-white/40">
                  {card.type}
                  {card.genre ? ` · ${card.genre}` : ''}
                </p>

                <div className="mt-3 space-y-1">
                  {card.tracks.slice(0, 4).map(t => (
                    <div key={t.id} className="flex items-center justify-between text-[11px] text-white/50">
                      <span className="truncate">{t.title ?? 'Untitled track'}</span>
                      <span className="ml-2 shrink-0 text-white/30">
                        {t.keySignature ?? '—'} {t.bpm != null ? `· ${t.bpm} BPM` : ''}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Link
                    href={`/buyers/requests/new?project=${card.id}`}
                    className="rounded-lg border border-indigo-400/30 bg-indigo-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-200 transition hover:bg-indigo-400/20"
                  >
                    Request license
                  </Link>
                  <button
                    type="button"
                    onClick={() => saveToShortlist(card.id)}
                    disabled={savingId === card.id || savedIds.has(card.id)}
                    className={`${CHIP_BASE} ${savedIds.has(card.id) ? CHIP_ON : CHIP_OFF} disabled:cursor-not-allowed`}
                  >
                    {savedIds.has(card.id) ? 'Saved' : savingId === card.id ? 'Saving…' : 'Save to shortlist'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {hasMore && cards.length > 0 && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/60 transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
