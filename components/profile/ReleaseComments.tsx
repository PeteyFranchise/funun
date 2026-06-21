'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type CommentView = {
  id: string
  parentId: string | null
  body: string
  createdAt: string
  authorName: string
  authorAvatarUrl: string | null
  authorRole: string | null
}

export type ReleaseCommentsState = {
  projectId: string
  releaseTitle: string
  items: CommentView[]
  canComment: boolean
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

function Bubble({ c, reply }: { c: CommentView; reply?: boolean }) {
  return (
    <div className={`flex gap-3 ${reply ? 'ml-[46px] mt-4' : 'mt-4 first:mt-0'}`}>
      <span
        className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-gradient-to-br from-brandindigo to-brandfuchsia bg-cover bg-center text-[12px] font-extrabold text-white"
        style={c.authorAvatarUrl ? { backgroundImage: `url('${c.authorAvatarUrl}')` } : undefined}
      >
        {!c.authorAvatarUrl && initials(c.authorName)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold text-white">{c.authorName}</span>
          {c.authorRole && <span className="text-[12px] text-lavdim">· {c.authorRole}</span>}
          <span className="ml-auto text-[12px] text-lavdim">{timeAgo(c.createdAt)}</span>
        </div>
        <p className="mt-[5px] whitespace-pre-wrap text-[14px] leading-[1.5] text-lav">{c.body}</p>
      </div>
    </div>
  )
}

export function ReleaseComments({ state }: { state: ReleaseCommentsState }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [busy, setBusy] = useState(false)

  const top = state.items.filter(c => !c.parentId)
  const repliesOf = (id: string) => state.items.filter(c => c.parentId === id)

  async function post(text: string, parentId: string | null) {
    if (!text.trim() || busy) return
    setBusy(true)
    const res = await fetch('/api/release-comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: state.projectId, body: text.trim(), parentId }),
    })
    setBusy(false)
    if (res.ok) {
      setBody('')
      setReplyBody('')
      setReplyTo(null)
      router.refresh()
    }
  }

  return (
    <div className="mt-5 border-t border-hair pt-[18px]">
      <div className="mb-[14px] text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">
        Comments on “{state.releaseTitle}”
      </div>

      {state.canComment && (
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 text-[12px] font-extrabold text-white">
            {state.viewerInitials || 'YOU'}
          </span>
          <input
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && post(body, null)}
            placeholder="Add a comment…"
            maxLength={2000}
            className="flex-1 rounded-[10px] border border-hair bg-card2 px-3 py-2 text-[14px] text-white placeholder:text-lavdim focus:outline-none"
          />
          <button onClick={() => post(body, null)} disabled={busy || !body.trim()} className="rounded-[10px] bg-grad px-4 py-2 text-[13.5px] font-bold text-white disabled:opacity-50">
            Post
          </button>
        </div>
      )}

      {top.length === 0 ? (
        <p className="text-[13.5px] text-lavdim">No comments yet.</p>
      ) : (
        top.map(c => (
          <div key={c.id}>
            <Bubble c={c} />
            <div className="ml-[46px] mt-1">
              {state.canComment && (
                <button onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} className="text-[12.5px] font-semibold text-lavdim hover:text-white">
                  Reply
                </button>
              )}
            </div>
            {repliesOf(c.id).map(r => (
              <Bubble key={r.id} c={r} reply />
            ))}
            {replyTo === c.id && state.canComment && (
              <div className="ml-[46px] mt-3 flex items-center gap-2">
                <input
                  value={replyBody}
                  onChange={e => setReplyBody(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && post(replyBody, c.id)}
                  placeholder={`Reply to ${c.authorName.split(' ')[0]}…`}
                  maxLength={2000}
                  className="flex-1 rounded-[10px] border border-hair bg-card2 px-3 py-2 text-[13.5px] text-white placeholder:text-lavdim focus:outline-none"
                />
                <button onClick={() => post(replyBody, c.id)} disabled={busy || !replyBody.trim()} className="rounded-[10px] bg-grad px-3 py-2 text-[13px] font-bold text-white disabled:opacity-50">
                  Reply
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
