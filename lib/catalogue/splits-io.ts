// ─── The single split-sheet accessor for Phase 37.1 ────────────────────
// This is the ONE place this phase touches split_sheets / split_sheet_parties.
// Both exports use the service role and both document the same standing
// precondition: the caller has ALREADY resolved work access via
// resolveWorkAccess() (lib/catalogue/access.ts). Neither function checks
// access on its own.
//
// WHY THE SERVICE ROLE, NOT A NEW RLS POLICY. split_sheets and
// split_sheet_parties are the table pair migration 064 exists to keep out
// of policy recursion (SQLSTATE 42P17, first hit by migration 018,
// reachable from three unrelated directions). Migration 137's own header
// records the decision from the schema side: 37.1 needs exactly one new
// read, and a service-role call after an access check already satisfies it
// — the same posture every signed-URL read and every audio upload in this
// codebase already takes. Adding a fourth policy to a recursion-sensitive
// pair, to save one service-role call on a page that is already
// server-rendered, would be a bad trade.
//
// `client` is typed as the full SupabaseClient (matching lib/deals/
// shortlists.ts's precedent for a service-role I/O helper) rather than a
// hand-rolled minimal interface — this module's own header IS the
// enforcement that no access reasoning happens here, and the suite proves
// it structurally by injecting a fake with no `.rpc` and no `.auth` at all.

import type { SupabaseClient } from '@supabase/supabase-js'
import { validateApprovalTotal } from '@/lib/split-sheets/approval'
import { LIVING_DRAFT_STATUSES, type SplitSheetStatus } from '@/lib/split-sheets/lifecycle'
import type { LivingDraftParty } from '@/lib/catalogue/splits'
import { asWriterDesignation } from '@/lib/catalogue/designation'

export type WorkSplitsSheet = {
  sheetId: string
  status: SplitSheetStatus
  parties: LivingDraftParty[]
}

type SplitSheetRow = { id: string; status: string }
type SplitSheetPartyRow = {
  id: string
  collaborator_id: string | null
  user_id: string | null
  name: string
  split_percentage: number
  writer_designation: string | null
}

/**
 * Loads a work's LIVING-DRAFT split sheet — status in LIVING_DRAFT_STATUSES
 * (lib/split-sheets/lifecycle.ts's own vocabulary: 'draft' or 'countered',
 * reused rather than a fresh `=== 'draft'` literal) — and its parties.
 * Returns null when the work has no such sheet.
 *
 * PRECONDITION: work access is already resolved by the caller. `client`
 * should be the service-role client (createServiceClient()).
 */
export async function loadWorkSplits(
  client: SupabaseClient,
  workId: string
): Promise<WorkSplitsSheet | null> {
  const { data: sheet, error: sheetError } = await client
    .from('split_sheets')
    .select('id, status')
    .eq('work_id', workId)
    .in('status', LIVING_DRAFT_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (sheetError) throw new Error(`Could not load work split sheet: ${sheetError.message}`)

  if (!sheet) return null
  const sheetRow = sheet as SplitSheetRow

  const { data: partyRows, error: partyError } = await client
    .from('split_sheet_parties')
    .select('id, collaborator_id, user_id, name, split_percentage, writer_designation')
    .eq('split_sheet_id', sheetRow.id)
  if (partyError) throw new Error(`Could not load work split parties: ${partyError.message}`)

  const parties: LivingDraftParty[] = ((partyRows ?? []) as SplitSheetPartyRow[]).map((p) => ({
    collaboratorId: p.collaborator_id,
    userId: p.user_id,
    name: p.name,
    splitPercentage: Number(p.split_percentage),
    writerDesignation: asWriterDesignation(p.writer_designation),
  }))

  return { sheetId: sheetRow.id, status: sheetRow.status as SplitSheetStatus, parties }
}

export type ApplyWorkSplitsResult = { ok: true } | { ok: false; reason: string }

/**
 * Writes a redrafted party set through the database's row-locked,
 * transactional replacement function. Refuses, without writing anything, when
 * the incoming percentages do not sum to exactly 100.000% (reusing
 * validateApprovalTotal — lib/split-sheets/approval.ts). This is a
 * defensive runtime check at this module's own I/O boundary: every caller
 * in 37.1 (planWriterPromotion / planWriterRemoval, lib/catalogue/
 * splits.ts) already guarantees the invariant before this function is ever
 * reached, but this function does not trust that guarantee blindly.
 *
 * PRECONDITION: same as loadWorkSplits — work access is already resolved,
 * `client` is the service-role client, and this function performs no
 * access check of its own.
 */
export async function applyWorkSplits(
  client: SupabaseClient,
  sheetId: string,
  parties: LivingDraftParty[]
): Promise<ApplyWorkSplitsResult> {
  // An empty party set (planWriterRemoval() redrafting the last writer off
  // the sheet) is a legitimate state and skips the total check entirely —
  // validateApprovalTotal() itself treats a zero-length array as invalid
  // (it exists to guard a NONEMPTY party set summing to 100%, not to
  // forbid an empty one).
  if (parties.length > 0 && !validateApprovalTotal(parties.map((p) => p.splitPercentage))) {
    return { ok: false, reason: 'Split percentages must total exactly 100%.' }
  }

  const rows = parties.map((p) => ({
    collaborator_id: p.collaboratorId ?? null,
    user_id: p.userId ?? null,
    name: p.name,
    split_percentage: p.splitPercentage,
    writer_designation: p.writerDesignation ?? null,
  }))

  const { error } = await client.rpc('replace_split_sheet_parties_transactional', {
    p_sheet_id: sheetId,
    p_parties: rows,
    p_sheet_updates: {},
  })
  if (error) return { ok: false, reason: error.message }

  return { ok: true }
}
