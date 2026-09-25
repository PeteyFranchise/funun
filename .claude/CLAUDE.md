<!-- GSD:project-start source:PROJECT.md -->

## Project

**Funūn — Wave 2: Rights & Registration Rails**

Wave 2 completes the **rights and registration layer** of Funūn's Sound Vault. Wave 1 tightened asset readiness (audio, artwork, metadata, distributor gate). Wave 2 makes the legal and registration side of a release equally structured and trackable.

Three pillars:

1. **Collaborator profiles** — enter a collaborator once, auto-fill everywhere (split sheets, contracts, registrations). Needs a new `collaborators` table.
2. **Document lifecycle** — upload-only e-sign for now (artists upload pre-signed PDFs, Funūn tracks signed/pending status per document and per project). Dropbox Sign is the provider interface target for when the account is live; the abstraction (`lib/esign/provider.ts`) is already built.
3. **Rights guidance** — in-app guided checklists for copyright registration (copyright.gov eCO), PRO registration (ASCAP/BMI/SESAC/SOCAN), and SoundExchange, with deep-links and per-project status tracking. Songtrust gets a guide card + CWR export hook; full API integration is a pending BD conversation (API registration model + carve-out structure).

---

**Core Value:** An artist completes a release knowing their rights are documented, their collaborators are on record, and their registrations are tracked — all from inside Funūn, with no data re-entry.

---
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 5.5.0 - Full application codebase, server components, API routes, type safety
- JavaScript - Configuration files, build setup
- SQL - Supabase migrations and database layer

## Runtime

- Node.js (no specific version pinned; inferred from Next.js 15 compatibility)
- npm (as specified in package.json scripts)
- Lockfile: package-lock.json (standard npm)

## Frameworks

- Next.js 15.0.0 - Full-stack React framework, API routes, server components, authentication middleware
- React 18.3.0 - UI component library and rendering
- React DOM 18.3.0 - DOM binding for React
- Tailwind CSS 3.4.0 - Utility-first CSS framework with custom design tokens
- PostCSS 8.4.0 - CSS processing pipeline
- Autoprefixer 10.4.0 - Browser compatibility for CSS
- Supabase (via `@supabase/supabase-js` 2.45.0) - PostgreSQL database and auth backend
- `@supabase/auth-helpers-nextjs` 0.10.0 - Supabase Auth integration with Next.js server/client
- Cookie-based session management through Supabase auth flow
- Zod 3.23.0 - TypeScript-first schema validation for API inputs, profiles, and data models
- ESLint 8.57.0 - Linting with Next.js config
- TypeScript 5.5.0 - Type checking (strict mode enabled)
- No test framework in dependencies (testing infrastructure not detected)

## Key Dependencies

- `@anthropic-ai/sdk` 0.52.0 - Claude API integration for AI-powered tools (PitchPlug, contract verification)
- `@supabase/supabase-js` 2.45.0 - Core database, real-time subscriptions, storage, auth client
- `stripe` 17.7.0 - Server-side Stripe payment processing
- `@stripe/stripe-js` 4.0.0 - Client-side Stripe.js for payment forms
- `resend` 4.0.0 - Email delivery service for notifications and pitch confirmations
- `node-id3` 0.2.9 - ID3 tag reading/writing for audio metadata extraction
- `supabase` 1.200.0 - CLI for local development, migrations, and database type generation
- `next` 15.0.0 - Server rendering, static generation, API routes, image optimization

## Configuration

- Environment variables (see INTEGRATIONS.md for required keys)
- `.env.example` exists but `.env.local` contains actual configuration (secrets not committed)
- `NEXT_PUBLIC_*` prefixed variables exposed to browser runtime
- `next.config.mjs` - Minimal Next.js config (default settings)
- `tsconfig.json` - TypeScript configuration with strict mode, path aliases `@/*`
- `tailwind.config.ts` - Custom design tokens for Funūn brand (ink, card, lav, gradients, money colors)
- `postcss.config.js` - PostCSS plugins (tailwindcss, autoprefixer)

## Platform Requirements

- Node.js compatible with Next.js 15
- PostgreSQL-compatible database (via Supabase)
- npm for dependency management
- Supabase CLI for local development (`supabase` package installed)
- Deployment target: Vercel (Next.js standard hosting)
- PostgreSQL database (Supabase production instance)
- Environment secrets configured in deployment platform
- Anthropic API access for AI features
- Stripe API keys for payment processing
- Resend API key for email delivery
- Supabase Storage buckets for audio, assets, and documents (up to 250MB per track)

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Descriptive, lowercase with hyphens for multi-word: `metadata-studio.tsx`, `identifiers.ts`, `activity-emit.ts`
- API routes match endpoints: `app/api/profile/route.ts`, `app/api/releases/route.ts`
- Utility/helper modules grouped by domain: `lib/metadata/schema.ts`, `lib/storage/index.ts`, `lib/supabase/client.ts`
- camelCase for all functions: `uploadTrackAudio()`, `validateRelease()`, `formatIsrc()`, `isValidUpc()`
- Predicate functions prefixed with `is`, `can`, or `has`: `isValidIsrc()`, `canEmbed()`, `hasAccess()`
- Helper/transformation functions descriptive: `artistCredit()`, `composerCredit()`, `normalizeCountry()`
- Single-purpose utility functions kept short and pure: see `lib/metadata/identifiers.ts` for example of 30-80 line validators and formatters
- camelCase for variables: `release`, `embedState`, `tracks`, `savingRelease`
- SCREAMING_SNAKE_CASE for constants: `MAX_AUDIO_SIZE`, `ALLOWED_AUDIO_TYPES`, `AUDIO_BUCKET`, `LYRICS_MAX`
- Record/enum labels suffix with `_LABELS`: `PRO_LABELS`, `COMPOSER_ROLE_LABELS`, `PERFORMER_ROLE_LABELS`, `VAULT_PROJECT_TYPE_LABELS`
- Enum/option values list suffix with `_VALUES`: `PRO_VALUES`, `COMPOSER_ROLE_VALUES`, `PERFORMER_ROLES`, `ORIGINAL_PURPOSES`
- PascalCase for all types: `Composer`, `TrackMetadata`, `ValidationReport`, `VaultProject`, `ReadinessItem`
- Explicit type suffixes for complex structures: `type VaultProjectType` (discriminated union), `type Check` (validation report item)
- Types exported from schema modules alongside label/value pairs: `lib/metadata/schema.ts` exports `PRO` type + `PRO_LABELS` + `PRO_VALUES`
- PascalCase component names: `MetadataStudio`, `TrackList`, `ProfileView`, `MetadataStudio`
- Client components marked with `'use client'` at top of file
- Component function parameters destructured with prop types inlined

## Code Style

- Prettier (used via `next lint`)
- 2-space indentation
- No semicolons at end of statements
- ESLint with Next.js config: `eslint-config-next` (installed, no custom `.eslintrc`)
- TypeScript strict mode enabled: `tsconfig.json` has `"strict": true`
- Resolved modules via path alias `@/*` pointing to root
- Target: ES2017
- Module resolution: bundler (Next.js default)
- `skipLibCheck: true` to avoid type-checking dependencies
- Strict null checks: null/undefined must be handled explicitly
- `noEmit: true` (TypeScript for type-checking only, build via Next.js)

## Import Organization

- `@/*` maps to root (see `tsconfig.json` paths)
- All absolute imports use `@/` prefix: `@/lib`, `@/components`, `@/types`
- Never use relative imports like `../` in shared code

## Error Handling

- Throw descriptive Error instances with user-friendly messages: `throw new Error('Audio must be WAV, FLAC, MP3, or AAC format')`
- Check error objects from SDK responses before throwing: `if (error) throw new Error(...)`
- Best-effort error recovery (functions marked as "never throws") wrapped in try/catch at call site: see `lib/social/activity-emit.ts`
- No silent failures — functions either complete successfully or throw
- State the problem clearly: "Audio must be WAV, FLAC, MP3, or AAC format" (not "invalid audio")
- Include actionable context: "Audio file must be under 250MB" (shows the limit)
- Server-side: include operation context: "Upload failed: {error.message}"
- Destructure `{ error, data }` from responses: `const { error } = await supabase.auth.getSession()`
- Check error before using data: `if (error) throw new Error(...)`
- Type-cast results safely when needed: `((existing ?? []) as { id: string; project_id: string }[])`

## Logging

- Minimal logging in libraries — errors preferred
- For debuggable operations, use Supabase admin functions within guarded contexts
- No console.log statements in committed code (clean output expected)
- Errors logged contextually in middleware/API routes (Next.js handles output)
- No explicit logging; session checks return redirects
- Errors from auth handlers bubble to Next.js error boundary

## Comments

- Domain-specific logic explaining "why" the code exists, not "what" it does
- Complex regex patterns with intent: ISRC format explanation above `isValidIsrc()`
- Section headers with dashes dividing major subsections within files
- Used for public functions and exported types
- Describes parameters, return values, and exceptional behavior
- Format: `// ─── Section Name ─────────────────────────────────────────────────`
- Used to group related logic in longer files: see `lib/metadata/schema.ts` or `components/vault/MetadataStudio.tsx`

## Function Design

- Small, focused functions preferred; ~50–100 lines max for most utilities
- Larger components (300–900 lines) used for complex UI state machines but kept organized with section headers
- Example: `MetadataStudio` (906 lines) organized with comments marking track list, release state, and validation sections
- Destructured objects for functions with multiple related args (especially React components)
- Explicit `?` for optional parameters: `email?: string`, `ipi?: string`
- Null coalescing and optional chaining used defensively: `(primaryArtist ?? '').trim()`
- Pure functions preferred in lib/ (no side effects)
- Async functions return Result objects: `{ matched: number }`, `{ url: string; path: string; size: number }`
- Nullable returns marked in signature: `MasterAudio | null`, `ValidationReport`
- Early returns used to reduce nesting

## Module Design

- Prefer named exports: `export function validateRelease(...)`
- Type exports use `export type`: `export type ValidationReport = { ... }`
- Organize exports logically: types first, then helpers, then main functions
- Not heavily used; imports are direct to specific modules
- `index.ts` files in lib/ act as re-export facades only when needed: `lib/storage/index.ts`, `lib/supabase/index.ts`
- Export async handler: `export async function POST(req: NextRequest) { ... }`
- Use `NextResponse` for all responses: `NextResponse.json(data)`, `NextResponse.redirect(url)`
- Sanitize input before use (see `app/api/profile/route.ts` — explicit allowlist of editable fields)

## Data Validation

- Client components validate shape and type before sending to API
- Reject invalid input early: `if (!Array.isArray(input)) return []`
- Trim and normalize strings: `String(o.name ?? '').trim()`
- Explicit allowlist of fields to update: `app/api/profile/route.ts` defines `EDITABLE_FIELDS`
- Type-cast parsed values after validation: `const n = Number(value); if (n >= 1 && n <= 4) update[key] = n`
- No direct assignment from request body
- Read loosely with type guards: `typeof raw.text === 'string'`
- Normalize/coerce values: `Number.isFinite(split) ? split : 0`
- Return typed result or null: `TrackLyrics | null`
- See `lib/metadata/schema.ts` for pattern examples: `readComposers()`, `readLyrics()`, `readPerformers()`, `readRecordingInfo()`

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

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

- **Server-first architecture** — Pages fetch data server-side; static content renders during build
- **Nested API routes** — Modular endpoint organization mirroring domain structure
- **Type-driven design** — Zod schemas for validation, TypeScript for type safety throughout
- **Route groups** — Logical separation of user roles (artist, auth, industry) without URL impact
- **RLS-enforced multi-tenancy** — Supabase Row Level Security gates data per user
- **Demo mode support** — `NEXT_PUBLIC_VAULT_DEMO=true` runs a seeded in-memory app for previews
- **AI-powered tools** — Anthropic SDK for PitchPlug email generation, document analysis

## Layers

- Purpose: Server-rendered entry points for authenticated user flows
- Location: `app/(artist)/`, `app/(auth)/`, `app/(industry)/`, `app/r/`, `app/u/`
- Contains: Server components that fetch data, pass props to client components
- Depends on: Supabase client, lib modules for business logic
- Used by: Users browsing the app; middleware enforces auth
- Purpose: HTTP endpoints for CRUD operations, external integrations, AI calls
- Location: `app/api/`
- Contains: NextResponse handlers, Supabase mutations, Anthropic API calls, Stripe webhooks
- Depends on: Supabase, createApiClient() for auth, lib modules
- Used by: Browser fetch calls from client components, external webhooks
- Purpose: Interactive UI — forms, tabs, modals, real-time state
- Location: `components/`
- Contains: React hooks (useState, useRouter), event handlers, form submission logic
- Depends on: API routes for mutations, useRouter for navigation
- Used by: Server components, other client components (composable)
- Purpose: Domain-specific functions shared across API and pages
- Location: `lib/[domain]/` — antenna/, benchmarks/, contracts/, metadata/, social/, tools/, vault/, etc.
- Contains: Calculation functions, data transformations, feature implementations
- Depends on: Supabase, types, external SDKs (Anthropic, Stripe)
- Used by: API routes and server components
- Purpose: Supabase client factories and configuration
- Location: `lib/supabase/`
- Contains: `createServerClient()`, `createApiClient()`, `createServiceClient()` factories
- Depends on: @supabase/auth-helpers-nextjs, @supabase/supabase-js
- Used by: All server code (pages, API routes, lib modules)
- Purpose: PostgreSQL database, auth, RLS, Realtime, storage buckets
- Location: `supabase/migrations/` — schema defined via SQL migrations
- Contains: artist_profiles, vault_projects, tracks, submissions, social tables, etc.
- Depends on: None (foundation)
- Used by: All server code via Supabase clients

## Data Flow

### Primary Request Path: Create/Edit Vault Project

### Secondary Flow: AI Tool — PitchPlug Email Generation

### Social Flow: Wall Post (Public Project Activity)

- **Server state:** Loaded via server components (zero JavaScript for static data)
- **Client state:** React hooks (useState, useReducer) for forms, modals, tabs
- **Global state:** None (no Redux, Context minimally used)
- **Database as source of truth:** All writes persisted to Supabase; client state is transient

## Key Abstractions

- Purpose: Central domain entity — an artist's single, EP, album, or unreleased work
- Examples: `app/(artist)/vault/page.tsx`, `lib/vault/readiness.ts`, `app/api/vault/route.ts`
- Pattern: Server components fetch full project with relations (tracks, assets, documents); readiness score auto-calculated by DB triggers
- Purpose: Represents a single gate in the vault readiness checklist (e.g., "audio_files", "split_sheets")
- Examples: Defined in `types/index.ts` (READINESS_ITEMS array); consumed by `lib/vault/readiness.ts`
- Pattern: Score 0–100 based on item completion; UI breakdown in `VaultProjectCard` and project detail pages
- Purpose: Record of a tool run (PitchPlug emails, metadata exports, registrations)
- Examples: Stored in DB; displayed in `components/vault/ToolSidePanel.tsx`
- Pattern: Each tool plugin (pitchplug, sampleclear, etc.) defined in `lib/tools/registry.ts`
- Purpose: Record of an outbound pitch to a curator or distributor
- Examples: Created by `lib/submissions/index.ts`; displayed in `components/vault/SubmissionHistory.tsx`
- Pattern: Tracks destination, type, status, timestamp; used to gate PitchPlug credit deduction
- Purpose: User identity — name, genre, links, verification status
- Examples: Fetched server-side, editable via `app/api/profile/route.ts`
- Pattern: Single-row tables keyed by auth.users.id; RLS allows users to manage own profile, public visibility controlled by flag
- Purpose: An open call for music submissions (playlist pitch, sync, release)
- Examples: Created by industry pros, matched to artists via benchmark scoring
- Pattern: Stored in `antenna_opportunities` table; match algo in `lib/matching/antenna.ts`

## Entry Points

- Location: `app/page.tsx`
- Triggers: Unauthenticated user visits domain root
- Responsibilities: Redirects to `/dashboard` (artist) or `/signin` (if not logged in)
- Location: `app/(artist)/vault/page.tsx`
- Triggers: Artist accesses Sound Vault
- Responsibilities: Lists all projects with readiness scores; filters by lane (draft/scheduled/live)
- Location: `app/(artist)/dashboard/page.tsx`
- Triggers: Artist logs in, checks home
- Responsibilities: Summary stats (total projects, avg readiness, count ready to submit)
- Location: `app/(auth)/signin/page.tsx`, `app/(auth)/signup/page.tsx`
- Triggers: Unauthenticated user, middleware redirect
- Responsibilities: Supabase auth UI, session creation
- Location: `app/u/[handle]/page.tsx`
- Triggers: Anyone visits artist profile URL
- Responsibilities: Display public artist info, recent releases, wall posts
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

```typescript

```

### Storing Calculated Values in UI State

### Unvalidated File Uploads to Storage

```typescript

```

### Silent Failures in Readiness Calculation

```typescript

```
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

- **Spike findings for funun** (Buffer integration — BYOK auth, calendar→post mapping, connect/push UX; implementation patterns, constraints, gotchas) → `Skill("spike-findings-funun")`
- **Sketch findings for funun** (My Catalogue / Phase 37 UI — the work-page diary, AI-entry moment, hygiene nudges, destination doors) → `Skill("sketch-findings-funun")`
- **Label integrity for funun** (find names that assert more than the data carries — a column, status, flag or predicate whose name claims something nothing checks; two confirmed production instances) → `Skill("label-integrity-funun")`
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## Account Vocabulary

**Funūn has three account classes: Member, Client Partner, and Funūn Team Member.**

- Member is the full-user umbrella for artists, writers, producers, managers,
  publishers, attorneys, engineers, label executives, curators, and other creative
  professionals. A `user_profiles` row is the current structural Member signal.
- Client Partner access comes from an explicit `buyer_members` relationship to a
  verified `buyer_orgs` organization. It may coexist with a Member workspace on the
  same auth identity. Never infer it from a “Music Supervisor” profile role or require
  `app_metadata.role='buyer'` when a valid membership exists.
- Funūn Team Member access comes from `funun_staff` and server-verified staff roles.
  Staff identities stay separate and fail closed out of Member/Client Partner contexts.
- Guests and signature recipients are limited invitation contexts, not account classes.

Professional roles describe a person and may prefill forms; they never grant workspace
access, authorship, ownership, signing authority, licensing power, or payment rights.
Relationships grant workspace access. Project permissions and authoritative rights
records decide what a person can do and owns.

Legacy `member_type`, `capability_grants`, buyer metadata, and old URLs remain only for
compatibility until a later audited removal. Core Member navigation must not be hidden by
artist/industry capability labels. Full reference:
`docs/architecture/ACCOUNT-TYPES.md`.

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

## Repository Visibility

**`PeteyFranchise/funun` is a PUBLIC repository.** Everything committed and pushed is
readable by anyone on the internet, immediately and permanently.

Before committing anything that is not application code, ask whether it belongs on the
public internet — not merely whether it belongs in a repo. Business documents, contracts,
financing paperwork, deal terms, personal correspondence and customer data do not.

**Removing it later does not remove it.** A force-pushed commit stays retrievable by its
SHA until GitHub Support garbage-collects the repository; there is no self-serve control.
That happened on 2026-09-19 with a film-financing redline whose task records were committed
here because a session was run from this directory on unrelated work.

Two standing consequences:

- `~/Desktop/deals/` exists for non-Funūn business work. Run those sessions from there, not
  from this repo, so their `.planning/quick/` records land somewhere private.
- `private/` and `*.docx` are gitignored here as a backstop for anything that lands anyway.
  The backstop is not the plan; keeping the work out of this directory is the plan.

**OWNER DECISION 2026-09-20: it stays public until a paid plan is affordable, then
goes private.** Deferred on cost, not on doubt — so treat the rule above as the
standing operating rule, not as advice about to expire. Details and the order of
operations: `.planning/todos/pending/2026-09-20-make-repo-private-when-affordable.md`.

**Do not make the repository private as a reflex.** GitHub Pages serves
**www.funun.studio** from `main`, and Pages on a private repository requires a paid GitHub
plan — flipping visibility on the Free plan takes the site down. CodeQL default setup would
also stop (it is free for public repositories only), though it is not a required check and
merges would continue.

## Verification Gate

Before claiming any change, wave, or phase is green, run **every step the CI `validate` job
runs** (`.github/workflows/quality.yml`). Anything less is not a green build:

```bash
npm run security:migrations:verify
npm run typecheck:strict     # not just `tsc --noEmit` — adds noUnusedLocals/noUnusedParameters
npm run lint                 # --max-warnings=0, so ANY warning fails the build
npm test -- --runInBand
npm audit --omit=dev --audit-level=moderate
npm audit --audit-level=high
```

Notes:

- **`npm run build` is not part of CI's validate job.** It is also unsafe while a dev server is
  running (it clobbers `.next`). Prefer `npm run typecheck:strict` for type safety and only build
  when you specifically need the production bundle.
- **`lint` is load-bearing, not cosmetic.** `--max-warnings=0` means a `react-hooks/exhaustive-deps`
  warning fails the build — and those warnings usually describe a real defect. Phase 39 gated six
  consecutive waves on build + test alone; all six passed while a keydown effect re-subscribed its
  `document` listener on every render, caught only when CI finally ran lint.
- `main` is protected: direct pushes are rejected until `validate` and CodeQL pass. Ship through a
  PR, never by pushing `main`.

A check that prints green without exercising what it claims to cover is worse than no check,
because it buys false confidence. Two known traps in this repo: a bracketed Jest path
(`app/api/works/[workId]/...`) parses as a regex character class and silently matches zero tests,
and no jsdom is installed, so component tests cannot observe interaction state.

**Running it proves the mechanism, not the meaning.** Migration 227 was verified by calling it
against production: it executed, returned rows, and refused `anon` by name with a positive
control alongside. Every one of those statements was true, and the output was still wrong — six
of eight rows in a column named `owner_segment` did not contain an owner. Nothing checked the
label, because the label looked like an answer. When a result is named, verify the name against
an independent source: cross-referencing those segments against `auth.users` and `works` was one
query and would have caught it the same afternoon. "The code ran" and "the answer is right" are
separate claims, and only the first one is cheap.

**A plan is only as true as its claims about the code.** Before planning a phase, verify every
factual claim the plan rests on against the actual source, with a `file:line` for each, and mark
anything you cannot confirm UNVERIFIABLE rather than assuming. Do this per phase, not once at the
end of a design wave.

On 2026-09-24 a design wave produced four roadmapped phases; a verification pass found three
claims wrong, and **every one came from reading part of a file and inferring the rest**. One
claimed a feature was missing that renders 470 lines further down the same file. One cited a
250MB resumable upload path that belongs to a different bucket — the real cap is 50MB one-shot,
which invalidated the phase's premise. The third proposed making arrangement sections out of
`lyric_blocks`, whose `author_user_id` is documented in migration 135 as *"the fact that MOVES
SPLITS"* — that model would have attributed a writing credit that moves money to whoever added an
instrumental break.

That last one is why this is a rule and not a preference: **in a rights product an unverified
claim is not a docs bug, it is a money bug.** Claims about *absence* — "nothing renders this",
"no such field exists", "it does nothing with it" — cost the most and cannot be established from
the top of a file. Read the whole thing, or say you did not.

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
