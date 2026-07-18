'use client'

import { useState } from 'react'
import { CommentComposer } from '@/components/green-room/CommentComposer'
import { FeedActions } from '@/components/green-room/FeedActions'
import { RepostControls } from '@/components/green-room/RepostControls'
import type { GreenRoomFeedCard, GreenRoomPostCard } from '@/lib/green-room/feed-query'
import type { GreenRoomReaction } from '@/lib/green-room/feed'

type FeedCardProps = {
  card: GreenRoomFeedCard
  onChanged: () => void
}

export function FeedCard({ card, onChanged }: FeedCardProps) {
  if (card.kind === 'placement') {
    return (
      <article className="rounded-[26px] border border-emerald-300/20 bg-emerald-300/[0.06] p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[.16em] text-emerald-100">
            {card.label}
          </span>
          <span className="text-xs text-emerald-100/60">{card.explanationLabel}</span>
        </div>
        <h2 className="mt-4 text-xl font-black text-white">{card.title}</h2>
        {card.body && <p className="mt-2 text-sm leading-6 text-white/60">{card.body}</p>}
      </article>
    )
  }

  return <PostCard card={card} onChanged={onChanged} />
}

function PostCard({ card, onChanged }: { card: GreenRoomPostCard; onChanged: () => void }) {
  const [showComment, setShowComment] = useState(false)
  const [showRepost, setShowRepost] = useState(false)
  const [busyMessage, setBusyMessage] = useState<string | null>(null)

  async function react(_postId: string, reaction: GreenRoomReaction) {
    setBusyMessage(null)
    const res = await fetch(`/api/green-room/posts/${card.id}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reactionType: reaction }),
    })
    if (!res.ok) {
      const data = await res.json()
      setBusyMessage(data.error ?? 'Could not react')
      return
    }
    onChanged()
  }

  async function comment(_postId: string, body: string) {
    setBusyMessage(null)
    const res = await fetch(`/api/green-room/posts/${card.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    if (!res.ok) {
      const data = await res.json()
      setBusyMessage(data.error ?? 'Could not comment')
      return
    }
    setShowComment(false)
    onChanged()
  }

  async function repost(_postId: string, quoteBody: string | null) {
    setBusyMessage(null)
    const res = await fetch(`/api/green-room/posts/${card.id}/reposts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteBody }),
    })
    if (!res.ok) {
      const data = await res.json()
      setBusyMessage(data.error ?? 'Could not repost')
      return
    }
    setShowRepost(false)
    onChanged()
  }

  return (
    <article className="rounded-[26px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_20px_60px_rgba(0,0,0,.22)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-grad text-sm font-black text-white">
            {card.actor.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-black text-white">{card.actor.name}</h2>
              {card.actor.primaryRole && <span className="text-xs text-white/38">{card.actor.primaryRole}</span>}
            </div>
            <p className="mt-0.5 text-xs text-lavdim">
              {card.explanationLabel} · {new Date(card.publishedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[.12em] text-white/50">
          {card.postType.replace(/_/g, ' ')}
        </span>
      </div>

      <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-white/82">{card.body}</p>
      {card.linkedObject && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/60">
          Linked {card.linkedObject.type}: <span className="font-mono text-xs">{card.linkedObject.id}</span>
        </div>
      )}
      <div className="mt-4">
        <FeedActions
          postId={card.id}
          commentCount={card.counts.comments}
          reactionCount={card.counts.reactions}
          repostCount={card.counts.reposts}
          viewerReaction={card.viewerReaction as GreenRoomReaction | null}
          onReact={react}
          onComment={() => setShowComment(value => !value)}
          onRepost={() => setShowRepost(value => !value)}
        />
      </div>
      {busyMessage && <p className="mt-3 text-sm text-rose-200">{busyMessage}</p>}
      {showComment && (
        <div className="mt-4">
          <CommentComposer postId={card.id} onSubmit={comment} />
        </div>
      )}
      {showRepost && (
        <div className="mt-4">
          <RepostControls postId={card.id} allowResharing={card.allowResharing} onRepost={repost} />
        </div>
      )}
    </article>
  )
}

