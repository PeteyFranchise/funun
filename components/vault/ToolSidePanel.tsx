'use client'

import { useEffect, useState } from 'react'
import type { DocRequirement } from '@/lib/vault/stage3'
import {
  SPLIT_ROLE_LABELS,
  type SplitRole,
} from '@/lib/tools/splitsheet'

// ─── ToolSidePanel ───────────────────────────────────────────────────
// Slide-in panel from the right that hosts any Stage 3 tool, pre-filled
// with the requirement's data. Closes on Escape or outside click.
// Reusable across all five tools: SplitSheet renders an editable form
// (live % total, submit gated at 100%); the AI tools render a Generate
// button and then their JSON output.

type DraftContributor = { name: string; role: SplitRole; percentage: string }

const ROLE_OPTIONS = Object.entries(SPLIT_ROLE_LABELS) as [SplitRole, string][]

export function ToolSidePanel({
  projectId,
  req,
  onClose,
  onDone,
}: {
  projectId: string
  req: DocRequirement | null
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [output, setOutput] = useState<Record<string, unknown> | null>(null)
  const [contributors, setContributors] = useState<DraftContributor[]>([])

  // Reset panel state whenever a new requirement opens.
  useEffect(() => {
    setBusy(false)
    setError(null)
    setOutput(null)
    if (req?.tool === 'splitsheet') {
      const names = (req.prefill.collaborators as string[] | undefined) ?? []
      const seed: DraftContributor[] =
        names.length > 0
          ? names.map(n => ({ name: n, role: 'other' as SplitRole, percentage: '' }))
          : [{ name: '', role: 'other', percentage: '' }]
      setContributors(seed)
    } else {
      setContributors([])
    }
  }, [req])

  // Escape closes the panel.
  useEffect(() => {
    if (!req) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [req, onClose])

  if (!req) return null

  const splitTotal =
    Math.round(
      contributors.reduce((s, c) => s + (Number(c.percentage) || 0), 0) * 100
    ) / 100

  function setContributor(i: number, patch: Partial<DraftContributor>) {
    setContributors(prev => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }
  function addContributor() {
    setContributors(prev => [...prev, { name: '', role: 'other', percentage: '' }])
  }
  function removeContributor(i: number) {
    setContributors(prev => prev.filter((_, idx) => idx !== i))
  }

  async function generate(input: Record<string, unknown>) {
    if (!req) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/vault/${projectId}/documents/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: req.tool, trackId: req.trackId ?? null, input }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong')
        return
      }
      setOutput((json.data?.output as Record<string, unknown>) ?? null)
      onDone()
    } catch {
      setError('Network error — please try again')
    } finally {
      setBusy(false)
    }
  }

  function submitSplitSheet() {
    const input = {
      song_name: (req!.prefill.song_name as string) ?? req!.trackTitle ?? '',
      contributors: contributors.map(c => ({
        name: c.name,
        role: c.role,
        percentage: Number(c.percentage) || 0,
      })),
    }
    void generate(input)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop — click closes */}
      <button
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0a0a0f] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-white/40">
              {req.severity === 'required' ? 'Required' : 'Recommended'}
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-white">{req.title}</h2>
            {(req.trackTitle || req.collaborator) && (
              <p className="mt-0.5 truncate text-xs text-white/40">
                {req.scope === 'collaborator'
                  ? `${req.collaboratorRole ?? 'Collaborator'} · ${req.trackTitle}`
                  : req.trackTitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/10 p-1.5 text-white/50 transition hover:border-white/30 hover:text-white"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          <p className="mb-4 text-sm text-white/50">{req.protects}</p>

          {req.tool === 'splitsheet' ? (
            output ? (
              <SplitSheetResult output={output} />
            ) : (
              <SplitSheetForm
                contributors={contributors}
                total={splitTotal}
                onSet={setContributor}
                onAdd={addContributor}
                onRemove={removeContributor}
              />
            )
          ) : output ? (
            <JsonOutput data={output} />
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
              Generate a personalized {req.title.toLowerCase()} using the project details
              {req.collaborator ? ` and ${req.collaborator}'s role` : ''}. You can review and
              edit before using it.
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-300">
              {error}
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-white/10 p-5">
          {req.tool === 'splitsheet' ? (
            output ? (
              <button
                onClick={onClose}
                className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
              >
                Done
              </button>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="text-white/50">Total</span>
                  <span
                    className={splitTotal === 100 ? 'font-semibold text-emerald-300' : 'font-semibold text-amber-300'}
                  >
                    {splitTotal}%
                  </span>
                </div>
                <button
                  onClick={submitSplitSheet}
                  disabled={busy || splitTotal !== 100}
                  className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
                >
                  {busy ? 'Saving…' : 'Save split sheet'}
                </button>
                {splitTotal !== 100 && (
                  <p className="mt-2 text-center text-xs text-white/40">
                    Shares must total exactly 100% to save.
                  </p>
                )}
              </>
            )
          ) : output ? (
            <div className="flex gap-2">
              <button
                onClick={() => generate(req.prefill)}
                disabled={busy}
                className="flex-1 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-40"
              >
                {busy ? 'Regenerating…' : 'Regenerate'}
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
              >
                Done
              </button>
            </div>
          ) : (
            <button
              onClick={() => generate(req.prefill)}
              disabled={busy}
              className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {busy ? 'Generating…' : `Generate ${req.title.toLowerCase()}`}
            </button>
          )}
        </div>
      </aside>
    </div>
  )
}

// ─── SplitSheet form ─────────────────────────────────────────────────
function SplitSheetForm({
  contributors,
  total,
  onSet,
  onAdd,
  onRemove,
}: {
  contributors: DraftContributor[]
  total: number
  onSet: (i: number, patch: Partial<DraftContributor>) => void
  onAdd: () => void
  onRemove: (i: number) => void
}) {
  return (
    <div className="space-y-3">
      {contributors.map((c, i) => (
        <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2">
            <input
              value={c.name}
              onChange={e => onSet(i, { name: e.target.value })}
              placeholder="Collaborator name"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
            />
            {contributors.length > 1 && (
              <button
                onClick={() => onRemove(i)}
                className="shrink-0 rounded-lg border border-white/10 p-2 text-white/40 transition hover:border-rose-400/40 hover:text-rose-300"
                aria-label="Remove collaborator"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <select
              value={c.role}
              onChange={e => onSet(i, { role: e.target.value as SplitRole })}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
            >
              {ROLE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value} className="bg-[#0a0a0f]">
                  {label}
                </option>
              ))}
            </select>
            <div className="relative w-28">
              <input
                type="number"
                min={0}
                max={100}
                value={c.percentage}
                onChange={e => onSet(i, { percentage: e.target.value })}
                placeholder="0"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-7 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-white/40">
                %
              </span>
            </div>
          </div>
        </div>
      ))}

      <button
        onClick={onAdd}
        className="w-full rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm text-white/50 transition hover:border-white/30 hover:text-white"
      >
        + Add collaborator
      </button>

      <p className="text-xs text-white/40">
        {total === 100
          ? 'Shares total 100% — ready to save.'
          : `Remaining: ${Math.round((100 - total) * 100) / 100}%`}
      </p>
    </div>
  )
}

function SplitSheetResult({ output }: { output: Record<string, unknown> }) {
  const contributors =
    (output.contributors as { name: string; role: string; percentage: number }[] | undefined) ?? []
  return (
    <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4">
      <p className="text-sm font-medium text-emerald-300">Split sheet saved</p>
      <p className="mt-0.5 text-xs text-white/40">{String(output.song_name ?? '')}</p>
      <ul className="mt-3 space-y-1.5">
        {contributors.map((c, i) => (
          <li key={i} className="flex items-center justify-between text-sm">
            <span className="text-white/80">
              {c.name} <span className="text-white/40">· {SPLIT_ROLE_LABELS[c.role as SplitRole] ?? c.role}</span>
            </span>
            <span className="font-medium text-white">{c.percentage}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Generic JSON output renderer ────────────────────────────────────
// Renders the AI tools' JSON nicely without a per-tool template: strings,
// string arrays, arrays of {field,value} or {label,...} objects, and
// nested objects all degrade gracefully.
function JsonOutput({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-4">
      {Object.entries(data).map(([key, value]) => (
        <Field key={key} label={humanize(key)} value={value} />
      ))}
    </div>
  )
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/40">{label}</p>
      <div className="mt-1.5 text-sm text-white/80">
        <Value value={value} />
      </div>
    </div>
  )
}

function Value({ value }: { value: unknown }) {
  if (value == null) return <span className="text-white/30">—</span>
  if (typeof value === 'string') return <p className="whitespace-pre-wrap leading-relaxed">{value}</p>
  if (typeof value === 'number' || typeof value === 'boolean') return <span>{String(value)}</span>

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-white/30">—</span>
    // Array of {field,value} pairs → key/value list.
    if (value.every(v => v && typeof v === 'object' && 'field' in v && 'value' in v)) {
      return (
        <dl className="space-y-1.5">
          {(value as { field: string; value: string }[]).map((v, i) => (
            <div key={i} className="flex flex-col">
              <dt className="text-xs text-white/40">{v.field}</dt>
              <dd className="text-white/80">{v.value}</dd>
            </div>
          ))}
        </dl>
      )
    }
    // Array of strings → ordered/bulleted list.
    if (value.every(v => typeof v === 'string')) {
      return (
        <ul className="space-y-1.5">
          {(value as string[]).map((v, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-white/30">•</span>
              <span className="leading-relaxed">{v}</span>
            </li>
          ))}
        </ul>
      )
    }
    // Mixed objects → recurse.
    return (
      <div className="space-y-3">
        {(value as unknown[]).map((v, i) => (
          <Value key={i} value={v} />
        ))}
      </div>
    )
  }

  if (typeof value === 'object') {
    return (
      <div className="space-y-2">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k}>
            <p className="text-xs text-white/40">{humanize(k)}</p>
            <div className="text-white/80">
              <Value value={v} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return <span>{String(value)}</span>
}

function humanize(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}
