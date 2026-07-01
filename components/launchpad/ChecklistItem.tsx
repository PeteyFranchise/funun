'use client'

import type { MergedChecklistItem } from '@/types'

// ─── ChecklistItem ───────────────────────────────────────────────────────────
// A single row in the launchpad checklist. The full row is clickable and opens
// the TipPanel. The checkbox is independently clickable — it calls
// stopPropagation so toggling completion does NOT open the panel.
//
// Checkbox hit area is at least 44×44px via p-2.5 wrapper (UI-SPEC accessibility).

export function ChecklistItem({
  item,
  onToggle,
  onOpenPanel,
}: {
  item: MergedChecklistItem
  onToggle: (key: string, completed: boolean) => void
  onOpenPanel: (item: MergedChecklistItem) => void
}) {
  return (
    <div
      className="flex cursor-pointer items-center gap-4 rounded-[14px] border border-hair bg-card px-[18px] py-4 hover:bg-white/5"
      onClick={() => onOpenPanel(item)}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') onOpenPanel(item)
      }}
    >
      {/* Checkbox — independent from row click via stopPropagation */}
      <div
        className="shrink-0 p-2.5"
        onClick={e => {
          e.stopPropagation()
          onToggle(item.key, !item.completed)
        }}
      >
        <button
          role="checkbox"
          aria-checked={item.completed}
          aria-label={item.completed ? `Uncheck ${item.label}` : `Check ${item.label}`}
          className={`flex h-5 w-5 items-center justify-center rounded border transition ${
            item.completed
              ? 'border-emerald-400 bg-emerald-400'
              : 'border-white/20 bg-transparent hover:border-white/40'
          }`}
          onClick={e => {
            e.stopPropagation()
            onToggle(item.key, !item.completed)
          }}
        >
          {item.completed && (
            <svg viewBox="0 0 12 9" className="h-3 w-3" fill="none" stroke="white" strokeWidth="2">
              <path d="M1 4.5L4.5 8L11 1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      {/* Label */}
      <span
        className={`text-[14px] font-bold ${
          item.completed ? 'text-white/40 line-through' : 'text-white'
        }`}
      >
        {item.label}
      </span>
    </div>
  )
}
