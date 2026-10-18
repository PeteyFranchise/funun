# Codebase Concerns

**Analysis Date:** 2026-10-18

**Scope:** Full repository (`app/`, `lib/`, `components/`, `middleware.ts`, `next.config.mjs`, `supabase/migrations/` 001-242, `.github/workflows/`, `.gitignore`).

**Method:** Read the request-path controls (middleware, webhooks, cron, rate limiter, public token routes, admin gates, storage, email templates). Swept all `SECURITY DEFINER` function definitions (235 unique names) and all `CREATE TABLE` statements (229) across the migrations, using the latest definition of each. Re-verified the findings in `.planning/security/2026-09-10-beta-adversarial-security-audit.md` and the 2026-09-03 items listed in the status table at the end, against current code. The 2026-08-30 external audit was not re-checked. Anything not listed in the status table was not re-checked.

**Not verifiable from the checkout:** live Supabase Auth settings, live storage bucket flags, Stripe dashboard payment-method settings, Vercel environment variables, and which migrations are applied in production. Those items are marked **verify**.

**Local caveats:** A local `tsc --noEmit` run is not conclusive. `node_modules` lacks `@sentry/nextjs` and `@supabase/ssr`, and `.next/types` is stale. `npm audit --omit=dev` reports 2 low-severity findings and no high or critical ones.

## Summary

| ID | Severity | Type | Title |
|----|----------|------|-------|
| SEC-01 | high | security | See advisory table below |
| SEC-02 | high | security **verify** | See advisory table below |
| SEC-03 | medium | security | See advisory table below |
| SEC-04 | medium | security | See advisory table below |
| SEC-05 | medium | security | See advisory table below |
| SEC-06 | low | security | See advisory table below |
| SEC-07 | low | security | See advisory table below |
| SEC-08 | low | security | See advisory table below |
| BUG-01 | medium | bug **verify** | Delayed-payment Stripe Checkout sessions never reconcile; refunds and disputes unhandled |
| BUG-02 | low | bug | Resend hard bounces suppress only curator addresses |
| PERF-01 | medium | perf **verify** | Middleware re-runs the claim POST on every navigation for ordinary accounts |
| PERF-02 | low | perf | Vendor-health page makes live vendor calls on every load |
| DEBT-01 | medium | debt | Route test coverage is 74 of 336 route files; no coverage gate |
| DEBT-02 | medium | debt | Several components and routes exceed 900 lines |
| DEBT-03 | low | debt | Dead storage helpers and unprovisioned bucket names in `lib/storage/index.ts` |
| DEBT-04 | low | debt | Stale comment on middleware matcher in `vendor-health` route |
| DEBT-05 | low | debt | Stripe client has no pinned API version |
| DEBT-06 | low | debt | Cron secret comparison is not constant-time |
| DEBT-07 | low | debt | Low-severity `mermaid`/`katex` advisory in production dependencies |
| DEBT-08 | low | debt | Lint and type escape hatches and TODO markers |

---

## Security Considerations

Open security findings are tracked in private GitHub Security Advisories on this repo, not here, so the details stay out of the public tree until they're fixed:

| ID | Severity | Advisory |
|----|----------|----------|
| SEC-01 | high | Public issue #188 (gitignore hygiene, no exposure) |
| SEC-02 | high | GHSA-2crg-39c2-xwr5 |
| SEC-03 | medium | GHSA-j9rc-hh3f-v55c |
| SEC-04 | medium | GHSA-p72w-64h6-cfvg |
| SEC-05 | medium | GHSA-hqfv-ff36-9mj7 |
| SEC-06 | low | GHSA-6hwj-8gpw-gxpm |
| SEC-07 | low | GHSA-928g-qv8v-x6q5 |
| SEC-08 | low | GHSA-f377-hmwq-3cfv |

**Accepted or intentional (not filed):** the global diagnostics rate-limit key, plaintext 128-bit Selects share tokens, the public buyer catalogue, and the post-sign-in redirect guard in `lib/auth/postSignInPath.ts` (no open redirect found).

### Confirmed resolved in code (previously reported)

| Source | Item | Current state | Evidence |
|--------|------|---------------|----------|
| 09-10 C1 | Invite identity claimed without email verification | Code fixed. Deployment **verify** | Migration 214 (header marks it human-gated). `supabase/config.toml:128` has `enable_confirmations = true` under `[auth.email]`. `app/api/signup/check-invite/route.ts:35-49` returns no account state without a valid invite token. Live Auth settings and migration 214 status must be confirmed. |
| 09-10 C2 | Vulnerable Next.js and Sharp | Resolved | `package.json` pins `next` 15.5.27. `npm audit --omit=dev` reports 0 high or critical. |
| 09-10 H1 | Duplicate live Checkout sessions | Resolved | `app/api/admin/deals/[id]/pay/route.ts:84-138` uses `claim_license_checkout` and `finalize_license_checkout` (migration 215). Webhook reconciliation gaps remain (BUG-01). |
| 09-10 H2 | Concurrent e-sign mints | Resolved | `app/api/split-sheets/[id]/mint-envelope/route.ts:365-425` claims with `claim_esign_mint` (migration 216). `:584` completes the claim. |
| 09-10 H3 | Playbook AI bypasses admission | Resolved | `app/api/admin/playbook/ask/route.ts:92-149` uses `claimAiUsage`, `aiProviderSignal`, and `finishAiUsage`. Per-hour limiter still fails open (SEC-07). |
| 09-10 H4 | Uploads buffered before size check | Resolved | `app/api/works/[workId]/versions/route.ts` returns 410 for direct audio. `lib/security/upload-admission.ts:23-40` requires `Content-Length` and enforces the limit. `app/api/earnings/import/route.ts:34-41` applies the same check. |
| 09-10 H5 | Social write abuse | Partially resolved | DM, wall, and green-room routes use `failClosed: true`. Residual: SEC-05 and SEC-07. |
| 09-10 H6 | Mutations not atomic with audit events | Resolved | `mutate_playbook_feature_control`, `open_playbook_incident`, and `change_playbook_incident_status` RPCs are used by `app/api/admin/playbook/activation/features/[key]/route.ts:42`, `app/api/admin/playbook/incidents/route.ts:59`, and `app/api/admin/playbook/incidents/[id]/route.ts:49`. |
| 09-10 M1 | Body parsed before auth on admin routes | Resolved | `middleware.ts:148-155` authenticates every `/api/admin/*` request before the handler runs. |
| 09-10 M2 | Raw provider and database errors returned | Mostly resolved | 22 routes return Zod issue messages verbatim. These are developer-authored, so acceptable. |
| 09-10 M3 | Weak vault project validation | Resolved | `app/api/vault/route.ts:9-17` uses a Zod schema. |
| 09-10 M5 | Preview pages in production | Resolved with caveat | `app/profile-preview/page.tsx` returns 404 in production unless `ENABLE_UI_PREVIEW` is set at build time. Confirm the flag is unset in Vercel. |
| 09-10 M6 | Demo-mode bypass | Resolved | `next.config.mjs:3-5` throws at build if `NEXT_PUBLIC_VAULT_DEMO` is `true` in production. `middleware.ts:103-106` skips auth only when `NODE_ENV !== 'production'`. |
| 09-10 M7 | Missing security headers | Resolved | `next.config.mjs` sets `nosniff`, `Referrer-Policy`, `Permissions-Policy`, and HSTS. `middleware.ts:46-61` sets CSP with `frame-ancestors 'none'`. |
| 09-10 M8 | Sentry scrubbing | Partially verified | `beforeSend` applies `scrubKnownSensitiveKeys` in `sentry.server.config.ts`, `sentry.edge.config.ts`, and `instrumentation-client.ts`. String-message scrubbing was not re-checked. |
| 09-10 M9 | Earnings import reports success after a failed save | Resolved | `app/api/earnings/import/route.ts:45-56` returns 503 on persistence failure. |
| 09-10 M4 | Playbook media completion trusts declared metadata | Not re-verified | Check `app/api/admin/playbook/media/[id]/complete/route.ts` before filing. |
| 09-03 C-01 | DocuSeal numeric submission IDs silently dropped | Resolved | `lib/esign/webhook.ts:70-78` normalizes numeric IDs with `String(value)`. |
| 09-03 M-06 | Resend hard-bounce persistence errors acknowledged | Resolved | `app/api/webhooks/resend/route.ts:38-47` returns 500 on a failed write, so Resend retries. |

---

## Known Bugs

### BUG-01 - Delayed-payment Checkout sessions never reconcile; refunds and disputes unhandled
**[bug] medium** **verify**

- Files:
  - `app/api/webhooks/stripe/route.ts:57` returns 400 when `session.payment_status !== 'paid'`
  - `app/api/webhooks/stripe/route.ts` handles only `checkout.session.completed` and `account.updated`. There is no `checkout.session.async_payment_succeeded`, `charge.refunded`, or `charge.dispute.*` handler (grep finds none).
  - `lib/stripe/connect.ts:177` creates `mode: 'payment'` without `payment_method_types`, so the methods offered come from the Stripe dashboard.
- Impact: If the dashboard enables a delayed method (ACH, bank debit, or similar), a completed-but-unpaid session returns 400. Stripe retries that for days, and the deal is never marked paid. Refunds and disputes do not update deal state.
- Verify: Dashboard payment-method settings for the live account.
- Fix: Handle `unpaid` completions as a 200 no-op with a pending state. Handle `checkout.session.async_payment_succeeded` through the same RPC. Add handlers for refund and dispute events. Or set `payment_method_types` explicitly to instant methods.

### BUG-02 - Resend hard bounces suppress only curator addresses
**[bug] low**

- File: `app/api/webhooks/resend/route.ts:38-47` updates only `curators.email_valid`.
- Impact: Hard-bounced addresses for collaborators, buyers, and invitations keep receiving mail. There is no shared suppression list consulted by `sendEmail`.
- Fix: Add a suppression table, write hard bounces to it, and check it in the email sender.

---

## Performance Bottlenecks

### PERF-01 - Middleware re-runs the claim POST on every navigation for ordinary accounts
**[perf] medium** **verify**

- Files:
  - `middleware.ts:216-233` reads `user_profiles.claimed_at` on every authenticated non-auth request. While `claimed_at IS NULL`, it fires a fire-and-forget `POST /api/claim-collaborators`.
  - `app/api/claim-collaborators/route.ts` runs `getUser` and a service-role RPC on each call. The 409 response is ignored by middleware.
  - `supabase/migrations/214_verified_invite_claim_hardening.sql:151-154` sets `claimed_at` in `handle_new_user` only when `v_admin_provisioned`.
  - `supabase/migrations/214_verified_invite_claim_hardening.sql:204-205` returns `FALSE` before the `claimed_at` update at `:272` when there is no invite token.
- Impact: For a self-signup without an invite, `claimed_at` stays `NULL`. Every page navigation then costs an auth round trip, a table read, and a POST that runs a DB RPC. The loop is unbounded. Migration 214's own comment ("Stop the legacy middleware retry loop") shows the team expected this loop, but the fix covers only accounts that predate it.
- Verify: `SELECT count(*) FROM user_profiles WHERE claimed_at IS NULL` in production, and whether migration 214 is applied.
- Fix: Set `claimed_at` on the verified-no-invite path inside `complete_verified_signup_claim`, so the sentinel is written on the first completed call. Avoid the extra `user_profiles` read on every navigation by caching the claim state in a cookie or JWT claim.

### PERF-02 - Vendor-health page makes live vendor calls on every load
**[perf] low**

- Files: `app/(admin)/admin/playbook/it/vendor-health/page.tsx` (calls `runVendorHealthChecks`), `lib/observability/vendor-health.ts:380-410` (Anthropic `/v1/models`, Stripe `/v1/balance`, Resend, DocuSeal, and others).
- Impact: Staff-only, and each page load fires about eight outbound calls. The page is intentionally uncached (`force-dynamic`). Low risk, but it is unbounded.
- Fix: Add a short TTL cache (for example 60 seconds) or a manual refresh control.

---

## Technical Debt

### DEBT-01 - Route test coverage is 74 of 336 route files; no coverage gate
**[debt] medium**

- Evidence: `jest.config.js` has no `coverageThreshold`. `.github/workflows/quality.yml` runs lint, `typecheck:strict`, tests, and `audit:gate`, but no coverage.
- High-risk routes with no test referencing them (grep across `*.test.ts`):
  - `app/api/admin/deals/[id]/pay/route.ts` (payment creation)
  - `app/api/split-sheets/[id]/send-for-approval/route.ts` (outbound email)
  - `app/api/admin/playbook/ask/route.ts` (AI spend)
- Fix: Add route tests for those three, then set a coverage floor on the e-sign, payments, and invites modules.

### DEBT-02 - Several components and routes exceed 900 lines
**[debt] medium**

- `components/catalogue/WorkPage.tsx` (2036 lines)
- `components/admin/StaffAdmin.tsx` (1763)
- `components/vault/MetadataStudio.tsx` (1472)
- `components/catalogue/TimedTrackPlayer.tsx` (1281)
- `components/buyer/CatalogBrowserLight.tsx` (1104)
- `components/admin/SelectsBuilder.tsx` (1000)
- `app/(artist)/vault/works/[workId]/page.tsx` (951)
- `app/api/webhooks/docuseal/route.ts` (767 lines, handles several event shapes and storage writes; see SEC-02)
- `app/api/roster/relationships/[relationshipId]/consent/route.ts` (751)
- Fix: Split along the existing section headers. Start with the DocuSeal webhook, because its storage writes are the subject of SEC-02.

### DEBT-03 - Dead storage helpers and unprovisioned bucket names
**[debt] low**

- File: `lib/storage/index.ts`
  - `:14-38` `uploadTrackAudio` has no callers. The only match is a comment in `lib/onboarding/submit-song-copy.test.ts`.
  - `:41-66` `uploadReleaseArtwork` and `:68-72` `deleteStorageFile` have no callers.
  - `:3-4` `release-audio` and `release-assets` are not provisioned in any migration.
  - `:5` `DOC_BUCKET` is live (see SEC-02).
- Fix: Delete the dead helpers. Keep only the bucket constant that is in use, and point it at a provisioned bucket.

### DEBT-04 - Stale comment on the middleware matcher
**[debt] low**

- File: `app/api/admin/vendor-health/route.ts:6`. The comment says `middleware.ts`'s matcher "excludes /api entirely". `middleware.ts` (the `config.matcher` array) includes `/api/admin/:path*`.
- Impact: The route's own gate is still correct. A future reader could remove it on the strength of the comment.
- Fix: Correct the comment to match the matcher.

### DEBT-05 - Stripe client has no pinned API version
**[debt] low**

- File: `lib/stripe/index.ts:3` (`new Stripe(process.env.STRIPE_SECRET_KEY)`).
- Impact: The SDK default applies, and that is the account's dashboard API version. An account upgrade changes response shapes for both the webhook and the API calls.
- Fix: Pass an explicit `apiVersion` that matches the webhook payloads the code parses.

### DEBT-06 - Cron secret comparison is not constant-time
**[debt] low**

- Files: `app/api/cron/*/route.ts` (for example `cleanup-rate-limits/route.ts:9`, `process-jobs/route.ts:21`) compare `authHeader !== \`Bearer ${secret}\``.
- Mitigation: All cron routes fail closed when `CRON_SECRET` is unset.
- Fix: Compare with `crypto.timingSafeEqual` over equal-length buffers.

### DEBT-07 - Low-severity `mermaid`/`katex` advisory in production dependencies
**[debt] low**

- Evidence: `npm audit --omit=dev` reports `katex` (GHSA-238p-pmpm-9mq7, prototype pollution, low) through `mermaid` 11.x. The fix is `mermaid` 12.x, a semver-major upgrade.
- Mitigation: `components/playbook/PlaybookDiagram.tsx:34` uses `securityLevel: 'strict'`.
- Fix: Schedule the `mermaid` 12 upgrade and re-test diagram rendering.

### DEBT-08 - Lint and type escape hatches, and TODO markers
**[debt] low**

- Counts in `app/`, `lib/`, and `components/` (excluding tests): 1 `@ts-ignore` or `@ts-expect-error`, 26 `eslint-disable` comments, 13 `any` usages, and 10 TODO/FIXME/HACK/XXX markers.
- Fix: Triage on the next pass through each area. Do not file individually.

---

## Fragile Areas

**Middleware (`middleware.ts`):** It owns CSP, the marketing-root rewrite, admin API auth, page protection, and the claim trigger. The matcher regex excludes `api` and then re-adds `/api/admin/:path*`. Changes here need the `__tests__/marketing-root-route.test.ts` regression test. See PERF-01.

**`handle_new_user` and `complete_verified_signup_claim` (migrations 133, 214, and others):** `handle_new_user` is redefined in 15 migrations, from `001_initial_schema.sql` through `214_verified_invite_claim_hardening.sql`. The latest definition in 214 governs. Identity claim behavior depends on the trigger and the RPC staying in sync with `app/auth/callback/route.ts` and `lib/invites/completeSignupClaim.ts`.

**Service-role routes:** 27 route files create a service client and contain none of the common auth-helper names. Most are admin routes gated by `verifyAdmin` or `requireRoomAccess`. The rest are public-token routes (`app/api/selects/[token]/respond`, `app/api/curators/claim/[token]`, `app/api/signup/invite/[token]`), `app/api/auth/diagnostics`, or cron routes. Each one must keep its ownership check in step with the policy it bypasses. Admin routes use `verifyAdmin` or `requireStaff`. Public token routes resolve by token before any write.

**Split-sheet and e-sign state machine:** Mint, send, void, reconcile, and webhook completion all write to the same records. The claim and lease RPCs (migration 216) are the guard. Changes to statuses need updates in `lib/split-sheets/` and the DocuSeal webhook together.

**Stripe reconciliation:** Payment state changes only through `complete_license_checkout` after a metadata match. Session lookup misses are not recovered, and the event handlers are the only path. See BUG-01.

---

## Scaling Limits

**Rate limiter:** Every `checkRateLimit` call is a database RPC (`check_rate_limit`). Several routes call it two or three times per request (for example the Selects routes). Heavy traffic on a few keys puts load on one table row set. The cron `cleanup-rate-limits` keeps the table bounded.

**Middleware:** Every non-static request calls `supabase.auth.getUser()`, which is a network call to Supabase Auth. Authenticated navigations also read `user_profiles` (PERF-01).

**Cron:** `process-jobs` runs every minute (`vercel.json`). Its throughput limit is not documented in the repo.

---

## Dependencies at Risk

**`mermaid` 11.x:** Transitive `katex` advisory (DEBT-07). Upgrade is semver-major.

**`next` 15.5.27:** Current. Pinned in `package.json`. Earlier critical advisories (09-10 C2) are resolved in this version.

**`stripe` 17.7.0:** Unpinned API version (DEBT-05). Webhook parsing depends on payload shapes that the dashboard version controls.

---

## Missing Critical Features

**Refund and dispute handling:** No code updates deal or payout state when Stripe reports a refund or dispute. See BUG-01.

**Suppression list:** No shared list of undeliverable or opted-out addresses. Bounce handling is limited to curators (BUG-02), and sender limits are missing (SEC-05).

---

## Test Coverage Gaps

**Payments:** `app/api/admin/deals/[id]/pay/route.ts`. The Stripe webhook has `__tests__/stripe-webhook.test.ts`, but no test covers the pay route's claim and finalize flow.

**Outbound email:** `app/api/split-sheets/[id]/send-for-approval/route.ts`. No route test covers it.

**AI spend:** `app/api/admin/playbook/ask/route.ts`. No test covers the admission path (`claimAiUsage` and `finishAiUsage`).

**Claim and migration state:** No test exercises the post-confirmation `complete_verified_signup_claim` path end to end, including the `claimed_at` sentinel (PERF-01).

---

## Verify in Deployed Environment

Do these before filing the **verify** items as issues.

1. **Supabase Auth:** Confirm `enable_confirmations` is on in the live project. Confirm migration 214 is applied (C1 status).
2. **Storage:** See advisory for SEC-02.
3. **Stripe dashboard:** Check enabled payment methods on the live account (BUG-01).
4. **Production data:** Count `user_profiles` rows with `claimed_at IS NULL` (PERF-01).
5. **Migration state:** Confirm migrations 214 through 242 are applied. The repo has no migration 232, so confirm nothing was dropped.
6. **CI:** Confirm `.github/workflows/quality.yml` is green on `main`, including `typecheck:strict`. The local typecheck is not conclusive (see the local caveats above).
7. **Vercel environment:** Confirm `NEXT_PUBLIC_APP_URL` is `https://funun.studio` (the middleware trust check for the claim endpoint), `ENABLE_UI_PREVIEW` is unset, and `NEXT_PUBLIC_VAULT_DEMO` is unset.

---

*Concerns audit: 2026-10-18*
