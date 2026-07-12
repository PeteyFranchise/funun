'use client'

import { useState } from 'react'
import { INDUSTRY_ROLE_GROUPS } from '@/lib/industry-roles'

// ─── CapabilityCta (D-09) ────────────────────────────────────────────────
// Subtle footer entry point into the D-01 capability request flow. Renders
// nothing if the account already holds both capabilities. This component is
// UI convenience only — the actual grant decision (instant vs. pending) is
// enforced server-side by POST /api/capabilities/request (Plan 02, D-02);
// this CTA never decides anything itself (T-15-12).
export function CapabilityCta({ capabilities }: { capabilities: string[] }) {
  const missing: 'artist' | 'industry' | null = !capabilities.includes('artist')
    ? 'artist'
    : !capabilities.includes('industry')
      ? 'industry'
      : null

  const [open, setOpen] = useState(false)
  const [roleSlugs, setRoleSlugs] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  if (!missing) return null

  const label = missing === 'industry' ? 'Add industry access' : 'Add artist access'

  function toggleRole(slug: string) {
    setRoleSlugs(prev => (prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]))
  }

  async function handleSubmit() {
    if (roleSlugs.length === 0) {
      setError('Select at least one role.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/capabilities/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capability: missing, role_slugs: roleSlugs }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        data?: { grantId: string; status: 'approved' | 'pending' }
        error?: string
      }
      if (!res.ok) {
        if (res.status === 409) {
          setResult("You've already requested or have this capability.")
        } else {
          setError(json.error ?? 'Something went wrong — please try again.')
        }
        return
      }
      setResult(
        json.data?.status === 'approved'
          ? 'Access granted — refresh to see your new rooms.'
          : 'Request submitted for review.'
      )
    } catch {
      setError('Something went wrong — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="border-t border-hair px-3 py-3">
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            setResult(null)
            setError(null)
          }}
          className="text-[12px] font-medium text-white/40 transition hover:text-lavdim"
        >
          + {label}
        </button>
      ) : (
        <div className="rounded-[10px] border border-hairstrong bg-card2 p-3">
          {result ? (
            <p className="text-[12px] text-lav">{result}</p>
          ) : (
            <>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[.14em] text-lavdim">
                {label}
              </p>
              {error && <p className="mb-2 text-[12px] text-rose-400">{error}</p>}
              <div className="max-h-40 space-y-3 overflow-y-auto">
                {INDUSTRY_ROLE_GROUPS.map(group => (
                  <div key={group.group}>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[.14em] text-lavdim">
                      {group.group}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.roles.map(role => {
                        const selected = roleSlugs.includes(role.slug)
                        return (
                          <button
                            key={role.slug}
                            type="button"
                            onClick={() => toggleRole(role.slug)}
                            className={[
                              'rounded-full border px-2 py-1 text-[11px] font-semibold transition',
                              selected
                                ? 'border-lav/50 bg-lav/20 text-white'
                                : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:text-white/80',
                            ].join(' ')}
                          >
                            {role.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="rounded-lg bg-white px-3 py-1.5 text-[12px] font-bold text-black transition hover:bg-white/90 disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Submit'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-white/60 transition hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
