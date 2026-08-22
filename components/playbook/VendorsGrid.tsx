// ─── Vendors panel (33-08 Task 1, PLAYBOOK-10) ──────────────────────────
// Server Component — 10 live deep-link cells (GitHub deliberately excluded,
// it's deploy-time-only per UI-SPEC "Vendors panel"). Renders inside the
// admin `.fncon` wrapper (app/(admin)/layout.tsx), so this reuses that
// wrapper's actual token names (--panel/--panel-2/--ink/--ink-2/--ink-3/
// --border/--indigo/--fuchsia — verified live against
// components/admin/console-theme.ts and components/playbook/Rail2.tsx),
// not the mockups' literal --card/--hair/--lavdim names, which are not
// defined anywhere the Playbook actually renders (see deferred-items.md).
// Rose is the one mockup-literal hex UI-SPEC explicitly calls out to use
// directly (`#F43F5E`, not the console's softer `--rose-fg`).

type VendorDot = 'crit' | 'norm'

type Vendor = {
  name: string
  fn: string
  href: string
  dot: VendorDot
  // Set only for the two VENDOR-DIRECTORY.md "[confirm]" open gaps (DNS
  // registrar, DocuSeal status URL) — never a fabricated external URL;
  // the href instead points at the Vendor Directory doc page itself,
  // which carries the same caveat verbatim.
  unconfirmed?: boolean
}

const VENDORS: Vendor[] = [
  { name: 'Vercel', fn: 'Hosting · functions · CDN', href: 'https://vercel.com/dashboard', dot: 'crit' },
  { name: 'Supabase', fn: 'DB · Auth · Storage', href: 'https://supabase.com/dashboard', dot: 'crit' },
  {
    name: 'Squarespace (DNS)',
    fn: 'funun.studio DNS · domain registrar',
    href: 'https://account.squarespace.com/domains',
    dot: 'crit',
  },
  { name: 'Sentry', fn: 'Error monitoring', href: 'https://sentry.io', dot: 'norm' },
  { name: 'Better Stack', fn: 'Uptime + status page', href: 'https://betterstack.com', dot: 'norm' },
  { name: 'Stripe', fn: 'Payments', href: 'https://dashboard.stripe.com', dot: 'norm' },
  { name: 'Resend', fn: 'Transactional email', href: 'https://resend.com', dot: 'norm' },
  { name: 'Anthropic', fn: 'AI tools', href: 'https://console.anthropic.com', dot: 'norm' },
  {
    name: 'DocuSeal',
    fn: 'E-signature · confirm status URL',
    href: '/admin/playbook/it/vendor-directory',
    dot: 'norm',
    unconfirmed: true,
  },
  {
    name: 'Google Places',
    fn: 'Address autocomplete',
    href: 'https://console.cloud.google.com',
    dot: 'norm',
  },
]

function VendorIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M7 9.5h6M7 13h10M7 16h7" />
    </svg>
  )
}

function GoIcon() {
  return (
    <svg
      width="15"
      height="15"
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

export function VendorsGrid() {
  return (
    <div className="mb-[18px] overflow-hidden rounded-[18px] border border-[color:var(--border)] bg-[color:var(--panel)]">
      <div className="flex items-center gap-[10px] border-b border-[color:var(--border)] px-[18px] py-[15px]">
        <span className="text-[color:var(--ink-2)]">
          <VendorIcon />
        </span>
        <h2 className="m-0 text-[14px] font-bold text-[color:var(--ink)]">Vendors</h2>
        <span className="ml-auto rounded-[6px] border border-[color:var(--border)] px-[7px] py-[2px] font-mono text-[10.5px] text-[color:var(--ink-3)]">
          directory + deep links
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
        {VENDORS.map((vendor) => (
          <a
            key={vendor.name}
            href={vendor.href}
            target={vendor.unconfirmed ? undefined : '_blank'}
            rel={vendor.unconfirmed ? undefined : 'noopener noreferrer'}
            data-testid={`vendor-cell-${vendor.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            className="flex items-center gap-[10px] rounded-[12px] border border-[color:var(--border)] bg-[color:var(--panel-2)] px-[11px] py-[10px]"
          >
            <span
              className={`h-2 w-2 flex-none rounded-full ${vendor.dot === 'crit' ? 'bg-[#F43F5E]' : 'bg-[color:var(--ink-3)]'}`}
            />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[color:var(--ink)]">{vendor.name}</div>
              <div className="text-[10.5px] text-[color:var(--ink-3)]">{vendor.fn}</div>
            </div>
            <span className="ml-auto flex-none text-[color:var(--indigo)]">
              <GoIcon />
            </span>
          </a>
        ))}
      </div>
      <div className="px-3 pb-3 text-[11.5px] text-[color:var(--ink-3)]">
        🔴 = site-critical (down = full outage). Per-vendor{' '}
        <b className="font-bold text-[color:var(--fuchsia)]">live status dots arrive in v2</b> (their status
        APIs); for now each tile deep-links to that vendor&apos;s own dashboard + status page.
      </div>
    </div>
  )
}
