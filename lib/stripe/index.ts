import Stripe from 'stripe'
if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set')
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
// ─── Member subscription prices ──────────────────────────────────────────
// Keys are the TIER NAMES the product sells, owner-ruled 2026-09-26: Writer,
// Studio, Team, Entourage. Renamed from pro_*, which matched no tier — a
// pure rename, safe because no live Stripe price is bound yet and nothing
// consumed this map (Phase 47.0). Keep these keys and the tier names
// identical: the key is what appears in every Stripe dashboard and export.
//
// WRITER is deliberately absent — it is the free tier and has no price.
// ENTOURAGE is deliberately absent — custom, negotiated per organization,
//   so it has no standard recurring price to bind.
// FOUNDING_MEMBER is not a public tier. It is a limited, signup-code-gated
//   LIFETIME membership for early adopters who do not want a subscription
//   (owner 2026-09-26; the cap is undecided). One-time, not recurring.
export const STRIPE_PRICES = {
  studio_monthly: process.env.STRIPE_PRICE_STUDIO_MONTHLY!,
  studio_yearly: process.env.STRIPE_PRICE_STUDIO_YEARLY!,
  team_monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY!,
  team_yearly: process.env.STRIPE_PRICE_TEAM_YEARLY!,
  founding_member: process.env.STRIPE_PRICE_FOUNDING!,
} as const
export type StripePriceKey = keyof typeof STRIPE_PRICES
