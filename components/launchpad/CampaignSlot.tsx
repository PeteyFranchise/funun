'use client'

import { useState } from 'react'
import { PLATFORM_LABELS, CONTENT_TYPE_LABELS } from '@/lib/launchpad/campaigns'
import type { SocialPost } from '@/lib/launchpad/campaigns'

// ─── CampaignSlot ────────────────────────────────────────────────────────────
// One calendar slot card. Modeled on ChecklistItem.tsx for the checkbox +
// completion styling, CuratorCard.tsx for chip treatment, and
// PitchComposer.tsx for the inline textarea + secondary button style.
//
// Critical interaction contracts:
// - Completion checkbox calls e.stopPropagation() so toggling never triggers
//   inline-edit mode or opens the generate panel (D-13, ChecklistItem WR).
// - Caption is inline-editable (click → textarea → blur auto-saves via
//   onEditCaption). Completed slots render text-white/40 line-through (D-03).
// - Posting time is click-to-edit via native datetime-local (D-15).
// - source field is deliberately NOT rendered (provenance is data-layer only).

function formatPostingTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Convert a local datetime-local input value ("YYYY-MM-DDTHH:mm") to ISO
function localDatetimeToIso(value: string): string {
  // datetime-local gives "YYYY-MM-DDTHH:mm" — treat as local time
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toISOString()
}

export function CampaignSlot({
  post,
  onEditCaption,
  onEditPostingTime,
  onToggleComplete,
  onOpenGenerate,
}: {
  post: SocialPost
  onEditCaption: (id: string, caption: string) => void
  onEditPostingTime: (id: string, iso: string) => void
  onToggleComplete: (id: string, completed: boolean) => void
  onOpenGenerate: (post: SocialPost) => void
}) {
  const [editingCaption, setEditingCaption] = useState(false)
  const [captionDraft, setCaptionDraft] = useState(post.caption)
  const [editingTime, setEditingTime] = useState(false)

  // Keep caption draft in sync when the post updates from parent
  function handleCaptionFocus() {
    setCaptionDraft(post.caption)
    setEditingCaption(true)
  }

  function handleCaptionBlur() {
    setEditingCaption(false)
    if (captionDraft !== post.caption) {
      onEditCaption(post.id, captionDraft)
    }
  }

  // Build datetime-local default value from ISO string
  function toDatetimeLocalValue(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    // Pad to "YYYY-MM-DDTHH:mm"
    const pad = (n: number) => String(n).padStart(2, '0')
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}`
    )
  }

  // Inline generate button label mapping per UI-SPEC Copywriting Contract
  const isHookSlot =
    post.content_type === 'short_form_video' || post.content_type === 'stories'
  const generateLabel = isHookSlot ? 'Generate hook' : 'Generate caption'

  return (
    <div className="rounded-[14px] border border-hair bg-card px-[18px] py-4">
      {/* Top row: chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-hair bg-card2 px-2 py-0.5 text-[11px] text-lav">
          {PLATFORM_LABELS[post.platform]}
        </span>
        <span className="rounded-full border border-hair bg-card2 px-2 py-0.5 text-[11px] text-lav">
          {CONTENT_TYPE_LABELS[post.content_type]}
        </span>
      </div>

      {/* Main row: checkbox + caption */}
      <div className="mt-3 flex items-start gap-3">
        {/* Completion checkbox — EXACT reuse of ChecklistItem.tsx markup.
            p-2.5 wrapper provides 44×44px minimum touch target.
            e.stopPropagation() prevents opening inline-edit or generate panel. */}
        <div className="shrink-0 p-2.5">
          <button
            role="checkbox"
            aria-checked={post.completed}
            aria-label={post.completed ? 'Mark incomplete' : 'Mark complete'}
            className={[
              'flex h-5 w-5 items-center justify-center rounded border transition',
              post.completed
                ? 'border-emerald-400 bg-emerald-400'
                : 'border-white/20 bg-transparent hover:border-white/40',
            ].join(' ')}
            onClick={e => {
              e.stopPropagation()
              onToggleComplete(post.id, !post.completed)
            }}
          >
            {post.completed && (
              <svg
                viewBox="0 0 12 9"
                className="h-3 w-3"
                fill="none"
                stroke="white"
                strokeWidth="2"
              >
                <path
                  d="M1 4.5L4.5 8L11 1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Caption / inline edit */}
        <div className="min-w-0 flex-1">
          {editingCaption ? (
            <textarea
              autoFocus
              value={captionDraft}
              onChange={e => setCaptionDraft(e.target.value)}
              onBlur={handleCaptionBlur}
              rows={4}
              className="w-full resize-none rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
            />
          ) : (
            <p
              role="button"
              tabIndex={0}
              onClick={handleCaptionFocus}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') handleCaptionFocus()
              }}
              className={[
                'cursor-text text-[14px] leading-[1.5]',
                post.completed ? 'text-white/40 line-through' : 'text-white',
              ].join(' ')}
            >
              {post.caption || <span className="text-white/40">No caption yet</span>}
            </p>
          )}

          {/* Posting time meta line (D-15) */}
          <div className="mt-2">
            {editingTime ? (
              <input
                type="datetime-local"
                autoFocus
                defaultValue={toDatetimeLocalValue(post.posting_time)}
                onChange={e => {
                  if (e.target.value) {
                    onEditPostingTime(post.id, localDatetimeToIso(e.target.value))
                  }
                }}
                onBlur={() => setEditingTime(false)}
                className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
              />
            ) : (
              <p
                role="button"
                tabIndex={0}
                onClick={() => setEditingTime(true)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') setEditingTime(true)
                }}
                className="cursor-pointer text-[12.5px] text-lavdim hover:text-white/60"
              >
                {formatPostingTime(post.posting_time)}
              </p>
            )}
          </div>

          {/* Inline generate button — secondary style, mirrors PitchComposer's
              "Draft a pitch note" button; never mutates the slot directly */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => onOpenGenerate(post)}
              className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
            >
              {generateLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
