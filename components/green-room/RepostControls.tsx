'use client'

import { useState } from 'react'

type RepostControlsProps = {
  postId: string
  disabled?: boolean
  allowResharing: boolean
  onRepost: (postId: string, quoteBody: string | null) => Promise<void> | void
  onRemove?: (postId: string) => Promise<void> | void
}

export function RepostControls({
  postId,
  disabled = false,
  allowResharing,
  onRepost,
  onRemove,
}: RepostControlsProps) {
  const [quoteBody, setQuoteBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleRepost() {
    if (disabled || !allowResharing || submitting) return
    setSubmitting(true)
    try {
      await onRepost(postId, quoteBody.trim() || null)
      setQuoteBody('')
    } finally {
      setSubmitting(false)
    }
  }

  if (!allowResharing) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-lavdim">
        Reposting is disabled by the original author.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <label htmlFor={`repost-${postId}`} className="sr-only">Add a quote</label>
      <textarea
        id={`repost-${postId}`}
        value={quoteBody}
        onChange={event => setQuoteBody(event.target.value)}
        disabled={disabled || submitting}
        maxLength={1000}
        placeholder="Add a quick note before reposting..."
        className="min-h-16 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-lav/50"
      />
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-lavdim">
        <span>{quoteBody.trim().length}/1000</span>
        <div className="flex items-center gap-2">
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(postId)}
              disabled={disabled || submitting}
              className="rounded-full border border-white/10 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={handleRepost}
            disabled={disabled || submitting}
            className="rounded-full bg-grad px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Reposting...' : 'Repost'}
          </button>
        </div>
      </div>
    </div>
  )
}

