'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AcceptIdeaInvite({ token }: { token: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function accept() {
    setBusy(true)
    setError('')
    const response = await fetch(`/api/idea-invites/${encodeURIComponent(token)}/accept`, { method: 'POST' })
    const body = (await response.json().catch(() => null)) as { data?: { ideaId?: string }; error?: string } | null
    if (!response.ok || !body?.data?.ideaId) {
      setError(body?.error ?? 'Could not accept this invitation.')
      setBusy(false)
      return
    }
    router.replace(`/ideas?idea=${body.data.ideaId}`)
    router.refresh()
  }

  return (
    <div className="mx-auto mt-24 max-w-lg rounded-[28px] border border-white/10 bg-card p-8 text-center">
      <div className="text-xs font-bold uppercase tracking-[.24em] text-lav">Private idea</div>
      <h1 className="mt-3 text-3xl font-black">You’ve been invited into a spark.</h1>
      <p className="mt-3 text-sm leading-6 text-white/55">Accept to listen, comment, or contribute at the level chosen by its creator. Rights and splits are never assigned here.</p>
      <button type="button" onClick={accept} disabled={busy} className="mt-7 rounded-full bg-white px-6 py-3 font-bold text-black disabled:opacity-50">
        {busy ? 'Opening…' : 'Accept invitation'}
      </button>
      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
    </div>
  )
}
