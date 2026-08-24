'use client'

import type { OnboardingTask } from '@/lib/client-partners/onboarding'

// ─── OnboardingTasksPanel (D-07 / RESEARCH Open Q2) ─────────────────────────
// Surfaces the signed-in staff member's open onboarding tasks — the D-07
// auto-created handoff task, one per Client Partner they've been assigned —
// on their My Client Partners view. Read-only display for 31.1 (checking
// off/completing an item is out of this plan's scope); receives only data
// (OnboardingTask[]) from the RSC page, no function props.

export type OnboardingTasksPanelProps = {
  tasks: OnboardingTask[]
}

export function OnboardingTasksPanel({ tasks }: OnboardingTasksPanelProps) {
  if (tasks.length === 0) return null

  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.1em] text-[color:var(--ink-3)]">
        Your handoff tasks
        <span
          className="rounded-full border px-2 py-0.5 text-[10px]"
          style={{
            color: 'var(--indigo)',
            background: 'color-mix(in srgb, var(--indigo) 14%, transparent)',
            borderColor: 'color-mix(in srgb, var(--indigo) 35%, transparent)',
          }}
        >
          {tasks.length}
        </span>
      </div>
      {tasks.map(task => (
        <div
          key={task.id}
          className="rounded-2xl border p-4"
          style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}
        >
          <div className="text-[14px] font-bold text-[color:var(--ink)]">{task.title}</div>
          {task.handoff_note && (
            <p className="mt-1 text-[12.5px] italic text-[color:var(--ink-2)]">
              &quot;{task.handoff_note}&quot;
            </p>
          )}
          <ul className="mt-3 flex flex-col gap-1.5">
            {task.checklist.map(item => (
              <li key={item.id} className="flex items-center gap-2 text-[12.5px] text-[color:var(--ink-2)]">
                <span
                  aria-hidden
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[9px]"
                  style={{
                    borderColor: 'var(--border-2)',
                    color: item.done ? 'var(--green-fg)' : 'transparent',
                  }}
                >
                  {item.done ? '✓' : ''}
                </span>
                <span className={item.done ? 'text-[color:var(--ink-3)] line-through' : ''}>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
