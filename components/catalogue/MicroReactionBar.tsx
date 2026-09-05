'use client'

import { useState } from 'react'
import type { StudioNoteReaction, StudioNoteReactionView, StudioNoteSource } from '@/types/catalogue'

export const STUDIO_NOTE_REACTIONS: { value: StudioNoteReaction; emoji: string; label: string }[] = [
  { value: 'like', emoji: '👍', label: 'Like' },
  { value: 'love', emoji: '❤️', label: 'Love' },
  { value: 'fire', emoji: '🔥', label: 'Fire' },
  { value: 'heard', emoji: '👂', label: 'Heard it' },
  { value: 'done', emoji: '✅', label: 'Done' },
  { value: 'idea', emoji: '💡', label: 'Good idea' },
  { value: 'laugh', emoji: '😂', label: 'Laugh' },
]

const BY_VALUE = new Map(STUDIO_NOTE_REACTIONS.map(reaction => [reaction.value, reaction]))

export function MicroReactionBar({
  workId,
  source,
  noteId,
  reactions,
  onChanged,
}: {
  workId: string
  source: StudioNoteSource
  noteId: string
  reactions: StudioNoteReactionView[]
  onChanged: () => void
}) {
  const [chooserOpen, setChooserOpen] = useState(false)
  const [saving, setSaving] = useState<StudioNoteReaction | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function react(reaction: StudioNoteReaction) {
    if (saving) return
    setSaving(reaction)
    setError(null)
    const response = await fetch(`/api/works/${workId}/studio-notes/${noteId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, reaction }),
    })
    const result = (await response.json().catch(() => ({}))) as { error?: string }
    setSaving(null)
    if (!response.ok) {
      setError(result.error ?? 'Could not save that reaction.')
      return
    }
    setChooserOpen(false)
    onChanged()
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {reactions.map(group => {
        const reaction = BY_VALUE.get(group.reaction)
        if (!reaction) return null
        const people = group.people.map(person => person.name).join(', ')
        return (
          <button
            key={group.reaction}
            type="button"
            disabled={saving !== null}
            onClick={() => void react(group.reaction)}
            aria-label={`${reaction.label}, ${group.count}${people ? `: ${people}` : ''}`}
            aria-pressed={group.reactedByViewer}
            className={`rounded-full border px-2 py-1 text-[10px] transition disabled:opacity-40 ${group.reactedByViewer ? 'border-brandindigo/70 bg-brandindigo/15 text-white' : 'border-hairstrong bg-card2 text-lav hover:text-white'}`}
          >
            {reaction.emoji} {group.count}
          </button>
        )
      })}
      <button type="button" onClick={() => setChooserOpen(open => !open)} aria-label="Add a reaction" aria-expanded={chooserOpen} className="rounded-full border border-hairstrong px-2 py-1 text-[10px] text-lavdim hover:text-white">
        ＋ react
      </button>
      {chooserOpen ? (
        <span className="flex flex-wrap items-center gap-1 rounded-[9px] border border-hair bg-card2 p-1.5">
          {STUDIO_NOTE_REACTIONS.map(reaction => (
            <button key={reaction.value} type="button" disabled={saving !== null} onClick={() => void react(reaction.value)} aria-label={reaction.label} className="rounded-md px-1.5 py-1 text-[14px] hover:bg-lav/10 disabled:opacity-40">
              {reaction.emoji}
            </button>
          ))}
        </span>
      ) : null}
      {error ? <span role="alert" className="basis-full text-[9px] text-red-300">{error}</span> : null}
    </div>
  )
}
