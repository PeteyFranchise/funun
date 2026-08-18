import { buildDigestTodayRow, type DashboardHealthStatus, type DigestDotColor } from '@/lib/playbook/digest'

// ─── Daily digest panel (33-07 Task 2, PLAYBOOK-08, D-08) ──────────────
// Exactly ONE row — today's live re-check, rendered by reusing
// buildDigestTodayRow() (lib/playbook/digest.ts). This panel never calls
// fanOutAlert() and never imports the alert fan-out module — it renders
// the same classification the cron already emails, it does not re-send
// that email (T-33-08). Server-renderable, no hooks.

// WR-01 hardening: 'lavdim' is a DigestDotColor label (lib/playbook/digest.ts),
// not a literal CSS custom property — it maps to the real --ink-3 token
// (see the mapping note in lib/playbook/markdown-components.tsx).
const DOT_HEX: Record<DigestDotColor, string> = {
  emerald: '#34D399',
  rose: '#F43F5E',
  lavdim: 'var(--ink-3)',
}

function splitLockedCopy(text: string): { lead: string; rest: string } {
  const match = text.match(/^\*\*(.+?)\*\*(.*)$/)
  if (!match) return { lead: '', rest: text }
  return { lead: match[1], rest: match[2] }
}

export function DigestPanel({ status }: { status: DashboardHealthStatus }) {
  const row = buildDigestTodayRow(status)
  const { lead, rest } = splitLockedCopy(row.text)

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[13.5px] font-bold text-[color:var(--ink)]">Daily digest</h2>
        <span className="text-[10px] uppercase tracking-[.14em] text-[color:var(--ink-3)]">cron · 06:00 UTC</span>
      </div>
      <div data-testid="digest-today-row" className="mt-3 flex items-start gap-2.5 border-t border-[color:var(--border)] pt-3">
        <span
          data-testid="digest-dot"
          className="mt-1 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: DOT_HEX[row.dot] }}
        />
        <p className="flex-1 text-[13px] text-[color:var(--ink-2)]">
          <strong className="font-semibold text-[color:var(--ink)]">{lead}</strong>
          {rest}
        </p>
        <span className="shrink-0 font-mono text-[11px] text-[color:var(--ink-3)]">{row.date}</span>
      </div>
      <p className="mt-3 px-3 py-2.5 text-[11.5px] text-[color:var(--ink-3)]">
        Full digest history arrives in v2 — this shows today&apos;s live check only; the cron&apos;s own email
        digest is the historical record until then.
      </p>
    </div>
  )
}
