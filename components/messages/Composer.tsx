'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import Link from 'next/link'
import type { DmMessageView } from '@/lib/social/dm'
import { PENDING_STACK_CAP } from '@/lib/social/dm'

// ─── Shared helpers (D-22, message bubble rendering) ─────────────────────
// Mirrors components/profile/DmWidget.tsx's initials()/clockTime() exactly
// so ThreadList/RequestView/ConversationView/DockedWidget all render
// avatars and timestamps identically without re-deriving the logic.

export function initials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ─── MessageBubble (shared bubble renderer) ──────────────────────────────
// Bodies render as React text children — never dangerouslySetInnerHTML
// (T-11-15). Reuses DmWidget's exact bubble tokens (bg-grad / bg-card2 /
// border-hair / rounded-[14px]).

export function MessageBubble({ message }: { message: DmMessageView }) {
  return (
    <div
      className={`max-w-[78%] rounded-[14px] px-[13px] py-[10px] text-[14px] leading-[1.5] ${
        message.mine
          ? 'self-end rounded-br-[5px] bg-grad text-white'
          : 'self-start rounded-bl-[5px] border border-hair bg-card2 text-lav'
      }`}
    >
      {message.body}
      <span className="mt-1 block text-right text-[14px] opacity-60">{clockTime(message.createdAt)}</span>
    </div>
  )
}

// ─── RequestsBudgetHint (D-17) ────────────────────────────────────────────

function RequestsBudgetHint({ remaining }: { remaining: number }) {
  return (
    <p className="px-[14px] pb-2 text-[12px] font-bold text-lavdim">
      {remaining} message request{remaining === 1 ? '' : 's'} left this week
    </p>
  )
}

// ─── RateLimitWall (D-17) ─────────────────────────────────────────────────
// Replaces the composer entirely when the caller's weekly request budget is
// exhausted. The CTA links to the recipient's profile rather than firing a
// client-authorized send — the composer never decides who may message whom
// (T-11-17); it only reflects the server's own budget.

function RateLimitWall({
  otherHandle,
  weeklyLimit,
  nextSlotDate,
}: {
  otherHandle: string
  weeklyLimit: number
  nextSlotDate: string | null
}) {
  const dateLabel = nextSlotDate
    ? new Date(nextSlotDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <div className="border-t border-hair px-[14px] py-4">
      <p className="text-[15px] font-bold text-white">You&rsquo;ve used all {weeklyLimit} message requests this week</p>
      <p className="mt-1 text-[14px] text-lavdim">
        {dateLabel ? `Your next slot opens ${dateLabel}. ` : 'Your next slot opens in up to a week. '}
        Send a Connect request to message directly — no request needed.
      </p>
      <Link
        href={`/u/${otherHandle}`}
        className="mt-3 inline-flex items-center gap-2 rounded-[10px] bg-grad px-4 py-[10px] text-[14px] font-bold text-white"
      >
        Send Connect Request
      </Link>
    </div>
  )
}

// ─── Composer (Task 1) ────────────────────────────────────────────────────
// Shared composer used by ConversationView and DockedWidget. Optimistic
// send + revert mirrors DmWidget.send() exactly. Message/bubble state is
// lifted to the parent (setMessages) so both surfaces can reuse it.

export type ComposerProps = {
  otherId: string
  otherHandle: string
  isConnection: boolean
  remainingRequests: number
  weeklyLimit: number
  pendingCount: number
  nextSlotDate?: string | null
  disabled?: boolean
  setMessages: Dispatch<SetStateAction<DmMessageView[]>>
  onSent?: (threadId: string) => void
}

export function Composer({
  otherId,
  otherHandle,
  isConnection,
  remainingRequests,
  weeklyLimit,
  pendingCount,
  nextSlotDate,
  disabled,
  setMessages,
  onSent,
}: ComposerProps) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    const text = body.trim()
    if (!text || busy || disabled) return
    setBusy(true)
    setError(null)
    const tmpId = `tmp-${Date.now()}`
    setMessages(m => [...m, { id: tmpId, body: text, createdAt: new Date().toISOString(), mine: true }])
    setBody('')

    const res = await fetch('/api/dm/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserId: otherId, body: text }),
    })
    setBusy(false)

    if (res.status === 403) {
      // Blocked — silently keep the optimistic bubble as "sent". The sender
      // must never learn they were blocked (UI-SPEC error-states: silent).
      return
    }
    if (!res.ok) {
      setMessages(m => m.filter(x => x.id !== tmpId)) // revert — never sent
      setError(res.status === 429 ? "You've reached your weekly request limit." : "Message couldn't be sent. Try again.")
      return
    }

    const json = await res.json().catch(() => ({}))
    const real = json.data as (DmMessageView & { threadId?: string }) | undefined
    if (real?.id) {
      setMessages(m =>
        m.map(x => (x.id === tmpId ? { id: real.id, body: real.body, createdAt: real.createdAt, mine: true } : x))
      )
    }
    if (real?.threadId) onSent?.(real.threadId)
  }

  // At zero budget for a non-connection with no existing pending stack,
  // the wall replaces the composer entirely (D-17).
  if (!isConnection && pendingCount === 0 && remainingRequests <= 0) {
    return <RateLimitWall otherHandle={otherHandle} weeklyLimit={weeklyLimit} nextSlotDate={nextSlotDate ?? null} />
  }

  const placeholder = isConnection ? 'Write a message…' : 'Send a message request…'
  const stackedCapped = !isConnection && pendingCount >= PENDING_STACK_CAP
  const isDisabled = !!disabled || stackedCapped

  return (
    <div>
      {!isConnection && pendingCount >= 1 && (
        <p className="px-[14px] pt-2 text-[12px] font-bold text-lavdim">
          You can add up to {PENDING_STACK_CAP} messages while your request is pending.
        </p>
      )}

      <div className="flex items-center gap-[10px] border-t border-hair px-[14px] py-3">
        <input
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder={placeholder}
          maxLength={4000}
          disabled={isDisabled || busy}
          className="flex-1 rounded-[10px] border border-hair bg-card2 px-3 py-[10px] text-[14px] text-white placeholder:text-lavdim focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={busy || !body.trim() || isDisabled}
          aria-label="Send"
          className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-grad text-white disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {!isConnection && pendingCount === 0 && remainingRequests > 0 && <RequestsBudgetHint remaining={remainingRequests} />}
      {error && <p className="px-[14px] pb-2 text-[12px] font-bold text-rose-400">{error}</p>}
    </div>
  )
}
