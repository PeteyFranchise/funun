<!-- refreshed: 2026-10-18 -->
# Architecture

**Analysis Date:** 2026-10-18

## System Overview

```text
 Browser (React client components)
   │ Supabase session cookie      │ fetch /api/*            │ supabase.channel (websocket)
   ▼                              ▼                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│ middleware.ts  per-request CSP nonce · getUser() · prefix route guard │
└──────────────────────────────────────────────────────────────────────┘
   │ pages + layouts (server components)     │ route handlers
   ▼                                         ▼
┌──────────────────────────┐   ┌────────────────────────────────────────┐
│ app/(admin) app/(artist) │   │ app/api/** (338 route.ts)              │
│ app/(auth) app/w sync …  │   │ zod parse · verifyAdmin / requireStaff │
│                          │   │ requireWorkspaceAccess · NextResponse  │
└────────────┬─────────────┘   └───────────────────┬────────────────────┘
             ▼                                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│ lib/<domain>/  rules, pure helpers, service modules (~45 domains)     │
└──────────────────────────────────────────────────────────────────────┘
   │ lib/supabase/server.ts                 │ provider adapters
   ▼                                        ▼
┌──────────────────────────────────┐  ┌─────────────────────────────────┐
│ Supabase Postgres                │  │ Stripe · Anthropic · Resend ·   │
│ RLS · RPCs · triggers · jobs     │  │ DocuSeal · Sentry               │
│ Storage buckets · Realtime       │  └─────────────────────────────────┘
└──────────────────────────────────┘
   ▲
   │ jobs table rows claimed by claim_next_job
┌──────────────────────────────────────────────────────────────────────┐
│ Vercel Cron (vercel.json) → app/api/cron/* → lib/jobs/run.ts         │
│ process-jobs runs every minute; other crons run daily or weekly      │
└──────────────────────────────────────────────────────────────────────┘
```

Funūn is one Next.js 15 App Router application deployed to Vercel. There is no separate backend service. Supabase is the system of record for identity, data, storage, and realtime. Business rules live in `lib/<domain>/` modules. Route handlers and server components are thin and call into those modules.

## Pattern Overview

**Overall:** Server-first Next.js monolith with domain-sliced service modules and database-enforced authorization.

**Key Characteristics:**
- Pages in `app/` are server components by default. They load data with the cookie-scoped Supabase client and pass it to client components in `components/`. 77 of the 148 `page.tsx` files import `createServerClient`.
- Three Supabase clients are in use, each with a different trust level (see Layers below). Choosing the right one is the main security decision in every server file.
- Authorization happens in four places: middleware (coarse, by path prefix), layouts and pages (role routing and redirects), route handlers (explicit gate calls), and the database (RLS policies and `SECURITY DEFINER` RPCs that take row locks).
- Roles come from Supabase `app_metadata`, not from a roles table. Staff roles are read from `app_metadata.staff_roles` (`lib/admin/staff-role.ts`). Buyer and curator access are read from `app_metadata.role`. Relationship membership (workspace members, buyer members) lives in tables.
- One auth user can hold several identities at once: artist member, workspace member, Client Partner (buyer), and Funūn staff. `resolveAccountContext` in `lib/accounts/account-context.ts` computes which surfaces an account can see.
- Background work is durable but polled. Requests enqueue rows in a `jobs` table. A cron-driven worker claims one job per invocation. There is no in-process queue or long-lived worker.
- A demo mode (`NEXT_PUBLIC_VAULT_DEMO=true`) swaps Sound Vault data for an in-memory store (`lib/vault/demo-store.ts`) and skips middleware auth outside production. `next.config.mjs` throws at build time if demo mode is set in production.

## Layers

**Middleware:**
- Purpose: Security headers, session refresh, coarse access control, and root-route rewriting. Runs before every matched request.
- Location: `middleware.ts`, with helpers in `lib/marketing/rootRewrite.ts` and `lib/marketing/nonceInjection.ts`
- Contains: Per-request CSP nonce, `getUser()` call, redirects for protected prefixes, `/api/admin/*` 401 gate, and the claim-collaborators trigger
- Depends on: `@supabase/ssr`, `lib/marketing/rootRewrite.ts`
- Used by: Every request except `_next/static`, `_next/image`, `favicon.ico`, `marketing/`, and `api` (the `/api/admin/:path*` matcher is added back explicitly)

**Route groups (pages and layouts):**
- Purpose: Role-specific UI shells and server-side data loading
- Location: `app/(admin)/`, `app/(artist)/`, `app/(auth)/`, `app/(curator-portal)/`, plus top-level public or semi-public routes `app/sync/`, `app/w/[workspaceId]/`, `app/r/`, `app/u/[handle]/`, `app/selects/[token]/`, `app/pitch/`, `app/approve/[token]/`, `app/join/[inviteToken]/`, `app/curators/claim/`, `app/help/`, `app/status/`, `app/team-fit/`, `app/unsubscribe/`
- Contains: `layout.tsx` files (9 in total), `page.tsx` (148), `loading.tsx`, `error.tsx`, `global-error.tsx`
- Depends on: `lib/supabase/server.ts`, domain modules in `lib/`, client components in `components/`
- Used by: Browser navigation

Layout responsibilities that matter:
- `app/layout.tsx` is the root shell. It loads the Inter font and sets `<html>` and `<body>` only.
- `app/(admin)/layout.tsx` requires a user (redirects to `/signin`) and any staff role (`getStaffRole`, redirects to `/`). It renders `AdminNav` and `SessionIdentityGuard`. Each leadership-only admin page adds its own inline check, because this layout is not the sole authority.
- `app/(artist)/layout.tsx` loads buyer membership, the profile row, and handle state through the service client. It resolves account context and redirects Funūn team members to `/admin`. It redirects members without a workspace to `/sync/catalog` or `/sync/access`. It also gates on a chosen handle (`ChooseHandleGate`). When there is no user, it returns children without navigation (line 161).
- `app/(curator-portal)/layout.tsx` requires `app_metadata.role === 'curator'`. Anonymous visitors go to `/curators/claim`.
- `app/sync/layout.tsx` (Client Partner / buyer shell) does not redirect logged-out visitors. Each page checks its own `buyer_members` membership and redirects to `/sync/access`.
- `app/w/[workspaceId]/layout.tsx` serves the workspace room. Middleware protects the `/w` prefix.

**Route handlers:**
- Purpose: HTTP endpoints for mutations, AI calls, webhooks, cron jobs, and file operations
- Location: `app/api/` (338 `route.ts` files). Admin routes are in `app/api/admin/` (126 files, including tests). Cron routes are in `app/api/cron/` (8 routes, 12 files). Webhook routes are in `app/api/webhooks/` (`stripe`, `resend`, `docuseal`).
- Contains: `GET`/`POST`/`PATCH`/`DELETE` exports, zod request schemas, gate calls, and `NextResponse.json`
- Depends on: `lib/admin/gate.ts`, `lib/workspaces/access.ts`, `lib/supabase/server.ts`, domain modules
- Used by: Client components via `fetch`, Stripe, Resend, DocuSeal, Vercel Cron

**Domain services:**
- Purpose: Business rules, validation, transformation, and provider adapters
- Location: `lib/<domain>/`. 59 domain folders. The largest are `lib/workspaces/` (67 files), `lib/catalogue/` (85 files), `lib/playbook/` (60 files), `lib/split-sheets/` (30 files), `lib/vault/` (22 files), `lib/deals/` (22 files), and `lib/client-partners/` (20 files).
- Contains: Pure functions (preferred in `lib/`), data-access helpers that take a Supabase client, and provider adapters such as `lib/esign/docuseal.ts` and `lib/stripe/connect.ts`
- Depends on: `lib/supabase/*`, `types/*`, third-party SDKs
- Used by: Route handlers, server components, and the job registry

**Supabase client factories:**
- Purpose: Choose the trust level for each database call
- Location: `lib/supabase/server.ts` (server), `lib/supabase/client.ts` (browser)
- Contains: `createServerClient` and `createApiClient` (both cookie-scoped, RLS applies, same implementation), `createServiceClient` (service-role key, bypasses RLS, `persistSession: false`), and the browser `createClient`
- Used by: Everything on the server. `createServiceClient` appears in 341 files under `app/api/`.

**Database:**
- Purpose: System of record, row-level security, atomic state changes, and job queue
- Location: `supabase/migrations/` (238 SQL files, numbered 001 to 242 with gaps). `supabase/config.toml` for the local stack.
- Contains: Tables, RLS policies (88 migration files enable RLS), `SECURITY DEFINER` functions (119 migration files), triggers, RPCs called from application code (101 files under `app/` and `lib/` call `.rpc(`)
- Used by: All server code

**Client components:**
- Purpose: Interactivity, forms, modals, and realtime subscriptions
- Location: `components/<domain>/` (32 domain folders). Most client files start with `'use client'`.
- Contains: Forms that POST to `/api/*`, realtime presence and message widgets, and drag-and-drop (`@dnd-kit`)
- Used by: Server components and layouts

**Background jobs:**
- Purpose: Work too slow or too costly for a request (lyric lifting, watermark previews, vault export)
- Location: `lib/jobs/queue.ts` (enqueue and types), `lib/jobs/run.ts` (dispatch), `lib/jobs/handlers.ts` (handler registry), `app/api/cron/process-jobs/route.ts` (worker)
- Enqueued from: `app/api/vault/[projectId]/export/route.ts`, `lib/catalogue/lyric-lift-queue.ts`, `lib/watermark/preview-queue.ts`
- Registered job types in `JOB_HANDLERS`: `lyric_lift`, `watermark_preview`, `vault_export`

## Data Flow

### Primary Request Path: Authenticated artist page load

1. `middleware.ts` builds a CSP with a per-request nonce, calls `supabase.auth.getUser()`, and redirects to `/signin?next=...` if the path is in its `isProtected` list and there is no user. For signed-in users whose `user_profiles.claimed_at` is null, it fires a non-blocking POST to `/api/claim-collaborators`.
2. `app/(artist)/layout.tsx` calls `getUser()` again through `createServerClient`. It reads buyer membership and profile data through `createServiceClient`, then calls `resolveAccountContext` and `getStaffRoles`. It redirects according to account context and passes resolved flags (not client-fetched data) to `ArtistLayoutClient`.
3. The page server component (for example `app/(artist)/vault/[projectId]/page.tsx`) reads data with the cookie-scoped client, so RLS applies, and renders client components.
4. A client component submits a change with `fetch` to a route under `app/api/`.
5. The route handler parses the body with a zod schema (`.strict()` on create payloads, see `app/api/vault/route.ts`), authorizes the caller, performs the write, and returns `NextResponse.json` with an explicit status code.

### Secondary Flow: Admin charges a deal

`app/api/admin/deals/[id]/pay/route.ts`:
1. `verifyAdmin()` from `lib/admin/gate.ts` returns `{ error, status }` or the authenticated user.
2. The handler loads the deal with `createServiceClient()`. It refuses to charge when the gross fee, commission, linked signed contract, or artist payout account is missing.
3. The route accepts no request body. `buildDestinationChargeParams` in `lib/stripe/connect.ts` computes the application fee from the stored `commission_pct`, so the client cannot change the split.
4. `createCheckoutSessionForCharge` creates the Checkout Session.
5. `app/api/webhooks/stripe/route.ts` verifies the signature with `stripe.webhooks.constructEvent` before reading the body. It handles `checkout.session.completed` and `account.updated`. Non-2xx responses make Stripe retry.

### Background Flow: Job queue

1. A request handler calls `enqueueJob({ type, payload, dedupKey })` from `lib/jobs/queue.ts`. A partial unique index rejects a second active job with the same `dedup_key`, and the helper returns the existing job's id.
2. Vercel Cron calls `app/api/cron/process-jobs/route.ts` every minute (`vercel.json`). The worker claims one job per invocation through the `claim_next_job` RPC, which sets a 300-second lease.
3. `lib/jobs/run.ts` dispatches by `job.type` to `JOB_HANDLERS` in `lib/jobs/handlers.ts`.
4. The handler's result is written back to the row. Permanent outcomes (for example, no master audio) return a result instead of throwing, so the job completes without retrying.

### Workspace Mutation Flow

`app/api/workspaces/[workspaceId]/members/route.ts` shows the pattern for stateful workspace changes:
1. `requireWorkspaceAccess` re-derives the caller's membership from the database. The route never trusts a workspace id from the body.
2. The route passes the already-proven actor id to one RPC, `workspace_change_member_role_or_status` (migration 198). The RPC locks the row, re-checks the owner floor, mutates, and writes its own audit row in one transaction.
3. The route issues no direct `.update()` on `workspace_members`. The comment in that file calls the RPC "the single writer."

**State Management:**
- Server state is loaded in server components and layouts. It is not cached on the client.
- Client state uses React hooks. React Context appears in only a few places: `components/settings/SettingsFormProvider.tsx`, `components/nav/ArtistLayoutClient.tsx`, and `components/ideas/GlobalQuickCapture.tsx`.
- No Redux, Zustand, or TanStack Query dependency is present.
- Tab identity and account-switch intent are stored in `sessionStorage` under the keys `funun:tab-identity:v1` and `funun:account-switch-intent:v1` (`lib/auth/session-identity.ts`). `components/auth/SessionIdentityGuard.tsx` uses them to block a tab that has drifted to another account.
- Realtime uses `supabase.channel(...)` in `components/messages/`, `components/nav/` (`PresenceTracker`, `NotificationBell`, `MessagesIcon`), `components/catalogue/WriterRoomPresence.tsx`, and `lib/green-room/realtime.ts`.

## Key Abstractions

**Workspace:**
- Purpose: Collaboration container for an artist team, management company, or label
- Examples: `lib/workspaces/types.ts`, `lib/workspaces/membership.ts`, `lib/workspaces/access.ts`
- Pattern: Vocabulary is defined once in `types.ts` and mirrored by migrations 182 to 186 CHECK constraints. `workspace_type` is never an authorization input (D-01). Authorization comes from role, membership state, grants, and relationship tier.
- Roles: `owner`, `admin`, `member`, `contractor`, `guest`. Membership states: `pending`, `active`, `suspended`, `removed`, `expired`.
- Platform-wide kill switch: `lib/workspaces/access-kill-switch.ts`

**Staff role:**
- Purpose: Funūn team permissions
- Examples: `lib/admin/staff-role.ts` (client-safe), `lib/admin/gate.ts` (server gates)
- Pattern: Multi-role. `app_metadata.staff_roles` is an array. The legacy single `staff_role` is read as a fallback. `requireStaff(allowed)` passes when any held role is allowed. Its default is `OPERATIONAL_STAFF_ROLES`, which excludes the read-only `it` role. Use `hasStaffRole` for capability checks in UI. Using `getStaffRole() === x` gives a stricter answer than the server for multi-role staff.

**Account context:**
- Purpose: Decide which surfaces one auth user can enter
- Examples: `lib/accounts/account-context.ts` (`resolveAccountContext`), `lib/workspaces/active-context.ts`
- Pattern: Input is membership facts (profile exists, buyer memberships count, staff roles). Output is flags such as `isFununTeamMember`, `hasMemberWorkspace`, and `hasClientPartnerWorkspace`.

**Capability:**
- Purpose: Feature checks by plan or relationship
- Examples: `lib/capabilities/check.ts` (`hasCapability`), `lib/vault/membership.ts`, `lib/vault/hire-credits.ts`

**Vault project and readiness:**
- Purpose: The central artist-side entity (a single, EP, album, or unreleased project) and its readiness score
- Examples: `app/api/vault/route.ts`, `lib/vault/readiness.ts`, `lib/vault/readiness-tiers.ts`, `components/vault/`
- Pattern: Route handlers use an explicit zod schema and an allowlist of editable fields. Readiness is computed in `lib/vault/readiness.ts`. Document export and PDF generation live in `lib/vault/pdf/` and `lib/vault/export-*.ts`.

**Catalogue works:**
- Purpose: Songwriting and lyric records (the "Writer's Room" surface)
- Examples: `lib/catalogue/access.ts`, `app/api/works/` (51 files), `app/(artist)/vault/works/[workId]/page.tsx`
- Pattern: `lib/catalogue/access.ts` holds the access decision used by every `/api/works` route.

**Provider adapters:**
- Purpose: Isolate third-party services behind a small interface
- Examples: `lib/esign/provider.ts` (interface), `lib/esign/docuseal.ts` (DocuSeal adapter, plain `fetch`), `lib/esign/webhook.ts`, `lib/stripe/connect.ts`, `lib/anthropic/index.ts`, `lib/email/`, `lib/webhooks/resend-verify.ts`

**Job:**
- Purpose: Durable unit of background work
- Examples: `lib/jobs/queue.ts` (type `Job` with `status`, `attempts`, `max_attempts`, `claim_token`, `lease_expires_at`), `lib/jobs/handlers.ts`
- Pattern: Enqueue is idempotent through `dedup_key`. Claim is fenced by `claim_token` and the lease, so an overlapping cron cannot reclaim a running paid request.

**Playbook:**
- Purpose: Internal operating manual for Funūn staff, organized in rooms
- Examples: `app/(admin)/admin/playbook/[room]/[slug]/`, `lib/playbook/access-grants.ts`, `components/playbook/`
- Rooms include `it`, `learning`, `plays`, `publication`, `readiness`, `workflows`, and `incidents`. Source docs are read from `docs/` and `.planning/deliberations/` at runtime (see `next.config.mjs`).

## Entry Points

**Middleware:**
- Location: `middleware.ts`
- Triggers: Every matched request
- Responsibilities: CSP nonce, session refresh, prefix guards, `/api/admin` 401, root rewrite, claim trigger

**Root page:**
- Location: `app/page.tsx`
- Triggers: Authenticated or unauthenticated visit to `/` that middleware does not rewrite
- Responsibilities: Role routing. Logged out goes to `/signin`. Staff go to `STAFF_HOME` (`/admin/client-partners`). Buyers go to `BUYER_HOME` (`/sync/catalog`). Everyone else goes to `/dashboard`.
- Anonymous `/` is rewritten by middleware to `/marketing-document` (`app/marketing-document/route.ts`), which serves `assets/marketing/landing.html`.

**Post-sign-in destination:**
- Location: `lib/auth/postSignInPath.ts`
- Precedence: a same-origin `?next=` wins. Buyers go to `/sync/catalog`. Staff go to `/admin/client-partners`. Everyone else goes to `DEFAULT_HOME`, which is `/vault`.

**Sound Vault:**
- Location: `app/(artist)/vault/page.tsx`
- Triggers: Post-sign-in redirect and middleware redirect of signed-in visitors away from auth routes
- Responsibilities: Project list with readiness scores

**Admin console:**
- Location: `app/(admin)/layout.tsx`, `app/(admin)/admin/*`
- Triggers: Staff navigation
- Responsibilities: Room-based internal tools (deals, members, playbook, sync library, client partners, verification)

**Sync and Client Partner surface:**
- Location: `app/sync/layout.tsx`, `app/sync/catalog/page.tsx`, `app/sync/access/page.tsx`
- Triggers: Buyer or Client Partner sign-in, or artist redirect for a missing member workspace
- Responsibilities: Catalogue browsing, requests, shortlists, brief builder

**Public artifact routes:**
- Locations: `app/r/[projectId]/page.tsx`, `app/u/[handle]/page.tsx`, `app/selects/[token]/page.tsx`, `app/pitch/accept/[token]/page.tsx`, `app/approve/[token]/page.tsx`, `app/join/[inviteToken]/page.tsx`
- Triggers: Links in emails or shared URLs. Token-based access; no account required.

**Instrumentation:**
- Location: `instrumentation.ts` (server and edge Sentry config by `NEXT_RUNTIME`), `instrumentation-client.ts` (browser)
- Responsibilities: Sentry init when `SENTRY_DSN` is set. `onRequestError` is `Sentry.captureRequestError`.

**Webhooks:**
- Locations: `app/api/webhooks/stripe/route.ts`, `app/api/webhooks/resend/route.ts`, `app/api/webhooks/docuseal/route.ts`

**Cron:**
- Locations: `app/api/cron/{process-jobs,curator-reach,daily-observability-check,playbook-review-reminders,playbook-reading-reminders,cleanup-rate-limits,auth-diagnostics-retention,storage-usage-check}/route.ts`, all listed in `vercel.json`

**CLI scripts:**
- Location: `scripts/*.ts` run through `tsx` (`audit:gate`, `break-glass`, `marketing:*`, `playbook:activation-check`, `export:audition-sample`)

## Architectural Constraints

- **Threading:** Each request runs in a Node or Edge serverless function on Vercel. There are no worker threads or in-process queues. Background work uses the `jobs` table and a one-minute cron. The worker processes at most one job per invocation (`processPendingJobs({ max: 1 })`), so throughput is one job per minute and a queued job waits for the next tick. The route comment says a sub-daily schedule requires Vercel Pro, and `vercel.json` schedules this route every minute.
- **Global state:** No module-level singletons hold request data. Environment flags are read at module load in some routes, for example `const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'` in `app/api/vault/route.ts`.
- **Build-time file tracing:** `next.config.mjs` (`outputFileTracingIncludes`) lists every file that is read at runtime through a `process.cwd()` path. These include the PDF fonts in `assets/fonts/`, the observability docs in `docs/observability/`, the marketing HTML, and four files in `.planning/deliberations/`. A new runtime file read must be added there, or it works in `next dev` and fails in the deployed bundle.
- **Client-safe modules:** `lib/admin/staff-role.ts` exists so client components can import role logic without pulling in `next/headers`. `lib/admin/gate.ts` re-exports it. Client code must import from `staff-role.ts`, not `gate.ts`.
- **Middleware matching is by prefix:** `isProtected` in `middleware.ts` is a hand-maintained list of path prefixes. Route groups such as `(artist)` do not appear in URLs and are not matched.
- **Circular imports:** Not measured in this pass. No import-cycle tool is configured in `package.json`.

## Anti-Patterns

### Protecting routes by a manual prefix list

**What happens:** `isProtected` in `middleware.ts` only redirects the prefixes it lists. Route groups don't appear in URLs, so a page under `(artist)` isn't covered unless its prefix is added. Current gaps are tracked in private advisory GHSA-f377-hmwq-3cfv.
**Why it's wrong:** A new route added under a protected group is public unless someone also adds its prefix to `middleware.ts`. The codebase's own comment in `lib/green-room/access.ts` records the same failure class: routes that checked only `if (!user)` and ignored the database-side policy.
**Do this instead:** Add the prefix to `isProtected` in `middleware.ts`, or call a shared redirect helper in the `(artist)` layout. Keep database RLS as the final control for every table these pages read.

### Parallel definitions of the artist home

**What happens:** Three different artist destinations are hard-coded. `app/page.tsx` redirects artists to `/dashboard`. `lib/auth/postSignInPath.ts` uses `DEFAULT_HOME = '/vault'`. `middleware.ts` redirects signed-in visitors away from `/signin`, `/signup`, and `/forgot-password` to `/vault`.
**Why it's wrong:** A user who signs in through one path lands on a different page than a user who opens the root. Changing the default requires three edits.
**Do this instead:** Route all artist defaults through `postSignInPath` and `DEFAULT_HOME`, and have `app/page.tsx` call the same resolver.

### Choosing the service client by habit

**What happens:** `createServiceClient()` is used in 341 files under `app/api/`, including reads that could run under the caller's session with RLS. The `(artist)` layout uses it to read the caller's own profile.
**Why it's wrong:** Every service-role call bypasses RLS. Ownership then depends entirely on the handler's own check, and a missed check exposes data without any database backstop.
**Do this instead:** Use `createApiClient()` or `createServerClient()` for anything the caller can read or write under RLS. Reserve the service client for work the database cannot express, and check ownership in the handler before the call (see the comment on `createServiceClient` in `lib/supabase/server.ts`).

## Error Handling

**Strategy:** Route handlers return explicit HTTP status codes with a JSON body. Internal failures are reduced to generic messages. Library functions throw `Error` with user-facing text. Best-effort side effects never throw.

**Patterns:**
- Gate failures return `{ error, status }` from `requireStaff`, `verifyAdmin`, and `requireWorkspaceAccess`, and the route forwards them with `NextResponse.json`.
- Database errors in routes return a generic message. Example: `'Request could not be completed.'` with status 500 in `app/api/admin/deals/[id]/pay/route.ts`.
- Best-effort emits never throw. `lib/social/activity-emit.ts` is documented that way and is wrapped in try/catch at call sites.
- Stripe webhooks return non-2xx for failures so Stripe retries.
- Job handlers throw for transient failures and return a result for permanent outcomes. The worker in `lib/jobs/run.ts` records the attempt count against `max_attempts`.
- Server errors reach Sentry through `onRequestError` in `instrumentation.ts`. Alert fan-out is in `lib/observability/alerts.ts`, and scrubbing is in `lib/observability/scrub.ts`.

## Cross-Cutting Concerns

**Logging:** Correlation IDs in `lib/logging/correlation.ts`. Structured logger in `lib/observability/logger.ts`. Vendor health checks in `lib/observability/vendor-health.ts`, run by the `daily-observability-check` cron.

**Validation:** zod schemas in route handlers and domain `schema.ts` or `date-schemas.ts` modules. Request bodies are parsed with `.strict()` for create payloads. Shared validators live in `lib/phone.ts`, `lib/genres.ts`, and `lib/metadata/identifiers.ts`.

**Authentication:** Supabase Auth through cookies. Middleware refreshes the session. Code calls `getUser()` and not `getSession()`, because `getSession()` can reflect a stale client cookie. Sign-in is allowed while a session exists, so a user can replace a stale identity (`middleware.ts`).

**Security headers:** Static headers in `next.config.mjs` (`nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS). Dynamic CSP with a per-request nonce and `strict-dynamic` in `middleware.ts`. The CSP allows Stripe, Cloudflare Turnstile, DocuSeal, and Supabase origins.

**Abuse controls:** Rate limiting in `lib/security/rate-limit.ts` (imported by 70 files). Upload admission in `lib/security/upload-admission.ts` (11 importers). Turnstile bot checks in `lib/security/turnstile.ts` on the waitlist. `app/api/cron/cleanup-rate-limits/route.ts` handles cleanup.

**Watermarking:** Audio previews are rendered by the `watermark_preview` job (`lib/watermark/`).

**Documentation drift:** The "Platform architecture" tree in `README.md` lists `(marketing)`, `(industry)`, `api/tracks`, `api/stripe`, and `lib/stripe` directories that do not exist in this repository. Use this document and `STRUCTURE.md` as the reference.

---

*Architecture analysis: 2026-10-18*
