'use client'

import { useEffect, useState } from 'react'
import type { SocialPost } from '@/lib/launchpad/campaigns'

// ─── SlotGeneratePanel ────────────────────────────────────────────────────────
// D-10 preview-then-accept panel. Shell is verbatim TipPanel (slide-in from the
// right, backdrop click-close, Escape key, same container/border/bg/footer
// classes). Shows the current caption and an AI suggestion side-by-side; the
// write only happens on an explicit "Use this" click — never on generation
// completing.

export function SlotGeneratePanel({
  projectId,
  campaignId,
  slot,
  onClose,
  onAccept,
}: {
  projectId: string
  campaignId: string
  slot: SocialPost | null
  onClose: () => void
  onAccept: (slotId: string, caption: string) => void
}) {
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Escape closes the panel (only when a slot is open)
  useEffect(() => {
    if (!slot) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slot, onClose])

  // On open (slot becomes non-null), POST to the generate route for a preview
  useEffect(() => {
    if (!slot) {
      setSuggestion(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    async function fetchSuggestion() {
      if (!slot) return
      setLoading(true)
      setError(null)
      setSuggestion(null)
      try {
        const res = await fetch(
          `/api/launchpad/${projectId}/campaigns/${campaignId}/slots/${slot.id}/generate`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' } }
        )
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setError("Couldn't generate a suggestion — please try again.")
          return
        }
        const caption = (json as { data?: { caption?: string } }).data?.caption
        if (!caption) {
          setError("Couldn't generate a suggestion — please try again.")
          return
        }
        setSuggestion(caption)
      } catch {
        if (!cancelled) setError("Couldn't generate a suggestion — please try again.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchSuggestion()
    return () => { cancelled = true }
  }, [slot, projectId, campaignId])

  if (!slot) return null

  // Label: "Generate hook" for short_form_video/stories; "Generate caption" otherwise
  const isHook = slot.content_type === 'short_form_video' || slot.content_type === 'stories'
  const panelTitle = isHook ? 'Generate hook' : 'Generate caption'

  function handleAccept() {
    if (!suggestion || !slot) return
    onAccept(slot.id, suggestion)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop — click closes */}
      <button
        aria-label="Close generate panel"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0a0a0f] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
          <h2 className="mt-0.5 text-lg font-semibold text-white">{panelTitle}</h2>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/10 p-1.5 text-white/50 transition hover:border-white/30 hover:text-white"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Current block */}
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[.14em] text-lavdim">Current</p>
            <p className="mt-2 text-[14px] text-white/60">
              {slot.caption || <span className="italic">No caption yet.</span>}
            </p>
          </div>

          {/* Suggestion block */}
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[.14em] text-lavdim">Suggestion</p>
            {loading && (
              <p className="mt-2 text-[14px] text-lavdim">Generating…</p>
            )}
            {error && !loading && (
              <p className="mt-2 text-xs text-rose-300">{error}</p>
            )}
            {suggestion && !loading && !error && (
              <div className="mt-2 rounded-[14px] border border-brandindigo/30 bg-brandindigo/5 p-4">
                <p className="text-[14px] text-white">{suggestion}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer — two buttons */}
        <div className="border-t border-white/10 p-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/15 px-4 py-2.5 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={!suggestion}
            className="flex-1 rounded-lg bg-grad px-4 py-2.5 text-sm font-bold text-white shadow-cta transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Use this
          </button>
        </div>
      </aside>
    </div>
  )
}
