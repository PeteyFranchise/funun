// ─── Shared page topbar ──────────────────────────────────────────────
// Title + subtitle on the left; right-aligned actions (search, buttons)
// passed as children. Pairs with the .body content region below it.
export function Topbar({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-none items-center gap-5 border-b border-hair px-9 pb-[22px] pt-[26px]">
      <div className="flex-1">
        <h1 className="text-[27px] font-extrabold tracking-[-.01em] text-white">{title}</h1>
        {subtitle && <p className="mt-[5px] text-[14px] font-medium text-lavdim">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// Static search affordance matching the design (visual only for now).
export function TopbarSearch({ placeholder = 'Search' }: { placeholder?: string }) {
  return (
    <div className="flex w-[280px] items-center gap-[10px] rounded-[10px] border border-hair bg-card px-[14px] py-[11px] text-[14px] text-lavdim">
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" strokeLinecap="round" />
      </svg>
      {placeholder}
    </div>
  )
}

// Primary gradient CTA.
export function TopbarButton({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-[9px] rounded-[10px] bg-grad px-5 py-3 text-[15px] font-bold text-white shadow-cta">
      {children}
    </span>
  )
}
