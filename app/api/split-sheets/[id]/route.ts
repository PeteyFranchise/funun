import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { validateApprovalTotal } from '@/lib/split-sheets/approval'
import type { SplitSheetParty } from '@/lib/split-sheets/approval'

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
    if (VALID_STATUSES.includes(body.status)) {
      update.status = body.status
    }
  }

  // Handle party replacement (delete-and-reinsert for Phase 1)
  if (Array.isArray(body.parties) && body.parties.length > 0) {
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
