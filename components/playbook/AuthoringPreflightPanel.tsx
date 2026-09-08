'use client'

import {
  assessPlaybookAuthoringPreflight,
  type PlaybookAuthoringPreflightInput,
} from '@/lib/playbook/authoring-preflight'

export function AuthoringPreflightPanel({
  input,
  roomLabel,
  subgroupLabel,
  intendedAction,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
  compact = false,
}: {
  input: PlaybookAuthoringPreflightInput
  roomLabel: string
  subgroupLabel?: string | null
  intendedAction: string
  confirmLabel?: string
  busy?: boolean
  onConfirm?: () => void
  onClose?: () => void
  compact?: boolean
}) {
  const result = assessPlaybookAuthoringPreflight(input)
  const ready = result.blockerCount === 0 && result.warningCount === 0

  return (
    <section className={`rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] ${compact ? 'mt-3 p-3' : 'mt-4 p-4'}`} aria-label="Playbook review packet">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[color:var(--indigo)]">Review packet</p>
          <h4 className="mt-1 text-[14px] font-extrabold text-[color:var(--ink)]">
            {ready ? 'Ready to move forward' : result.blockerCount ? 'Needs attention before proceeding' : 'Ready with warnings'}
          </h4>
          <p className="mt-1 text-[11px] text-[color:var(--ink-3)]">Automated checks support human review; they do not certify policy or legal correctness.</p>
        </div>
        <div className="flex gap-1.5">
          {result.blockerCount > 0 && <span className="rounded-full border border-[color:var(--rose-line)] bg-[color:var(--rose-bg)] px-2.5 py-1 text-[10.5px] font-bold text-[color:var(--rose-fg)]">{result.blockerCount} blocker{result.blockerCount === 1 ? '' : 's'}</span>}
          {result.warningCount > 0 && <span className="rounded-full border border-[color:var(--amber-line)] bg-[color:var(--amber-bg)] px-2.5 py-1 text-[10.5px] font-bold text-[color:var(--amber-fg)]">{result.warningCount} warning{result.warningCount === 1 ? '' : 's'}</span>}
          {ready && <span className="rounded-full border border-[color:var(--green-line)] bg-[color:var(--green-bg)] px-2.5 py-1 text-[10.5px] font-bold text-[color:var(--green-fg)]">Checks passed</span>}
        </div>
      </div>

      <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Destination', `${roomLabel}${subgroupLabel ? ` · ${subgroupLabel}` : ''}`],
          ['Format', input.entryType === 'sop' ? 'SOP / checklist' : input.entryType === 'topic' ? 'CRM Gameplan topic' : 'Rich document'],
          ['Action', intendedAction],
          ['Length', `${result.wordCount} words · ${result.estimatedReadingMinutes} min read`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2">
            <dt className="text-[9.5px] font-bold uppercase tracking-[.08em] text-[color:var(--ink-3)]">{label}</dt>
            <dd className="mt-0.5 text-[11.5px] font-semibold text-[color:var(--ink-2)]">{value}</dd>
          </div>
        ))}
      </dl>

      {result.issues.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {result.issues.map(item => (
            <li key={item.code} className="flex gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2">
              <span className="mt-0.5 text-[11px]" style={{ color: item.severity === 'blocker' ? 'var(--rose-fg)' : 'var(--amber-fg)' }}>{item.severity === 'blocker' ? '●' : '▲'}</span>
              <span>
                <span className="block text-[11.5px] font-bold text-[color:var(--ink-2)]">{item.label}</span>
                <span className="mt-0.5 block text-[10.5px] leading-4 text-[color:var(--ink-3)]">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[11.5px] text-[color:var(--green-fg)]">No structural or completeness warnings were detected.</p>
      )}

      {(onConfirm || onClose) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onConfirm && (
            <button type="button" onClick={onConfirm} disabled={busy || !result.canProceed} className="rounded-full px-4 py-1.5 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: 'var(--grad)' }}>
              {busy ? 'Saving…' : confirmLabel ?? 'Continue'}
            </button>
          )}
          {onClose && <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-[color:var(--border)] px-3 py-1.5 text-[12px] text-[color:var(--ink-3)] disabled:opacity-50">Keep editing</button>}
        </div>
      )}
    </section>
  )
}
