import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createExpressAccount, createAccountLink, retrieveAccountStatus } from '@/lib/stripe/connect'

const STATUS_COLUMNS =
  'stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled, stripe_connect_details_submitted'

// ─── GET /api/settings/payouts — current onboarding status (D-17a) ───────
// Reports REAL status, never assumed-success-after-redirect: when a
// connected account id is stored, this makes a LIVE stripe.accounts.retrieve
// call so charges_enabled/payouts_enabled reflect Stripe's current truth,
// persisting the refresh so this route and the account.updated webhook
// never disagree for long. Falls back to the last-known stored state if
// Stripe can't be reached, rather than surfacing a hard error.
export async function GET() {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile, error } = await service
    .from('user_profiles')
    .select(STATUS_COLUMNS)
    .eq('id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!profile?.stripe_connect_account_id) {
    return NextResponse.json({ status: 'not_started' })
  }

  try {
    const live = await retrieveAccountStatus(profile.stripe_connect_account_id)

    await service
      .from('user_profiles')
      .update({
        stripe_connect_charges_enabled: live.chargesEnabled,
        stripe_connect_payouts_enabled: live.payoutsEnabled,
        stripe_connect_details_submitted: live.detailsSubmitted,
      })
      .eq('id', user.id)

    return NextResponse.json({
      status: live.payoutsEnabled && live.detailsSubmitted ? 'complete' : 'in_progress',
      chargesEnabled: live.chargesEnabled,
      payoutsEnabled: live.payoutsEnabled,
      detailsSubmitted: live.detailsSubmitted,
    })
  } catch (err) {
    // Stripe unreachable / retrieval failed — serve the last-known stored
    // state rather than blanking out the Payouts page on a transient
    // Stripe outage.
    return NextResponse.json({
      status:
        profile.stripe_connect_payouts_enabled && profile.stripe_connect_details_submitted
          ? 'complete'
          : 'in_progress',
      chargesEnabled: profile.stripe_connect_charges_enabled,
      payoutsEnabled: profile.stripe_connect_payouts_enabled,
      detailsSubmitted: profile.stripe_connect_details_submitted,
      stale: true,
      error: err instanceof Error ? err.message : 'Stripe status check failed',
    })
  }
}

// ─── POST /api/settings/payouts — start or resume onboarding (D-17a) ─────
// Creates an Express account (transfers-only) on first call, persists the
// connected account id, then ALWAYS returns a fresh Account Link — Stripe
// hosts the onboarding UI end to end. Funūn never builds a custom
// KYC/identity form (that would pull Funūn into a compliance surface
// Stripe already owns) and never emails the account link (Stripe's own
// documentation warns against it) — the client redirects the browser
// directly to the returned URL.
export async function POST(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile, error: fetchError } = await service
    .from('user_profiles')
    .select('stripe_connect_account_id, isrc_country_code')
    .eq('id', user.id)
    .maybeSingle()

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

  let accountId = profile?.stripe_connect_account_id ?? null

  if (!accountId) {
    const country = profile?.isrc_country_code || 'US'

    let account
    try {
      account = await createExpressAccount(country)
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Could not create a Stripe Connect account.' },
        { status: 400 }
      )
    }
    accountId = account.id

    const { error: updateError } = await service
      .from('user_profiles')
      .update({ stripe_connect_account_id: accountId })
      .eq('id', user.id)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const origin = new URL(request.url).origin

  let link
  try {
    link = await createAccountLink(
      accountId,
      `${origin}/settings/payouts?refresh=true`,
      `${origin}/settings/payouts?onboarded=true`
    )
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not create the Stripe onboarding link.' },
      { status: 400 }
    )
  }

  return NextResponse.json({ url: link.url })
}
