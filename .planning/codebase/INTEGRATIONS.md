# External Integrations

**Analysis Date:** 2026-06-26

## APIs & External Services

**AI / Content Generation:**
- Claude (Anthropic) - AI-powered tools for music industry professionals
  - SDK/Client: `@anthropic-ai/sdk` 0.52.0
  - Auth: `ANTHROPIC_API_KEY`
  - Usage: PitchPlug (email draft generation for Spotify pitches), contract PDF verification using native PDF document blocks
  - Models used: `claude-sonnet-4-20250514` (general), `claude-sonnet-4-6` (PitchPlug, contract verification)

**Email / Notifications:**
- Resend - Email delivery service
  - SDK/Client: `resend` 4.0.0
  - Auth: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (configured address)
  - Usage: Email notifications, pitch copies, match alerts via Antenna
  - Implementation: `lib/email/index.ts` - Graceful no-op when not configured

**Payments & Billing:**
- Stripe - Payment processing for subscription tiers
  - SDK/Client: `stripe` 17.7.0 (server), `@stripe/stripe-js` 4.0.0 (client)
  - Auth: `STRIPE_SECRET_KEY` (server-side only, never exposed to browser)
  - Price IDs configured as env vars: `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`, `STRIPE_PRICE_STUDIO_MONTHLY`, `STRIPE_PRICE_STUDIO_YEARLY`, `STRIPE_PRICE_FOUNDING`
  - Implementation: `lib/stripe/index.ts` exports singleton client and price constants
  - No webhook routes detected in current codebase (may be configured external to app)

## Data Storage

**Databases:**
- PostgreSQL (via Supabase)
  - Connection: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-side)
  - Client: `@supabase/supabase-js` 2.45.0, `@supabase/auth-helpers-nextjs` 0.10.0
  - Auth integration: Magic link / email confirmation flow with session cookies
  - Type generation: `npm run db:types` generates `types/supabase.ts` from local migrations
  - Migrations: Located in `supabase/migrations/` (SQL files for vault, antenna, social layer, contract verification, etc.)
  - Tables: `vault_projects`, `tracks`, `artist_profiles`, `notifications`, `antenna_opportunities`, `contracts`, `releases`, etc. (inferred from code)

**File Storage:**
- Supabase Storage buckets
  - `release-audio` - Track audio files (WAV, FLAC, MP3, AAC; max 250MB per file)
  - `release-assets` - Cover art, press photos, lyric cards, banners (JPEG, PNG, WebP; max 10MB)
  - `release-documents` - Split sheets, contracts, registrations (max 5MB)
  - Implementation: `lib/storage/index.ts` with upload/delete functions
  - Access: Public URLs for assets, signed URLs for sensitive documents (service role required for private bucket)

**Caching:**
- None detected

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (Magic link / Email confirmation)
  - Implementation: OAuth-style email flow without password
  - Session management: Cookies via `@supabase/auth-helpers-nextjs`
  - Server components use `createServerComponentClient()` via cookies
  - Route handlers use `createRouteHandlerClient()` via cookies
  - Middleware: `middleware.ts` protects `/vault`, `/dashboard`, `/settings` routes; redirects to signin with `next` param for post-login redirect
  - Auth callback: `app/auth/callback/route.ts` exchanges code for session
  - Service-role client: `createServiceClient()` for operations that bypass RLS (notifications, private storage access)

## Monitoring & Observability

**Error Tracking:**
- Not detected (no Sentry, Bugsnag, etc.)

**Logs:**
- Console logging (standard Node.js)
- No structured logging service detected

## CI/CD & Deployment

**Hosting:**
- Vercel (inferred from Next.js native support; no explicit config in repo)

**CI Pipeline:**
- Not detected in codebase (GitHub Actions config not visible)
- Git workflow: Standard PR-based with linting (`npm run lint` available)

## Environment Configuration

**Required env vars:**

**Server-side (never exposed):**
- `ANTHROPIC_API_KEY` - Claude API access
- `STRIPE_SECRET_KEY` - Stripe payment processing
- `SUPABASE_SERVICE_ROLE_KEY` - Admin database access, storage operations bypassing RLS
- `RESEND_API_KEY` - Email service authentication
- `RESEND_FROM_EMAIL` - Sender address for notifications

**Public/Client-side (NEXT_PUBLIC_*):**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_APP_URL` - Application base URL (used for notification links, pitch redirects)
- `NEXT_PUBLIC_VAULT_DEMO` - Feature flag for demo mode (disables auth, uses demo data)

**Price IDs (server-side Stripe):**
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_YEARLY`
- `STRIPE_PRICE_STUDIO_MONTHLY`
- `STRIPE_PRICE_STUDIO_YEARLY`
- `STRIPE_PRICE_FOUNDING`

**Secrets location:**
- `.env.local` - Local development (not committed)
- `.env.example` - Template with required keys (committed, no values)
- Production: Environment variables configured in Vercel dashboard

## Webhooks & Callbacks

**Incoming:**
- Auth callback: `GET /auth/callback` - Exchanges Supabase magic-link code for session
- Stripe webhooks: No routes detected in `app/api/stripe/` (may be configured via Stripe dashboard to external handler or Lambda)

**Outgoing:**
- Email notifications via Resend (async)
- No detected outbound webhooks to external services

---

*Integration audit: 2026-06-26*
