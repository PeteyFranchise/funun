'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── ConnectButton (CONNECT-02, D-01–D-04) ────────────────────────────
// The profile's primary CTA — the deliberate, mutual, note-bearing
// relationship at the heart of the Green Room. Mirrors FollowButton's
// optimistic-fetch + router.refresh() pattern, extended to the full
// request / respond / withdraw lifecycle with an optional note composer.
//
// Visual-weight decision (10-UI-SPEC Color contract): Connect owns the
// primary gradient slot; Follow is demoted to ghost. Decline and Withdraw
// are reversible social actions — NO rose/destructive styling (matches the
// Follow-toggle precedent). The client cap on the note (maxLength=200) is
// convenience only; the /api/connections route + Postgres CHECK are the
// security boundary (T-10-17).

export type ConnectStateValue = 'none' | 'pending_out' | 'pending_in' | 'connected'

export type ConnectButtonProps = {
  profileUserId: string
  connectionId: string | null
  state: ConnectStateValue
  note?: string | null
  canConnect: boolean
}

// Shared action-button sizing from FollowButton (42px tall / 13px 22px pad
// / 11px radius / 15px 700).
const ACTION_BASE =
  'inline-flex items-center gap-[9px] rounded-[11px] px-[22px] py-[13px] text-[15px] font-bold transition disabled:opacity-60'
const GHOST = 'border border-hairstrong bg-card text-white'
const GRADIENT = 'bg-grad text-white shadow-cta'

// Compact 36px sibling of the action buttons for inline Accept/Decline.
const COMPACT_BASE =
  'inline-flex h-9 items-center gap-[6px] rounded-[9px] px-[14px] text-[13px] font-bold transition disabled:opacity-60'

// ─── hand-authored glyphs (1.7 stroke, round caps) ────────────────────
function UserPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M4 20c0-3 2.2-5 5-5s5 2 5 5" />
      <path d="M18 8v6M15 11h6" />
    </svg>
  )
}
function XCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  )
}

export function ConnectButton({
  profileUserId,
  connectionId,
  state,
  note,
  canConnect,
}: ConnectButtonProps) {
  const router = useRouter()
  const [current, setCurrent] = useState<ConnectStateValue>(state)
  const [busy, setBusy] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [hoverPending, setHoverPending] = useState(false)

  // Keep local state in sync when the server re-derives it (router.refresh()).
  useEffect(() => {
    setCurrent(state)
  }, [state])

  async function withdraw() {
    if (busy || !connectionId) return
    setBusy(true)
    const prev = current
    setCurrent('none') // optimistic
    const res = await fetch('/api/connections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, action: 'withdraw' }),
    })
    setBusy(false)
    if (!res.ok) {
      setCurrent(prev) // revert
      return
    }
    router.refresh()
  }

  async function respond(action: 'accept' | 'decline') {
    if (busy || !connectionId) return
    setBusy(true)
    const prev = current
    setCurrent(action === 'accept' ? 'connected' : 'none') // optimistic
    const res = await fetch('/api/connections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, action }),
    })
    setBusy(false)
    if (!res.ok) {
      setCurrent(prev) // revert
      return
    }
    router.refresh()
  }

  // ── not signed in / own profile — mirror FollowButton's !canFollow branch.
  if (!canConnect) {
    return (
      <a href="/signin" className={[ACTION_BASE, GRADIENT].join(' ')}>
        <UserPlusIcon />
        Connect
      </a>
    )
  }

  // ── connected — non-interactive terminal status (disconnect is Phase 13, D-07).
  if (current === 'connected') {
    return (
      <span className={[ACTION_BASE.replace(' transition', ''), GHOST, 'cursor-default'].join(' ')}>
        <CheckIcon />
        Connected
      </span>
    )
  }

  // ── addressee inline Accept/Decline (D-02), with the note callout above.
  if (current === 'pending_in') {
    return (
      <div className="flex flex-col gap-2">
        {note && (
          <div className="max-w-[280px] rounded-[10px] bg-card2 px-[13px] py-[9px] text-[13px] font-medium text-lavdim">
            {note}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => respond('accept')}
            disabled={busy}
            className={[COMPACT_BASE, GRADIENT].join(' ')}
          >
            Accept
          </button>
          <button
            onClick={() => respond('decline')}
            disabled={busy}
            className={[COMPACT_BASE, GHOST].join(' ')}
          >
            Decline
          </button>
        </div>
      </div>
    )
  }

  // ── pending_out — Pending, swapping to Withdraw on hover/focus (D-03), no rose.
  if (current === 'pending_out') {
    return (
      <button
        onClick={withdraw}
        disabled={busy}
        onMouseEnter={() => setHoverPending(true)}
        onMouseLeave={() => setHoverPending(false)}
        onFocus={() => setHoverPending(true)}
        onBlur={() => setHoverPending(false)}
        className={[ACTION_BASE, GHOST].join(' ')}
      >
        {hoverPending ? <XCircleIcon /> : <CheckIcon />}
        {hoverPending ? 'Withdraw' : 'Pending'}
      </button>
    )
  }

  // ── none — primary Connect CTA + note composer popover (D-04).
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setComposerOpen(o => !o)}
        disabled={busy}
        className={[ACTION_BASE, GRADIENT].join(' ')}
      >
        <UserPlusIcon />
        Connect
      </button>
      {composerOpen && (
        <NoteComposer
          addresseeId={profileUserId}
          onClose={() => setComposerOpen(false)}
          onSent={() => {
            setComposerOpen(false)
            setCurrent('pending_out') // optimistic
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

// ─── Note composer popover (D-04, 10-UI-SPEC section 5) ────────────────
// Folded into this file (a local component) to keep files_modified minimal.
// 320px, card bg, hair border, textarea maxLength=200 with a {n}/200 counter,
// Send request / Cancel. Empty note is valid (sends null). Errors render as
// an amber (warn-toned, NOT rose) inline line. Click-outside closes via the
// ProfileMoreMenu mousedown pattern.
function NoteComposer({
  addresseeId,
  onClose,
  onSent,
}: {
  addresseeId: string
  onClose: () => void
  onSent: () => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [onClose])

  async function send() {
    if (busy) return
    setBusy(true)
    setError(null)
    const trimmed = note.trim()
    const res = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresseeId, note: trimmed.length > 0 ? trimmed : null }),
    })
    if (!res.ok) {
      setBusy(false)
      const json = await res.json().catch(() => ({}))
      setError((json as { error?: string }).error || "Couldn't send the request. Try again.")
      return
    }
    setBusy(false)
    onSent()
  }

  return (
    <div
      ref={containerRef}
      className="absolute left-0 top-full z-50 mt-2 w-[320px] rounded-[12px] border border-hair bg-card p-4 shadow-[0_12px_30px_-10px_rgba(0,0,0,.5)]"
    >
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        maxLength={200}
        rows={3}
        placeholder="Add a note (optional)"
        className="w-full resize-none rounded-[10px] border border-hair bg-card2 px-3 py-[10px] text-[15px] font-medium text-white placeholder:text-lavdim focus:outline-none"
      />
      <div className="mt-1 text-right text-[12px] font-semibold text-lavdim tnum">{note.length}/200</div>
      {error && (
        <div className="mt-1 text-[13px] font-semibold text-amber-400">{error}</div>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          disabled={busy}
          className={[COMPACT_BASE, GHOST].join(' ')}
        >
          Cancel
        </button>
        <button
          onClick={send}
          disabled={busy}
          className={[COMPACT_BASE, GRADIENT].join(' ')}
        >
          Send request
        </button>
      </div>
    </div>
  )
}
