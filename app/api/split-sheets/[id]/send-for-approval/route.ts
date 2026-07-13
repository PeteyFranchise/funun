import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import {
  generateApprovalToken,
  validateApprovalTotal,
  APPROVAL_TOKEN_EXPIRY_DAYS,
} from '@/lib/split-sheets/approval'
import { sendEmail } from '@/lib/email'

// ─── POST /api/split-sheets/[id]/send-for-approval ───────────────────
// Generates a per-party approval token and emails each party the link to
// /approve/[token]. Ownership verified via .eq('initiator_user_id') before
// any service-client write (T-01-12).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── 1. Auth gate — must be an authenticated user ──────────────────
  const apiClient = await createApiClient()
  const {
    data: { user },
  } = await apiClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // ── 2. Verify ownership before any service-client write (T-01-12) ─
  const { data: sheet, error: sheetError } = await apiClient
    .from('split_sheets')
    .select('*, split_sheet_parties(*)')
    .eq('id', id)
    .eq('initiator_user_id', user.id)
    .maybeSingle()

  if (sheetError || !sheet) {
    return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 })
  }

  // ── 3. Re-validate 100% total before sending ─────────────────────
  const parties = (sheet.split_sheet_parties ?? []) as {
    id: string
    name: string
    email: string | null
    role: string | null
    split_percentage: number
  }[]

  if (parties.length === 0) {
    return NextResponse.json({ error: 'Split sheet has no parties' }, { status: 400 })
  }

  if (!validateApprovalTotal(parties.map(p => p.split_percentage))) {
    return NextResponse.json({ error: 'Splits must total 100% before sending' }, { status: 400 })
  }

  // ── 4. Service client — cross-user party rows (ownership already verified) ─
  const service = createServiceClient()

  // Calculate expiry date
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + APPROVAL_TOKEN_EXPIRY_DAYS)

  // ── 5. Generate tokens + update each party row ────────────────────
  const tokenMap: Record<string, string> = {}
  for (const party of parties) {
    const token = generateApprovalToken()
    tokenMap[party.id] = token
    await service
      .from('split_sheet_parties')
      .update({
        approval_token: token,
        token_expires_at: expiresAt.toISOString(),
        approval_status: 'pending',
      })
      .eq('id', party.id)
  }

  // Update sheet status to pending_approval
  await service
    .from('split_sheets')
    .update({ status: 'pending_approval' })
    .eq('id', id)

  // ── 6. Send approval emails (best-effort) ─────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const songName = sheet.song_name as string

  // Build a summary of all parties for the email body
  const splitSummaryRows = parties
    .map(p => `<tr><td style="padding:4px 8px">${p.name}</td><td style="padding:4px 8px;text-align:right">${p.split_percentage}%</td></tr>`)
    .join('')
  const splitSummaryHtml = `<table style="border-collapse:collapse;width:100%;max-width:400px"><tbody>${splitSummaryRows}</tbody></table>`

  const failed: string[] = []
  let sent = 0

  for (const party of parties) {
    if (!party.email) continue
    const token = tokenMap[party.id]
    const approveUrl = `${appUrl}/approve/${token}`

    const result = await sendEmail({
      to: party.email,
      subject: `Split sheet approval requested for "${songName}"`,
      html: `
        <h2>You've been sent a split sheet for approval</h2>
        <p>The song <strong>${songName}</strong> has the following proposed splits:</p>
        ${splitSummaryHtml}
        <p>Click the link below to approve or propose a different split:</p>
        <p><a href="${approveUrl}" style="display:inline-block;padding:10px 20px;background:#818CF8;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Review split sheet</a></p>
        <p style="color:#888;font-size:12px">This link expires in ${APPROVAL_TOKEN_EXPIRY_DAYS} days.</p>
      `,
      text: `Split sheet approval for "${songName}"\n\n${parties.map(p => `${p.name}: ${p.split_percentage}%`).join('\n')}\n\nReview: ${approveUrl}`,
    })

    if (result.ok) {
      sent++
    } else {
      failed.push(party.email)
    }
  }

  return NextResponse.json({ ok: true, sent, ...(failed.length > 0 ? { failed } : {}) })
}
