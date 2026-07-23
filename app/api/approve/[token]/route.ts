import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'

// ─── §7 identity-update allowlist ──────────────────────────────────────
// Mass-assignment defense (V5): only these fields may be written by the
// identity action, to the token's OWN party row (and, when linked, the
// initiator's collaborators row). No free-text field — legal_name/pro/
// ipi/publishing_designee/administrator are all structured rights-registry
// values, never a caller-supplied note (P18-13).
const IDENTITY_FIELDS = ['legal_name', 'pro', 'ipi', 'publishing_designee', 'administrator'] as const

// ─── POST /api/approve/[token] ─────────────────────────────────────────
// Public endpoint — no auth required. The 256-bit token is the authorization
// secret (T-01-10). Handles approve, counter-proposal, and (§7) a
// recipient's own identity-correction action.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = (await request.json()) as Record<string, unknown>

  const action = typeof body.action === 'string' ? body.action : ''
  if (action !== 'approve' && action !== 'counter' && action !== 'update_identity') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const service = createServiceClient()
  const now = new Date().toISOString()

  // ── 1. Look up party by token (T-01-13 stale token guard) — the token
  // is the identity; the write/update target below is NEVER client-
  // selected by any other means (V4). ─────────────────────────────────
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

  const sheet = party.split_sheets as {
    id: string
    song_name: string
    status: string
    initiator_user_id: string
  } | null

  if (!sheet) {
    return NextResponse.json({ error: 'Split sheet not found' }, { status: 404 })
  }

  // ── §7 identity-update action — a distinct action from approve/counter,
  // never gated by the "already used" approval_status check below (a
  // party who already approved may still correct their own identity). ──
  if (action === 'update_identity') {
    // Freeze boundary (lib/split-sheets/lifecycle.ts): a minted or
    // executed document's party identity is frozen — refuse rather than
    // silently re-animating a signed/minting document's identity.
    if (sheet.status === 'esign_pending' || sheet.status === 'executed') {
      return NextResponse.json({ error: 'This split sheet can no longer be edited.' }, { status: 409 })
    }

    const update: Record<string, string | null> = {}
    for (const key of IDENTITY_FIELDS) {
      if (!(key in body)) continue
      const value = body[key]
      if (typeof value === 'string') {
        const trimmed = value.trim()
        update[key] = trimmed === '' ? null : trimmed
      } else if (value === null) {
        update[key] = null
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No identity fields provided' }, { status: 400 })
    }

    // Write target resolved strictly from the token-matched party row
    // above — never a client-supplied party id (T-18-01b).
    const { error: updateError } = await service
      .from('split_sheet_parties')
      .update(update)
      .eq('id', party.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Reuse on future sheets (deliberation §7): OVERWRITE the linked
    // collaborators row too, when this party is linked to one — this is
    // the person's own verified data correcting itself (deliberation §1),
    // never a call into or mutation of backfill_claimed_collaborators()
    // (research Pitfall 5; that function stays additive/COALESCE for its
    // own unrelated callers).
    if (party.collaborator_id) {
      await service.from('collaborators').update(update).eq('id', party.collaborator_id)
    }

    return NextResponse.json({ ok: true })
  }

  // Reject if already in a final state (already-used guard) — applies to
  // approve/counter only; an identity correction is handled above and
  // never reaches this gate.
  const finalStatuses = ['approved', 'countered']
  if (finalStatuses.includes(party.approval_status)) {
    return NextResponse.json({ error: 'This link has already been used' }, { status: 410 })
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
