import Stripe from 'stripe'
if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set')
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' })
export const STRIPE_PRICES = {
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY!,
  pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY!,
  studio_monthly: process.env.STRIPE_PRICE_STUDIO_MONTHLY!,
  studio_yearly: process.env.STRIPE_PRICE_STUDIO_YEARLY!,
  founding_member: process.env.STRIPE_PRICE_FOUNDING!,
} as const
export type StripePriceKey = keyof typeof STRIPE_PRICES
