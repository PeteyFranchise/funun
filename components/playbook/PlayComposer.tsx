'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { HealthValue } from '@/lib/client-partners/columns'
import type { PipelineStage } from '@/lib/client-partners/stages'

// ─── PlayComposer (D-31.2-08/09/10/11, leadership-only) ────────────────────
// Mirrors GamePlanPanel's "container of items" shape (components/admin/
// GamePlanPanel.tsx) for the team-wide one-active Play instead of a
// per-account Game Plan: leadership adds client_targeted (health-band or
// pipeline-stage segment) or general_task (posting-deferred directive)
// assignments, reorders them, then Publish (POST /api/admin/plays, plan 06)
// retires the prior active play and activates this one. Also shows the
// leadership "who's acted" rollup for the currently active play (GET
// /api/admin/plays/[id]/completions, this plan's Task 1) — the coaching
// loop's measurement half.
//
// Data + string-action props only (Pitfall 1, T-31.1-rsc-func-prop) — the
// RSC caller (this plan's Task 1 mounting page) passes the active play as
// plain data; this component builds its own fetch paths client-side, same
// convention as GamePlanPanel/ContactsPanel.

type AssignmentKind = 'client_targeted' | 'general_task'

const HEALTH_BAND_OPTIONS: { value: HealthValue; label: string }[] = [
  { value: 'at_risk', label: 'At risk' },
  { value: 'cold', label: 'Cold' },
  { value: 'warning', label: 'Warning' },
  { value: 'good', label: 'Good' },
  { value: 'prospect', label: 'Prospect' },
]

type AssignmentDraft = {
  localId: string
  kind: AssignmentKind
  title: string
  note: string
  healthBand: string
  pipelineStageKey: string
  linkUrl: string
  attachmentUrl: string
  content: string
}

let draftSeq = 0
function nextLocalId(): string {
  draftSeq += 1
  return `draft-${Date.now()}-${draftSeq}`
}

function emptyDraft(kind: AssignmentKind): AssignmentDraft {
  return {
    localId: nextLocalId(),
    kind,
    title: '',
    note: '',
    healthBand: '',
    pipelineStageKey: '',
    linkUrl: '',
    attachmentUrl: '',
    content: '',
  }
}

export type CurrentActivePlay = {
  id: string
  title: string
  note: string | null
  publishedAt: string | null
  assignments: { id: string; kind: AssignmentKind; title: string }[]
}

type CompletionRollupRow = {
  assignmentId: string
  title: string
  kind: AssignmentKind
  completedCount: number
  completedBy: { aeUserId: string; aeName: string; completedAt: string }[]
}

export function PlayComposer({ currentActive }: { currentActive: CurrentActivePlay | null }) {
  const router = useRouter()

  // ─── "Who's acted" rollup for the current active play ──────────────────
  const [rollup, setRollup] = useState<CompletionRollupRow[] | null>(null)
  const [rollupError, setRollupError] = useState<string | null>(null)

  useEffect(() => {
    if (!currentActive) {
      setRollup(null)
      setRollupError(null)
      return
    }
    let cancelled = false
    fetch(`/api/admin/plays/${currentActive.id}/completions`)
      .then(res => res.json().then(json => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (cancelled) return
        if (!ok) {
          setRollupError((json as { error?: string }).error ?? "Couldn't load who's acted.")
          return
        }
        setRollup((json as { data: { assignments: CompletionRollupRow[] } }).data.assignments)
      })
      .catch(() => {
        if (!cancelled) setRollupError("Couldn't load who's acted.")
      })
    return () => {
      cancelled = true
    }
  }, [currentActive])

  // ─── Pipeline stages for the client_targeted targeting select ──────────
  const [stages, setStages] = useState<PipelineStage[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/pipeline-stages')
      .then(res => (res.ok ? res.json() : { data: [] }))
      .then(json => {
        if (cancelled) return
        const rows =
          (json as { data?: { id: string; key: string; label: string; sort_order: number; is_terminal: boolean }[] }).data ?? []
        setStages(rows.map(r => ({ id: r.id, key: r.key, label: r.label, sortOrder: r.sort_order, isTerminal: r.is_terminal })))
      })
      .catch(() => {
        // The stage picker degrades to an empty select — health-band
        // targeting alone still works, and general_task never needs stages.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ─── Compose form state ─────────────────────────────────────────────────
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [assignments, setAssignments] = useState<AssignmentDraft[]>([])
  const [draft, setDraft] = useState<AssignmentDraft>(() => emptyDraft('client_targeted'))
  const [draftError, setDraftError] = useState<string | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState<string | null>(null)

  const canAddDraft = useMemo(() => {
    if (!draft.title.trim()) return false
    if (draft.kind === 'client_targeted') return Boolean(draft.healthBand || draft.pipelineStageKey)
    return true
  }, [draft])

  function addAssignment() {
    if (!draft.title.trim()) {
      setDraftError('Title is required.')
      return
    }
    if (draft.kind === 'client_targeted' && !draft.healthBand && !draft.pipelineStageKey) {
      setDraftError('A client-targeted assignment needs a health band or a pipeline stage.')
      return
    }
    setDraftError(null)
    setAssignments(prev => [...prev, draft])
    setDraft(emptyDraft(draft.kind))
  }

  function removeAssignment(localId: string) {
    setAssignments(prev => prev.filter(a => a.localId !== localId))
  }

  function moveAssignment(localId: string, direction: -1 | 1) {
    setAssignments(prev => {
      const index = prev.findIndex(a => a.localId === localId)
      if (index === -1) return prev
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  async function handlePublish() {
    if (!title.trim()) {
      setPublishError('Give the play a title.')
      return
    }
    if (assignments.length === 0) {
      setPublishError('Add at least one assignment before publishing.')
      return
    }
    setPublishing(true)
    setPublishError(null)
    setPublished(null)
    try {
      const res = await fetch('/api/admin/plays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          note: note.trim() || undefined,
          assignments: assignments.map(a => ({
            kind: a.kind,
            title: a.title.trim(),
            note: a.note.trim() || undefined,
            healthBand: a.kind === 'client_targeted' ? a.healthBand || null : null,
            pipelineStageKey: a.kind === 'client_targeted' ? a.pipelineStageKey || null : null,
            linkUrl: a.kind === 'general_task' ? a.linkUrl.trim() || null : null,
            attachmentUrl: a.kind === 'general_task' ? a.attachmentUrl.trim() || null : null,
            content: a.kind === 'general_task' ? a.content.trim() || undefined : undefined,
          })),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Failed to publish the play.')
      setPublished(`Published "${title.trim()}" with ${assignments.length} assignment${assignments.length === 1 ? '' : 's'}.`)
      setTitle('')
      setNote('')
      setAssignments([])
      router.refresh()
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Failed to publish the play.')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {currentActive && (
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-medium text-[color:var(--ink)]">Active play — {currentActive.title}</h3>
              <p className="mt-0.5 text-[12px] text-[color:var(--ink-3)]">
                {currentActive.assignments.length} assignment{currentActive.assignments.length === 1 ? '' : 's'} · who&apos;s
                acted below
              </p>
            </div>
          </div>

          {rollupError && (
            <p className="mt-3 text-[12.5px]" style={{ color: 'var(--rose-fg)' }}>
              {rollupError}
            </p>
          )}

          {!rollupError && rollup && (
            <div className="mt-3 flex flex-col gap-2">
              {rollup.map(row => (
                <div
                  key={row.assignmentId}
                  className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-medium text-[color:var(--ink)]">{row.title}</span>
                    <span className="shrink-0 rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[10.5px] text-[color:var(--ink-3)]">
                      {row.completedCount} acted
                    </span>
                  </div>
                  {row.completedBy.length > 0 && (
                    <p className="mt-1 text-[11.5px] text-[color:var(--ink-3)]">{row.completedBy.map(c => c.aeName).join(', ')}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
        <h3 className="text-[14px] font-medium text-[color:var(--ink)]">Compose a new play</h3>
        <p className="mt-0.5 text-[12px] text-[color:var(--ink-3)]">
          Publishing retires the current active play and starts this one.
        </p>

        {publishError && (
          <p
            className="mt-3 rounded-lg border px-3 py-2 text-[12.5px]"
            style={{ color: 'var(--rose-fg)', background: 'var(--rose-bg)', borderColor: 'var(--rose-line)' }}
          >
            {publishError}
          </p>
        )}
        {published && (
          <p
            className="mt-3 rounded-lg border px-3 py-2 text-[12.5px]"
            style={{ color: 'var(--green-fg)', background: 'var(--green-bg)', borderColor: 'var(--green-line)' }}
          >
            {published}
          </p>
        )}

        <div className="mt-3 grid gap-2">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Play title"
            className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
          />
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
          />
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {assignments.length === 0 && (
            <p className="text-[12.5px] text-[color:var(--ink-3)]">No assignments yet — add one below.</p>
          )}
          {assignments.map((a, index) => (
            <div key={a.localId} className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[12.5px] font-medium text-[color:var(--ink)]">{a.title}</span>
                  <span className="ml-2 rounded-full bg-[color:var(--panel)] px-2 py-0.5 text-[10px] text-[color:var(--indigo)]">
                    {a.kind === 'client_targeted' ? 'Client-targeted' : 'General'}
                  </span>
                  {a.kind === 'client_targeted' && (
                    <p className="mt-1 text-[11px] text-[color:var(--ink-3)]">
                      {[a.healthBand && `Health: ${a.healthBand}`, a.pipelineStageKey && `Stage: ${a.pipelineStageKey}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => moveAssignment(a.localId, -1)}
                    disabled={index === 0}
                    aria-label="Move assignment up"
                    className="text-[12px] text-[color:var(--ink-3)] disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveAssignment(a.localId, 1)}
                    disabled={index === assignments.length - 1}
                    aria-label="Move assignment down"
                    className="text-[12px] text-[color:var(--ink-3)] disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAssignment(a.localId)}
                    aria-label="Remove assignment"
                    className="text-[16px] leading-none text-[color:var(--ink-3)] hover:text-[color:var(--rose-fg)]"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-lg border border-dashed border-[color:var(--border-2)] p-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDraft(emptyDraft('client_targeted'))}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${
                draft.kind === 'client_targeted' ? 'bg-[color:var(--panel-2)] text-[color:var(--ink)]' : 'text-[color:var(--ink-3)]'
              }`}
            >
              Client-targeted
            </button>
            <button
              type="button"
              onClick={() => setDraft(emptyDraft('general_task'))}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${
                draft.kind === 'general_task' ? 'bg-[color:var(--panel-2)] text-[color:var(--ink)]' : 'text-[color:var(--ink-3)]'
              }`}
            >
              General directive
            </button>
          </div>

          {draftError && (
            <p className="mt-2 text-[11.5px]" style={{ color: 'var(--rose-fg)' }}>
              {draftError}
            </p>
          )}

          <div className="mt-2 grid gap-2">
            <input
              value={draft.title}
              onChange={e => setDraft(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Assignment title"
              className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
            />
            <input
              value={draft.note}
              onChange={e => setDraft(prev => ({ ...prev, note: e.target.value }))}
              placeholder="Note (optional)"
              className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
            />

            {draft.kind === 'client_targeted' ? (
              <div className="flex gap-2">
                <select
                  value={draft.healthBand}
                  onChange={e => setDraft(prev => ({ ...prev, healthBand: e.target.value }))}
                  className="flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 text-[13px] text-[color:var(--ink)] focus:border-[color:var(--indigo)] focus:outline-none"
                >
                  <option value="">Health band (any)</option>
                  {HEALTH_BAND_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  value={draft.pipelineStageKey}
                  onChange={e => setDraft(prev => ({ ...prev, pipelineStageKey: e.target.value }))}
                  className="flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 text-[13px] text-[color:var(--ink)] focus:border-[color:var(--indigo)] focus:outline-none"
                >
                  <option value="">Pipeline stage (any)</option>
                  {stages.map(s => (
                    <option key={s.id} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <input
                  value={draft.linkUrl}
                  onChange={e => setDraft(prev => ({ ...prev, linkUrl: e.target.value }))}
                  placeholder="Link (optional)"
                  className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
                />
                <input
                  value={draft.attachmentUrl}
                  onChange={e => setDraft(prev => ({ ...prev, attachmentUrl: e.target.value }))}
                  placeholder="Attachment URL (optional)"
                  className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
                />
                <textarea
                  value={draft.content}
                  onChange={e => setDraft(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Directive content — what should the AE post/say? (posting itself is a later fast-follow)"
                  rows={2}
                  className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
                />
              </>
            )}
          </div>

          <button
            type="button"
            onClick={addAssignment}
            disabled={!canAddDraft}
            className="mt-2 rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-[12px] text-[color:var(--ink-2)] transition hover:text-[color:var(--ink)] disabled:opacity-50"
          >
            + Add assignment
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3 border-t border-[color:var(--border)] pt-3">
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing}
            className="rounded-lg bg-[image:var(--grad)] px-4 py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {publishing ? 'Publishing…' : 'Publish play'}
          </button>
          <span className="text-[11px] text-[color:var(--ink-3)]">Retires the current active play (if any) and activates this one.</span>
        </div>
      </div>
    </div>
  )
}
