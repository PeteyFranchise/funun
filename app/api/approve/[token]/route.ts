import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'

// ─── POST /api/approve/[token] ─────────────────────────────────────────
// Public endpoint — no auth required. The 256-bit token is the authorization
// secret (T-01-10). Handles approve or counter-proposal actions.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = (await request.json()) as Record<string, unknown>

  const action = typeof body.action === 'string' ? body.action : ''
  if (action !== 'approve' && action !== 'counter') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const service = createServiceClient()
  const now = new Date().toISOString()

  // ── 1. Look up party by token (T-01-13 stale token guard) ─────────
  const { data: party, error: partyError } = await service
    .from('split_sheet_parties')
    .select('*, split_sheets(id, song_name, status, initiator_user_id)')
    .eq('approval_token', token)
    .maybeSingle()

  if (partyError || !party) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }

  // Reject if token is expired
  if (party.token_expires_at && party.token_expires_at < now) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 })
  }

  // Reject if already in a final state (already-used guard)
  const finalStatuses = ['approved', 'countered']
  if (finalStatuses.includes(party.approval_status)) {
    return NextResponse.json({ error: 'This link has already been used' }, { status: 410 })
  }

  const sheet = party.split_sheets as {
    id: string
    song_name: string
    status: string
    initiator_user_id: string
  } | null

  if (!sheet) {
    return NextResponse.json({ error: 'Split sheet not found' }, { status: 404 })
  }

  // ── 2. Apply action ───────────────────────────────────────────────
  if (action === 'approve') {
    const { data: updatedParty, error: updateError } = await service
      .from('split_sheet_parties')
      .update({ approval_status: 'approved', approved_at: now })
      .eq('id', party.id)
      .eq('approval_status', 'pending')
      .select('id')
      .maybeSingle()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    if (!updatedParty) {
      return NextResponse.json({ error: 'This link has already been used' }, { status: 410 })
    }

    // Re-check if ALL parties are now approved — if so, flip sheet to 'approved'
    const { data: allParties, error: partiesError } = await service
      .from('split_sheet_parties')
      .select('id, approval_status')
      .eq('split_sheet_id', sheet.id)

    if (!partiesError && allParties) {
      const allApproved = allParties.every(p => p.approval_status === 'approved')
      if (allApproved) {
        await service
          .from('split_sheets')
          .update({ status: 'approved', all_approved_at: now })
          .eq('id', sheet.id)
      } else {
        // Ensure sheet reflects pending state (may have been 'countered' before)
        await service
          .from('split_sheets')
          .update({ status: 'pending_approval' })
          .eq('id', sheet.id)
      }
    }

    // Notify initiator (best-effort)
    await notifyInitiator(service, sheet, party.name, 'approved', null)

    return NextResponse.json({ ok: true, status: 'approved' })
  }

  // action === 'counter'
  const counterRaw = body.counter_split
  const counterSplit = typeof counterRaw === 'number' ? counterRaw : Number(counterRaw)

  if (!Number.isFinite(counterSplit) || counterSplit < 0 || counterSplit > 100) {
    return NextResponse.json(
      { error: 'Your proposed split must be between 0% and 100%.' },
      { status: 400 }
    )
  }

  const { data: updatedParty, error: counterError } = await service
    .from('split_sheet_parties')
    .update({
      approval_status: 'countered',
      counter_proposal: counterSplit,
    })
    .eq('id', party.id)
    .eq('approval_status', 'pending')
    .select('id')
    .maybeSingle()

  if (counterError) {
    return NextResponse.json({ error: counterError.message }, { status: 500 })
  }
  if (!updatedParty) {
    return NextResponse.json({ error: 'This link has already been used' }, { status: 410 })
  }

  // Set sheet status to 'countered'
  await service.from('split_sheets').update({ status: 'countered' }).eq('id', sheet.id)

  // Notify initiator (best-effort)
  await notifyInitiator(service, sheet, party.name, 'countered', counterSplit)

  return NextResponse.json({ ok: true, status: 'countered' })
}

// ─── Initiator notification helper ─────────────────────────────────────
async function notifyInitiator(
  service: ReturnType<typeof createServiceClient>,
  sheet: { id: string; song_name: string; initiator_user_id: string },
  partyName: string,
  action: 'approved' | 'countered',
  counterSplit: number | null
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  // Look up initiator email via auth.users — use service role
  const { data: initiator } = await service.auth.admin.getUserById(sheet.initiator_user_id)
  const initiatorEmail = initiator?.user?.email
  if (!initiatorEmail) return

  const subject =
    action === 'approved'
      ? `${partyName} approved the split for "${sheet.song_name}"`
      : `${partyName} proposed a counter-split for "${sheet.song_name}"`

  const html =
    action === 'approved'
      ? `<h2>${partyName} approved the split</h2><p>All parties approving will flip the sheet to Approved. <a href="${appUrl}/split-sheets">View in Funūn →</a></p>`
      : `<h2>${partyName} proposed a counter-split</h2><p>They proposed ${counterSplit}% for their share. Review and re-send. <a href="${appUrl}/split-sheets">Open split sheet →</a></p>`

  await sendEmail({ to: initiatorEmail, subject, html })
}
