'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RightsStatusPatch } from '@/components/vault/RightsStatusPatch'

// Copyright registration step. Filing happens at the US Copyright Office (eCO);
// once the artist has filed, "Mark as filed" records a copyright_registration
// document, which satisfies the Release Readiness copyright gate (+15).
// copyrightStatus prop drives the 3-state badge on the rights page:
//   'not_filed' (default) → show eCO link + "Mark as filed" button
//   'filed'               → show amber badge + "Mark as registered" RightsStatusPatch
//   'registered'          → show emerald badge, no action button
export function CopyrightFiling({
  projectId,
  filed,
  copyrightStatus,
}: {
  projectId: string
  filed: boolean
  copyrightStatus?: 'not_filed' | 'filed' | 'registered'
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
        body: JSON.stringify({ type: 'copyright_registration', status: 'pending' }),
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
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* 'registered' state: show badge only, no further actions */}
          {copyrightStatus === 'registered' ? (
            <span className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
              Registered ✓
            </span>
          ) : (
            <>
              <a
                href="https://eco.copyright.gov"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/30 hover:text-white"
              >
                File at eCO ↗
              </a>
              {/* 'filed' state: amber badge + path to mark registered */}
              {(filed || copyrightStatus === 'filed') ? (
                <div className="flex items-center gap-2">
                  <span className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-300">
                    Filed — awaiting certificate
                  </span>
                  <RightsStatusPatch
                    projectId={projectId}
                    field="copyright_status"
                    value="registered"
                    label="Mark as registered"
                  />
                </div>
              ) : (
                <button
                  onClick={markFiled}
                  disabled={saving}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Mark as filed'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </div>
  )
}
