'use client'

import { useEffect, useState } from 'react'
import type {
  LyricBlockSuggestionView,
  LyricCommentParticipant,
  LyricSuggestionStatus,
} from '@/types/catalogue'

type LyricSuggestionPanelProps = {
  label: string
  currentText: string
  suggestions: LyricBlockSuggestionView[]
  participants: LyricCommentParticipant[]
  loading: boolean
  saving: boolean
  error: string | null
  onCreate: (proposedText: string, note: string | null) => Promise<boolean>
  onDecision: (suggestionId: string, action: 'accept' | 'decline') => Promise<boolean>
  onClose: () => void
}

const STATUS_LABELS: Record<LyricSuggestionStatus, string> = {
  pending: 'Open',
  accepted: 'Accepted',
  declined: 'Not used',
}

function displayDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Time unavailable'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function LyricSuggestionPanel({
  label,
  currentText,
  suggestions,
  participants,
  loading,
  saving,
  error,
  onCreate,
  onDecision,
  onClose,
}: LyricSuggestionPanelProps) {
  const [creating, setCreating] = useState(false)
  const [proposedText, setProposedText] = useState(currentText)
  const [note, setNote] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(
    suggestions.find(suggestion => suggestion.status === 'pending')?.id ?? suggestions[0]?.id ?? null
  )

  useEffect(() => {
    if (selectedId && suggestions.some(suggestion => suggestion.id === selectedId)) return
    setSelectedId(suggestions.find(suggestion => suggestion.status === 'pending')?.id ?? suggestions[0]?.id ?? null)
  }, [selectedId, suggestions])

  const selected = suggestions.find(suggestion => suggestion.id === selectedId) ?? null
  const pendingCount = suggestions.filter(suggestion => suggestion.status === 'pending').length
  const mentionable = participants.filter(participant => participant.handle)

  function insertMention(handle: string) {
    setNote(current => `${current}${current && !/\s$/.test(current) ? ' ' : ''}@${handle} `)
  }

  async function createSuggestion() {
    if (proposedText === currentText || !proposedText.trim()) return
    if (await onCreate(proposedText, note.trim() || null)) {
      setNote('')
      setCreating(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lyric-suggestion-title"
      className="max-h-full w-full max-w-[880px] overflow-y-auto rounded-[14px] border border-hairstrong bg-card p-5 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brandindigo">Alternate lyrics</p>
          <h2 id="lyric-suggestion-title" className="mt-1 text-[20px] font-bold text-white">Try another version of {label}</h2>
          <p className="mt-1 max-w-[650px] text-[11px] leading-5 text-lavdim">
            Propose different words without taking over the section. Nothing changes until an authorized room member accepts it.
          </p>
        </div>
        <button type="button" onClick={onClose} disabled={saving} aria-label="Close lyric suggestions" className="text-[16px] text-lavdim hover:text-white disabled:opacity-40">✕</button>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-[9px] border border-rose-300/20 bg-rose-300/[.06] px-3 py-2 text-[11px] text-rose-200">{error}</p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-hair pb-3">
        <p className="text-[11px] text-lavdim">{pendingCount} open {pendingCount === 1 ? 'suggestion' : 'suggestions'}</p>
        <button
          type="button"
          onClick={() => {
            setProposedText(currentText)
            setNote('')
            setCreating(true)
          }}
          className="rounded-[9px] border border-brandindigo/40 bg-brandindigo/[.06] px-3 py-2 text-[11px] font-semibold text-brandindigo hover:text-white"
        >
          ＋ Suggest another version
        </button>
      </div>

      {creating ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <section className="rounded-[11px] border border-hair bg-card2 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-lavdim">Current lyric</p>
            <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-lav">{currentText || 'This section is empty.'}</p>
          </section>
          <section className="rounded-[11px] border border-brandindigo/35 bg-brandindigo/[.04] p-4">
            <label htmlFor="suggested-lyric" className="text-[10px] font-semibold uppercase tracking-[.12em] text-brandindigo">Your alternate</label>
            <textarea
              id="suggested-lyric"
              value={proposedText}
              onChange={event => setProposedText(event.target.value)}
              rows={8}
              maxLength={4000}
              className="mt-3 w-full resize-y rounded-[9px] border border-hairstrong bg-card px-3 py-2 text-[13px] leading-6 text-white outline-none focus:border-brandindigo"
            />
            <label htmlFor="suggestion-note" className="mt-3 block text-[10px] font-semibold text-lav">Note (optional)</label>
            <textarea
              id="suggestion-note"
              value={note}
              onChange={event => setNote(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Explain the idea or mention someone"
              className="mt-2 w-full resize-none rounded-[9px] border border-hairstrong bg-card px-3 py-2 text-[11px] leading-5 text-white outline-none placeholder:text-lavdim focus:border-brandindigo"
            />
            {mentionable.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[9px] text-lavdim">Mention:</span>
                {mentionable.map(participant => (
                  <button key={participant.userId} type="button" onClick={() => insertMention(participant.handle!)} className="rounded-full border border-hairstrong px-2 py-1 text-[9px] text-lavdim hover:text-white">
                    @{participant.handle}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-3">
              {suggestions.length > 0 && <button type="button" onClick={() => setCreating(false)} className="text-[10px] text-lavdim hover:text-white">Cancel</button>}
              <button
                type="button"
                disabled={saving || !proposedText.trim() || proposedText === currentText}
                onClick={() => void createSuggestion()}
                className="rounded-[9px] bg-brandindigo px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-40"
              >
                {saving ? 'Sharing…' : 'Share suggestion'}
              </button>
            </div>
          </section>
        </div>
      ) : loading ? (
        <p className="mt-5 text-[11px] text-lavdim">Loading suggestions…</p>
      ) : selected ? (
        <div className="mt-5">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {suggestions.map(suggestion => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => setSelectedId(suggestion.id)}
                aria-pressed={selected.id === suggestion.id}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] ${selected.id === suggestion.id ? 'border-brandindigo text-white' : 'border-hairstrong text-lavdim hover:text-white'}`}
              >
                {suggestion.author.name} · {STATUS_LABELS[suggestion.status]}
              </button>
            ))}
          </div>

          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <section className="rounded-[11px] border border-hair bg-card2 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-lavdim">Current lyric</p>
              <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-lav">{currentText || 'This section is empty.'}</p>
            </section>
            <section className="rounded-[11px] border border-brandindigo/35 bg-brandindigo/[.04] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-brandindigo">{selected.author.name}&apos;s alternate</p>
                  <p className="mt-1 text-[9px] text-lavdim">{displayDate(selected.createdAt)}</p>
                </div>
                <span className="rounded-full border border-hairstrong px-2 py-1 text-[9px] text-lavdim">{STATUS_LABELS[selected.status]}</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-white">{selected.proposedText}</p>
              {selected.note && <p className="mt-4 border-t border-hair pt-3 text-[11px] italic leading-5 text-lavdim">“{selected.note}”</p>}
            </section>
          </div>

          {selected.isStale && (
            <p className="mt-3 rounded-[9px] border border-amber-300/25 bg-amber-300/[.06] px-3 py-2 text-[10px] leading-5 text-amber-100">
              The current lyric changed after this was suggested. Keep it for reference or make a fresh suggestion from today&apos;s words.
            </p>
          )}

          {selected.status === 'pending' && (
            <div className="mt-4 flex flex-wrap justify-end gap-3">
              {selected.canDecline && (
                <button type="button" disabled={saving} onClick={() => void onDecision(selected.id, 'decline')} className="rounded-[9px] border border-hairstrong px-3 py-2 text-[10px] font-semibold text-lavdim hover:text-white disabled:opacity-40">
                  Don&apos;t use this version
                </button>
              )}
              {selected.canAccept && (
                <button type="button" disabled={saving || selected.isStale} onClick={() => void onDecision(selected.id, 'accept')} className="rounded-[9px] bg-brandindigo px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-40">
                  {saving ? 'Applying…' : `Use this for ${label}`}
                </button>
              )}
            </div>
          )}
          {selected.status !== 'pending' && selected.decidedByName && (
            <p className="mt-3 text-right text-[9px] text-lavdim">{STATUS_LABELS[selected.status]} by {selected.decidedByName}</p>
          )}
        </div>
      ) : (
        <div className="mt-5 rounded-[11px] border border-hair bg-card2 p-4 text-[11px] text-lavdim">No alternate versions yet.</div>
      )}

      <p className="mt-5 border-t border-hair pt-3 text-[9px] leading-4 text-lavdim">
        A suggestion is creative input—not a split, ownership decision, rights approval, or legal credit.
      </p>
    </div>
  )
}
