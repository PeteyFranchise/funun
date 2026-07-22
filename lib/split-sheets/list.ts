// ─── Split sheet list — the living-draft surface's data layer ────────
// GET /api/split-sheets and app/(artist)/split-sheets/page.tsx both need
// the SAME "initiated OR party-of" merge (HOME-01/HOME-02) — this lives in
// lib/ so it stays unit-testable and isn't duplicated between the API
// route and the server-rendered list page, mirroring
// lib/contracts/locker-rows.ts's fetchContractRows pattern (a Next.js
// route/page module may only export a fixed set of names).
//
// P18-11 (drafts-are-initiator-only): a draft sheet is reachable ONLY by
// the user who created it. The party-of query filters this out at the
// query level (`.neq('status', 'draft')`); mergeSplitSheetRows() applies
// the SAME rule again defensively — a party-of row that is somehow still
// a draft is dropped unless the caller is also its initiator — so the
// rule holds even if the query's WHERE clause changes without this file
// in view (T-18-01).

import type { SupabaseClient } from '@supabase/supabase-js'

export type SplitSheetPartyRow = {
  id: string
  name: string
  approval_status: 'pending' | 'approved' | 'countered'
  split_percentage: number
  user_id: string | null
  [key: string]: unknown
}

export type SplitSheetAttachmentRow = {
  vault_project_id: string
  track_id: string | null
}

export type SplitSheetRow = {
  id: string
  song_name: string
  status: string
  initiator_user_id: string
  created_at: string
  split_sheet_parties: SplitSheetPartyRow[]
  split_sheet_attachments?: SplitSheetAttachmentRow[]
  [key: string]: unknown
}

/**
 * Merges the initiator-owned query results with the party-of query
 * results, de-duplicating by sheet id (a sheet the caller both initiated
 * AND is named on — solo sheets, or a re-added initiator row — must not
 * appear twice). A draft row from the party-of source is dropped unless
 * `userId` is that sheet's own initiator (P18-11).
 */
export function mergeSplitSheetRows(
  initiated: SplitSheetRow[],
  partyOf: SplitSheetRow[],
  userId: string
): SplitSheetRow[] {
  const seen = new Set(initiated.map(s => s.id))
  const merged = [...initiated]

  for (const sheet of partyOf) {
    if (seen.has(sheet.id)) continue
    if (sheet.status === 'draft' && sheet.initiator_user_id !== userId) continue
    seen.add(sheet.id)
    merged.push(sheet)
  }

  return merged
}

/**
 * Fetches BOTH the sheets the caller initiated AND the sheets where the
 * caller is a party with a matching user_id — reached through
 * split_sheet_parties (the row a party can reach), never via an OR across
 * a joined table on split_sheets directly. Takes a client rather than
 * building one so the query shape and merge stay testable against a
 * mocked Supabase client.
 */
export async function fetchSplitSheetsForUser(
  supabase: Pick<SupabaseClient, 'from'>,
  userId: string
): Promise<SplitSheetRow[]> {
  const { data: initiatedData } = await supabase
    .from('split_sheets')
    .select('*, split_sheet_parties(*), split_sheet_attachments(vault_project_id, track_id)')
    .eq('initiator_user_id', userId)
    .order('created_at', { ascending: false })
  const initiated = (initiatedData ?? []) as SplitSheetRow[]

  const { data: partyLinksData } = await supabase
    .from('split_sheet_parties')
    .select('split_sheet_id')
    .eq('user_id', userId)
  const partySheetIds = Array.from(
    new Set(
      ((partyLinksData ?? []) as { split_sheet_id: string }[]).map(p => p.split_sheet_id)
    )
  )

  let partyOf: SplitSheetRow[] = []
  if (partySheetIds.length > 0) {
    const { data: partyOfData } = await supabase
      .from('split_sheets')
      .select('*, split_sheet_parties(*), split_sheet_attachments(vault_project_id, track_id)')
      .in('id', partySheetIds)
      .neq('status', 'draft')
    partyOf = (partyOfData ?? []) as SplitSheetRow[]
  }

  const merged = mergeSplitSheetRows(initiated, partyOf, userId)
  merged.sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
  return merged
}
