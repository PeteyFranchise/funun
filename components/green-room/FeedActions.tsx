'use client'

import { GREEN_ROOM_REACTION_LABELS, type GreenRoomReaction } from '@/lib/green-room/feed'

type FeedActionsProps = {
  postId: string
  commentCount: number
  reactionCount: number
  repostCount: number
  viewerReaction: GreenRoomReaction | null
  onReact?: (postId: string, reaction: GreenRoomReaction) => void
  onComment?: (postId: string) => void
  onRepost?: (postId: string) => void
}

export function FeedActions({
  postId,
  commentCount,
  reactionCount,
  repostCount,
  viewerReaction,
  onReact,
  onComment,
  onRepost,
}: FeedActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-lavdim">
      <button
        type="button"
        onClick={() => onReact?.(postId, viewerReaction ?? 'like')}
        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-bold text-white hover:border-lav/40 hover:bg-lav/10"
      >
        {viewerReaction ? GREEN_ROOM_REACTION_LABELS[viewerReaction] : 'Like'} · {reactionCount}
      </button>
      <button
        type="button"
        onClick={() => onComment?.(postId)}
        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-bold text-white hover:border-lav/40 hover:bg-lav/10"
      >
        Comment · {commentCount}
      </button>
      <button
        type="button"
        onClick={() => onRepost?.(postId)}
        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-bold text-white hover:border-lav/40 hover:bg-lav/10"
      >
        Repost · {repostCount}
      </button>
    </div>
  )
}
