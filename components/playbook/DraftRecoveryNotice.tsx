'use client'

import type { PlaybookRecoveryRecord } from '@/lib/playbook/draft-recovery'

function localTime(value: number): string {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function DraftRecoveryNotice({
  candidate,
  savedAt,
  storageUnavailable,
  onRestore,
  onDiscard,
}: {
  candidate: PlaybookRecoveryRecord | null
  savedAt: number | null
  storageUnavailable: boolean
  onRestore: () => void
  onDiscard: () => void
}) {
  if (candidate) {
    return (
      <div className="rounded-xl border border-[color:var(--amber-line)] bg-[color:var(--amber-bg)] p-3" role="status">
        <p className="text-[11.5px] font-bold text-[color:var(--amber-fg)]">Recovered unfinished writing from {localTime(candidate.savedAt)}</p>
        <p className="mt-1 text-[10.5px] text-[color:var(--ink-3)]">This copy lived only in this browser and has not been submitted or published.</p>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={onRestore} className="rounded-full border border-[color:var(--amber-line)] px-3 py-1 text-[11px] font-bold text-[color:var(--amber-fg)]">Restore</button>
          <button type="button" onClick={onDiscard} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-[11px] text-[color:var(--ink-3)]">Discard</button>
        </div>
      </div>
    )
  }

  if (storageUnavailable) {
    return <p className="text-[10.5px] text-[color:var(--amber-fg)]" role="status">Local recovery is unavailable in this browser. Save a draft before leaving.</p>
  }

  if (savedAt) {
    return <p className="text-[10.5px] text-[color:var(--ink-3)]" role="status">Saved locally {localTime(savedAt)} · not yet saved to Funūn</p>
  }

  return null
}
