'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CuratorCard } from './CuratorCard'
import { PITCH_NOTE_MAX_WORDS } from '@/lib/curators/pitch-copy'
import type { DirectoryCurator } from '@/lib/curators/response-rate'
import type { PitchStatus } from '@/types'

// ─── PitchComposer ────────────────────────────────────────────────────
// Lives inside /launchpad/[projectId] (D-06/D-07 — never on /curators).
// Track selector (D-09, no lead-track restriction) + curator multi-select
// (reuses CuratorCard's selectable mode) + AI-draft note + 150-word
// server-re-validated Send gate (T-06-11, locked in UI-SPEC).

const STATUS_LABELS: Record<PitchStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
}

const GATE_MESSAGE = 'Add a playlist-specific note (up to 150 words) to send.'

type Track = { id: string; title: string }

type Props = {
  project: { id: string; title: string }
  tracks: Track[]
  curators: DirectoryCurator[]
  alreadyPitchedByTrack: Record<string, Record<string, PitchStatus>>
}

function wordCount(note: string): number {
  const trimmed = note.trim()
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).filter(Boolean).length
}

export function PitchComposer({ project, tracks, curators, alreadyPitchedByTrack }: Props) {
  const router = useRouter()
  const [trackId, setTrackId] = useState(tracks[0]?.id ?? '')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [hasDrafted, setHasDrafted] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pitchedOverride, setPitchedOverride] = useState<Record<string, Record<string, PitchStatus>>>({})

  const count = wordCount(note)
  const pitchedForTrack = {
    ...(alreadyPitchedByTrack[trackId] ?? {}),
    ...(pitchedOverride[trackId] ?? {}),
  }

  const selectedCurators = curators.filter(c => selected.has(c.id))
  const anyDriftFlagged = selectedCurators.some(c => c.drift_flagged)

  const gatesPass = selected.size > 0 && note.trim().length > 0 && count <= PITCH_NOTE_MAX_WORDS

  function toggleCurator(curatorId: string) {
    setSuccess(null)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(curatorId)) next.delete(curatorId)
      else next.add(curatorId)
      return next
    })
  }

  function onTrackChange(nextTrackId: string) {
    setTrackId(nextTrackId)
    setSelected(new Set())
    setSuccess(null)
    setError(null)
  }

  async function draftNote() {
    const firstCuratorId = Array.from(selected)[0]
    if (!trackId || !firstCuratorId) {
      setError('Select a curator first to draft a note for them.')
      return
    }
    setDrafting(true)
    setError(null)
    try {
      const res = await fetch('/api/pitches/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, trackId, curatorId: firstCuratorId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong — please try again.')
        return
      }
      setNote(json.data?.note ?? '')
      setHasDrafted(true)
    } catch {
      setError('Something went wrong — please try again.')
    } finally {
      setDrafting(false)
    }
  }

  async function sendPitch() {
    if (!gatesPass || sending) return
    setSending(true)
    setError(null)
    setSuccess(null)
    const curatorIds = Array.from(selected)
    try {
      const res = await fetch('/api/pitches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, trackId, curatorIds, note }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? "Couldn't send this pitch — please try again.")
        return
      }
      const n = json.data?.sent ?? curatorIds.length
      setSuccess(`Pitch sent to ${n} curator${n === 1 ? '' : 's'}.`)
      setPitchedOverride(prev => ({
        ...prev,
        [trackId]: {
          ...(prev[trackId] ?? {}),
          ...Object.fromEntries(curatorIds.map(id => [id, 'pending' as PitchStatus])),
        },
      }))
      setNote('')
      setHasDrafted(false)
      setSelected(new Set())
      router.refresh()
    } catch {
      setError("Couldn't send this pitch — please try again.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-[18px] border border-hair bg-card p-5">
      <h2 className="text-[15px] font-bold text-white">Pitch to curators</h2>

      {tracks.length === 0 ? (
        <p className="mt-3 text-[13px] text-lavdim">Add a track to this project to start pitching.</p>
      ) : (
        <>
          <div className="mt-4">
            <label
              className="mb-1.5 block text-[12px] font-bold uppercase tracking-[.14em] text-lavdim"
              htmlFor="pitch-track"
            >
              Track
            </label>
            <select
              id="pitch-track"
              value={trackId}
              onChange={e => onTrackChange(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
            >
              {tracks.map(track => (
                <option key={track.id} value={track.id}>
                  {track.title}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-[12px] font-bold uppercase tracking-[.14em] text-lavdim">Curators</p>
            {curators.length === 0 ? (
              <div className="rounded-[14px] border border-hair bg-card2 px-4 py-6 text-center">
                <p className="text-[14px] font-bold text-white">No curators in the directory yet</p>
                <p className="mt-1 text-[12.5px] text-lavdim">
                  Funūn&apos;s team is building the curator directory. Check back soon.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {curators.map(curator => {
                  const status = pitchedForTrack[curator.id]
                  let disabled = false
                  let disabledLabel: string | undefined
                  if (status) {
                    disabled = true
                    disabledLabel = `Already pitched · ${STATUS_LABELS[status]}`
                  } else if (curator.do_not_pitch) {
                    disabled = true
                    disabledLabel = 'Unsubscribed'
                  } else if (!curator.email_valid) {
                    disabled = true
                    disabledLabel = 'Email bounced'
                  }
                  return (
                    <CuratorCard
                      key={curator.id}
                      curator={curator}
                      selectable
                      selected={selected.has(curator.id)}
                      disabled={disabled}
                      disabledLabel={disabledLabel}
                      onToggle={toggleCurator}
                    />
                  )
                })}
              </div>
            )}
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <label
                className="text-[12px] font-bold uppercase tracking-[.14em] text-lavdim"
                htmlFor="pitch-note"
              >
                Note
              </label>
              <button
                type="button"
                onClick={draftNote}
                disabled={drafting || selected.size === 0}
                className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-40"
              >
                {drafting ? 'Drafting…' : hasDrafted ? 'Regenerate note' : 'Draft a pitch note'}
              </button>
            </div>
            <textarea
              id="pitch-note"
              value={note}
              onChange={e => {
                setNote(e.target.value)
                setSuccess(null)
              }}
              rows={5}
              placeholder="Write a playlist-specific note, or draft one with AI…"
              className="mt-2 w-full resize-none rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
            />
            <p
              aria-live="polite"
              className={`mt-1 text-right text-xs ${
                count >= PITCH_NOTE_MAX_WORDS ? 'font-bold text-rose-300' : 'text-lavdim'
              }`}
            >
              {count}/{PITCH_NOTE_MAX_WORDS} words
            </p>
          </div>

          {anyDriftFlagged && (
            <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
              This curator&apos;s genre focus may have shifted — double check fit.
            </div>
          )}

          {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
          {success && <p className="mt-3 text-xs text-emerald-300">{success}</p>}

          <div className="mt-4">
            <button
              type="button"
              onClick={sendPitch}
              disabled={!gatesPass || sending}
              aria-disabled={!gatesPass || sending}
              title={!gatesPass ? GATE_MESSAGE : undefined}
              className="rounded-lg bg-grad px-5 py-3 text-[15px] font-bold text-white shadow-cta transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? 'Sending…' : 'Send pitch'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
