'use client'

import { useState } from 'react'
import { attemptCopy, type ClipboardAttempt } from '@/lib/clipboard/attempt-copy'

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
 *
 * `onOutcome` receives the full `ClipboardAttempt` of the fallback copy
 * (not fired at all when the native share sheet succeeds) so callers can
 * show a failure affordance instead of silently doing nothing — the
 * no-Web-Share path previously threw a synchronous TypeError straight out
 * of this function on any non-secure origin, a fallback with no fallback.
 */
export function shareOrCopy(url: string, caption: string, onOutcome: (outcome: ClipboardAttempt) => void) {
  if (typeof navigator !== 'undefined' && navigator.share) {
    navigator
      .share({ title: caption, url })
      .catch((err: unknown) => {
        // AbortError = user cancelled the OS share sheet — not a failure.
        if ((err as DOMException)?.name === 'AbortError') return
        void attemptCopy(`${caption} → ${url}`).then(onOutcome)
      })
    return
  }
  void attemptCopy(`${caption} → ${url}`).then(onOutcome)
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
  const [failed, setFailed] = useState(false)

  function handleClick() {
    // shareOrCopy() calls navigator.share() as its own first statement —
    // this handler is not async and has no leading await, so the call
    // stays inside the click's user-gesture window.
    shareOrCopy(url, caption, outcome => {
      if (outcome === 'copied') {
        setFailed(false)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      } else {
        setCopied(false)
        setFailed(true)
        setTimeout(() => setFailed(false), 1500)
      }
    })
  }

  return (
    <button type="button" onClick={handleClick} className={className ?? DEFAULT_CLASS}>
      {copied ? 'Link copied!' : failed ? "Couldn't copy" : label}
    </button>
  )
}
