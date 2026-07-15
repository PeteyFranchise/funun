'use client'

import { useState } from 'react'

type CommentComposerProps = {
  postId: string
  disabled?: boolean
  onSubmit: (postId: string, body: string) => Promise<void> | void
}

export function CommentComposer({ postId, disabled = false, onSubmit }: CommentComposerProps) {
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    const text = body.trim()
    if (!text || submitting || disabled) return
    setSubmitting(true)
    try {
      await onSubmit(postId, text)
      setBody('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <label htmlFor={`comment-${postId}`} className="sr-only">Write a comment</label>
      <textarea
        id={`comment-${postId}`}
        value={body}
        onChange={event => setBody(event.target.value)}
        disabled={disabled || submitting}
        maxLength={2000}
        placeholder="Add a thoughtful comment..."
        className="min-h-20 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-lav/50"
      />
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-lavdim">
        <span>{body.trim().length}/2000</span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || submitting || body.trim().length === 0}
          className="rounded-full bg-grad px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Posting...' : 'Post comment'}
        </button>
      </div>
    </div>
  )
}

