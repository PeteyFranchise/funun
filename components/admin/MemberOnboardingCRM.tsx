'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  defaultRunContext,
  summarizeChecklist,
  type ItemStatus,
  type MemberGamePlanRun,
  type MemberGamePlanTemplate,
  type RunContext,
} from '@/lib/member-onboarding/game-plan'

export type OnboardingMember = {
  id: string
  label: string
  email: string
  roleLabels: string[]
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function statusStyle(status: ItemStatus): string {
  if (status === 'completed') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
  if (status === 'skipped') return 'border-amber-400/40 bg-amber-400/10 text-amber-200'
  return 'border-[color:var(--border-2)] bg-[color:var(--panel)] text-[color:var(--ink-3)]'
}

function RunSummary({ run }: { run: MemberGamePlanRun }) {
  const summary = summarizeChecklist(run.items)
  return (
    <span className="text-[11px] text-[color:var(--ink-3)]">
      {summary.completed} complete · {summary.skipped} skipped · {summary.pending} pending
    </span>
  )
}

export function MemberOnboardingCRM({
  members,
  templates,
  initialRuns,
}: {
  members: OnboardingMember[]
  templates: MemberGamePlanTemplate[]
  initialRuns: MemberGamePlanRun[]
}) {
  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.id ?? '')
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? '')
  const [runs, setRuns] = useState(initialRuns)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [draftRun, setDraftRun] = useState<MemberGamePlanRun | null>(null)
  const [busy, setBusy] = useState<'start' | 'save' | 'complete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const selectedMember = members.find(member => member.id === selectedMemberId) ?? null
  const memberRuns = useMemo(
    () => runs.filter(run => run.member_id === selectedMemberId),
    [runs, selectedMemberId]
  )
  const openRuns = memberRuns.filter(run => run.status === 'open')
  const completedRuns = memberRuns.filter(run => run.status === 'completed')

  const chooseRun = (run: MemberGamePlanRun) => {
    setActiveRunId(run.id)
    setDraftRun(structuredClone(run))
    setError(null)
    setNotice(null)
  }

  const selectMember = (memberId: string) => {
    setSelectedMemberId(memberId)
    setActiveRunId(null)
    setDraftRun(null)
    setError(null)
    setNotice(null)
  }

  const startRun = async () => {
    if (!selectedMemberId || !selectedTemplateId) return
    setBusy('start')
    setError(null)
    setNotice(null)
    try {
      const response = await fetch('/api/admin/member-onboarding/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: selectedMemberId,
          templateId: selectedTemplateId,
          context: defaultRunContext(),
        }),
      })
      const json = (await response.json().catch(() => ({}))) as {
        data?: MemberGamePlanRun
        resumed?: boolean
        error?: string
      }
      if (!response.ok || !json.data) throw new Error(json.error ?? 'Could not start the game plan.')
      setRuns(previous => [json.data!, ...previous.filter(run => run.id !== json.data!.id)])
      chooseRun(json.data)
      setNotice(json.resumed ? 'Resumed the existing open game plan.' : 'Started a fresh checklist for this call.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start the game plan.')
    } finally {
      setBusy(null)
    }
  }

  const setItemStatus = (itemId: string, status: ItemStatus) => {
    setDraftRun(current => current ? {
      ...current,
      items: current.items.map(item => item.id === itemId ? { ...item, status } : item),
    } : current)
  }

  const setItemNote = (itemId: string, note: string) => {
    setDraftRun(current => current ? {
      ...current,
      items: current.items.map(item => item.id === itemId ? { ...item, note } : item),
    } : current)
  }

  const updateContext = <K extends keyof RunContext>(key: K, value: RunContext[K]) => {
    setDraftRun(current => current ? { ...current, context: { ...current.context, [key]: value } } : current)
  }

  const persistRun = async (action: 'save' | 'complete') => {
    if (!draftRun || !activeRunId) return
    setBusy(action)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/admin/member-onboarding/runs/${activeRunId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          items: draftRun.items,
          context: draftRun.context,
          overallNotes: draftRun.overall_notes,
        }),
      })
      const json = (await response.json().catch(() => ({}))) as { data?: MemberGamePlanRun; error?: string }
      if (!response.ok || !json.data) throw new Error(json.error ?? 'Could not save the game plan.')
      setRuns(previous => [json.data!, ...previous.filter(run => run.id !== json.data!.id)])
      if (action === 'complete') {
        setDraftRun(null)
        setActiveRunId(null)
        setNotice('Call completed and added to the Member’s call log.')
      } else {
        setDraftRun(structuredClone(json.data))
        setNotice('Progress saved.')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the game plan.')
    } finally {
      setBusy(null)
    }
  }

  const sections = useMemo(() => {
    if (!draftRun) return []
    const grouped = new Map<string, MemberGamePlanRun['items']>()
    for (const item of draftRun.items) grouped.set(item.section, [...(grouped.get(item.section) ?? []), item])
    return Array.from(grouped.entries())
  }, [draftRun])

  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4">
        <p className="text-[11px] font-extrabold uppercase tracking-[.16em] text-amber-200">Beta testing only</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--ink-2)]">
          Use only for approved beta onboarding. Keep source files backed up, never guess rights information,
          and capture confusing behavior or bugs in the call notes.
        </p>
        <Link href="/admin/playbook/company-wide" className="mt-2 inline-block text-[12px] font-semibold text-[color:var(--indigo)] hover:underline">
          Read the complete Playbook SOP →
        </Link>
      </div>

      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <label className="text-[12px] text-[color:var(--ink-3)]">
            Member Account
            <select
              value={selectedMemberId}
              onChange={event => selectMember(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2.5 text-[13px] text-[color:var(--ink)]"
            >
              {members.map(member => <option key={member.id} value={member.id}>{member.label} · {member.email}</option>)}
            </select>
          </label>
          <label className="text-[12px] text-[color:var(--ink-3)]">
            Game-plan template
            <select
              value={selectedTemplateId}
              onChange={event => setSelectedTemplateId(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2.5 text-[13px] text-[color:var(--ink)]"
            >
              {templates.map(template => <option key={template.id} value={template.id}>{template.title}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={startRun}
            disabled={busy !== null || !selectedMemberId || !selectedTemplateId}
            className="rounded-lg bg-[image:var(--grad)] px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {busy === 'start' ? 'Starting…' : 'Start a game plan'}
          </button>
        </div>
        {selectedMember && selectedMember.roleLabels.length > 0 && (
          <p className="mt-2 text-[11px] text-[color:var(--ink-3)]">Roles: {selectedMember.roleLabels.join(', ')}</p>
        )}
      </div>

      {error && <p className="rounded-lg border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-[13px] text-rose-200">{error}</p>}
      {notice && <p className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-[13px] text-emerald-200">{notice}</p>}

      {!draftRun && openRuns.length > 0 && (
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
          <h2 className="text-[14px] font-semibold text-[color:var(--ink)]">Open game plans</h2>
          <div className="mt-3 space-y-2">
            {openRuns.map(run => (
              <button key={run.id} type="button" onClick={() => chooseRun(run)} className="flex w-full items-center justify-between rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-3 text-left hover:border-[color:var(--indigo)]">
                <span><span className="block text-[13px] font-medium text-[color:var(--ink)]">{run.template_title}</span><RunSummary run={run} /></span>
                <span className="text-[12px] text-[color:var(--indigo)]">Resume →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {draftRun && (
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--border)] pb-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-amber-300">Beta testing only · v{draftRun.template_version}</p>
              <h2 className="mt-1 text-lg font-bold text-[color:var(--ink)]">{draftRun.template_title}</h2>
              <p className="mt-1 text-[12px] text-[color:var(--ink-3)]">Facilitator: {draftRun.facilitator_label} · Started {formatDate(draftRun.started_at)}</p>
            </div>
            <RunSummary run={draftRun} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-[11px] text-[color:var(--ink-3)]">Artist<input value={draftRun.context.artistName} onChange={event => updateContext('artistName', event.target.value)} className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)]" placeholder="Artist name" /></label>
            <label className="text-[11px] text-[color:var(--ink-3)]">Song / project<input value={draftRun.context.projectName} onChange={event => updateContext('projectName', event.target.value)} className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)]" placeholder="Project name" /></label>
            <label className="text-[11px] text-[color:var(--ink-3)]">Session<select value={draftRun.context.sessionMode} onChange={event => updateContext('sessionMode', event.target.value as RunContext['sessionMode'])} className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)]"><option value="">Not specified</option><option value="remote">Remote</option><option value="in_person">In person</option></select></label>
          </div>

          <div className="mt-5 space-y-5">
            {sections.map(([section, items]) => (
              <section key={section}>
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[.12em] text-[color:var(--indigo)]">{section}</h3>
                <div className="space-y-2">
                  {items.map(item => (
                    <div key={item.id} className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] p-3">
                      <div className="flex flex-wrap items-start gap-3">
                        <button type="button" onClick={() => setItemStatus(item.id, item.status === 'completed' ? 'pending' : 'completed')} className={`min-w-[82px] rounded-md border px-2 py-1 text-[11px] font-semibold ${statusStyle(item.status)}`}>
                          {item.status === 'completed' ? '✓ Complete' : item.status === 'skipped' ? 'Skipped' : 'Mark done'}
                        </button>
                        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-[color:var(--ink)]">{item.label}</p>
                        <button type="button" onClick={() => setItemStatus(item.id, item.status === 'skipped' ? 'pending' : 'skipped')} className="text-[11px] text-[color:var(--ink-3)] hover:text-amber-200">
                          {item.status === 'skipped' ? 'Undo skip' : 'Skip'}
                        </button>
                      </div>
                      <input value={item.note} onChange={event => setItemNote(item.id, event.target.value)} placeholder="Optional note from the call…" className="mt-2 w-full border-0 border-b border-dashed border-[color:var(--border-2)] bg-transparent py-1 text-[12px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none" />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <label className="mt-5 block text-[11px] font-semibold uppercase tracking-[.1em] text-[color:var(--ink-3)]">
            Overall call notes and next step
            <textarea value={draftRun.overall_notes} onChange={event => setDraftRun(current => current ? { ...current, overall_notes: event.target.value } : current)} rows={4} className="mt-2 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] normal-case tracking-normal text-[color:var(--ink)]" placeholder="Feedback, bugs, follow-ups, owner and next action…" />
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[color:var(--border)] pt-4">
            <button type="button" onClick={() => persistRun('save')} disabled={busy !== null} className="rounded-lg border border-[color:var(--border-2)] px-4 py-2 text-[13px] font-semibold text-[color:var(--ink-2)] disabled:opacity-50">{busy === 'save' ? 'Saving…' : 'Save progress'}</button>
            <button type="button" onClick={() => persistRun('complete')} disabled={busy !== null} className="rounded-lg bg-[image:var(--grad)] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">{busy === 'complete' ? 'Logging…' : 'Complete & log call'}</button>
            <span className="text-[11px] text-[color:var(--ink-3)]">Pending or skipped steps do not block completion.</span>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
        <h2 className="text-[14px] font-semibold text-[color:var(--ink)]">Call log</h2>
        <p className="mt-1 text-[12px] text-[color:var(--ink-3)]">Completed onboarding calls for {selectedMember?.label ?? 'this Member'}.</p>
        <div className="mt-3 space-y-2">
          {completedRuns.length === 0 && <p className="text-[12px] text-[color:var(--ink-3)]">No completed onboarding calls yet.</p>}
          {completedRuns.map(run => (
            <details key={run.id} className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] p-3">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><span className="block text-[13px] font-medium text-[color:var(--ink)]">{run.template_title}</span><span className="text-[11px] text-[color:var(--ink-3)]">{formatDate(run.completed_at)} · {run.facilitator_label}</span></span>
                  <RunSummary run={run} />
                </div>
              </summary>
              <div className="mt-3 border-t border-[color:var(--border)] pt-3 text-[12px] text-[color:var(--ink-2)]">
                <p>Artist: {run.context.artistName || '—'} · Project: {run.context.projectName || '—'} · Session: {run.context.sessionMode === 'in_person' ? 'In person' : run.context.sessionMode === 'remote' ? 'Remote' : '—'}</p>
                {run.overall_notes && <p className="mt-2 whitespace-pre-wrap">{run.overall_notes}</p>}
                <ul className="mt-3 space-y-1 text-[11px] text-[color:var(--ink-3)]">
                  {run.items.filter(item => item.status !== 'completed' || item.note).map(item => <li key={item.id}><b>{item.status}:</b> {item.label}{item.note ? ` — ${item.note}` : ''}</li>)}
                </ul>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
