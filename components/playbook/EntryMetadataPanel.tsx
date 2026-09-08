'use client'

import { useState } from 'react'
import type { PlaybookEntryRow } from '@/lib/playbook/entries'

export type PlaybookStaffOption = { userId: string; label: string }
export type PlaybookGamePlanOption = { id: string; title: string; betaOnly: boolean }

function dateInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : ''
}

export function EntryMetadataPanel({
  entry,
  staff,
  gamePlans,
  onUpdated,
}: {
  entry: PlaybookEntryRow
  staff: PlaybookStaffOption[]
  gamePlans: PlaybookGamePlanOption[]
  onUpdated: (entry: PlaybookEntryRow) => void
}) {
  const [ownerId, setOwnerId] = useState(entry.owner_id ?? '')
  const [reviewDue, setReviewDue] = useState(dateInputValue(entry.review_due_at))
  const [interval, setInterval] = useState(entry.review_interval_days?.toString() ?? '')
  const [links, setLinks] = useState(
    new Map((entry.game_plan_links ?? []).map(link => [link.member_template_id, link.relationship_kind]))
  )
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const toggleTemplate = (templateId: string) => {
    setLinks(current => {
      const next = new Map(current)
      if (next.has(templateId)) next.delete(templateId)
      else next.set(templateId, 'reference')
      return next
    })
  }

  const save = async (markReviewed: boolean) => {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/playbook/entries/${entry.id}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerId: ownerId || null,
          reviewDueAt: reviewDue ? new Date(`${reviewDue}T12:00:00.000Z`).toISOString() : null,
          reviewIntervalDays: interval ? Number(interval) : null,
          templateLinks: Array.from(links, ([templateId, relationshipKind]) => ({
            templateId,
            relationshipKind,
          })),
          markReviewed,
        }),
      })
      const json = (await response.json().catch(() => ({}))) as { data?: PlaybookEntryRow; error?: string }
      if (!response.ok || !json.data) throw new Error(json.error ?? 'Could not save Playbook metadata.')
      onUpdated(json.data)
      setReviewDue(dateInputValue(json.data.review_due_at))
      setMessage(markReviewed ? 'Review recorded and the next review was scheduled.' : 'Article details saved.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save Playbook metadata.')
    } finally {
      setBusy(false)
    }
  }

  const changeLifecycle = async (action: 'archive' | 'supersede' | 'restore') => {
    if (
      action !== 'restore' &&
      !window.confirm(
        action === 'archive'
          ? 'Archive this entry? It will leave the published library but remain recoverable.'
          : 'Mark this entry superseded? Its history remains recoverable.'
      )
    ) return

    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/playbook/entries/${entry.id}/lifecycle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          expectedRevision: entry.revision_number ?? 1,
          expectedDraftVersion: entry.draft_version ?? 0,
        }),
      })
      const json = (await response.json().catch(() => ({}))) as { data?: PlaybookEntryRow; error?: string }
      if (!response.ok || !json.data) throw new Error(json.error ?? 'Could not change this entry.')
      onUpdated(json.data)
      setMessage(action === 'restore' ? 'Entry restored to the published library.' : `Entry ${action}d.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not change this entry.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="mt-3 rounded-lg border border-[color:var(--border)]">
      <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold text-[color:var(--ink-2)]">
        Ownership, review schedule &amp; connected Gameplans
      </summary>
      <div className="border-t border-[color:var(--border)] p-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-[10.5px] font-bold uppercase tracking-[.05em] text-[color:var(--ink-3)]">
            Owner
            <select
              value={ownerId}
              onChange={event => setOwnerId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-2.5 py-2 text-[12px] normal-case tracking-normal text-[color:var(--ink)]"
            >
              <option value="">Unassigned</option>
              {staff.map(person => <option key={person.userId} value={person.userId}>{person.label}</option>)}
            </select>
          </label>
          <label className="text-[10.5px] font-bold uppercase tracking-[.05em] text-[color:var(--ink-3)]">
            Next review
            <input
              type="date"
              value={reviewDue}
              onChange={event => setReviewDue(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-2.5 py-2 text-[12px] normal-case tracking-normal text-[color:var(--ink)]"
            />
          </label>
          <label className="text-[10.5px] font-bold uppercase tracking-[.05em] text-[color:var(--ink-3)]">
            Repeat every
            <select
              value={interval}
              onChange={event => setInterval(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-2.5 py-2 text-[12px] normal-case tracking-normal text-[color:var(--ink)]"
            >
              <option value="">No recurring review</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">1 year</option>
            </select>
          </label>
        </div>

        {gamePlans.length > 0 && (
          <fieldset className="mt-3">
            <legend className="text-[10.5px] font-bold uppercase tracking-[.05em] text-[color:var(--ink-3)]">
              Connected Member CRM Gameplans
            </legend>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              {gamePlans.map(template => (
                <div key={template.id} className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-2">
                  <label className="flex items-start gap-2 text-[12px] text-[color:var(--ink-2)]">
                    <input
                      type="checkbox"
                      checked={links.has(template.id)}
                      onChange={() => toggleTemplate(template.id)}
                      className="mt-0.5"
                    />
                    <span>{template.title}{template.betaOnly ? ' · Beta' : ''}</span>
                  </label>
                  {links.has(template.id) && (
                    <select
                      value={links.get(template.id)}
                      onChange={event => setLinks(current => new Map(current).set(
                        template.id,
                        event.target.value as 'reference' | 'required_reading'
                      ))}
                      className="mt-1.5 w-full rounded border border-[color:var(--border)] bg-[color:var(--panel-2)] px-2 py-1 text-[11px] text-[color:var(--ink)]"
                    >
                      <option value="reference">Reference</option>
                      <option value="required_reading">Required reading</option>
                    </select>
                  )}
                </div>
              ))}
            </div>
          </fieldset>
        )}

        {message && <p className="mt-2 text-[11.5px] text-[color:var(--ink-3)]">{message}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => save(false)}
            disabled={busy}
            className="rounded-full border border-[color:var(--border)] px-3 py-1.5 text-[11.5px] font-bold text-[color:var(--ink-2)] disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save details'}
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            disabled={busy}
            className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[11.5px] font-bold text-emerald-400 disabled:opacity-50"
          >
            Mark reviewed now
          </button>
          {entry.status === 'published' ? (
            <>
              <button
                type="button"
                onClick={() => changeLifecycle('archive')}
                disabled={busy || entry.draft_content !== null}
                className="rounded-full border border-amber-400/30 px-3 py-1.5 text-[11.5px] font-bold text-amber-300 disabled:opacity-50"
              >
                Archive
              </button>
              <button
                type="button"
                onClick={() => changeLifecycle('supersede')}
                disabled={busy || entry.draft_content !== null}
                className="rounded-full border border-rose-400/30 px-3 py-1.5 text-[11.5px] font-bold text-rose-300 disabled:opacity-50"
              >
                Supersede
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => changeLifecycle('restore')}
              disabled={busy || entry.draft_content !== null || !entry.published_at}
              title={!entry.published_at ? 'A never-published draft cannot be restored to the library.' : undefined}
              className="rounded-full border border-emerald-400/30 px-3 py-1.5 text-[11.5px] font-bold text-emerald-300 disabled:opacity-50"
            >
              Restore to published
            </button>
          )}
        </div>
      </div>
    </details>
  )
}
