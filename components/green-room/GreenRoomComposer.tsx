'use client'

import { useState } from 'react'
import {
  GREEN_ROOM_POST_TYPE_VALUES,
  GREEN_ROOM_VISIBILITY_VALUES,
  type GreenRoomPostType,
  type GreenRoomVisibility,
} from '@/lib/green-room/feed'

const POST_LABELS: Record<GreenRoomPostType, string> = {
  general_update: 'General update',
  collab_request: 'Collab request',
  release_announcement: 'Release announcement',
  question: 'Question',
  win_milestone: 'Win / milestone',
  feedback_request: 'Feedback request',
  opportunity_need: 'Opportunity / need',
}

const VISIBILITY_LABELS: Record<GreenRoomVisibility, string> = {
  public: 'Public',
  followers: 'Followers',
  connections: 'Connections',
  draft: 'Draft',
  custom: 'Custom audience',
}

type GreenRoomComposerProps = {
  onPosted: () => void
}

export function GreenRoomComposer({ onPosted }: GreenRoomComposerProps) {
  const [postType, setPostType] = useState<GreenRoomPostType>('general_update')
  const [visibility, setVisibility] = useState<GreenRoomVisibility>('public')
  const [body, setBody] = useState('')
  const [customRoles, setCustomRoles] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(status: 'draft' | 'published') {
    setSaving(true)
    setMessage(null)
    try {
      const payload = {
        postType,
        body,
        status,
        visibility: status === 'draft' ? 'draft' : visibility,
        audience: visibility === 'custom' && status === 'published'
          ? { roles: customRoles.split(',').map(role => role.trim()).filter(Boolean) }
          : undefined,
      }
      const res = await fetch('/api/green-room/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not create post')
      setBody('')
      setCustomRoles('')
      setVisibility('public')
      setMessage(status === 'draft' ? 'Draft saved.' : 'Posted to The Green Room.')
      onPosted()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create post')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-[26px] border border-white/10 bg-black/35 p-5 backdrop-blur">
      <div className="flex flex-wrap gap-3">
        <select
          value={postType}
          onChange={event => setPostType(event.target.value as GreenRoomPostType)}
          className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-bold text-white outline-none"
        >
          {GREEN_ROOM_POST_TYPE_VALUES.map(value => (
            <option key={value} value={value}>{POST_LABELS[value]}</option>
          ))}
        </select>
        <select
          value={visibility}
          onChange={event => setVisibility(event.target.value as GreenRoomVisibility)}
          className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-bold text-white outline-none"
        >
          {GREEN_ROOM_VISIBILITY_VALUES.filter(value => value !== 'draft').map(value => (
            <option key={value} value={value}>{VISIBILITY_LABELS[value]}</option>
          ))}
        </select>
      </div>
      {visibility === 'custom' && (
        <input
          value={customRoles}
          onChange={event => setCustomRoles(event.target.value)}
          placeholder="Custom audience roles, comma-separated: Producer, Attorney..."
          className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35"
        />
      )}
      <textarea
        value={body}
        onChange={event => setBody(event.target.value)}
        maxLength={4000}
        placeholder="Share an update, ask for feedback, or post a specific opportunity..."
        className="mt-3 min-h-28 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/35 focus:border-lav/50"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-lavdim">
        <span>{body.trim().length}/4000</span>
        <div className="flex items-center gap-2">
          {message && <span className="text-white/60">{message}</span>}
          <button
            type="button"
            onClick={() => submit('draft')}
            disabled={saving || body.trim().length === 0}
            className="rounded-full border border-white/10 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={() => submit('published')}
            disabled={saving || body.trim().length === 0}
            className="rounded-full bg-grad px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>
    </section>
  )
}

