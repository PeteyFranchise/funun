'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MOOD_VALUES, MOOD_LABELS, ENERGY_VALUES, ENERGY_LABELS, VOCAL_VALUES, VOCAL_LABELS } from '@/lib/metadata/schema'
import { GENRES } from '@/lib/genres'
import { isLegalSelectsTransition } from '@/lib/selects/stage-machine'
import type { SelectsStatus, SelectsTrackSource } from '@/lib/selects/types'
import type { SelectsCatalogTrackHit } from '@/app/api/admin/selects/catalog/route'

// ─── SelectsBuilder (R11, D-11, D-12) ───────────────────────────────────────
// The AE's curate-and-send console: a Crate-search pane on one side, the
// working tracklist on the other. Every write crosses into the 31-04/31-05
// own-book-scoped API routes (T-31-23) — this component never touches
// Supabase directly. Scope note (31-10 PLAN.md): the richer cross-client
// pipeline ROOM (List/Board funnel toggle, event-derived stages, coaching
// questions) is Slice 2 / Phase 31.1 — this file is only the per-Selects
// builder, not that room.

const STATUS_LABELS: Record<SelectsStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  approved: 'Approved',
  changes_requested: 'Changes requested',
}

const STATUS_DOT: Record<SelectsStatus, string> = {
  draft: 'var(--ink-3)',
  sent: 'var(--amber-fg)',
  approved: 'var(--green-fg)',
  changes_requested: 'var(--rose-fg)',
}

export type SelectsBuilderSelects = {
  id: string
  name: string
  cover_note: string | null
  status: SelectsStatus
  share_token: string
  brief_id: string | null
}

export type SelectsBuilderTrackRow = {
  id: string
  track_id: string
  note: string | null
  position: number
  added_by: string | null
  source: SelectsTrackSource
  removed_at: string | null
  rights_ready: boolean
  title: string
}

type RawTrackApiRow = {
  id: string
  track_id: string
  note: string | null
  position: number
  added_by: string | null
  source: SelectsTrackSource
  removed_at: string | null
  rights_ready: boolean
  track: { id: string; title: string | null; project_id: string } | null
}

function toBuilderRow(r: RawTrackApiRow): SelectsBuilderTrackRow {
  return {
    id: r.id,
    track_id: r.track_id,
    note: r.note,
    position: r.position,
    added_by: r.added_by,
    source: r.source,
    removed_at: r.removed_at,
    rights_ready: r.rights_ready,
    title: r.track?.title || 'Untitled track',
  }
}

type BuilderFilters = {
  genre: string
  mood: string
  energy: string
  vocal: string
  bpmMin: string
  bpmMax: string
}

const EMPTY_FILTERS: BuilderFilters = { genre: '', mood: '', energy: '', vocal: '', bpmMin: '', bpmMax: '' }

function filtersToPayload(f: BuilderFilters): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  if (f.genre) out.genre = f.genre
  if (f.mood) out.mood = f.mood
  if (f.energy) out.energy = f.energy
  if (f.vocal) out.vocal = f.vocal
  if (f.bpmMin) out.bpmMin = Number(f.bpmMin)
  if (f.bpmMax) out.bpmMax = Number(f.bpmMax)
  return out
}

function payloadToFilters(payload: Record<string, unknown>): BuilderFilters {
  return {
    genre: typeof payload.genre === 'string' ? payload.genre : '',
    mood: typeof payload.mood === 'string' ? payload.mood : '',
    energy: typeof payload.energy === 'string' ? payload.energy : '',
    vocal: typeof payload.vocal === 'string' ? payload.vocal : '',
    bpmMin: typeof payload.bpmMin === 'number' ? String(payload.bpmMin) : '',
    bpmMax: typeof payload.bpmMax === 'number' ? String(payload.bpmMax) : '',
  }
}

type SavedSearch = {
  id: string
  created_by: string
  name: string
  filters: Record<string, unknown>
  is_team_shared: boolean
  created_at: string
}

const FIELD_CLASS =
  'w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none'

const GHOST_BTN_CLASS =
  'rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-[12px] text-[color:var(--ink-2)] transition hover:text-[color:var(--ink)] disabled:opacity-40 disabled:cursor-not-allowed'

// ─── SortableTrackRow ────────────────────────────────────────────────────

function SortableTrackRow({
  row,
  onNoteChange,
  onRemove,
}: {
  row: SelectsBuilderTrackRow
  onNoteChange: (trackRowId: string, note: string) => void
  onRemove: (row: SelectsBuilderTrackRow) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, setActivatorNodeRef } =
    useSortable({ id: row.id })

  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style} className="mb-2">
      <div
        className={[
          'rounded-[10px] border p-3 transition-all',
          isDragging
            ? 'scale-[1.01] border-[color:var(--indigo)] bg-[color:var(--panel-2)] opacity-70 shadow-2xl'
            : 'border-[color:var(--border)] bg-[color:var(--panel)]',
        ].join(' ')}
      >
        <div className="flex items-center gap-2">
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Drag to reorder ${row.title}`}
            className="flex h-6 w-6 shrink-0 cursor-grab items-center justify-center text-[color:var(--ink-3)] hover:text-[color:var(--ink)] active:cursor-grabbing"
          >
            <svg width="10" height="14" viewBox="0 0 12 16" fill="currentColor">
              <circle cx="3" cy="2" r="1.5" />
              <circle cx="9" cy="2" r="1.5" />
              <circle cx="3" cy="8" r="1.5" />
              <circle cx="9" cy="8" r="1.5" />
              <circle cx="3" cy="14" r="1.5" />
              <circle cx="9" cy="14" r="1.5" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-[color:var(--ink)]">{row.title}</p>
            <p className="mt-0.5 flex items-center gap-2 text-[11.5px] text-[color:var(--ink-3)]">
              <span>{row.added_by ? 'Added' : 'Suggested'}</span>
              {row.rights_ready ? (
                <span className="rounded-full border border-[color:var(--green-line)] bg-[color:var(--green-bg)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--green-fg)]">
                  Rights ready
                </span>
              ) : (
                <span className="rounded-full border border-[color:var(--amber-line)] bg-[color:var(--amber-bg)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--amber-fg)]">
                  Clearance pending
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => onRemove(row)}
            aria-label={`Remove ${row.title}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[color:var(--ink-3)] transition hover:text-[color:var(--rose-fg)]"
          >
            ×
          </button>
        </div>
        <input
          value={row.note ?? ''}
          onChange={e => onNoteChange(row.id, e.target.value)}
          placeholder="Why you picked this — the client sees it…"
          className="mt-2 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-2.5 py-1.5 text-[12px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
        />
      </div>
    </div>
  )
}

// ─── SelectsBuilder ─────────────────────────────────────────────────────────

export function SelectsBuilder({
  selects,
  initialTracks,
  initialRemoved,
}: {
  selects: SelectsBuilderSelects
  initialTracks: SelectsBuilderTrackRow[]
  initialRemoved: SelectsBuilderTrackRow[]
}) {
  // ── Name / cover note — debounced auto-save + manual Save ──────────────
  const [name, setName] = useState(selects.name)
  const [coverNote, setCoverNote] = useState(selects.cover_note ?? '')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const savedRef = useRef({ name: selects.name, cover_note: selects.cover_note ?? '' })
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushSave = useCallback(async () => {
    if (name === savedRef.current.name && coverNote === savedRef.current.cover_note) return
    setSaveState('saving')
    try {
      const res = await fetch(`/api/admin/selects/${selects.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, cover_note: coverNote || null }),
      })
      if (res.ok) {
        savedRef.current = { name, cover_note: coverNote }
        setSaveState('saved')
      } else {
        setSaveState('idle')
      }
    } catch {
      setSaveState('idle')
    }
  }, [name, coverNote, selects.id])

  useEffect(() => {
    if (name === savedRef.current.name && coverNote === savedRef.current.cover_note) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      flushSave()
    }, 900)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [name, coverNote, flushSave])

  // ── Tracks / removed tracks ─────────────────────────────────────────────
  const [tracks, setTracks] = useState<SelectsBuilderTrackRow[]>(
    [...initialTracks].sort((a, b) => a.position - b.position)
  )
  const [removed, setRemoved] = useState<SelectsBuilderTrackRow[]>(initialRemoved)
  const [removedOpen, setRemovedOpen] = useState(false)

  const applyTracksFromServer = useCallback((rows: RawTrackApiRow[]) => {
    const built = rows.map(toBuilderRow)
    setTracks(built.filter(t => !t.removed_at).sort((a, b) => a.position - b.position))
    setRemoved(built.filter(t => t.removed_at))
  }, [])

  const refetchTracks = useCallback(async () => {
    const res = await fetch(`/api/admin/selects/${selects.id}/tracks?includeRemoved=1`)
    if (!res.ok) return
    const json = (await res.json().catch(() => ({ data: [] }))) as { data: RawTrackApiRow[] }
    applyTracksFromServer(json.data ?? [])
  }, [selects.id, applyTracksFromServer])

  // ── Toast (soft-remove undo) ────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((message: string, onUndo?: () => void) => {
    setToast({ message, onUndo })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }, [])

  // ── Per-track note debounce ─────────────────────────────────────────────
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const handleNoteChange = useCallback(
    (trackRowId: string, note: string) => {
      setTracks(prev => prev.map(t => (t.id === trackRowId ? { ...t, note } : t)))
      if (noteTimers.current[trackRowId]) clearTimeout(noteTimers.current[trackRowId])
      noteTimers.current[trackRowId] = setTimeout(() => {
        fetch(`/api/admin/selects/${selects.id}/tracks`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackRowId, note: note.trim() || null }),
        }).catch(() => {})
      }, 700)
    },
    [selects.id]
  )

  // ── Restore (Undo toast + Removed tray share this path) ────────────────
  const handleRestoreTrack = useCallback(
    async (row: SelectsBuilderTrackRow) => {
      setRemoved(prev => prev.filter(t => t.id !== row.id))
      setTracks(prev => [...prev, { ...row, removed_at: null }].sort((a, b) => a.position - b.position))
      setToast(null)
      if (toastTimer.current) clearTimeout(toastTimer.current)
      try {
        const res = await fetch(`/api/admin/selects/${selects.id}/tracks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackId: row.track_id, source: row.source }),
        })
        if (!res.ok) throw new Error()
      } catch {
        await refetchTracks()
      }
    },
    [selects.id, refetchTracks]
  )

  // ── Remove (soft) ────────────────────────────────────────────────────────
  const handleRemoveTrack = useCallback(
    async (row: SelectsBuilderTrackRow) => {
      setTracks(prev => prev.filter(t => t.id !== row.id))
      setRemoved(prev => [{ ...row, removed_at: new Date().toISOString() }, ...prev])
      showToast(`"${row.title}" removed`, () => handleRestoreTrack(row))
      try {
        const res = await fetch(`/api/admin/selects/${selects.id}/tracks?trackRowId=${row.id}`, {
          method: 'DELETE',
        })
        if (!res.ok) throw new Error()
      } catch {
        setTracks(prev => [...prev, { ...row, removed_at: null }].sort((a, b) => a.position - b.position))
        setRemoved(prev => prev.filter(t => t.id !== row.id))
        showToast(`Couldn't remove "${row.title}" — please try again.`)
      }
    },
    [selects.id, showToast, handleRestoreTrack]
  )

  // ── Reorder (dnd-kit) ────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIndex = tracks.findIndex(t => t.id === active.id)
      const newIndex = tracks.findIndex(t => t.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const snapshot = tracks
      const reordered = arrayMove(tracks, oldIndex, newIndex).map((t, idx) => ({ ...t, position: idx }))
      setTracks(reordered)
      try {
        await Promise.all(
          reordered
            .filter((t, idx) => snapshot.find(s => s.id === t.id)?.position !== idx)
            .map(t =>
              fetch(`/api/admin/selects/${selects.id}/tracks`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trackRowId: t.id, position: t.position }),
              })
            )
        )
      } catch {
        setTracks(snapshot)
      }
    },
    [tracks, selects.id]
  )

  // ── Crate search ─────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<BuilderFilters>(EMPTY_FILTERS)
  const [searchResults, setSearchResults] = useState<SelectsCatalogTrackHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [adding, setAdding] = useState<Record<string, boolean>>({})

  const runSearch = useCallback(async (f: BuilderFilters) => {
    setSearching(true)
    setSearchError(null)
    try {
      const params = new URLSearchParams()
      if (f.genre) params.set('genre', f.genre)
      if (f.mood) params.set('mood', f.mood)
      if (f.energy) params.set('energy', f.energy)
      if (f.vocal) params.set('vocal', f.vocal)
      if (f.bpmMin) params.set('bpmMin', f.bpmMin)
      if (f.bpmMax) params.set('bpmMax', f.bpmMax)
      const res = await fetch(`/api/admin/selects/catalog?${params.toString()}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Search failed.')
      setSearchResults(((json as { data?: SelectsCatalogTrackHit[] }).data ?? []))
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed.')
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    runSearch(EMPTY_FILTERS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAddTrack = useCallback(
    async (hit: SelectsCatalogTrackHit) => {
      if (tracks.some(t => t.track_id === hit.trackId)) return // idempotent — already added
      setAdding(prev => ({ ...prev, [hit.trackId]: true }))
      try {
        const res = await fetch(`/api/admin/selects/${selects.id}/tracks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackId: hit.trackId, source: 'crate' }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Could not add track.')
        const row = json.data as {
          id: string
          track_id: string
          note: string | null
          position: number
          added_by: string | null
          source: SelectsTrackSource
          removed_at: string | null
        }
        setTracks(prev => {
          if (prev.some(t => t.id === row.id)) return prev
          return [
            ...prev,
            { ...row, rights_ready: true, title: hit.title },
          ].sort((a, b) => a.position - b.position)
        })
        setRemoved(prev => prev.filter(t => t.track_id !== hit.trackId))
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : 'Could not add track.')
      } finally {
        setAdding(prev => {
          const next = { ...prev }
          delete next[hit.trackId]
          return next
        })
      }
    },
    [tracks, selects.id]
  )

  // ── Saved searches (D-12) ───────────────────────────────────────────────
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [savedMenuOpen, setSavedMenuOpen] = useState(false)
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [saveSearchName, setSaveSearchName] = useState('')
  const [savingSearch, setSavingSearch] = useState(false)
  const [saveSearchError, setSaveSearchError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/selects/saved-searches')
      .then(res => (res.ok ? res.json() : { data: [] }))
      .then(json => setSavedSearches(((json as { data?: SavedSearch[] }).data ?? [])))
      .catch(() => {})
  }, [])

  const handleRecallSearch = useCallback(
    (s: SavedSearch) => {
      const f = payloadToFilters(s.filters)
      setFilters(f)
      setSavedMenuOpen(false)
      runSearch(f)
    },
    [runSearch]
  )

  const handleSaveCurrentSearch = useCallback(async () => {
    const trimmed = saveSearchName.trim()
    if (!trimmed) {
      setSaveSearchError('Name is required.')
      return
    }
    setSavingSearch(true)
    setSaveSearchError(null)
    try {
      const res = await fetch('/api/admin/selects/saved-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, filters: filtersToPayload(filters) }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Couldn't save this search.")
      setSavedSearches(prev => [json.data as SavedSearch, ...prev])
      setSaveSearchName('')
      setShowSaveInput(false)
    } catch (err) {
      setSaveSearchError(err instanceof Error ? err.message : "Couldn't save this search.")
    } finally {
      setSavingSearch(false)
    }
  }, [saveSearchName, filters])

  const handleToggleShare = useCallback(async (s: SavedSearch) => {
    try {
      const res = await fetch('/api/admin/selects/saved-searches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id, is_team_shared: !s.is_team_shared }),
      })
      if (!res.ok) return
      const json = await res.json()
      setSavedSearches(prev => prev.map(x => (x.id === s.id ? (json.data as SavedSearch) : x)))
    } catch {
      // best-effort — the search stays in its prior share state on failure
    }
  }, [])

  // ── AI draft (D-11) ─────────────────────────────────────────────────────
  const [aiDrafting, setAiDrafting] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const handleAiDraft = useCallback(async () => {
    setAiDrafting(true)
    setAiError(null)
    try {
      const res = await fetch(`/api/admin/selects/${selects.id}/ai-draft`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Could not draft from the brief.')
      if (typeof json.data?.coverNote === 'string' && !savedRef.current.cover_note) {
        setCoverNote(json.data.coverNote)
        savedRef.current = { ...savedRef.current, cover_note: json.data.coverNote }
      }
      await refetchTracks()
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Could not draft from the brief.')
    } finally {
      setAiDrafting(false)
    }
  }, [selects.id, refetchTracks])

  // ── Send ─────────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<SelectsStatus>(selects.status)
  const [shareUrl, setShareUrl] = useState<string | null>(
    selects.status !== 'draft' ? `/selects/${selects.share_token}` : null
  )
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')

  const canSend = tracks.length > 0 && isLegalSelectsTransition(status, 'sent')

  const handleSend = useCallback(async () => {
    if (!canSend) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(`/api/admin/selects/${selects.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Could not send this Selects.')
      setStatus('sent')
      setShareUrl((json as { shareUrl?: string }).shareUrl ?? null)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send this Selects.')
    } finally {
      setSending(false)
    }
  }, [canSend, selects.id])

  const handleCopyLink = useCallback(() => {
    if (!shareUrl || typeof window === 'undefined') return
    const absolute = `${window.location.origin}${shareUrl}`
    navigator.clipboard?.writeText(absolute).then(() => {
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    }).catch(() => {})
  }, [shareUrl])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header — name, status, save state, Send */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[color:var(--border)] pb-4">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[.13em] text-[color:var(--ink-3)]">
            Name this Selects for the client
          </p>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Name this Selects for the client…"
            className="w-full max-w-md rounded-lg border border-[color:var(--border)] bg-transparent px-2 py-1 text-[19px] font-medium text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2 text-[12.5px] text-[color:var(--ink-3)]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] px-2.5 py-1">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: STATUS_DOT[status] }}
              />
              {STATUS_LABELS[status]}
            </span>
            {saveState === 'saving' && <span>Saving…</span>}
            {saveState === 'saved' && (
              <span>
                <span style={{ color: 'var(--green-fg)' }}>✓</span> Draft saved
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <button onClick={flushSave} className={GHOST_BTN_CLASS}>
              Save draft
            </button>
            <button
              onClick={handleSend}
              disabled={!canSend || sending}
              title={!canSend && tracks.length === 0 ? 'Add at least one track before sending' : undefined}
              className="fncon-cta rounded-lg px-4 py-2 text-[13px] font-bold shadow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? 'Sending…' : 'Send Selects'}
            </button>
          </div>
          {tracks.length === 0 && (
            <p className="text-[11.5px] text-[color:var(--ink-3)]">Add at least one track before sending.</p>
          )}
          {sendError && <p className="text-[11.5px] text-[color:var(--rose-fg)]">{sendError}</p>}
          {shareUrl && (
            <div className="flex items-center gap-2 text-[11.5px]">
              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[color:var(--indigo)] underline"
              >
                {shareUrl}
              </a>
              <button onClick={handleCopyLink} className={GHOST_BTN_CLASS}>
                {copyState === 'copied' ? 'Copied ✓' : 'Copy link'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Build method + cover note */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-[color:var(--border)] pb-4">
        <span
          className={`rounded-full border px-3 py-1 text-[11.5px] font-semibold ${
            !selects.brief_id
              ? 'border-[color:var(--indigo)] text-[color:var(--ink)]'
              : 'border-[color:var(--border)] text-[color:var(--ink-3)]'
          }`}
        >
          From scratch
        </span>
        <span
          className={`rounded-full border px-3 py-1 text-[11.5px] font-semibold ${
            selects.brief_id
              ? 'border-[color:var(--indigo)] text-[color:var(--ink)]'
              : 'border-[color:var(--border)] text-[color:var(--ink-3)]'
          }`}
        >
          Off a brief
        </span>
        <button
          onClick={handleAiDraft}
          disabled={!selects.brief_id || aiDrafting}
          title={!selects.brief_id ? 'Link a brief to draft with AI' : undefined}
          className="rounded-lg border border-[color:var(--indigo)] px-3 py-1.5 text-[12px] font-bold text-[color:var(--ink)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {aiDrafting ? 'Drafting…' : '✨ Draft from brief'}
        </button>
        {aiError && <span className="text-[11.5px] text-[color:var(--rose-fg)]">{aiError}</span>}
        <input
          value={coverNote}
          onChange={e => setCoverNote(e.target.value)}
          placeholder="Add a cover note the client sees first…"
          className="ml-auto min-w-[240px] flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
        />
      </div>

      {/* Two-pane: Crate search | Your Selects */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── The Crate ── */}
        <div className="rounded-xl border border-[color:var(--border)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <b className="text-[13px] text-[color:var(--ink)]">The Crate</b>
            <span className="ml-auto text-[12px] text-[color:var(--ink-3)]">Rights-ready only</span>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <select
              value={filters.genre}
              onChange={e => setFilters(prev => ({ ...prev, genre: e.target.value }))}
              className={FIELD_CLASS}
            >
              <option value="">Any genre</option>
              {GENRES.map(g => (
                <option key={g.slug} value={g.slug}>
                  {g.label}
                </option>
              ))}
            </select>
            <select
              value={filters.mood}
              onChange={e => setFilters(prev => ({ ...prev, mood: e.target.value }))}
              className={FIELD_CLASS}
            >
              <option value="">Any mood</option>
              {MOOD_VALUES.map(m => (
                <option key={m} value={m}>
                  {MOOD_LABELS[m]}
                </option>
              ))}
            </select>
            <select
              value={filters.energy}
              onChange={e => setFilters(prev => ({ ...prev, energy: e.target.value }))}
              className={FIELD_CLASS}
            >
              <option value="">Any energy</option>
              {ENERGY_VALUES.map(en => (
                <option key={en} value={en}>
                  {ENERGY_LABELS[en]}
                </option>
              ))}
            </select>
            <select
              value={filters.vocal}
              onChange={e => setFilters(prev => ({ ...prev, vocal: e.target.value }))}
              className={FIELD_CLASS}
            >
              <option value="">Any vocals</option>
              {VOCAL_VALUES.map(v => (
                <option key={v} value={v}>
                  {VOCAL_LABELS[v]}
                </option>
              ))}
            </select>
            <input
              value={filters.bpmMin}
              onChange={e => setFilters(prev => ({ ...prev, bpmMin: e.target.value.replace(/[^\d]/g, '') }))}
              placeholder="Min BPM"
              inputMode="numeric"
              className={FIELD_CLASS}
            />
            <input
              value={filters.bpmMax}
              onChange={e => setFilters(prev => ({ ...prev, bpmMax: e.target.value.replace(/[^\d]/g, '') }))}
              placeholder="Max BPM"
              inputMode="numeric"
              className={FIELD_CLASS}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={() => runSearch(filters)} className={GHOST_BTN_CLASS}>
              {searching ? 'Searching…' : 'Apply filters'}
            </button>
            <button
              onClick={() => {
                setFilters(EMPTY_FILTERS)
                runSearch(EMPTY_FILTERS)
              }}
              className={GHOST_BTN_CLASS}
            >
              Clear
            </button>
            <div className="relative ml-auto">
              <button onClick={() => setSavedMenuOpen(prev => !prev)} className={GHOST_BTN_CLASS}>
                Saved ▾
              </button>
              {savedMenuOpen && (
                <div className="absolute right-0 z-10 mt-1 w-72 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-2 shadow-2xl">
                  <p className="px-1 py-1 text-[10.5px] font-semibold uppercase tracking-[.1em] text-[color:var(--ink-3)]">
                    Your saved searches
                  </p>
                  {savedSearches.length === 0 && (
                    <p className="px-1 py-1 text-[12px] text-[color:var(--ink-3)]">No saved searches yet.</p>
                  )}
                  {savedSearches.map(s => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-[color:var(--panel-2)]"
                    >
                      <button
                        onClick={() => handleRecallSearch(s)}
                        className="flex-1 truncate text-left text-[12.5px] text-[color:var(--ink)]"
                      >
                        {s.name}
                        {s.is_team_shared && (
                          <span className="ml-1.5 text-[10px] text-[color:var(--ink-3)]">· team</span>
                        )}
                      </button>
                      <button
                        onClick={() => handleToggleShare(s)}
                        className="shrink-0 text-[10.5px] text-[color:var(--ink-3)] underline hover:text-[color:var(--ink)]"
                      >
                        {s.is_team_shared ? 'Unshare' : 'Share'}
                      </button>
                    </div>
                  ))}
                  <div className="mt-1 border-t border-[color:var(--border)] pt-1">
                    {showSaveInput ? (
                      <div className="flex flex-col gap-1.5 px-1 py-1">
                        {saveSearchError && (
                          <p className="text-[11px] text-[color:var(--rose-fg)]">{saveSearchError}</p>
                        )}
                        <input
                          value={saveSearchName}
                          onChange={e => setSaveSearchName(e.target.value)}
                          placeholder="Name this search…"
                          className={FIELD_CLASS}
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={handleSaveCurrentSearch}
                            disabled={savingSearch}
                            className="fncon-cta rounded-lg px-2.5 py-1 text-[11.5px] font-bold shadow disabled:opacity-40"
                          >
                            {savingSearch ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => {
                              setShowSaveInput(false)
                              setSaveSearchError(null)
                            }}
                            className={GHOST_BTN_CLASS}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowSaveInput(true)}
                        className="w-full px-1 py-1.5 text-left text-[12px] text-[color:var(--indigo)]"
                      >
                        ＋ Save current search…
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {searchError && <p className="mt-2 text-[12px] text-[color:var(--rose-fg)]">{searchError}</p>}

          {/* Results */}
          <div className="mt-3 flex flex-col gap-1.5">
            {searching && <p className="text-[12.5px] text-[color:var(--ink-3)]">Searching…</p>}
            {!searching && searchResults.length === 0 && (
              <p className="text-[12.5px] text-[color:var(--ink-3)]">No tracks match — try clearing a filter.</p>
            )}
            {searchResults.map(hit => {
              const alreadyAdded = tracks.some(t => t.track_id === hit.trackId)
              return (
                <div
                  key={hit.trackId}
                  className="flex items-center gap-3 rounded-lg border border-[color:var(--border)] px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-[color:var(--ink)]">{hit.title}</p>
                    <p className="truncate text-[11.5px] text-[color:var(--ink-3)]">
                      {hit.artist || 'Unknown artist'}
                      {hit.genre ? ` · ${hit.genre}` : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      hit.rights === 'ok'
                        ? 'border-[color:var(--green-line)] bg-[color:var(--green-bg)] text-[color:var(--green-fg)]'
                        : 'border-[color:var(--amber-line)] bg-[color:var(--amber-bg)] text-[color:var(--amber-fg)]'
                    }`}
                  >
                    {hit.rights === 'ok' ? 'Rights ready' : 'Clearance pending'}
                  </span>
                  <button
                    onClick={() => handleAddTrack(hit)}
                    disabled={alreadyAdded || !!adding[hit.trackId]}
                    className="shrink-0 rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-[12px] font-semibold text-[color:var(--ink-2)] transition hover:text-[color:var(--ink)] disabled:cursor-default disabled:opacity-60"
                  >
                    {alreadyAdded ? '✓ Added' : adding[hit.trackId] ? 'Adding…' : '+ Add'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Your Selects ── */}
        <div className="rounded-xl border border-[color:var(--border)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <b className="text-[13px] text-[color:var(--ink)]">Your Selects</b>
            <span className="ml-auto text-[12px] text-[color:var(--ink-3)]">
              {tracks.length} track{tracks.length === 1 ? '' : 's'}
            </span>
          </div>

          {tracks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[color:var(--border-2)] p-4 text-center text-[12.5px] text-[color:var(--ink-3)]">
              Add tracks from The Crate — or hit &ldquo;✨ Draft from brief&rdquo; to start from the linked brief.
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={tracks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                {tracks.map(row => (
                  <SortableTrackRow
                    key={row.id}
                    row={row}
                    onNoteChange={handleNoteChange}
                    onRemove={handleRemoveTrack}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}

          {/* Removed tray (soft-removed, recoverable) */}
          {removed.length > 0 && (
            <div className="mt-3 rounded-lg border border-[color:var(--border)]">
              <button
                onClick={() => setRemovedOpen(prev => !prev)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-[color:var(--ink-3)]"
              >
                <span>{removedOpen ? '▾' : '▸'}</span>
                <span>Removed</span>
                <span className="rounded-full bg-[color:var(--panel-2)] px-1.5 py-0.5 text-[10px]">
                  {removed.length}
                </span>
                <span className="ml-auto">Soft-removed · nothing&rsquo;s lost</span>
              </button>
              {removedOpen && (
                <div className="border-t border-[color:var(--border)] p-2">
                  {removed.map(row => (
                    <div key={row.id} className="flex items-center gap-2 px-1 py-1.5">
                      <p className="min-w-0 flex-1 truncate text-[12.5px] text-[color:var(--ink-2)]">{row.title}</p>
                      <button
                        onClick={() => handleRestoreTrack(row)}
                        className="shrink-0 text-[11.5px] text-[color:var(--indigo)] underline"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Toast (soft-remove undo) */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] px-4 py-3 text-[13px] text-[color:var(--ink)] shadow-2xl"
        >
          <span>{toast.message}</span>
          {toast.onUndo && (
            <button
              onClick={() => {
                toast.onUndo?.()
                setToast(null)
              }}
              className="font-bold text-[color:var(--indigo)]"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
