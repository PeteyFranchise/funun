'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── DeleteDraftButton ────────────────────────────────────────────────
// Delete affordance shown ONLY on draft split-sheet rows. Rendered as a
// sibling of the row's <Link> (never nested), so clicking it never navigates.
// Drafts have no legal weight — they were never sent to any party; anything
// in-flight or executed is voided, not deleted (see /api/split-sheets/[id]/void).
export function DeleteDraftButton({ sheetId, songName }: { sheetId: string; songName: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function onDelete() {
    if (busy) return
    const label = songName.trim() || 'this draft'
    if (!window.confirm(`Delete the draft split sheet "${label}"? This can't be undone.`)) return
    setBusy(true)
    const res = await fetch(`/api/split-sheets/${sheetId}`, { method: 'DELETE' })
    if (res.ok) {
      router.refresh()
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      window.alert(body.error || 'Could not delete the draft. Try again.')
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      aria-label={`Delete draft ${songName}`}
      title="Delete draft"
      className="shrink-0 rounded-lg p-2 text-white/25 transition hover:bg-white/5 hover:text-red-400 disabled:opacity-50"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[18px] w-[18px]"
        aria-hidden
      >
        <path d="M3 6h18" />
        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6M14 11v6" />
      </svg>
    </button>
  )
}
