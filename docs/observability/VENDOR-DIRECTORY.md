# SaaS / Infra Vendor Directory (IT-TEAM)

**Owner:** Pete (pete@funun.studio) — D-13, single-owner (no dedicated backup yet).
**What this is:** the single "**what is this vendor, what does it do for us, and where do I look / what do I do when it fails**" reference for every external service Funūn runs on. This is the **seed content for The Playbook's IT TEAM room** — the IT-team equivalent of the AE sales SOPs.
**What this is NOT:** a restatement of the response playbooks. Where a vendor has a detailed doc (thresholds, alert responses, health-review steps), this directory links to it rather than duplicating numbers — `docs/observability/THRESHOLDS-AND-SEVERITY.md` and `lib/observability/config.ts` remain the source of truth for every threshold.

> **Verify-once housekeeping:** the status-page URLs below are the public provider pages; bookmark and confirm each in the IT room. Where a value is unknown it is written as **[confirm]** on purpose — an unfilled gap the directory is meant to surface, not hide.

---

## How to use this during an incident

1. **Start with the external uptime monitor — Better Stack — first**, always. A check hosted on Vercel cannot report a Vercel-wide outage; the external monitor is the only read that can tell you the *whole* site is down (→ Vercel/DNS) vs. one route failing (narrows it). See `RUNBOOK.md` §1.
2. **Triage the origin** using `RUNBOOK.md` §1's table (Vercel / Supabase / app code / DNS / Auth / Storage / external provider).
3. **Jump to that vendor's entry below** for its dashboard location, status page, and first-move.
4. For a **user report → cause** trace (correlation ID → deploy), use `RUNBOOK.md` §2. For a **rollback**, `RUNBOOK.md` §3 (mind the schema-ahead caveat).

**Where credentials live:** all vendor keys are stored in **Vercel → Settings → Environment Variables** (per-environment), and in `.env.local` for local dev. Nothing secret lives in this repo. Rotating a key = update it in Vercel, not in code.

---

## At a glance

| Vendor | Function | On the live request path? | Status page | Alerts route to |
|---|---|---|---|---|
| **Vercel** | Hosting, serverless functions, edge, CDN | **Yes — every request** | vercel-status.com | peter.zora@gmail.com *(personal, for now)* |
| **Supabase** | Postgres DB, Auth, Storage, Realtime, API | **Yes — every dynamic request** | status.supabase.com | Supabase account email |
| **DNS / registrar** | `funun.studio` name resolution | **Yes — resolution** | (registrar + Vercel) | — |
| **Sentry** | Error monitoring | No — degrades gracefully (env-gated) | status.sentry.io | Sentry (funun org) |
| **Better Stack** | External uptime monitoring + public status page | No — external observer | status.betterstack.com | it@funun.studio |
| **Stripe** | Payments / subscriptions | Only on checkout/billing flows | status.stripe.com | Stripe account email |
| **Resend** | Transactional email | Only on email sends (async) | status.resend.com | Resend account email |
| **Anthropic** | AI tools (PitchPlug, contract analysis) | Only on AI tool runs | status.anthropic.com | Anthropic console email |
| **DocuSeal** | E-signature (current provider) | Only on e-sign flows | [confirm] | DocuSeal account email |
| **Google Places** | Address / location autocomplete | Only on address-entry UI (client) | status.cloud.google.com | Google Cloud account |
| **GitHub** | Source control + deploy trigger | No — build/deploy time only | githubstatus.com | GitHub account email |

**Read the "live request path?" column first in an outage:** only **Vercel, Supabase, and DNS** being down can take the *whole site* down. Every other vendor failing degrades a *feature* (payments, email, AI, e-sign, address autocomplete) or a *support system* (error/uptime monitoring) — bad, but not a full outage. That distinction sets the severity (see `THRESHOLDS-AND-SEVERITY.md` §2).

---

## Vendors (detailed)

### 1. Vercel — hosting / functions / edge / CDN
- **Function:** runs the entire Next.js app — every page render, API route, edge middleware, and static asset. **Pro plan.**
- **Where to look:** Vercel dashboard → **Observability** (Errors / Functions / Latency); **Deployments** (for a bad release); **Usage** + **Spend Management**. Status: `vercel-status.com`.
- **On failure:** external monitor first → then Errors/Functions for a 5xx spike or `FUNCTION_THROTTLED` → check whether the **last deploy** correlates → roll back per `RUNBOOK.md` §3. Spend Management is **notify-only at $200** ("Pause production deployment" is **OFF** by design — spend never takes prod down).
- **Config:** `VERCEL_PLAN_TIER` (set `=pro` at deploy). Alerts currently → `peter.zora@gmail.com` (revisit → shared IT/ops inbox as team grows).
- **Deep dive:** `docs/observability/VERCEL-ALERTS-RESPONSE.md`.

### 2. Supabase — Postgres / Auth / Storage / Realtime / API
- **Function:** the system of record — Postgres (all app data + RLS), Auth (sessions, `handle_new_user()`), Storage (audio/artwork/documents buckets), Realtime, and the PostgREST API. Prod project ref **`wgfjakfiyeewzfuxkgyo`**.
- **Where to look:** Supabase dashboard → **Database → Reports** (CPU, memory, connections, disk), **Auth logs**, **API logs**, **Query Performance Advisor**. Status: `status.supabase.com`.
- **On failure:** check DB CPU/connections/disk against the bands in `THRESHOLDS-AND-SEVERITY.md` §1; Auth failures → Auth logs; slow queries → Performance Advisor. DB-level recovery (invite-gate trigger, locked-out account) lives **only** in `docs/BREAK-GLASS.md` — go there, don't improvise.
- **Config:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only).
- **Deep dive:** `docs/observability/SUPABASE-HEALTH-REVIEW.md`.

### 3. DNS / registrar — funun.studio
- **Function:** resolves `funun.studio` + `www` to Vercel. If resolution breaks, the site is unreachable even with Vercel + Supabase healthy.
- **Where to look:** `dig funun.studio` / `dig www.funun.studio`; the **registrar's DNS panel** and **Vercel → Domains**.
- **On failure:** confirm the apex + `www` A/CNAME records and the apex→www redirect; check for an expired domain or a changed record.
- **Config / [confirm]:** **registrar = [confirm where funun.studio is registered]**; DNS records managed via Vercel domain config.

### 4. Sentry — error monitoring
- **Function:** captures server + browser exceptions with correlation-ID tagging (ties a user report to the exact failing request + release). Org **`funun`** (`funun.sentry.io`), project **`javascript-nextjs`**.
- **Where to look:** `funun.sentry.io` → Issues (filter by release/time); status: `status.sentry.io`.
- **On failure:** Sentry being down does **not** affect the app — the SDK is env-gated and fails open (no-op). It just means you're temporarily blind to new errors; fall back to Vercel logs + the correlation ID (`RUNBOOK.md` §2).
- **Config:** `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`. **Activates on deploy to `main`** (the SDK code is on `feat/lane1-catalogue-menu-help` until then).

### 5. Better Stack — external uptime + public status page
- **Function:** independent, off-Vercel uptime monitoring — the one check that can detect a Vercel-wide outage. **3 monitors** (`funun.studio`, `/signin`, `/sync/catalog`), apex, 3-min interval, alert after **2 consecutive failures**, 4 regions. Public status page: **`funun.betteruptime.com`**.
- **Where to look:** `betterstack.com` dashboard (account **`it@funun.studio`**); the public status page; status: `status.betterstack.com`.
- **On failure:** if Better Stack itself is down you lose external alerting — treat as a monitoring gap, lean on Vercel/Supabase dashboards until it recovers. Add the `/api/health` monitor here **after this branch deploys** (503-as-down check).
- **Deep dive:** `docs/observability/UPTIME-MONITORING.md`.

### 6. Stripe — payments / subscriptions
- **Function:** processes payments and subscription tiers (founding / pro / studio, monthly + yearly price IDs).
- **Where to look:** `dashboard.stripe.com` → **Payments**, **Developers → Webhooks**, **Logs**. Status: `status.stripe.com`.
- **On failure:** checkout/billing degrade only — the rest of the app is unaffected. Check the Stripe status page first (provider-side), then Webhooks for delivery failures, then Funūn logs scoped to `lib/stripe`.
- **Config:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_FOUNDING`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`, `STRIPE_PRICE_STUDIO_MONTHLY`, `STRIPE_PRICE_STUDIO_YEARLY`.

### 7. Resend — transactional email
- **Function:** delivers app email (pitch confirmations, notifications). Sends are async — a Resend outage doesn't block requests.
- **Where to look:** `resend.com` → **Emails / Logs**; status: `status.resend.com`.
- **On failure:** emails queue/fail silently to the user — check the Resend dashboard for bounces/failures and Funūn logs scoped to `lib/email`. Never a full-site issue.
- **Config:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`, `PITCH_FROM_EMAIL`.

### 8. Anthropic — AI tools
- **Function:** powers AI features — PitchPlug email generation, contract analysis/verification (`lib/anthropic`).
- **Where to look:** `console.anthropic.com` (usage, keys); status: `status.anthropic.com`.
- **On failure:** AI tool runs error or time out — the tool surfaces the error; the rest of the app is fine. Check the Anthropic status page, then the specific tool's error, then usage/rate limits in the console.
- **Config:** `ANTHROPIC_API_KEY`.

### 9. DocuSeal — e-signature (current provider)
- **Function:** e-signature for documents/contracts. **Current** provider; `lib/esign/provider.ts` is an abstraction so **Dropbox Sign** can replace it when that account is live (per project brief).
- **Where to look:** DocuSeal dashboard (account email); webhook delivery. Status: **[confirm — cloud DocuSeal status URL / self-hosted instance health]**.
- **On failure:** e-sign flows degrade only. Check DocuSeal reachability, then webhook delivery (`DOCUSEAL_WEBHOOK_SECRET` verification), then Funūn logs scoped to `lib/esign`.
- **Config:** `DOCUSEAL_API_KEY`, `DOCUSEAL_WEBHOOK_SECRET`, `ESIGN_FROM_EMAIL`.

### 10. Google Places — address / location autocomplete
- **Function:** client-side address/location autocomplete on address-entry fields.
- **Where to look:** Google Cloud Console (API key, quotas, billing); status: `status.cloud.google.com`.
- **On failure:** autocomplete stops working in the UI — a degraded input, not an outage. Check the key's quota/billing in Cloud Console.
- **Config:** `NEXT_PUBLIC_GOOGLE_PLACES_KEY` (browser-exposed by design — a Places key is client-side; restrict it by HTTP referrer in Cloud Console).

### 11. GitHub — source control + deploy trigger
- **Function:** the code repository; pushing to it triggers Vercel builds/deploys.
- **Where to look:** GitHub repo; status: `githubstatus.com`.
- **On failure:** you can't ship *new* deploys while GitHub is down, but the running site is unaffected and **Vercel rollback to an existing deployment still works** (it doesn't need GitHub). So a GitHub outage never blocks incident recovery via rollback.

---

## Maintenance

- **When a vendor is added or a key rotated:** add/update its row here *and* in Vercel env vars. This directory should always match the live `process.env.*` surface.
- **Fill the [confirm] gaps:** DNS registrar, DocuSeal status URL — resolve these once and replace the placeholders.
- **Alert consolidation:** most vendors still alert to their own account emails. As the team grows, route them all to the shared **it@funun.studio** inbox (tracked todo: `2026-08-16-shared-it-ops-account-for-vendor-notifications.md`).
- **Destination:** this doc is the seed for the in-app **IT TEAM Playbook room** (company wiki), which will also surface the live monitoring dashboard for IT-team + senior-leader roles.
- **Design reference:** `docs/design/playbook-it-team-room.html` mocks up how this room looks (see `docs/design/README.md`).

---
*Phase: 32-production-observability-capacity-incident-readiness (companion to the RUNBOOK / thresholds / per-vendor response docs)*
*Purpose: IT-TEAM SaaS vendor directory — seed content for The Playbook's IT room*
