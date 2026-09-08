import { compareMarkdownLines } from '@/lib/playbook/diff'

export function MarkdownRevisionDiff({
  published,
  proposed,
  leftLabel = 'Published',
  rightLabel = 'Proposed',
  summaryLabel = 'Compare published and proposed text',
}: {
  published: string
  proposed: string
  leftLabel?: string
  rightLabel?: string
  summaryLabel?: string
}) {
  const rows = compareMarkdownLines(published, proposed)
  const changed = rows.filter(row => row.kind === 'changed').length

  return (
    <details className="mt-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
      <summary className="cursor-pointer px-3 py-2 text-[12px] font-bold text-[color:var(--indigo)]">
        {summaryLabel} · {changed} changed row{changed === 1 ? '' : 's'}
      </summary>
      <div className="max-h-[520px] overflow-auto border-t border-[color:var(--border)] font-mono text-[11px]">
        <div className="sticky top-0 grid grid-cols-2 border-b border-[color:var(--border)] bg-[color:var(--panel-2)] font-sans text-[10px] font-bold uppercase tracking-[.06em] text-[color:var(--ink-3)]">
          <p className="px-3 py-2">{leftLabel}</p>
          <p className="border-l border-[color:var(--border)] px-3 py-2">{rightLabel}</p>
        </div>
        {rows.map((row, index) => (
          <div
            key={`${row.left?.line ?? 'x'}-${row.right?.line ?? 'x'}-${index}`}
            className={`grid grid-cols-2 border-b border-[color:var(--border)] last:border-0 ${
              row.kind === 'changed' ? 'bg-amber-400/[0.06]' : ''
            }`}
          >
            <p className="min-w-0 whitespace-pre-wrap break-words px-3 py-1.5 text-[color:var(--ink-2)]">
              <span className="mr-2 select-none text-[color:var(--ink-3)]">{row.left?.line ?? '–'}</span>
              {row.left?.text ?? ''}
            </p>
            <p className="min-w-0 whitespace-pre-wrap break-words border-l border-[color:var(--border)] px-3 py-1.5 text-[color:var(--ink-2)]">
              <span className="mr-2 select-none text-[color:var(--ink-3)]">{row.right?.line ?? '–'}</span>
              {row.right?.text ?? ''}
            </p>
          </div>
        ))}
      </div>
    </details>
  )
}
