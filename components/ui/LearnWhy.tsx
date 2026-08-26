'use client'

import { useId, useState } from 'react'

// ─── LearnWhy — collapsible explanation ────────────────────────────────────
// Beta feedback (2026-08-26): the settings page reads as "a bit wordy" — a
// wall of justification greets you before you've done anything. The fix is
// not to delete the explanation (it prevents real, expensive mistakes like a
// mismatched legal name freezing royalties) but to let the reader ask for it.
//
// What stays visible is the RULE; what collapses is the WHY. So a scanner
// still gets the instruction, and anyone who wants the reasoning is one click
// away. Never collapse an action or a status line behind this — only the
// explanatory prose.
export function LearnWhy({
  label = 'Learn why',
  children,
}: {
  label?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex items-center gap-1 rounded text-[11.5px] font-medium text-lav/80 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lav/50"
      >
        {label}
        <svg
          viewBox="0 0 16 16"
          width="11"
          height="11"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={[
            'motion-safe:transition-transform motion-safe:duration-150',
            open ? 'rotate-180' : '',
          ].join(' ')}
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div id={panelId} className="space-y-1">
          {children}
        </div>
      )}
    </div>
  )
}
