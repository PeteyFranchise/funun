// ─── Vendor Health (IT-room live sub-page, 260826-2qm) ──────────────────
// Staff-facing surface for the credential probes in
// lib/observability/vendor-health.ts. Self-guarded to the data-driven
// it-team room grant before any probe runs (fail closed, matching every
// other IT-room page). Force-dynamic so probes never fire during
// `npm run build` and a verdict is never frozen into the bundle.

import { requireRoomAccessPage } from '@/lib/playbook/rooms'
import { runVendorHealthChecks } from '@/lib/observability/vendor-health'
import { IT_SUBPAGES } from '@/lib/playbook/nav'
import { ItRoomTopBar } from '@/components/playbook/ItRoomTopBar'
import { VendorHealthPanel } from '@/components/playbook/VendorHealthPanel'

const CRUMB = IT_SUBPAGES.find((p) => p.slug === 'vendor-health')!.label

export const dynamic = 'force-dynamic'

export default async function VendorHealthPage() {
  // Guard runs BEFORE any probe fires — never widen scope.
  await requireRoomAccessPage('it-team')

  const { results, summary } = await runVendorHealthChecks()

  return (
    <div>
      <ItRoomTopBar crumb={CRUMB} showLiveChip />
      <div className="px-[28px] py-[20px]">
        <p className="mb-[18px] max-w-[720px] text-[12.5px] leading-relaxed text-[color:var(--ink-3)]">
          These verdicts come from a live, read-only call made when this page loaded — not a cached
          status page. No key value is ever shown here, because this page cannot show one. A green
          tick means the credential in THIS environment actually authenticated just now.
        </p>
        <VendorHealthPanel results={results} summary={summary} />
      </div>
    </div>
  )
}
