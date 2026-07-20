import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { validateApprovalTotal } from '@/lib/split-sheets/approval'
import type { SplitSheetParty } from '@/lib/split-sheets/approval'

// ─── Party field allowlist ────────────────────────────────────────────
// Mass-assignment defense: only these keys are written to split_sheet_parties.
// legal_name/publishing_designee/administrator (migration 063, P17-09) are
// included here deliberately — an unlisted field is silently dropped, not
// rejected, so without this entry the builder's captured values would
// never reach the row even though the column exists (the exact trap
// app/api/profile/route.ts's EDITABLE_FIELDS comment warns about).
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
// All optional (decision 4) — a missing value renders as an em-dash on
// the document, it never blocks sheet creation.
const SHEET_FIELDS = ['artist_name', 'album_project_title', 'record_label'] as const

function sanitizeSheetFields(body: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const key of SHEET_FIELDS) {
    if (!(key in body)) continue
    const value = body[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      out[key] = trimmed === '' ? null : trimmed
    } else if (value === null) {
      out[key] = null
    }
  }
  return out
}

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
  // name is required — callers must validate before using sanitizeParty
  return out as SplitSheetParty
}

// GET /api/split-sheets — list split sheets initiated by the current user
export async function GET() {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('split_sheets')
    .select('*, split_sheet_parties(*)')
    .eq('initiator_user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/split-sheets — create a new split sheet with party rows
export async function POST(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as Record<string, unknown>

  // Validate song_name
  const songName = typeof body.song_name === 'string' ? body.song_name.trim() : ''
  if (!songName) {
    return NextResponse.json({ error: 'Song name is required' }, { status: 400 })
  }

  // Validate parties array
  if (!Array.isArray(body.parties) || body.parties.length < 1) {
    return NextResponse.json({ error: 'At least one party is required' }, { status: 400 })
  }

  const rawParties = body.parties as Record<string, unknown>[]
  const parties = rawParties.map(sanitizeParty)

  // Validate each party has a name
  for (const p of parties) {
    if (!p.name) {
      return NextResponse.json({ error: 'Each party must have a name' }, { status: 400 })
    }
  }

  // Server-side total validation (T-01-07)
  if (!validateApprovalTotal(parties.map(p => p.split_percentage))) {
    return NextResponse.json({ error: 'Splits must total 100%' }, { status: 400 })
  }

  // Insert split_sheets row — initiator_user_id sourced from session, never body
  const vaultProjectId =
    typeof body.vault_project_id === 'string' && body.vault_project_id.trim()
      ? body.vault_project_id.trim()
      : null

  const sheetFields = sanitizeSheetFields(body)

  const { data: sheet, error: sheetError } = await supabase
    .from('split_sheets')
    .insert({
      initiator_user_id: user.id,
      vault_project_id: vaultProjectId,
      song_name: songName,
      status: 'draft',
      ...sheetFields,
    })
    .select()
    .single()

  if (sheetError) return NextResponse.json({ error: sheetError.message }, { status: 500 })

  // Insert split_sheet_parties rows (denormalized snapshot)
  const partyRows = parties.map(p => ({
    split_sheet_id: sheet.id,
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

  const { error: partiesError } = await supabase.from('split_sheet_parties').insert(partyRows)

  if (partiesError) return NextResponse.json({ error: partiesError.message }, { status: 500 })

  return NextResponse.json({ data: sheet })
}
