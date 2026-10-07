'use client'

// ─── Inline collaborator capture, under Q2 ────────────────────────────────
//
// WHY A NAME ALONE IS ENOUGH HERE
//
// Q2's third answer is "A few people, and tracking them down is the problem",
// and the questionnaire answers it with "Add who you remember." That promise
// only holds if a collaborator can be recorded WITHOUT an email -- and the
// members endpoint's AddNewCollaboratorSchema requires one
// (members/route.ts:41-46, email().max(254)).
//
// So capture goes through POST /api/collaborators, where the route's own gate
// is `if (!update.name)` and email is optional, and the resulting
// collaborator_id is then added to the work. Two calls instead of one, chosen
// because the one-call shape would have made the copy a lie for exactly the
// case the product claims to be good at.
//
// Supplying an email is still better and the field says so: the collaborators
// route matches "only by normalized email; names are not unique enough to
// establish identity", so an email is what makes this a reusable identity
// rather than a fresh card per song.
//
// MEMBERSHIP ONLY. Everyone added here lands with tier 'contribute' and
// is_writer FALSE. Being on the work and being on the splits are different
// facts (Pitfall 3); promotion happens only if the artist answers Q3 with
// "not yet", which is the explicit act that moves the sheet.

import { useState } from 'react'

export type AddedCollaborator = { name: string; memberId: string }

type Props = {
  /** Resolves to the new work_members id, or null if the add failed. */
  onAdd: (name: string, email: string | null) => Promise<string | null>
  added: readonly AddedCollaborator[]
}

export function SubmitSongCollaborators({ onAdd, added }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const trimmedName = name.trim()
    if (!trimmedName) return
    setBusy(true)
    setError(null)
    const trimmedEmail = email.trim()
    const memberId = await onAdd(trimmedName, trimmedEmail ? trimmedEmail : null)
    if (memberId) {
      setName('')
      setEmail('')
    } else {
      setError('Could not add them — try again.')
    }
    setBusy(false)
  }

  return (
    <div className="mt-4 rounded-lg border border-hair bg-card2 px-3.5 py-3">
      {added.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1">
          {added.map(c => (
            <li key={c.memberId} className="text-[13px] text-white">
              {c.name} <span className="text-lavdim">· on the song</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          aria-label="Collaborator name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name"
          className="w-full rounded-lg border border-hair bg-card px-3 py-2 text-[13px] text-white placeholder-lavdim outline-none focus:border-white/30"
        />
        <input
          aria-label="Collaborator email (optional)"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email (optional)"
          className="w-full rounded-lg border border-hair bg-card px-3 py-2 text-[13px] text-white placeholder-lavdim outline-none focus:border-white/30"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !name.trim()}
          className="shrink-0 rounded-lg border border-hair bg-card px-3 py-2 text-[13px] font-semibold text-white transition hover:border-white/25 disabled:opacity-40"
        >
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-lavdim">
        A name is enough. An email lets us reach them later and keeps them as one person across
        your songs.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-[12px] text-rose-200">
          {error}
        </p>
      )}
    </div>
  )
}
