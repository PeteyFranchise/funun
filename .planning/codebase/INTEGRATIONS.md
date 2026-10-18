# External Integrations

**Analysis Date:** 2026-10-18

Names only. No secret values are recorded in this document. Secrets live in the Vercel project environment, and `.env.example` documents the variable names.

## APIs & External Services

**AI / LLM:**
- Anthropic Claude API - Pitch drafting, contract verification, document generation, tagging, playbook assistant, selects drafts, buyer brief drafting, launchpad campaign generation.
  - SDK: `@anthropic-ai/sdk` ^0.52.0. Imported directly in `lib/playbook/assistant.ts`, `lib/contracts/verify.ts`, `lib/selects/ai-draft.ts`, `lib/tagging/ai-tag.ts`, `lib/buyer/brief-ai.ts`, `app/api/tools/pitchplug/route.ts`, `app/api/tools/[slug]/route.ts`, `app/api/pitches/draft/route.ts`, `app/api/vault/[projectId]/documents/generate/route.ts`, `app/api/launchpad/[projectId]/campaigns/route.ts`, and `app/api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/generate/route.ts`.
  - Auth: `ANTHROPIC_API_KEY` (server only).
  - Model: `claude-sonnet-4-6` in most call sites. `ANTHROPIC_PLAYBOOK_MODEL` overrides the playbook assistant, which falls back to `claude-sonnet-4-20250514`.
  - Shared client module `lib/anthropic/index.ts` is not imported by any module.
  - Vendor health probe: `lib/observability/vendor-health.ts` checks Anthropic with the `x-api-key` and `anthropic-version` headers.

- OpenAI API - Lyric Lift: audio transcription, timestamp alignment, and song-section structure detection.
  - Client: raw `fetch` against `https://api.openai.com/v1` in `lib/catalogue/lyric-lift-provider.ts` (`/responses` endpoint plus transcription/alignment calls). No OpenAI SDK in `package.json`.
  - Auth: `OPENAI_API_KEY` (server only).
  - Models: `OPENAI_TRANSCRIPTION_MODEL`, `OPENAI_LYRIC_ALIGNMENT_MODEL`, `OPENAI_LYRIC_STRUCTURE_MODEL`. Code defaults are `gpt-transcribe`, `whisper-1`, and `gpt-5.6-sol`.
  - Triggered from `app/api/works/[workId]/versions/[versionId]/lyric-lift/route.ts` and `app/api/works/[workId]/lyric-lifts/[liftId]/retry/route.ts`.

**Payments & Billing:**
- Stripe - Member subscriptions (Studio, Team), a one-time Founding Member lifetime price, and Stripe Connect for artist payouts.
  - SDK: `stripe` ^17.7.0 (server, `lib/stripe/index.ts`, `lib/stripe/connect.ts`). `@stripe/stripe-js` ^4.0.0 (browser). No API version is pinned in code; the SDK default applies.
  - Calls used: `checkout.sessions.create`, `accounts.create`, `accounts.retrieve`, `accountLinks.create`. Payout settings are read in `app/api/settings/payouts/route.ts`.
  - Auth: `STRIPE_SECRET_KEY` (server), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (browser), `STRIPE_WEBHOOK_SECRET` (webhook verification).
  - Price IDs: `STRIPE_PRICE_STUDIO_MONTHLY`, `STRIPE_PRICE_STUDIO_YEARLY`, `STRIPE_PRICE_TEAM_MONTHLY`, `STRIPE_PRICE_TEAM_YEARLY`, `STRIPE_PRICE_FOUNDING`. Mapped in `lib/stripe/index.ts`. Writer is free. Entourage is custom and has no price.
  - Stripe.js is allowed by CSP `script-src` and `frame-src` in `middleware.ts`.

**E-Signature:**
- DocuSeal - Live e-signature provider for split sheets and contracts (Phase 17).
  - Client: `fetch` against `https://api.docuseal.com` (`DOCUSEAL_API_BASE`) in `lib/esign/docuseal.ts`. Embedded signing UI through `@docuseal/react` and the `https://docuseal.com/s/{slug}` link base.
  - Auth: `DOCUSEAL_API_KEY` (sent as the `X-Auth-Token` header, server only). Webhook secret: `DOCUSEAL_WEBHOOK_SECRET`.
  - Provider contract: `lib/esign/provider.ts` (provider union includes `dropbox_sign`, `docusign`, `docuseal`). Only DocuSeal is implemented. The Dropbox Sign provider is mentioned in comments as planned and has no code.
  - Admin usage metering: `app/api/admin/esign/usage/`.
  - CSP `frame-src` allows `https://*.docuseal.com`.

**Email:**
- Resend - Transactional email: artist and workspace invites, staff invites, buyer and industry invites, split-sheet signature invites, Antenna match notices, and cold-outreach pitches.
  - SDK: `resend` ^4.0.0 in `lib/email/index.ts`. The wrapper no-ops and returns `{ ok: false }` when the key or sender is unset.
  - Auth: `RESEND_API_KEY` (server only). Senders: `RESEND_FROM_EMAIL` (default), `ESIGN_FROM_EMAIL` (split-sheet invites, reply-to monitored inbox), `PITCH_FROM_EMAIL` (dedicated cold-outreach subdomain, per the `from` override in `lib/email/index.ts`).
  - Idempotency keys are supported by the wrapper.
  - Email templates: `lib/email/*.ts`.

**Bot Protection:**
- Cloudflare Turnstile - Captcha on the artist waitlist form (`POST /api/waitlist`).
  - Server verification: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` in `lib/security/turnstile.ts`. Fails closed on missing config, network error, or non-success response.
  - Auth: `TURNSTILE_SECRET` (server only). Site key: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (browser).
  - CSP allows `challenges.cloudflare.com` in `script-src` and `frame-src`.

**Music Data / Discovery:**
- Spotify Web API - Curator playlist follower counts, using the client-credentials flow.
  - Calls: `POST https://accounts.spotify.com/api/token`, then `GET https://api.spotify.com/v1/playlists/{id}?fields=followers.total` in `lib/curators/reach.ts`.
  - Auth: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` (server only). Returns `null` when unset.
  - Cron-driven via `app/api/cron/curator-reach`.
- YouTube Data API v3 - Channel statistics for curator reach.
  - Call: `GET https://www.googleapis.com/youtube/v3/channels?part=statistics` in `lib/curators/reach.ts`.
  - Auth: `YOUTUBE_API_KEY` (server only, passed as a query parameter).
- Google Maps JavaScript API with Places - Address autocomplete on profile forms.
  - Loaded in the browser from `https://maps.googleapis.com/maps/api/js` by `components/profile/AddressAutocomplete.tsx`.
  - Key: `NEXT_PUBLIC_GOOGLE_PLACES_KEY` (browser-visible by design, so the key must be restricted in Google Cloud).
- DDEX metadata exports - Sender Party ID from `DDEX_DPID` (falls back to a placeholder). No network call. Output is generated in `lib/metadata/export.ts` and `lib/metadata/rdr-export.ts`. `http://ddex.net` is referenced for schemas.

**Media Embeds (client-side, no API key):**
- YouTube no-cookie embeds: `https://www.youtube-nocookie.com/embed/{id}` (`lib/playbook/media.ts`).
- Vimeo player embeds: `https://player.vimeo.com/video/{id}` (`lib/playbook/media.ts`).
- Spotify links: `open.spotify.com` playlist URLs are parsed in `lib/curators/reach.ts`.

**Link-outs (no API calls):**
- The MLC (`https://www.themlc.com`) in `components/vault/MlcGuideCard.tsx`, `lib/metadata/identifier-guide.ts`, and the rights and registrations pages.
- U.S. Copyright Office eCO (`https://eco.copyright.gov`), PRO sites (ASCAP, BMI, SESAC, SOCAN), SoundExchange, Songtrust, IFPI, GS1, ISWC, ISAN, and USISRC, referenced in rights guidance and identifier guides.
- Better Stack status page `https://funun.betteruptime.com` in `app/(admin)/admin/playbook/it/dashboard/page.tsx` and `components/playbook/QuickLinks.tsx`.

**Not implemented (references only):**
- Buffer social posting. `.agents/skills/spike-findings-funun/` documents a spike, but no Buffer API client exists in `app/` or `lib/`.
- Dropbox Sign. Mentioned in `lib/esign/provider.ts` comments. `DROPBOX_SIGN_API_KEY` is not read anywhere in code.
- SMS signature confirmation. The `phone` field on `EsignSigner` exists in the type, with no provider call in code.

## Data Storage

**Databases:**
- Supabase-hosted PostgreSQL. Local development uses the Supabase CLI stack configured in `supabase/config.toml` (`project_id = "funun"`).
  - Schema: `supabase/migrations/` (238 files). Row Level Security governs per-user access. Security migrations are checked by `scripts/verify-beta-security-migrations.mjs` (`npm run security:migrations:verify`).
  - Client libraries: `@supabase/supabase-js` 2.109.0 and `@supabase/ssr` 0.10.0.
  - Client factories in `lib/supabase/server.ts`:
    - `createServerClient()` and `createApiClient()` use the anon key with the request's cookies, for user-scoped queries.
    - `createServiceClient()` uses `SUPABASE_SERVICE_ROLE_KEY` and bypasses RLS. Callers must check ownership first.
    - `lib/supabase/client.ts` is the browser client.
  - Generated types: `types/supabase.ts` (via `npm run db:types`).
  - Roughly 200 distinct `.from('table')` call sites across `app/` and `lib/`.
- Realtime: 13 files under `app/`, `lib/`, and `components/` reference Supabase Realtime channels or `postgres_changes` subscriptions (wall posts and DM messages are the documented uses in `CLAUDE.md`). `supabase/config.toml` enables Realtime.

**File Storage:**
- Supabase Storage. Two bucket naming sets appear in the code:
  - `lib/storage/index.ts`: `release-audio`, `release-assets`, `release-documents`. These are used through `getPublicUrl` and signed URLs.
  - Migrations and `lib/vault/track-audio.ts`: `track-audio` (private, the one the service-role client targets per the comment in `lib/supabase/server.ts`), `vault-assets`, `vault-contracts`.
  - Upload call sites include `app/api/profile/avatar/route.ts`, `app/api/vault/[projectId]/assets/route.ts`, and `lib/catalogue/version-upload-client.ts`.
  - Image sniffing before storage is in `lib/storage/sniff-image.ts`.
  - Playbook media uploads: `app/api/admin/playbook/media/upload-intent` and `.../complete`.
- Supabase Storage image transformation is enabled in `supabase/config.toml`.
- Max audio size is 250 MB per track (per `CLAUDE.md` and the vault upload rules).

**Caching:**
- None detected. No Redis, Upstash, or Vercel KV client in `package.json`.

## Authentication & Identity

**Auth Provider:**
- Supabase Auth, with email-based sign-in and sign-up (`app/(auth)/signin`, `app/(auth)/signup`).
  - Session handling: `middleware.ts` creates an `@supabase/ssr` server client on each request to refresh tokens and persist cookies. Server components cannot write cookies, so the middleware owns refresh.
  - Route protection: `middleware.ts` enforces session state, and role routes are split by layout (`app/(artist)`, `app/(industry)`, `app/(admin)`).
  - Staff and admin roles are managed through `app/api/admin/staff/`, `app/api/admin/members/`, and `app/api/admin/workspaces/`.
  - Workspace pilot access is cohort-gated (`WORKSPACE_COHORT_PILOT_ENABLED`, `WORKSPACE_ACCESS_GENERAL_ENABLED`). The kill switch is in the database table `public.workspace_access_config`.
  - Auth diagnostics: `app/api/auth/diagnostics`, `app/api/admin/auth-health`, and the retention cron `/api/cron/auth-diagnostics-retention`.
- Collaborator claim tokens: `app/api/claim-collaborators`, `app/api/approve/[token]`, `app/api/curators/claim/[token]`.
- Turnstile gates the waitlist (see APIs section).

## Monitoring & Observability

**Error Tracking:**
- Sentry via `@sentry/nextjs` ^10.70.0. Env-gated: no `Sentry.init` runs unless `SENTRY_DSN` is set.
  - Server: `sentry.server.config.ts` (loaded from `instrumentation.ts` for `NEXT_RUNTIME=nodejs`).
  - Edge: `sentry.edge.config.ts` (loaded for `NEXT_RUNTIME=edge`).
  - Browser: `instrumentation-client.ts`.
  - Request errors: `onRequestError` in `instrumentation.ts` routes through `Sentry.captureRequestError`.
  - Trace sampling: 100% when `VERCEL_ENV=preview`, 15% otherwise.
  - `sendDefaultPii: false`. A `beforeSend` hook calls `scrubKnownSensitiveKeys` from `lib/observability/scrub.ts`, which strips cookies, headers, and query strings and redacts sensitive keys.
  - Session replay is off.
  - Build-time source-map upload uses `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (build only, not inlined into the client).
  - `SENTRY_DSN` is inlined into the client bundle through the `env` key in `next.config.mjs`, to avoid the Sentry Marketplace default of a `NEXT_PUBLIC_` DSN name.

**Vendor and Platform Health:**
- `lib/observability/vendor-health.ts` probes Supabase, Stripe, Resend, DocuSeal, and Anthropic and reports status with a timeout.
- `lib/observability/alerts.ts` and `lib/observability/config.ts` hold alert and threshold settings. The daily check route is `app/api/cron/daily-observability-check`.
- `app/api/health` exposes a health endpoint.
- The admin IT dashboard links to the Better Stack status page (see APIs section).

**Logs:**
- No external log drain or logging SDK is in `package.json`. The project convention is no `console.log` in committed code (see `CLAUDE.md`), with errors surfaced through Sentry and Next.js output.

## CI/CD & Deployment

**Hosting:**
- Vercel. `vercel.json` defines cron jobs. `VERCEL_ENV` and `VERCEL_PLAN_TIER` are read in code. A `CNAME` file at the repo root sets the custom domain. Production URL: `https://funun.studio`.
- The repo contains no deploy workflow. Deployment is triggered outside `.github/workflows/`.

**CI Pipeline:**
- GitHub Actions. `.github/workflows/quality.yml` runs on pull requests and on pushes to `main`, on Ubuntu with Node 20 and `npm ci`:
  1. `npm run security:migrations:verify`
  2. `npm run typecheck:strict`
  3. `npm run lint` (with `--max-warnings=0`)
  4. `npm test -- --runInBand`
  5. `npm audit --omit=dev --audit-level=moderate`
  6. `npm run audit:gate` (`scripts/audit-gate.ts`, dated self-expiring audit deferrals)
- `.github/workflows/close-completed-prs.yml` closes PRs carrying the `completed` label, on `pull_request_target` events.

**Scheduled jobs (Vercel Cron, from `vercel.json`):**

| Schedule (UTC) | Route | Purpose |
|---|---|---|
| `0 6 * * 1` | `/api/cron/curator-reach` | Weekly curator reach refresh (Spotify, YouTube) |
| `0 15 * * *` | `/api/cron/daily-observability-check` | Daily vendor and observability check |
| `0 14 * * *` | `/api/cron/playbook-review-reminders` | Playbook review reminders |
| `0 13 * * *` | `/api/cron/playbook-reading-reminders` | Playbook reading reminders |
| `0 4 * * *` | `/api/cron/cleanup-rate-limits` | Rate-limit table cleanup |
| `30 4 * * *` | `/api/cron/auth-diagnostics-retention` | Auth diagnostics retention |
| `0 5 * * *` | `/api/cron/storage-usage-check` | Storage usage check |
| `* * * * *` | `/api/cron/process-jobs` | Background job queue drain |

Each cron route checks `Authorization: Bearer $CRON_SECRET` and fails closed when `CRON_SECRET` is unset (`app/api/cron/*/route.ts`).

## Environment Configuration

**Required env vars (server, secrets, names only):**
- Supabase: `SUPABASE_SERVICE_ROLE_KEY`
- Anthropic: `ANTHROPIC_API_KEY`
- OpenAI: `OPENAI_API_KEY`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STUDIO_MONTHLY`, `STRIPE_PRICE_STUDIO_YEARLY`, `STRIPE_PRICE_TEAM_MONTHLY`, `STRIPE_PRICE_TEAM_YEARLY`, `STRIPE_PRICE_FOUNDING`
- Resend: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ESIGN_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`, `PITCH_FROM_EMAIL`
- DocuSeal: `DOCUSEAL_API_KEY`, `DOCUSEAL_WEBHOOK_SECRET`
- Turnstile: `TURNSTILE_SECRET`
- Spotify: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
- YouTube: `YOUTUBE_API_KEY`
- Cron: `CRON_SECRET`
- Sentry (build and runtime): `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`
- Optional model overrides: `ANTHROPIC_PLAYBOOK_MODEL`, `OPENAI_TRANSCRIPTION_MODEL`, `OPENAI_LYRIC_ALIGNMENT_MODEL`, `OPENAI_LYRIC_STRUCTURE_MODEL`
- Other: `DDEX_DPID`, `VERCEL_PLAN_TIER`

**Public (browser-visible) env vars:**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_GOOGLE_PLACES_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_VAULT_DEMO`

**Feature flags and modes:**
- `NEXT_PUBLIC_VAULT_DEMO` (demo backend; `next.config.mjs` refuses to build with it set in production)
- `SONG_PASSPORT_ENABLED`, `SONG_PASSPORT_PILOT_ENABLED`, `SONG_PASSPORT_KILL_SWITCH` (kill switch wins over both enablement flags)
- `WORKSPACE_ACCESS_GENERAL_ENABLED`, `WORKSPACE_COHORT_PILOT_ENABLED`
- `ENABLE_UI_PREVIEW` (exposes `/profile-preview` in production when true)
- `STAFF_AVATAR_SELF_EDIT`

**Test-only:**
- `FUNUN_TEST_ADMIN_PASSWORD` is read by test code. Its value is not recorded here. The `tests/e2e/.auth/` directory was not opened.

**Documentation gap:** `.env.example` does not list `CRON_SECRET`, `SENTRY_*`, `RESEND_WEBHOOK_SECRET`, `PITCH_FROM_EMAIL`, `YOUTUBE_API_KEY`, `SPOTIFY_*`, `NEXT_PUBLIC_GOOGLE_PLACES_KEY`, `ANTHROPIC_PLAYBOOK_MODEL`, `VERCEL_PLAN_TIER`, or `STAFF_AVATAR_SELF_EDIT`, though the code reads all of them.

**Secrets location:**
- Production: Vercel project environment variables.
- Local: `.env.local` (git-ignored), created from `.env.example`.
- Supabase service role and Stripe keys must never carry a `NEXT_PUBLIC_` prefix. Several files state this as a rule (`lib/esign/docuseal.ts`, `lib/security/turnstile.ts`, `.env.example`).

## Webhooks & Callbacks

**Incoming:**
- `POST /api/webhooks/stripe` - Verifies the body with `stripe.webhooks.constructEvent` against the raw body and `STRIPE_WEBHOOK_SECRET`, then acts. Handles `checkout.session.completed` (marks deals paid, idempotent) and `account.updated` (Connect account state). Returns a non-2xx status with no processing when verification fails.
- `POST /api/webhooks/resend` - Verifies Svix headers with `svix` against `RESEND_WEBHOOK_SECRET` (`lib/webhooks/resend-verify.ts`). Returns 503 when the secret is unset. Handles `email.bounced` and `email.delivered`, accepting both nested `data.bounce.type` and flat `data.bounce_type`.
- `POST /api/webhooks/docuseal` - Verifies `X-Docuseal-Signature` as `{unixSeconds}.{hexHmac}` (HMAC-SHA256 over `{timestamp}.{rawBody}`, 5-minute staleness window, `timingSafeEqual`) in `lib/esign/webhook.ts`. On completion it stores the signed PDF and completion certificate, fans out split-sheet rows, and creates notifications.
- Cron endpoints under `/api/cron/*` are inbound HTTP triggers from Vercel Cron, authenticated with `CRON_SECRET`.
- Turnstile verification is an outbound call, not an inbound webhook (see APIs section).

**Outgoing:**
- None detected. The app does not call customer-supplied webhook URLs. Outbound traffic is limited to the API clients listed above.

**CSP connect and frame sources (`middleware.ts`):**
- `connect-src`: `'self'`, `https://*.supabase.co`, `wss://*.supabase.co`, `https://*.sentry.io`, `https://api.stripe.com`
- `frame-src`: `https://js.stripe.com`, `https://*.docuseal.com`, `https://challenges.cloudflare.com`
- `script-src`: nonce plus `'strict-dynamic'`, with `https://js.stripe.com` and `https://challenges.cloudflare.com`
- `media-src`: `'self'`, `blob:`, `https://*.supabase.co`
- Calls to Anthropic, OpenAI, Resend, DocuSeal API, Spotify, and YouTube are server-side, so they do not appear in `connect-src`.

---

*Integration audit: 2026-10-18*
