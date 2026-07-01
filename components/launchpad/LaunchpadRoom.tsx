'use client'

import { useState } from 'react'
import type { MergedChecklistItem } from '@/types'
import { TipPanel } from './TipPanel'
import { ChecklistSection, type SectionKey } from './ChecklistSection'

// ─── Section ordering ─────────────────────────────────────────────────────────
// Fixed display order per UI-SPEC: before_release → week_1 → week_2 → weeks_3_4

const SECTION_ORDER: SectionKey[] = ['before_release', 'week_1', 'week_2', 'weeks_3_4']

// ─── LaunchpadRoom ────────────────────────────────────────────────────────────
// Container for the per-project launchpad checklist. Manages local optimistic
// item state, TipPanel open/close state, and the PATCH persistence layer.
//
// Optimistic toggle: update local state immediately, then PATCH the API. Roll
// back to the prior value if the response is not ok.

export function LaunchpadRoom({
  project,
  items: initialItems,
}: {
  project: { id: string; title: string; release_date: string | null }
  items: MergedChecklistItem[]
}) {
  const [items, setItems] = useState<MergedChecklistItem[]>(initialItems)
  const [activeItem, setActiveItem] = useState<MergedChecklistItem | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // null release_date → never released → always expanded (RESEARCH Pitfall 3)
  const isReleased = project.release_date
    ? new Date(project.release_date) < new Date()
    : false

  // Group items by section in fixed order
  const itemsBySection = Object.fromEntries(
    SECTION_ORDER.map(key => [
      key,
      items.filter(item => item.section === key),
    ])
  ) as Record<SectionKey, MergedChecklistItem[]>

  // Completion counter
  const completed = items.filter(i => i.completed).length
  const total = items.length

  // Optimistic toggle with rollback on API error
  async function onToggle(key: string, completed: boolean) {
    const prior = items.find(i => i.key === key)
    if (!prior) return

    // Optimistic update
    setItems(prev =>
      prev.map(i => (i.key === key ? { ...i, completed } : i))
    )
    setSaveError(null)

    // If the TipPanel is open for this item, update it too
    if (activeItem?.key === key) {
      setActiveItem(prev => (prev ? { ...prev, completed } : null))
    }

    try {
      const res = await fetch(`/api/launchpad/${project.id}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_key: key, completed }),
      })

      if (!res.ok) {
        // Roll back to prior value
        setItems(prev =>
          prev.map(i => (i.key === key ? { ...i, completed: prior.completed } : i))
        )
        if (activeItem?.key === key) {
          setActiveItem(prev => (prev ? { ...prev, completed: prior.completed } : null))
        }
        setSaveError("Couldn't save your progress — please try again.")
      }
    } catch {
      // Network error — roll back
      setItems(prev =>
        prev.map(i => (i.key === key ? { ...i, completed: prior.completed } : i))
      )
      if (activeItem?.key === key) {
        setActiveItem(prev => (prev ? { ...prev, completed: prior.completed } : null))
      }
      setSaveError("Couldn't save your progress — please try again.")
    }
  }

  function onOpenPanel(item: MergedChecklistItem) {
    setActiveItem(item)
  }

  return (
    <div>
      {/* Completion counter */}
      <p className="mb-7 text-[13px] text-lavdim">
        {completed} of {total} steps complete
      </p>

      {/* Save error notice */}
      {saveError && (
        <div className="mb-5 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-[13px] text-rose-300">
          {saveError}
        </div>
      )}

      {/* Empty state */}
      {total === 0 && (
        <div className="rounded-[14px] border border-hair bg-card px-[18px] py-10 text-center">
          <p className="text-[15px] font-bold text-white">Checklist is being set up</p>
          <p className="mt-2 text-[13px] text-lavdim">
            Your post-release checklist will appear here once Funūn&apos;s team has configured it.
          </p>
        </div>
      )}

      {/* Sections */}
      {total > 0 && (
        <div className="space-y-9">
          {SECTION_ORDER.map(sectionKey => {
            const sectionItems = itemsBySection[sectionKey]
            if (!sectionItems || sectionItems.length === 0) return null
            return (
              <ChecklistSection
                key={sectionKey}
                sectionKey={sectionKey}
                items={sectionItems}
                isReleased={isReleased}
                onToggle={onToggle}
                onOpenPanel={onOpenPanel}
              />
            )
          })}
        </div>
      )}

      {/* TipPanel — rendered at root so it overlays everything */}
      <TipPanel item={activeItem} onClose={() => setActiveItem(null)} />
    </div>
  )
}
