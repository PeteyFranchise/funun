import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { buildIdentityCorrectionFlagNotification } from '@/lib/social/notifications'

// ─── POST /api/split-sheets/[id]/correction-flag ──────────────────────────
// R4 flag-for-fix (SPEC 19-SPEC.md, D-05/D-06/D-07/D-08): a claimed user who
// appears on a FROZEN split sheet (esign_pending/executed) can submit a
// structured "this is wrong" correction against their own identity. Writes
// land ONLY in split_sheet_identity_flags — this route never UPDATEs
// split_sheet_parties and never touches split_percentage/role (Prohibitions).
//
// DB-layer twin: migration 074's `field` CHECK constraint. Keep this list
// identical to that CHECK if either is ever extended.
const FLAGGABLE_FIELDS = ['pro', 'ipi', 'publisher', 'administrator', 'legal_name'] as const
type FlaggableField = (typeof FLAGGABLE_FIELDS)[number]

// P18-13 structured-actions doctrine: suggested_value is a free-text field,
// but length-capped — no unbounded payload, no free-text CHANNEL (the
// FIELD itself stays a closed allowlist).
const SUGGESTED_VALUE_MAX_LENGTH = 500

const FROZEN_STATUSES = ['esign_pending', 'executed']

type PartyRow = {
  id: string
  collaborator_id: string | null
  user_id: string | null
  name: string
}

type SheetRow = {
  id: string
  status: string
  initiator_user_id: string
  song_name: string
  split_sheet_parties: PartyRow[]
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── 1. Auth gate ─────────────────────────────────────────────────────
  const apiClient = await createApiClient()
  const {
    data: { user },
  } = await apiClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  // ── 2. Field allowlist (V5 Input Validation) — reject before any DB call ──
  const field = body.field
  if (
    typeof field !== 'string' ||
    !(FLAGGABLE_FIELDS as readonly string[]).includes(field)
  ) {
    return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
  }
  const validatedField = field as FlaggableField

  const partyId = body.partyId
  if (typeof partyId !== 'string' || partyId.trim() === '') {
    return NextResponse.json({ error: 'partyId is required' }, { status: 400 })
  }

  const suggestedValue = String(body.suggestedValue ?? '')
    .slice(0, SUGGESTED_VALUE_MAX_LENGTH)
    .trim()
  if (suggestedValue === '') {
    return NextResponse.json({ error: 'suggestedValue is required' }, { status: 400 })
  }

  const service = createServiceClient()

  // ── 3. Authorization: the party must belong to THIS sheet, the sheet
  // must be FROZEN, and the authenticated user must be the CLAIMED user on
  // that exact party row — either directly (party.user_id, once a claimed
  // collaborator holds an account-linked party row) or via the roster
  // (party.collaborator_id -> collaborators.claimed_by). A user may only
  // flag their OWN identity — never another party's row (Edge: Cross-user
  // authority, R4). flagged_by below is ALWAYS the server-derived user.id,
  // never a client-supplied id. ──────────────────────────────────────────
  const { data: sheetData, error: sheetError } = await service
    .from('split_sheets')
    .select(
      'id, status, initiator_user_id, song_name, split_sheet_parties(id, collaborator_id, user_id, name)'
    )
    .eq('id', id)
    .maybeSingle()

  if (sheetError || !sheetData) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const sheet = sheetData as unknown as SheetRow

  if (!FROZEN_STATUSES.includes(sheet.status)) {
    return NextResponse.json(
      { error: 'Identity corrections can only be flagged on a frozen (esign_pending or executed) sheet' },
      { status: 409 }
    )
  }

  const party = (sheet.split_sheet_parties ?? []).find(p => p.id === partyId)
  if (!party) {
    return NextResponse.json({ error: 'Party not found on this sheet' }, { status: 404 })
  }

  let isClaimedParty = party.user_id === user.id
  if (!isClaimedParty && party.collaborator_id) {
    const { data: collaborator } = await service
      .from('collaborators')
      .select('claimed_by')
      .eq('id', party.collaborator_id)
      .maybeSingle()
    isClaimedParty = collaborator?.claimed_by === user.id
  }

  if (!isClaimedParty) {
    return NextResponse.json(
      { error: 'You can only flag your own identity on a sheet you appear on' },
      { status: 403 }
    )
  }

  // ── 4. Write: split_sheet_identity_flags ONLY. Never split_sheet_parties,
  // never split_percentage/role. ─────────────────────────────────────────
  const { data: flag, error: insertError } = await service
    .from('split_sheet_identity_flags')
    .insert({
      split_sheet_party_id: partyId,
      flagged_by: user.id,
      field: validatedField,
      suggested_value: suggestedValue,
    })
    .select('id')
    .single()

  if (insertError || !flag) {
    return NextResponse.json(
      { error: insertError?.message ?? 'Could not save the correction flag' },
      { status: 500 }
    )
  }

  // ── 5. Notify the sheet owner (D-06): bell + Resend in ONE
  // createNotification call, best-effort — a notification failure never
  // blocks the flag write, which already committed above (matches this
  // repo's "never throws" side-effect convention, lib/social/activity-emit.ts). ──
  try {
    const { data: ownerAuth } = await service.auth.admin.getUserById(sheet.initiator_user_id)
    const ownerEmail = ownerAuth?.user?.email ?? null

    const payload = buildIdentityCorrectionFlagNotification({
      recipientId: sheet.initiator_user_id,
      partyId,
      partyName: party.name,
      splitSheetId: sheet.id,
      flagId: flag.id as string,
      field: validatedField,
      suggestedValue,
    })

    await createNotification(service, {
      ...payload,
      email: ownerEmail,
      sendEmailCopy: true,
    })
  } catch {
    /* best-effort — the flag write already committed */
  }

  return NextResponse.json({ ok: true, flagId: flag.id })
}
