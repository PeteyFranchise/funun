import type { VendorHealthState, VendorHealthSummary, VendorProbeResult } from '@/lib/observability/vendor-health'
import { VendorHealthRecheck } from './VendorHealthRecheck'

// ─── Vendor Health panel (260826-2qm) ───────────────────────────────────
// Server Component — reuses VendorsGrid's panel chrome (rounded bordered
// --panel shell, bordered header row, monospace right-hand chip) so this
// reads as part of the same IT room, not a bolted-on surface. Renders one
// row per probe result. Three visually distinct states so `not-configured`
// can NEVER be misread as a failure: green for ok, the mockup rose
// #F43F5E for failed, a muted --ink-3 treatment for not-configured.
//
// This component renders only vendor labels, env var NAMES (the name is
// not a secret; the value is), a state indicator, and the probe's detail
// string — never a credential value.

function StateIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="currentColor" />
    </svg>
  )
}

const STATE_LABEL: Record<VendorHealthState, string> = {
  ok: 'OK',
  failed: 'FAILED',
  'not-configured': 'NOT CONFIGURED',
}

function StateBadge({ state }: { state: VendorHealthState }) {
  const colorClass =
    state === 'ok'
      ? 'text-[color:var(--green-fg)]'
      : state === 'failed'
        ? 'text-[#F43F5E]'
        : 'text-[color:var(--ink-3)]'

  return (
    <span className={`inline-flex items-center gap-[6px] text-[11px] font-bold uppercase tracking-[.05em] ${colorClass}`}>
      <span className={colorClass}>
        <StateIcon />
      </span>
      {STATE_LABEL[state]}
    </span>
  )
}

function VendorRow({ result }: { result: VendorProbeResult }) {
  return (
    <div
      data-testid={`vendor-health-row-${result.id}`}
      className="flex flex-col gap-[6px] rounded-[12px] border border-[color:var(--border)] bg-[color:var(--panel-2)] px-[14px] py-[12px] sm:flex-row sm:items-center sm:gap-[14px]"
    >
      <div className="min-w-0 flex-none sm:w-[180px]">
        <div className="text-[13px] font-semibold text-[color:var(--ink)]">{result.label}</div>
        <div className="font-mono text-[10.5px] text-[color:var(--ink-3)]">{result.envVar}</div>
      </div>
      <div className="flex-none sm:w-[130px]">
        <StateBadge state={result.state} />
      </div>
      <div className="min-w-0 flex-1 text-[12px] text-[color:var(--ink-2)]">{result.detail}</div>
      {result.state === 'not-configured' && (
        <div className="text-[10.5px] italic text-[color:var(--ink-3)] sm:ml-auto sm:flex-none">
          Unset optional value — expected, not broken.
        </div>
      )}
    </div>
  )
}

function SummaryChip({ summary }: { summary: VendorHealthSummary }) {
  return (
    <span className="ml-auto rounded-[6px] border border-[color:var(--border)] px-[7px] py-[2px] font-mono text-[10.5px] text-[color:var(--ink-3)]">
      {summary.ok} ok · {summary.failed} failed · {summary.notConfigured} not configured
    </span>
  )
}

export function VendorHealthPanel({
  results,
  summary,
}: {
  results: VendorProbeResult[]
  summary: VendorHealthSummary
}) {
  return (
    <div className="mb-[18px] overflow-hidden rounded-[18px] border border-[color:var(--border)] bg-[color:var(--panel)]">
      <div className="flex flex-wrap items-center gap-[10px] border-b border-[color:var(--border)] px-[18px] py-[15px]">
        <h2 className="m-0 text-[14px] font-bold text-[color:var(--ink)]">Vendor Health</h2>
        <SummaryChip summary={summary} />
        <VendorHealthRecheck />
      </div>
      <div className="flex flex-col gap-2 p-3">
        {results.map(result => (
          <VendorRow key={result.id} result={result} />
        ))}
      </div>
      <div className="px-3 pb-3 text-[11.5px] text-[color:var(--ink-3)]">
        Every row is a live, read-only credential probe made when this page loaded. No key value is
        ever shown — a green tick means the credential in THIS environment actually authenticated
        just now.
      </div>
    </div>
  )
}
