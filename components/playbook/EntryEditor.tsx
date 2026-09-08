'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { EntryStatus, EntryType, PlaybookEntryRow } from '@/lib/playbook/entries'
import { documentContent, readDocumentBody } from '@/lib/playbook/content'
import { MarkdownBody } from '@/components/playbook/MarkdownDoc'
import { MarkdownRevisionDiff } from '@/components/playbook/MarkdownRevisionDiff'
import { DoctrineAdoptionForm } from '@/components/playbook/DoctrineAdoptionForm'
import { AuthoringPreflightPanel } from '@/components/playbook/AuthoringPreflightPanel'
import { DraftRecoveryNotice } from '@/components/playbook/DraftRecoveryNotice'
import { usePlaybookDraftRecovery } from '@/components/playbook/usePlaybookDraftRecovery'
import { playbookRecoveryKey } from '@/lib/playbook/draft-recovery'
import { EntryReviewPanel } from '@/components/playbook/EntryReviewPanel'
import {
  EntryMetadataPanel,
  type PlaybookGamePlanOption,
  type PlaybookStaffOption,
} from '@/components/playbook/EntryMetadataPanel'
import {
  PLAYBOOK_AUTHORING_TEMPLATES,
  findPlaybookAuthoringTemplate,
  type PlaybookAuthoringTemplate,
} from '@/lib/playbook/authoring-templates'
import { playbookVideoSnippet } from '@/lib/playbook/media'

// ─── EntryEditor (31.2-08 Task 1, R9/D-31.2-05/06) ─────────────────────────
// The Playbook's SOP/Topic authoring UI — mirrors app/(admin)/tips/page.tsx's
// TipsAdmin draft→approve affordances (pending card, editable body, approve/
// reject buttons), generalized to the three entry types the room page needs:
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
const DOCUMENT_SNIPPETS = [
  { label: 'Heading', value: '## Section title\n\n' },
  { label: 'Bullets', value: '- First point\n- Second point\n\n' },
  { label: 'Link', value: '[Link label](https://example.com)' },
  { label: 'Note', value: '> [!NOTE]\n> Add the note here.\n\n' },
  { label: 'Warning', value: '> [!WARNING]\n> Add the warning here.\n\n' },
  { label: 'Table', value: '| Column | Column |\n| --- | --- |\n| Value | Value |\n\n' },
  { label: 'Diagram', value: '```mermaid\nflowchart LR\n  A[Start] --> B[Next step]\n```\n\n' },
  { label: 'Video', value: playbookVideoSnippet() },
] as const

type PlaybookSubgroupOption = { id: string; key: string; label: string; sort_order: number }

function entryPatchPath(id: string): string {
  return `${ENTRIES_PATH}/${id}`
}

function linesToList(raw: string): string[] {
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
}

function contentText(entryType: EntryType, content: Record<string, unknown>): string {
  if (entryType === 'document') return readDocumentBody(content) ?? ''
  const key = entryType === 'sop' ? 'items' : 'questions'
  const raw = content[key]
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string').join('\n') : ''
}

function searchableEntryText(entry: PlaybookEntryRow): string {
  return contentText(entry.entry_type, entry.draft_content ?? entry.content)
}

function buildContent(entryType: EntryType, raw: string): Record<string, unknown> {
  if (entryType === 'document') return documentContent(raw)
  const lines = linesToList(raw)
  return entryType === 'sop' ? { items: lines } : { questions: lines }
}

function bodyLabel(entryType: EntryType): string {
  if (entryType === 'sop') return 'Checklist items (one per line)'
  if (entryType === 'topic') return 'Questions (one per line)'
  return 'Markdown document'
}

function useUnsavedChanges(active: boolean) {
  useEffect(() => {
    if (!active) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [active])
}

function DocumentTools({ onInsert }: { onInsert: (value: string) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Document formatting helpers">
      {DOCUMENT_SNIPPETS.map(snippet => (
        <button
          key={snippet.label}
          type="button"
          onClick={() => onInsert(snippet.value)}
          className="rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
        >
          + {snippet.label}
        </button>
      ))}
    </div>
  )
}

function StatusBadge({ status, hasPendingDraft }: { status: EntryStatus; hasPendingDraft: boolean }) {
  if (hasPendingDraft) {
    return (
      <span className="shrink-0 rounded-full border border-[color:var(--border)] bg-[color:var(--panel-2)] px-2.5 py-0.5 text-[11px] font-bold text-[color:var(--ink-3)]">
        {status === 'published' ? 'Published · pending revision' : 'Pending approval'}
      </span>
    )
  }
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
      {status === 'archived' ? 'Archived' : status === 'superseded' ? 'Superseded' : 'Draft'}
    </span>
  )
}

function AuthoringTemplateChooser({
  onBlank,
  onTemplate,
}: {
  onBlank: () => void
  onTemplate: (template: PlaybookAuthoringTemplate) => void
}) {
  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[color:var(--indigo)]">Native Playbook authoring</p>
          <h3 className="mt-1 text-[15px] font-extrabold text-[color:var(--ink)]">What are you creating?</h3>
          <p className="mt-1 max-w-[70ch] text-[11px] leading-5 text-[color:var(--ink-3)]">Choose a useful outline or begin with an empty entry. Everything stays editable and enters this room’s ordinary draft and review workflow.</p>
        </div>
        <button type="button" onClick={onBlank} className="shrink-0 rounded-lg border border-[color:var(--border)] px-3 py-2 text-[11px] font-bold text-[color:var(--ink-2)] hover:border-[color:var(--indigo)]">Start blank</button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {PLAYBOOK_AUTHORING_TEMPLATES.map(template => (
          <button
            key={template.key}
            type="button"
            onClick={() => onTemplate(template)}
            className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)] p-3 text-left transition hover:border-[color:var(--indigo)] hover:bg-[color:var(--panel)]"
          >
            <span className="text-[12px] font-extrabold text-[color:var(--ink)]">{template.label}</span>
            <span className="mt-1 block text-[10.5px] leading-5 text-[color:var(--ink-3)]">{template.caption}</span>
            <span className="mt-2 block text-[9.5px] font-bold uppercase tracking-[.1em] text-[color:var(--indigo)]">{template.entryType === 'topic' ? 'Gameplan prompts' : template.entryType === 'sop' ? 'Checklist' : 'Rich document'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── New entry form ─────────────────────────────────────────────────────

function NewEntryForm({
  viewerId,
  roomKey,
  roomLabel,
  isApprover,
  subgroups,
  onCreated,
}: {
  viewerId: string
  roomKey: string
  roomLabel: string
  isApprover: boolean
  subgroups: PlaybookSubgroupOption[]
  onCreated: (entry: PlaybookEntryRow) => void
}) {
  const router = useRouter()
  const [authoringStarted, setAuthoringStarted] = useState(false)
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(null)
  const [entryType, setEntryType] = useState<EntryType>('sop')
  const [title, setTitle] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [subGroupId, setSubGroupId] = useState('')
  const [saving, setSaving] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentBodyLabel = bodyLabel(entryType)
  const selectedTemplate = selectedTemplateKey ? findPlaybookAuthoringTemplate(selectedTemplateKey) : null
  const hasWork = Boolean(title.trim() || bodyText.trim() || subGroupId)
  useUnsavedChanges(authoringStarted && hasWork)
  const recovery = usePlaybookDraftRecovery({
    storageKey: playbookRecoveryKey({ viewerId, roomKey }),
    draft: {
      entryType,
      title,
      body: bodyText,
      subGroupId: subGroupId || undefined,
      templateKey: selectedTemplateKey || undefined,
    },
    hasWork,
    onRestore: draft => {
      setEntryType(draft.entryType)
      setTitle(draft.title)
      setBodyText(draft.body)
      setSubGroupId(draft.subGroupId ?? '')
      setSelectedTemplateKey(draft.templateKey ?? null)
      setReviewing(false)
      setAuthoringStarted(true)
    },
  })

  const clearAuthoring = () => {
    setTitle('')
    setBodyText('')
    setSubGroupId('')
    setSelectedTemplateKey(null)
    setReviewing(false)
  }

  const startBlank = () => {
    recovery.discard()
    clearAuthoring()
    setEntryType('document')
    setAuthoringStarted(true)
  }

  const startFromTemplate = (template: PlaybookAuthoringTemplate) => {
    recovery.discard()
    clearAuthoring()
    setSelectedTemplateKey(template.key)
    setEntryType(template.entryType)
    setBodyText(template.body)
    setAuthoringStarted(true)
  }

  const returnToChooser = () => {
    if (hasWork && !window.confirm('Discard this unfinished entry and choose another starting point?')) return
    recovery.discard()
    clearAuthoring()
    setAuthoringStarted(false)
  }

  const insertDocumentSnippet = (value: string) => {
    setBodyText(current => `${current}${current && !current.endsWith('\n') ? '\n\n' : ''}${value}`)
  }

  const handleSubmit = async (publish?: boolean) => {
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
          subGroupId: subGroupId || undefined,
          entryType,
          title: trimmedTitle,
          content: buildContent(entryType, bodyText),
          publish,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: PlaybookEntryRow; error?: string }
      if (!res.ok || !json.data) throw new Error(json.error ?? "Couldn't save — please try again.")
      recovery.clear()
      onCreated(json.data)
      clearAuthoring()
      setAuthoringStarted(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save — please try again.")
    } finally {
      setSaving(false)
    }
  }

  if (!authoringStarted) {
    return (
      <div className="flex flex-col gap-3">
        <DraftRecoveryNotice
          candidate={recovery.candidate}
          savedAt={recovery.savedAt}
          storageUnavailable={recovery.storageUnavailable}
          onRestore={recovery.restore}
          onDiscard={recovery.discard}
        />
        <AuthoringTemplateChooser onBlank={startBlank} onTemplate={startFromTemplate} />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[color:var(--indigo)]">{selectedTemplate ? `${selectedTemplate.label} starter` : 'Blank entry'}</p>
          <h3 className="mt-1 text-[14px] font-medium text-[color:var(--ink)]">Create Playbook entry</h3>
          <p className="mt-0.5 text-[12px] text-[color:var(--ink-3)]">
            {isApprover
              ? entryType === 'document'
                ? 'Save a working draft or publish when it is ready.'
                : 'Publish this entry when it is ready.'
              : 'Submitted as a draft — a room-lead or leadership approves before it publishes.'}
          </p>
        </div>
        <button type="button" onClick={returnToChooser} disabled={saving} className="self-start rounded-lg border border-[color:var(--border)] px-3 py-2 text-[11px] font-bold text-[color:var(--ink-2)] disabled:opacity-50">Choose another start</button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="Playbook entry format"
          value={entryType}
          onChange={e => setEntryType(e.target.value as EntryType)}
          disabled={saving || selectedTemplate !== null}
          title={selectedTemplate ? 'This starter uses its matching format. Choose another start to change formats.' : undefined}
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)] focus:border-[color:var(--indigo)] focus:outline-none disabled:opacity-50"
        >
          <option value="sop">SOP</option>
          <option value="topic">Topic</option>
          <option value="document">Document</option>
        </select>
        {subgroups.length > 0 && (
          <select
            value={subGroupId}
            onChange={e => setSubGroupId(e.target.value)}
            disabled={saving}
            className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)] focus:border-[color:var(--indigo)] focus:outline-none disabled:opacity-50"
          >
            <option value="">No subgroup</option>
            {subgroups.map(subgroup => (
              <option key={subgroup.id} value={subgroup.id}>
                {subgroup.label}
              </option>
            ))}
          </select>
        )}
        <input
          aria-label="Playbook entry title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          disabled={saving}
          placeholder={selectedTemplate?.titlePlaceholder ?? 'Title…'}
          className="min-w-0 flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none disabled:opacity-50"
        />
      </div>

      {entryType === 'document' && <DocumentTools onInsert={insertDocumentSnippet} />}
      <div className={entryType === 'document' ? 'mt-2 grid gap-3 lg:grid-cols-2' : 'mt-2'}>
        <textarea
          aria-label={currentBodyLabel}
          value={bodyText}
          onChange={e => setBodyText(e.target.value)}
          disabled={saving}
          rows={entryType === 'document' ? 16 : 4}
          placeholder={currentBodyLabel}
          className="min-h-0 w-full resize-y rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 font-mono text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none disabled:opacity-50"
        />
        {entryType === 'document' && (
          <div className="max-h-[420px] overflow-auto rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] p-4">
            {bodyText.trim() ? (
              <MarkdownBody content={bodyText} />
            ) : (
              <p className="text-[12px] text-[color:var(--ink-3)]">Document preview</p>
            )}
          </div>
        )}
      </div>
      <p className="mt-1 text-[10.5px] text-[color:var(--ink-3)]">
        {currentBodyLabel}
        {entryType === 'document' ? ` · ${bodyText.trim() ? bodyText.trim().split(/\s+/).length : 0} words · ${bodyText.length.toLocaleString()} characters` : ''}
      </p>
      <div className="mt-2">
        <DraftRecoveryNotice
          candidate={recovery.candidate}
          savedAt={recovery.savedAt}
          storageUnavailable={recovery.storageUnavailable}
          onRestore={recovery.restore}
          onDiscard={recovery.discard}
        />
      </div>

      {error && (
        <p
          className="mt-2 rounded-lg border px-3 py-2 text-[12.5px]"
          style={{ color: 'var(--rose-fg)', background: 'var(--rose-bg)', borderColor: 'var(--rose-line)' }}
        >
          {error}
        </p>
      )}

      {reviewing && (
        <AuthoringPreflightPanel
          input={{ title, entryType, body: bodyText }}
          roomLabel={roomLabel}
          subgroupLabel={subgroups.find(subgroup => subgroup.id === subGroupId)?.label}
          intendedAction={isApprover ? 'Publish now' : 'Submit for approval'}
          confirmLabel={isApprover ? 'Publish' : 'Submit for approval'}
          busy={saving}
          onConfirm={() => handleSubmit(isApprover)}
          onClose={() => setReviewing(false)}
        />
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {isApprover && (
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={saving || !title.trim() || !bodyText.trim()}
            className="rounded-full border border-[color:var(--border)] px-4 py-1.5 text-[13px] font-bold text-[color:var(--ink-2)] transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save draft'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setReviewing(true)}
          disabled={saving || !title.trim() || !bodyText.trim()}
          className="rounded-full px-4 py-1.5 text-[13px] font-bold text-white transition disabled:opacity-50"
          style={{ background: 'var(--grad)' }}
        >
          {saving ? 'Saving…' : isApprover ? 'Review & publish' : 'Review & submit'}
        </button>
      </div>
    </div>
  )
}

// ─── EntryCard — one authored entry, with edit/approve/reject affordances ──

function EntryCard({
  viewerId,
  entry,
  roomKey,
  roomLabel,
  isApprover,
  staff,
  gamePlans,
  onUpdated,
}: {
  viewerId: string
  entry: PlaybookEntryRow
  roomKey: string
  roomLabel: string
  isApprover: boolean
  staff: PlaybookStaffOption[]
  gamePlans: PlaybookGamePlanOption[]
  onUpdated: (entry: PlaybookEntryRow) => void
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [bodyText, setBodyText] = useState(() =>
    contentText(entry.entry_type, entry.draft_content ?? entry.content)
  )
  const [busy, setBusy] = useState<'edit' | 'approve' | 'reject' | null>(null)
  const [reviewingEdit, setReviewingEdit] = useState(false)
  const [reviewDecisionSummary, setReviewDecisionSummary] = useState('')
  const [error, setError] = useState<string | null>(null)

  const currentBodyLabel = bodyLabel(entry.entry_type)
  const publishedText = contentText(entry.entry_type, entry.content)
  const draftText = entry.draft_content ? contentText(entry.entry_type, entry.draft_content) : null
  const savedText = draftText ?? publishedText
  const publishedLines = entry.entry_type === 'document' ? [] : linesToList(publishedText)
  const draftLines = entry.entry_type === 'document' || draftText === null ? null : linesToList(draftText)
  useUnsavedChanges(editing && bodyText !== savedText)
  const recovery = usePlaybookDraftRecovery({
    storageKey: playbookRecoveryKey({ viewerId, roomKey, entryId: entry.id }),
    draft: { entryType: entry.entry_type, title: entry.title, body: bodyText },
    hasWork: editing && bodyText !== savedText,
    onRestore: draft => {
      setBodyText(draft.body)
      setReviewingEdit(false)
      setEditing(true)
    },
  })

  const insertDocumentSnippet = (value: string) => {
    setBodyText(current => `${current}${current && !current.endsWith('\n') ? '\n\n' : ''}${value}`)
  }

  const runAction = async (
    action: 'approve' | 'reject' | 'edit',
    content?: Record<string, unknown>,
    publish?: boolean,
    confirmDependencyImpact = false,
  ) => {
    setBusy(action)
    setError(null)
    try {
      const res = await fetch(entryPatchPath(entry.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          content
            ? {
                action,
                content,
                publish,
                expectedRevision: entry.revision_number ?? 1,
                expectedDraftVersion: entry.draft_version ?? (entry.draft_content ? 1 : 0),
                confirmDependencyImpact,
              }
            : {
                action,
                expectedRevision: entry.revision_number ?? 1,
                expectedDraftVersion: entry.draft_version ?? (entry.draft_content ? 1 : 0),
                reviewSummary: action === 'approve' || action === 'reject' ? reviewDecisionSummary.trim() || undefined : undefined,
                confirmDependencyImpact,
              }
        ),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: PlaybookEntryRow; error?: string; dependencyImpact?: { affected: number } }
      if (res.status === 409 && json.dependencyImpact && !confirmDependencyImpact) {
        const proceed = window.confirm(`${json.error}\n\nPublish anyway and record the new revision?`)
        if (proceed) {
          setBusy(null)
          await runAction(action, content, publish, true)
          return
        }
      }
      if (!res.ok || !json.data) throw new Error(json.error ?? "Couldn't save — please try again.")
      if (action === 'edit') recovery.clear()
      onUpdated(json.data)
      setBodyText(contentText(json.data.entry_type, json.data.draft_content ?? json.data.content))
      if (action === 'edit') {
        setEditing(false)
        setReviewingEdit(false)
      }
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
            {entry.source_kind === 'adopted_markdown' ? ' · Adopted Markdown' : ''}
            {entry.review_due_at ? ` · Review ${new Date(entry.review_due_at).toLocaleDateString()}` : ''}
          </p>
        </div>
        <StatusBadge status={entry.status} hasPendingDraft={entry.draft_content !== null} />
      </div>

      {editing ? (
        <div className="mt-2">
          <DraftRecoveryNotice
            candidate={recovery.candidate}
            savedAt={recovery.savedAt}
            storageUnavailable={recovery.storageUnavailable}
            onRestore={recovery.restore}
            onDiscard={recovery.discard}
          />
          {entry.entry_type === 'document' && <DocumentTools onInsert={insertDocumentSnippet} />}
          <div className={entry.entry_type === 'document' ? 'grid gap-3 lg:grid-cols-2' : ''}>
            <textarea
              value={bodyText}
              onChange={e => setBodyText(e.target.value)}
              disabled={busy !== null}
              rows={entry.entry_type === 'document' ? 16 : 4}
              placeholder={currentBodyLabel}
              className="w-full resize-y rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 font-mono text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none disabled:opacity-50"
            />
            {entry.entry_type === 'document' && (
              <div className="max-h-[420px] overflow-auto rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
                {bodyText.trim() ? (
                  <MarkdownBody content={bodyText} />
                ) : (
                  <p className="text-[12px] text-[color:var(--ink-3)]">Document preview</p>
                )}
              </div>
            )}
          </div>
          {entry.entry_type === 'document' && (
            <p className="mt-1 text-[10.5px] text-[color:var(--ink-3)]">
              {bodyText.trim() ? bodyText.trim().split(/\s+/).length : 0} words · {bodyText.length.toLocaleString()} characters
            </p>
          )}
          {reviewingEdit && (
            <AuthoringPreflightPanel
              input={{
                title: entry.title,
                entryType: entry.entry_type,
                body: bodyText,
                ownerPresent: Boolean(entry.owner_id),
                reviewCadencePresent: Boolean(entry.review_due_at || entry.review_interval_days),
              }}
              roomLabel={roomLabel}
              intendedAction={isApprover ? 'Publish revision now' : 'Submit revision for approval'}
              confirmLabel={isApprover ? 'Publish revision' : 'Submit revision'}
              busy={busy !== null}
              onConfirm={() => runAction('edit', buildContent(entry.entry_type, bodyText), isApprover)}
              onClose={() => setReviewingEdit(false)}
              compact
            />
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {isApprover && (
              <button
                type="button"
                onClick={() => runAction('edit', buildContent(entry.entry_type, bodyText), false)}
                disabled={busy !== null || !bodyText.trim()}
                className="rounded-full border border-[color:var(--border)] px-3 py-1.5 text-[12.5px] font-bold text-[color:var(--ink-2)] transition disabled:opacity-50"
              >
                {busy === 'edit' ? 'Saving…' : 'Save draft'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setReviewingEdit(true)}
              disabled={busy !== null || !bodyText.trim()}
              className="rounded-full border border-[color:var(--indigo)] px-3 py-1.5 text-[12.5px] font-bold text-[color:var(--indigo)] transition disabled:opacity-50"
            >
              {busy === 'edit' ? 'Saving…' : isApprover ? 'Review & publish' : 'Review & submit'}
            </button>
            <button
              type="button"
              onClick={() => {
                setReviewingEdit(false)
                setEditing(false)
              }}
              disabled={busy !== null}
              className="rounded-full border border-[color:var(--border)] px-3 py-1.5 text-[12.5px] text-[color:var(--ink-3)] transition hover:text-[color:var(--ink)] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {entry.entry_type === 'document' && publishedText && (
            <div className="mt-2">
              <p className="line-clamp-3 whitespace-pre-wrap text-[12.5px] text-[color:var(--ink-2)]">
                {publishedText.replace(/^#{1,6}\s+/gm, '').slice(0, 360)}
              </p>
              {entry.slug && (
                <Link
                  href={`/admin/playbook/${roomKey}/${entry.slug}`}
                  className="mt-2 inline-flex text-[12.5px] font-bold text-[color:var(--indigo)] hover:underline"
                >
                  Read document →
                </Link>
              )}
            </div>
          )}
          {publishedLines.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-[12.5px] text-[color:var(--ink-2)]">
              {publishedLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
          {draftLines && draftLines.length > 0 && (
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
          {entry.entry_type === 'document' && draftText && (
            <>
              <div className="mt-2 max-h-[360px] overflow-auto rounded-lg border border-dashed border-[color:var(--border-2)] p-4">
                <p className="mb-3 text-[10.5px] font-bold uppercase tracking-[.06em] text-[color:var(--ink-3)]">
                  Pending document preview
                </p>
                <MarkdownBody content={draftText} />
              </div>
              {publishedText && <MarkdownRevisionDiff published={publishedText} proposed={draftText} />}
            </>
          )}
          {draftText && (
            <AuthoringPreflightPanel
              input={{
                title: entry.title,
                entryType: entry.entry_type,
                body: draftText,
                ownerPresent: Boolean(entry.owner_id),
                reviewCadencePresent: Boolean(entry.review_due_at || entry.review_interval_days),
              }}
              roomLabel={roomLabel}
              intendedAction="Reviewer decision"
              compact
            />
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

      <EntryReviewPanel entry={entry} roomKey={roomKey} isApprover={isApprover} staff={staff} />

      {isApprover && (
        <EntryMetadataPanel entry={entry} staff={staff} gamePlans={gamePlans} onUpdated={onUpdated} />
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
          {isApprover && entry.draft_content !== null && (
            <>
              <textarea
                value={reviewDecisionSummary}
                onChange={event => setReviewDecisionSummary(event.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Optional final review summary for the permanent record…"
                className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 text-[11px] text-[color:var(--ink)] sm:basis-full"
              />
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
  viewerId,
  roomKey,
  roomLabel,
  isApprover,
  initialEntries,
  subgroups,
  staff,
  gamePlans,
}: {
  viewerId: string
  roomKey: string
  roomLabel: string
  isApprover: boolean
  initialEntries: PlaybookEntryRow[]
  subgroups: PlaybookSubgroupOption[]
  staff: PlaybookStaffOption[]
  gamePlans: PlaybookGamePlanOption[]
}) {
  const [entries, setEntries] = useState<PlaybookEntryRow[]>(initialEntries)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [typeFilter, setTypeFilter] = useState<'all' | EntryType>('all')
  const [subgroupFilter, setSubgroupFilter] = useState('all')
  const [viewFilter, setViewFilter] = useState<'all' | 'published' | 'pending' | 'review_due' | 'retired'>('all')

  const upsertEntry = (entry: PlaybookEntryRow) => {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.id === entry.id)
      if (idx === -1) return [entry, ...prev]
      const next = [...prev]
      next[idx] = entry
      return next
    })
  }

  const visibleEntries = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()
    const now = Date.now()
    return entries.filter(entry => {
      if (typeFilter !== 'all' && entry.entry_type !== typeFilter) return false
      if (subgroupFilter !== 'all' && (entry.sub_group_id ?? 'none') !== subgroupFilter) return false
      if (viewFilter === 'published' && !(entry.status === 'published' && entry.draft_content === null)) return false
      if (viewFilter === 'pending' && entry.draft_content === null) return false
      if (viewFilter === 'retired' && !['archived', 'superseded'].includes(entry.status)) return false
      if (
        viewFilter === 'review_due' &&
        (
          entry.status !== 'published' ||
          !entry.review_due_at ||
          Number.isNaN(Date.parse(entry.review_due_at)) ||
          Date.parse(entry.review_due_at) > now
        )
      ) return false
      if (!query) return true
      const subgroup = subgroups.find(item => item.id === entry.sub_group_id)?.label ?? ''
      return [entry.title, entry.entry_type, entry.source_path ?? '', subgroup, searchableEntryText(entry)]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [deferredSearch, entries, subgroupFilter, subgroups, typeFilter, viewFilter])

  const published = useMemo(
    () => visibleEntries.filter(e => e.status === 'published' && e.draft_content === null),
    [visibleEntries]
  )
  const pending = useMemo(() => visibleEntries.filter(e => e.draft_content !== null), [visibleEntries])
  const retired = useMemo(
    () => visibleEntries.filter(e => e.status === 'archived' || e.status === 'superseded'),
    [visibleEntries]
  )

  return (
    <div className="flex flex-col gap-4">
      {isApprover && (
        <DoctrineAdoptionForm roomKey={roomKey} subgroups={subgroups} onAdopted={upsertEntry} />
      )}
      <NewEntryForm
        viewerId={viewerId}
        roomKey={roomKey}
        roomLabel={roomLabel}
        isApprover={isApprover}
        subgroups={subgroups}
        onCreated={upsertEntry}
      />

      <div className="grid gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search titles, doctrine text, sources…"
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] text-[color:var(--ink)]"
        />
        <select
          value={typeFilter}
          onChange={event => setTypeFilter(event.target.value as 'all' | EntryType)}
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] text-[color:var(--ink)]"
        >
          <option value="all">All entry types</option>
          <option value="document">Documents</option>
          <option value="sop">SOPs</option>
          <option value="topic">Topics</option>
        </select>
        <select
          value={subgroupFilter}
          onChange={event => setSubgroupFilter(event.target.value)}
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] text-[color:var(--ink)]"
        >
          <option value="all">All subgroups</option>
          <option value="none">No subgroup</option>
          {subgroups.map(subgroup => <option key={subgroup.id} value={subgroup.id}>{subgroup.label}</option>)}
        </select>
        <select
          value={viewFilter}
          onChange={event => setViewFilter(event.target.value as typeof viewFilter)}
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] text-[color:var(--ink)]"
        >
          <option value="all">All states</option>
          <option value="published">Published</option>
          <option value="pending">Pending review</option>
          <option value="review_due">Review due</option>
          {isApprover && <option value="retired">Archived or superseded</option>}
        </select>
      </div>

      {pending.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-medium text-[color:var(--ink)]">
            Pending approval ({pending.length})
          </h3>
          <div className="flex flex-col gap-2">
            {pending.map(entry => (
              <EntryCard key={entry.id} viewerId={viewerId} entry={entry} roomKey={roomKey} roomLabel={roomLabel} isApprover={isApprover} staff={staff} gamePlans={gamePlans} onUpdated={upsertEntry} />
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
              <EntryCard key={entry.id} viewerId={viewerId} entry={entry} roomKey={roomKey} roomLabel={roomLabel} isApprover={isApprover} staff={staff} gamePlans={gamePlans} onUpdated={upsertEntry} />
            ))}
          </div>
        )}
      </div>

      {isApprover && retired.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-medium text-[color:var(--ink)]">Archived &amp; superseded ({retired.length})</h3>
          <div className="flex flex-col gap-2">
            {retired.map(entry => (
              <EntryCard key={entry.id} viewerId={viewerId} entry={entry} roomKey={roomKey} roomLabel={roomLabel} isApprover={isApprover} staff={staff} gamePlans={gamePlans} onUpdated={upsertEntry} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
