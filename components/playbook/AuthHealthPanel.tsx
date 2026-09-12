'use client'

import { useMemo, useState } from 'react'
import {
  filterAuthHealthEvents,
  summarizeAuthHealth,
  type AuthHealthData,
  type AuthHealthFilters,
} from '@/lib/auth/health'

const EVENT_LABELS: Record<string, string> = {
  sign_in_failed: 'Sign-in failed',
  signup_failed: 'Signup failed',
  invitation_claim_failed: 'Invitation claim failed',
  recovery_request_failed: 'Recovery request failed',
  recovery_verify_failed: 'Recovery verification failed',
  password_update_failed: 'Password update failed',
  signout_failed: 'Sign-out failed',
  account_switch_signout_failed: 'Account switch cleanup failed',
  callback_client_failed: 'Callback initialization failed',
  callback_exchange_failed: 'Callback exchange failed',
}

function readable(value: string) {
  return value.replaceAll('_', ' ')
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[14px] border border-[color:var(--border)] bg-[color:var(--panel-2)] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[.08em] text-[color:var(--ink-3)]">
        {label}
      </div>
      <div className="mt-2 text-[22px] font-bold capitalize text-[color:var(--ink)]">{value}</div>
    </div>
  )
}

const controlClass =
  'rounded-[10px] border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] text-[color:var(--ink)] outline-none focus:border-[color:var(--lav)]'

export function AuthHealthPanel({ data }: { data: AuthHealthData }) {
  const [filters, setFilters] = useState<AuthHealthFilters>({
    period: '7d',
    eventCode: 'all',
    workspaceIntent: 'all',
  })
  const [copiedReference, setCopiedReference] = useState<string | null>(null)
  const [copyFailed, setCopyFailed] = useState<string | null>(null)
  const now = useMemo(() => Date.now(), [])
  const eventCodes = useMemo(
    () => [...new Set(data.events.map(event => event.event_code))].sort(),
    [data.events]
  )
  const filteredEvents = useMemo(
    () => filterAuthHealthEvents(data.events, filters, now),
    [data.events, filters, now]
  )

  if (!data.activated) {
    return (
      <div className="rounded-[18px] border border-amber-400/25 bg-amber-400/[.07] p-5">
        <h2 className="text-[14px] font-bold text-amber-100">Diagnostics are not activated</h2>
        <p className="mt-2 max-w-[720px] text-[12.5px] leading-relaxed text-amber-100/70">
          The application is ready, but the human-gated database migration has not been applied.
          Authentication continues normally and no diagnostic events are stored.
        </p>
      </div>
    )
  }

  const summary = summarizeAuthHealth(filteredEvents, now)

  function updateFilter<Key extends keyof AuthHealthFilters>(
    key: Key,
    value: AuthHealthFilters[Key]
  ) {
    setFilters(current => ({ ...current, [key]: value }))
  }

  async function copyReference(correlationId: string) {
    try {
      await navigator.clipboard.writeText(correlationId)
      setCopiedReference(correlationId)
      setCopyFailed(null)
    } catch {
      setCopiedReference(null)
      setCopyFailed(correlationId)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-[18px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
        <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-[color:var(--ink-3)]">
          Time period
          <select
            className={controlClass}
            value={filters.period}
            onChange={event => updateFilter('period', event.target.value as AuthHealthFilters['period'])}
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-[color:var(--ink-3)]">
          Failure type
          <select
            className={controlClass}
            value={filters.eventCode}
            onChange={event => updateFilter('eventCode', event.target.value)}
          >
            <option value="all">All failures</option>
            {eventCodes.map(eventCode => (
              <option key={eventCode} value={eventCode}>
                {EVENT_LABELS[eventCode] ?? readable(eventCode)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-[color:var(--ink-3)]">
          Workspace intent
          <select
            className={controlClass}
            value={filters.workspaceIntent ?? 'none'}
            onChange={event => updateFilter(
              'workspaceIntent',
              event.target.value === 'none'
                ? null
                : event.target.value as Exclude<AuthHealthFilters['workspaceIntent'], null>
            )}
          >
            <option value="all">All workspaces</option>
            <option value="personal">Personal</option>
            <option value="team">Team</option>
            <option value="none">No workspace intent</option>
          </select>
        </label>
        <button
          type="button"
          className="ml-auto rounded-[10px] px-3 py-2 text-[12px] font-semibold text-[color:var(--lav)] hover:bg-white/[.04]"
          onClick={() => setFilters({ period: '7d', eventCode: 'all', workspaceIntent: 'all' })}
        >
          Reset filters
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Matching failures" value={filteredEvents.length} />
        <Metric label="Failures · 24 hours" value={summary.last24Hours} />
        <Metric label="Most common stage" value={readable(summary.topStage)} />
        <Metric label="Most common surface" value={readable(summary.topSurface)} />
      </div>

      <div className="overflow-hidden rounded-[18px] border border-[color:var(--border)] bg-[color:var(--panel)]">
        <div className="border-b border-[color:var(--border)] px-[18px] py-[15px]">
          <h2 className="text-[14px] font-bold text-[color:var(--ink)]">Failure patterns · filtered</h2>
        </div>
        <div className="divide-y divide-[color:var(--border)]">
          {summary.byEvent.length === 0 ? (
            <p className="px-[18px] py-6 text-[12.5px] text-[color:var(--ink-3)]">
              No authentication failures match these filters.
            </p>
          ) : summary.byEvent.map(([eventCode, count]) => (
            <div key={eventCode} className="flex items-center justify-between gap-4 px-[18px] py-3">
              <span className="text-[12.5px] text-[color:var(--ink-2)]">
                {EVENT_LABELS[eventCode] ?? readable(eventCode)}
              </span>
              <span className="font-mono text-[12px] font-semibold text-[color:var(--ink)]">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[18px] border border-[color:var(--border)] bg-[color:var(--panel)]">
        <div className="border-b border-[color:var(--border)] px-[18px] py-[15px]">
          <h2 className="text-[14px] font-bold text-[color:var(--ink)]">Diagnostic references · filtered</h2>
          <p className="mt-1 text-[11.5px] text-[color:var(--ink-3)]">
            Copy only the privacy-safe reference when helping a member.
          </p>
        </div>
        <div className="divide-y divide-[color:var(--border)]">
          {filteredEvents.length === 0 ? (
            <p className="px-[18px] py-6 text-[12.5px] text-[color:var(--ink-3)]">
              No diagnostic references match these filters.
            </p>
          ) : filteredEvents.slice(0, 25).map(event => (
            <div key={event.correlation_id} className="grid gap-2 px-[18px] py-3 lg:grid-cols-[210px_1fr_auto] lg:items-center lg:gap-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11.5px] text-[color:var(--ink)]">{event.correlation_id}</span>
                <button
                  type="button"
                  className="rounded-[8px] border border-[color:var(--border)] px-2 py-1 text-[10.5px] font-semibold text-[color:var(--lav)] hover:bg-white/[.04]"
                  onClick={() => void copyReference(event.correlation_id)}
                  aria-label={`Copy diagnostic reference ${event.correlation_id}`}
                >
                  {copiedReference === event.correlation_id
                    ? 'Copied'
                    : copyFailed === event.correlation_id ? 'Copy failed' : 'Copy'}
                </button>
              </div>
              <span className="text-[12px] text-[color:var(--ink-2)]">
                {EVENT_LABELS[event.event_code] ?? readable(event.event_code)} · {readable(event.surface)} · {event.workspace_intent ?? 'no workspace intent'} · {event.runtime}
              </span>
              <time className="text-[11px] text-[color:var(--ink-3)]" dateTime={event.created_at}>
                {new Date(event.created_at).toLocaleString('en-US', { timeZone: 'UTC' })} UTC
              </time>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
