'use client'

import { useEffect, useRef, useState } from 'react'
import { shareOrCopy } from './ShareButton'

// ─── ProfileMoreMenu ──────────────────────────────────────────────────
// Visitor "more options" (⋯) menu on the public profile (PROFILE-08).
// Phase 9 ships exactly one item — "Copy profile link" — using the same
// Web-Share-then-clipboard-fallback mechanism as ShareButton. Report/Block
// (Phase 13, SAFETY-01/02) are deliberately NOT built here — see the
// insertion-point comment below.

export function ProfileMoreMenu({
  profileUrl,
  caption,
}: {
  profileUrl: string
  caption: string
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  function handleCopyLink() {
    shareOrCopy(profileUrl, caption, () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More options"
        className="inline-flex items-center justify-center rounded-[11px] border border-hairstrong bg-card p-[13px] text-white"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 min-w-[200px] rounded-xl border border-hair bg-card py-[6px] shadow-[0_12px_30px_-10px_rgba(0,0,0,.5)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleCopyLink}
            className="w-full px-[14px] py-[10px] text-left text-[15px] font-semibold text-white hover:bg-card2"
          >
            {copied ? 'Link copied!' : 'Copy profile link'}
          </button>

          {/*
            Phase 13 insertion point (SAFETY-01/02): "Report" and "Block"
            menu items land here once the trust & safety feature ships.
            Do not add them earlier — a visually-present-but-non-functional
            stub would violate this project's "no silent no-ops" convention
            (CLAUDE.md).
          */}
        </div>
      )}
    </div>
  )
}
