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

export default function SubmitSongPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [workId, setWorkId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setSubmitting(false)
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
