'use client'

import { useEffect, useRef, useState } from 'react'
import type { CollaboratorProfile } from '@/lib/collaborators'
import { CollaboratorForm } from '@/components/collaborators/CollaboratorForm'
import { PRO_LABELS } from '@/lib/metadata/schema'

// ─── CollaboratorPicker ───────────────────────────────────────
// Reusable dropdown picker — fetches GET /api/collaborators on mount.
// Used inside ComposerEditor (MetadataStudio) and SplitSheetBuilder rows.
// When roster is empty the trigger reads "Add collaborator" and opens
// the form directly (D-06).

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

  const filtered = roster.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  function handleSelect(collab: CollaboratorProfile) {
    onSelect(collab)
    setOpen(false)
    setSearch('')
    setAddingNew(false)
  }

  function handleNewSaved(collab: CollaboratorProfile) {
    setRoster(prev => [...prev, collab].sort((a, b) => a.name.localeCompare(b.name)))
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

              {/* List */}
              <ul className="max-h-56 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <li className="px-4 py-2 text-sm text-white/30">No results</li>
                ) : (
                  filtered.map(collab => {
                    const proLabel = collab.pro && collab.pro !== 'none'
                      ? (PRO_LABELS[collab.pro as keyof typeof PRO_LABELS] ?? collab.pro)
                      : 'No PRO'
                    return (
                      <li key={collab.id} role="option" aria-selected={false}>
                        <button
                          type="button"
                          onClick={() => handleSelect(collab)}
                          className="w-full px-4 py-2 text-left hover:bg-white/5"
                        >
                          <span className="block text-sm text-white">{collab.name}</span>
                          <span className="block text-xs text-lavdim">{proLabel}</span>
                        </button>
                      </li>
                    )
                  })
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
