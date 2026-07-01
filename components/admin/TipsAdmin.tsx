'use client'

import { useState, useRef, useEffect } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────

type DraftItem = {
  key: string
  label: string
  tip_draft: string | null
  tip_body: string | null
  tip_approved: boolean
  author: string | null
  tip_drafted_at: string | null
}

type DraftState = DraftItem & {
  status: 'pending' | 'approved' | 'rejected'
  currentText: string
  saving: boolean
  error: string | null
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

// ─── AutoGrowTextarea ───────────────────────────────────────────────────────
// A textarea that grows with its content.

function AutoGrowTextarea({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (val: string) => void
  disabled?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      rows={3}
      className="w-full resize-none overflow-hidden rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-brandindigo/60 disabled:opacity-50"
      placeholder="Tip text…"
    />
  )
}

// ─── TipCard ───────────────────────────────────────────────────────────────

function TipCard({
  draft,
  onApprove,
  onReject,
  onChange,
}: {
  draft: DraftState
  onApprove: (key: string) => Promise<void>
  onReject: (key: string) => Promise<void>
  onChange: (key: string, text: string) => void
}) {
  const isPending = draft.status === 'pending'
  const isApproved = draft.status === 'approved'
  const isRejected = draft.status === 'rejected'

  return (
    <div
      className={[
        'rounded-[14px] border p-4 transition-colors',
        isApproved ? 'bg-emerald-400/[0.04] border-emerald-400/20' : '',
        isRejected ? 'bg-rose-400/[0.04] border-rose-400/20' : '',
        isPending ? 'bg-card border-hair' : '',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-white truncate">{draft.label}</p>
          <p className="text-[11px] text-lavdim mt-0.5">
            {draft.author ?? 'unknown'} · {formatDate(draft.tip_drafted_at)}
          </p>
        </div>

        {/* Status badge */}
        {isApproved && (
          <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400">
            Approved
          </span>
        )}
        {isRejected && (
          <span className="shrink-0 rounded-full border border-rose-400/30 bg-rose-400/10 px-2.5 py-0.5 text-[11px] font-bold text-rose-400">
            Rejected
          </span>
        )}
      </div>

      {/* Key */}
      <p className="text-[11px] text-lavdim mb-2 font-mono">{draft.key}</p>

      {/* Editable tip text (only when pending) */}
      {isPending && (
        <div className="mb-3">
          <AutoGrowTextarea
            value={draft.currentText}
            onChange={text => onChange(draft.key, text)}
            disabled={draft.saving}
          />
        </div>
      )}

      {/* Read-only approved text */}
      {isApproved && draft.tip_body && (
        <p className="text-[14px] text-white/70 mb-3 leading-[1.5]">{draft.tip_body}</p>
      )}

      {/* Error */}
      {draft.error && (
        <p className="mb-3 text-[13px] text-rose-400">{draft.error}</p>
      )}

      {/* Approve / Reject buttons */}
      {isPending && (
        <div className="flex gap-2">
          <button
            onClick={() => onApprove(draft.key)}
            disabled={draft.saving}
            aria-label={`Approve tip for ${draft.key}`}
            className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1.5 text-[13px] font-bold text-emerald-400 transition hover:bg-emerald-400/20 disabled:opacity-50"
          >
            {draft.saving ? 'Saving…' : 'Approve'}
          </button>
          <button
            onClick={() => onReject(draft.key)}
            disabled={draft.saving}
            aria-label={`Reject tip for ${draft.key}`}
            className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-1.5 text-[13px] font-bold text-rose-400 transition hover:bg-rose-400/20 disabled:opacity-50"
          >
            {draft.saving ? '…' : 'Reject'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── TipsAdmin ─────────────────────────────────────────────────────────────

export function TipsAdmin({ initialDrafts }: { initialDrafts: DraftItem[] }) {
  const [drafts, setDrafts] = useState<DraftState[]>(
    initialDrafts.map(d => ({
      ...d,
      status: 'pending' as const,
      currentText: d.tip_draft ?? '',
      saving: false,
      error: null,
    }))
  )
  const [showRejected, setShowRejected] = useState(false)

  const pending = drafts.filter(d => d.status === 'pending')
  const approved = drafts.filter(d => d.status === 'approved')
  const rejected = drafts.filter(d => d.status === 'rejected')

  const handleChange = (key: string, text: string) => {
    setDrafts(prev =>
      prev.map(d => (d.key === key ? { ...d, currentText: text } : d))
    )
  }

  const setSaving = (key: string, saving: boolean) => {
    setDrafts(prev => prev.map(d => (d.key === key ? { ...d, saving } : d)))
  }

  const setDraftError = (key: string, error: string | null) => {
    setDrafts(prev => prev.map(d => (d.key === key ? { ...d, error } : d)))
  }

  const handleApprove = async (key: string) => {
    const draft = drafts.find(d => d.key === key)
    if (!draft) return
    setSaving(key, true)
    setDraftError(key, null)
    try {
      const res = await fetch(`/api/admin/tips/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', tip_text: draft.currentText }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Couldn\'t save — please try again.')
      }
      const json = await res.json() as { data: { tip_body: string } }
      setDrafts(prev =>
        prev.map(d =>
          d.key === key
            ? { ...d, status: 'approved', tip_body: json.data.tip_body, saving: false, error: null }
            : d
        )
      )
    } catch (err) {
      setDraftError(key, err instanceof Error ? err.message : 'Couldn\'t save — please try again.')
      setSaving(key, false)
    }
  }

  const handleReject = async (key: string) => {
    setSaving(key, true)
    setDraftError(key, null)
    try {
      const res = await fetch(`/api/admin/tips/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Couldn\'t save — please try again.')
      }
      setDrafts(prev =>
        prev.map(d =>
          d.key === key ? { ...d, status: 'rejected', saving: false, error: null } : d
        )
      )
    } catch (err) {
      setDraftError(key, err instanceof Error ? err.message : 'Couldn\'t save — please try again.')
      setSaving(key, false)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────

  const noPendingAtAll = pending.length === 0 && approved.length === 0

  return (
    <div className="mt-6">
      {/* Pending drafts */}
      {noPendingAtAll ? (
        <p className="text-[14px] text-white/50">No tip drafts pending approval.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map(d => (
            <TipCard
              key={d.key}
              draft={d}
              onApprove={handleApprove}
              onReject={handleReject}
              onChange={handleChange}
            />
          ))}
          {approved.map(d => (
            <TipCard
              key={d.key}
              draft={d}
              onApprove={handleApprove}
              onReject={handleReject}
              onChange={handleChange}
            />
          ))}
        </div>
      )}

      {/* Show rejected toggle */}
      {rejected.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowRejected(v => !v)}
            className="text-[13px] text-white/40 hover:text-white/60 transition"
          >
            {showRejected ? 'Hide rejected' : `Show rejected (${rejected.length})`}
          </button>
          {showRejected && (
            <div className="mt-3 flex flex-col gap-3">
              {rejected.map(d => (
                <TipCard
                  key={d.key}
                  draft={d}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onChange={handleChange}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
