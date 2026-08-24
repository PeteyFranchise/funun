import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Executed/signed-license stamping (D-31.1-09) ──────────────────────────
// The relationship-health color clock (lib/client-partners/signals.ts's
// lastExecutedLicenseAt) reads license_requests.executed_at — stamped ONLY
// by this explicit executed/signed action, never by the closed_won
// deal-stage transition (app/api/admin/deals/[id]/route.ts's PATCH never
// touches this column). Forward-compatible with lib/esign/provider.ts's
// vendor-agnostic EsignState contract: whichever surface eventually detects
// e-sign completion (today: a manual "mark executed" action; later: a
// Dropbox Sign webhook) calls this same helper.

export type StampLicenseExecutedResult = {
  executedAt: string
  /** True when a PRIOR call had already stamped this deal — this call was a no-op (idempotent, D-31.1-09 behavior contract). */
  alreadyExecuted: boolean
}

/**
 * Sets license_requests.executed_at to `at` ONLY when it is currently null
 * — idempotent: a second call never moves the date. The write itself
 * carries a `WHERE executed_at IS NULL` predicate (not just a pre-read
 * check), so two concurrent calls can stamp at most once between them
 * (the loser's UPDATE matches zero rows and falls back to reading the
 * winner's value). Returns null when the deal id does not exist.
 */
export async function stampLicenseExecuted(
  service: SupabaseClient,
  licenseRequestId: string,
  at: string = new Date().toISOString()
): Promise<StampLicenseExecutedResult | null> {
  const { data: existing, error: fetchError } = await service
    .from('license_requests')
    .select('id, executed_at')
    .eq('id', licenseRequestId)
    .maybeSingle()

  if (fetchError) throw new Error(`Failed to load deal: ${fetchError.message}`)
  if (!existing) return null

  const row = existing as { id: string; executed_at: string | null }
  if (row.executed_at) {
    return { executedAt: row.executed_at, alreadyExecuted: true }
  }

  const { data: updated, error: updateError } = await service
    .from('license_requests')
    .update({ executed_at: at })
    .eq('id', licenseRequestId)
    .is('executed_at', null)
    .select('executed_at')
    .maybeSingle()

  if (updateError) throw new Error(`Failed to stamp executed license: ${updateError.message}`)

  if (!updated) {
    // A concurrent stamp won the race between our pre-read and this write —
    // re-read to report whatever value the winner set, rather than
    // fabricating one.
    const { data: reread } = await service
      .from('license_requests')
      .select('executed_at')
      .eq('id', licenseRequestId)
      .maybeSingle()
    const rereadRow = reread as { executed_at: string | null } | null
    return { executedAt: rereadRow?.executed_at ?? at, alreadyExecuted: true }
  }

  return { executedAt: (updated as { executed_at: string }).executed_at, alreadyExecuted: false }
}
