'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type WallPostView = {
  id: string
  body: string
  createdAt: string
  authorName: string
  authorAvatarUrl: string | null
  authorRole: string | null
}

export type WallState = {
  profileUserId: string
  ownerName: string
  posts: WallPostView[]
  canPost: boolean
  viewerInitials: string
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 604800) return `${Math.floor(s / 86400)}d`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function Wall({ wall }: { wall: WallState }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function post() {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    const res = await fetch('/api/wall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: wall.profileUserId, body: text }),
    })
    setBusy(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Could not post')
      return
    }
    setBody('')
    router.refresh()
  }

  return (
    <section className="rounded-[18px] border border-hair bg-card p-7">
      <div className="mb-[18px] flex items-center justify-between">
        <h2 className="text-[20px] font-extrabold tracking-[-.01em] text-white">Wall</h2>
        <span className="text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">Leave a message</span>
      </div>

      {wall.canPost ? (
        <div className="mb-[22px] flex items-center gap-[14px] rounded-[14px] border border-hair bg-card2 p-[14px]">
          <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 text-[15px] font-extrabold text-white">
            {wall.viewerInitials || 'YOU'}
          </span>
          <input
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && post()}
            placeholder={`Write a public message to ${wall.ownerName.split(' ')[0]}…`}
            className="flex-1 bg-transparent text-[15px] text-white placeholder:text-lavdim focus:outline-none"
            maxLength={2000}
          />
          <button
            onClick={post}
            disabled={busy || !body.trim()}
            className="inline-flex items-center gap-2 rounded-[10px] bg-grad px-[18px] py-[10px] text-[14px] font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Posting…' : 'Post'}
          </button>
        </div>
      ) : (
        <a href="/signin" className="mb-[22px] block rounded-[14px] border border-hair bg-card2 p-4 text-[14px] text-lavdim">
          Sign in to leave a public message.
        </a>
      )}

      {error && <p className="mb-3 text-[13px] text-rose-400">{error}</p>}

      {wall.posts.length === 0 ? (
        <p className="text-[14px] text-lavdim">No messages yet — be the first.</p>
      ) : (
        wall.posts.map(p => (
          <div key={p.id} className="flex gap-[14px] border-b border-hair py-[18px] last:border-none last:pb-0">
            <span
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-gradient-to-br from-brandindigo to-brandfuchsia bg-cover bg-center text-[15px] font-extrabold text-white"
              style={p.authorAvatarUrl ? { backgroundImage: `url('${p.authorAvatarUrl}')` } : undefined}
            >
              {!p.authorAvatarUrl && initials(p.authorName)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-white">{p.authorName}</span>
                {p.authorRole && <span className="text-[12.5px] text-lavdim">· {p.authorRole}</span>}
                <span className="ml-auto text-[12.5px] text-lavdim">{timeAgo(p.createdAt)}</span>
              </div>
              <p className="mt-[6px] whitespace-pre-wrap text-[15px] leading-[1.55] text-lav">{p.body}</p>
            </div>
          </div>
        ))
      )}
    </section>
  )
}
