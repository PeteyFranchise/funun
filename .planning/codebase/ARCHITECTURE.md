<!-- refreshed: 2026-06-26 -->
# Architecture

**Analysis Date:** 2026-06-26

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                          Next.js App Router                              │
│              (Route Groups: artist, auth, industry, marketing)           │
├──────────────────┬──────────────────┬─────────────────┬─────────────────┤
│    Pages          │    API Routes    │   Components    │     Lib         │
│  `app/(artist)/`  │  `app/api/`      │  `components/`  │     `lib/`      │
│  `app/(auth)/`    │                  │                 │                 │
│  `app/(industry)` │                  │                 │                 │
└────────┬──────────┴────────┬─────────┴────────┬────────┴────────┬────────┘
         │                   │                  │                 │
         │ Uses Client/Server│ Consumes         │ Provides        │
         │ Components        │                  │ Business Logic  │
         ▼                   ▼                  ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Supabase Database Layer                             │
│              (Auth, RLS Policies, Realtime, Storage)                     │
│                        `lib/supabase/`                                   │
└─────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    External Integrations                                 │
│   Anthropic SDK  │  Stripe  │  Resend Email  │  Supabase Storage       │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Root Layout | Metadata, globals, font setup | `app/layout.tsx` |
| Artist Layout | Navigation sidebar, layout for artist routes | `app/(artist)/layout.tsx` |
| Auth Layout | Minimal layout for signin/signup | `app/(auth)/layout.tsx` |
| Industry Layout | Layout for industry professional routes | `app/(industry)/layout.tsx` |
| Middleware | Session validation, route protection | `middleware.ts` |
| Vault System | Sound Vault page, project listing, browsing | `app/(artist)/vault/page.tsx` |
| Dashboard | Stats, readiness scorecards, project summary | `app/(artist)/dashboard/page.tsx` |
| Vault API | Project CRUD, track management, submissions | `app/api/vault/route.ts`, `app/api/vault/[projectId]/` |
| Tools API | PitchPlug, Metadata tools, document generation | `app/api/tools/` |
| Social API | Wall posts, endorsements, DMs, follows | `app/api/wall/route.ts`, `app/api/endorsements/`, etc. |
| Profile API | Artist profile management, update | `app/api/profile/route.ts` |
| Antenna API | Opportunity matching, applications | `app/api/antenna/opportunities/`, `app/api/antenna/match/` |
| Supabase Client | Session management, auth helpers | `lib/supabase/server.ts`, `lib/supabase/client.ts` |

## Pattern Overview

**Overall:** Next.js 15 with App Router and React Server Components (RSC) as default, supplemented with client-side interactivity for forms and state-driven UI.

**Key Characteristics:**
- **Server-first architecture** — Pages fetch data server-side; static content renders during build
- **Nested API routes** — Modular endpoint organization mirroring domain structure
- **Type-driven design** — Zod schemas for validation, TypeScript for type safety throughout
- **Route groups** — Logical separation of user roles (artist, auth, industry) without URL impact
- **RLS-enforced multi-tenancy** — Supabase Row Level Security gates data per user
- **Demo mode support** — `NEXT_PUBLIC_VAULT_DEMO=true` runs a seeded in-memory app for previews
- **AI-powered tools** — Anthropic SDK for PitchPlug email generation, document analysis

## Layers

**Pages (App Router):**
- Purpose: Server-rendered entry points for authenticated user flows
- Location: `app/(artist)/`, `app/(auth)/`, `app/(industry)/`, `app/r/`, `app/u/`
- Contains: Server components that fetch data, pass props to client components
- Depends on: Supabase client, lib modules for business logic
- Used by: Users browsing the app; middleware enforces auth

**API Routes:**
- Purpose: HTTP endpoints for CRUD operations, external integrations, AI calls
- Location: `app/api/`
- Contains: NextResponse handlers, Supabase mutations, Anthropic API calls, Stripe webhooks
- Depends on: Supabase, createApiClient() for auth, lib modules
- Used by: Browser fetch calls from client components, external webhooks

**Client Components:**
- Purpose: Interactive UI — forms, tabs, modals, real-time state
- Location: `components/`
- Contains: React hooks (useState, useRouter), event handlers, form submission logic
- Depends on: API routes for mutations, useRouter for navigation
- Used by: Server components, other client components (composable)

**Business Logic (lib/):**
- Purpose: Domain-specific functions shared across API and pages
- Location: `lib/[domain]/` — antenna/, benchmarks/, contracts/, metadata/, social/, tools/, vault/, etc.
- Contains: Calculation functions, data transformations, feature implementations
- Depends on: Supabase, types, external SDKs (Anthropic, Stripe)
- Used by: API routes and server components

**Utilities (lib/supabase/):**
- Purpose: Supabase client factories and configuration
- Location: `lib/supabase/`
- Contains: `createServerClient()`, `createApiClient()`, `createServiceClient()` factories
- Depends on: @supabase/auth-helpers-nextjs, @supabase/supabase-js
- Used by: All server code (pages, API routes, lib modules)

**Data Store (Supabase):**
- Purpose: PostgreSQL database, auth, RLS, Realtime, storage buckets
- Location: `supabase/migrations/` — schema defined via SQL migrations
- Contains: artist_profiles, vault_projects, tracks, submissions, social tables, etc.
- Depends on: None (foundation)
- Used by: All server code via Supabase clients

## Data Flow

### Primary Request Path: Create/Edit Vault Project

1. **User navigates to `/vault`** (`app/(artist)/vault/page.tsx`)
   - Server fetches user session, loads artist profile and all vault projects
   - Renders `VaultBrowser` client component with project cards

2. **User clicks "New Project" or edits existing** 
   - `EditProjectForm` client component opens modal
   - Form state tracked in React state (useState)

3. **User submits form** (`components/vault/EditProjectForm.tsx`)
   - Client calls `fetch('/api/vault/[projectId]', { method: 'PATCH', body: JSON.stringify(...) })`
   - POST to `app/api/vault/route.ts` (create) or PATCH to `app/api/vault/[projectId]/route.ts` (update)

4. **API validates and saves** (`app/api/vault/route.ts`)
   - Extracts user from session via `createApiClient().auth.getUser()`
   - Validates input (type, title, etc.)
   - Calls `supabase.from('vault_projects').insert()` or `.update()`

5. **Database triggers readiness calculation** (`supabase/migrations/003_readiness_triggers_full_events.sql`)
   - When vault_projects or related tables change, trigger recalculates `vault_readiness_score` (0–100)
   - Score depends on audio files, metadata, splits, documents, ISRC/ISWC codes

6. **Response returns to client** 
   - Client calls `router.refresh()` to revalidate server data
   - New project appears in vault list

### Secondary Flow: AI Tool — PitchPlug Email Generation

1. **User on vault project detail, clicks "PitchPlug"** 
   - `components/tools/PitchPlugForm.tsx` opens, user selects curator types (playlister, A&R, etc.)

2. **Client calls `/api/tools/pitchplug` (POST)**
   - Body: `{ projectId, curatorTypes: ['playlister', 'playlist_curator', ...] }`

3. **API handler** (`app/api/tools/pitchplug/route.ts`)
   - Fetches project details, artist profile from Supabase
   - Builds prompt via `buildPitchPlugPrompt(ctx)` from `lib/tools/pitchplug.ts`
   - Calls Anthropic API: `new Anthropic().messages.create({ model: 'claude-sonnet-4-6', ... })`
   - Extracts JSON from Claude response (pitch templates per curator)

4. **Response returned with generated pitches**
   - Client displays email templates
   - User can refine and submit via "Send Pitch" button

5. **Send Pitch** → POST `/api/tools/pitchplug/send/route.ts`
   - Records submission to `submissions` table with type, destination, pitch text
   - Supabase trigger updates `vault_projects.submissions` relation

### Social Flow: Wall Post (Public Project Activity)

1. **User on public profile `app/u/[handle]`**
   - Server fetches artist profile, recent activity, wall posts

2. **Visitor writes wall message, submits**
   - Client calls `fetch('/api/wall', { method: 'POST', body: JSON.stringify({ profileId, body }) })`

3. **API validates ownership/permissions** (`app/api/wall/route.ts`)
   - Returns 401 if not authenticated
   - Inserts to `wall_posts` table with poster_id, wall_owner_id, body

4. **Realtime update** (optional — uses Supabase Realtime)
   - Browser can subscribe to wall_posts table changes
   - New posts appear without page refresh

**State Management:**
- **Server state:** Loaded via server components (zero JavaScript for static data)
- **Client state:** React hooks (useState, useReducer) for forms, modals, tabs
- **Global state:** None (no Redux, Context minimally used)
- **Database as source of truth:** All writes persisted to Supabase; client state is transient

## Key Abstractions

**VaultProject:**
- Purpose: Central domain entity — an artist's single, EP, album, or unreleased work
- Examples: `app/(artist)/vault/page.tsx`, `lib/vault/readiness.ts`, `app/api/vault/route.ts`
- Pattern: Server components fetch full project with relations (tracks, assets, documents); readiness score auto-calculated by DB triggers

**ReadinessItem:**
- Purpose: Represents a single gate in the vault readiness checklist (e.g., "audio_files", "split_sheets")
- Examples: Defined in `types/index.ts` (READINESS_ITEMS array); consumed by `lib/vault/readiness.ts`
- Pattern: Score 0–100 based on item completion; UI breakdown in `VaultProjectCard` and project detail pages

**ToolOutput:**
- Purpose: Record of a tool run (PitchPlug emails, metadata exports, registrations)
- Examples: Stored in DB; displayed in `components/vault/ToolSidePanel.tsx`
- Pattern: Each tool plugin (pitchplug, sampleclear, etc.) defined in `lib/tools/registry.ts`

**Submission:**
- Purpose: Record of an outbound pitch to a curator or distributor
- Examples: Created by `lib/submissions/index.ts`; displayed in `components/vault/SubmissionHistory.tsx`
- Pattern: Tracks destination, type, status, timestamp; used to gate PitchPlug credit deduction

**ArtistProfile & IndustryProfile:**
- Purpose: User identity — name, genre, links, verification status
- Examples: Fetched server-side, editable via `app/api/profile/route.ts`
- Pattern: Single-row tables keyed by auth.users.id; RLS allows users to manage own profile, public visibility controlled by flag

**Opportunity (Antenna):**
- Purpose: An open call for music submissions (playlist pitch, sync, release)
- Examples: Created by industry pros, matched to artists via benchmark scoring
- Pattern: Stored in `antenna_opportunities` table; match algo in `lib/matching/antenna.ts`

## Entry Points

**Root (/):**
- Location: `app/page.tsx`
- Triggers: Unauthenticated user visits domain root
- Responsibilities: Redirects to `/dashboard` (artist) or `/signin` (if not logged in)

**Vault (/vault):**
- Location: `app/(artist)/vault/page.tsx`
- Triggers: Artist accesses Sound Vault
- Responsibilities: Lists all projects with readiness scores; filters by lane (draft/scheduled/live)

**Dashboard (/dashboard):**
- Location: `app/(artist)/dashboard/page.tsx`
- Triggers: Artist logs in, checks home
- Responsibilities: Summary stats (total projects, avg readiness, count ready to submit)

**Auth Routes (/signin, /signup):**
- Location: `app/(auth)/signin/page.tsx`, `app/(auth)/signup/page.tsx`
- Triggers: Unauthenticated user, middleware redirect
- Responsibilities: Supabase auth UI, session creation

**Public Profile (/u/[handle]):**
- Location: `app/u/[handle]/page.tsx`
- Triggers: Anyone visits artist profile URL
- Responsibilities: Display public artist info, recent releases, wall posts

**Industry Opportunities (/opportunities):**
- Location: `app/(industry)/opportunities/page.tsx` (for creation), `/dashboard` shows matches
- Triggers: Industry pro logs in
- Responsibilities: Browse/create opportunities, see applications

## Architectural Constraints

- **Threading:** Single-threaded event loop (Node.js/Next.js). Long-running tasks (AI calls, PDF generation) are awaited in API routes; consider job queue for 30s+ operations.
- **Global state:** None — state lives in Supabase (SSoT) or React components (transient). No global singletons.
- **Circular imports:** None detected. `lib/` modules are leaf nodes; pages/API depend on lib, not vice versa.
- **Auth context:** Supabase session tied to HTTP cookies; middleware enforces auth state. No manual token passing.
- **Concurrent mutations:** RLS policies + Supabase row locking prevent race conditions on owned data; API handlers check ownership before write.
- **File uploads:** Supabase Storage buckets (`vault-assets`, `track-audio`) use signed URLs; service role key used for server-side signed-URL generation in `lib/storage/index.ts`.
- **Realtime subscriptions:** Optional (not on every page); used for wall posts, DM messages via `supabase.channel('table').on('postgres_changes', ...)`.

## Anti-Patterns

### Fetching All Related Data in Every Page Load

**What happens:** Pages like `/vault` fetch entire vault_projects table with all nested relations (tracks, assets, documents, submissions, tool_outputs) even if only project count or titles are displayed.

**Why it's wrong:** Over-fetches from DB; adds latency on pages with many projects; wastes bandwidth.

**Do this instead:** Use selective queries. Example from `app/(artist)/vault/page.tsx`:
```typescript
// Good: Select only what's displayed
const { data } = await supabase
  .from('vault_projects')
  .select('id, title, type, status, release_date, vault_readiness_score, cover_art_url')
  .eq('user_id', user.id)

// Bad: Fetch everything
const { data } = await supabase
  .from('vault_projects')
  .select('*')
```
When detail view needs nested data, fetch in a separate query on the detail page.

### Storing Calculated Values in UI State

**What happens:** Readiness score calculated client-side in a useEffect, stored in state, displayed without re-validation.

**Why it's wrong:** Score can become stale if other tabs modify the project; invalid state if API schema changes.

**Do this instead:** Trust DB calculations. Readiness score is auto-calculated by SQL trigger in `lib/vault/readiness.ts`; always fetch fresh from `vault_projects.vault_readiness_score` column. See `app/(artist)/vault/page.tsx` — score read directly from project object returned from server.

### Unvalidated File Uploads to Storage

**What happens:** Client uploads file to Supabase Storage without server-side type/size check.

**Why it's wrong:** Users can upload wrong file types, oversized assets; malicious clients bypass restrictions.

**Do this instead:** API route validates MIME type and file size before upload. Example:
```typescript
// In app/api/vault/[projectId]/assets/route.ts
const file = await request.formData().then(fd => fd.get('file'))
if (!ALLOWED_TYPES.includes(file.type)) {
  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}
```
Use `lib/storage/index.ts` helper to generate signed upload URLs post-validation.

### Silent Failures in Readiness Calculation

**What happens:** A readiness item depends on a nested relation (e.g., track metadata), but the query doesn't include it; item incorrectly shows as "missing" even when complete.

**Why it's wrong:** Users see inaccurate checklist; may waste time adding data that's already there.

**Do this instead:** Ensure all required relations are selected when fetching project for readiness. Example in `lib/vault/readiness.ts`:
```typescript
// Input must include tracks, assets, documents, tool_outputs
const items = readinessItemsForProject({
  type: project.type,
  tracks: project.tracks,  // Must be present
  assets: project.assets,
  documents: project.documents,
  tool_outputs: project.tool_outputs,
})
```

---

*Architecture analysis: 2026-06-26*
