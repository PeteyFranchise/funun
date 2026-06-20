'use client'

import { useEffect, useRef, useState } from 'react'
import type { DmMessageView } from '@/lib/social/dm'

export type DmState = {
  ownerId: string
  ownerName: string
  ownerAvatarUrl: string | null
  canMessage: boolean
  initialMessages: DmMessageView[]
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}
function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function DmWidget({ dm }: { dm: DmState }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<DmMessageView[]>(dm.initialMessages)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Light polling while open (stand-in for realtime).
  useEffect(() => {
    if (!open || !dm.canMessage) return
    let alive = true
    const tick = async () => {
      const res = await fetch(`/api/dm/messages?with=${dm.ownerId}`)
      if (!alive || !res.ok) return
      const json = await res.json().catch(() => ({}))
      if (Array.isArray(json.data)) setMessages(json.data as DmMessageView[])
    }
    tick()
    const id = setInterval(tick, 6000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [open, dm.canMessage, dm.ownerId])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, open])

  async function send() {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    const optimistic: DmMessageView = { id: `tmp-${Date.now()}`, body: text, createdAt: new Date().toISOString(), mine: true }
    setMessages(m => [...m, optimistic])
    setBody('')
    const res = await fetch('/api/dm/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserId: dm.ownerId, body: text }),
    })
    setBusy(false)
    if (!res.ok) setMessages(m => m.filter(x => x.id !== optimistic.id)) // revert
  }

  if (!dm.canMessage) {
    return (
      <a
        href="/signin"
        className="inline-flex items-center gap-[9px] rounded-[11px] border border-hairstrong bg-card px-[22px] py-[13px] text-[15px] font-bold text-white"
      >
        Message
      </a>
    )
  }

  const firstName = dm.ownerName.split(' ')[0]

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-[9px] rounded-[11px] border border-hairstrong bg-card px-[22px] py-[13px] text-[15px] font-bold text-white"
      >
        Message
      </button>

      {open && (
        <div className="fixed bottom-0 right-8 z-50 w-[336px] overflow-hidden rounded-t-[14px] border border-hairstrong bg-card shadow-[0_-20px_60px_-20px_rgba(0,0,0,.7)]">
          <div className="flex items-center gap-[11px] border-b border-hair bg-[#13112a] px-4 py-[14px]">
            <span
              className="h-9 w-9 flex-none rounded-full bg-gradient-to-br from-brandindigo to-brandfuchsia bg-cover bg-center text-center text-[12px] font-extrabold leading-9 text-white"
              style={dm.ownerAvatarUrl ? { backgroundImage: `url('${dm.ownerAvatarUrl}')` } : undefined}
            >
              {!dm.ownerAvatarUrl && initials(dm.ownerName)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-bold text-white">{dm.ownerName}</div>
              <div className="text-[12px] font-semibold text-lavdim">Direct message</div>
            </div>
            <button onClick={() => setOpen(false)} className="text-lavdim hover:text-white" aria-label="Close">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          </div>

          <div ref={listRef} className="flex max-h-[320px] min-h-[180px] flex-col gap-2 overflow-y-auto bg-ink px-4 py-4">
            {messages.length === 0 ? (
              <p className="m-auto text-center text-[13px] text-lavdim">Say hello to {firstName}.</p>
            ) : (
              messages.map(m => (
                <div
                  key={m.id}
                  className={`max-w-[78%] rounded-[14px] px-[13px] py-[10px] text-[13.5px] leading-[1.45] ${m.mine ? 'self-end rounded-br-[5px] bg-grad text-white' : 'self-start rounded-bl-[5px] border border-hair bg-card2 text-lav'}`}
                >
                  {m.body}
                  <span className="mt-1 block text-right text-[10px] opacity-60">{clockTime(m.createdAt)}</span>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center gap-[10px] border-t border-hair px-[14px] py-3">
            <input
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Write a message…"
              maxLength={4000}
              className="flex-1 rounded-[10px] border border-hair bg-card2 px-3 py-[10px] text-[13.5px] text-white placeholder:text-lavdim focus:outline-none"
            />
            <button
              onClick={send}
              disabled={busy || !body.trim()}
              className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-grad text-white disabled:opacity-50"
              aria-label="Send"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
