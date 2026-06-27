'use client'

import { useState } from 'react'
import type { CollaboratorProfile } from '@/lib/collaborators'
import { CollaboratorCard } from '@/components/collaborators/CollaboratorCard'
import { CollaboratorForm } from '@/components/collaborators/CollaboratorForm'

// ─── CollaboratorRoster ───────────────────────────────────────
// Page-level client component: heading, CTA, card grid, and
// inline create/edit form (EditProjectForm toggle pattern).

type Props = {
  collaborators: CollaboratorProfile[]
}

export function CollaboratorRoster({ collaborators }: Props) {
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [list, setList] = useState<CollaboratorProfile[]>(collaborators)

  function handleSaved(saved: CollaboratorProfile) {
    setList(prev => {
      const idx = prev.findIndex(c => c.id === saved.id)
      if (idx !== -1) {
        const next = [...prev]
        next[idx] = saved
        return next.sort((a, b) => a.name.localeCompare(b.name))
      }
      return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
    })
    setCreating(false)
    setEditingId(null)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-white">Collaborators</h1>
          <p className="mt-1 text-[14px] text-lavdim">
            Your roster — add once, auto-fill everywhere.
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => {
              setCreating(true)
              setEditingId(null)
            }}
            className="rounded-lg bg-grad px-4 py-2 text-sm font-semibold text-white shadow-cta"
          >
            Add collaborator
          </button>
        )}
      </div>

      {/* Create form (inline, replaces button while open) */}
      {creating && (
        <CollaboratorForm
          onSaved={handleSaved}
          onCancel={() => setCreating(false)}
        />
      )}

      {/* Card grid */}
      {list.length === 0 && !creating ? (
        /* Empty state */
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          {/* People icon — 40×40 */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-10 w-10 text-white/20"
            aria-hidden
          >
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3z" />
            <path d="M8 11c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3z" />
            <path d="M8 13c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            <path d="M16 13c-.29 0-.62.02-.97.05C16.19 13.89 17 15.1 17 17v2h7v-2c0-2.66-5.33-4-8-4z" />
          </svg>
          <p className="text-[15px] font-semibold text-white/60">No collaborators yet</p>
          <p className="max-w-xs text-[13px] text-lavdim">
            Add the people you work with once — their rights data auto-fills into split sheets and
            contracts.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-2 rounded-lg bg-grad px-4 py-2 text-sm font-semibold text-white shadow-cta"
          >
            Add your first collaborator
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(collab =>
            editingId === collab.id ? (
              <div key={collab.id} className="sm:col-span-2 lg:col-span-3">
                <CollaboratorForm
                  initial={collab}
                  onSaved={handleSaved}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            ) : (
              <CollaboratorCard
                key={collab.id}
                collaborator={collab}
                onEdit={() => {
                  setEditingId(collab.id)
                  setCreating(false)
                }}
              />
            )
          )}
        </div>
      )}
    </div>
  )
}
