'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { VaultProjectType } from '@/types'
import { VAULT_PROJECT_TYPE_LABELS } from '@/types'

// ─── Two doors, not five types (S-03, the IA decision) ─────────────────
// "Unreleased" retires from THIS PICKER ONLY — it was the junk-drawer
// checkbox that started the whole My Catalogue design, and it is
// replaced by the thing it was always trying to be: a real song, in the
// composer, with a diary. `vault_projects.type`'s CHECK constraint is
// UNCHANGED (no migration in this plan touches it) and the one existing
// production row typed `unreleased` keeps validating — this is a UI and
// routing change only. See app/(artist)/vault/page.tsx's own RESEARCH
// Pitfall 4 comment for where that legacy row surfaces instead.
//
// NAMING RULE, applied here: "Song" is the face, "work" is the backbone
// — the button below says "Start a song" even though everything it
// creates, and everywhere split sheets/registration talk about it after,
// is a "work". Precision lives in the doctrine; warmth lives on this
// button.
const RELEASE_TYPES: VaultProjectType[] = ['single', 'snippet', 'ep', 'album']

type Door = 'choose' | 'song' | 'release'

export default function NewVaultProjectPage() {
  const router = useRouter()
  const [door, setDoor] = useState<Door>('choose')

  // 🎵 Start a song — plan 05's POST /api/works.
  const [songTitle, setSongTitle] = useState('')
  const [songSubmitting, setSongSubmitting] = useState(false)
  const [songError, setSongError] = useState<string | null>(null)

  // 🚀 Start a release — the existing form, unchanged in behavior.
  const [title, setTitle] = useState('')
  const [type, setType] = useState<VaultProjectType>('single')
  const [genre, setGenre] = useState('')
  const [releaseDate, setReleaseDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSongSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSongSubmitting(true)
    setSongError(null)

    const trimmed = songTitle.trim()
    const res = await fetch('/api/works', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Title is optional — the empty state on the other side of this
      // door IS the pitch ("Start with a hum — thirty seconds of melody
      // makes it real, and provably yours"), so a song can start
      // nameless. Omitting the key entirely (rather than sending an
      // empty string) lets the database's own 'Untitled' default stand.
      body: JSON.stringify(trimmed ? { title: trimmed } : {}),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setSongError(json.error ?? 'Something went wrong — try again')
      setSongSubmitting(false)
      return
    }

    const workId = json.data?.id
    router.push(workId ? `/vault/works/${workId}` : '/vault')
    router.refresh()
  }

  async function handleReleaseSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const res = await fetch('/api/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        type,
        genre: genre.trim() || null,
        release_date: releaseDate || null,
      }),
    })

    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Something went wrong')
      setSubmitting(false)
      return
    }

    // Land in the new project's room so the artist can start building it out.
    const newId = json.data?.id
    router.push(newId ? `/vault/${newId}` : '/vault')
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <Link href="/vault" className="text-sm text-white/50 hover:text-white">
        ← Back to Sound Vault
      </Link>

      {door === 'choose' && (
        <>
          <h1 className="mt-4 text-2xl font-semibold text-white">What are you starting?</h1>
          <p className="mt-1 text-sm text-white/50">
            A song goes into My Catalogue and starts a diary. A release goes into your Releases
            shelf with the full distribution and legal checklist.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setDoor('song')}
              aria-label="Start a song — goes into My Catalogue"
              className="flex flex-col items-start gap-2 rounded-[12px] bg-grad px-5 py-6 text-left text-white shadow-cta transition hover:brightness-110"
            >
              <span className="text-3xl">🎵</span>
              <span className="text-lg font-bold">Start a song</span>
              <span className="text-sm text-white/80">
                Hum it, write the lyrics, or upload a take — your diary starts the moment you do.
              </span>
            </button>

            <button
              type="button"
              onClick={() => setDoor('release')}
              aria-label="Start a release — single, snippet, EP, or album"
              className="flex flex-col items-start gap-2 rounded-[12px] border border-white/10 bg-white/5 px-5 py-6 text-left text-white/90 transition hover:border-white/30"
            >
              <span className="text-3xl">🚀</span>
              <span className="text-lg font-bold">Start a release</span>
              <span className="text-sm text-white/50">
                Single, snippet, EP, or album — the full readiness checklist for going out.
              </span>
            </button>
          </div>
        </>
      )}

      {door === 'song' && (
        <>
          <button
            type="button"
            onClick={() => setDoor('choose')}
            className="mt-4 block text-sm text-white/50 hover:text-white"
          >
            ← Choose a different door
          </button>
          <h1 className="mt-2 text-2xl font-semibold text-white">🎵 Start a song</h1>
          <p className="mt-1 text-sm text-white/50">
            A title is optional — you can name it later, or never. Thirty seconds of melody makes
            it real.
          </p>

          <form onSubmit={handleSongSubmit} className="mt-8 space-y-6">
            <div>
              <label htmlFor="song-title" className="block text-sm font-medium text-white/80">
                Title <span className="text-white/30">(optional)</span>
              </label>
              <input
                id="song-title"
                value={songTitle}
                onChange={e => setSongTitle(e.target.value)}
                placeholder="Untitled"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/30"
              />
            </div>

            {songError && (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                {songError}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={songSubmitting}
                className="rounded-lg bg-grad px-4 py-2 text-sm font-semibold text-white shadow-cta transition hover:brightness-110 disabled:opacity-40"
              >
                {songSubmitting ? 'Starting…' : 'Start a song'}
              </button>
              <Link href="/vault" className="text-sm text-white/50 hover:text-white">
                Cancel
              </Link>
            </div>
          </form>
        </>
      )}

      {door === 'release' && (
        <>
          <button
            type="button"
            onClick={() => setDoor('choose')}
            className="mt-4 block text-sm text-white/50 hover:text-white"
          >
            ← Choose a different door
          </button>
          <h1 className="mt-2 text-2xl font-semibold text-white">🚀 Start a release</h1>
          <p className="mt-1 text-sm text-white/50">
            Add it to your Releases shelf now — you can upload audio, art, and documents next.
          </p>

          <form onSubmit={handleReleaseSubmit} className="mt-8 space-y-6">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-white/80">
                Title
              </label>
              <input
                id="title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                placeholder="Untitled project"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/30"
              />
            </div>

            <div>
              <span className="block text-sm font-medium text-white/80">Type</span>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {RELEASE_TYPES.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`rounded-lg border px-3 py-2 text-sm transition ${
                      type === t
                        ? 'border-white bg-white text-black'
                        : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30'
                    }`}
                  >
                    {VAULT_PROJECT_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="genre" className="block text-sm font-medium text-white/80">
                  Genre <span className="text-white/30">(optional)</span>
                </label>
                <input
                  id="genre"
                  value={genre}
                  onChange={e => setGenre(e.target.value)}
                  placeholder="e.g. R&B"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label htmlFor="release_date" className="block text-sm font-medium text-white/80">
                  Target release <span className="text-white/30">(optional)</span>
                </label>
                <input
                  id="release_date"
                  type="date"
                  value={releaseDate}
                  onChange={e => setReleaseDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-white/30"
                />
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                {error}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={submitting || !title.trim()}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
              >
                {submitting ? 'Creating…' : 'Create project'}
              </button>
              <Link href="/vault" className="text-sm text-white/50 hover:text-white">
                Cancel
              </Link>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
