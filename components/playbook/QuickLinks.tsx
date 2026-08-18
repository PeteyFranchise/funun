// ─── Quick links ("Jump to") panel (33-08 Task 1, PLAYBOOK-10) ──────────
// Server Component — 4 static cards, 3 internal deep-links + 1 external
// (the Better Stack status page). Same `.fncon` token convention as
// VendorsGrid.tsx (see that file's header comment) — --panel-2/--ink/
// --ink-2/--ink-3/--border/--indigo, no vendor keys/tokens anywhere.

type QuickLink = {
  title: string
  subtitle: string
  href: string
  external?: boolean
  icon: 'shield' | 'vendor' | 'pulse' | 'book'
}

const LINKS: QuickLink[] = [
  {
    title: 'Incident Runbook',
    subtitle: 'triage → rollback → review',
    href: '/admin/playbook/it/runbook',
    icon: 'shield',
  },
  {
    title: 'Vendor Directory',
    subtitle: 'where to look on failure',
    href: '/admin/playbook/it/vendor-directory',
    icon: 'vendor',
  },
  {
    title: 'Status page',
    subtitle: 'funun.betteruptime.com',
    href: 'https://funun.betteruptime.com',
    external: true,
    icon: 'pulse',
  },
  {
    title: 'Operating Rhythm',
    subtitle: 'daily · weekly · monthly',
    href: '/admin/playbook/it/operating-rhythm',
    icon: 'book',
  },
]

function QuickLinkIcon({ icon }: { icon: QuickLink['icon'] }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (icon === 'shield') {
    return (
      <svg {...common}>
        <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    )
  }
  if (icon === 'vendor') {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="M7 9.5h6M7 13h10M7 16h7" />
      </svg>
    )
  }
  if (icon === 'pulse') {
    return (
      <svg {...common}>
        <path d="M3 12h4l2-6 4 12 2-6h6" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M5 5a2 2 0 0 1 2-2h11v16H7a2 2 0 0 0-2 2z" />
      <path d="M5 19a2 2 0 0 1 2-2h11" />
    </svg>
  )
}

function GoArrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 17L17 7M9 7h8v8" />
    </svg>
  )
}

export function QuickLinks() {
  return (
    <div className="mt-[26px]">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-[.15em] text-[color:var(--ink-3)]">
        Jump to
      </div>
      <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-4">
        {LINKS.map((link) => (
          <a
            key={link.title}
            href={link.href}
            target={link.external ? '_blank' : undefined}
            rel={link.external ? 'noopener noreferrer' : undefined}
            className="flex items-center gap-[11px] rounded-[13px] border border-[color:var(--border)] bg-[color:var(--panel)] px-[15px] py-[13px] transition hover:border-[color:var(--border-2)] hover:-translate-y-px"
          >
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-[color:var(--panel-2)] text-[color:var(--indigo)]">
              <QuickLinkIcon icon={link.icon} />
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[color:var(--ink)]">{link.title}</div>
              <div className="truncate text-[11px] text-[color:var(--ink-3)]">{link.subtitle}</div>
            </div>
            <span className="ml-auto flex-none text-[color:var(--ink-3)]">
              <GoArrow />
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}
