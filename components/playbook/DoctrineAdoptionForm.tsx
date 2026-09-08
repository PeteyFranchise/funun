'use client'

import { useEffect, useState } from 'react'
import type { PlaybookEntryRow } from '@/lib/playbook/entries'
import { MarkdownBody } from '@/components/playbook/MarkdownDoc'
import { MarkdownRevisionDiff } from '@/components/playbook/MarkdownRevisionDiff'

type Subgroup = { id: string; label: string }
type ExistingSource = {
  id: string
  title: string
  slug: string | null
  status: string
  publishedBody: string | null
  hasPendingDraft: boolean
  revisionNumber: number
  draftVersion: number
}
type AdoptionCheck = {
  state: 'available' | 'unchanged' | 'changed' | 'already_adopted_elsewhere'
  sourcePath: string
  sourceHash: string
  existing: ExistingSource | null
}

export function DoctrineAdoptionForm({
  roomKey,
  subgroups,
  onAdopted,
}: {
  roomKey: string
  subgroups: Subgroup[]
  onAdopted: (entry: PlaybookEntryRow) => void
}) {
  const [title, setTitle] = useState('')
  const [sourcePath, setSourcePath] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [subGroupId, setSubGroupId] = useState('')
  const [check, setCheck] = useState<AdoptionCheck | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!title.trim() && !sourcePath.trim() && !markdown.trim()) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [title, sourcePath, markdown])

  useEffect(() => setCheck(null), [title, sourcePath, markdown, subGroupId])

  const run = async (action: 'check' | 'adopt' | 'propose_update') => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/playbook/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          roomKey,
          subGroupId: subGroupId || undefined,
          title: title.trim(),
          sourcePath: sourcePath.trim(),
          markdown,
        }),
      })
      const json = (await response.json().catch(() => ({}))) as {
        data?: AdoptionCheck & { entry?: PlaybookEntryRow; state: AdoptionCheck['state'] | 'adopted' | 'update_proposed' }
        error?: string
      }
      if (!response.ok || !json.data) throw new Error(json.error ?? 'Could not process this doctrine source.')

      if (action === 'check') {
        setCheck(json.data as AdoptionCheck)
        return
      }
      if (json.data.entry) onAdopted(json.data.entry)
      setCheck(null)
      setTitle('')
      setSourcePath('')
      setMarkdown('')
      setSubGroupId('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not process this doctrine source.')
    } finally {
      setBusy(false)
    }
  }

  const ready = Boolean(title.trim() && sourcePath.trim() && markdown.trim())

  return (
    <details className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)]">
      <summary className="cursor-pointer px-4 py-3 text-[13px] font-bold text-[color:var(--ink)]">
        Adopt Markdown doctrine
        <span className="ml-2 font-normal text-[color:var(--ink-3)]">Import once, then review in Funūn</span>
      </summary>
      <div className="border-t border-[color:var(--border)] p-4">
        <p className="text-[12px] leading-relaxed text-[color:var(--ink-3)]">
          Paste an approved repository Markdown file and its repository-relative path. Funūn calculates the source hash and never overwrites an existing article automatically.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="Playbook title"
            className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)]"
          />
          <input
            value={sourcePath}
            onChange={event => setSourcePath(event.target.value)}
            placeholder=".planning/deliberations/example.md#optional-section"
            className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 font-mono text-[12px] text-[color:var(--ink)]"
          />
          {subgroups.length > 0 && (
            <select
              value={subGroupId}
              onChange={event => setSubGroupId(event.target.value)}
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)] sm:col-span-2"
            >
              <option value="">No subgroup</option>
              {subgroups.map(subgroup => (
                <option key={subgroup.id} value={subgroup.id}>{subgroup.label}</option>
              ))}
            </select>
          )}
        </div>
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          <textarea
            value={markdown}
            onChange={event => setMarkdown(event.target.value)}
            rows={16}
            placeholder="Paste the Markdown source…"
            className="w-full resize-y rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 font-mono text-[12px] text-[color:var(--ink)]"
          />
          <div className="max-h-[420px] overflow-auto rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] p-4">
            {markdown.trim() ? <MarkdownBody content={markdown} /> : <p className="text-[12px] text-[color:var(--ink-3)]">Import preview</p>}
          </div>
        </div>

        {check?.state === 'available' && (
          <p className="mt-3 text-[12px] text-emerald-400">This source is available to adopt as an unpublished draft.</p>
        )}
        {check?.state === 'unchanged' && (
          <p className="mt-3 text-[12px] text-[color:var(--ink-3)]">This exact source is already adopted. Nothing will be duplicated.</p>
        )}
        {check?.state === 'already_adopted_elsewhere' && (
          <p className="mt-3 text-[12px] text-amber-400">This source already belongs to another Playbook room.</p>
        )}
        {check?.state === 'changed' && (
          <div className="mt-3">
            <p className="text-[12px] text-amber-400">
              The repository source changed. Review the comparison before creating a pending revision.
            </p>
            {check.existing?.publishedBody && (
              <MarkdownRevisionDiff published={check.existing.publishedBody} proposed={markdown} />
            )}
            {check.existing?.hasPendingDraft && (
              <p className="mt-2 text-[12px] text-rose-400">A pending draft already exists and must be handled first.</p>
            )}
          </div>
        )}
        {error && <p className="mt-3 text-[12px] text-rose-400">{error}</p>}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !ready}
            onClick={() => run('check')}
            className="rounded-full border border-[color:var(--border)] px-4 py-1.5 text-[12px] font-bold text-[color:var(--ink-2)] disabled:opacity-50"
          >
            {busy ? 'Checking…' : 'Check source'}
          </button>
          {check?.state === 'available' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run('adopt')}
              className="rounded-full px-4 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
              style={{ background: 'var(--grad)' }}
            >
              Adopt as draft
            </button>
          )}
          {check?.state === 'changed' && !check.existing?.hasPendingDraft && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run('propose_update')}
              className="rounded-full px-4 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
              style={{ background: 'var(--grad)' }}
            >
              Create review draft
            </button>
          )}
        </div>
      </div>
    </details>
  )
}
