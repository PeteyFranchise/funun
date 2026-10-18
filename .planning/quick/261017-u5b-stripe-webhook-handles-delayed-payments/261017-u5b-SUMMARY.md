---
phase: quick-261017-u5b
plan: 01
status: complete
requirements: [GH-189]
commits:
  - 86a2de92 test(stripe-webhook): cover delayed payments, refunds and disputes
  - b98f6f6c fix(stripe-webhook): complete delayed payments via async_payment_succeeded
files_modified:
  - app/api/webhooks/stripe/route.ts
  - __tests__/stripe-webhook.test.ts
verification:
  stripe_webhook_tests: "20 passed, 0 failed"
  npm_test: "665 suites passed, 8348 tests passed, 0 failed"
  lint: "exit 0, zero warnings (--max-warnings=0)"
  typecheck_strict: "exit 0"
---

# Quick 261017-u5b: Stripe webhook handles delayed payments

The Stripe webhook now completes deals paid by delayed methods (ACH and similar) when the money clears, and acknowledges and reports refunds, disputes and failed async payments instead of silently swallowing them.

## What changed

- `app/api/webhooks/stripe/route.ts`
  - New `completePaidCheckout()` helper holds the metadata checks, PaymentIntent retrieval and `complete_license_checkout` RPC with the 400/503/409 mapping. The RPC is called from this one place only. The helper carries its own `payment_status !== 'paid'` guard that returns without completing.
  - `checkout.session.completed` and `checkout.session.async_payment_succeeded` both go through it. A non-paid session returns 200 before any PaymentIntent retrieval or write, so Stripe stops retrying. A paid session with missing metadata still returns 400.
  - `checkout.session.async_payment_failed`, `charge.refunded` and `charge.dispute.*` return 200, write nothing, and call `Sentry.captureMessage` with Stripe ids only (event id, session or object id, charge id, payment intent id, deal id for async failure). Level is `error` for `charge.dispute.created`, `warning` otherwise.
  - Header comment updated to describe the handled events.
- `__tests__/stripe-webhook.test.ts`: Sentry mock, `checkoutEvent` takes an optional event type, `chargeEvent` helper, the combined unpaid/incomplete test split in two, and a new describe block with 9 cases (unpaid 200, async success RPC args identical to the paid test, async success 409, async success 400 on missing metadata, async success unpaid guard, async failed, refund, dispute, unknown event).

No changes to `supabase/migrations`, `lib/stripe/connect.ts`, or the admin pay route.

## TDD

RED commit 86a2de92: 7 new cases failed against the old route for the expected reasons (unpaid returned 400, async events ignored, Sentry never called). GREEN commit b98f6f6c: all 20 pass.

## Deviations from plan

None. One environment note: `npm run lint` through the shell's rtk wrapper fails with a bogus "couldn't find eslint.config" error because the wrapper drops the `ESLINT_USE_FLAT_CONFIG=false` set in the npm script. Run via `rtk proxy npm run lint` it exits 0 with no warnings. Not a repo issue.

## Verification

| Check | Result |
|---|---|
| `npx jest __tests__/stripe-webhook.test.ts` | 20 passed, 0 failed |
| `npm test` | 665 suites, 8348 tests, all passed |
| `npm run lint` | exit 0, zero warnings |
| `npm run typecheck:strict` | exit 0 |
| `grep -c complete_license_checkout route.ts` | 1 |
| em/en dashes in added diff lines | 0 |

No unrelated failures, so no base comparison was needed.

## Known stubs

None.

## Owner decisions needed

1. **Refund/dispute persistence.** `license_requests.payment_status` allows only `unpaid | creating_payment | awaiting_payment | paid`, so there is no honest place to record a refund or dispute. Options: (a) extend the CHECK with `refunded` / `partially_refunded` / `disputed` plus columns like `refunded_at`, `refunded_amount_cents`, `dispute_status`, `dispute_id`, written by a new SECURITY DEFINER service-role RPC keyed on `stripe_payment_intent_id`; or (b) a separate append-only `license_payment_events` ledger. Also decide whether a refund or lost dispute should revoke buyer delivery (plan 16-10 unlocks delivery on `paid`). Until then these events are only visible in Sentry and the Stripe dashboard. This is why the commit says "Refs #189", not "Closes".
2. **Async payment failure recovery.** After `async_payment_failed` the deal stays `awaiting_payment` on a consumed session, and `claim_license_checkout` returns `'existing'` with the dead URL for the same fingerprint, so the admin cannot issue a new checkout. Needs a reset RPC (`awaiting_payment` to `unpaid`, clear session id/url/fingerprint) guarded on the session id, in a migration.
3. **Payment methods.** `lib/stripe/connect.ts` leaves `payment_method_types` unset (dynamic payment methods). That is now safe, but if the owner wants card-only to avoid delayed settlement and the stuck-session case above, set `payment_method_types: ['card']` in a follow-up.
4. **Stripe dashboard.** The webhook endpoint must be subscribed to `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded` and `charge.dispute.*`, or the new branches never fire.
