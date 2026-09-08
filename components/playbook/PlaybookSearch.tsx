'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import type { PlaybookSearchResult } from '@/lib/playbook/search'

const RECENT_KEY = 'funun-playbook-recent-searches-v1'

export function PlaybookSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaybookSearchResult[]>([])
  const [recent, setRecent] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
      if (Array.isArray(parsed)) setRecent(parsed.filter(value => typeof value === 'string').slice(0, 6))
    } catch { /* Search remains available when storage is unavailable. */ }
  }, [])

  async function search(event?: FormEvent, override?: string) {
    event?.preventDefault()
    const value = (override ?? query).trim()
    if (value.length < 2) return
    setQuery(value)
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/playbook/search?q=${encodeURIComponent(value)}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not search The Playbook')
      setResults(payload.data ?? [])
      setSearched(true)
      const next = [value, ...recent.filter(item => item.toLowerCase() !== value.toLowerCase())].slice(0, 6)
      setRecent(next)
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* Non-essential. */ }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not search The Playbook')
    } finally { setBusy(false) }
  }

  return (
    <div className="mt-6">
      <form onSubmit={search} className="flex gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
        <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search doctrine, SOPs, steps, or questions…" aria-label="Search The Playbook" className="min-w-0 flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-4 py-3 text-[13px] text-[color:var(--ink)] outline-none focus:border-[color:var(--indigo)]" />
        <button disabled={busy || query.trim().length < 2} className="rounded-lg px-5 py-3 text-[12px] font-extrabold text-white disabled:opacity-50" style={{ background: 'var(--grad)' }}>{busy ? 'Searching…' : 'Search'}</button>
      </form>
      {recent.length > 0 && !searched && <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-[.1em] text-[color:var(--ink-3)]">Recent</span>{recent.map(value => <button key={value} type="button" onClick={() => search(undefined, value)} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-[11px] text-[color:var(--ink-2)]">{value}</button>)}</div>}
      <div className="mt-5 space-y-2">
        {results.map((result, index) => <Link key={`${result.entryId}-${result.sectionId ?? index}`} href={`/admin/playbook/${result.roomKey}/${result.slug}${result.sectionId ? `#${result.sectionId}` : ''}`} className="block rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4 transition hover:border-[color:var(--indigo)]"><p className="text-[9.5px] font-bold uppercase tracking-[.1em] text-[color:var(--indigo)]">{result.roomLabel} · {result.entryType} · revision {result.revisionNumber}</p><h2 className="mt-1 text-[14px] font-extrabold text-[color:var(--ink)]">{result.title}{result.section ? ` · ${result.section}` : ''}</h2><p className="mt-2 text-[11.5px] leading-5 text-[color:var(--ink-3)]">{result.excerpt}</p></Link>)}
        {searched && !busy && results.length === 0 && <p className="rounded-xl border border-dashed border-[color:var(--border)] px-5 py-10 text-center text-[12px] text-[color:var(--ink-3)]">No approved guidance matched. Try a role, workflow, decision, or shorter phrase.</p>}
      </div>
      {error && <p role="alert" className="mt-3 text-[11px] text-rose-400">{error}</p>}
      <p className="mt-4 text-[10.5px] text-[color:var(--ink-3)]">Search results include only published guidance from rooms you are authorized to enter.</p>
    </div>
  )
}
