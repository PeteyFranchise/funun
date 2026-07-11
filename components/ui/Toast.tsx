'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Minimal, dependency-free toast. `useToast()` owns a single transient
// message; the consumer renders `toast` somewhere near the root and calls
// `notify('…')` to flash it. Used for the share-link "Link copied!"
// confirmation on the clipboard fallback path (Phase 9 D-05).
export function useToast(durationMs = 2200) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notify = useCallback(
    (msg: string) => {
      setMessage(msg)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setMessage(null), durationMs)
    },
    [durationMs]
  )

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const toast = message ? <ToastBubble message={message} /> : null
  return { toast, notify }
}

function ToastBubble({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-8 z-[60] flex justify-center px-4"
    >
      <div className="animate-[funun-fade-up_.22s_ease-out] rounded-full border border-hairstrong bg-card2/95 px-5 py-3 text-[13.5px] font-semibold text-white shadow-[0_16px_40px_-12px_rgba(0,0,0,.7)] backdrop-blur">
        {message}
      </div>
    </div>
  )
}
