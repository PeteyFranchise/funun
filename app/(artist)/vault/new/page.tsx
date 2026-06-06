'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { VaultProjectType } from '@/types'
import { VAULT_PROJECT_TYPE_LABELS } from '@/types'

const TYPES: VaultProjectType[] = ['single', 'snippet', 'ep', 'album', 'unreleased']

export default function NewVaultProjectPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<VaultProjectType>('single')
  const [genre, setGenre] = useState('')
  const [releaseDate, setReleaseDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
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
      <h1 className="mt-4 text-2xl font-semibold text-white">New vault project</h1>
      <p className="mt-1 text-sm text-white/50">
        Add it to your vault now — you can upload audio, art, and documents next.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
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
            {TYPES.map(t => (
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
    </div>
  )
}
