import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { generateApprovalToken, APPROVAL_TOKEN_EXPIRY_DAYS } from '@/lib/split-sheets/approval'

// ─── POST /api/split-sheets/[id]/share ────────────────────────────────
// P18-08: a read-only draft preview link, explicitly NOT a formal ask.
// Modeled on app/api/split-sheets/[id]/send-for-approval/route.ts, with
// the deliberate difference that THIS route never advances the lifecycle:
// no split_sheets.status write, no approval_status write, no email sent.
// Mints (or refreshes) each party's approval_token/token_expires_at so the
// SAME durable /approve/[token] link can later serve as the formal
// approval link too (P17-01 link reuse) — sharing early does not burn a
// second token.
//
// Reads nothing from the request body but the sheet id off the URL path —
// no message/note/reason field is ever parsed (P18-13); this handler
// never calls request.json().
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── 1. Auth gate ───────────────────────────────────────────────────
  const apiClient = await createApiClient()
  const {
    data: { user },
  } = await apiClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // ── 2. Initiator-only authorization (T-18-03) ──────────────────────
  const { data: sheet, error: sheetError } = await apiClient
    .from('split_sheets')
    .select('id, status, split_sheet_parties(id, name)')
    .eq('id', id)
    .eq('initiator_user_id', user.id)
    .maybeSingle()

  if (sheetError || !sheet) {
    return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 })
  }

  // ── 3. Only a draft or countered sheet gets a preview link — a sheet
  // already out for formal approval has its own link (T-18-03). ──────
  if (sheet.status !== 'draft' && sheet.status !== 'countered') {
    return NextResponse.json(
      {
        error:
          'This split sheet is already out for formal approval or signature — share links are only for drafts.',
      },
      { status: 409 }
    )
  }

  const parties = (sheet.split_sheet_parties ?? []) as { id: string; name: string }[]
  if (parties.length === 0) {
    return NextResponse.json({ error: 'Split sheet has no parties to share with' }, { status: 400 })
  }

  // ── 4. Mint/refresh tokens — service client for the cross-user party
  // rows, ownership already verified above (mirrors send-for-approval). ──
  const service = createServiceClient()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + APPROVAL_TOKEN_EXPIRY_DAYS)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  const shares: { partyId: string; name: string; url: string }[] = []

  for (const party of parties) {
    const token = generateApprovalToken()
    await service
      .from('split_sheet_parties')
      .update({
        approval_token: token,
        token_expires_at: expiresAt.toISOString(),
        // Deliberately NOT touching approval_status or split_sheets.status
        // — a share is a preview, not a formal ask (P18-08).
      })
      .eq('id', party.id)
    shares.push({ partyId: party.id, name: party.name, url: `${appUrl}/approve/${token}` })
  }

  return NextResponse.json({ ok: true, shares })
}
