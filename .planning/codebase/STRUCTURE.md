# Codebase Structure

**Analysis Date:** 2026-06-26

## Directory Layout

```
funun/
├── app/                          # Next.js App Router — pages, layouts, API routes
│   ├── layout.tsx                # Root layout (metadata, fonts, globals)
│   ├── page.tsx                  # Root → redirects to /dashboard
│   ├── globals.css               # Global styles, CSS variables
│   ├── (artist)/                 # Route group for artist workspace (URL path ignored)
│   │   ├── layout.tsx            # Wraps artist pages with sidebar nav
│   │   ├── dashboard/page.tsx    # Artist home — stats, project summary
│   │   ├── vault/page.tsx        # Sound Vault main — project browser
│   │   ├── releases/page.tsx     # Release schedule (projects with dates)
│   │   ├── earnings/page.tsx     # Revenue dashboard (if applicable)
│   │   ├── antenna/page.tsx      # Opportunity matching inbox
│   │   ├── benchmarks/page.tsx   # Spotify metrics input
│   │   ├── launchpad/page.tsx    # Release coordination hub
│   │   ├── contracts/page.tsx    # Contract verification
│   │   ├── coach/page.tsx        # Career coaching (placeholder)
│   │   ├── tools/pitchplug/page.tsx  # PitchPlug UI
│   │   ├── settings/page.tsx     # Artist account settings
│   │   └── vault/                # Nested routes for project detail
│   ├── (auth)/                   # Route group for auth flows
│   │   ├── layout.tsx            # Minimal layout (no nav)
│   │   ├── signin/page.tsx       # Login page
│   │   └── signup/page.tsx       # Registration page
│   ├── (industry)/               # Route group for industry professional workspace
│   │   ├── opportunities/page.tsx    # Opportunity board (create/view)
│   │   └── opportunities/[opportunityId]/  # Opportunity detail, applications
│   ├── (marketing)/              # Route group for public pages (landing, etc.)
│   ├── api/                      # All API routes — RESTful endpoints
│   │   ├── vault/
│   │   │   ├── route.ts          # GET (list all), POST (create)
│   │   │   └── [projectId]/
│   │   │       ├── route.ts      # PATCH (update), DELETE (remove)
│   │   │       ├── tracks/
│   │   │       │   ├── route.ts  # POST (add track)
│   │   │       │   └── [trackId]/
│   │   │       │       ├── route.ts       # PATCH (edit), DELETE (remove)
│   │   │       │       ├── audio/route.ts # POST (upload), DELETE (remove audio)
│   │   │       │       ├── isrc/route.ts  # POST (generate ISRC)
│   │   │       │       ├── metadata/      # Embed, sidecar, format handlers
│   │   │       │       └── lyrics/route.ts # GET (fetch lyrics)
│   │   │       ├── assets/route.ts        # POST (upload cover art, visuals)
│   │   │       ├── documents/
│   │   │       │   ├── route.ts  # GET (list), POST (upload doc)
│   │   │       │   ├── [docId]/  # PATCH (update), DELETE (remove)
│   │   │       │   └── generate/ # POST (AI-generate document)
│   │   │       ├── metadata/
│   │   │       │   ├── export/   # GET (download metadata bundle)
│   │   │       │   ├── cwr/      # GET (CISAC CWR format export)
│   │   │       │   └── registrations/ # GET (current registration status)
│   │   │   └── lyrics/route.ts           # GET (lyrics for project)
│   │   ├── releases/route.ts     # GET (projects with release_date)
│   │   ├── tools/
│   │   │   ├── pitchplug/
│   │   │   │   ├── route.ts      # POST (generate pitches)
│   │   │   │   └── send/route.ts # POST (record submission)
│   │   │   ├── [slug]/route.ts   # POST (other tools: sampleclear, contentid, etc.)
│   │   │   └── [toolSlug]/route.ts # Legacy endpoint
│   │   ├── profile/route.ts      # PATCH (update artist profile)
│   │   ├── benchmarks/route.ts   # POST (save metrics)
│   │   ├── submissions/route.ts  # POST (record pitch submission)
│   │   ├── pitches/route.ts      # POST (direct pitch API), GET (check credits)
│   │   ├── antenna/
│   │   │   ├── opportunities/
│   │   │   │   ├── route.ts      # GET (list), POST (create)
│   │   │   │   ├── [opportunityId]/
│   │   │   │   │   ├── route.ts  # PATCH (edit), DELETE (remove)
│   │   │   │   │   └── apply/route.ts # POST (artist applies)
│   │   │   └── match/route.ts    # POST (run matching algorithm)
│   │   ├── wall/route.ts         # POST (create post), DELETE (remove)
│   │   ├── release-comments/route.ts # POST (comment), DELETE (remove)
│   │   ├── endorsements/route.ts # POST (endorse), DELETE (withdraw)
│   │   ├── follows/route.ts      # POST (follow), DELETE (unfollow)
│   │   ├── dm/
│   │   │   ├── messages/route.ts # GET (fetch messages)
│   │   │   └── send/route.ts     # POST (send message)
│   │   ├── contracts/verify/route.ts   # POST (verify contract signature)
│   │   ├── earnings/import/route.ts    # POST (import DSR data)
│   │   ├── stripe/                     # Webhook handlers (if used)
│   │   ├── user/                       # User metadata endpoints
│   │   ├── assets/                     # Generic asset endpoints
│   │   └── [other domain areas]/
│   ├── auth/callback/            # Supabase OAuth callback
│   ├── profile/page.tsx          # Public fallback profile
│   ├── status/page.tsx           # Status page
│   ├── r/[projectId]/page.tsx    # Project release — public link
│   └── u/[handle]/page.tsx       # Artist profile — public link

├── components/                   # React components — client & server
│   ├── layout/
│   │   ├── Topbar.tsx           # Top navigation with search
│   │   └── Sidebar.tsx          # Side navigation (if used)
│   ├── nav/
│   │   ├── ArtistNav.tsx        # Main sidebar nav (artist routes)
│   │   └── icons.tsx            # Icon library
│   ├── vault/                   # Sound Vault UI
│   │   ├── VaultBrowser.tsx     # Tab-based project list
│   │   ├── VaultProjectCard.tsx # Individual project card
│   │   ├── EditProjectForm.tsx  # Modal to create/edit project
│   │   ├── AddTrackForm.tsx     # Add track to project
│   │   ├── TrackList.tsx        # Display tracks in project
│   │   ├── CoverArtUpload.tsx   # Upload cover art
│   │   ├── AssetUpload.tsx      # Upload visual assets
│   │   ├── DocumentManager.tsx  # Upload, list, download documents
│   │   ├── DocumentCard.tsx     # Single document UI
│   │   ├── DocumentStage.tsx    # Document status tracker
│   │   ├── MetadataStudio.tsx   # Edit metadata (CWR, identifiers, etc.)
│   │   ├── PlaybackView.tsx     # Preview tracks
│   │   ├── SubmissionHistory.tsx # Track outbound pitches
│   │   ├── ToolSidePanel.tsx    # Display tool outputs
│   │   ├── ProjectTabs.tsx      # Tabs for detail view (metadata, docs, etc.)
│   │   ├── DistributorPicker.tsx # Select release distributor
│   │   ├── SampleFlagToggle.tsx # Mark as sample-based
│   │   ├── CopyrightFiling.tsx  # Copyright registration status
│   │   └── [other vault components]
│   ├── tools/
│   │   ├── ToolsPanel.tsx       # Tools sidebar/panel
│   │   ├── PitchPlugForm.tsx    # Select curator types for pitches
│   │   ├── PitchCard.tsx        # Display generated pitch
│   │   └── [other tool UIs]
│   ├── antenna/
│   │   ├── AntennaBrowser.tsx   # Opportunity list view
│   │   ├── OpportunityCard.tsx  # Single opportunity card
│   │   ├── OpportunityForm.tsx  # Create/edit opportunity
│   │   ├── ApplicationInbox.tsx # View applications to own opportunity
│   │   ├── ApplyButton.tsx      # Submit application
│   │   ├── MatchScoreBreakdown.tsx # Show match algorithm details
│   │   └── [other antenna components]
│   ├── benchmarks/
│   │   ├── [benchmarking UI components]
│   ├── contracts/
│   │   ├── [contract signing UI]
│   ├── earnings/
│   │   ├── [earnings display components]
│   ├── coach/
│   │   ├── [coaching UI]
│   ├── profile/
│   │   ├── [artist profile components]
│   ├── auth/
│   │   ├── SignOutButton.tsx    # Sign out action
│   │   └── [auth UI]
│   └── layout/
│       ├── Topbar.tsx           # Top bar with search, user menu
│       └── [layout helpers]

├── lib/                         # Business logic, utilities, domain services
│   ├── supabase/
│   │   ├── server.ts            # createServerClient(), createApiClient(), createServiceClient()
│   │   └── client.ts            # createClient() for browser
│   ├── vault/                   # Sound Vault feature logic
│   │   ├── readiness.ts         # Calculate readiness score per project
│   │   ├── stage3.ts            # Stage 3 release workflow
│   │   ├── demo.ts              # Demo project templates
│   │   ├── demo-store.ts        # In-memory store for DEMO mode
│   │   └── [other vault services]
│   ├── metadata/                # Music metadata handling
│   │   ├── schema.ts            # Metadata object structure
│   │   ├── validate.ts          # Validation rules
│   │   ├── export.ts            # Export to various formats (JSON, CSV)
│   │   ├── cwr.ts               # CISAC CWR format handling
│   │   ├── rdr.ts               # Royalty-bearing metadata (RDR)
│   │   ├── rdr-export.ts        # RDR export
│   │   ├── registration.ts      # Copyright registration workflow
│   │   ├── identifiers.ts       # ISRC, ISWC, CID handling
│   │   ├── bundle.ts            # Create metadata bundles for distribution
│   │   └── [other metadata utilities]
│   ├── tools/
│   │   ├── registry.ts          # Tool plugin definitions (PitchPlug, SampleClear, ContentID, etc.)
│   │   ├── pitchplug.ts         # PitchPlug email generation logic
│   │   ├── sampleclear.ts       # Sample clearance check
│   │   ├── contentid.ts         # ContentID registration
│   │   ├── copyrightkit.ts      # Copyright kit assembly
│   │   ├── hireright.ts         # Hire Right (session musician) tracking
│   │   ├── splitsheet.ts        # Split sheet generation
│   │   ├── documents.ts         # Document helpers
│   │   └── [other tool implementations]
│   ├── anthropic/               # Anthropic SDK wrapper
│   │   └── [Claude integration helpers]
│   ├── storage/                 # File upload/download
│   │   └── index.ts             # Supabase Storage helpers (signed URLs, uploads)
│   ├── stripe/                  # Stripe integration
│   │   └── index.ts             # Subscription management
│   ├── email/                   # Email sending
│   │   └── index.ts             # Resend integration
│   ├── submissions/             # Pitch submission tracking
│   │   └── index.ts             # Create submission record
│   ├── social/                  # Social features (wall, DM, endorsements)
│   │   ├── activity.ts          # Activity feed calculation
│   │   ├── activity-emit.ts     # Emit activity events
│   │   ├── wall.ts              # Wall post logic
│   │   ├── dm.ts                # Direct message logic
│   │   ├── endorsements.ts      # Endorsement logic
│   │   └── comments.ts          # Comment threading
│   ├── antenna/                 # Opportunity matching
│   │   ├── demo.ts              # Demo opportunities
│   │   └── [antenna logic]
│   ├── matching/                # Matching algorithm
│   │   ├── antenna.ts           # Match artists to opportunities
│   │   └── run.ts               # Run matching batch job
│   ├── benchmarks/              # Spotify metrics
│   │   ├── engine.ts            # Scoring engine
│   │   ├── opportunity-map.ts   # Map metrics to opportunity compatibility
│   │   └── [benchmark logic]
│   ├── notifications/           # In-app notifications
│   │   └── index.ts
│   ├── profile/                 # Artist profile
│   │   └── load.ts              # Load and hydrate profile
│   ├── contracts/               # Contract management
│   │   ├── verify.ts            # Verify contract signatures
│   │   └── [contract logic]
│   ├── esign/                   # E-signature (DocuSign, etc.)
│   │   └── provider.ts
│   ├── dsr/                     # Digital Service Report (earnings)
│   │   └── parse.ts             # Parse DSR files
│   ├── eligibility/             # Rights eligibility checking
│   │   └── direct-overlay.ts    # Direct licensing eligibility
│   ├── launchpad/               # Release coordination
│   │   └── [launchpad logic]
│   └── [other feature modules]

├── types/
│   └── index.ts                 # Global TypeScript types (VaultProject, Track, ReadinessItem, etc.)

├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql          # Artist, industry profiles, vault core
│   │   ├── 002_vault_assets_storage.sql    # Asset storage setup
│   │   ├── 003_readiness_triggers_full_events.sql  # Auto-calculate readiness
│   │   ├── 004_track_audio_storage.sql     # Audio bucket
│   │   ├── 005_stage3_additions.sql        # Release features
│   │   ├── 006_metadata_studio.sql         # Metadata fields on projects
│   │   ├── 007_isrc_registrant.sql         # ISRC registration state
│   │   ├── 008_readiness_metadata_cwr.sql  # CWR readiness check
│   │   ├── 009_antenna_notifications.sql   # Opportunity matching
│   │   ├── 010_public_showcase_profile.sql # Public artist profile
│   │   ├── 011_contract_verification.sql   # Contract signing
│   │   ├── 012_social_layer.sql            # Wall, endorsements, DM
│   │   ├── 013_readiness_activity_trigger.sql  # Activity stream
│   │   ├── 014_dm_realtime.sql             # Real-time DM
│   │   ├── 015_dsr_imports.sql             # DSR earnings import
│   │   ├── 016_release_distribution.sql    # Distributor field
│   │   └── 017_readiness_distributor_trigger.sql # Readiness on distributor change
│   └── [Supabase CLI config]

├── public/                      # Static assets (favicon, images)
│   └── [assets]

├── .planning/                   # GSD planning directory (generated)
│   ├── codebase/                # Architecture docs
│   └── [phases, milestones]

├── docs/                        # Documentation
│   └── [setup guides, etc.]

├── .claude/                     # Claude IDE config
├── middleware.ts                # Next.js auth middleware
├── tailwind.config.ts           # Tailwind CSS config (design tokens)
├── tsconfig.json                # TypeScript config (path aliases: @/*)
├── package.json                 # Dependencies
├── next.config.js               # Next.js config
└── [build, config files]
```

## Directory Purposes

**app/:**
- Purpose: Next.js App Router — contains all routes, pages, and API endpoints
- Contains: TSX pages, API route handlers, layouts, CSS
- Key pattern: File-based routing; `page.tsx` = route, `route.ts` = API endpoint

**app/(artist)/, (auth), (industry), (marketing):**
- Purpose: Logical route groups that organize pages without affecting URL structure
- Contains: Pages specific to user role (artist workspace, auth flows, industry tools)
- Key pattern: Middleware enforces auth before accessing (artist) routes

**app/api/:**
- Purpose: RESTful API — CRUD endpoints for vault projects, social, tools, integrations
- Contains: `route.ts` files with GET/POST/PATCH/DELETE handlers
- Key pattern: Follows domain structure (api/vault/[projectId]/tracks/[trackId])

**components/:**
- Purpose: Reusable React components — mostly client-side with 'use client' directive
- Contains: UI components for pages, forms, cards, modals
- Key pattern: Grouped by feature (vault/, tools/, antenna/) to mirror app structure

**lib/:**
- Purpose: Business logic, domain services, utilities — zero JSX, framework-agnostic
- Contains: Data transformations, calculations, API integrations, DB helpers
- Key pattern: One module per domain (lib/vault/, lib/metadata/, lib/tools/)

**lib/supabase/:**
- Purpose: Supabase client configuration and factories
- Contains: Client creation functions (createServerClient, createApiClient, createServiceClient)
- Key pattern: Centralizes auth/RLS enforcement; clients passed to lib modules

**types/:**
- Purpose: Shared TypeScript types and domain constants
- Contains: VaultProject, Track, ReadinessItem, Tier, UserRole, etc.
- Key pattern: Source of truth for data shapes; imported throughout app

**supabase/migrations/:**
- Purpose: Database schema — PostgreSQL table definitions, RLS policies, triggers
- Contains: SQL migration files numbered sequentially
- Key pattern: Each migration is idempotent; run via `supabase db push`

**middleware.ts:**
- Purpose: Request-level authentication and route protection
- Contains: Session checks, redirects for auth routes
- Key pattern: Runs before pages/API; can block or modify requests

## Key File Locations

**Entry Points:**
- `app/layout.tsx`: Root layout (metadata, fonts)
- `app/page.tsx`: Root page (redirects to /dashboard)
- `middleware.ts`: Auth middleware (runs on every request)

**Core Vault Feature:**
- `app/(artist)/vault/page.tsx`: Vault browser (list all projects)
- `app/api/vault/route.ts`: Vault CRUD API
- `lib/vault/readiness.ts`: Readiness score calculation
- `components/vault/VaultBrowser.tsx`: Project list UI
- `components/vault/VaultProjectCard.tsx`: Individual project card

**Metadata/Distribution:**
- `lib/metadata/schema.ts`: Metadata structure
- `lib/metadata/export.ts`: Export to JSON/CSV/CWR
- `app/api/vault/[projectId]/metadata/export/route.ts`: Download metadata
- `lib/metadata/cwr.ts`: CISAC CWR format

**AI Tools (PitchPlug):**
- `lib/tools/pitchplug.ts`: Pitch generation logic
- `app/api/tools/pitchplug/route.ts`: Generate pitches
- `components/tools/PitchPlugForm.tsx`: UI for curator selection
- `lib/tools/registry.ts`: All tool definitions

**Opportunity Matching (Antenna):**
- `lib/matching/antenna.ts`: Matching algorithm
- `app/api/antenna/match/route.ts`: Run matching
- `lib/benchmarks/opportunity-map.ts`: Map metrics to opportunities
- `components/antenna/AntennaBrowser.tsx`: Opportunity list UI

**Supabase & Database:**
- `lib/supabase/server.ts`: Server client factories
- `lib/supabase/client.ts`: Browser client
- `supabase/migrations/001_initial_schema.sql`: Core schema
- `supabase/migrations/003_readiness_triggers_full_events.sql`: Readiness calculation

**Configuration:**
- `tsconfig.json`: Path alias `@/*` → root
- `tailwind.config.ts`: Design tokens (colors, fonts, shadows)
- `app/globals.css`: Global CSS variables
- `middleware.ts`: Auth routes, route protection

**Testing:**
- Not currently in use (no test files found)

## Naming Conventions

**Files:**
- Pages: `page.tsx` (Next.js convention)
- API routes: `route.ts` (Next.js convention)
- Components: `PascalCase.tsx` (React convention, exported as function)
- Utilities/modules: `camelCase.ts` (exported as named/default functions)
- Types: `index.ts` if re-exported, or named export in `types/index.ts`

**Directories:**
- Feature domains: `kebab-case` (vault, metadata, tools, antenna)
- Dynamic routes: `[squareBrackets]` (Next.js convention, e.g., [projectId])
- Route groups: `(parentheses)` (Next.js convention, e.g., (artist))

**Functions & Variables:**
- Page components: Suffix `Page` (e.g., `VaultPage`)
- Client components: Suffix with component type (e.g., `VaultBrowser`, `EditProjectForm`)
- Hooks: Prefix `use` (e.g., `useVaultData`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `VALID_TYPES`, `DEMO`)
- Database queries: Start with method name (e.g., `getVaultProjects`, `updateProject`)

**Database/API:**
- Tables: `snake_case` plural (vault_projects, artist_profiles)
- Columns: `snake_case` (release_date, cover_art_url)
- API endpoints: `/api/domain/resource` (e.g., `/api/vault/[projectId]`)

## Where to Add New Code

**New Feature (e.g., New Tool):**
1. **Define tool in registry:** `lib/tools/registry.ts` — add entry with slug, name, description
2. **Implement tool logic:** `lib/tools/[toolName].ts` — functions for tool operation
3. **Create API route:** `app/api/tools/[toolName]/route.ts` — POST handler for execution
4. **Create UI component:** `components/tools/[ToolName]Form.tsx` — form to invoke tool
5. **Add to ToolsPanel:** Include in `components/vault/ToolSidePanel.tsx`
6. **Add readiness item (if applicable):** Update `types/index.ts` READINESS_ITEMS if tool gates release

**New Page/Workspace Section (e.g., New Artist Feature):**
1. **Create page:** `app/(artist)/[feature]/page.tsx` (server component, fetch data)
2. **Add nav link:** Update `components/nav/ArtistNav.tsx` with route
3. **Create supporting components:** `components/[feature]/*.tsx` for UI
4. **Add API routes (if needed):** `app/api/[feature]/route.ts` for CRUD
5. **Add business logic:** `lib/[feature]/index.ts` or `lib/[feature]/[operation].ts`

**New Component:**
1. **Determine if client or server:** Most are client ('use client'); server components for data fetching
2. **Location:** `components/[domain]/[ComponentName].tsx`
3. **Typing:** Import from `types/index.ts` or define inline
4. **Styling:** Use Tailwind classes (see `app/globals.css` for custom vars)

**New Database Table (Major Feature):**
1. **Create migration:** `supabase/migrations/NNN_[feature]_[description].sql`
2. **Define schema:** CREATE TABLE, indexes, RLS policies
3. **Update types:** Add TypeScript type to `types/index.ts` or new file
4. **Add RLS:** Ensure Row Level Security policies gate access by user
5. **Update Supabase types (optional):** Run `npm run db:types` after migration pushed

**New Utility/Helper:**
1. **Location:** `lib/[domain]/[helper].ts`
2. **Export:** Named exports for reusability across modules
3. **No JSX:** Keep lib modules framework-agnostic
4. **Type everything:** Use TypeScript for library code

## Special Directories

**supabase/migrations/:**
- Purpose: Database schema versioning
- Generated: No (manually written SQL)
- Committed: Yes (version control)
- Pattern: Numbered sequentially (001, 002, etc.); each is a complete schema change

**.next/:**
- Purpose: Next.js build output
- Generated: Yes (by `npm run build`)
- Committed: No (in .gitignore)
- Pattern: Do not manually edit; regenerate with build

**node_modules/:**
- Purpose: Installed dependencies
- Generated: Yes (by `npm install`)
- Committed: No (in .gitignore)
- Pattern: Lock file (package-lock.json) is committed; modules are not

**.planning/:**
- Purpose: GSD project planning and docs
- Generated: Yes (by GSD commands)
- Committed: Yes (contains architecture decisions, phase plans)
- Pattern: Created by `/gsd-map-codebase`, `/gsd-plan-phase`, etc.

**public/:**
- Purpose: Static assets served directly
- Generated: No (manually added)
- Committed: Yes
- Pattern: Favicon, images, fonts — referenced by pages without bundling

---

*Structure analysis: 2026-06-26*
