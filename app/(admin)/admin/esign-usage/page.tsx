export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { monthlyEsignUsage, currentMonthRange } from '@/lib/esign/telemetry'
import { MONTHLY_NEW_RECIPIENT_CAP } from '@/lib/split-sheets/envelopes'

// ─── /admin/esign-usage ───────────────────────────────────────────────
// The AM-3 trigger surface (ESIGN-14): how many split-sheet signatures
// completed this calendar month and what they are estimated to have cost.
//
// Deliberately read-only and boring. This exists so a human notices a
// month trending toward $500 and goes and looks at the real invoice — it
// is not a control surface, and nothing here throttles anything. The only
// binding limit in Phase 17 is the per-initiator new-recipient cap
// (AM-2c), shown for context because "spend is high" and "one account is
// blasting strangers" are different problems with different responses.
//
// Lives under app/(admin)/ rather than the plan's app/(artist)/ path: this
// is admin-only, and the (artist) group's layout carries artist navigation
// and no admin gate.

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

function monthLabel(startIso: string): string {
  return new Date(startIso).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default async function AdminEsignUsagePage() {
  // T-05-02: explicit per-page admin check — the layout redirect alone is
  // not relied upon as the authority decision (lib/admin/gate.ts).
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) redirect('/')

  const service = createServiceClient()
  const { startIso, endIso } = currentMonthRange(new Date())

  // Counts the authoritative ledger (esign_envelopes), not a counter
  // table. Filtered on completed_at because that is when the provider
  // bills — an envelope minted on the 31st and signed on the 1st belongs
  // to the later month's invoice.
  const { count } = await service
    .from('esign_envelopes')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('completed_at', startIso)
    .lt('completed_at', endIso)

  const usage = monthlyEsignUsage({ completedCount: count ?? 0 })
  const barWidth = Math.min(usage.percentOfTrigger, 100)

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-white">E-Sign Usage</h1>
      <p className="mt-1 text-[13px] text-white/50">
        {monthLabel(startIso)} — completed split-sheet signatures and estimated spend.
      </p>

      <div className="mt-6 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
            Completed this month
          </p>
          <p className="mt-2 text-3xl font-bold text-white">{usage.completedCount}</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
            Estimated spend
          </p>
          <p className="mt-2 text-3xl font-bold text-white">{money(usage.estimatedSpendUsd)}</p>
          <p className="mt-1 text-[11px] text-white/40">
            at {money(usage.perDocRate)} per completed document
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
            AM-3 review trigger
          </p>
          <p className="mt-2 text-3xl font-bold text-white">{money(usage.triggerUsd)}</p>
          <p className="mt-1 text-[11px] text-white/40">{usage.percentOfTrigger}% reached</p>
        </div>
      </div>

      <div className="mt-6 max-w-3xl">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full ${usage.triggerReached ? 'bg-red-400' : 'bg-lav'}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        {usage.triggerReached ? (
          <p className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-[13px] text-red-200">
            This month has reached the {money(usage.triggerUsd)} review trigger. Nothing is
            throttled — check the provider invoice and revisit pricing.
          </p>
        ) : null}
      </div>

      <p className="mt-6 max-w-3xl text-[12px] leading-relaxed text-white/40">
        Estimated, not billed. Funūn never sees the provider invoice; this multiplies the
        completed-envelope count against the published per-document rate. Voided envelopes are
        excluded because an archived submission never reaches <code>completed</code> and never
        bills. There is no document ceiling by design — the only binding limit is{' '}
        {MONTHLY_NEW_RECIPIENT_CAP} new recipients per initiator per month (AM-2c).
      </p>
    </div>
  )
}
