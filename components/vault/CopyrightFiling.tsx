'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Copyright registration step. Filing happens at the US Copyright Office (eCO);
// once the artist has filed, "Mark as filed" records a copyright_registration
// document, which satisfies the Release Readiness copyright gate (+15).
export function CopyrightFiling({
  projectId,
  filed,
}: {
  projectId: string
  filed: boolean
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function markFiled() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/vault/${projectId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'copyright_registration', status: 'verified' }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? 'Could not save')
        return
      }
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">
            Register the © with the US Copyright Office
          </p>
          <p className="mt-1 text-xs text-white/50">
            One registration can cover the whole release. Strengthens your claim and is
            required to sue for statutory damages.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href="https://eco.copyright.gov"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/30 hover:text-white"
          >
            File at eCO ↗
          </a>
          {filed ? (
            <span className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
              Filed ✓
            </span>
          ) : (
            <button
              onClick={markFiled}
              disabled={saving}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Mark as filed'}
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </div>
  )
}
