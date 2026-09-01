'use client'

import { useState } from 'react'
import type { LyricBlockSnapshotView } from '@/types/catalogue'

export type LyricHistoryPanelProps = {
  label: string
  currentText: string
  snapshots: LyricBlockSnapshotView[]
  loading: boolean
  error: string | null
  restoringId: string | null
  onRestore: (snapshotId: string) => void
  onClose: () => void
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Time unavailable'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function snapshotContext(snapshot: LyricBlockSnapshotView): string {
  return snapshot.reason === 'before_restore'
    ? `Saved before ${snapshot.actorName} restored an earlier version`
    : `Saved before ${snapshot.actorName} edited this section`
}

function LyricText({ text }: { text: string }) {
  return text.length > 0 ? (
    <p className="whitespace-pre-wrap text-[12px] leading-6 text-lav">{text}</p>
  ) : (
    <p className="text-[12px] italic text-lavdim">Blank section</p>
  )
}

export function LyricHistoryPanel({
  label,
  currentText,
  snapshots,
  loading,
  error,
  restoringId,
  onRestore,
  onClose,
}: LyricHistoryPanelProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lyric-history-title"
      className="max-h-full w-full max-w-[640px] overflow-y-auto rounded-[14px] border border-hairstrong bg-card p-5 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brandindigo">Recovery history</p>
          <h2 id="lyric-history-title" className="mt-1 text-[20px] font-bold text-white">
            {label}
          </h2>
          <p className="mt-1 max-w-[520px] text-[11px] leading-5 text-lavdim">
            A recovery point is saved when a writer begins changing this section—not for every keystroke.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={restoringId !== null}
          aria-label="Close lyric history"
          className="text-[16px] text-lavdim hover:text-white disabled:opacity-40"
        >
          ✕
        </button>
      </div>

      <div className="mt-4 rounded-[11px] border border-brandindigo/30 bg-brandindigo/[.06] p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.12em] text-brandindigo">Current version</p>
        <LyricText text={currentText} />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-[9px] border border-rose-300/20 bg-rose-300/[.06] px-3 py-2 text-[11px] text-rose-200">
          {error}
        </p>
      )}

      <div className="mt-5 space-y-3">
        {loading ? (
          <p className="text-[12px] text-lavdim">Loading recovery points…</p>
        ) : snapshots.length === 0 ? (
          <div className="rounded-[11px] border border-hair bg-card2 px-4 py-4">
            <p className="text-[12px] font-semibold text-white">No earlier version yet</p>
            <p className="mt-1 text-[11px] leading-5 text-lavdim">
              The first recovery point appears after this section is changed and saved.
            </p>
          </div>
        ) : (
          snapshots.map(snapshot => {
            const confirming = confirmingId === snapshot.id
            const restoring = restoringId === snapshot.id
            return (
              <div key={snapshot.id} className="rounded-[11px] border border-hair bg-card2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold text-white">{snapshotContext(snapshot)}</p>
                    <p className="mt-0.5 text-[10px] text-lavdim">{formatDate(snapshot.created_at)}</p>
                  </div>
                  {!confirming ? (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(snapshot.id)}
                      disabled={restoringId !== null}
                      className="rounded-[8px] border border-hairstrong px-3 py-1.5 text-[11px] font-semibold text-lav hover:border-brandindigo hover:text-white disabled:opacity-50"
                    >
                      Review restore
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="text-[10px] text-lavdim">Current words stay recoverable.</span>
                      <button
                        type="button"
                        onClick={() => onRestore(snapshot.id)}
                        disabled={restoring}
                        className="rounded-[8px] bg-brandindigo px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                      >
                        {restoring ? 'Restoring…' : 'Restore this version'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        disabled={restoring}
                        className="text-[10px] text-lavdim hover:text-white disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-3 border-t border-hair pt-3">
                  <LyricText text={snapshot.text} />
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
