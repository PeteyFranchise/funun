'use client'

import { useEffect, useRef, useState } from 'react'
import type { CollaboratorProfile } from '@/lib/collaborators'
import type {
  CollaboratorIdentityHint,
  CollaboratorIdentityHints,
} from '@/lib/collaborators/display-identity'
import {
  collaboratorDisplayName,
  matchesCollaboratorSearch,
  readIdentityHints,
} from '@/lib/collaborators/display-identity'
import { CollaboratorIdentityLabel } from '@/components/collaborators/CollaboratorIdentityLabel'
import { CollaboratorForm } from '@/components/collaborators/CollaboratorForm'
import { PRO_LABELS } from '@/lib/metadata/schema'

// ─── CollaboratorPicker ───────────────────────────────────────
// Reusable dropdown picker — fetches GET /api/collaborators on mount.
// Used inside ComposerEditor (MetadataStudio) and SplitSheetBuilder rows.
// When roster is empty the trigger reads "Add collaborator" and opens
// the form directly (D-06).
//
// With no search active the list is grouped:
//   FAVORITES — starred collaborators (is_favorite = true)
//   RECENTLY ADDED — top 5 non-favorites by created_at DESC
//   ALL COLLABORATORS — remaining non-favorites
// Archived collaborators (archived_at set) are excluded from all groups (D-12).
// When search is active groups collapse to a single flat results list.
//
// Selection is where "which Eric?" actually costs something, so each row shows
// the SAME identity stack as the roster card — the shared
// CollaboratorIdentityLabel, fed by the server-decided identity hints the
// roster endpoint returns — and search matches the visible handle as well as
// the name. Status and PRO stay as tertiary detail. The duplicate-remediation
// affordance deliberately does NOT appear here: a picker must make the right
// row identifiable; editing the roster belongs on the roster screen.

type Props = {
  onSelect: (collaborator: CollaboratorProfile) => void
  /** Collaborators already attached to the current surface. */
  excludeIds?: string[]
}

export function CollaboratorPicker({ onSelect, excludeIds = [] }: Props) {
  const [roster, setRoster] = useState<CollaboratorProfile[]>([])
  const [identityHints, setIdentityHints] = useState<CollaboratorIdentityHints>({})
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch roster on mount
  useEffect(() => {
    fetch('/api/collaborators')
      .then(r => r.json())
      .then(json => {
        if (Array.isArray(json.data)) setRoster(json.data)
        setIdentityHints(readIdentityHints(json.identityHints))
      })
      .catch(() => {
        // non-blocking — picker degrades to empty state
      })
      .finally(() => setLoading(false))
  }, [])

  // Close on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
        setAddingNew(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  // Filter out archived rows — never appear in picker
  const excluded = new Set(excludeIds)
  const active = roster.filter(c => !c.archived_at && !excluded.has(c.id))

  // Build grouped lists (no search) or flat filtered list (search active).
  // Search matches the assembled name AND the visible handle, typed with or
  // without a leading '@'.
  const searchQuery = search.trim()
  const matchesSearch = (c: CollaboratorProfile) =>
    matchesCollaboratorSearch(c, identityHints[c.id], searchQuery)

  // Sort active non-favorites by created_at DESC for Most Recent group
  const activeSortedByRecent = [...active].sort(
    (a, b) => (b.created_at > a.created_at ? 1 : -1)
  )

  const favoritesAll = active.filter(c => c.is_favorite)
  const nonFavoritesRecent = activeSortedByRecent.filter(c => !c.is_favorite)

  // Grouped sections (shown when no search query)
  const favorites = favoritesAll.filter(matchesSearch)
  const mostRecent = nonFavoritesRecent.slice(0, 5).filter(matchesSearch)
  const allRest = nonFavoritesRecent.slice(5).filter(matchesSearch)

  // Flat list for search mode
  const flatFiltered = active.filter(matchesSearch)

  function handleSelect(collab: CollaboratorProfile) {
    onSelect(collab)
    setOpen(false)
    setSearch('')
    setAddingNew(false)
  }

  function handleNewSaved(collab: CollaboratorProfile) {
    setRoster(prev =>
      [...prev, collab].sort((a, b) =>
        collaboratorDisplayName(a).localeCompare(collaboratorDisplayName(b))
      )
    )
    handleSelect(collab)
  }

  const isEmpty = active.length === 0

  return (
    <div ref={containerRef} className="relative inline-block">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => {
          if (loading) return
          if (isEmpty) {
            setAddingNew(true)
            setOpen(true)
          } else {
            setOpen(prev => !prev)
            setAddingNew(false)
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={loading}
        className="rounded-lg border border-dashed border-white/15 px-2 py-1 text-xs text-white/50 transition hover:border-white/30 hover:text-white"
      >
        {loading ? 'Loading roster…' : isEmpty ? 'Add collaborator' : 'Pick from roster'}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[240px] max-w-[320px] rounded-xl border border-hairstrong bg-card shadow-xl"
          role={addingNew ? undefined : 'listbox'}
        >
          {addingNew ? (
            /* Inline new collaborator form */
            <div className="p-3">
              <CollaboratorForm
                onSaved={handleNewSaved}
                onCancel={() => {
                  setAddingNew(false)
                  if (isEmpty) setOpen(false)
                }}
              />
            </div>
          ) : (
            <>
              {/* Search */}
              <div className="p-2">
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search collaborators…"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30"
                />
              </div>

              {/* List — grouped (no search) or flat (search active) */}
              <ul className="max-h-56 overflow-y-auto py-1">
                {searchQuery ? (
                  /* Flat search results */
                  flatFiltered.length === 0 ? (
                    <li className="px-4 py-2 text-sm text-white/30">No results</li>
                  ) : (
                    flatFiltered.map(collab => (
                      <PickerItem
                        key={collab.id}
                        collab={collab}
                        hint={identityHints[collab.id] ?? null}
                        onSelect={handleSelect}
                      />
                    ))
                  )
                ) : (
                  /* Grouped roster */
                  <>
                    {favorites.length === 0 && mostRecent.length === 0 && allRest.length === 0 && (
                      <li className="px-4 py-2 text-sm text-white/30">No results</li>
                    )}

                    {favorites.length > 0 && (
                      <>
                        <li className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-lavdim">
                          FAVORITES
                        </li>
                        {favorites.map(collab => (
                          <PickerItem
                            key={collab.id}
                            collab={collab}
                            hint={identityHints[collab.id] ?? null}
                            onSelect={handleSelect}
                          />
                        ))}
                      </>
                    )}

                    {mostRecent.length > 0 && (
                      <>
                        <li className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-lavdim">
                          RECENTLY ADDED
                        </li>
                        {mostRecent.map(collab => (
                          <PickerItem
                            key={collab.id}
                            collab={collab}
                            hint={identityHints[collab.id] ?? null}
                            onSelect={handleSelect}
                          />
                        ))}
                      </>
                    )}

                    {allRest.length > 0 && (
                      <>
                        <li className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-lavdim">
                          ALL COLLABORATORS
                        </li>
                        {allRest.map(collab => (
                          <PickerItem
                            key={collab.id}
                            collab={collab}
                            hint={identityHints[collab.id] ?? null}
                            onSelect={handleSelect}
                          />
                        ))}
                      </>
                    )}
                  </>
                )}
              </ul>

              {/* Add new collaborator — bottom action */}
              <div className="border-t border-hair">
                <button
                  type="button"
                  onClick={() => setAddingNew(true)}
                  className="w-full px-4 py-2 text-left text-sm font-medium text-brandindigo hover:bg-white/5"
                >
                  Add new collaborator
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── PickerItem ───────────────────────────────────────────────
// Individual row inside the picker dropdown list.
function PickerItem({
  collab,
  hint,
  onSelect,
}: {
  collab: CollaboratorProfile
  hint?: CollaboratorIdentityHint | null
  onSelect: (c: CollaboratorProfile) => void
}) {
  const proLabel =
    collab.pro && collab.pro !== 'none'
      ? (PRO_LABELS[collab.pro as keyof typeof PRO_LABELS] ?? collab.pro)
      : 'No PRO'
  const detail = collab.claimed_by ? `Funūn member · ${proLabel}` : proLabel
  return (
    <li role="option" aria-selected={false}>
      <button
        type="button"
        onClick={() => onSelect(collab)}
        className="w-full px-4 py-2 text-left hover:bg-white/5"
      >
        {/* linkProfile stays off: this row IS a button, and an anchor inside
            a button is invalid markup. The handle still renders as text. */}
        <CollaboratorIdentityLabel
          collaborator={collab}
          hint={hint}
          align="left"
          nameClassName="text-sm text-white"
        />
        <span className="block text-xs text-lavdim">{detail}</span>
      </button>
    </li>
  )
}
