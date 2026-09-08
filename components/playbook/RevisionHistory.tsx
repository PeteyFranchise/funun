'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export type PlaybookRevisionSummary = {
  id: string
  revision_number: number
  publication_action: string
  created_at: string
}

export function RevisionHistory({
  entryId,
  currentRevision,
  currentDraftVersion,
  revisions,
  canRestore,
}: {
  entryId: string
  currentRevision: number
  currentDraftVersion: number
  revisions: PlaybookRevisionSummary[]
  canRestore: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const restore = async (revisionNumber: number) => {
    setBusy(revisionNumber)
    setError(null)
    try {
      const response = await fetch(`/api/admin/playbook/entries/${entryId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revisionNumber,
          expectedRevision: currentRevision,
          expectedDraftVersion: currentDraftVersion,
        }),
      })
      const json = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(json.error ?? 'Could not restore this revision.')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not restore this revision.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <details className="mt-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)]">
      <summary className="cursor-pointer px-4 py-3 text-[13px] font-bold text-[color:var(--ink)]">
        Publication history · {revisions.length} revision{revisions.length === 1 ? '' : 's'}
      </summary>
      <ol className="border-t border-[color:var(--border)] px-4 py-3">
        {revisions.map(revision => (
          <li key={revision.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] py-2 text-[12px] last:border-0">
            <span>
              <span className="font-semibold text-[color:var(--ink-2)]">
                Revision {revision.revision_number} · {revision.publication_action.replaceAll('_', ' ')}
              </span>
              <time className="ml-2 text-[color:var(--ink-3)]">
                {new Date(revision.created_at).toLocaleDateString('en-US')}
              </time>
            </span>
            {canRestore && revision.revision_number !== currentRevision && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => restore(revision.revision_number)}
                className="rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[11px] font-bold text-[color:var(--indigo)] disabled:opacity-50"
              >
                {busy === revision.revision_number ? 'Restoring…' : 'Restore as new revision'}
              </button>
            )}
          </li>
        ))}
      </ol>
      {error && <p className="px-4 pb-3 text-[12px] text-rose-400">{error}</p>}
    </details>
  )
}
