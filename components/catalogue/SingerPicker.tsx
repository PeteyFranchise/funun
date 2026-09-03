'use client'

import { useState } from 'react'
import { performerIdentityKey, type SingerCandidate } from '@/lib/catalogue/singer-options'
import type { PerformerRef } from '@/types/catalogue'

type PickerMode = 'person' | 'direction'

const DIRECTION_EXAMPLES = ['Gospel choir', 'Male rapper', 'Female vocalist', 'Two-part harmony']

const SOURCE_LABELS: Record<SingerCandidate['source'], string> = {
  self: 'Me',
  room: "Writer's Room",
  roster: 'My Roster',
  named: 'Named performer',
}

export function SingerPicker({
  candidates,
  currentPerformers,
  currentDirection,
  onSavePerformers,
  onSaveDirection,
  onCancel,
  initialMode = 'person',
}: {
  candidates: SingerCandidate[]
  currentPerformers: PerformerRef[]
  currentDirection: string | null
  onSavePerformers: (performers: PerformerRef[]) => Promise<void>
  onSaveDirection: (direction: string | null) => Promise<void>
  onCancel: () => void
  /** Static-render test seam; production callers use the person-first default. */
  initialMode?: PickerMode
}) {
  const [mode, setMode] = useState<PickerMode>(initialMode)
  const [selected, setSelected] = useState(
    () => new Set(currentPerformers.map(performerIdentityKey))
  )
  const [guestName, setGuestName] = useState('')
  const [direction, setDirection] = useState(currentDirection ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const represented = new Set(candidates.map(candidate => candidate.key))
  const currentOnlyCandidates: SingerCandidate[] = currentPerformers
    .filter(performer => !represented.has(performerIdentityKey(performer)))
    .map(performer => ({
      key: performerIdentityKey(performer),
      name: performer.name?.trim() || 'Named performer',
      source: performer.kind === 'self' ? 'self' : 'named',
      performer,
    }))
  const choices = [...candidates, ...currentOnlyCandidates]

  function toggle(key: string) {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function savePeople() {
    setBusy(true)
    setError(null)
    try {
      const performers = choices
        .filter(candidate => selected.has(candidate.key))
        .map(candidate => candidate.performer)
      const guest = guestName.trim()
      if (guest) performers.push({ kind: 'guest', name: guest })
      const uniquePerformers = Array.from(
        new Map(performers.map(performer => [performerIdentityKey(performer), performer])).values()
      )
      await onSavePerformers(uniquePerformers)
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'Could not save the vocal plan.')
    } finally {
      setBusy(false)
    }
  }

  async function saveDirection() {
    setBusy(true)
    setError(null)
    try {
      await onSaveDirection(direction.trim() || null)
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'Could not save the vocal direction.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="singer-picker-title"
      className="w-full max-w-[440px] rounded-[12px] border border-hair bg-card px-6 py-6"
    >
      <p id="singer-picker-title" className="text-[13px] font-semibold text-white">Who sings this section?</p>
      <p className="mt-1 text-[11px] leading-5 text-lavdim">
        Shape the vocal plan without changing writing credit or splits.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2" role="tablist" aria-label="Vocal plan type">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'person'}
          aria-controls="singer-picker-person-panel"
          onClick={() => setMode('person')}
          className={`rounded-[9px] border px-3 py-2 text-[12px] font-semibold ${
            mode === 'person' ? 'border-brandindigo bg-lav/[.08] text-white' : 'border-hairstrong text-lav'
          }`}
        >
          Name a performer
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'direction'}
          aria-controls="singer-picker-direction-panel"
          onClick={() => setMode('direction')}
          className={`rounded-[9px] border px-3 py-2 text-[12px] font-semibold ${
            mode === 'direction' ? 'border-brandindigo bg-lav/[.08] text-white' : 'border-hairstrong text-lav'
          }`}
        >
          Describe the voice
        </button>
      </div>

      {mode === 'person' ? (
        <div id="singer-picker-person-panel" role="tabpanel" className="mt-4">
          <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
            {choices.map(candidate => (
              <label
                key={candidate.key}
                className="flex cursor-pointer items-center gap-3 rounded-[9px] border border-hair bg-card2 px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  checked={selected.has(candidate.key)}
                  onChange={() => toggle(candidate.key)}
                  className="h-4 w-4 accent-violet-500"
                />
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white">
                  {candidate.name}
                </span>
                <span className="text-[10px] text-lavdim">{SOURCE_LABELS[candidate.source]}</span>
              </label>
            ))}
          </div>

          <label className="mt-4 block text-[11px] font-semibold text-lav" htmlFor="new-performer-name">
            Or add someone by name
          </label>
          <input
            id="new-performer-name"
            value={guestName}
            maxLength={120}
            onChange={event => setGuestName(event.target.value)}
            placeholder="Performer or group name"
            className="mt-1 w-full rounded-lg border border-hairstrong bg-card2 px-3 py-2 text-[13px] text-white outline-none placeholder:text-lavdim/60 focus:border-brandindigo"
          />
          <p className="mt-2 text-[10.5px] leading-4 text-lavdim">
            Performance plan only—no Writer&apos;s Room access, invitation, ownership, or split is added.
          </p>
          {currentDirection && (
            <p className="mt-2 text-[10.5px] leading-4 text-brandindigo">
              The direction “{currentDirection}” stays with this section after you assign someone.
            </p>
          )}
        </div>
      ) : (
        <div id="singer-picker-direction-panel" role="tabpanel" className="mt-4">
          <label className="block text-[11px] font-semibold text-lav" htmlFor="vocal-direction">
            What do you hear?
          </label>
          <input
            id="vocal-direction"
            value={direction}
            maxLength={160}
            onChange={event => setDirection(event.target.value)}
            placeholder="A gospel choir, raspy alto, two-part harmony…"
            className="mt-1 w-full rounded-lg border border-hairstrong bg-card2 px-3 py-2 text-[13px] text-white outline-none placeholder:text-lavdim/60 focus:border-brandindigo"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {DIRECTION_EXAMPLES.map(example => (
              <button
                key={example}
                type="button"
                onClick={() => setDirection(example)}
                className="rounded-full border border-hairstrong px-2.5 py-1 text-[10.5px] text-lav hover:text-white"
              >
                {example}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[10.5px] leading-4 text-lavdim">
            Creative direction only—not a person, credit, collaborator, or invitation.
          </p>
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-[11px] text-rose-300">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-[9px] border border-hairstrong px-3 py-2 text-[12px] font-semibold text-lav hover:text-white disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void (mode === 'person' ? savePeople() : saveDirection())}
          className="rounded-[9px] bg-grad px-3 py-2 text-[12px] font-semibold text-white shadow-cta disabled:opacity-40"
        >
          {busy ? 'Saving…' : mode === 'person' ? 'Save performers' : 'Save direction'}
        </button>
      </div>
    </div>
  )
}
