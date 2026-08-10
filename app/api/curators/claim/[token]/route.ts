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
// NOTE (migration 104 / 27-CODEX-REVIEW follow-up): on this Supabase,
// app_metadata is applied AFTER the auth.users INSERT, so handle_new_user()'s
// industry branch (migration 039) does NOT fire at INSERT — the account is
// created via the default branch and provisionIndustryAccount() reconciles it
// to industry afterward. app_metadata.role='industry' is still set AT
// createUser() time (never a post-insert UPDATE) as defense in depth, but what
// actually admits the account past the artist invite gate is the single-use
// account_provision_intents token that provisionIndustryAccount() writes (via
// createUserWithProvisionIntent). This route does NOT call admin.createUser()
// directly and NEVER mints app_metadata.role='curator'. It also does NOT call
// createIndustryMember() wholesale — that would send its own cold-invite email
// on top of this route's curator-claim copy (RESEARCH Pitfall 4).
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

  let { data: claimed, error: claimError } = await service
    .from('curators')
    .update({ claimed_by: userId, claim_token: null })
    .eq('id', curator.id)
    .eq('claim_token', token)
    .is('claimed_by', null)
    .select('id')
    .maybeSingle()

  // We just created a NEW industry account (userId). A hard transport error on
  // our claim UPDATE is AMBIGUOUS — the UPDATE may have COMMITTED (response
  // lost), or a concurrent claim may have linked THIS SAME account (email is
  // unique in auth.users, so a racing request reuses userId via the
  // Duplicate→fallback path above). Deleting the account here is UNSAFE: it
  // could destroy a legitimately-linked account, or one our own UPDATE actually
  // committed (27-CODEX-REVIEW final review, HIGH). So NEVER delete — instead
  // re-attempt the IDEMPOTENT claim once to resolve the true state. The retry
  // either lands our claim, or no-ops because the row is already linked to this
  // account (our earlier commit or a concurrent claim reusing userId); both are
  // success. Only a second transport failure leaves it for manual
  // reconciliation — still without deleting. (A zero-ROW result, `!claimed`, is
  // likewise never an orphan and never deletes: it means the row is already
  // claimed by this same account.)
  if (claimError) {
    const retry = await service
      .from('curators')
      .update({ claimed_by: userId, claim_token: null })
      .eq('id', curator.id)
      .eq('claim_token', token)
      .is('claimed_by', null)
      .select('id')
      .maybeSingle()
    if (retry.error) {
      return NextResponse.json(
        {
          error:
            `We couldn't confirm your account claim. Your account may already be ` +
            `set up — try signing in, or contact support if no email arrives. ` +
            `(${retry.error.message})`,
        },
        { status: 500 }
      )
    }
    claimed = retry.data ?? { id: curator.id }
    claimError = null
  }

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
