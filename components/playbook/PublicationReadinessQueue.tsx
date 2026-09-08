'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { GuidedDoctrineAdoption } from '@/components/playbook/GuidedDoctrineAdoption'
import { assessDoctrinePilot, DOCTRINE_PILOT_KEY } from '@/lib/playbook/activation'
import type { PublicationAssessment, PublicationReadiness } from '@/lib/playbook/publication-manifest'

const STATE_LABELS: Record<PublicationReadiness, string> = {
  ready: 'Ready to adopt', draft: 'Draft adopted', published: 'Published', changed: 'Source update pending', blocked: 'Blocked',
}

function badgeClass(state: PublicationReadiness): string {
  if (state === 'blocked') return 'border-[rgba(248,113,113,.34)] bg-[rgba(248,113,113,.09)] text-[#fca5a5]'
  if (state === 'changed') return 'border-[rgba(251,191,36,.30)] bg-[rgba(251,191,36,.08)] text-[#fcd34d]'
  if (state === 'published') return 'border-[rgba(52,211,153,.30)] bg-[rgba(52,211,153,.08)] text-[#6ee7b7]'
  return 'border-[color:var(--border)] bg-[color:var(--panel-2)] text-[color:var(--ink-2)]'
}

export function PublicationReadinessQueue({ items, uatChecks, packageUnlocked }: { items: PublicationAssessment[]; uatChecks: string[]; packageUnlocked: boolean }) {
  const [state, setState] = useState<'all' | PublicationReadiness>('all')
  const [room, setRoom] = useState('all')
  const [completedChecks, setCompletedChecks] = useState<string[]>([])
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const rooms = useMemo(() => Array.from(new Set(items.map(item => item.roomKey))).sort(), [items])
  const visible = items.filter(item => (state === 'all' || item.state === state) && (room === 'all' || item.roomKey === room))
  const counts = items.reduce<Record<PublicationReadiness, number>>((result, item) => {
    result[item.state] += 1
    return result
  }, { ready: 0, draft: 0, published: 0, changed: 0, blocked: 0 })
  const uatComplete = uatChecks.length > 0 && completedChecks.length === uatChecks.length
  const pilot = assessDoctrinePilot({ items, uatComplete, packageUnlocked })

  function toggleCheck(check: string) {
    setCompletedChecks(current => current.includes(check) ? current.filter(value => value !== check) : [...current, check])
  }

  function downloadUatReport() {
    if (!uatComplete) return
    const completedAt = new Date().toISOString()
    const report = JSON.stringify({
      release: 'Release 9 — Playbook Production Activation and Doctrine Pilot',
      completedAt,
      pilotStage: pilot.stage,
      passed: true,
      checks: uatChecks.map(check => ({ check, passed: true })),
    }, null, 2)
    const url = URL.createObjectURL(new Blob([report], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `playbook-publication-uat-${completedAt.slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <div className="mt-6">
      <section className="mb-4 rounded-2xl border border-[color:var(--indigo)] bg-[color:var(--panel)] p-5" aria-labelledby="pilot-status-title">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[color:var(--indigo)]">Release 9 · A&R-first production pilot</p>
            <h2 id="pilot-status-title" className="mt-2 text-lg font-extrabold text-[color:var(--ink)]">{pilot.label}</h2>
            <p className="mt-1 max-w-[76ch] text-[12px] leading-6 text-[color:var(--ink-3)]">{pilot.detail}</p>
          </div>
          {!uatComplete && pilot.stage === 'uat_required' && <a href="#publication-uat" className="shrink-0 rounded-lg border border-[color:var(--border)] px-3 py-2 text-[11px] font-bold text-[color:var(--ink-2)]">Go to UAT checklist</a>}
        </div>
        <ol className="mt-4 grid gap-2 md:grid-cols-5">
          {([
            { number: 1, label: 'Schema online', complete: true },
            { number: 2, label: 'UAT passed', complete: uatComplete },
            { number: 3, label: 'A&R reviewed', complete: ['review', 'legacy_cleanup', 'complete'].includes(pilot.stage) },
            { number: 4, label: 'Legacy resolved', complete: pilot.stage === 'complete' },
            { number: 5, label: 'Package unlocked', complete: pilot.packageUnlocked },
          ] satisfies Array<{ number: number; label: string; complete: boolean }>).map(step => (
            <li key={step.number} className={`rounded-lg border px-3 py-2 text-[10.5px] font-bold ${step.complete ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-[color:var(--border)] bg-[color:var(--panel-2)] text-[color:var(--ink-3)]'}`}>
              {step.number}. {step.label}
            </li>
          ))}
        </ol>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {(Object.keys(STATE_LABELS) as PublicationReadiness[]).map(key => (
          <button key={key} type="button" onClick={() => setState(key)} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] px-4 py-3 text-left hover:border-[color:var(--indigo)]">
            <span className="text-[10px] font-bold uppercase tracking-[.1em] text-[color:var(--ink-3)]">{STATE_LABELS[key]}</span>
            <span className="mt-1 block text-2xl font-extrabold text-[color:var(--ink)]">{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-3">
        <select value={state} onChange={event => setState(event.target.value as 'all' | PublicationReadiness)} aria-label="Filter publication state" className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px]"><option value="all">All states</option>{(Object.keys(STATE_LABELS) as PublicationReadiness[]).map(key => <option key={key} value={key}>{STATE_LABELS[key]}</option>)}</select>
        <select value={room} onChange={event => setRoom(event.target.value)} aria-label="Filter publication room" className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px]"><option value="all">All governed rooms</option>{rooms.map(key => <option key={key} value={key}>{key}</option>)}</select>
      </div>

      <div className="mt-3 space-y-3" aria-live="polite">
        {visible.map(item => {
          const roomHref = `/admin/playbook/${item.roomKey}`
          const articleHref = item.entrySlug ? `${roomHref}/${item.entrySlug}` : null
          const draftCreationAllowed = item.key === DOCTRINE_PILOT_KEY ? uatComplete : pilot.packageUnlocked
          const holdReason = item.key === DOCTRINE_PILOT_KEY
            ? 'Complete every production UAT check before creating the A&R pilot draft.'
            : 'Complete the A&R publication pilot and resolve its legacy entries before starting the remaining package.'
          return (
            <article key={item.key} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${badgeClass(item.state)}`}>{STATE_LABELS[item.state]}</span><span className="text-[10px] font-bold uppercase tracking-[.1em] text-[color:var(--ink-3)]">{item.roomKey} · {item.subgroupKey}</span></div>
                  <h2 className="mt-2 text-[15px] font-extrabold text-[color:var(--ink)]">{item.title}</h2>
                  <p className="mt-1 break-all font-mono text-[10.5px] text-[color:var(--ink-3)]">{item.sourcePath}</p>
                  <p className="mt-2 text-[10.5px] text-[color:var(--ink-3)]">Review: {item.reviewerRoles.join(', ')}{item.gamePlanKeys.length > 0 ? ` · Gameplans: ${item.gamePlanKeys.join(', ')}` : ''}</p>
                  {item.reasons.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-[11px] text-[#fca5a5]">{item.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
                  {item.supersedesTitles.length > 0 && <p className="mt-2 text-[10.5px] text-amber-300">Supersession review: {item.supersedesTitles.join(', ')}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {articleHref && <Link href={articleHref} className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-[11px] font-bold text-[color:var(--ink-2)]">View article</Link>}
                  <Link href={roomHref} className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-[11px] font-bold text-[color:var(--ink-2)]">Open room</Link>
                  <button type="button" onClick={() => setPreviewKey(current => current === item.key ? null : item.key)} className="rounded-lg px-3 py-2 text-[11px] font-extrabold text-white" style={{ background: 'var(--grad)' }}>{previewKey === item.key ? 'Close guided review' : 'Preview & verify'}</button>
                </div>
              </div>
              {previewKey === item.key && <GuidedDoctrineAdoption item={item} draftCreationAllowed={draftCreationAllowed} holdReason={draftCreationAllowed ? null : holdReason} onClose={() => setPreviewKey(null)} />}
            </article>
          )
        })}
        {visible.length === 0 && <div className="rounded-xl border border-dashed border-[color:var(--border)] px-6 py-10 text-center text-[13px] text-[color:var(--ink-3)]">No doctrine targets match these filters.</div>}
      </div>

      <details id="publication-uat" className="mt-6 scroll-mt-6 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)]" open>
        <summary className="cursor-pointer px-4 py-3 text-[13px] font-extrabold text-[color:var(--ink)]">Publication UAT · {completedChecks.length}/{uatChecks.length} checked</summary>
        <div className="space-y-2 border-t border-[color:var(--border)] p-4">
          <p className="mb-3 text-[11px] leading-5 text-[color:var(--ink-3)]">This checklist is session-only evidence for the test pass. Record durable results in the release handoff before production publication.</p>
          {uatChecks.map(check => <label key={check} className="flex items-start gap-2 rounded-lg bg-[color:var(--panel-2)] px-3 py-2 text-[11px] leading-5 text-[color:var(--ink-2)]"><input type="checkbox" className="mt-1" checked={completedChecks.includes(check)} onChange={() => toggleCheck(check)} />{check}</label>)}
          <button type="button" disabled={!uatComplete} onClick={downloadUatReport} className="mt-3 rounded-lg border border-[color:var(--border)] px-3 py-2 text-[11px] font-bold text-[color:var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-40">Download passed UAT report</button>
        </div>
      </details>
    </div>
  )
}
