import { requireStaffPage } from '@/lib/admin/gate'
import { getDashboardHealth } from '@/lib/playbook/digest'
import { ItRoomTopBar } from '@/components/playbook/ItRoomTopBar'
import { StatusBanner } from '@/components/playbook/StatusBanner'
import { DigestPanel } from '@/components/playbook/DigestPanel'
import { ThresholdsPanel } from '@/components/playbook/ThresholdsPanel'
import { VendorsGrid } from '@/components/playbook/VendorsGrid'
import { QuickLinks } from '@/components/playbook/QuickLinks'

// ─── Monitoring Dashboard — the IT room's index page (33-08 Task 2) ────
// PLAYBOOK-04/07/08/09/10. Assembles the 33-07 live-signal core
// (StatusBanner/DigestPanel/getDashboardHealth) with this plan's reference
// panels (Uptime link-out, ThresholdsPanel, VendorsGrid, QuickLinks) under
// its own D-02 inline guard, which runs FIRST — before getDashboardHealth()
// re-checks /api/health in-process (never a self-HTTP call — T-33-07). The
// guard never widens to ALL_STAFF_ROLES (D-02): only leadership + it reach
// this page; every other staff role is redirect()'d inside
// requireStaffPage() itself and never sees any of this render.

const BETTER_STACK_STATUS_URL = 'https://funun.betteruptime.com'

export default async function MonitoringDashboardPage() {
  // Fail-closed self-guard — must run before any health check/render (D-02).
  await requireStaffPage(['leadership', 'it'])

  const health = await getDashboardHealth()
  const isHealthy = health === 'healthy'

  return (
    <>
      <ItRoomTopBar crumb="Monitoring Dashboard" showLiveChip />
      <div className="mx-auto max-w-[900px] px-[28px] pb-[60px] pt-[22px]">
        <h1 className="mb-5 text-[24px] font-extrabold tracking-[-.02em] text-[color:var(--ink)]">
          Monitoring Dashboard
        </h1>

        <div className="mb-[22px]">
          <StatusBanner status={health} />
        </div>

        {/* Stat tiles */}
        <div className="mb-[26px] grid grid-cols-2 gap-[14px] lg:grid-cols-4">
          <Tile stripeColor={isHealthy ? '#34D399' : '#F43F5E'} label="App Health">
            <div className="mt-2 text-[26px] font-extrabold leading-none text-[color:var(--ink)]">
              {isHealthy ? 'Healthy' : 'Degraded'}
            </div>
            <div className={`mt-[7px] text-[12px] ${isHealthy ? 'text-[#34D399]' : 'text-[#F43F5E]'}`}>
              /api/health {isHealthy ? '→ 200' : '→ 503'}
            </div>
          </Tile>

          <Tile stripeColor="var(--indigo)" label="Uptime">
            <a
              href={BETTER_STACK_STATUS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block text-[15px] font-bold text-[color:var(--indigo)]"
            >
              View live status →
            </a>
            <div className="mt-[7px] text-[11.5px] text-[color:var(--ink-3)]">Better Stack · opens in new tab</div>
          </Tile>

          <Tile stripeColor="#F4C77B" label="Spend this mo.">
            <div className="mt-2 flex items-baseline gap-[7px] text-[26px] font-extrabold leading-none text-[color:var(--ink)]">
              $—<span className="text-[13px] font-semibold text-[color:var(--ink-3)]">/ $200 cap</span>
            </div>
            <div className="mt-[7px] flex items-center gap-1.5 text-[12px] text-[color:var(--ink-3)]">
              notify-only ·
              <span className="rounded-full border border-[rgba(217,70,239,.32)] bg-[rgba(217,70,239,.10)] px-[7px] py-[1px] text-[9px] font-bold uppercase tracking-[.08em] text-[color:var(--fuchsia)]">
                v2 live figure
              </span>
            </div>
          </Tile>

          <Tile stripeColor="var(--indigo)" label="Open incidents">
            <div className="mt-2 text-[26px] font-extrabold leading-none text-[color:var(--ink)]">0</div>
            <div className="mt-[7px] text-[12px] text-[color:var(--ink-3)]">SEV-1..4 · none active</div>
          </Tile>
        </div>

        {/* Uptime panel — structural replacement (D-07): no per-route rows,
            no sparklines, no fabricated %s. Paired with the real Thresholds
            panel in the same 2-up row per observability-dashboard.html. */}
        <div className="mb-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-[1.35fr_1fr]">
          <div className="overflow-hidden rounded-[18px] border border-[color:var(--border)] bg-[color:var(--panel)]">
            <div className="flex items-center gap-[10px] border-b border-[color:var(--border)] px-[18px] py-[15px]">
              <span className="text-[#34D399]">
                <PulseIcon size={17} />
              </span>
              <h2 className="m-0 text-[14px] font-bold text-[color:var(--ink)]">Uptime — production routes</h2>
              <span className="ml-auto rounded-[6px] border border-[color:var(--border)] px-[7px] py-[2px] font-mono text-[10.5px] text-[color:var(--ink-3)]">
                Better Stack
              </span>
            </div>
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <span className="text-[color:var(--indigo)]">
                <PulseIcon size={30} />
              </span>
              <p className="text-[14px] font-semibold text-[color:var(--ink)]">No live per-route data in v1</p>
              <p className="max-w-[44ch] text-[12.5px] text-[color:var(--ink-3)]">
                Uptime is monitored externally by Better Stack — view the live status page for real-time numbers
                across all monitored routes.
              </p>
              <a
                href={BETTER_STACK_STATUS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 rounded-[13px] border border-[color:var(--border)] px-4 py-2.5 text-[13px] font-semibold text-[color:var(--indigo)] transition hover:border-[color:var(--border-2)] hover:-translate-y-px"
              >
                View live status →
              </a>
            </div>
          </div>

          <ThresholdsPanel />
        </div>

        <VendorsGrid />
        <DigestPanel status={health} />
        <QuickLinks />
      </div>
    </>
  )
}

function Tile({
  stripeColor,
  label,
  children,
}: {
  stripeColor: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-[16px_17px]">
      <span className="absolute bottom-0 left-0 top-0 w-[3px]" style={{ background: stripeColor }} />
      <div className="text-[11.5px] font-bold uppercase tracking-[.03em] text-[color:var(--ink-3)]">{label}</div>
      {children}
    </div>
  )
}

function PulseIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12h4l2-6 4 12 2-6h6" />
    </svg>
  )
}
