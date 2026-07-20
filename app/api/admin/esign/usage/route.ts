import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { monthlyEsignUsage, currentMonthRange } from '@/lib/esign/telemetry'
import { MONTHLY_NEW_RECIPIENT_CAP } from '@/lib/split-sheets/envelopes'

// ─── GET /api/admin/esign/usage ───────────────────────────────────────
// Current-month completed-envelope count and estimated spend, for the
// AM-3 $500/mo review trigger (ESIGN-14).
//
// READ-ONLY AND ADMIN-GATED (T-17-23). Spend telemetry reveals platform
// economics — how many documents Funūn is buying and what that costs — and
// nothing here is an artist-facing number.
//
// COUNTS THE LEDGER, NOT A COUNTER. esign_envelopes is the authoritative
// record: one row per mint attempt, flipped to 'completed' at the moment
// the provider's $0.20 is incurred. A separate counter table would be a
// second source of truth for the number the whole access model is metered
// against, and it would drift on the first webhook retry or hand
// correction (RESEARCH "Don't Hand-Roll").
//
// Filtered on completed_at, not created_at: an envelope minted on the 31st
// and signed on the 1st bills in the month it COMPLETED, which is the
// month the invoice will put it in.
export async function GET() {
  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const service = createServiceClient()
  const { startIso, endIso } = currentMonthRange(new Date())

  // head + exact count: Supabase returns the count without transferring a
  // single row, so this stays cheap as the ledger grows.
  const { count, error } = await service
    .from('esign_envelopes')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('completed_at', startIso)
    .lt('completed_at', endIso)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const usage = monthlyEsignUsage({ completedCount: count ?? 0 })

  return NextResponse.json({
    month: { startIso, endIso },
    ...usage,
    // Context for reading the spend number: the only binding limit in
    // Phase 17 is the per-initiator new-recipient cap. There is
    // deliberately no document ceiling — AM-3's trigger is the cost
    // monitor, and it prompts a human rather than throttling an artist.
    newRecipientCapPerInitiator: MONTHLY_NEW_RECIPIENT_CAP,
  })
}
