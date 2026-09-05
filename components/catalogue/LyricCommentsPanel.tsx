'use client'

import { useMemo, useState } from 'react'
import type { LyricBlockCommentView, LyricCommentParticipant } from '@/types/catalogue'
import { MicroReactionBar } from './MicroReactionBar'

export type LyricCommentsPanelProps = {
  workId: string
  label: string
  comments: LyricBlockCommentView[]
  participants: LyricCommentParticipant[]
  loading: boolean
  error: string | null
  saving: boolean
  resolvingId: string | null
  onSubmit: (body: string, parentCommentId: string | null) => Promise<boolean>
  onSetResolved: (commentId: string, resolved: boolean) => Promise<boolean>
  onReactionChanged: () => void
  onClose: () => void
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?'
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Time unavailable'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function CommentText({ comment }: { comment: LyricBlockCommentView }) {
  const mentionedHandles = new Set(
    comment.mentioned
      .map(participant => participant.handle?.toLowerCase())
      .filter((handle): handle is string => Boolean(handle))
  )
  const parts = comment.body.split(/(@[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*)/g)
  return (
    <p className="whitespace-pre-wrap text-[12px] leading-5 text-lav">
      {parts.map((part, index) => {
        const handle = part.startsWith('@') ? part.slice(1).toLowerCase() : null
        return handle && mentionedHandles.has(handle) ? (
          <span key={`${part}-${index}`} className="font-semibold text-brandindigo">{part}</span>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      })}
    </p>
  )
}

function Author({ participant }: { participant: LyricCommentParticipant | null }) {
  const name = participant?.name ?? 'Former member'
  return (
    <span className="flex items-center gap-2">
      {participant?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={participant.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
      ) : (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brandindigo/15 text-[9px] font-bold text-brandindigo">
          {initials(name)}
        </span>
      )}
      <span>
        <span className="block text-[11px] font-semibold leading-tight text-white">{name}</span>
        {participant?.handle && (
          <span className="block text-[9px] leading-tight text-lavdim">@{participant.handle}</span>
        )}
      </span>
    </span>
  )
}

function CommentCard({
  comment,
  isReply,
  resolving,
  onReply,
  onSetResolved,
  workId,
  onReactionChanged,
}: {
  comment: LyricBlockCommentView
  isReply: boolean
  resolving: boolean
  onReply?: () => void
  onSetResolved: (resolved: boolean) => void
  workId: string
  onReactionChanged: () => void
}) {
  const resolved = comment.resolvedAt !== null
  return (
    <div className={`rounded-[11px] border p-3 ${isReply ? 'border-hair bg-card/70' : 'border-hairstrong bg-card2'} ${resolved ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Author participant={comment.author} />
        <span className="text-[9px] text-lavdim">{formatDate(comment.createdAt)}</span>
      </div>
      <div className="mt-3"><CommentText comment={comment} /></div>
      <MicroReactionBar workId={workId} source="lyrics" noteId={comment.id} reactions={comment.reactions ?? []} onChanged={onReactionChanged} />
      {!isReply && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-hair pt-2">
          {!resolved && onReply && (
            <button type="button" onClick={onReply} className="text-[10px] font-semibold text-lavdim hover:text-white">
              Reply
            </button>
          )}
          {comment.canResolve && (
            <button
              type="button"
              disabled={resolving}
              onClick={() => onSetResolved(!resolved)}
              className="text-[10px] font-semibold text-brandindigo hover:text-white disabled:opacity-50"
            >
              {resolving ? 'Saving…' : resolved ? 'Reopen thread' : 'Resolve thread'}
            </button>
          )}
          {resolved && (
            <span className="text-[9px] text-emerald-300">
              Resolved{comment.resolvedByName ? ` by ${comment.resolvedByName}` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function LyricCommentsPanel({
  workId,
  label,
  comments,
  participants,
  loading,
  error,
  saving,
  resolvingId,
  onSubmit,
  onSetResolved,
  onReactionChanged,
  onClose,
}: LyricCommentsPanelProps) {
  const [draft, setDraft] = useState('')
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const roots = useMemo(() => comments.filter(comment => comment.parentCommentId === null), [comments])
  const repliesByRoot = useMemo(() => {
    const map = new Map<string, LyricBlockCommentView[]>()
    for (const comment of comments) {
      if (!comment.parentCommentId) continue
      const current = map.get(comment.parentCommentId) ?? []
      current.push(comment)
      map.set(comment.parentCommentId, current)
    }
    return map
  }, [comments])
  const replyingTo = roots.find(comment => comment.id === replyingToId) ?? null
  const mentionable = participants.filter(participant => participant.handle)

  function insertMention(handle: string) {
    setDraft(current => `${current}${current && !/\s$/.test(current) ? ' ' : ''}@${handle} `)
  }

  async function submit() {
    const body = draft.trim()
    if (!body || body.length > 2000) return
    if (await onSubmit(body, replyingToId)) {
      setDraft('')
      setReplyingToId(null)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lyric-comments-title"
      className="max-h-full w-full max-w-[680px] overflow-y-auto rounded-[14px] border border-hairstrong bg-card p-5 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brandindigo">Section comments</p>
          <h2 id="lyric-comments-title" className="mt-1 text-[20px] font-bold text-white">{label}</h2>
          <p className="mt-1 max-w-[540px] text-[11px] leading-5 text-lavdim">
            Work out the idea together. Comments never change lyrics, splits, rights, or approvals.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={saving || resolvingId !== null}
          aria-label="Close lyric comments"
          className="text-[16px] text-lavdim hover:text-white disabled:opacity-40"
        >
          ✕
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-[9px] border border-rose-300/20 bg-rose-300/[.06] px-3 py-2 text-[11px] text-rose-200">
          {error}
        </p>
      )}

      <div className="mt-5 space-y-4">
        {loading ? (
          <p className="text-[12px] text-lavdim">Loading comments…</p>
        ) : roots.length === 0 ? (
          <div className="rounded-[11px] border border-hair bg-card2 px-4 py-4">
            <p className="text-[12px] font-semibold text-white">No comments on this section yet</p>
            <p className="mt-1 text-[11px] leading-5 text-lavdim">Start a focused thread without interrupting someone&apos;s lyric edit.</p>
          </div>
        ) : (
          roots.map(root => (
            <div key={root.id} className="space-y-2">
              <CommentCard
                comment={root}
                isReply={false}
                resolving={resolvingId === root.id}
                onReply={() => setReplyingToId(root.id)}
                onSetResolved={resolved => void onSetResolved(root.id, resolved)}
                workId={workId}
                onReactionChanged={onReactionChanged}
              />
              {(repliesByRoot.get(root.id) ?? []).map(reply => (
                <div key={reply.id} className="ml-6">
                  <CommentCard
                    comment={reply}
                    isReply
                    resolving={false}
                    onSetResolved={() => undefined}
                    workId={workId}
                    onReactionChanged={onReactionChanged}
                  />
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <div className="mt-5 rounded-[11px] border border-brandindigo/30 bg-brandindigo/[.06] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold text-white">
            {replyingTo ? `Reply to ${replyingTo.author?.name ?? 'this thread'}` : 'Start a comment'}
          </p>
          {replyingTo && (
            <button type="button" onClick={() => setReplyingToId(null)} className="text-[10px] text-lavdim hover:text-white">
              Cancel reply
            </button>
          )}
        </div>
        <textarea
          value={draft}
          onChange={event => setDraft(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Share an idea or mention a collaborator"
          className="mt-2 w-full resize-none rounded-[10px] border border-hair bg-card2 px-3 py-2 text-[12px] leading-5 text-white outline-none placeholder:text-lavdim"
        />
        {mentionable.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[9px] text-lavdim">Mention:</span>
            {mentionable.map(participant => (
              <button
                key={participant.userId}
                type="button"
                onClick={() => insertMention(participant.handle!)}
                className="rounded-full border border-hairstrong px-2 py-1 text-[9px] text-lavdim hover:text-white"
              >
                @{participant.handle}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[9px] text-lavdim">{draft.length}/2000</span>
          <button
            type="button"
            disabled={saving || draft.trim().length === 0}
            onClick={() => void submit()}
            className="rounded-[8px] bg-brandindigo px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Posting…' : replyingTo ? 'Post reply' : 'Post comment'}
          </button>
        </div>
      </div>
    </div>
  )
}
