'use client'

import { useState } from 'react'
import type { VerificationMemberRow } from '@/lib/trust-safety/verification'

// ─── VerificationAdmin (Plan 13-05) ────────────────────────────────────────
// Admin table for granting/revoking the verified badge (SAFETY-03). Every
// write goes through /api/admin/verification/[id], which re-checks admin
// identity server-side and appends a verification_audit_log row — this UI
// is a thin convenience over that authority, mirroring
// components/admin/ReportsAdmin.tsx / PlacementAdmin.tsx. Manual admin
// authority only — there is no self-serve verification request in V1.

export function VerificationAdmin({ initialMembers }: { initialMembers: VerificationMemberRow[] }) {
  const [members, setMembers] = useState<VerificationMemberRow[]>(initialMembers)
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busySearch, setBusySearch] = useState(false)

  async function search() {
    setBusySearch(true)
    setError(null)
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    const res = await fetch(`/api/admin/verification${params.toString() ? `?${params}` : ''}`)
    const data = await res.json()
    setBusySearch(false)
    if (!res.ok) {
      setError(data.error ?? 'Could not load members')
      return
    }
    setMembers(data.data as VerificationMemberRow[])
  }

  async function setVerified(id: string, action: 'grant' | 'revoke') {
    setBusyId(id)
    setError(null)
    const res = await fetch(`/api/admin/verification/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const data = await res.json()
    setBusyId(null)
    if (!res.ok) {
      setError(data.error ?? 'Could not update verification')
      return
    }
    setMembers(prev => prev.map(m => (m.id === id ? (data.data as VerificationMemberRow) : m)))
  }

  return (
    <div className="mt-6 space-y-6">
      {error && (
        <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</p>
      )}

      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white/40">Search</h2>
        <div className="mt-3 flex gap-2">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') search()
            }}
            placeholder="Search by artist name or handle"
            className="admin-input"
          />
          <button
            type="button"
            disabled={busySearch}
            onClick={search}
            className="shrink-0 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-black text-black hover:bg-emerald-300 disabled:opacity-50"
          >
            Search
          </button>
        </div>
      </section>

      <section className="space-y-3">
        {members.length === 0 && <p className="text-sm text-white/45">No members match this search.</p>}
        {members.map(m => (
          <article key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{m.artist_name ?? 'Unnamed member'}</span>
                <span className="text-xs text-white/40">@{m.handle ?? '—'}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/50">
                  {m.member_type}
                </span>
                {m.verified && (
                  <span className="rounded-full bg-sky-400/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-sky-200">
                    Verified
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-white/35">
                {m.verified_at ? `Last updated ${new Date(m.verified_at).toLocaleString()}` : 'Never verified'}
              </p>
            </div>
            <button
              type="button"
              disabled={busyId === m.id}
              onClick={() => setVerified(m.id, m.verified ? 'revoke' : 'grant')}
              className={`rounded-md border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                m.verified
                  ? 'border-red-400/30 text-red-200 hover:bg-red-400/10'
                  : 'border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/10'
              }`}
            >
              {m.verified ? 'Revoke verified badge' : 'Grant verified badge'}
            </button>
          </article>
        ))}
      </section>

      <style jsx>{`
        :global(.admin-input) {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(0, 0, 0, 0.3);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: white;
        }
        :global(.admin-input:focus) {
          outline: none;
          border-color: rgba(52, 211, 153, 0.4);
        }
      `}</style>
    </div>
  )
}
