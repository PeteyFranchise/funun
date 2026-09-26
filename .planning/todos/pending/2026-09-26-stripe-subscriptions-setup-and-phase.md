# Stripe subscriptions — owner setup, then checkout/billing as its own phase

**Captured:** 2026-09-26 · **Status:** open — owner action first, then a phase
**Came from:** marketing CTA #4, "Start a trial" on the Studio tier — there is no trial, no
checkout and no subscription anywhere, so the button has nothing to point at.
**Not urgent:** beta is invite-only (owner, 2026-09-26: *"most people won't pass that gate
anyway"*). This is groundwork, not a conversion blocker.

## What is already there — more than expected

- **A subscription price map exists and is unused.** `lib/stripe/index.ts` declares
  `STRIPE_PRICES` with five keys — `pro_monthly`, `pro_yearly`, `studio_monthly`, `studio_yearly`,
  `founding_member` — all env-driven. **Nothing consumes it**: grepped `app/`, `lib/` and
  `components/` for `STRIPE_PRICES` and `StripePriceKey`, and the only hit is the declaration.
- **The env vars are already documented.** `.env.example:21-25` lists all five
  `STRIPE_PRICE_*` names alongside `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
- **Stripe is live in the app, for other things.** Connect payouts (`lib/stripe/connect.ts`,
  `app/api/settings/payouts`) and per-deal payment (`app/api/admin/deals/[id]/pay`). Money going
  **out** and per-deal money coming in — no subscriptions.
- **No trial concept anywhere.** No `trial_end`, `trial_period`, `free_trial` or `'trialing'` in
  `lib/`, `app/` or the migrations. "Start a trial" would be a net-new concept, not a Stripe toggle.

## ⚠️ Settle this BEFORE creating anything in Stripe

**The price keys and the marketing tiers do not match.**

| `lib/stripe/index.ts` | marketing page |
|---|---|
| `pro_monthly` / `pro_yearly` | — (no "Pro" tier exists on the page) |
| `studio_monthly` / `studio_yearly` | **Studio — $19** ✓ |
| `founding_member` | — (not on the page) |
| — | **Writer — free** |
| — | **Team — $49** |
| — | **Entourage — custom** |

Only Studio survives the comparison. Create Stripe products against the current names and
`STRIPE_PRICE_PRO_MONTHLY` ends up powering a tier the page calls **Team**, permanently, in every
dashboard and export. Rename the keys to the tier names first — or decide the page's tiers are the
ones that are wrong. Either way it is cheaper now than after live prices exist.

**RESOLVED 2026-09-26.** Owner ruled: **Writer, Studio, Team, Entourage.** Keys renamed to match
while no Stripe product existed, so it was a pure rename — `pro_*` → `team_*`, `studio_*`
unchanged, Writer absent (free), Entourage absent (negotiated, no standard recurring price).
Touched `lib/stripe/index.ts`, `.env.example`, `docs/observability/VENDOR-DIRECTORY.md`,
`.planning/codebase/INTEGRATIONS.md`. `typecheck:strict` and `lint` clean.

**`founding_member` stays, and now means something.** Owner, same day: a **signup-code-gated,
limited, lifetime** membership for early adopters *"who don't want a subscription"* — one-time, not
recurring, with a cap that is **undecided**. Roadmapped as Phase 47.5. The three hard parts are a
server-enforced cap that cannot oversell, a one-time rather than recurring price, and an
entitlement that has to keep granting access forever with no renewal event — including after the
tiers change.

## ⚠️ The webhook collides

`app/api/webhooks/stripe/route.ts:51` already handles **`checkout.session.completed`** — for deal
payments. **Subscription checkout fires the same event type.** Until that handler disambiguates by
mode or metadata, a subscription payment could be processed as a deal payment. This is a money
path: it needs to be settled in the phase's first slice, not discovered in production.

`account.updated` (line 87) is Connect and is unaffected.

## Owner action

Create the products and recurring prices in Stripe **test mode** and fill the five
`STRIPE_PRICE_*` values — **after the naming above is settled.**

**Standing rule:** after any `.env.local` change, fully overwrite the `Funūn .env.local` note in
Dashlane. Adding five price ids counts.

## Then, as its own phase

1. **Webhook disambiguation** — subscription vs deal on `checkout.session.completed`. First,
   because it is the money bug.
2. **Checkout** — a session creation route, per price key.
3. **Subscription state** — where a member's plan lives, and its lifecycle (active, past due,
   cancelled, resumed).
4. **Entitlements — the real scope.** Nothing in the app currently reads a plan. Every row on the
   marketing page's tier cards is a promise about what a plan unlocks, and **not one of them is
   enforced anywhere today.** Deciding what each tier actually gates is a bigger piece of work
   than taking the payment, and it is where the pricing copy becomes a claim the code has to keep.
5. Billing portal, proration, cancellation, tax.
6. **A trial, if wanted** — net-new, and worth deciding whether it is a Stripe trial or an
   invite-era grace period, which during beta may be the same thing.

## Beta context

Invite-only today, so the funnel mostly ends at the gate — and the denial capture already exists:
`POST /api/waitlist` is public, Turnstile-protected, rate-limited on IP and email, with working
unsubscribe/resubscribe tokens (Phase 27, *"D-11's inline denial capture"*). That is the honest
destination for paid-tier CTAs until subscriptions are real.

Owner also noted the tier numbers work as cost tiers and wants **Codex's read on them** — worth
doing alongside, since the entitlement question above is what makes the numbers defensible.
