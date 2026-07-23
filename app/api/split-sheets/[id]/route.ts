import { NextResponse } from 'next/server'
import {
  assertEditable,
  isAllowedStatusTransition,
  partiesActuallyChanged,
  type SplitSheetStatus,
} from '@/lib/split-sheets/lifecycle'
import { createApiClient } from '@/lib/supabase/server'
import { validateApprovalTotal } from '@/lib/split-sheets/approval'
import type { SplitSheetParty } from '@/lib/split-sheets/approval'
import { summarizePartyChanges } from '@/lib/split-sheets/change-summary'
import type { PartyChangeSnapshot, PartyChangeRecord } from '@/lib/split-sheets/change-summary'

// ─── Party field allowlist ────────────────────────────────────────────
// Kept in sync with app/api/split-sheets/route.ts's PARTY_FIELDS. This
// route does a delete-and-reinsert of every party row on any parties[]
// PATCH (Phase 1 edit pattern) — omitting legal_name/publishing_designee/
// administrator here would silently WIPE those values on every edit, not
// merely fail to save new ones (migration 063, P17-09).
const PARTY_FIELDS = [
  'name',
  'email',
  'pro',
  'ipi',
  'role',
  'split_percentage',
  'collaborator_id',
  'legal_name',
  'publishing_designee',
  'administrator',
] as const

// ─── Sheet-level field allowlist (Work Details, P17-09) ───────────────
const SHEET_FIELDS = ['artist_name', 'album_project_title', 'record_label'] as const

function sanitizeParty(raw: Record<string, unknown>): SplitSheetParty {
  const out: Record<string, unknown> = {}
  for (const key of PARTY_FIELDS) {
    if (!(key in raw)) continue
    const value = raw[key]
    if (key === 'split_percentage') {
      const n = Number(value)
      out[key] = Number.isFinite(n) ? n : 0
      continue
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      out[key] = trimmed === '' ? null : trimmed
    } else if (value === null) {
      out[key] = null
    }
  }
  return out as SplitSheetParty
}

// PATCH /api/split-sheets/[id] — edit a split sheet (initiator only, T-01-08)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = (await request.json()) as Record<string, unknown>

  // ─── Freeze boundary (see lib/split-sheets/lifecycle.ts) ────────────────
  // Load current status BEFORE building any update. A split sheet is a
  // living draft only up to the point terms are put to the other parties;
  // past that, edits either invalidate consensus or corrupt a legal record.
  const { data: current, error: currentError } = await supabase
    .from('split_sheets')
    .select('id, status')
    .eq('id', id)
    .eq('initiator_user_id', user.id)
    .maybeSingle()

  if (currentError || !current) {
    return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 })
  }

  // WR-04: "editsParties" means the incoming party set MATERIALLY differs
  // from what's persisted (a real add/remove/split-percentage change,
  // lib/split-sheets/lifecycle.ts's partiesActuallyChanged) — not merely
  // "a parties[] array was present in the body." Every builder save
  // includes the full parties[] array, so the old presence-only check
  // forced a consensus reset (and the delete-and-reinsert below, which
  // destroys every approval_token) on saves that changed nothing about
  // who's on the sheet or what they're owed.
  const partiesSubmitted = Array.isArray(body.parties) && body.parties.length > 0
  let editsParties = false
  // Server-computed consensus-reset diff (WR-03 / P18-09) — derived from the
  // SAME frozen before/after snapshots the edit gate uses, and persisted only
  // when consensus actually resets (below). Never sourced from client input.
  let changeRecords: PartyChangeRecord[] = []
  if (partiesSubmitted) {
    const { data: existingPartyRows } = await supabase
      .from('split_sheet_parties')
      .select('name, split_percentage')
      .eq('split_sheet_id', id)
    const before: PartyChangeSnapshot[] = (
      (existingPartyRows ?? []) as { name: string; split_percentage: number }[]
    ).map(p => ({ name: p.name, split_percentage: p.split_percentage }))
    const after: PartyChangeSnapshot[] = (body.parties as Record<string, unknown>[]).map(p => ({
      name: String(p.name ?? ''),
      split_percentage: Number(p.split_percentage) || 0,
    }))
    editsParties = partiesActuallyChanged(before, after)
    changeRecords = summarizePartyChanges(before, after)
  }
  const gate = assertEditable(current.status as SplitSheetStatus, editsParties)
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  // Build allowed update fields
  const update: Record<string, unknown> = {}

  if ('song_name' in body && typeof body.song_name === 'string') {
    const trimmed = body.song_name.trim()
    if (trimmed) update.song_name = trimmed
  }
  if ('vault_project_id' in body) {
    update.vault_project_id =
      typeof body.vault_project_id === 'string' && body.vault_project_id.trim()
        ? body.vault_project_id.trim()
        : null
  }
  for (const key of SHEET_FIELDS) {
    if (!(key in body)) continue
    const value = body[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      update[key] = trimmed === '' ? null : trimmed
    } else if (value === null) {
      update[key] = null
    }
  }
  if ('status' in body && typeof body.status === 'string') {
    // esign_pending/executed widen the pipeline (migration 062, P17-02) —
    // without these the PATCH route silently rejects the new lifecycle
    // statuses (RESEARCH State of the Art, T-17-11).
    const VALID_STATUSES = [
      'draft',
      'pending_approval',
      'approved',
      'countered',
      'esign_pending',
      'executed',
    ]
    if (
      VALID_STATUSES.includes(body.status) &&
      isAllowedStatusTransition(current.status as SplitSheetStatus, body.status as SplitSheetStatus)
    ) {
      update.status = body.status
    }
  }

  // Consensus reset (freeze boundary): replacing the party set on a sheet
  // that is already out for approval invalidates every prior approval — the
  // delete-and-reinsert below drops each party's approval_token anyway, so
  // the status MUST follow it back to draft rather than falsely claiming
  // pending_approval with dead links.
  if (gate.ok && gate.resetsConsensus) {
    update.status = 'draft'
    // WR-03 / P18-09: persist the server-computed diff so each party is told
    // WHAT changed on /approve/[token] before re-approving — not merely
    // "please re-approve." Structured records from summarizePartyChanges (no
    // free text — P18-13), computed above from the frozen before/after party
    // rows; never client-supplied and deliberately absent from the field
    // allowlists. Overwrites any prior reset's summary. (A later pure-draft
    // edit before re-sending is not re-captured — the approved→edit→reset flow
    // this serves is exact; a follow-on draft tweak is the accepted v1 edge.)
    update.last_change_summary = changeRecords
  }

  // Handle party replacement (delete-and-reinsert for Phase 1). Gated on
  // editsParties (an ACTUAL diff), not merely "parties[] present" (WR-04)
  // — a value-for-value resubmission of the same parties/splits skips
  // this entirely, so it never destroys approval_tokens for approvals
  // that remain perfectly valid.
  if (editsParties) {
    const rawParties = body.parties as Record<string, unknown>[]
    const parties = rawParties.map(sanitizeParty)

    for (const p of parties) {
      if (!p.name) {
        return NextResponse.json({ error: 'Each party must have a name' }, { status: 400 })
      }
    }

    if (!validateApprovalTotal(parties.map(p => p.split_percentage))) {
      return NextResponse.json({ error: 'Splits must total 100%' }, { status: 400 })
    }

    // Verify initiator ownership before modifying parties
    const { data: existing, error: fetchError } = await supabase
      .from('split_sheets')
      .select('id')
      .eq('id', id)
      .eq('initiator_user_id', user.id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 })
    }

    // Delete existing parties then reinsert
    const { error: deleteError } = await supabase
      .from('split_sheet_parties')
      .delete()
      .eq('split_sheet_id', id)

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

    const partyRows = parties.map(p => ({
      split_sheet_id: id,
      collaborator_id: p.collaborator_id ?? null,
      name: p.name,
      email: p.email ?? null,
      pro: p.pro ?? null,
      ipi: p.ipi ?? null,
      role: p.role ?? null,
      split_percentage: p.split_percentage,
      legal_name: p.legal_name ?? null,
      publishing_designee: p.publishing_designee ?? null,
      administrator: p.administrator ?? null,
    }))

    const { error: insertError } = await supabase.from('split_sheet_parties').insert(partyRows)
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Update split_sheets row (scoped to initiator, T-01-08)
  if (Object.keys(update).length > 0) {
    const { data, error } = await supabase
      .from('split_sheets')
      .update(update)
      .eq('id', id)
      .eq('initiator_user_id', user.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  // No sheet-level fields to update — verify ownership and return current record
  const { data, error } = await supabase
    .from('split_sheets')
    .select()
    .eq('id', id)
    .eq('initiator_user_id', user.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE /api/split-sheets/[id] — delete a split sheet (initiator only, T-01-08)
// Parties cascade via FK on split_sheet_parties.split_sheet_id
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { error } = await supabase
    .from('split_sheets')
    .delete()
    .eq('id', id)
    .eq('initiator_user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
