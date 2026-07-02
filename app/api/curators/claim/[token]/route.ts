import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'

// ─── POST /api/curators/claim/[token] ────────────────────────────────────
// Verifies a 72h-expiry, one-time claim token (issued via the admin
// issue_claim action) and creates a lightweight magic-link curator account
// (PITCH-05, D-18/D-19). Public — no session required to call this route;
// the token itself is the authentication.
//
// CRITICAL (RESEARCH.md Pitfall 1 / T-06-01): app_metadata.role='curator'
// MUST be set AT createUser() time, not via a post-insert UPDATE — that is
// what makes handle_new_user()'s curator branch (migration 030) fire and
// skip the artist_profiles/subscriptions insert for this account.
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceClient()

  const { data: curator, error: fetchError } = await service
    .from('curators')
    .select('id, email, claim_token_expires_at, claimed_by')
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
    subject: 'Sign in to your Funūn curator profile',
  }

  // app_metadata.role MUST be set here, at creation — a bare createUser() or
  // a post-insert UPDATE would let handle_new_user() create an artist
  // profile for this account (T-06-01).
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: curator.email,
    email_confirm: true,
    app_metadata: { role: 'curator' },
  })

  if (createError || !created?.user) {
    // Edge case (RESEARCH.md Open Question 4): the email already belongs to
    // an existing auth.users row (e.g. a prior artist account). Do not
    // touch that account's role or profile — just reuse its id to link the
    // curator record, and still send a magic link.
    const { data: existing, error: linkError } = await service.auth.admin.generateLink({
      type: 'magiclink',
      email: curator.email,
    })
    if (linkError || !existing?.user) {
      return NextResponse.json(
        { error: createError?.message ?? 'Could not create account' },
        { status: 500 }
      )
    }

    const { error: claimError } = await service
      .from('curators')
      .update({ claimed_by: existing.user.id, claim_token: null })
      .eq('id', curator.id)
    if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 })

    await sendEmail({
      ...emailPayload,
      html: `<p>Sign in to your curator profile:</p><p><a href="${existing.properties.action_link}">Sign in</a></p>`,
    })

    return NextResponse.json({ ok: true })
  }

  const { error: claimError } = await service
    .from('curators')
    .update({ claimed_by: created.user.id, claim_token: null })
    .eq('id', curator.id)
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 })

  // Send the actual magic link via Resend (lib/email), not Supabase's
  // built-in email templates — matches how this app already owns all its
  // transactional email.
  const { data: link } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: curator.email,
  })
  if (link?.properties?.action_link) {
    await sendEmail({
      ...emailPayload,
      html: `<p>Sign in to your curator profile:</p><p><a href="${link.properties.action_link}">Sign in</a></p>`,
    })
  }

  return NextResponse.json({ ok: true })
}
