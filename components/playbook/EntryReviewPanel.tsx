'use client'

import { useMemo, useState } from 'react'
import type { PlaybookEntryRow } from '@/lib/playbook/entries'
import { canResubmitReview, reviewAnchors, type PlaybookReviewRound, type PlaybookReviewThread } from '@/lib/playbook/reviews'
import type { PlaybookStaffOption } from '@/components/playbook/EntryMetadataPanel'
import { readDocumentBody } from '@/lib/playbook/content'
import { MarkdownRevisionDiff } from '@/components/playbook/MarkdownRevisionDiff'

type ReviewResponse = {
  available?: boolean
  viewer?: { id: string; isApprover: boolean; isAuthor: boolean }
  people?: Record<string, string>
  rounds?: PlaybookReviewRound[]
  data?: PlaybookReviewThread[]
  error?: string
}

function listContent(entryType: PlaybookEntryRow['entry_type'], content: Record<string, unknown>): string[] {
  if (entryType === 'document') return []
  const raw = content[entryType === 'sop' ? 'items' : 'questions']
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string') : []
}

function SnapshotComparison({ entryType, snapshot, current, leftLabel = 'Reviewed snapshot', rightLabel = 'Current draft' }: {
  entryType: PlaybookEntryRow['entry_type']
  snapshot: Record<string, unknown>
  current: Record<string, unknown>
  leftLabel?: string
  rightLabel?: string
}) {
  if (entryType === 'document') {
    return (
      <MarkdownRevisionDiff
        published={readDocumentBody(snapshot) ?? ''}
        proposed={readDocumentBody(current) ?? ''}
        leftLabel={leftLabel}
        rightLabel={rightLabel}
        summaryLabel="Exact version comparison"
      />
    )
  }
  const before = listContent(entryType, snapshot)
  const after = listContent(entryType, current)
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg border border-[color:var(--border)] p-2">
        <p className="text-[9.5px] font-bold uppercase tracking-[.08em] text-[color:var(--ink-3)]">{leftLabel}</p>
        <ol className="mt-1 list-decimal pl-4 text-[11px] text-[color:var(--ink-2)]">{before.map((line, index) => <li key={index}>{line}</li>)}</ol>
      </div>
      <div className="rounded-lg border border-[color:var(--border)] p-2">
        <p className="text-[9.5px] font-bold uppercase tracking-[.08em] text-[color:var(--ink-3)]">{rightLabel}</p>
        <ol className="mt-1 list-decimal pl-4 text-[11px] text-[color:var(--ink-2)]">{after.map((line, index) => <li key={index}>{line}</li>)}</ol>
      </div>
    </div>
  )
}

function revisionLabel(thread: PlaybookReviewThread): string {
  return thread.target_kind === 'draft'
    ? `Revision ${thread.target_revision_number} · draft v${thread.target_draft_version}`
    : `Published revision ${thread.target_revision_number}`
}

export function EntryReviewPanel({
  entry,
  roomKey,
  isApprover,
  staff,
}: {
  entry: PlaybookEntryRow
  roomKey: string
  isApprover: boolean
  staff: PlaybookStaffOption[]
}) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [threads, setThreads] = useState<PlaybookReviewThread[]>([])
  const [rounds, setRounds] = useState<PlaybookReviewRound[]>([])
  const [viewerIsAuthor, setViewerIsAuthor] = useState(false)
  const [people, setPeople] = useState<Record<string, string>>({})
  const [available, setAvailable] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedbackKind, setFeedbackKind] = useState<'suggestion' | 'requested_change'>('suggestion')
  const [anchorPosition, setAnchorPosition] = useState(0)
  const [body, setBody] = useState('')
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([])
  const [replyByThread, setReplyByThread] = useState<Record<string, string>>({})
  const [replyMentionByThread, setReplyMentionByThread] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [comparingThreadId, setComparingThreadId] = useState<string | null>(null)
  const [comparingRoundId, setComparingRoundId] = useState<string | null>(null)

  const targetKind = entry.draft_content ? 'draft' : 'published'
  const targetContent = entry.draft_content ?? entry.content
  const anchors = useMemo(() => reviewAnchors(entry.entry_type, targetContent), [entry.entry_type, targetContent])
  const openRequested = threads.filter(thread => thread.status === 'open' && thread.feedback_kind === 'requested_change').length

  async function loadThreads() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/playbook/entries/${entry.id}/reviews?roomKey=${encodeURIComponent(roomKey)}`)
      const json = await response.json().catch(() => ({})) as ReviewResponse
      if (response.status === 503 && json.available === false) {
        setAvailable(false)
        setError(json.error ?? 'Review notes are not available yet.')
        return
      }
      if (!response.ok) throw new Error(json.error ?? 'Could not load review notes.')
      setThreads(json.data ?? [])
      setRounds(json.rounds ?? [])
      setViewerIsAuthor(json.viewer?.isAuthor === true)
      setPeople(json.people ?? {})
      setAvailable(json.available !== false)
      setLoaded(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load review notes.')
    } finally {
      setLoading(false)
    }
  }

  async function toggleOpen() {
    const next = !open
    setOpen(next)
    if (next && !loaded && !loading) await loadThreads()
  }

  async function createThread() {
    const anchor = anchors[anchorPosition]
    if (!anchor || !body.trim()) return
    setBusy('create')
    setError(null)
    try {
      const response = await fetch(`/api/admin/playbook/entries/${entry.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomKey,
          targetKind,
          expectedRevision: entry.revision_number ?? 1,
          expectedDraftVersion: targetKind === 'draft' ? entry.draft_version ?? 1 : null,
          anchorKind: anchor.kind,
          anchorIndex: anchor.index,
          anchorLabel: anchor.label,
          feedbackKind,
          body,
          mentionedUserIds,
        }),
      })
      const json = await response.json().catch(() => ({})) as ReviewResponse
      if (!response.ok) throw new Error(json.error ?? 'Could not save this review note.')
      setBody('')
      setMentionedUserIds([])
      await loadThreads()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this review note.')
    } finally {
      setBusy(null)
    }
  }

  async function reply(threadId: string) {
    const replyBody = replyByThread[threadId]?.trim()
    if (!replyBody) return
    setBusy(`reply:${threadId}`)
    setError(null)
    try {
      const response = await fetch(`/api/admin/playbook/reviews/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomKey,
          body: replyBody,
          mentionedUserIds: replyMentionByThread[threadId] ? [replyMentionByThread[threadId]] : [],
        }),
      })
      const json = await response.json().catch(() => ({})) as ReviewResponse
      if (!response.ok) throw new Error(json.error ?? 'Could not post this reply.')
      setReplyByThread(current => ({ ...current, [threadId]: '' }))
      setReplyMentionByThread(current => ({ ...current, [threadId]: '' }))
      await loadThreads()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not post this reply.')
    } finally {
      setBusy(null)
    }
  }

  async function transition(thread: PlaybookReviewThread, status: PlaybookReviewThread['status']) {
    setBusy(`status:${thread.id}`)
    setError(null)
    try {
      const response = await fetch(`/api/admin/playbook/reviews/${thread.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomKey, expectedStatus: thread.status, status }),
      })
      const json = await response.json().catch(() => ({})) as ReviewResponse
      if (!response.ok) throw new Error(json.error ?? 'Could not update this discussion.')
      await loadThreads()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this discussion.')
    } finally {
      setBusy(null)
    }
  }

  async function resubmit(round: PlaybookReviewRound) {
    setBusy(`resubmit:${round.id}`)
    setError(null)
    try {
      const response = await fetch(`/api/admin/playbook/entries/${entry.id}/reviews/resubmit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomKey, previousRoundId: round.id, expectedDraftVersion: entry.draft_version ?? 0 }),
      })
      const json = await response.json().catch(() => ({})) as ReviewResponse
      if (!response.ok) throw new Error(json.error ?? 'Could not resubmit this draft.')
      await loadThreads()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not resubmit this draft.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
      <button type="button" onClick={toggleOpen} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left">
        <span className="text-[12px] font-bold text-[color:var(--ink-2)]">
          Review notes{loaded && threads.length ? ` · ${threads.length}` : ''}
          {openRequested > 0 && <span className="ml-2 text-amber-400">{openRequested} requested</span>}
        </span>
        <span className="text-[11px] text-[color:var(--ink-3)]">{open ? 'Close' : 'Open'}</span>
      </button>
      {open && (
        <div className="border-t border-[color:var(--border)] p-3">
          {loading && <p className="text-[12px] text-[color:var(--ink-3)]">Loading discussions…</p>}
          {error && <p className="mb-3 rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-[12px] text-rose-300">{error}</p>}
          {available && isApprover && (
            <div className="rounded-lg border border-dashed border-[color:var(--border-2)] p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <select value={feedbackKind} onChange={event => setFeedbackKind(event.target.value as typeof feedbackKind)} className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] text-[color:var(--ink)]">
                  <option value="suggestion">Suggestion · optional</option>
                  <option value="requested_change">Requested change</option>
                </select>
                <select value={anchorPosition} onChange={event => setAnchorPosition(Number(event.target.value))} className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] text-[color:var(--ink)]">
                  {anchors.map((anchor, index) => <option key={`${anchor.kind}:${anchor.index}`} value={index}>{anchor.kind === 'overall' ? 'Overall entry' : anchor.label}</option>)}
                </select>
              </div>
              <textarea value={body} onChange={event => setBody(event.target.value)} rows={3} maxLength={4000} placeholder={feedbackKind === 'requested_change' ? 'Describe exactly what needs to change…' : 'Leave an optional suggestion…'} className="mt-2 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] text-[color:var(--ink)]" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[.08em] text-[color:var(--ink-3)]">Tag</span>
                {staff.map(person => (
                  <label key={person.userId} className="flex items-center gap-1 rounded-full border border-[color:var(--border)] px-2 py-1 text-[10.5px] text-[color:var(--ink-3)]">
                    <input type="checkbox" checked={mentionedUserIds.includes(person.userId)} onChange={event => setMentionedUserIds(current => event.target.checked ? [...current, person.userId] : current.filter(id => id !== person.userId))} />
                    @{person.label}
                  </label>
                ))}
                <button type="button" onClick={createThread} disabled={busy !== null || !body.trim()} className="ml-auto rounded-full px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50" style={{ background: 'var(--grad)' }}>
                  {busy === 'create' ? 'Saving…' : feedbackKind === 'requested_change' ? 'Request changes' : 'Add suggestion'}
                </button>
              </div>
              <p className="mt-2 text-[10.5px] text-[color:var(--ink-3)]">Attached to {targetKind === 'draft' ? `revision ${entry.revision_number ?? 1}, draft v${entry.draft_version ?? 1}` : `published revision ${entry.revision_number ?? 1}`}.</p>
            </div>
          )}

          {loaded && threads.length === 0 && <p className="py-4 text-center text-[12px] text-[color:var(--ink-3)]">No review discussions yet.</p>}
          {viewerIsAuthor && entry.draft_content && rounds.filter(round =>
            round.status === 'changes_requested'
            || (round.status === 'ready_for_rereview' && (entry.draft_version ?? 0) > (round.target_draft_version ?? 0))
          ).map(round => {
            const requestedStatuses = threads
              .filter(thread => thread.review_round_id === round.id && thread.feedback_kind === 'requested_change')
              .map(thread => thread.status)
            const ready = canResubmitReview({
              currentDraftVersion: entry.draft_version ?? 0,
              previousDraftVersion: round.target_draft_version,
              requestedThreadStatuses: requestedStatuses,
            })
            return (
              <div key={round.id} className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
                <p className="text-[11px] font-bold text-amber-300">{round.status === 'changes_requested' ? `Changes requested on draft v${round.target_draft_version}` : `Draft changed after v${round.target_draft_version} was submitted`}</p>
                <p className="mt-1 text-[10.5px] text-[color:var(--ink-3)]">{round.status === 'changes_requested' ? 'Save a newer draft, mark each requested change addressed, then return it for review.' : 'Resubmit the latest saved draft so reviewers receive an exact new snapshot.'}</p>
                <button type="button" onClick={() => resubmit(round)} disabled={!ready || busy !== null} className="mt-2 rounded-full border border-amber-400/30 px-3 py-1.5 text-[11px] font-bold text-amber-300 disabled:opacity-40">
                  {busy === `resubmit:${round.id}` ? 'Resubmitting…' : ready ? 'Resubmit for review' : 'Not ready to resubmit'}
                </button>
              </div>
            )
          })}
          {rounds.some(round => round.status === 'ready_for_rereview') && (
            <p className="mt-3 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-[11px] font-bold text-emerald-300">A revised draft is ready for re-review.</p>
          )}
          {rounds.length > 0 && (
            <div className="mt-3 rounded-lg border border-[color:var(--border)] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[.08em] text-[color:var(--ink-3)]">Review round history</p>
              <div className="mt-2 space-y-2">
                {rounds.map(round => {
                  const previous = round.previous_round_id ? rounds.find(candidate => candidate.id === round.previous_round_id) : null
                  return (
                    <div key={round.id} className="rounded-lg bg-[color:var(--panel-2)] px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
                        <span className="font-bold text-[color:var(--ink-2)]">{round.target_kind === 'draft' ? `Draft v${round.target_draft_version}` : `Revision ${round.target_revision_number}`}</span>
                        <span className="text-[color:var(--ink-3)]">{round.status.replaceAll('_', ' ')}</span>
                        <span className="text-[color:var(--ink-3)]">{new Date(round.created_at).toLocaleString()}</span>
                        <button type="button" onClick={() => setComparingRoundId(current => current === round.id ? null : round.id)} className="ml-auto font-bold text-[color:var(--indigo)]">
                          {comparingRoundId === round.id ? 'Hide comparison' : previous ? 'Compare with prior round' : 'Compare with current'}
                        </button>
                      </div>
                      {round.decision_summary && <p className="mt-2 rounded-lg border border-[color:var(--border)] px-3 py-2 text-[11px] text-[color:var(--ink-2)]"><span className="font-bold">Decision summary:</span> {round.decision_summary}</p>}
                      {comparingRoundId === round.id && (
                        <SnapshotComparison
                          entryType={entry.entry_type}
                          snapshot={previous?.content_snapshot ?? round.content_snapshot}
                          current={previous ? round.content_snapshot : targetContent}
                          leftLabel={previous ? `Draft v${previous.target_draft_version}` : 'Reviewed snapshot'}
                          rightLabel={previous ? `Draft v${round.target_draft_version}` : 'Current draft'}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <div className="mt-3 space-y-2">
            {threads.map(thread => {
              const stale = thread.target_revision_number !== (entry.revision_number ?? 1) || (thread.target_kind === 'draft' && thread.target_draft_version !== (entry.draft_version ?? 0))
              return (
                <article key={thread.id} className={`rounded-lg border p-3 ${thread.status === 'resolved' ? 'border-[color:var(--border)] opacity-70' : thread.feedback_kind === 'requested_change' ? 'border-amber-400/30 bg-amber-400/5' : 'border-[color:var(--border)]'}`}>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[.07em]">
                    <span className={thread.feedback_kind === 'requested_change' ? 'text-amber-400' : 'text-[color:var(--indigo)]'}>{thread.feedback_kind === 'requested_change' ? 'Requested change' : 'Suggestion'}</span>
                    <span className="text-[color:var(--ink-3)]">{thread.anchor_kind === 'overall' ? 'Overall' : thread.anchor_label}</span>
                    <span className="text-[color:var(--ink-3)]">{revisionLabel(thread)}{stale ? ' · earlier version' : ''}</span>
                    <span className="ml-auto text-[color:var(--ink-3)]">{thread.status}</span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {thread.messages.map(message => (
                      <div key={message.id} className="rounded-lg bg-[color:var(--panel-2)] px-3 py-2">
                        <p className="text-[10.5px] font-bold text-[color:var(--ink-3)]">{people[message.created_by] ?? 'Team Member'} · {new Date(message.created_at).toLocaleString()}</p>
                        <p className="mt-1 whitespace-pre-wrap text-[12px] text-[color:var(--ink-2)]">{message.body}</p>
                        {message.mentions.length > 0 && <p className="mt-1 text-[10px] text-[color:var(--indigo)]">{message.mentions.map(id => `@${people[id] ?? 'Team Member'}`).join(' ')}</p>}
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => setComparingThreadId(current => current === thread.id ? null : thread.id)} className="mt-2 text-[10.5px] font-bold text-[color:var(--indigo)]">
                    {comparingThreadId === thread.id ? 'Hide version comparison' : 'Compare reviewed version'}
                  </button>
                  {comparingThreadId === thread.id && <SnapshotComparison entryType={entry.entry_type} snapshot={thread.content_snapshot} current={targetContent} />}
                  {thread.status === 'open' && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
                      <input value={replyByThread[thread.id] ?? ''} onChange={event => setReplyByThread(current => ({ ...current, [thread.id]: event.target.value }))} placeholder="Reply to this discussion…" className="min-w-0 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-1.5 text-[11px] text-[color:var(--ink)]" />
                      <select value={replyMentionByThread[thread.id] ?? ''} onChange={event => setReplyMentionByThread(current => ({ ...current, [thread.id]: event.target.value }))} aria-label="Tag a Team Member in this reply" className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-2 py-1.5 text-[11px] text-[color:var(--ink-3)]">
                        <option value="">No tag</option>
                        {staff.map(person => <option key={person.userId} value={person.userId}>@{person.label}</option>)}
                      </select>
                      <button type="button" onClick={() => reply(thread.id)} disabled={busy !== null || !replyByThread[thread.id]?.trim()} className="rounded-full border border-[color:var(--border)] px-3 py-1.5 text-[11px] font-bold text-[color:var(--ink-2)] disabled:opacity-50">Reply</button>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3">
                    {viewerIsAuthor && thread.feedback_kind === 'requested_change' && thread.status === 'open' && (
                      <button type="button" onClick={() => transition(thread, 'addressed')} disabled={busy !== null} className="text-[10.5px] font-bold text-emerald-300">Mark addressed</button>
                    )}
                    {isApprover && thread.status !== 'resolved' && (
                      <button type="button" onClick={() => transition(thread, 'resolved')} disabled={busy !== null} className="text-[10.5px] font-bold text-[color:var(--indigo)]">Resolve discussion</button>
                    )}
                    {isApprover && thread.status !== 'open' && (
                      <button type="button" onClick={() => transition(thread, 'open')} disabled={busy !== null} className="text-[10.5px] font-bold text-[color:var(--indigo)]">Reopen discussion</button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
