import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { provisionIndustryAccount, DuplicateIndustryMemberError } from '@/lib/industry/createIndustryMember'

// ─── POST /api/curators/claim/[token] ────────────────────────────────────
// Verifies a 72h-expiry, one-time claim token (issued via the admin
// issue_claim action) and turns a claimed curator directory row into a real
// Industry account (member_type='industry', badge playlist_curator) —
// INDUSTRY-04. Public — no session required to call this route; the token
// itself is the authentication.
//
// CRITICAL (RESEARCH.md Pitfall 1 / T-06-01 / T-28-03-02): app_metadata.role
// MUST be set AT createUser() time, not via a post-insert UPDATE — that is
// what makes handle_new_user()'s industry branch (migration 039) fire
// correctly instead of racing a phantom-row. provisionIndustryAccount()
// (lib/industry/createIndustryMember.ts) is the shared primitive that
// enforces this; this route does NOT call admin.createUser() directly and
// NEVER mints app_metadata.role='curator' again. It also does NOT call
// createIndustryMember() wholesale — that would send its own cold-invite
// email on top of this route's curator-claim copy (RESEARCH Pitfall 4).
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceClient()

  const { data: curator, error: fetchError } = await service
    .from('curators')
    .select('id, email, name, claim_token_expires_at, claimed_by')
    .eq('claim_token', token)
    .maybeSingle()

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!curator) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  if (curator.claimed_by) return NextResponse.json({ error: 'Already claimed' }, { status: 410 })
  if (curator.claim_token_expires_at && curator.claim_token_expires_at < new Date().toISOString()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 })
  }

  const emailPayload = {
    to: curator.email,
    subject: 'Your Funūn curator profile is now an Industry account',
  }

  let userId: string

  try {
    const provisioned = await provisionIndustryAccount({
      email: curator.email,
      displayName: curator.name ?? curator.email,
      roleSlugs: ['playlist_curator'],
    })
    userId = provisioned.userId
  } catch (err) {
    if (!(err instanceof DuplicateIndustryMemberError)) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Could not create account' },
        { status: 500 }
      )
    }

    // Edge case (RESEARCH.md Open Question 4): the email already belongs to
    // an existing auth.users row (e.g. a prior artist or industry account).
    // Do not touch that account's role or member_type — just reuse its id
    // to link the curator record, and still send a magic link.
    const { data: existing, error: linkError } = await service.auth.admin.generateLink({
      type: 'magiclink',
      email: curator.email,
    })
    if (linkError || !existing?.user) {
      return NextResponse.json(
        { error: linkError?.message ?? 'Could not create account' },
        { status: 500 }
      )
    }

    const { data: claimed, error: claimError } = await service
      .from('curators')
      .update({ claimed_by: existing.user.id, claim_token: null })
      .eq('id', curator.id)
      .eq('claim_token', token)
      .is('claimed_by', null)
      .select('id')
      .maybeSingle()
    if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 })
    if (!claimed) return NextResponse.json({ error: 'Already claimed' }, { status: 410 })

    await sendEmail({
      ...emailPayload,
      html: `<p>Sign in to your account:</p><p><a href="${existing.properties.action_link}">Sign in</a></p>`,
    })

    return NextResponse.json({ ok: true })
  }

  const { data: claimed, error: claimError } = await service
    .from('curators')
    .update({ claimed_by: userId, claim_token: null })
    .eq('id', curator.id)
    .eq('claim_token', token)
    .is('claimed_by', null)
    .select('id')
    .maybeSingle()
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 })
  if (!claimed) return NextResponse.json({ error: 'Already claimed' }, { status: 410 })

  // Send the actual magic link via Resend (lib/email), not Supabase's
  // built-in email templates — matches how this app already owns all its
  // transactional email. This is the route's OWN curator-claim welcome
  // copy — provisionIndustryAccount() never sends email itself.
  const { data: link } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: curator.email,
  })
  if (link?.properties?.action_link) {
    await sendEmail({
      ...emailPayload,
      html: `<p>Your curator profile is now a Funūn Industry account. Sign in:</p><p><a href="${link.properties.action_link}">Sign in</a></p>`,
    })
  }

  return NextResponse.json({ ok: true })
}
