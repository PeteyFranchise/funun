'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type EndorsementView = {
  id: string
  body: string
  createdAt: string
  authorName: string
  authorAvatarUrl: string | null
  authorRole: string | null
}

export type EndorsementState = {
  profileUserId: string
  ownerName: string
  endorsements: EndorsementView[]
  canEndorse: boolean
  viewerHasEndorsed: boolean
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

export function Endorsements({ state }: { state: EndorsementState }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const firstName = state.ownerName.split(' ')[0]

  async function submit() {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    const res = await fetch('/api/endorsements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: state.profileUserId, body: text }),
    })
    setBusy(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Could not endorse')
      return
    }
    setBody('')
    setOpen(false)
    router.refresh()
  }

  async function withdraw() {
    if (busy) return
    setBusy(true)
    await fetch('/api/endorsements', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: state.profileUserId }),
    })
    setBusy(false)
    router.refresh()
  }

  return (
    <section className="rounded-[18px] border border-hair bg-card p-7">
      <div className="mb-[18px] flex items-center justify-between">
        <h2 className="text-[20px] font-extrabold tracking-[-.01em] text-white">Endorsements</h2>
        {state.canEndorse &&
          (state.viewerHasEndorsed ? (
            <button onClick={withdraw} disabled={busy} className="text-[13.5px] font-semibold text-lavdim hover:text-white disabled:opacity-50">
              Withdraw
            </button>
          ) : (
            <button onClick={() => setOpen(o => !o)} className="text-[13.5px] font-semibold text-brandindigo">
              + Endorse {firstName}
            </button>
          ))}
      </div>

      {open && state.canEndorse && !state.viewerHasEndorsed && (
        <div className="mb-[22px] rounded-[14px] border border-hair bg-card2 p-4">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={`What makes ${firstName} great to work with?`}
            rows={3}
            maxLength={1000}
            className="w-full resize-none bg-transparent text-[15px] text-white placeholder:text-lavdim focus:outline-none"
          />
          {error && <p className="mb-2 text-[13px] text-rose-400">{error}</p>}
          <div className="mt-2 flex justify-end">
            <button
              onClick={submit}
              disabled={busy || !body.trim()}
              className="rounded-[10px] bg-grad px-[18px] py-[9px] text-[14px] font-bold text-white disabled:opacity-50"
            >
              {busy ? 'Posting…' : 'Post endorsement'}
            </button>
          </div>
        </div>
      )}

      {state.endorsements.length === 0 ? (
        <p className="text-[14px] text-lavdim">No endorsements yet.</p>
      ) : (
        state.endorsements.map(e => (
          <div key={e.id} className="flex gap-4 border-b border-hair py-[18px] last:border-none last:pb-0">
            <span
              className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-gradient-to-br from-brandindigo to-brandfuchsia bg-cover bg-center text-[17px] font-extrabold text-white"
              style={e.authorAvatarUrl ? { backgroundImage: `url('${e.authorAvatarUrl}')` } : undefined}
            >
              {!e.authorAvatarUrl && initials(e.authorName)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-bold text-white">{e.authorName}</div>
              {e.authorRole && <div className="mt-[2px] text-[13.5px] text-lavdim">{e.authorRole}</div>}
              <p className="mt-3 text-[15px] italic leading-[1.58] text-lav">“{e.body}”</p>
            </div>
          </div>
        ))
      )}
    </section>
  )
}
