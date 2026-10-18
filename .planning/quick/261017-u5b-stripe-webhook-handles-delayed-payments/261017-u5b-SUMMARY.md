---
phase: quick-261017-u5b
plan: 01
status: complete
requirements: [GH-189]
commits:
  - 86a2de92 test(stripe-webhook): cover delayed payments, refunds and disputes
  - b98f6f6c fix(stripe-webhook): complete delayed payments via async_payment_succeeded
  - f8595595 feat(db): add reset_license_checkout RPC for dead Stripe sessions (migration 247)
  - 5f29e71e fix(stripe-webhook): apply adversarial-review fixes
files_modified:
  - app/api/webhooks/stripe/route.ts
  - __tests__/stripe-webhook.test.ts
files_created:
  - supabase/migrations/247_reset_license_checkout.sql
  - __tests__/migration-247-reset-license-checkout.test.ts
verification:
  stripe_webhook_tests: "32 passed, 0 failed"
  migration_247_tests: "5 passed, 0 failed"
  npm_test: "667 suites passed, 8430 tests passed, 0 failed"
  security_migrations_verify: "PASS (migrations 214-218 checks)"
  lint: "exit 0, zero warnings (--max-warnings=0)"
  typecheck_strict: "exit 0"
---

# Quick 261017-u5b: Stripe webhook handles delayed payments

The Stripe webhook completes deals paid by delayed methods (ACH and similar) when the money clears, resets deals whose Checkout Session can no longer complete, and reports refunds, disputes and payment anomalies to Sentry instead of swallowing them.

Migration 247 is authored and committed but NOT applied. Until the owner applies it, the two reset events (`async_payment_failed`, `checkout.session.expired`) get a 503 from the missing RPC and Stripe will keep retrying them. Apply 247 before, or together with, deploying this route.

## What changed

- `app/api/webhooks/stripe/route.ts`
  - `completePaidCheckout()` holds the metadata checks, PaymentIntent retrieval and `complete_license_checkout` RPC with the 400/503/409 mapping. The RPC is called from this one place only. Its precondition (`payment_status === 'paid'`) is enforced by the caller; the former in-helper guard was dead code and was removed.
  - `checkout.session.completed` and `checkout.session.async_payment_succeeded` with a `paid` session go through it. A 400 (missing reconciliation data) and a 409 (database rejected the economics, money captured but deal not marked paid) are each reported to Sentry at `error` before returning.
  - A `checkout.session.completed` with `unpaid` status (delayed method) returns 200, writes nothing, and reports at `info` so delayed-payment volume is visible. Any other non-paid status (for example `no_payment_required`), or an unpaid `async_payment_succeeded`, returns 200, writes nothing, and reports at `warning`.
  - `checkout.session.async_payment_failed` and `checkout.session.expired` call the new `reset_license_checkout` RPC (migration 247) with the deal id and session id. 200 whether or not a row was reset, 503 on RPC error (also reported at `error`). `async_payment_failed` additionally reports at `warning`; expiry is not reported. A session with no deal id skips the reset.
  - `charge.refunded` and `charge.dispute.*` return 200, write nothing, and report to Sentry: `error` for `charge.dispute.created`, `warning` for refunds and every other dispute subtype.
  - Sentry extras use `checkout_ref` for the Checkout Session id. `lib/observability/scrub.ts` redacts any key matching `/session/i`, so the previous `session_id` key arrived as `[redacted]`.
  - Every capture is followed by `await Sentry.flush(2000)` inside a try/catch, so events survive a serverless freeze and a Sentry failure never changes the response.
  - Header comment rewritten so each claim matches the code.
- `supabase/migrations/247_reset_license_checkout.sql`: `reset_license_checkout(p_deal_id uuid, p_checkout_session_id text)`, SECURITY DEFINER, `SET search_path = ''`, EXECUTE granted to `service_role` only. One UPDATE sets `payment_status = 'unpaid'` and clears `stripe_checkout_session_id`, `stripe_checkout_url`, `stripe_checkout_economics_fingerprint`, `checkout_claim_token`, `checkout_claimed_at`, `checkout_economics_fingerprint`, only `WHERE` the deal is `awaiting_payment` or `creating_payment` and the stored session id equals the argument. It never writes `paid`, `stripe_payment_intent_id` or `paid_at`. Numbers 244 and 246 are reserved by other open branches; 245 is merged.
- `__tests__/migration-247-reset-license-checkout.test.ts`: SQL text test (human-gated header, single transaction, definer hardening, grants, guard clause, cleared columns, argument validation).
- `__tests__/stripe-webhook.test.ts`: Sentry mock now includes `flush`; new cases for the info and warning acknowledgements, 400/409 alerts, both reset events, reset RPC error (503), no-row reset (200), dispute subtypes, flush ordering, flush rejection and `captureMessage` throwing leaving the response unchanged, and a test that runs every captured payload through `scrubKnownSensitiveKeys` and asserts the Stripe ids survive.

## TDD

RED commit 86a2de92: 7 new cases failed against the old route for the expected reasons. GREEN commit b98f6f6c: all pass. The review-fix commits were written test-alongside rather than RED-first.

## Deviations from plan

The review follow-up (findings 1 to 7 from the adversarial review) was applied on top of the original plan. Environment note: `npm run lint` through the shell's rtk wrapper fails with a bogus "couldn't find eslint.config" error because the wrapper drops the `ESLINT_USE_FLAT_CONFIG=false` set in the npm script. Run via `rtk proxy npm run lint` it exits 0 with no warnings.

## Verification

| Check | Result |
|---|---|
| `npx jest __tests__/stripe-webhook.test.ts __tests__/migration-247-reset-license-checkout.test.ts` | 37 passed (32 webhook, 5 migration), 0 failed |
| `npm test` | 667 suites, 8430 tests, all passed |
| `npm run security:migrations:verify` | PASS |
| `npm run lint` | exit 0, zero warnings |
| `npm run typecheck:strict` | exit 0 |

## Known stubs

None.

## Owner decisions needed

1. **Refund/dispute persistence (still open).** `license_requests.payment_status` allows only `unpaid | creating_payment | awaiting_payment | paid`, so there is no honest place to record a refund or dispute. Options: (a) extend the CHECK with `refunded` / `partially_refunded` / `disputed` plus columns like `refunded_at`, `refunded_amount_cents`, `dispute_status`, `dispute_id`, written by a new SECURITY DEFINER service-role RPC keyed on `stripe_payment_intent_id`; or (b) a separate append-only `license_payment_events` ledger. Also decide whether a refund or lost dispute should revoke buyer delivery (plan 16-10 unlocks delivery on `paid`). Until then these events are only visible in Sentry and the Stripe dashboard. This is why the commit says "Refs #189", not "Closes".
2. **Async payment failure recovery (handled, pending apply).** After `async_payment_failed` or `checkout.session.expired` the webhook now calls `reset_license_checkout` (migration 247), which returns the deal to `unpaid` so the admin can issue a new checkout. Owner action: review and apply 247. The webhook returns 503 for those two events until it is applied.
3. **Payment methods (still open).** `lib/stripe/connect.ts` leaves `payment_method_types` unset (dynamic payment methods). Delayed methods are now handled, but if the owner wants card-only to avoid delayed settlement entirely, set `payment_method_types: ['card']` in a follow-up.
4. **Stripe dashboard subscription (deploy gate).** The webhook endpoint must be subscribed to `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded` and `charge.dispute.created` (and the other `charge.dispute.*` subtypes you want reported). Without `async_payment_succeeded`, delayed-method deals are never marked paid, so this subscription must be confirmed before deploying.
