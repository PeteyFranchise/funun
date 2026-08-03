import type Stripe from 'stripe'
import { computeNetFee } from '@/lib/deals/commission'

// ─── Stripe Connect money rails (D-17/D-17a/D-20) ────────────────────────
// Artists onboard to Stripe Connect Express requesting the TRANSFERS
// capability only — the connected account is purely a payout destination,
// it never accepts a card charge (RESEARCH Pitfall 5: requesting
// card_payments here would pull the artist into Stripe's card-acceptance
// business rules and the wrong onboarding flow). Funūn stays merchant of
// record for every deal (D-17): a buyer pays through a Stripe-hosted
// Checkout Session (payment mode) whose underlying PaymentIntent carries a
// destination transfer + application fee, so the commission/net split
// happens automatically at charge time — the classic Express "destination
// charge" pattern. This deliberately uses classic Express accounts, not the
// newer configurable-accounts API surface (RESEARCH Assumption A7: watch,
// do not adopt mid-phase).
//
// Fast-follow note: billing via Checkout (payment mode) rather than Stripe
// Invoicing is a deliberate resolution of RESEARCH Open Question 2 —
// lower build surface at 3-5-deal beta volume, and Stripe hosts the
// payment page so no card data ever reaches Funūn. Net-terms invoicing is
// a fast-follow if real buyers ask for it.
//
// The two pure builders below make NO network calls, so the fee math (the
// no-rounding-leak invariant) is unit-testable without any Stripe keys
// configured — see connect.test.ts. The I/O wrappers dynamically import
// the configured `stripe` singleton from lib/stripe/index.ts INSIDE each
// function body (never at this module's top level) so importing this
// module for its pure builders never trips lib/stripe/index.ts's
// "STRIPE_SECRET_KEY is not set" guard in a test environment that has no
// Stripe keys loaded — this keeps connect.test.ts runnable without any
// live credentials while still reusing the ONE configured Stripe client
// (never constructing a second instance).

// ─── Pure builders (no I/O; unit-testable without keys) ──────────────────

export function buildExpressAccountParams(country: string): Stripe.AccountCreateParams {
  return {
    type: 'express',
    country,
    capabilities: {
      // Transfers ONLY — see header note. card_payments is intentionally
      // absent, not merely unrequested.
      transfers: { requested: true },
    },
  }
}

export type PayableDeal = {
  id: string
  gross_fee_cents: number | null
  commission_pct: number | null
}

export type DestinationChargeParams = {
  amountCents: number
  currency: 'usd'
  applicationFeeAmountCents: number
  transferDestination: string
}

export function buildDestinationChargeParams(
  deal: PayableDeal,
  connectedAccountId: string | null
): DestinationChargeParams {
  if (deal.gross_fee_cents == null) {
    throw new Error(
      `Deal ${deal.id} has no gross fee set — cannot create a charge before pricing is agreed.`
    )
  }
  if (deal.commission_pct == null) {
    throw new Error(
      `Deal ${deal.id} has no commission percentage set — cannot create a charge before economics are agreed.`
    )
  }
  if (!connectedAccountId) {
    throw new Error(
      `Deal ${deal.id} has no onboarded artist connected account — the artist must complete Stripe Connect onboarding before this deal can be paid.`
    )
  }

  // Derived from the SAME computeNetFee the admin PATCH route (16-07) uses
  // to persist commission_pct/artist_net_cents — never re-derived
  // independently, so the Stripe split and the stored economics can never
  // drift apart (D-20/T-16-33). commissionCents + artistNetCents always
  // equals grossCents by computeNetFee's own construction (artist net is
  // derived by subtraction, not computed independently), which is exactly
  // the no-rounding-leak invariant this function's callers rely on.
  const { commissionCents } = computeNetFee(deal.gross_fee_cents, deal.commission_pct)

  return {
    amountCents: deal.gross_fee_cents,
    currency: 'usd',
    applicationFeeAmountCents: commissionCents,
    transferDestination: connectedAccountId,
  }
}

// ─── I/O wrappers (dynamic `stripe` import — see header note) ────────────

export async function createExpressAccount(country: string): Promise<Stripe.Account> {
  const { stripe } = await import('@/lib/stripe')
  return stripe.accounts.create(buildExpressAccountParams(country))
}

export async function createAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string
): Promise<Stripe.AccountLink> {
  const { stripe } = await import('@/lib/stripe')
  return stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: refreshUrl,
    return_url: returnUrl,
  })
}

export type AccountOnboardingStatus = {
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
}

// Live truth from Stripe — callers persist the refresh themselves so the
// account.updated webhook and this on-demand check never disagree for
// long (the payouts-settings GET route uses this so the UI never merely
// assumes success after a redirect back from Stripe-hosted onboarding).
export async function retrieveAccountStatus(accountId: string): Promise<AccountOnboardingStatus> {
  const { stripe } = await import('@/lib/stripe')
  const account = await stripe.accounts.retrieve(accountId)
  return {
    chargesEnabled: !!account.charges_enabled,
    payoutsEnabled: !!account.payouts_enabled,
    detailsSubmitted: !!account.details_submitted,
  }
}

// Takes ALREADY-COMPUTED charge params (built via buildDestinationChargeParams)
// rather than a raw deal, so the caller (the admin pay route) is the one
// visibly calling buildDestinationChargeParams at charge-creation time —
// keeping the "recompute the fee from stored economics, never trust the
// client" step in the open rather than buried inside this thin I/O
// wrapper.
export async function createCheckoutSessionForCharge(
  params: DestinationChargeParams,
  opts: { successUrl: string; cancelUrl: string; description: string; licenseRequestId: string }
): Promise<Stripe.Checkout.Session> {
  const { stripe } = await import('@/lib/stripe')

  return stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    line_items: [
      {
        price_data: {
          currency: params.currency,
          unit_amount: params.amountCents,
          product_data: { name: opts.description },
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: params.applicationFeeAmountCents,
      transfer_data: { destination: params.transferDestination },
    },
    metadata: { license_request_id: opts.licenseRequestId },
  })
}
