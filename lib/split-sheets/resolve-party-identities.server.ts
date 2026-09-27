// ─── The one server-side party-identity resolver (260926-v1w) ─────────
// Before this module, three surfaces each resolved a split-sheet party's
// identity independently: the owner page used the (now-deleted)
// lib/split-sheets/live-identity.ts resolver; the /approve/[token] page
// and the mint-envelope route read the raw split_sheet_parties columns
// directly. All three could disagree — the initiator saw one identifier,
// the co-writer approved another, and the signed PDF carried a third.
// This module is the single place that resolves a party's identity for
// display or minting. Every reader calls this instead of selecting the
// five identity columns itself; __tests__/split-sheet-identity-boundary
// .test.ts pins that set of callers.
//
// AUTHORIZATION IS THE CALLER'S JOB. This function uses the SERVICE
// client (bypasses RLS) and does not itself verify that the caller is
// entitled to see this sheet — each of its callers gates differently:
//   owner page      initiator-or-account-holding-party (404 otherwise)
//   approve page    possession of the 256-bit approval token
//   mint route      initiator ownership (.eq('initiator_user_id', ...))
//   docuseal webhook the route's own HMAC-verified signature gate
//
// RESOLUTION ORDER (see the plan's <design> section):
//   1. Read the sheet's status and every party row (one query).
//   2. If the sheet is post-mint (esign_pending/executed) AND the current
//      envelope (the latest non-voided row for this sheet, by created_at)
//      carries a persisted party_identity_snapshot, return that snapshot
//      verbatim — one truth for the minted document, for every surface.
//   3. Otherwise, batch-resolve claimed collaborators -> user_profiles and
//      apply resolveIdentityFields() per party (Ruling 2,
//      lib/split-sheets/identity-policy.ts). For a post-mint sheet with NO
//      snapshot (an envelope minted before this migration), the live
//      profile lookup still runs, but resolveIdentityFields's own
//      post-mint short-circuit returns each party's frozen row unchanged
//      regardless — one code path serves both branches.
//
// HAZARD, recorded and NOT fixed here (out of scope per the plan): the
// track/composer sync (app/api/vault/[projectId]/tracks/[trackId]/route.ts)
// matches parties by normalizeName(). Two collaborators sharing a
// normalized name can cross-write each other's pro/ipi through that path;
// this resolver reads whatever is currently stored and cannot detect that.

import { createServiceClient } from '@/lib/supabase/server'
import { composeLegalNameFromProfile } from '@/lib/split-sheets/agreement'
import {
  resolveIdentityFields,
  type PartyIdentityFields,
  type ResolvedPartyIdentity,
} from '@/lib/split-sheets/identity-policy'
import type { SplitSheetStatus } from '@/lib/split-sheets/lifecycle'

export type ResolvedParty = {
  partyId: string
  collaborator_id: string | null
  user_id: string | null
  name: string
  email: string | null
  role: string | null
  split_percentage: number
  approval_status: string | null
  identity_source: string | null
  identity_digest_at_approval: string | null
  identity: ResolvedPartyIdentity
  /**
   * The party row's OWN current identity fields, as stored — never
   * live-overlaid. Exposed so a caller (the mint route's identity-drift
   * gate) can compare "what's on the row now" against `identity` (the
   * freshly resolved value) without querying identity columns itself,
   * which is what the boundary test forbids. In the post-mint snapshot
   * branch this is still the CURRENT row, not the snapshot — the snapshot
   * lives at `identity` there instead.
   */
  frozen: PartyIdentityFields
}

export type ResolvedPartyIdentities = {
  status: SplitSheetStatus
  parties: ResolvedParty[]
}

type PartyRow = {
  id: string
  collaborator_id: string | null
  user_id: string | null
  name: string
  email: string | null
  role: string | null
  split_percentage: number
  approval_status: string | null
  identity_source: string | null
  identity_digest_at_approval: string | null
  legal_name: string | null
  pro: string | null
  ipi: string | null
  publishing_designee: string | null
  administrator: string | null
}

type SheetRow = {
  id: string
  status: SplitSheetStatus
  split_sheet_parties: PartyRow[]
}

/** party_identity_snapshot's shape, written by the mint route (Task 2) in
 * the same insert that records the envelope — an array of every signable
 * party's identity as of the moment the PDF was rendered. */
type SnapshotEntry = {
  partyId: string
  identity: PartyIdentityFields
}

type EnvelopeSnapshotRow = {
  id: string
  status: string
  created_at: string | null
  party_identity_snapshot: SnapshotEntry[] | null
}

type ClaimedCollaboratorRow = {
  id: string
  claimed_by: string | null
}

type ProfileRow = {
  id: string
  pro: string | null
  ipi: string | null
  publisher: string | null
  administrator: string | null
  legal_first_name: string | null
  legal_middle_name: string | null
  legal_last_name: string | null
  legal_name_suffix: string | null
}

function toPartyIdentityFields(row: {
  legal_name: string | null
  pro: string | null
  ipi: string | null
  publishing_designee: string | null
  administrator: string | null
}): PartyIdentityFields {
  return {
    legal_name: row.legal_name,
    pro: row.pro,
    ipi: row.ipi,
    publishing_designee: row.publishing_designee,
    administrator: row.administrator,
  }
}

function toResolvedParty(row: PartyRow, identity: ResolvedPartyIdentity): ResolvedParty {
  return {
    partyId: row.id,
    collaborator_id: row.collaborator_id,
    user_id: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    split_percentage: row.split_percentage,
    approval_status: row.approval_status,
    identity_source: row.identity_source,
    identity_digest_at_approval: row.identity_digest_at_approval,
    identity,
    frozen: toPartyIdentityFields(row),
  }
}

/**
 * Picks the "current" envelope for the drift/snapshot check: the
 * most-recently-created row whose status is not 'voided'. A void->re-mint
 * cycle (P17-02) inserts a fresh envelope row rather than overwriting the
 * voided one, so a voided attempt's stale snapshot must never be
 * consulted in favour of the live one.
 */
function pickCurrentEnvelope(rows: EnvelopeSnapshotRow[]): EnvelopeSnapshotRow | null {
  const active = rows.filter(row => row.status !== 'voided')
  if (active.length === 0) return null
  return active.reduce((latest, row) =>
    (row.created_at ?? '') > (latest.created_at ?? '') ? row : latest
  )
}

export async function resolvePartyIdentitiesForSheet(sheetId: string): Promise<ResolvedPartyIdentities> {
  const service = createServiceClient()

  const { data: sheetData, error: sheetError } = await service
    .from('split_sheets')
    .select(
      'id, status, split_sheet_parties(id, collaborator_id, user_id, name, email, role, ' +
        'split_percentage, approval_status, identity_source, identity_digest_at_approval, ' +
        'legal_name, pro, ipi, publishing_designee, administrator)'
    )
    .eq('id', sheetId)
    .maybeSingle()

  if (sheetError || !sheetData) {
    throw new Error(`resolvePartyIdentitiesForSheet: could not read sheet ${sheetId}`)
  }

  const sheet = sheetData as unknown as SheetRow
  const parties = sheet.split_sheet_parties ?? []
  const isPostMint = sheet.status === 'esign_pending' || sheet.status === 'executed'

  // ── Post-mint snapshot short-circuit ─────────────────────────────────
  if (isPostMint) {
    const { data: envelopeRows } = await service
      .from('esign_envelopes')
      .select('id, status, created_at, party_identity_snapshot')
      .eq('split_sheet_id', sheetId)

    const currentEnvelope = pickCurrentEnvelope((envelopeRows ?? []) as EnvelopeSnapshotRow[])

    if (currentEnvelope?.party_identity_snapshot) {
      const snapshotByPartyId = new Map(
        currentEnvelope.party_identity_snapshot.map(entry => [entry.partyId, entry.identity])
      )
      return {
        status: sheet.status,
        parties: parties.map(p => {
          const snapshotIdentity = snapshotByPartyId.get(p.id)
          const identity = (snapshotIdentity ?? toPartyIdentityFields(p)) as ResolvedPartyIdentity
          return toResolvedParty(p, identity)
        }),
      }
    }
    // No snapshot (an envelope minted before this migration, or none at
    // all) — fall through. resolveIdentityFields's post-mint branch
    // returns each party's frozen row unchanged regardless of liveProfile.
  }

  // ── Live resolution (pre-mint, or post-mint with no snapshot) ────────
  const collaboratorIds = parties
    .map(p => p.collaborator_id)
    .filter((cid): cid is string => Boolean(cid))

  const claimedByByCollaboratorId = new Map<string, string>()
  if (collaboratorIds.length > 0) {
    const { data: collabRows } = await service
      .from('collaborators')
      .select('id, claimed_by')
      .in('id', collaboratorIds)
    for (const row of (collabRows ?? []) as ClaimedCollaboratorRow[]) {
      if (row.claimed_by) claimedByByCollaboratorId.set(row.id, row.claimed_by)
    }
  }

  const claimedUserIds = Array.from(new Set(Array.from(claimedByByCollaboratorId.values())))
  const profileByUserId = new Map<string, PartyIdentityFields>()
  if (claimedUserIds.length > 0) {
    const { data: profileRows } = await service
      .from('user_profiles')
      .select(
        'id, pro, ipi, publisher, administrator, legal_first_name, legal_middle_name, legal_last_name, legal_name_suffix'
      )
      .in('id', claimedUserIds)
    for (const row of (profileRows ?? []) as ProfileRow[]) {
      profileByUserId.set(row.id, {
        legal_name: composeLegalNameFromProfile(row) || null,
        pro: row.pro,
        ipi: row.ipi,
        publishing_designee: row.publisher,
        administrator: row.administrator,
      })
    }
  }

  return {
    status: sheet.status,
    parties: parties.map(p => {
      const claimedUserId = p.collaborator_id ? claimedByByCollaboratorId.get(p.collaborator_id) : undefined
      const liveProfile = claimedUserId ? profileByUserId.get(claimedUserId) ?? null : null
      const identity = resolveIdentityFields(toPartyIdentityFields(p), liveProfile, sheet.status)
      return toResolvedParty(p, identity)
    }),
  }
}
