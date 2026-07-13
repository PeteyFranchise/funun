'use client'

import { useState } from 'react'
import type { DmMessageView } from '@/lib/social/dm'
import { MessageBubble, initials } from '@/components/messages/Composer'

// ─── RequestView (Task 2, D-10/D-11/D-12) ────────────────────────────────
// Shown in place of the composer when the active thread is a pending
// message request and the viewer is the recipient. Read-only bubbles (never
// dangerouslySetInnerHTML — T-11-15) followed by Accept / Decline / Block.
// Block uses an INLINE confirmation, no modal (UI-SPEC Destructive actions).

export function RequestView({
  threadId,
  requesterName,
  requesterAvatarUrl,
  messages,
  onAccepted,
  onDeclined,
  onBlocked,
}: {
  threadId: string
  requesterName: string
  requesterAvatarUrl: string | null
  messages: DmMessageView[]
  onAccepted: () => void
  onDeclined?: () => void
  onBlocked?: () => void
}) {
  const [state, setState] = useState<'idle' | 'accepted' | 'declined'>('idle')
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function act(action: 'accept' | 'decline' | 'block') {
    setBusy(true)
    setError(null)
    const url =
      action === 'accept'
        ? `/api/dm/request/accept/${threadId}`
        : action === 'decline'
          ? `/api/dm/request/decline/${threadId}`
          : `/api/dm/request/block/${threadId}`
    const res = await fetch(url, { method: 'POST' })
    setBusy(false)
    if (!res.ok) {
      setError(action === 'block' ? 'Block failed. Please try again.' : "Couldn't accept this request. Refresh and try again.")
      return
    }
    if (action === 'accept') {
      setState('accepted')
      onAccepted()
    } else if (action === 'decline') {
      setState('declined')
      onDeclined?.()
    } else {
      onBlocked?.()
    }
  }

  if (state === 'accepted') {
    return <p className="m-auto p-6 text-center text-[14px] text-lavdim">You&rsquo;ve accepted. Say hello!</p>
  }
  if (state === 'declined') {
    return <p className="m-auto p-6 text-center text-[14px] text-lavdim">Request declined.</p>
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-hair px-6 py-4">
        <span
          className="h-9 w-9 flex-none rounded-full bg-gradient-to-br from-brandindigo to-brandfuchsia bg-cover bg-center text-center text-[12px] font-bold leading-9 text-white"
          style={requesterAvatarUrl ? { backgroundImage: `url('${requesterAvatarUrl}')` } : undefined}
        >
          {!requesterAvatarUrl && initials(requesterName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-white">{requesterName}</div>
          <div className="text-[12px] font-bold text-lavdim">sent you a message request</div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-ink px-6 py-4">
        {messages.map(m => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      {error && <p className="px-6 pb-2 text-[12px] font-bold text-rose-400">{error}</p>}

      <div className="border-t border-hair p-4">
        {confirmBlock ? (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] text-lav">
              Block {requesterName}? They won&rsquo;t be able to message you or view your profile.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => act('block')}
                disabled={busy}
                className="flex-1 rounded-[10px] bg-gradient-to-br from-rose-500 to-rose-700 px-4 py-[10px] text-[14px] font-bold text-white disabled:opacity-50"
              >
                Yes, block
              </button>
              <button
                onClick={() => setConfirmBlock(false)}
                disabled={busy}
                className="flex-1 rounded-[10px] border border-hairstrong bg-transparent px-4 py-[10px] text-[14px] font-bold text-lav"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => act('accept')}
              disabled={busy}
              className="flex-1 rounded-[10px] bg-grad px-4 py-[10px] text-[14px] font-bold text-white disabled:opacity-50"
            >
              Accept
            </button>
            <button
              onClick={() => act('decline')}
              disabled={busy}
              className="flex-1 rounded-[10px] border border-hairstrong bg-card2 px-4 py-[10px] text-[14px] font-bold text-white disabled:opacity-50"
            >
              Decline
            </button>
            <button
              onClick={() => setConfirmBlock(true)}
              disabled={busy}
              className="rounded-[10px] border border-rose-500/30 bg-rose-500/10 px-4 py-[10px] text-[14px] font-bold text-rose-500 disabled:opacity-50"
            >
              Block
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
