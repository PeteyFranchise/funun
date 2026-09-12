import { summarizeAuthHealth, type AuthHealthData } from '@/lib/auth/health'

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

export function AuthHealthPanel({ data }: { data: AuthHealthData }) {
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

  const summary = summarizeAuthHealth(data.events)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Failures · 24 hours" value={summary.last24Hours} />
        <Metric label="Failures · 7 days" value={summary.last7Days} />
        <Metric label="Most common stage" value={readable(summary.topStage)} />
        <Metric label="Most common surface" value={readable(summary.topSurface)} />
      </div>

      <div className="overflow-hidden rounded-[18px] border border-[color:var(--border)] bg-[color:var(--panel)]">
        <div className="border-b border-[color:var(--border)] px-[18px] py-[15px]">
          <h2 className="text-[14px] font-bold text-[color:var(--ink)]">Failure patterns · 7 days</h2>
        </div>
        <div className="divide-y divide-[color:var(--border)]">
          {summary.byEvent.length === 0 ? (
            <p className="px-[18px] py-6 text-[12.5px] text-[color:var(--ink-3)]">
              No authentication failures recorded in the last seven days.
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
          <h2 className="text-[14px] font-bold text-[color:var(--ink)]">Recent diagnostic references</h2>
        </div>
        <div className="divide-y divide-[color:var(--border)]">
          {data.events.slice(0, 25).map(event => (
            <div key={event.correlation_id} className="grid gap-1 px-[18px] py-3 md:grid-cols-[180px_1fr_auto] md:items-center md:gap-4">
              <span className="font-mono text-[11.5px] text-[color:var(--ink)]">{event.correlation_id}</span>
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
