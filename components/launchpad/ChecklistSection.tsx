'use client'

import { useState } from 'react'
import type { MergedChecklistItem } from '@/types'
import { ChecklistItem } from './ChecklistItem'

// ─── Section metadata ─────────────────────────────────────────────────────────

export type SectionKey = 'before_release' | 'week_1' | 'week_2' | 'weeks_3_4'

export const SECTION_META: Record<SectionKey, { header: string; subLabel: string }> = {
  before_release: { header: 'Before release', subLabel: 'Pre-release prep' },
  week_1: { header: 'Week 1 — Release week', subLabel: 'Algorithm window opens' },
  week_2: { header: 'Week 2', subLabel: 'Keep the momentum' },
  weeks_3_4: { header: 'Weeks 3–4', subLabel: 'Sustain and expand' },
}

// ─── CompactCheckbox ──────────────────────────────────────────────────────────
// Inline checkbox for the collapsed before-release confirmation block.
// No TipPanel interaction — just toggle completion.

function CompactCheckbox({
  item,
  onToggle,
}: {
  item: MergedChecklistItem
  onToggle: (key: string, completed: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <button
        role="checkbox"
        aria-checked={item.completed}
        aria-label={item.label}
        onClick={() => onToggle(item.key, !item.completed)}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
          item.completed
            ? 'border-emerald-400 bg-emerald-400'
            : 'border-white/20 bg-transparent hover:border-white/40'
        }`}
      >
        {item.completed && (
          <svg viewBox="0 0 12 9" className="h-2.5 w-2.5" fill="none" stroke="white" strokeWidth="2">
            <path d="M1 4.5L4.5 8L11 1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span className={`text-[13px] ${item.completed ? 'text-white/40 line-through' : 'text-white/70'}`}>
        {item.label}
      </span>
    </label>
  )
}

// ─── ChecklistSection ─────────────────────────────────────────────────────────
// Renders a week section with a header, sub-label, and item rows.
//
// For the before_release section only: when isReleased is true, the section
// auto-collapses to a confirmation block. A chevron toggle lets the user
// expand/collapse the full item list. All other sections are always expanded.

export function ChecklistSection({
  sectionKey,
  items,
  isReleased,
  onToggle,
  onOpenPanel,
}: {
  sectionKey: SectionKey
  items: MergedChecklistItem[]
  isReleased: boolean
  onToggle: (key: string, completed: boolean) => void
  onOpenPanel: (item: MergedChecklistItem) => void
}) {
  const meta = SECTION_META[sectionKey]
  const isBeforeRelease = sectionKey === 'before_release'

  // The before_release section starts collapsed when the project is past release date
  const [isOpen, setIsOpen] = useState<boolean>(!isBeforeRelease || !isReleased)

  const sectionId = `section-${sectionKey}`

  return (
    <section>
      {/* Section header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">
            {meta.header}
          </h2>
          <p className="mt-1 text-[13px] text-lavdim">{meta.subLabel}</p>
        </div>

        {/* Collapse toggle — only on before_release when isReleased */}
        {isBeforeRelease && isReleased && (
          <button
            aria-expanded={isOpen}
            aria-controls={`${sectionId}-items`}
            onClick={() => setIsOpen(prev => !prev)}
            className="shrink-0 rounded-lg border border-white/10 p-1.5 text-white/50 transition hover:border-white/30 hover:text-white"
            aria-label={isOpen ? 'Collapse before release section' : 'Expand before release section'}
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Collapsed before-release: confirmation block */}
      {isBeforeRelease && isReleased && !isOpen && (
        <div className="rounded-[14px] border border-amber-400/20 bg-amber-400/10 px-[18px] py-4">
          <p className="mb-3 text-[13px] font-bold text-white">
            Did you handle this before release?
          </p>
          <div className="space-y-2">
            {items.map(item => (
              <CompactCheckbox key={item.key} item={item} onToggle={onToggle} />
            ))}
          </div>
        </div>
      )}

      {/* Expanded items */}
      <div
        id={`${sectionId}-items`}
        className={`space-y-[10px] transition-all duration-200 ${isOpen ? '' : 'hidden'}`}
      >
        {items.map(item => (
          <ChecklistItem
            key={item.key}
            item={item}
            onToggle={onToggle}
            onOpenPanel={onOpenPanel}
          />
        ))}
      </div>
    </section>
  )
}
