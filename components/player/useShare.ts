'use client'

import { useCallback } from 'react'

export type SharePayload = {
  // Absolute URL to the public player for this release.
  url: string
  // Track title the caption is focused on (D-06).
  title: string
  artist?: string | null
}

// Track-focused caption embedded in the shared content (Phase 9 D-06).
export function shareCaption(p: SharePayload): string {
  const who = p.artist ? ` by ${p.artist}` : ''
  return `Listen to '${p.title}'${who} on Funūn → ${p.url}`
}

// Web Share API when available (opens the OS share sheet), clipboard copy as
// the desktop fallback, confirmed with a toast (Phase 9 D-05). `onCopied` is
// called only on the fallback path so the caller can flash its own toast.
export function useShare(onCopied?: (message: string) => void) {
  const share = useCallback(
    async (p: SharePayload) => {
      const text = shareCaption(p)
      const nav = typeof navigator !== 'undefined' ? navigator : undefined

      if (nav && typeof nav.share === 'function') {
        try {
          await nav.share({ title: p.artist ? `${p.title} - ${p.artist}` : p.title, text, url: p.url })
          return
        } catch (e) {
          // User dismissed the sheet - treat as a no-op, don't fall back.
          if (e instanceof DOMException && e.name === 'AbortError') return
          // Any other failure falls through to the clipboard path below.
        }
      }

      // Desktop fallback copies the bare URL (not the caption) so the
      // "Link copied!" toast stays accurate and matches the "Copy link" action.
      await copyToClipboard(p.url, onCopied)
    },
    [onCopied]
  )

  // Overflow-menu "Copy link" — copies the bare URL, not the caption.
  const copyLink = useCallback(
    async (url: string) => {
      await copyToClipboard(url, onCopied)
    },
    [onCopied]
  )

  return { share, copyLink }
}

async function copyToClipboard(value: string, onCopied?: (message: string) => void) {
  try {
    await navigator.clipboard.writeText(value)
    onCopied?.('Link copied!')
  } catch {
    onCopied?.('Could not copy link')
  }
}
