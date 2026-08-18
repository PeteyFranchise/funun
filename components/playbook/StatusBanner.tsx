import type { DashboardHealthStatus } from '@/lib/playbook/digest'

// ─── Global status banner (33-07 Task 2, PLAYBOOK-07, D-07) ────────────
// Presentational, server-renderable (no hooks, no 'use client'). Three
// states per UI-SPEC "Global status banner": healthy (emerald, pulsing —
// "actively fine"), degraded (rose, steady — "attention needed"), and
// unknown/unreachable (same rose treatment as degraded — the dashboard
// imports checkHealth() directly rather than fetching, so an exception
// here is belt-and-suspenders, not the common path). A pulsing dot always
// reads as "fine"; a steady dot always reads as "needs attention" — never
// invert that semantic.

const RUNBOOK_HREF = '/admin/playbook/it/runbook'

const COPY: Record<DashboardHealthStatus, { title: string }> = {
  healthy: { title: 'All systems operational' },
  degraded: { title: 'Degraded — /api/health reporting an issue' },
  unknown: { title: 'Degraded — /api/health reporting an issue' },
}

export function StatusBanner({ status }: { status: DashboardHealthStatus }) {
  const isHealthy = status === 'healthy'
  const borderColor = isHealthy ? 'rgba(52,211,153,.35)' : 'rgba(244,63,94,.35)'
  const background = isHealthy
    ? 'linear-gradient(120deg,rgba(52,211,153,.10),rgba(129,140,248,.04))'
    : 'linear-gradient(120deg,rgba(244,63,94,.10),rgba(129,140,248,.04))'
  const dotColor = isHealthy ? '#34D399' : '#F43F5E'
  const { title } = COPY[status]

  return (
    <div
      data-status={status}
      className="rounded-2xl px-5 py-4"
      style={{ border: `1px solid ${borderColor}`, background }}
    >
      <div className="flex items-center gap-2.5">
        <span
          data-pulsing={isHealthy ? 'true' : 'false'}
          className={`h-[11px] w-[11px] shrink-0 rounded-full ${isHealthy ? 'animate-pulse' : ''}`}
          style={{ backgroundColor: dotColor }}
        />
        <p className="text-[15px] font-bold text-white">{title}</p>
      </div>
      {status === 'healthy' && (
        <p className="mt-1.5 text-[12.5px] text-[color:var(--lav)]">
          3/3 uptime monitors up · /api/health healthy · no open incidents
        </p>
      )}
      {status === 'degraded' && (
        <p className="mt-1.5 text-[12.5px] text-[color:var(--lav)]">
          /api/health → 503 · re-checked at page load · see the{' '}
          <a href={RUNBOOK_HREF} className="text-[color:var(--indigo)] hover:underline">
            Incident Runbook
          </a>
          .
        </p>
      )}
      {status === 'unknown' && (
        <p className="mt-1.5 text-[12.5px] text-[color:var(--lav)]">
          Health check unavailable — treat as degraded until confirmed
        </p>
      )}
    </div>
  )
}
