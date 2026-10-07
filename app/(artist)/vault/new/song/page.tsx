'use client'

// ─── "Submit a song" — the capture-first entry point ──────────────────────
//
// Reached from the marketing site's Crate CTA via
// /signup?next=%2Fvault%2Fnew%2Fsong, and directly by anyone already signed in.
//
// WHAT THIS SCREEN IS FOR, AND WHAT IT DELIBERATELY IS NOT
//
// The CTA says "Submit a song". It does NOT submit anything, and this screen's
// whole job is to make that true and legible in the same motion. Per the owner:
//
//   "Have them upload the song into their own vault and make sure they
//    understand that this is a private vault and not yet a submission our
//    staff can determine for The Crate."
//
// Submission remains an explicit, separate per-track action elsewhere
// (components/vault/TrackList.tsx -> /api/sync-library/submit). Nothing here
// touches it.
//
// THE SONG GOES IN FIRST. docs/architecture/ACCOUNT-TYPES.md: profile
// completion "is never required before capturing an idea, entering a Writer's
// Room, uploading a take, writing lyrics, or leaving a note." So this screen
// creates the work and hands the artist straight into the room where humming,
// uploading and writing already live. The questionnaire comes AFTER, and every
// question is skippable -- a questionnaire that gates the upload inverts the
// rule.
//
// ONE CLICK, NOT ZERO. The work is created on an explicit action rather than
// on page load: a GET that writes a row would create an orphan work every time
// someone refreshed or hit back.
//
// All user-visible strings come from lib/onboarding/submit-song-copy, where
// they are under test against the four doctrine rules (private-not-submitted,
// promise-nothing-unstored, even-shares, four-doors).

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { OPENING } from '@/lib/onboarding/submit-song-copy'
import { SubmitSongQuestions, type Answers } from '@/components/onboarding/SubmitSongQuestions'
import type { AddedCollaborator } from '@/components/onboarding/SubmitSongCollaborators'
import { SubmitSongSummary } from '@/components/onboarding/SubmitSongSummary'

export default function SubmitSongPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [workId, setWorkId] = useState<string | null>(null)
  const [ownerMemberId, setOwnerMemberId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 'statement' -> 'questions' -> 'summary'. The statement comes first and asks
  // nothing: the song is already in before any question appears.
  const [stage, setStage] = useState<'statement' | 'questions' | 'summary'>('statement')
  const [answers, setAnswers] = useState<Answers>({})
  // Values whose promised write has actually landed. Starts empty and only
  // grows on a 2xx -- a failed write leaves the promise unrendered rather than
  // showing it over something that did not happen.
  const [fulfilled, setFulfilled] = useState<string[]>([])
  const [collaborators, setCollaborators] = useState<AddedCollaborator[]>([])

  async function createWork(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const trimmed = title.trim()
    // Omit the key entirely rather than sending '' so the column's own
    // 'Untitled' default stands -- same reasoning as the /vault/new song door.
    const res = await fetch('/api/works', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trimmed ? { title: trimmed } : {}),
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok || !json.data?.id) {
      setError(json.error ?? 'Something went wrong — try again.')
      setSubmitting(false)
      return
    }
    setWorkId(json.data.id as string)
    setOwnerMemberId((json.data.ownerMemberId as string | null) ?? null)
    setSubmitting(false)
  }

  if (workId && stage === 'summary') {
    return (
      <main className="mx-auto w-full max-w-[560px] px-6 py-14">
        <SubmitSongSummary
          workId={workId}
          // The questionnaire asks the vocal follow-up whenever the song may
          // have vocals; a future slice can narrow this from the work's own
          // vocal_state once that is known at this point in the flow.
          hasVocals
          answers={answers}
        />
      </main>
    )
  }

  if (workId && stage === 'questions') {
    return (
      <main className="mx-auto w-full max-w-[560px] px-6 py-14">
        <SubmitSongQuestions
          hasVocals
          fulfilledWrites={fulfilled}
          addedCollaborators={collaborators}
          onAddCollaborator={async (name, email) => {
            if (!workId) return null
            // Two calls on purpose. A collaborator needs only a name
            // (collaborators/route.ts gates on `if (!update.name)`), while the
            // members endpoint's new-collaborator branch requires an email --
            // so going through the roster first is what lets "add who you
            // remember" be true for someone unreachable.
            const cRes = await fetch('/api/collaborators', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(email ? { name, email } : { name }),
            })
            const cJson = await cRes.json().catch(() => ({}))
            const collaboratorId = cJson.data?.id as string | undefined
            if (!cRes.ok || !collaboratorId) return null

            const mRes = await fetch(`/api/works/${workId}/members`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              // is_writer FALSE: membership and splits are different facts
              // (Pitfall 3). Promotion happens only if Q3 says "not yet".
              body: JSON.stringify({ collaborator_id: collaboratorId, tier: 'contribute', is_writer: false }),
            })
            const mJson = await mRes.json().catch(() => ({}))
            const memberId = mJson.data?.member?.id as string | undefined
            if (!mRes.ok || !memberId) return null

            setCollaborators(prev => [...prev, { name, memberId }])
            return memberId
          }}
          onAnswer={async (questionId, values) => {
            // The only answer that promises a write today. "We'll start a
            // split sheet on this song at even shares" means putting the
            // artist onto the living-draft sheet POST /api/works already
            // created empty of parties -- Pitfall 3: the sheet existing and
            // someone being ON it are different facts, and only an explicit
            // promotion bridges them.
            if (questionId !== 'splits' || !values.includes('not_yet')) return
            if (!workId || !ownerMemberId) return
            // The artist plus everyone Q2 captured. planWriterPromotion
            // redrafts EVERY party to an equal share on each promotion, so the
            // sheet ends up even across all of them whatever order these land
            // in. Sequential rather than parallel: each call reads the sheet,
            // redrafts it and writes it back, so concurrent promotions would
            // race on the same rows.
            const ids = [ownerMemberId, ...collaborators.map(c => c.memberId)]
            let allOk = true
            for (const id of ids) {
              const res = await fetch(`/api/works/${workId}/members/${id}/promote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // No designation: an honest "not stated" rather than a
                // fabricated DDEX/PRO role the artist never gave us.
                body: JSON.stringify({}),
              })
              if (!res.ok) allOk = false
            }
            // Only claim the sheet is set up if every writer actually landed on
            // it. A partial promotion would make "even shares" describe a sheet
            // that is missing someone.
            if (allOk) setFulfilled(prev => (prev.includes('not_yet') ? prev : [...prev, 'not_yet']))
          }}
          onFinish={next => {
            setAnswers(next)
            setStage('summary')
          }}
        />
      </main>
    )
  }

  if (workId) {
    return (
      <main className="mx-auto w-full max-w-[560px] px-6 py-14">
        <div className="rounded-[12px] border border-hair bg-card px-[26px] py-[26px]">
          <h1 className="text-[22px] font-bold leading-snug text-white">{OPENING.heading}</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-lavdim">{OPENING.body}</p>

          <div className="mt-7 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => router.push(`/vault/works/${workId}`)}
              className="rounded-lg bg-grad px-4 py-2.5 text-sm font-semibold text-white shadow-cta transition hover:brightness-110"
            >
              Open your song
            </button>
            <button
              type="button"
              onClick={() => setStage('questions')}
              className="rounded-lg border border-hair bg-card2 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/25"
            >
              Answer a few questions first
            </button>
            <Link
              href="/vault"
              className="text-center text-[13px] text-lavdim transition hover:text-white"
            >
              Back to Sound Vault
            </Link>
          </div>

          {/* Deliberately absent: any claim that an answer was recorded, any
              submission language, any readiness score. The questionnaire that
              follows (slice 3) writes through existing endpoints, so every
              promise it makes is one the product keeps. */}
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[560px] px-6 py-14">
      <div className="rounded-[12px] border border-hair bg-card px-[26px] py-[26px]">
        <p className="text-[10px] uppercase tracking-[.16em] text-lavdim">Start a song</p>
        <h1 className="mt-[6px] text-[22px] font-bold leading-snug text-white">
          Put it somewhere it&rsquo;s safe.
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-lavdim">
          This goes into your own private Sound Vault — not to our team, and not up for sync. You can
          send it our way later, on purpose.
        </p>

        <form onSubmit={createWork} className="mt-7 space-y-5">
          <div>
            <label htmlFor="song-title" className="block text-[13px] font-medium text-white/80">
              Title <span className="text-lavdim">(optional)</span>
            </label>
            <input
              id="song-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Untitled"
              className="mt-1.5 w-full rounded-lg border border-hair bg-card2 px-3 py-2 text-[14px] text-white placeholder-lavdim outline-none focus:border-white/30"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-[13px] text-rose-200"
            >
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-grad px-4 py-2.5 text-sm font-semibold text-white shadow-cta transition hover:brightness-110 disabled:opacity-40"
            >
              {submitting ? 'Starting…' : 'Start my song'}
            </button>
            <Link href="/vault" className="text-[13px] text-lavdim transition hover:text-white">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  )
}
