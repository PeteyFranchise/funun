# Funūn Beta Adversarial Security and Product-Risk Audit

**Date:** 2026-09-10

**Target:** local `main` at `a4f2f74b5e96b968605e76b27b4c0b3be23d6694`

**Mode:** read-only review; no application, migration, dependency, production, or deployment changes

**Stage:** Alpha to public/closed Beta

## Executive decision

Do not open the public or closed Beta until the two Critical findings are resolved. Before external users can use payments, signatures, large uploads, AI, or unrestricted social activity, resolve the associated High findings as well.

The strongest existing controls are centralized staff authorization, workspace/work access resolution, RLS-oriented data access, signed and hashed public tokens, Stripe webhook signature checks, and the verified Phase 38 authorization hardening. No confirmed raw SQL injection or BOLA/IDOR was found in the reviewed mainline request paths.

## Remediation update — 2026-09-11

All findings below now have locally implemented remediations. The exact implementation and verification record is in `.planning/quick/260911-beta-audit-remediation/SUMMARY.md`. This does **not** mean every control is live: the application is not yet deployed, migrations 214–217 are unapplied candidates, and production email confirmation must be coordinated with migration 214. Until those rollout steps and live smoke tests are complete, the original Beta gate remains in force.

## Critical

### C1. Invited identity can potentially be claimed without proving email ownership

**Remediation status (2026-09-10):** Implemented and verified locally; not yet active in production. Migration 214, the application release, and the production Supabase Auth settings remain human-gated rollout actions. See `.planning/quick/260910-verified-invite-claim-hardening/DEPLOYMENT.md`.

**Evidence**

- `supabase/config.toml:115-130`
- `app/(auth)/signup/page.tsx:248-285`
- `app/(auth)/signup/completion.ts:3-9`
- `supabase/migrations/133_handle_identity.sql:251-324`
- `app/api/signup/check-invite/route.ts:27-53`

**Risk**

The checked-in configuration disables email confirmations, while signup expects an immediately active session. The new-user identity logic admits users based on an email matching an invitation or collaborator record and then consumes or claims related identity data. An attacker who knows an invited collaborator's email could register it with their own password and potentially receive access to works, credits, rights records, contracts, or invitations intended for the real person.

The public invite-check endpoint also distinguishes account and eligibility states, which assists email enumeration. The repository implies this is the expected production behavior, but the live Supabase Auth setting was not independently queried during this audit.

**Required remediation**

1. Enable email confirmation before Beta.
2. Remove invitation consumption and collaborator claiming from the `auth.users` insert path.
3. Move claims into an atomic post-verification RPC that requires `email_confirmed_at`.
4. Bind admission to a cryptographically random, hashed invitation or claim token rather than email alone.
5. Stop returning distinct `existingAccount` and `allowed` states publicly.
6. Add adversarial tests for email squatting, unverified users, token reuse, expired invitations, and concurrent claims.

```sql
IF NOT EXISTS (
  SELECT 1
  FROM auth.users
  WHERE id = auth.uid()
    AND email_confirmed_at IS NOT NULL
) THEN
  RAISE EXCEPTION 'Email verification required';
END IF;
```

**Deployment concern:** Coordinate the Auth setting, new claim RPC, trigger change, and invitation-token rollout so no intermediate state grants or destroys identity claims incorrectly.

### C2. Production framework dependencies contain known high/critical vulnerabilities

**Remediation status (2026-09-11):** Resolved locally; not yet committed or deployed. Next.js and its matching ESLint configuration are pinned to `15.5.24`, and the Next.js Sharp override is pinned to `0.35.4`. The regenerated dependency tree reports zero production vulnerabilities. Full details are in `.planning/quick/260911-patch-critical-framework-dependencies/SUMMARY.md`.

**Evidence**

- `package.json:32`
- `package.json:75`
- `package-lock.json:13176-13177`
- `package-lock.json:15017-15018`
- Resolved versions: `next@15.5.23`, `sharp@0.35.3`
- `npm audit --omit=dev --json`: one critical and one high production vulnerability

**Risk**

The installed Next.js version is covered by critical advisories including unauthenticated Windows deployment RCE and an AVIF image-optimizer RCE. The installed Sharp version is covered by high-severity libheif memory-safety advisories. Current exploit reach appears reduced because no AVIF or `next/image` usage was found and Vercel production is not Windows, but shipping a publicly known critical framework vulnerability is not acceptable for Beta.

**Required remediation**

- Upgrade Next.js to at least `15.5.24` and Sharp to at least `0.35.4`, or later compatible patched releases.
- Regenerate the lockfile with the supported Node/npm toolchain.
- Repeat build, lint, standard/strict typechecks, tests, and both dependency audits.
- Pin the security-sensitive framework versions deliberately rather than relying only on caret ranges.

## High

### H1. Stripe payment creation permits duplicate live checkout sessions

**Evidence**

- `app/api/admin/deals/[id]/pay/route.ts:20-104`
- `lib/stripe/connect.ts:146-171`
- `app/api/webhooks/stripe/route.ts:56-85`
- `supabase/migrations/084_deals_licensing.sql`

**Exploit/operational scenario**

Two concurrent requests both observe an unpaid deal, create separate Stripe Checkout Sessions, and then race to store their session IDs. The final write wins. If the buyer pays the earlier URL, the webhook may not find the deal and can acknowledge the event without marking the deal paid.

**Fix**

- Atomically claim payment creation before calling Stripe.
- Use a stable idempotency key such as `deal:{id}:{economicsVersion}`.
- Permit only one active checkout per deal/economics version.
- Reconcile webhooks through signed metadata when session lookup misses.
- Validate amount, currency, destination, and economics version during webhook processing.

### H2. Concurrent e-sign requests can create multiple legal instruments

**Evidence**

- `app/api/split-sheets/[id]/mint-envelope/route.ts:107-405`
- `lib/sync-library/mint-agreement.ts:97-253`
- `supabase/migrations/062_esign.sql:34-51`

**Exploit/operational scenario**

Eligibility and cap checks occur before the provider call, while the database record is written afterward. Concurrent requests can both pass and create multiple active contracts, signature invitations, and provider charges. A database failure after provider creation can leave an orphaned but executable legal document.

**Fix**

Implement an atomic `claim -> mint -> finalize` lifecycle with `FOR NO KEY UPDATE`, a `minting` lease state, a unique partial index for active instruments, deterministic provider idempotency keys, and reconciliation for abandoned claims/provider documents.

### H3. Playbook AI calls bypass global spending, timeout, and concurrency controls

**Evidence**

- `app/api/admin/playbook/ask/route.ts:13-21`
- `lib/playbook/assistant.ts:11-21`
- `lib/ai/admission.ts:27-100`
- `lib/security/rate-limit.ts:42-52`

**Risk**

Playbook Ask uses a basic per-hour limiter but not Funūn's durable AI admission system. The basic limiter fails open on database errors. Provider calls lack the shared spending/concurrency claim and provider timeout signal, and provider error messages can be returned or persisted.

**Fix**

Wrap the request with `claimAiUsage`, `aiProviderSignal`, and `finishAiUsage` in `finally`; use a calibrated cost unit and stable client-facing errors. Treat global budget and concurrency admission as fail-closed.

### H4. Large uploads are buffered before size admission

**Evidence**

- `app/api/works/[workId]/versions/route.ts:29-78`
- `app/api/vault/[projectId]/documents/[docId]/upload/route.ts:9-47`
- `app/api/earnings/import/route.ts:19-45`
- `lib/security/upload-admission.ts`

**Risk**

The routes call `request.formData()` before enforcing the intended byte limit. An authenticated user can force memory, CPU, and function-duration consumption with oversized multipart requests. Server-proxied audio uploads are unsuitable for large music files.

**Fix**

Deprecate direct audio proxy uploads in favor of signed upload-intent/completion flows. Enforce `Content-Length` admission before multipart parsing for small files, verify authoritative storage metadata, and parse large files asynchronously from storage.

### H5. Social writes and notification fan-out lack robust abuse controls

**Evidence**

- `app/api/dm/send/route.ts:46-137`
- `app/api/green-room/posts/route.ts:11-24`
- `app/api/green-room/posts/[postId]/comments/route.ts:35-63`
- `app/api/green-room/posts/[postId]/reactions/route.ts:35-64`
- `app/api/wall/route.ts:12-74`
- `lib/security/rate-limit.ts:11-52`

**Risk**

A malicious or compromised member can flood messages, posts, comments, reactions, realtime traffic, database rows, and recipient notifications. Only limited cold-DM controls exist, and the shared limiter fails open.

**Fix**

Add atomic database admission for per-user bursts, daily quotas, per-recipient DM limits, repeated-content detection, notification coalescing, and temporary restrictions. High-cost and abuse-sensitive admission should fail closed or enter a constrained degraded mode.

### H6. Activation and incident mutations are not atomic with audit events

**Evidence**

- `app/api/admin/playbook/activation/features/[key]/route.ts:7-9`
- `app/api/admin/playbook/incidents/route.ts:8`
- `app/api/admin/playbook/incidents/[id]/route.ts:7`

**Risk**

State changes occur before their audit-event insertion. An audit failure can leave a feature or incident changed without durable accountability while returning an error to the administrator. Retrying can create duplicated or misleading history.

**Fix**

Move each state mutation and append-only audit event into one transactional RPC or enforced database trigger. Require an expected version/compare-and-swap boundary for concurrent administrators.

## Medium

### M1. Request bodies are often parsed before authentication

**Evidence:** ordering inventory identified 49 API routes. Representative paths:

- `app/api/vault/route.ts:40-65`
- `app/api/dm/send/route.ts:46-66`
- `app/api/wall/route.ts:12-28`
- `app/api/admin/playbook/activation/features/[key]/route.ts:7-9`

**Risk:** Anonymous callers can force body allocation and validation before rejection; malformed JSON can produce internal errors instead of controlled `400`/`401` responses.

**Fix:** Standardize authentication, coarse authorization, size/content-type admission, parsing, strict schema validation, object authorization, then mutation.

### M2. Raw database/provider error messages are widely returned to clients

**Evidence:** static inventory flagged `.message` pass-through patterns in 220 route files; confirmed examples include:

- `app/api/profile/route.ts:320-327`
- `app/api/split-sheets/[id]/route.ts:310-380`
- `app/api/workspaces/[workspaceId]/roster/evidence/route.ts:169-384`
- `app/api/vault/route.ts:35-81`

**Risk:** Responses can reveal schema names, constraints, RLS behavior, provider details, identifiers, or supplied PII.

**Fix:** Return stable public codes/messages and record sanitized diagnostics with a correlation ID server-side.

### M3. Vault project creation accepts weakly validated input

**Evidence:** `app/api/vault/route.ts:40-81`

**Risk:** Title, genre, type, and release date do not receive comprehensive type, length, enum, or date validation. Unexpected objects and oversized values can reach database serialization.

**Fix:** Apply a strict Zod schema, maximum lengths, enums, normalized dates, and controlled malformed-JSON handling.

### M4. Playbook media completion trusts upload declarations

**Evidence:**

- `app/api/admin/playbook/media/upload-intent/route.ts:10-42`
- `app/api/admin/playbook/media/[id]/complete/route.ts:9-27`

**Risk:** Completion verifies object existence but not authoritative stored size/content type, container bytes, or creator ownership. An authorized user can mark a mismatched or oversized object ready.

**Fix:** Compare storage metadata to the intent, inspect container/magic bytes, verify the completing user owns the intent, and quarantine/delete invalid objects.

### M5. Internal preview/configuration pages are exposed by the production build

**Evidence:**

- `app/email-preview/page.tsx:1-27`
- `app/status/page.tsx:4-168`
- `middleware.ts:27-87`

**Risk:** A nominally local-only email preview is publicly buildable, and the public status page reveals internal feature inventory and whether sensitive integrations are configured.

**Fix:** Return `notFound()` for preview routes outside development. Require staff access for operational configuration. A public status page should expose only service health and incidents.

### M6. Demo mode is a production authentication-bypass footgun

**Evidence:**

- `middleware.ts:15-21`
- `lib/vault/demo-store.ts:27-110`
- Demo flag referenced across numerous application/API files

**Risk:** `NEXT_PUBLIC_VAULT_DEMO=true` bypasses page authentication and switches APIs to a shared, file-backed identity/store. An accidental production configuration could permit unauthenticated shared demo mutations.

**Fix:** Use a server-only flag, require an explicit non-production environment, fail production startup/build if enabled, and never share a mutable OS-level demo store across users.

### M7. Browser security headers are absent at the application layer

**Evidence:**

- `next.config.mjs:4-51`
- `middleware.ts:6-87`

**Risk:** No application-level CSP, frame restrictions, content-sniff protection, referrer policy, or permissions policy was found, increasing clickjacking and XSS impact on authentication, contracts, payments, and admin controls.

**Fix:** Add a tested nonce-based CSP and explicit `frame-ancestors`, `object-src`, `base-uri`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and HSTS controls while allowlisting only required vendors.

### M8. Sentry scrubbing does not redact sensitive values embedded in messages

**Evidence:**

- `lib/observability/scrub.ts:10-100`
- `sentry.server.config.ts:13-30`
- `instrumentation.ts:23-27`

**Risk:** Redaction is primarily key-based. Emails, tokens, rights data, or provider responses embedded in exception messages/stacks can leave Funūn even when the surrounding key appears safe.

**Fix:** Add tested value-based redaction; remove request bodies and exception values from sensitive identity, rights, legal, and contract routes; avoid capturing raw provider errors.

### M9. Earnings imports can report success after persistence failure

**Evidence:** `app/api/earnings/import/route.ts:47-60`

**Risk:** A database insertion failure is swallowed after parsing, so a member can be told the import succeeded without a durable import record.

**Fix:** Make persistence part of the success boundary or create a durable queued job with visible failure/retry status.

### M10. Strict typecheck and development supply-chain baselines are not clean

**Evidence**

- `__tests__/migration-186.test.ts:357`
- `lib/deals/catalog.test.ts:26`
- `lib/playbook/markdown-components.tsx:115`
- Full `npm audit --json`: 29 advisories (1 critical, 27 high, 1 low), predominantly in development/CI chains

**Risk:** The strict gate currently fails on unused variables. Vulnerable CI/test tooling increases supply-chain exposure and weakens confidence in future enforcement.

**Fix:** Remove the unused bindings, make strict typecheck mandatory in CI, upgrade the lint/test stack, and enforce production-only plus full dependency audits.

## Verification baseline

| Check | Result |
|---|---|
| `npm run build` | PASS — Next.js 15.5.23; 151 static pages generated |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run typecheck:strict` | FAIL — three unused variables |
| `npm test -- --runInBand` | PASS — 566 suites, 7,015 tests, 0 failures |
| `npm audit --omit=dev --json` | FAIL — 1 critical, 1 high |
| `npm audit --json` | FAIL — 29 total advisories |

## Accepted controls and non-findings

- No confirmed raw SQL injection was found.
- No confirmed BOLA/IDOR was found in the inspected work, workspace, and Playbook access paths.
- Staff access generally validates the authenticated user and signed staff metadata.
- Work APIs generally compose centralized access resolution with database authorization.
- Public access tokens reviewed were random/hashed rather than stored as plaintext capabilities.
- Stripe webhook signatures are verified against the raw body.
- Phase 38 workspace authorization and helper exposure hardening had previously passed its structural verification harness.

These controls reduce risk but do not negate the findings above.

## Remediation order

1. Close C1 identity/email ownership before inviting additional Beta users.
2. Upgrade Next.js/Sharp and establish a clean dependency baseline.
3. Add atomic payment and e-sign claims/idempotency before external commercial use.
4. Put every AI call behind global spending/concurrency admission.
5. Move large uploads to direct-to-storage admission flows.
6. Add social abuse limits and notification coalescing.
7. Make activation/incident changes atomic with audit history.
8. Standardize API auth-before-parse, validation, and public error envelopes.
9. Close media-completion, preview/status, demo-mode, header, Sentry, and silent-persistence gaps.
10. Restore strict CI and remediate the remaining development dependency chain.

## Recommended release gates

### Closed Beta gate

- C1 and C2 resolved and independently tested.
- H1-H6 either resolved or the affected functionality disabled by server-side, default-off controls.
- Dependency audits, build, lint, standard/strict typechecks, and full tests pass.
- Production email verification, invitation claims, staff routing, and workspace isolation receive live smoke tests.

### Public Beta gate

- All High findings resolved.
- Abuse controls and operational dashboards active.
- Payment/e-sign reconciliation exercises completed.
- Upload, AI-spend, error-redaction, and incident-response drills completed.
