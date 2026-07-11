'use client'

import { useToast } from '@/components/ui/Toast'

// Owner-view "Share" button on the profile header (Phase 9 D-04). Shares the
// public profile URL via the Web Share API, falling back to a clipboard copy
// with a toast on desktop (D-05). Distinct from the player's track share —
// this one is profile-focused.
export function ProfileShareButton({ handle, name }: { handle: string | null; name: string }) {
  const { toast, notify } = useToast()

  async function onShare() {
    const url =
      typeof window === 'undefined'
        ? ''
        : handle
          ? `${window.location.origin}/u/${handle}`
          : window.location.origin + window.location.pathname
    const text = `Check out ${name} on Funūn → ${url}`

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: name, text, url })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      notify('Link copied!')
    } catch {
      notify('Could not copy link')
    }
  }

  return (
    <>
      <button
        onClick={onShare}
        className="inline-flex items-center gap-[9px] rounded-[11px] border border-hairstrong bg-card px-[22px] py-[13px] text-[15px] font-bold text-white"
      >
        Share
      </button>
      {toast}
    </>
  )
}
