'use client'

import { useEffect, useRef, useState } from 'react'
import type { CollaboratorProfile } from '@/lib/collaborators'
import { assembleDisplayName } from '@/lib/collaborators'
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

type Props = {
  onSelect: (collaborator: CollaboratorProfile) => void
}

export function CollaboratorPicker({ onSelect }: Props) {
  const [roster, setRoster] = useState<CollaboratorProfile[]>([])
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
      })
      .catch(() => {
        // non-blocking — picker degrades to empty state
      })
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
  const active = roster.filter(c => !c.archived_at)

  // Build grouped lists (no search) or flat filtered list (search active)
  const searchQuery = search.toLowerCase()
  const matchesSearch = (c: CollaboratorProfile) =>
    assembleDisplayName(c).toLowerCase().includes(searchQuery)

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
    setRoster(prev => [...prev, collab].sort((a, b) => assembleDisplayName(a).localeCompare(assembleDisplayName(b))))
    handleSelect(collab)
  }

  const isEmpty = roster.length === 0

  return (
    <div ref={containerRef} className="relative inline-block">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => {
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
        className="rounded-lg border border-dashed border-white/15 px-2 py-1 text-xs text-white/50 transition hover:border-white/30 hover:text-white"
      >
        {isEmpty ? 'Add collaborator' : 'Pick from roster'}
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
                      <PickerItem key={collab.id} collab={collab} onSelect={handleSelect} />
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
                          <PickerItem key={collab.id} collab={collab} onSelect={handleSelect} />
                        ))}
                      </>
                    )}

                    {mostRecent.length > 0 && (
                      <>
                        <li className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-lavdim">
                          RECENTLY ADDED
                        </li>
                        {mostRecent.map(collab => (
                          <PickerItem key={collab.id} collab={collab} onSelect={handleSelect} />
                        ))}
                      </>
                    )}

                    {allRest.length > 0 && (
                      <>
                        <li className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-lavdim">
                          ALL COLLABORATORS
                        </li>
                        {allRest.map(collab => (
                          <PickerItem key={collab.id} collab={collab} onSelect={handleSelect} />
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
  onSelect,
}: {
  collab: CollaboratorProfile
  onSelect: (c: CollaboratorProfile) => void
}) {
  const proLabel =
    collab.pro && collab.pro !== 'none'
      ? (PRO_LABELS[collab.pro as keyof typeof PRO_LABELS] ?? collab.pro)
      : 'No PRO'
  return (
    <li role="option" aria-selected={false}>
      <button
        type="button"
        onClick={() => onSelect(collab)}
        className="w-full px-4 py-2 text-left hover:bg-white/5"
      >
        <span className="block text-sm text-white">{assembleDisplayName(collab)}</span>
        <span className="block text-xs text-lavdim">{proLabel}</span>
      </button>
    </li>
  )
}
