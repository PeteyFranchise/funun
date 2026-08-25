'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { EntryStatus, EntryType, PlaybookEntryRow } from '@/lib/playbook/entries'

// ─── EntryEditor (31.2-08 Task 1, R9/D-31.2-05/06) ─────────────────────────
// The Playbook's SOP/Topic authoring UI — mirrors app/(admin)/tips/page.tsx's
// TipsAdmin draft→approve affordances (pending card, editable body, approve/
// reject buttons), generalized to the two entry types the room page needs:
// - sop:   a checklist — content shape `{ items: string[] }`
// - topic: a coaching bundle — content shape `{ questions: string[] }`
//   (D-31.2-05: "heading + open-ended questions"; also the exact shape the
//   Game-Plan picker's loadAuthoredGamePlanTopics reads, 31.2-08 Task 2)
//
// Data + string action props only (Pitfall 1, mirrors GamePlanPanel): the
// room page passes plain serializable data down; this component builds its
// own fetch calls against the plan-04 routes and calls router.refresh()
// after every write. It never decides publish authority itself — the create/
// edit/approve/reject routes derive isApprover server-side (leadership OR
// isRoomLead) and return the resulting status; this component only reflects
// what the server returns (T-31.2-22 mitigation).

const ENTRIES_PATH = '/api/admin/playbook/entries'

function entryPatchPath(id: string): string {
  return `${ENTRIES_PATH}/${id}`
}

function linesToList(raw: string): string[] {
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
}

function contentLines(entryType: EntryType, content: Record<string, unknown>): string[] {
  const key = entryType === 'sop' ? 'items' : 'questions'
  const raw = content[key]
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []
}

function buildContent(entryType: EntryType, lines: string[]): Record<string, unknown> {
  return entryType === 'sop' ? { items: lines } : { questions: lines }
}

function StatusBadge({ status }: { status: EntryStatus }) {
  if (status === 'published') {
    return (
      <span
        className="shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold"
        style={{ color: 'var(--green-fg)', background: 'var(--green-bg)', borderColor: 'var(--green-line)' }}
      >
        Published
      </span>
    )
  }
  return (
    <span className="shrink-0 rounded-full border border-[color:var(--border)] bg-[color:var(--panel-2)] px-2.5 py-0.5 text-[11px] font-bold text-[color:var(--ink-3)]">
      Pending approval
    </span>
  )
}

// ─── New entry form ─────────────────────────────────────────────────────

function NewEntryForm({
  roomKey,
  isApprover,
  onCreated,
}: {
  roomKey: string
  isApprover: boolean
  onCreated: (entry: PlaybookEntryRow) => void
}) {
  const router = useRouter()
  const [entryType, setEntryType] = useState<EntryType>('sop')
  const [title, setTitle] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bodyLabel = entryType === 'sop' ? 'Checklist items (one per line)' : 'Questions (one per line)'

  const handleSubmit = async () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(ENTRIES_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomKey,
          entryType,
          title: trimmedTitle,
          content: buildContent(entryType, linesToList(bodyText)),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: PlaybookEntryRow; error?: string }
      if (!res.ok || !json.data) throw new Error(json.error ?? "Couldn't save — please try again.")
      onCreated(json.data)
      setTitle('')
      setBodyText('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save — please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
      <h3 className="text-[14px] font-medium text-[color:var(--ink)]">New entry</h3>
      <p className="mt-0.5 text-[12px] text-[color:var(--ink-3)]">
        {isApprover
          ? 'Publishes immediately — you have approval authority in this room.'
          : 'Submitted as a draft — a room-lead or leadership approves before it publishes.'}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={entryType}
          onChange={e => setEntryType(e.target.value as EntryType)}
          disabled={saving}
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)] focus:border-[color:var(--indigo)] focus:outline-none disabled:opacity-50"
        >
          <option value="sop">SOP</option>
          <option value="topic">Topic</option>
        </select>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          disabled={saving}
          placeholder="Title…"
          className="min-w-0 flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none disabled:opacity-50"
        />
      </div>

      <div className="mt-2">
        <textarea
          value={bodyText}
          onChange={e => setBodyText(e.target.value)}
          disabled={saving}
          rows={4}
          placeholder={bodyLabel}
          className="w-full resize-none rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none disabled:opacity-50"
        />
        <p className="mt-1 text-[10.5px] text-[color:var(--ink-3)]">{bodyLabel}</p>
      </div>

      {error && (
        <p
          className="mt-2 rounded-lg border px-3 py-2 text-[12.5px]"
          style={{ color: 'var(--rose-fg)', background: 'var(--rose-bg)', borderColor: 'var(--rose-line)' }}
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving || !title.trim()}
        className="mt-3 rounded-full px-4 py-1.5 text-[13px] font-bold text-white transition disabled:opacity-50"
        style={{ background: 'var(--grad)' }}
      >
        {saving ? 'Saving…' : isApprover ? 'Publish' : 'Submit for approval'}
      </button>
    </div>
  )
}

// ─── EntryCard — one authored entry, with edit/approve/reject affordances ──

function EntryCard({
  entry,
  isApprover,
  onUpdated,
}: {
  entry: PlaybookEntryRow
  isApprover: boolean
  onUpdated: (entry: PlaybookEntryRow) => void
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [bodyText, setBodyText] = useState(() => contentLines(entry.entry_type, entry.content).join('\n'))
  const [busy, setBusy] = useState<'edit' | 'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const bodyLabel = entry.entry_type === 'sop' ? 'Checklist items (one per line)' : 'Questions (one per line)'
  const publishedLines = contentLines(entry.entry_type, entry.content)
  const draftLines = entry.draft_content ? contentLines(entry.entry_type, entry.draft_content) : null

  const runAction = async (action: 'approve' | 'reject' | 'edit', content?: Record<string, unknown>) => {
    setBusy(action)
    setError(null)
    try {
      const res = await fetch(entryPatchPath(entry.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content ? { action, content } : { action }),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: PlaybookEntryRow; error?: string }
      if (!res.ok || !json.data) throw new Error(json.error ?? "Couldn't save — please try again.")
      onUpdated(json.data)
      if (action === 'edit') setEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save — please try again.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-[color:var(--ink)]">{entry.title}</p>
          <p className="mt-0.5 text-[10.5px] uppercase tracking-[.06em] text-[color:var(--ink-3)]">
            {entry.entry_type}
          </p>
        </div>
        <StatusBadge status={entry.status} />
      </div>

      {editing ? (
        <div className="mt-2">
          <textarea
            value={bodyText}
            onChange={e => setBodyText(e.target.value)}
            disabled={busy !== null}
            rows={4}
            placeholder={bodyLabel}
            className="w-full resize-none rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none disabled:opacity-50"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => runAction('edit', buildContent(entry.entry_type, linesToList(bodyText)))}
              disabled={busy !== null}
              className="rounded-full border border-[color:var(--indigo)] px-3 py-1.5 text-[12.5px] font-bold text-[color:var(--indigo)] transition disabled:opacity-50"
            >
              {busy === 'edit' ? 'Saving…' : isApprover ? 'Save' : 'Submit edit for approval'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={busy !== null}
              className="rounded-full border border-[color:var(--border)] px-3 py-1.5 text-[12.5px] text-[color:var(--ink-3)] transition hover:text-[color:var(--ink)] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {publishedLines.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-[12.5px] text-[color:var(--ink-2)]">
              {publishedLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
          {entry.status === 'draft_pending' && draftLines && draftLines.length > 0 && (
            <div className="mt-2 rounded-lg border border-dashed border-[color:var(--border-2)] p-2">
              <p className="text-[10.5px] font-bold uppercase tracking-[.06em] text-[color:var(--ink-3)]">
                Pending draft
              </p>
              <ul className="mt-1 list-disc pl-4 text-[12.5px] text-[color:var(--ink-2)]">
                {draftLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {error && (
        <p
          className="mt-2 rounded-lg border px-3 py-2 text-[12.5px]"
          style={{ color: 'var(--rose-fg)', background: 'var(--rose-bg)', borderColor: 'var(--rose-line)' }}
        >
          {error}
        </p>
      )}

      {!editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={busy !== null}
            className="rounded-full border border-[color:var(--border)] px-3 py-1.5 text-[12.5px] text-[color:var(--ink-2)] transition hover:text-[color:var(--ink)] disabled:opacity-50"
          >
            Edit
          </button>
          {isApprover && entry.status === 'draft_pending' && (
            <>
              <button
                type="button"
                onClick={() => runAction('approve')}
                disabled={busy !== null}
                className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[12.5px] font-bold text-emerald-400 transition hover:bg-emerald-400/20 disabled:opacity-50"
              >
                {busy === 'approve' ? 'Saving…' : 'Approve'}
              </button>
              <button
                type="button"
                onClick={() => runAction('reject')}
                disabled={busy !== null}
                className="rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 text-[12.5px] font-bold text-rose-400 transition hover:bg-rose-400/20 disabled:opacity-50"
              >
                {busy === 'reject' ? '…' : 'Reject'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── EntryEditor — the room page's mounted authoring surface ──────────────

export function EntryEditor({
  roomKey,
  isApprover,
  initialEntries,
}: {
  roomKey: string
  isApprover: boolean
  initialEntries: PlaybookEntryRow[]
}) {
  const [entries, setEntries] = useState<PlaybookEntryRow[]>(initialEntries)

  const upsertEntry = (entry: PlaybookEntryRow) => {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.id === entry.id)
      if (idx === -1) return [entry, ...prev]
      const next = [...prev]
      next[idx] = entry
      return next
    })
  }

  const published = useMemo(() => entries.filter(e => e.status === 'published'), [entries])
  const pending = useMemo(() => entries.filter(e => e.status === 'draft_pending'), [entries])

  return (
    <div className="flex flex-col gap-4">
      <NewEntryForm roomKey={roomKey} isApprover={isApprover} onCreated={upsertEntry} />

      {pending.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-medium text-[color:var(--ink)]">
            Pending approval ({pending.length})
          </h3>
          <div className="flex flex-col gap-2">
            {pending.map(entry => (
              <EntryCard key={entry.id} entry={entry} isApprover={isApprover} onUpdated={upsertEntry} />
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-[13px] font-medium text-[color:var(--ink)]">Published ({published.length})</h3>
        {published.length === 0 ? (
          <p className="text-[12.5px] text-[color:var(--ink-3)]">No published entries yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {published.map(entry => (
              <EntryCard key={entry.id} entry={entry} isApprover={isApprover} onUpdated={upsertEntry} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
