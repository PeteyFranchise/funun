'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// ─── NewSelectsForm (31-10, Task 2) ─────────────────────────────────────────
// The Selects list page's "New Selects" creation entry — targets a client
// (required) + an optional brief (via a ?briefId= deep link, the same
// query-param shape a future Crate Requests "Build Selects" one-click
// action or a workspace Curation-tab CTA would link in with; neither room
// exists yet in this wave — 31-11/31-08/31-09 — so this form is the sole
// entry point for now). POSTs to the own-book-scoped 31-04 route, then
// navigates straight into the builder.

export function NewSelectsForm({ orgs }: { orgs: { id: string; name: string }[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultOrgId = searchParams.get('orgId') ?? ''
  const briefId = searchParams.get('briefId')

  // Deep-linked from Crate Requests' "Build Selects" (31-11) via ?orgId=
  // (+ optional ?briefId=) — open pre-filled instead of leaving the AE to
  // find and click the collapsed "+ Build Selects" toggle themselves.
  const [open, setOpen] = useState(Boolean(defaultOrgId))
  const [orgId, setOrgId] = useState(defaultOrgId)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!orgId) {
      setError('Pick a client.')
      return
    }
    if (!name.trim()) {
      setError('Name this Selects.')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/selects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, name: name.trim(), briefId: briefId || null }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Couldn't create this Selects.")
      const created = (json as { data: { id: string } }).data
      router.push(`/admin/selects/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create this Selects.")
      setCreating(false)
    }
  }

  if (orgs.length === 0) return null

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fncon-cta mb-4 rounded-lg px-4 py-2.5 text-[13px] font-bold shadow transition hover:opacity-90"
      >
        ＋ Build Selects
      </button>
    )
  }

  return (
    <div className="mb-4 rounded-[10px] border border-[color:var(--indigo)] bg-[color:var(--panel)] p-4">
      <h3 className="mb-3 text-[13px] font-bold text-[color:var(--ink)]">New Selects</h3>
      {error && <p className="mb-3 text-[12.5px] text-[color:var(--rose-fg)]">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[color:var(--ink-2)]">Client *</label>
          <select
            value={orgId}
            onChange={e => setOrgId(e.target.value)}
            className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)] focus:border-[color:var(--indigo)] focus:outline-none"
          >
            <option value="">Select a client…</option>
            {orgs.map(o => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[color:var(--ink-2)]">
            Name for the client *
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Late-night drive — Q4 auto"
            className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
          />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={handleCreate}
          disabled={creating}
          className="fncon-cta rounded-lg px-4 py-2 text-[13px] font-bold shadow transition hover:opacity-90 disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create & open builder'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg border border-[color:var(--border)] px-4 py-2 text-[13px] text-[color:var(--ink-2)] transition hover:text-[color:var(--ink)]"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
