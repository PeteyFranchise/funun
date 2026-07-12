'use client'

import { useState } from 'react'

// ─── ShareButton ──────────────────────────────────────────────────────
// Web-Share-first, clipboard-fallback share affordance. Reused for the
// whole-profile Share button (owner view, ProfileView.tsx) and any
// per-track share entry point. The `url`/`caption` are resolved by the
// caller (server component) — this component never builds or prepends
// an origin itself.

/**
 * Fire the native OS share sheet, falling back to a clipboard copy.
 *
 * `navigator.share()` MUST be the very first statement this function
 * executes — calling it after any `await` yields the event loop and,
 * on Safari especially, the call is silently rejected once the
 * triggering user-gesture window has expired (RESEARCH.md Pitfall 5).
 * Callers must invoke this synchronously from an onClick handler, with
 * no leading `await`.
 */
export function shareOrCopy(url: string, caption: string, onCopied: () => void) {
  if (typeof navigator !== 'undefined' && navigator.share) {
    navigator
      .share({ title: caption, url })
      .catch((err: unknown) => {
        // AbortError = user cancelled the OS share sheet — not a failure.
        if ((err as DOMException)?.name === 'AbortError') return
        void navigator.clipboard.writeText(`${caption} → ${url}`).then(onCopied)
      })
    return
  }
  void navigator.clipboard.writeText(`${caption} → ${url}`).then(onCopied)
}

const DEFAULT_CLASS =
  'inline-flex items-center gap-[9px] rounded-[11px] border border-hairstrong bg-card px-[22px] py-[13px] text-[15px] font-bold text-white'

export function ShareButton({
  url,
  caption,
  className,
  label = 'Share',
}: {
  url: string
  caption: string
  className?: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)

  function handleClick() {
    // shareOrCopy() calls navigator.share() as its own first statement —
    // this handler is not async and has no leading await, so the call
    // stays inside the click's user-gesture window.
    shareOrCopy(url, caption, () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button type="button" onClick={handleClick} className={className ?? DEFAULT_CLASS}>
      {copied ? 'Link copied!' : label}
    </button>
  )
}
