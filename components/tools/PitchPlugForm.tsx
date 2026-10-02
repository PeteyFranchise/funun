'use client'

import { useState } from 'react'
import { CURATORS, type CuratorType, type PitchPlugOutput } from '@/lib/tools/pitchplug'
import { PitchCard } from './PitchCard'
import { attemptCopy } from '@/lib/clipboard/attempt-copy'

export type PitchProjectOption = { id: string; title: string; type: string; isPublic?: boolean }

export function PitchPlugForm({
  projects,
  initialProjectId,
  locked,
  demo,
  artistHandle,
}: {
  projects: PitchProjectOption[]
  initialProjectId?: string
  /** When true the project is fixed (vault-connected entry) and not selectable. */
  locked?: boolean
  demo?: boolean
  /** The artist's public profile handle, when their profile is public. */
  artistHandle?: string | null
}) {
  const [projectId, setProjectId] = useState(initialProjectId ?? projects[0]?.id ?? '')
  const [copied, setCopied] = useState<string | null>(null)
  const [copyFailed, setCopyFailed] = useState<string | null>(null)

  const selectedProject = projects.find(p => p.id === projectId)
  async function copyLink(path: string) {
    const url = typeof window !== 'undefined' ? window.location.origin + path : path
    const outcome = await attemptCopy(url)
    if (outcome === 'copied') {
      setCopyFailed(null)
      setCopied(path)
      setTimeout(() => setCopied(c => (c === path ? null : c)), 1500)
    } else {
      setCopied(null)
      setCopyFailed(path)
      setTimeout(() => setCopyFailed(f => (f === path ? null : f)), 1500)
    }
  }
  const [selected, setSelected] = useState<Set<CuratorType>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pitches, setPitches] = useState<PitchPlugOutput | null>(null)

  function toggle(type: CuratorType) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  async function generate() {
    if (!projectId) {
      setError('Pick a project to pitch.')
      return
    }
    if (selected.size === 0) {
      setError('Select at least one recipient type.')
      return
    }
    setLoading(true)
    setError(null)
    setPitches(null)
    const res = await fetch('/api/tools/pitchplug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, curatorTypes: Array.from(selected) }),
    })
    setLoading(false)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error ?? 'Generation failed')
      return
    }
    setPitches(json.data as PitchPlugOutput)
  }

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        {!locked && projects.length > 0 && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/70">Project to pitch</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-card px-3 py-2.5 text-sm text-white focus:border-white/30 focus:outline-none"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.title} · {p.type}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Shareable links to include in your pitch */}
        {(artistHandle || selectedProject?.isPublic) && (
          <div className="rounded-xl border border-white/10 bg-card p-4">
            <p className="mb-3 text-sm font-medium text-white/70">Links to include in your pitch</p>
            <div className="space-y-2">
              {artistHandle && (
                <LinkRow
                  label="Your profile"
                  path={`/u/${artistHandle}`}
                  copied={copied === `/u/${artistHandle}`}
                  failed={copyFailed === `/u/${artistHandle}`}
                  onCopy={() => void copyLink(`/u/${artistHandle}`)}
                />
              )}
              {selectedProject?.isPublic && (
                <LinkRow
                  label={`Listen — ${selectedProject.title}`}
                  path={`/r/${selectedProject.id}`}
                  copied={copied === `/r/${selectedProject.id}`}
                  failed={copyFailed === `/r/${selectedProject.id}`}
                  onCopy={() => void copyLink(`/r/${selectedProject.id}`)}
                />
              )}
            </div>
            <p className="mt-3 text-xs text-white/40">
              Public links — paste them into your outreach so recipients can hear the track and see who you are.
            </p>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-white/70">Who are you pitching?</p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {CURATORS.map(c => {
              const isOn = selected.has(c.type)
              return (
                <button
                  key={c.type}
                  type="button"
                  onClick={() => toggle(c.type)}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                    isOn
                      ? 'border-brandindigo bg-brandindigo/10'
                      : 'border-card2 bg-card hover:border-white/25'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                      isOn ? 'border-[#818CF8] bg-[#818CF8] text-black' : 'border-white/30 text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-white">{c.name}</span>
                    <span className="block text-xs text-white/40">{c.blurb}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {error && <p className="text-sm text-rose-300">{error}</p>}

        <button
          onClick={generate}
          disabled={loading}
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
        >
          {loading ? 'Writing pitches…' : `Generate ${selected.size || ''} pitch${selected.size === 1 ? '' : 'es'}`.trim()}
        </button>
      </div>

      {pitches && (
        <div className="space-y-4" id="pitch-results">
          <h2 className="text-lg font-semibold text-white">Your pitches</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {(Object.keys(pitches) as CuratorType[]).map(type => {
              const pitch = pitches[type]
              if (!pitch) return null
              return (
                <PitchCard
                  key={type}
                  curatorType={type}
                  pitch={pitch}
                  projectId={projectId}
                  demo={demo}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function LinkRow({
  label,
  path,
  copied,
  failed,
  onCopy,
}: {
  label: string
  path: string
  copied: boolean
  failed: boolean
  onCopy: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-card2 px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="block truncate text-xs text-white/40">{path}</span>
        {failed && <span className="block text-xs text-rose-400">Couldn&apos;t copy — select and copy manually</span>}
      </span>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
      >
        {copied ? 'Copied' : failed ? "Couldn't copy" : 'Copy'}
      </button>
    </div>
  )
}
