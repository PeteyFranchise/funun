'use client'

import { useEffect } from 'react'

// Static lyrics slide-up sheet (D-08, D-09) — renders only `lyricsText`.
// Forward-compatible with D-13 (line-timestamped `lyrics.synced`) but that
// shape is deliberately ignored this phase: no per-line highlight state is
// driven by playback position here.
export function LyricsPanel({
  open,
  onClose,
  trackTitle,
  lyricsText,
}: {
  open: boolean
  onClose: () => void
  trackTitle: string
  lyricsText: string
}) {
  // Convenience dismiss — not one of the three required dismiss paths
  // (handle / close button / scrim) but consistent with overlay conventions.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const lines = lyricsText.split('\n')

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/60 transition-opacity duration-[280ms] ease-out motion-reduce:duration-200 motion-reduce:ease-linear ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      onClick={onClose}
      aria-hidden={!open}
    >
      {/* Sheet — the player (mounted by the parent) keeps running underneath;
          this is an overlay, not a route change and not an audio-pausing modal. */}
      <div
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-[560px] rounded-t-[18px] border-t border-hairstrong bg-card px-6 pb-8 pt-3 shadow-[0_-20px_60px_-20px_rgba(0,0,0,.7)] transition-transform duration-[280ms] ease-out motion-reduce:transition-opacity motion-reduce:duration-200 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ height: '78vh' }}
      >
        {/* Drag handle — also a dismiss target */}
        <button
          aria-label="Dismiss lyrics"
          onClick={onClose}
          className="mx-auto mb-4 block h-[4px] w-[36px] rounded-full bg-white/25"
        />

        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <span className="truncate pr-3 text-[20px] font-extrabold text-white">{trackTitle}</span>
          <button
            aria-label="Close lyrics"
            onClick={onClose}
            className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-md"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — static text only, single block/newline-split for layout;
            no per-line active-index/highlight state tied to playback position. */}
        <div className="h-[calc(100%-90px)] overflow-y-auto text-[16px] font-medium leading-[1.6] text-lav">
          {lines.map((line, i) => (
            <p key={i} className="mb-1 min-h-[1.6em]">{line}</p>
          ))}
        </div>
      </div>
    </div>
  )
}
