'use client'

import { useEffect } from 'react'
import type { MergedChecklistItem } from '@/types'

// ─── TipPanel ────────────────────────────────────────────────────────────────
// Slide-in panel from the right displaying the tip body and action CTA for a
// checklist item. Shell is a verbatim copy of ToolSidePanel — same container,
// backdrop, aside, header, body, footer classes plus Escape key behavior.

export function TipPanel({
  item,
  onClose,
}: {
  item: MergedChecklistItem | null
  onClose: () => void
}) {
  // Reset on item change — mirrors ToolSidePanel reset useEffect
  useEffect(() => {
    // no internal state to reset; here for parity with the ToolSidePanel shell
  }, [item])

  // Escape closes the panel (only when an item is open)
  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, onClose])

  if (!item) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop — click closes */}
      <button
        aria-label="Close tip panel"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0a0a0f] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
          <h2 className="mt-0.5 text-lg font-semibold text-white">{item.label}</h2>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/10 p-1.5 text-white/50 transition hover:border-white/30 hover:text-white"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {item.tip_body ? (
            <p className="text-[14px] leading-[1.5] text-white/70">{item.tip_body}</p>
          ) : (
            <p className="text-[14px] leading-[1.5] text-lavdim">
              Steps for this item are coming soon.
            </p>
          )}
        </div>

        {/* Footer CTA — hidden when action_href is null */}
        <div className="border-t border-white/10 p-5">
          {item.action_href && (
            <a
              href={item.action_href}
              target={item.action_type === 'external_url' ? '_blank' : undefined}
              rel={item.action_type === 'external_url' ? 'noopener noreferrer' : undefined}
              className="block w-full rounded-lg bg-white px-4 py-2.5 text-center text-sm font-bold text-black transition hover:bg-white/90"
            >
              {item.action_label}
            </a>
          )}
        </div>
      </aside>
    </div>
  )
}
