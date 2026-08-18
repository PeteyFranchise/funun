// Server Component — the shared IT-room top bar (33-04 Task 3). Renders
// identically on all 5 IT-room pages (the 4 doc pages included): D-02
// gates the entire room, so the access chip belongs on every page in it,
// not just the dashboard. This is a deliberate extension beyond
// playbook-it-team-room.html's literal markup, which omits the chip row
// (33-UI-SPEC.md "Top bar (.ctop)").

export function ItRoomTopBar({
  crumb,
  showLiveChip = false,
}: {
  crumb: string
  showLiveChip?: boolean
}) {
  return (
    <div
      className="sticky top-0 z-[5] flex flex-wrap items-center gap-3 border-b border-[color:var(--border)] px-[28px] py-4 backdrop-blur-[8px]"
      style={{ background: 'rgba(10,10,15,.82)' }}
    >
      <span className="font-mono text-[12px] text-[color:var(--ink-3)]">
        The Playbook / IT Team /{' '}
        <b className="font-semibold text-[color:var(--ink-2)]">{crumb}</b>
      </span>

      <div className="ml-auto flex items-center gap-3">
        {/* Access chip — every gated page in the IT room, always (D-02). */}
        <span
          className="inline-flex items-center gap-1.5 rounded-[20px] border border-[rgba(129,140,248,.30)] px-[10px] py-[5px] text-[11px] font-bold text-[color:var(--indigo)]"
          style={{ background: 'rgba(129,140,248,.10)' }}
        >
          🔒 IT + Leadership
        </span>

        {/* Live chip — dashboard page only (D-07: honest, health-driven
            surfaces only), the caller passes showLiveChip. */}
        {showLiveChip && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.05em] text-[color:var(--green-fg)]">
            <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[color:var(--green-fg)] shadow-[0_0_8px_var(--green-fg)]" />
            Live
          </span>
        )}
      </div>
    </div>
  )
}
