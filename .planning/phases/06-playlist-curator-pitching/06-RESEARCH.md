# Phase 6: Playlist Curator Pitching - Research

**Researched:** 2026-07-01
**Domain:** Cold-outreach email (Resend + new sending subdomain), inbound webhooks (Svix signature verification), scheduled jobs (Vercel Cron), third-party reach-signal APIs (Spotify Web API, YouTube Data API v3), and a second Supabase account type (curator magic-link auth) layered onto an existing artist-only app.
**Confidence:** MEDIUM — codebase patterns are HIGH confidence (read directly); the four new architectural patterns (webhooks, cron, external reach APIs, second account type) are MEDIUM confidence (WebSearch-verified against official docs, not fetched via an authenticated docs provider this session).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Curator Directory Seeding**
- D-01: No bulk import or SQL seed migration for v1 — curators are added one at a time through an admin CRUD page (`/admin/curators`), following the same pattern as Phase 5's `ChecklistAdmin`.
- D-02: Curator record carries a lean field set (name, email, playlist/channel name + URL, genre focus, submission notes) **plus** an auto-fetched reach signal (follower/subscriber count) — not admin-entered.
- D-03: Reach signal is fetched on admin add/edit **and** refreshed periodically. Platforms: **Spotify (Web API) and YouTube (Data API)** — both need new credentials. Cadence: **weekly**. Mechanism: **Vercel Cron** (`vercel.json` `crons` entry + a protected API route) — new pattern for the codebase.
- D-04: If Spotify/YouTube credentials aren't present, the fetch fails gracefully (reach signal stays empty) — same no-op-when-unconfigured pattern as `lib/email/index.ts`.

**Pitch Composer & Drafting**
- D-05: The 150-word pitch note is **AI-drafted, editable** — reuse the PitchPlug pattern (Claude via `@anthropic-ai/sdk`) to draft a playlist-specific note from track/release data + the curator's genre focus. Artist edits before sending.
- D-06: **Both** entry points exist: track-first inside `/launchpad/[projectId]`, and curator-first via a new standalone `/curators` page (global directory, browse/filter across all curators).
- D-07: From `/curators`, after selecting curators + a track, the flow **redirects into `/launchpad/[projectId]`** — the composer (150-word note + Send) always lives in the project room. `/curators` has no composer modal.
- D-08: Duplicate-send guard is enforced in the UI, not just the API: already-pitched curators appear **disabled and labeled** ("Already pitched · [status]") in the multi-select.
- D-09: Track selection is **not** scoped to a single "lead track" — any individual track within the project can be pitched.

**Response & Engagement Signals**
- D-10: No automatic open-tracking pixel. **"Opened" is dropped from the automatic status pipeline entirely.** Status only moves via explicit curator action.
- D-11: Accept/Decline happen via **one-click, token-authenticated response links** in the pitch email footer (same pattern as the curator claim link — no login required to respond).
- D-12: Decline includes an **optional reason field** — clicking Decline lands on a small page with a skippable free-text "why?" field before confirming. Accept can be a bare click.
- D-13: PITCH-04 response rate = **(accepted + declined) / total pitched**, last 90 days. Any explicit action counts as "responsive."
- D-14: When a curator clicks Accept/Decline, the artist is notified via **email + the existing in-app notifications table** (reuse the pattern already used for Antenna match notifications).

**Bounce Detection, Genre Drift, and Curator Claim**
- D-15: Hard-bounce detection is **in scope** — build a new `/api/webhooks/resend` route (the first webhook route in this codebase) that verifies the Resend/Svix signature and listens for the hard-bounce event, flipping `curators.email_valid` to `false`.
- D-16: Genre drift signal: store a **baseline** genre-focus tag set per curator; an alert fires when **either an admin or the curator themself** edits genre focus tags and the new set differs significantly from baseline. No automated playlist-content analysis.
- D-17: Drift alert audience: **admin (badge in `/admin/curators`) + artist-facing warning at pitch time**. Alert is advisory, not blocking.
- D-18: Claiming a profile (explicit link-click only, 32-byte token, 72h expiry, one-time use) creates a **lightweight Funūn account** for the curator (magic-link auth, reusing existing Supabase auth pattern — no password).
- D-19: Claimed curator account scope: **full self-serve profile edit** (genre focus, platform, playlist/channel URL, submission notes/bio) **plus a read-only "pitches I've received" view**. No other app access.
- D-20: Unsubscribe link (required in every pitch email) sets a **do-not-pitch flag** on the curator record — curator stays visible/browsable, but `Send` is blocked against them going forward. Does **not** remove them from the directory.
- D-21: Admin "flag inactive" (PITCH-07) is a **manual toggle with a suggested signal** — never automatic.

**Send-Domain & Credentials Readiness**
- D-22: `pitch.funun.studio` (DKIM/SPF/DMARC + ~2-week warmup) is **not yet set up**. Phase 6 ships fully built regardless — sending uses a `PITCH_FROM_EMAIL` env var. Until DNS/warmup completes, `Send` fails gracefully at the Resend API level (same no-op-when-unconfigured pattern as `lib/email/index.ts`). Not a build blocker.
- D-23: Spotify Web API and YouTube Data API credentials do **not** exist yet either — same graceful-degradation treatment, gated behind `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`/`YOUTUBE_API_KEY` env vars.

### Claude's Discretion
- Exact filter platform value list beyond "Streaming + blog/other" (Spotify, Apple Music, YouTube Music, SoundCloud, + generic "Blog / Independent" catch-all) — finalize exact enum during planning.
- Vercel Cron job failure/retry handling, Spotify/YouTube API rate-limit handling for the weekly refresh.
- Exact `curators` / `pitch_history` table schema beyond what's already named in ROADMAP.md — planner designs full schema, RLS enabled immediately after each `CREATE TABLE`.
- Svix webhook signature verification implementation details (library, secret rotation).
- Whether "Playlist Curator" industry role addition (PITCH-08) needs any UI beyond adding it to `lib/industry-roles.ts` — likely trivial, no discussion needed.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within Phase 6 scope. (Automated curator directory seeding via scraping/API remains explicitly out of scope per `PROJECT.md` / `REQUIREMENTS.md` — Wave 4.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PITCH-01 | Artist can browse a curator directory filtered by genre and platform | `curators` schema + filter enum (Architecture Patterns, Standard Stack); `/curators` route mirrors existing server-component + client-filter pattern used by `/launchpad` |
| PITCH-02 | Artist selects a track, sends a pitch email via Resend from `pitch.funun.studio`; 150-word + playlist-specific gate; player link + unsubscribe | AI-drafted note pattern (reuse PitchPlug/`lib/tools/pitchplug.ts`); `lib/email/index.ts` extension for a second `from` domain; graceful no-op when `PITCH_FROM_EMAIL`/`RESEND_API_KEY` unset |
| PITCH-03 | Pitch history tracked per project; duplicate-send prevented | `pitch_history` schema + unique constraint (curator_id, track_id); UI duplicate-guard pattern (D-08) |
| PITCH-04 | Response rate per curator, last 90 days | Response-rate query pattern (Architecture Patterns); reuses `notifications`-adjacent aggregate-query style already used in `lib/vault/readiness.ts` |
| PITCH-05 | Curator claim via time-limited token link | Token pattern precedent: `lib/split-sheets/approval.ts` (`generateApprovalToken`, `crypto.randomBytes(32)`) + `collaborator_invites` expiry/one-time-use pattern; magic-link auth research (Architecture Patterns §4) |
| PITCH-06 | Hard-bounce invalidation + genre drift alerts | Webhook signature verification research (Architecture Patterns §1); baseline-tag-diff pattern for drift (Architecture Patterns §5) |
| PITCH-07 | Admin curator directory view (add/edit/flag inactive/review claimed) | `ChecklistAdmin.tsx` + `app/(admin)/layout.tsx` + `lib/admin/gate.ts` direct precedent |
| PITCH-08 | "Playlist Curator" added to industry occupation options | `lib/industry-roles.ts` — confirmed trivial addition, `ProfileForm.tsx` renders `INDUSTRY_ROLE_GROUPS` dynamically, no other code touches the role list |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- TypeScript strict mode; 2-space indent; no semicolons; `@/*` path alias only (never relative `../` imports in shared code).
- Zod for input validation; explicit allowlist of editable fields on every PATCH (mirror `EDITABLE_FIELDS` in `app/api/profile/route.ts` / `lib/admin/gate.ts`).
- Every new table: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` **immediately** after `CREATE TABLE` in the same migration (CVE-2025-48757 convention, enforced since Wave 3).
- Admin API routes independently re-verify `is_admin` via `verifyAdmin()` — never rely on layout-level gating alone.
- Graceful no-op when integration env vars are missing — `lib/email/index.ts` is the canonical reference implementation; extend the same shape for Spotify, YouTube, and the pitch-domain send.
- Server-first architecture: pages fetch data server-side; admin pages query Supabase directly via `createServiceClient()` (not self-fetching API routes).
- No console.log in committed code; errors are thrown with actionable, user-facing messages.
- No test framework in the project (`package.json` has no test runner) — Nyquist validation for this phase is manual/smoke verification, matching Phase 5's approach.
- Never make direct repo edits outside a GSD workflow (`/gsd-plan-phase`, `/gsd-execute-phase`, etc.) — enforced separately from this research.

## Summary

Phase 6 is architecturally the biggest jump so far in this codebase: it introduces the first inbound webhook route, the first scheduled/cron job, the first two third-party read-only API integrations (Spotify, YouTube), and the first non-artist Supabase account type. None of these are exotic technically, but each interacts with an existing, working convention in a way that needs to be gotten right up front — most importantly, the existing `handle_new_user()` trigger (migration 026) fires unconditionally on every `auth.users` INSERT and will create an unwanted `artist_profiles` + `subscriptions` row for a curator unless the claim flow is deliberately designed around it.

Everything else in this phase has a strong, directly-reusable precedent already living in the codebase: the admin CRUD pattern (`ChecklistAdmin.tsx` + `lib/admin/gate.ts`), the token-link pattern (`lib/split-sheets/approval.ts` — 256-bit hex token via `crypto.randomBytes(32)`, expiry column, status-based one-time-use guard), the AI-drafting pattern (`lib/tools/pitchplug.ts` + `app/api/tools/pitchplug/route.ts` — Anthropic SDK, JSON-fence extraction, DEMO-mode fallback), the notification pattern (`lib/notifications/index.ts` — in-app row + optional email copy), and the graceful-degradation pattern (`lib/email/index.ts` — return `{ ok: false }, never throw`). The plan should lean hard on copying these, not reinventing them.

The one non-trivial technology decision is webhook signature verification: the project's pinned `resend` version (`^4.0.0`) predates Resend's built-in `webhooks.verify()` helper (added around v6.2, later re-based on `standardwebhooks` at v6.14+). Upgrading `resend` two major versions to get one helper method is higher-risk than it looks (touches the already-working `lib/email/index.ts`). The lower-risk path is adding `svix` (the underlying library Resend itself now depends on) as a small, standalone, additive dependency and verifying signatures directly against the `RESEND_WEBHOOK_SECRET` — leaving `lib/email/index.ts` and the pinned `resend` version untouched.

**Primary recommendation:** Reuse existing token/admin/AI-draft/notification patterns verbatim; add `svix` as a standalone dependency for webhook verification rather than upgrading `resend`; and explicitly branch `handle_new_user()` (or bypass it entirely for curator account creation) so curator magic-link signups do not silently acquire an artist profile.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Curator directory browse/filter (`/curators`) | Frontend Server (SSR) | API/Backend (filter query) | Server component fetches + renders list, same as `/launchpad`; filter params passed as searchParams, re-fetched server-side |
| Pitch composer (150-word note, Send) | Browser/Client | API/Backend | Client component for live word-count + edit state; POST to API route for AI draft + send, same shape as `PitchPlugForm.tsx` |
| AI pitch-note drafting | API/Backend | — | Anthropic SDK call must stay server-side (API key never exposed); mirrors `app/api/tools/pitchplug/route.ts` |
| Pitch send (Resend, `pitch.funun.studio`) | API/Backend | — | `lib/email/index.ts`-style wrapper; server-only, uses `PITCH_FROM_EMAIL` |
| Pitch history + duplicate-send guard | Database/Storage | API/Backend | Unique constraint enforces the invariant at the DB layer; API/UI both check ahead of time for UX (D-08) |
| Curator response (Accept/Decline via token link) | API/Backend | Frontend Server (confirmation page) | Public, unauthenticated route keyed by token; no session required (D-11) |
| Curator claim + magic-link account | API/Backend | Database/Storage (auth.users, curators.claimed_by) | Token verification + Supabase Admin API calls must run server-side with service role |
| Curator self-serve profile edit + pitch history view | Frontend Server (SSR) | API/Backend | New curator-portal route, session-gated by `app_metadata.role === 'curator'`, explicitly outside `middleware.ts`'s artist-protected prefix list |
| Hard-bounce webhook ingestion | API/Backend | Database/Storage | `/api/webhooks/resend` — signature-verified, unauthenticated by session (secret is the auth), writes `curators.email_valid` |
| Weekly reach-signal refresh (Spotify/YouTube) | API/Backend | Database/Storage | Vercel Cron invokes a protected API route; route fetches external data and writes to `curators` |
| Genre drift baseline + alert | Database/Storage | API/Backend | Baseline stored as JSONB array on `curators`; diff computed in API route on edit, not a DB trigger (keeps threshold logic in application code, easy to tune) |
| Admin curator directory (`/admin/curators`) | Frontend Server (SSR) | API/Backend | Direct `createServiceClient()` read, same as `/admin/checklist`; admin API routes re-verify `is_admin` independently |
| "Playlist Curator" industry role | Database/Storage (no schema change) | — | Pure data addition to `lib/industry-roles.ts`; `artist_profiles.industry_roles TEXT[]` already accepts arbitrary slugs |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `svix` | `^1.96.1` [VERIFIED: npm registry] | Verify Resend's Svix-signed webhook payloads (`/api/webhooks/resend`) | Resend's own Node SDK depends on this exact library internally for its `webhooks.verify()` helper; using it directly avoids a 2-major-version `resend` upgrade while getting the identical verification logic. `[SUS-flagged — see Package Legitimacy Audit; requires checkpoint:human-verify before install]` |
| `@anthropic-ai/sdk` | `^0.52.0` (already installed) | AI-drafted 150-word pitch note (D-05) | Already the project's sole LLM SDK; PitchPlug precedent (`lib/tools/pitchplug.ts`) is directly reusable |
| `resend` | `^4.0.0` (already installed, **no change**) | Pitch email send via `PITCH_FROM_EMAIL` | Existing wrapper (`lib/email/index.ts`) already works; only needs a `from`-override parameter, not a version bump |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `crypto` (Node built-in) | n/a | Claim token + accept/decline response tokens | Reuse `generateApprovalToken()` shape from `lib/split-sheets/approval.ts` (`randomBytes(32).toString('hex')`) — do not add a token library |
| `zod` | `^3.23.0` (already installed) | Validate admin curator CRUD payloads, pitch composer payload, cron/webhook route inputs | Consistent with existing API input-validation convention |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `svix` (standalone dep) | Upgrade `resend` to `^6.16.0` and use `resend.webhooks.verify()` | Fewer total dependencies, but a 4→6 major-version jump on an already-working, actively-used wrapper (`lib/email/index.ts`) is a much larger blast radius for a single helper method. Recommend `svix` unless the team wants to take the `resend` upgrade anyway for other reasons (e.g. newer send features). |
| Vercel Cron | `node-cron` / in-process scheduler | Would require a long-running process; Next.js on Vercel is serverless/stateless — no persistent process to host an in-process cron. Vercel Cron is the only mechanism that fits the deployment model (confirmed: no cron infra exists today per `INTEGRATIONS.md`). |
| Raw `fetch()` to Spotify/YouTube REST endpoints | `spotify-web-api-node` / `googleapis` SDKs | Both fetches are simple, low-frequency (weekly), read-only GET calls against 1-2 endpoints each. A full SDK adds dependency weight for functionality raw `fetch()` covers in ~20 lines; matches the codebase's existing preference for direct API calls over heavy SDKs (see `lib/contracts/verify.ts` using native Anthropic PDF blocks instead of a PDF-parsing library). |
| `app_metadata.role = 'curator'` role check | A separate `curator_profiles` table with its own auth flag | `app_metadata` is service-role-only writable (cannot be tampered with client-side, unlike `user_metadata`), giving a security property equivalent to `is_admin` in `lib/admin/gate.ts` for near-zero schema cost. A `curators` row already exists for the directory data; no second profile table needed. |

**Installation:**
```bash
npm install svix
```

**Version verification:** `npm view svix version` → `1.96.1` confirmed live on the npm registry, published under `github.com/svix/svix-webhooks`, package first published 2021-05-20, ~4.88M weekly downloads. `npm view resend version` → latest is `6.16.0` (project is pinned to `^4.0.0`, i.e. will NOT auto-upgrade past `4.x` — the `webhooks.verify()` helper does not exist on any `4.x` release).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `svix` | npm | ~5 yrs (first published 2021-05-20) | ~4.88M/wk | `github.com/svix/svix-webhooks` | `[SUS]` (seam reason: "too-new" — heuristic triggered by the *latest version's* recent publish date, 2026-06-25, not package age) | **Flagged — planner must add `checkpoint:human-verify` before `npm install svix`.** Countervailing evidence (5-year-old package, official Svix org repo, ~4.88M weekly downloads) strongly suggests this is a false positive from an active release cadence, not a supply-chain risk — but the verdict is preserved per protocol rather than silently overridden. |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `svix` — planner inserts a `checkpoint:human-verify` task before the `npm install svix` step, presenting the age/downloads/repo evidence above alongside the raw seam verdict so the human reviewer has full context.

*No other new packages are introduced by this phase — Spotify/YouTube integrations use raw `fetch()`, and the token/notification/AI-draft patterns all reuse existing dependencies.*

## Architecture Patterns

### System Architecture Diagram

```text
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  Artist (browser)            │        │  Admin (browser)              │
│                              │        │                                │
│  /curators  ──────┐          │        │  /admin/curators               │
│  (browse+filter)   │          │        │  (add/edit/flag/claim review) │
│                    ▼          │        │            │                   │
│  select curators+track        │        │            ▼                   │
│         │                     │        │   POST/PATCH /api/admin/       │
│         ▼                     │        │     curators (service client,  │
│  redirect into ────────────┐  │        │     verifyAdmin() re-check)    │
│  /launchpad/[projectId]      │  │        └──────────────┬─────────────────┘
│         │                    │  │                       │
│         ▼                    │  │                       ▼
│  Pitch composer               │  │              curators table
│  (150-word note, AI-drafted   │  │           (email, email_valid,
│   via Claude, editable)       │◄─┘            genre_focus[], baseline_
│         │                     │                genre_focus[], reach_
│         ▼                     │                signal, do_not_pitch,
│  POST /api/pitches            │                claimed_by, flagged_
│  (duplicate-send guard,       │                inactive, ...)
│   150-word server-side re-    │                        ▲
│   check, playlist-note        │                        │ weekly
│   required)                   │                        │ UPDATE
│         │                     │              ┌─────────┴──────────┐
│         ▼                     │              │ Vercel Cron         │
│  lib/email (PITCH_FROM_EMAIL) │              │ GET /api/cron/      │
│  → Resend → curator inbox     │              │   curator-reach     │
│    (footer: player link,      │              │ (CRON_SECRET auth)  │
│     unsubscribe, claim link,  │              └─────────┬───────────┘
│     accept link, decline link)│                        │
│         │                     │              ┌─────────▼───────────┐
│         ▼                     │              │ Spotify Web API      │
│  pitch_history row created    │              │ (client-credentials) │
│  (pending)                    │              │ YouTube Data API v3  │
└─────────────┬──────────────────┘              │ (API key)            │
              │                                  │ graceful no-op if    │
              │                                  │ creds unset          │
              │                                  └───────────────────────┘
              │
   curator clicks a footer link (no login)
              │
   ┌──────────┼───────────────────────────────────────────┐
   ▼          ▼                                            ▼
/pitch/accept  /pitch/decline/[token]           /curators/claim/[token]
  /[token]     (optional reason page)            (magic-link account
  (bare click,  → confirm →                       creation, service-role
   1-time token) UPDATE pitch_history              auth.admin.createUser
       │            status='declined'              with app_metadata.
       │                  │                          role='curator')
       ▼                  ▼                                │
  UPDATE pitch_history           createNotification()       ▼
  status='accepted'/'declined'   (in-app + email to           curator receives
       │                          artist, D-14)                magic link email
       └──────────────┬───────────────────────┘                       │
                       ▼                                               ▼
              notifications table                          /auth/callback (existing,
              (reused from Antenna pattern)                 generic code-exchange)
                                                                        │
                                                                        ▼
                                                          curator-portal layout
                                                          (session check:
                                                           app_metadata.role
                                                           === 'curator', NOT
                                                           middleware.ts artist gate)
                                                          → self-serve profile edit
                                                          → read-only pitches-received

┌───────────────────────────────────────────────────────────────────────┐
│  Resend → hard bounce on a pitch send → POST /api/webhooks/resend      │
│  (svix-id / svix-timestamp / svix-signature headers)                    │
│         │                                                               │
│         ▼                                                               │
│  verify(rawBody, headers) against RESEND_WEBHOOK_SECRET (svix lib)      │
│         │ invalid → 400, no DB write                                    │
│         ▼ valid                                                         │
│  event.type === 'email.bounced' && bounce_type === 'HardBounce'         │
│         │                                                               │
│         ▼                                                               │
│  UPDATE curators SET email_valid = false WHERE email = event.data.to    │
└───────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
app/
├── (artist)/
│   ├── curators/
│   │   └── page.tsx                    # PITCH-01: directory browse+filter (server component)
│   └── launchpad/[projectId]/
│       └── pitch/                      # pitch composer UI lives in the existing project room (D-07)
├── pitch/
│   ├── accept/[token]/page.tsx         # public, token-authenticated, bare-click (D-11)
│   └── decline/[token]/page.tsx        # public, optional-reason page then confirm (D-12)
├── curators/
│   └── claim/[token]/page.tsx          # public, claim flow entry (PITCH-05)
├── (curator-portal)/                   # NEW route group — deliberately NOT added to middleware.ts
│   ├── layout.tsx                      # own session check: app_metadata.role === 'curator'
│   └── portal/page.tsx                 # self-serve profile edit + read-only pitches view (D-19)
├── (admin)/
│   └── curators/page.tsx               # PITCH-07: mirrors app/(admin)/checklist/page.tsx
└── api/
    ├── curators/
    │   ├── route.ts                    # artist-facing directory GET (filters, response rate)
    │   ├── claim/[token]/route.ts      # POST — verifies token, creates curator account
    │   └── [id]/route.ts               # curator self-serve PATCH (own row only)
    ├── admin/curators/
    │   ├── route.ts                    # admin CRUD, verifyAdmin() gate
    │   └── [id]/route.ts
    ├── pitches/
    │   ├── route.ts                    # POST — create pitch, send email, duplicate-guard
    │   └── draft/route.ts              # POST — AI-draft the 150-word note (reuses PitchPlug pattern)
    ├── pitch/
    │   ├── accept/[token]/route.ts     # public POST/GET, token = auth
    │   └── decline/[token]/route.ts    # public POST, optional reason body
    ├── cron/
    │   └── curator-reach/route.ts      # protected by CRON_SECRET, invoked by vercel.json
    └── webhooks/
        └── resend/route.ts             # PITCH-06: first webhook route, svix-verified
lib/
├── curators/
│   ├── tokens.ts                       # reuse generateApprovalToken() shape from split-sheets/approval.ts
│   ├── reach.ts                        # Spotify + YouTube fetchers, graceful no-op pattern
│   └── drift.ts                        # baseline-vs-current genre tag diff logic
├── email/
│   └── index.ts                        # extend: accept an optional `from` override for PITCH_FROM_EMAIL
└── webhooks/
    └── resend-verify.ts                # svix Webhook wrapper, isolated so the route stays thin
vercel.json                             # NEW — first crons config in this repo
```

### Pattern 1: Webhook Signature Verification (first webhook route in this codebase)
**What:** Resend signs outgoing webhooks using Svix under the hood. The route must read the **raw** request body as text (never `req.json()` first) and verify it against `svix-id` / `svix-timestamp` / `svix-signature` headers before trusting the payload.
**When to use:** `/api/webhooks/resend` — the only webhook endpoint this phase introduces.
**Example:**
```typescript
// Source: docs.svix.com/receiving/verifying-payloads/how + resend.com/docs/webhooks/verify-webhooks-requests
// app/api/webhooks/resend/route.ts
import { Webhook } from 'svix'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const payload = await request.text() // MUST be raw text — never JSON.parse first
  const svixHeaders = {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })

  let event: { type: string; data: { to?: string[]; bounce?: { type?: string } } }
  try {
    const wh = new Webhook(secret)
    event = wh.verify(payload, svixHeaders) as typeof event
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'email.bounced' && event.data.bounce?.type === 'HardBounce') {
    const service = createServiceClient()
    const to = event.data.to?.[0]
    if (to) {
      await service.from('curators').update({ email_valid: false }).eq('email', to)
    }
  }

  return NextResponse.json({ ok: true })
}
```
**Note on library choice:** `resend.webhooks.verify()` requires `resend@^6.2.0`+ (this project is pinned to `^4.0.0`). Using `svix` directly avoids the version bump — same underlying verification logic, since Resend's own SDK depends on `svix` internally through v6.13.

### Pattern 2: Vercel Cron — weekly reach-signal refresh (first scheduled job in this codebase)
**What:** `vercel.json` declares a `path` + `schedule`; Vercel issues a GET to that path on schedule and auto-attaches an `Authorization: Bearer $CRON_SECRET` header. The route must reject any request whose header doesn't match.
**When to use:** `/api/cron/curator-reach` — weekly Spotify/YouTube follower/subscriber refresh (D-03).
**Example:**
```json
// Source: vercel.com/docs/cron-jobs
// vercel.json (new file — no crons config exists in this repo today)
{
  "crons": [
    { "path": "/api/cron/curator-reach", "schedule": "0 6 * * 1" }
  ]
}
```
```typescript
// Source: vercel.com/docs/cron-jobs/manage-cron-jobs
// app/api/cron/curator-reach/route.ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchSpotifyFollowers, fetchYouTubeSubscribers } from '@/lib/curators/reach'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const service = createServiceClient()
  const { data: curators } = await service.from('curators').select('id, platform, playlist_url')
  for (const curator of curators ?? []) {
    // fetchers are no-ops (return null) if SPOTIFY_/YOUTUBE_ env vars are unset (D-04)
    const reach =
      curator.platform === 'spotify'
        ? await fetchSpotifyFollowers(curator.playlist_url)
        : curator.platform === 'youtube'
          ? await fetchYouTubeSubscribers(curator.playlist_url)
          : null
    if (reach !== null) {
      await service.from('curators').update({ reach_signal: reach, reach_fetched_at: new Date().toISOString() }).eq('id', curator.id)
    }
  }
  return NextResponse.json({ ok: true, refreshed: curators?.length ?? 0 })
}
```
**Note:** Vercel cron expressions are UTC-only, 5-field, and do not support `MON`/`SUN` aliases; cron jobs only fire against **production** deployments (never preview) — the weekly refresh will not run until the project is actually deployed to production on Vercel with `vercel.json` committed.

### Pattern 3: Graceful-degradation external API fetch (Spotify Web API + YouTube Data API v3)
**What:** Both fetchers must return `null` (not throw) when their credentials are unset, mirroring `lib/email/index.ts` exactly.
**When to use:** `lib/curators/reach.ts`, called from the cron route and from admin add/edit (D-03).
**Example:**
```typescript
// Source: developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow
//         developers.google.com/youtube/v3/docs/channels
export async function fetchSpotifyFollowers(playlistUrl: string): Promise<number | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null // graceful no-op (D-04)

  const playlistId = extractSpotifyPlaylistId(playlistUrl)
  if (!playlistId) return null

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    })
    const { access_token } = await tokenRes.json()

    const playlistRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=followers.total`, {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const data = await playlistRes.json()
    return data.followers?.total ?? null
  } catch {
    return null // never throw — cron loop must keep going for other curators
  }
}

export async function fetchYouTubeSubscribers(channelUrl: string): Promise<number | null> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return null // graceful no-op (D-04)

  const handle = extractYouTubeHandle(channelUrl) // e.g. "@somecurator"
  try {
    // Handle-based URLs need forHandle=; classic /channel/UC... URLs pass id= directly instead.
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`
    )
    const data = await res.json()
    return Number(data.items?.[0]?.statistics?.subscriberCount) || null
  } catch {
    return null
  }
}
```
**Pitfall this avoids:** most curator-submitted YouTube URLs will be `youtube.com/@handle` (handle-based), not `youtube.com/channel/UC...` (ID-based). The `channels.list` endpoint needs `forHandle=` for the former and `id=` for the latter — a naive implementation that only supports `id=` will silently fail for the common case.

### Pattern 4: Curator magic-link auth, scoped distinctly from artist accounts
**What:** `signInWithOtp()` is Supabase's passwordless flow; the existing `/auth/callback` route (`exchangeCodeForSession`) is already generic enough to handle it unmodified — the project currently uses `signInWithPassword()` for artist login, so magic-link is new *usage*, not new *infrastructure*. The role distinction between "artist" and "curator" must live in `app_metadata` (service-role-only writable — same security property `is_admin` already relies on in `lib/admin/gate.ts`), not `user_metadata` (client-writable, untrusted).
**When to use:** `/api/curators/claim/[token]` — the only place a curator account is created.
**Example:**
```typescript
// Source: supabase.com/docs/reference/javascript/auth-signinwithotp
//         supabase.com/docs/guides/auth/auth-email-passwordless
// app/api/curators/claim/[token]/route.ts
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceClient()

  const { data: curator } = await service
    .from('curators')
    .select('id, email, claim_token_expires_at, claimed_by')
    .eq('claim_token', token)
    .maybeSingle()

  if (!curator) return Response.json({ error: 'Invalid or expired link' }, { status: 404 })
  if (curator.claimed_by) return Response.json({ error: 'Already claimed' }, { status: 410 })
  if (curator.claim_token_expires_at && curator.claim_token_expires_at < new Date().toISOString()) {
    return Response.json({ error: 'This link has expired' }, { status: 410 })
  }

  // Create (or reuse) the auth.users row with app_metadata.role set at creation time —
  // this is what handle_new_user() must branch on to skip the artist_profiles insert.
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: curator.email,
    email_confirm: true,
    app_metadata: { role: 'curator' },
  })
  if (createError) return Response.json({ error: createError.message }, { status: 500 })

  await service.from('curators').update({ claimed_by: created.user.id, claim_token: null }).eq('id', curator.id)

  // Send the actual magic link via Resend (not Supabase's built-in email templates),
  // matching how the app already owns all its transactional email.
  const { data: link } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: curator.email,
  })
  // ... sendEmail({ to: curator.email, subject: 'Sign in to your Funūn curator profile', html: `<a href="${link?.properties.action_link}">Sign in</a>` })

  return Response.json({ ok: true })
}
```
**Critical pitfall this avoids (see Common Pitfalls #1):** creating the `auth.users` row via `signInWithOtp({ shouldCreateUser: true })` directly from the client, or via a bare `admin.createUser()` without `app_metadata` set at creation, both cause the existing `handle_new_user()` trigger (migration 026) to fire and unconditionally insert `artist_profiles` + `subscriptions` rows for the curator, since that trigger has no role check today.

### Pattern 5: Token-authenticated one-click response links (extends existing split-sheet approval pattern)
**What:** Directly reuses `generateApprovalToken()` (`crypto.randomBytes(32).toString('hex')`, already in `lib/split-sheets/approval.ts`) for a `pitch_history.response_token` column. Accept and Decline are two distinct **paths** sharing the same token value, not two different tokens — matching the "one token, multiple actions" shape already proven in `/api/approve/[token]` (which distinguishes `approve` vs `counter` via a body param; here the distinction is via URL path since Accept must be bare-click with no form).
**When to use:** `/pitch/accept/[token]`, `/pitch/decline/[token]` (D-11, D-12).
**Example:**
```typescript
// Source: internal precedent — lib/split-sheets/approval.ts + app/api/approve/[token]/route.ts
// app/api/pitch/accept/[token]/route.ts
import { createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceClient()

  const { data: pitch } = await service
    .from('pitch_history')
    .select('id, status, project_id, curator_id, curators(name), vault_projects(user_id, title)')
    .eq('response_token', token)
    .maybeSingle()

  if (!pitch) return Response.json({ error: 'Invalid or expired link' }, { status: 404 })
  if (pitch.status !== 'pending') return Response.json({ error: 'This pitch was already responded to' }, { status: 410 })

  await service.from('pitch_history').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', pitch.id)

  // D-14: notify the artist via both the notifications table and email
  const project = pitch.vault_projects as unknown as { user_id: string; title: string }
  await createNotification(service, {
    userId: project.user_id,
    type: 'pitch_accepted',
    title: `A curator accepted your pitch for "${project.title}"`,
    link: `/launchpad/${pitch.project_id}`,
    sendEmailCopy: true,
    email: null, // resolved inside createNotification via auth.admin lookup, or pass explicitly
  })

  return Response.json({ ok: true })
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook signature verification | Manual HMAC comparison against `svix-signature` | `svix` npm package's `Webhook.verify()` | Timing-safe comparison, timestamp-tolerance handling, and multi-signature-version parsing are all easy to get subtly wrong by hand; this is exactly what Resend's own SDK delegates to |
| Claim / response tokens | A new token scheme or JWT | `crypto.randomBytes(32).toString('hex')` — copy `generateApprovalToken()` from `lib/split-sheets/approval.ts` verbatim | Already proven in this codebase (256 bits of entropy, DB-column expiry + status-based one-time-use); no reason for a second token shape |
| Weekly scheduled job | `setInterval`/in-process scheduler, or a third-party queue (BullMQ, Inngest) | Vercel Cron (`vercel.json` `crons`) | Next.js on Vercel is stateless/serverless — no long-running process to host an in-process scheduler; Vercel Cron is the platform-native mechanism and needs zero new infrastructure |
| Genre-drift detection | An NLP/embedding-similarity model | Simple set-difference against a stored `baseline_genre_focus` JSONB array, threshold on % overlap change | D-16 explicitly scopes this to "no automated playlist-content analysis" — a naive tag-diff is the correct-sized solution, not an under-build |
| AI-drafted pitch note | A new prompt-engineering pipeline | Copy the JSON-fence-extraction + Anthropic SDK call shape from `app/api/tools/pitchplug/route.ts` (`extractJson()`, `demo*()` fallback for `NEXT_PUBLIC_VAULT_DEMO`) | Already handles the fenced-JSON-parsing edge cases and demo-mode fallback this phase needs identically |
| Curator role distinction | A new `roles` table / RBAC framework | `app_metadata.role` on the existing `auth.users` row (service-role-only writable) | One boolean-equivalent flag for one new role does not justify a permissions framework; mirrors the existing `is_admin` app_metadata pattern exactly |
| YouTube channel ID resolution from a handle URL | Scraping the channel page HTML | `channels.list(forHandle=...)` (YouTube Data API v3) | Official, quota-cheap, documented endpoint — scraping is fragile and against YouTube's ToS |

**Key insight:** every "new pattern" this phase claims to introduce (webhooks, cron, external APIs, second account type) has 80% of its shape already solved somewhere else in this codebase under a different name. The actual net-new work is small (svix verification call, `vercel.json`, two `fetch()` calls, one `app_metadata` write) — the risk is in the 20% that's genuinely new: the `handle_new_user()` interaction (see Pitfall 1) and the sending-domain warmup dependency (D-22, not a code risk but a scheduling one).

## Common Pitfalls

### Pitfall 1: `handle_new_user()` fires for curators too, creating an unwanted artist profile
**What goes wrong:** Migration 026's `on_auth_user_created` trigger runs `handle_new_user()` on **every** `auth.users` INSERT with no role check — it unconditionally inserts an `artist_profiles` row, a `subscriptions` row, and calls `claim_collaborators()`. If a curator's account is created via `signInWithOtp({ shouldCreateUser: true })` or a bare `admin.createUser()`, this trigger fires exactly as it does for real artists.
**Why it happens:** The trigger was written before any non-artist account type existed in the app; it has no concept of "this signup is not an artist."
**How to avoid:** Create the curator's `auth.users` row via `service.auth.admin.createUser({ email, app_metadata: { role: 'curator' } })` (setting `app_metadata` **at creation time**, since triggers read the row as it lands), and modify `handle_new_user()` to branch: `IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN RETURN NEW; END IF;` before the existing INSERTs. This is a small, additive change to an existing migration-owned function (follow the same "extend, don't replace" approach migration 026 used when it extended `handle_new_user()` for the collaborator claim).
**Warning signs:** A curator's row shows up in `artist_profiles` or `subscriptions` after claim; the curator's `/vault` or `/dashboard` (artist routes) unexpectedly "work" for them because they now have a full artist profile despite `middleware.ts` never being extended to protect curator routes.

### Pitfall 2: Webhook route body consumed as JSON before signature verification
**What goes wrong:** Calling `request.json()` (which internally reads-then-parses the body) before verifying the signature makes verification impossible to redo correctly — the raw bytes are gone, and re-serializing the parsed object rarely produces byte-identical output (whitespace, key order, Unicode escaping all differ).
**Why it happens:** `req.json()` is the natural-feeling first call in every other API route in this codebase; webhook routes are the one place that convention must be broken.
**How to avoid:** Always call `await request.text()` first in `/api/webhooks/resend`, verify against that raw string, and only `JSON.parse()` it yourself after verification succeeds.
**Warning signs:** Signature verification fails intermittently or 100% of the time in production despite working when manually curl'd with a hardcoded payload.

### Pitfall 3: Curator-portal routes silently inheriting (or silently NOT inheriting) the artist auth gate
**What goes wrong:** `middleware.ts`'s `isProtected` check is a hardcoded prefix list (`/vault`, `/dashboard`, `/settings`, `/collaborators`, `/split-sheets`, `/launchpad`, `/admin`). A new curator-portal route under a prefix not on that list is **public by default** — if the layout itself doesn't independently check the session, an unauthenticated visitor can reach it. Conversely, if a curator-portal route accidentally reuses a protected prefix (e.g. nested under `/dashboard`), `middleware.ts` will redirect curators to `/signin` — which is the artist signin page and will confuse/break the curator flow entirely (curators authenticate via magic link, not the password form on `/signin`).
**Why it happens:** The existing gate model (middleware prefix list + layout-level `is_admin` check, mirrored for admin) assumes exactly two tiers: public and artist. Adding a third tier (curator) means the curator-portal layout must do its **own** auth check, exactly like `app/(admin)/layout.tsx` does for `is_admin`, but checking `app_metadata.role === 'curator'` instead.
**How to avoid:** Give the curator portal its own route group (e.g. `(curator-portal)`) with a layout that calls `supabase.auth.getUser()` and redirects to a curator-specific sign-in flow if absent or if `app_metadata.role !== 'curator'` — and deliberately do **not** add its path prefix to `middleware.ts`'s `isProtected` array.
**Warning signs:** Curator portal renders blank/errors for a logged-out visitor (no redirect happened); or a curator gets redirected to the artist `/signin` page instead of their own flow.

### Pitfall 4: `RESEND_WEBHOOK_SECRET` and `PITCH_FROM_EMAIL` don't exist until the subdomain is live
**What goes wrong:** D-22 confirms `pitch.funun.studio` isn't set up yet — building and testing the full pitch-send + bounce-webhook loop end-to-end in production isn't possible until DNS/DKIM/SPF/DMARC + ~2-week warmup completes. A plan that assumes it can verify the full send→bounce→invalidate loop live will stall.
**Why it happens:** Infrastructure prerequisite explicitly called out in the phase description, not a code gap.
**How to avoid:** Build both the send path and the webhook path behind the same graceful-no-op convention as `lib/email/index.ts` (`if (!apiKey || !from) return { ok: false }`), and verify the webhook route logic with a manually-crafted signed test payload (svix provides a local test-signing helper) rather than a live bounce. Treat "send domain live + webhook verified against a real bounce" as a post-ship checkpoint, not a phase-6 blocker.
**Warning signs:** Plan tasks that require a real hard-bounce email to test PITCH-06 before the subdomain warmup window has elapsed.

### Pitfall 5: YouTube subscriber counts are approximate and sometimes hidden
**What goes wrong:** `statistics.subscriberCount` is documented as rounded to three significant figures and can be entirely absent (`hiddenSubscriberCount: true`) if the channel owner has hidden it. Code that assumes a precise number, or that errors when the field is missing, will misbehave for a non-trivial fraction of real curator channels.
**Why it happens:** YouTube's API design choice, not a bug — many channels opt to hide subscriber counts.
**How to avoid:** Treat `reach_signal` as nullable and approximate everywhere it's displayed (e.g. "~12K subscribers", not "12,000 subscribers"); when `hiddenSubscriberCount` is true, store `null` rather than `0` (a `0` would misleadingly read as "no subscribers").
**Warning signs:** Curator cards showing "0 subscribers" for well-known, active channels that simply have the count hidden.

## Code Examples

### Duplicate-send guard (DB constraint + UI disabled state)
```sql
-- Source: internal precedent — RLS-immediately-after-CREATE-TABLE convention (migration 001-029)
-- One curator can only be pitched once per track, ever (D-08's UI guard needs this as the backstop)
ALTER TABLE pitch_history
  ADD CONSTRAINT uniq_curator_track_pitch UNIQUE (curator_id, track_id);
```
```typescript
// components pass `alreadyPitched: Set<curatorId>` computed server-side, then:
<option disabled={alreadyPitched.has(curator.id)}>
  {curator.name}{alreadyPitched.has(curator.id) ? ` · Already pitched · ${statusLabel}` : ''}
</option>
```

### Response rate query (PITCH-04: (accepted + declined) / total, last 90 days)
```sql
-- Source: internal pattern, modeled on aggregate-query style in lib/vault/readiness.ts
SELECT
  curator_id,
  COUNT(*) FILTER (WHERE status IN ('accepted', 'declined')) AS responded,
  COUNT(*) AS total,
  ROUND(
    COUNT(*) FILTER (WHERE status IN ('accepted', 'declined'))::numeric
    / NULLIF(COUNT(*), 0) * 100
  ) AS response_rate_pct
FROM pitch_history
WHERE sent_at >= NOW() - INTERVAL '90 days'
GROUP BY curator_id;
```

### Genre drift check (baseline diff, threshold-based)
```typescript
// Source: internal — D-16 "significant shift" threshold, Claude's Discretion on exact %
export function hasSignificantDrift(baseline: string[], current: string[]): boolean {
  const baseSet = new Set(baseline)
  const curSet = new Set(current)
  const overlap = [...baseSet].filter(g => curSet.has(g)).length
  const union = new Set([...baseSet, ...curSet]).size
  const jaccardSimilarity = union === 0 ? 1 : overlap / union
  return jaccardSimilarity < 0.5 // less than 50% overlap = significant shift; tune during planning
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Resend webhook verification via manual `crypto.createHmac` against a custom scheme | Resend adopted the Svix webhook-delivery standard (svix-id/timestamp/signature headers) | Resend's webhook platform has used Svix since webhooks launched; `resend-node` only gained a *convenience wrapper* (`webhooks.verify()`) around v6.2+, later re-based on `standardwebhooks` at v6.14+ | This project's pinned `resend@^4.0.0` predates the convenience wrapper entirely — verify with `svix` directly rather than assuming the installed SDK has the helper |
| Open-tracking pixels for "opened" email status | Explicit-action-only status (click-through Accept/Decline) | Locked by D-10 for this phase specifically (email-client pixel-blocking makes opens unreliable) | Removes an entire class of "opened" state from the schema/UI — `pitch_history.status` only needs `pending | accepted | declined`, no `opened` |
| YouTube channel URLs keyed by `channel/UC...` ID | Most active creators now surface `@handle` URLs; `channels.list` added `forHandle=` to match | Ongoing since ~2022 as YouTube pushed handles as the primary public identifier | Reach-signal fetcher must support both `forHandle=` and `id=` lookup paths, or the majority of curator-submitted URLs will fail silently |

**Deprecated/outdated:**
- Resend's older webhook-verification guidance (manual HMAC without the Svix header set) — current docs point exclusively at Svix-compatible verification (either via `resend.webhooks.verify()` on newer SDK versions, or the `svix` library directly).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `resend.webhooks.verify()` was introduced in resend-node ~v6.2.0 (svix dependency) and re-based on `standardwebhooks` at ~v6.14.0 — derived from bisecting `npm view resend@<version> dependencies` across the published version range this session, not from a changelog entry that names the exact version | Standard Stack, Pattern 1 | If the exact introduction version is off by a minor release, the practical conclusion (pinned `4.0.0` lacks it; `svix` standalone is the safer path) is unaffected — low risk |
| A2 | Vercel Hobby-plan cron frequency/count limits were not fetched this session (only the cron-expression syntax page was read) | Pattern 2, Open Questions | If the project's Vercel plan caps cron frequency below weekly or limits total cron job count, the weekly refresh schedule may need adjusting — should be confirmed against the account's actual plan before finalizing `vercel.json` |
| A3 | `service.auth.admin.createUser({ app_metadata })` sets `raw_app_meta_data` at INSERT time such that a same-transaction trigger reading `NEW.raw_app_meta_data` sees the value immediately — based on general Supabase/GoTrue behavior, not verified against this specific project's Postgres/GoTrue version this session | Pattern 4, Pitfall 1 | If `app_metadata` is actually set via a post-insert UPDATE inside GoTrue rather than atomically with the INSERT, `handle_new_user()`'s role check would need to read from a different signal (e.g. a request-scoped flag) — recommend the planner verify this behavior against a local Supabase instance before relying on it |
| A4 | YouTube's `forHandle=` parameter on `channels.list` is available on the current YouTube Data API v3 (confirmed via official docs page existing and being current, but the specific `forHandle` parameter wasn't independently fetched/quoted from the docs this session) | Pattern 3, Pitfall 5 | If `forHandle` requires a different API version or has quota/availability restrictions, the fallback is a `search.list` call to resolve handle → channelId, which costs more quota per lookup |
| A5 | The exact Resend bounce webhook event shape (`event.type === 'email.bounced'`, `event.data.bounce.type === 'HardBounce'`) is a reasonable approximation from WebSearch summaries, not a directly quoted, current field-by-field schema from Resend's webhook payload reference page | Pattern 1, Code Examples | If Resend's actual bounce event JSON shape differs (field names/nesting), the webhook handler's event-type/bounce-type checks will need adjustment — recommend fetching `resend.com/docs/webhooks` (or triggering a Resend test webhook) during planning/implementation to confirm the exact payload before writing the handler body |

**If this table is empty:** N/A — see entries above; all should be confirmed opportunistically during planning/implementation rather than blocking phase kickoff.

## Open Questions

1. **Exact Resend bounce webhook payload schema**
   - What we know: bounce events are typed `email.bounced` with a `bounce_type`/`bounce.type` field distinguishing hard vs soft bounces (per WebSearch summaries of Resend's docs and Svix's blog post on Resend webhooks).
   - What's unclear: the precise JSON field names/nesting as currently documented (`resend.com/docs/webhooks` event-type reference wasn't fetched verbatim this session).
   - Recommendation: fetch the live Resend webhook events reference page (or use Resend's dashboard "Send test webhook" feature) at implementation time, before finalizing the handler's field-access code.

2. **Vercel plan tier and cron limits**
   - What we know: `vercel.json` `crons` syntax and `CRON_SECRET` mechanism are confirmed from official docs.
   - What's unclear: whether the project's current Vercel plan (Hobby vs Pro) imposes a cron-frequency floor or a job-count cap that could affect a weekly schedule.
   - Recommendation: confirm plan tier before committing `vercel.json`; weekly (`0 6 * * 1`) is well within typical limits on any paid tier, but should be sanity-checked.

3. **Spotify playlist-vs-artist reach signal for non-Spotify-native curators**
   - What we know: Spotify's Client Credentials flow exposes both `/v1/artists` and `/v1/playlists/{id}` follower counts.
   - What's unclear: whether curators will predominantly be entered by their Spotify **playlist** URL or their **artist/brand profile** URL — this affects which endpoint `fetchSpotifyFollowers` should target by default.
   - Recommendation: the admin CRUD form (D-01, D-02) should let the admin pick "playlist" vs "artist" as part of entering the Spotify URL, or the fetcher should try playlist-ID extraction first and fall back to artist-ID extraction.

4. **What happens if a claimed curator's email later matches an existing artist collaborator record?**
   - What we know: `claim_collaborators()` (migration 026) claims `collaborators` rows by email match on any `auth.users` INSERT trigger fire — but curator accounts are recommended to skip the artist-side inserts entirely (Pitfall 1).
   - What's unclear: should a curator whose email also appears in some artist's `collaborators` roster (e.g. a curator who is also a session musician) have those collaborator rows claimed, or is that explicitly out of scope for a curator account?
   - Recommendation: treat as out of scope for Phase 6 — the `handle_new_user()` branch that skips artist-profile creation for curators should also skip `claim_collaborators()`, keeping curator accounts fully isolated from the collaborator/credits system. Flag as a future consideration only if a real user reports the overlap.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All server code | ✓ | v24.15.0 | — |
| npm | Dependency install | ✓ | 11.12.1 | — |
| Supabase CLI | Local migrations (`supabase db push`) | ✗ (not found on PATH in this session) | — | Migrations can still be authored as `.sql` files and applied via the Supabase dashboard SQL editor or CI; not a phase-6-specific blocker (project already has 29 migrations authored this way) |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Existing transactional email (unaffected by this phase) | Not verified this session (`.env.local` read is denied by sandbox policy) | — | `lib/email/index.ts` already no-ops gracefully if unset |
| `PITCH_FROM_EMAIL` / `pitch.funun.studio` DNS | PITCH-02 send path | ✗ (per D-22, explicitly not yet set up) | — | Graceful no-op per D-22; not a phase-6 build blocker |
| `RESEND_WEBHOOK_SECRET` | PITCH-06 bounce webhook | ✗ (depends on webhook being configured in Resend dashboard, which depends on the pitch domain being live) | — | Webhook route returns 503 gracefully if unset |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | PITCH-01/PITCH-04 reach signal | ✗ (per D-23, not yet obtained) | — | Graceful no-op per D-04; reach signal stays null |
| `YOUTUBE_API_KEY` | PITCH-01/PITCH-04 reach signal | ✗ (per D-23, not yet obtained) | — | Graceful no-op per D-04; reach signal stays null |
| `CRON_SECRET` | PITCH-03/PITCH-04 weekly refresh auth | Not yet generated | — | Must be generated (16+ random chars) and set in Vercel project env vars before `vercel.json` cron will authenticate successfully; route should 401 (not crash) if unset |
| Vercel deployment (production) | Cron job execution | Assumed (existing deployment target per `INTEGRATIONS.md`) | — | Cron jobs silently do not fire on preview deployments — verify against production only |

**Missing dependencies with no fallback:**
- None — every missing credential (`PITCH_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`, `SPOTIFY_CLIENT_ID`/`SECRET`, `YOUTUBE_API_KEY`) has an explicit, locked graceful-degradation behavior (D-04, D-22, D-23) and is not a phase-6 build blocker.

**Missing dependencies with fallback:**
- Supabase CLI not on PATH — author migrations as plain `.sql` files (existing convention), apply via dashboard/CI.
- `CRON_SECRET` not yet generated — trivial to generate at implementation time; route must reject cleanly (401) rather than error if it's absent when first deployed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected in project (`package.json` has no test runner) |
| Config file | None |
| Quick run command | Manual verification only |
| Full suite command | `npm run build` (TypeScript compile + `next lint` as proxy) |

No automated test infrastructure exists anywhere in this project (confirmed identically in Phase 5's research). Nyquist validation for Phase 6 is manual/smoke verification against each requirement's acceptance criteria, same convention as Phase 5.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PITCH-01 | Directory browses/filters by genre + platform; each card shows genre focus + 90-day response rate | manual-smoke | Visit `/curators`, toggle filters, verify list updates | N/A — no test file |
| PITCH-02 | Composer enforces 150-word limit + non-empty note before Send activates; sent email contains player link + unsubscribe | manual-smoke | Compose a pitch in `/launchpad/{projectId}`, verify Send stays disabled under either gate, verify email content post-send (or via Resend dry-run/log if domain not yet live) | N/A |
| PITCH-03 | Pitch history recorded per project; duplicate curator+track send blocked | manual-smoke | Send a pitch, attempt to re-select the same curator+track, verify UI disables it and API rejects it | N/A |
| PITCH-04 | Response rate = (accepted+declined)/total, last 90 days, shown per curator | manual-smoke | Seed a few `pitch_history` rows with varied `status`/`sent_at`, verify displayed percentage | N/A |
| PITCH-05 | Curator claim link creates account; explicit-click only; 72h expiry; one-time use | manual-smoke | Trigger a claim email (or manually generate a token), click, verify account creation; re-click same link, verify rejection | N/A |
| PITCH-06 | Hard bounce → `email_valid=false`; genre-focus edit past threshold → drift flag | manual-smoke | POST a manually-signed test payload to `/api/webhooks/resend` (svix test-signing helper), verify DB update; edit a curator's genre tags in admin, verify drift badge appears | N/A |
| PITCH-07 | Admin can add/edit/flag-inactive/review-claimed | manual-smoke | Full CRUD walkthrough at `/admin/curators` | N/A |
| PITCH-08 | "Playlist Curator" appears as an industry role option | manual-smoke | Visit Settings, confirm the option renders and saves | N/A |

### Sampling Rate
- **Per task commit:** `npm run build` (TypeScript compile, no type errors)
- **Per wave merge:** Full manual smoke test of all 8 PITCH requirements
- **Phase gate:** All 8 PITCH acceptance criteria verified before `/gsd-verify-work`

### Wave 0 Gaps
- [x] No test framework needed — `npm run build` is the proxy gate (matches Phase 5 convention)
- [ ] A manually-signed svix test payload (or use of Svix's local test-signing helper) should be prepared before implementing `/api/webhooks/resend`, since a live hard bounce cannot be triggered until `pitch.funun.studio` warmup completes (Pitfall 4)
- [ ] Manual test checklist document to be created during Wave 0 of execution, listing the 8-requirement walkthrough above

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Curator magic-link auth via `signInWithOtp()`/`admin.generateLink()`, scoped by `app_metadata.role` (service-role-only writable, cannot be forged client-side); artist auth unchanged (existing `signInWithPassword()`) |
| V3 Session Management | yes | Curator-portal session uses the same Supabase cookie-based session as artists, but its layout independently verifies `app_metadata.role === 'curator'` (mirrors `is_admin` check) rather than relying on `middleware.ts`, since curator routes are intentionally outside `middleware.ts`'s protected-prefix list |
| V4 Access Control | yes | Admin curator routes re-verify `is_admin` via `verifyAdmin()` independent of layout (existing `lib/admin/gate.ts` convention); curator self-serve PATCH scoped to `WHERE claimed_by = auth.uid()`; RLS enabled immediately after every `CREATE TABLE` (`curators`, `pitch_history`) |
| V5 Input Validation | yes | Zod schemas on admin curator CRUD, pitch composer payload (150-word server-side re-check — client-side enforcement alone is insufficient), cron/webhook route bodies; explicit editable-field allowlist on curator self-serve PATCH (mirror `EDITABLE_FIELDS` pattern) |
| V6 Cryptography | yes | Claim + response tokens use `crypto.randomBytes(32)` (256 bits entropy, existing proven pattern) — never a predictable/sequential ID; webhook signature verification uses `svix`'s constant-time HMAC comparison rather than a hand-rolled compare |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged webhook POST to `/api/webhooks/resend` (attacker flips arbitrary curator emails to invalid) | Spoofing / Tampering | Mandatory svix signature verification against `RESEND_WEBHOOK_SECRET` before any DB write; reject with 400 on any verification failure, never "best-effort accept" |
| Unauthenticated cron endpoint hit directly (attacker triggers reach-signal refresh repeatedly, burning Spotify/YouTube quota) | Denial of Service | `CRON_SECRET` header check, reject non-matching requests with 401 before doing any external fetch |
| Response-link token guessing / replay (attacker brute-forces or reuses an accept/decline link) | Tampering / Repudiation | 256-bit token (same entropy as existing split-sheet approval tokens — brute-force infeasible); one-time-use enforced via `status !== 'pending'` guard, mirroring `finalStatuses` check in `/api/approve/[token]` |
| Curator account created via claim flow gains unintended artist-tier access (Pitfall 1) | Elevation of Privilege | `handle_new_user()` branches on `app_metadata.role`, skipping `artist_profiles`/`subscriptions` creation for curators; curator-portal layout independently checks role, never trusts middleware alone |
| Curator self-serve PATCH edits another curator's row (IDOR) | Elevation of Privilege | RLS policy `USING (auth.uid() = claimed_by)` on `curators` UPDATE, plus explicit `.eq('claimed_by', user.id)` in the API route (defense in depth, matching the double-check convention used for admin routes) |
| Mass assignment on curator self-serve PATCH (curator sets `email_valid`, `flagged_inactive`, or `reach_signal` directly) | Tampering | Explicit editable-field allowlist for the curator self-serve endpoint (genre focus, platform, playlist/channel URL, notes/bio only) — distinct and narrower than the admin allowlist |
| 150-word / playlist-specific-note gate bypassed via direct API call (client-side-only enforcement) | Tampering | Server-side re-validation of word count and non-empty note in `/api/pitches` POST handler — never trust the client's Send-button disabled state alone |

## Sources

### Primary (HIGH confidence)
- `lib/email/index.ts`, `middleware.ts`, `lib/admin/gate.ts`, `components/admin/ChecklistAdmin.tsx`, `app/(admin)/layout.tsx`, `app/(admin)/checklist/page.tsx` — read directly, current codebase state
- `supabase/migrations/026_collaborator_identity_reconciliation.sql`, `009_antenna_notifications.sql`, `029_launchpad_checklist_rls_tighten.sql` — read directly, current codebase state
- `lib/split-sheets/approval.ts`, `app/api/approve/[token]/route.ts`, `app/api/collaborators/[id]/invite/route.ts` — read directly, current codebase state
- `lib/tools/pitchplug.ts`, `app/api/tools/pitchplug/route.ts`, `lib/tools/registry.ts` — read directly, current codebase state
- `lib/notifications/index.ts`, `lib/supabase/server.ts`, `app/auth/callback/route.ts`, `app/(auth)/signin/page.tsx` — read directly, current codebase state
- `lib/industry-roles.ts`, `.planning/codebase/INTEGRATIONS.md` — read directly, current codebase state
- `npm view svix version` / `npm view resend version` / dependency bisection across `resend@4.x`–`6.16.0` — run directly this session against the live npm registry

### Secondary (MEDIUM confidence)
- [Verify Webhooks Requests - Resend](https://resend.com/docs/webhooks/verify-webhooks-requests) — WebFetch summary of official docs
- [Cron Jobs - Vercel](https://vercel.com/docs/cron-jobs) — WebFetch summary of official docs
- [How to Verify Webhooks with the Svix Libraries | Svix Docs](https://docs.svix.com/receiving/verifying-payloads/how) — WebSearch summary
- [Managing Cron Jobs - Vercel](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — WebSearch summary
- [Client Credentials Flow | Spotify for Developers](https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow) — WebSearch summary
- [Channels | YouTube Data API | Google for Developers](https://developers.google.com/youtube/v3/docs/channels) — WebSearch summary
- [JavaScript: signInWithOtp | Supabase Docs](https://supabase.com/docs/reference/javascript/auth-signinwithotp) — WebSearch summary
- [Passwordless email logins | Supabase Docs](https://supabase.com/docs/guides/auth/auth-email-passwordless) — WebSearch summary

### Tertiary (LOW confidence)
- Exact Resend bounce-event JSON field names (`event.type`, `bounce.type` nesting) — approximated from WebSearch result summaries, not independently fetched/quoted verbatim (see Assumptions Log A5)
- Vercel Hobby-plan cron limits — not fetched this session (see Assumptions Log A2, Open Question 2)

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — `svix`/`resend` version facts are npm-registry-verified (HIGH), but the exact webhook payload schema and Vercel plan limits are WebSearch-only (MEDIUM/LOW)
- Architecture: HIGH for everything grounded in direct codebase reads (token pattern, admin pattern, notification pattern, AI-draft pattern); MEDIUM for the four genuinely new patterns (webhook, cron, external APIs, curator auth), which are WebSearch-verified against official docs but not fetched via an authenticated docs provider
- Pitfalls: HIGH — Pitfall 1 (`handle_new_user()` trigger) is derived directly from reading migration 026's actual SQL, not inferred

**Research date:** 2026-07-01
**Valid until:** 2026-07-31 (30 days — Spotify/YouTube API surface and Resend's webhook payload shape are stable/slow-moving; Vercel Cron config format is stable. Re-verify the exact Resend bounce-event schema and any Vercel plan-tier limits at implementation time regardless, per the Assumptions Log.)
