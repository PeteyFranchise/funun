# Codebase Structure

**Analysis Date:** 2026-10-18

## Directory Layout

```
funun/
├── app/                      # Next.js App Router: pages, layouts, route handlers (338 route.ts, 148 page.tsx)
│   ├── (admin)/              # Funūn staff console (66 files)
│   ├── (artist)/             # Artist Sound Vault, dashboard, settings (52 files)
│   ├── (auth)/               # signin, signup, forgot/update password (12 files)
│   ├── (curator-portal)/     # Curator portal, role = curator (2 files)
│   ├── api/                  # Route handlers (411 files incl. tests)
│   ├── sync/                 # Client Partner / buyer surface (9 files)
│   ├── w/[workspaceId]/      # Workspace rooms (8 files)
│   ├── r/ u/ selects/ pitch/ approve/ join/ curators/   # Token and public routes
│   ├── help/ status/ team-fit/ unsubscribe/ profile/ profile-preview/
│   ├── marketing-document/   # Route handler serving the anonymous homepage
│   ├── layout.tsx page.tsx globals.css global-error.tsx
│   └── opengraph-image.tsx
├── components/               # Client and shared React components, one folder per domain (32 folders)
├── lib/                      # Domain logic and service modules (59 domain folders, plus root files)
├── types/                    # Shared ambient and domain types (index.ts, catalogue.ts, fontkit.d.ts)
├── supabase/                 # config.toml and migrations/ (238 SQL files)
├── __tests__/                # Cross-cutting Jest tests (298 files, feature-named, for example `writer-room-*`)
├── scripts/                  # tsx and node CLI tools and verifiers
├── docs/                     # Markdown docs: design, observability, security, verification, marketing, sales
├── research/                 # Contract research (research/contracts/) and related notes
├── assets/                   # Runtime-read assets: fonts/ (PDF), marketing/ (landing.html, manifest.json)
├── public/                   # Static files served at site root: marketing/ (54), buyer-catalogue/ (7), favicon.ico
├── .planning/                # GSD planning artifacts (phases, quick tasks, todos, research, codebase maps)
├── .agents/skills/           # Agent skill definitions (112 files)
├── .claude/                  # Claude Code config: CLAUDE.md, launch.json, skills/ (27 files)
├── .github/                  # GitHub configuration
├── middleware.ts             # Request entry: CSP, session, route guards
├── instrumentation.ts        # Sentry server and edge registration
├── instrumentation-client.ts # Sentry browser init
├── sentry.server.config.ts   sentry.edge.config.ts
├── next.config.mjs           # Next config, headers, outputFileTracingIncludes
├── vercel.json               # Cron schedules
├── package.json              # Scripts, dependencies, overrides
├── tsconfig.json             # strict, paths: "@/*" -> "./*"
├── jest.config.js            # Jest, node environment
├── tailwind.config.ts postcss.config.js .eslintrc.json
└── README.md, AGENTS.md, and other root-level docs
```

Generated or local directories, not source: `.next/`, `node_modules/`, `playwright-report/`, `test-results/`, `tsconfig.tsbuildinfo`. `tests/e2e/` holds Playwright specs that are present on disk but not tracked in git.

## Directory Purposes

**`app/(admin)/`:**
- Purpose: Funūn team console, grouped by room
- Contains: `admin/` pages (`deals`, `members`, `playbook`, `sync-library`, `client-partners`, `verification`, `workspaces`, `esign-usage`, and about 40 others), `checklist/`, `tips/`
- Key files: `app/(admin)/layout.tsx` (any staff role), `app/(admin)/admin/playbook/layout.tsx` (playbook gate), `app/(admin)/admin/deals/[id]/page.tsx`
- The playbook is the largest room: `app/(admin)/admin/playbook/` has 2 layout and page files plus about 30 room subpages (`access`, `activation`, `ask`, `governance`, `inbox`, `it/*`, `learning-paths`, `publication`, and more)

**`app/(artist)/`:**
- Purpose: Member (artist) workspace: Sound Vault, collaborators, split sheets, sync library, earnings, settings
- Contains: `vault/` (projects, new, works, producer-inbox), `split-sheets/`, `sync-library/`, `settings/` (own layout), `launchpad/`, `antenna/`, `opportunities/`, `ideas/`, `green-room/`, `tools/pitchplug/`
- Key files: `app/(artist)/layout.tsx` (account and handle gate, nav data), `app/(artist)/vault/[projectId]/page.tsx`, `app/(artist)/dashboard/page.tsx`
- Project sub-rooms: `vault/[projectId]/{documents,metadata,pitch,play,readiness,rights}/`, and `metadata/{cwr,identifiers,onesheet,registrations}/`

**`app/(auth)/`:**
- Purpose: Authentication screens
- Contains: `signin/`, `signup/` (5 files), `forgot-password/`, `update-password/`
- Key files: `app/(auth)/layout.tsx`

**`app/(curator-portal)/`:**
- Purpose: Curator-only portal (`/portal`)
- Key files: `app/(curator-portal)/layout.tsx` (requires `app_metadata.role === 'curator'`), `app/(curator-portal)/portal/page.tsx`

**`app/api/`:**
- Purpose: All HTTP endpoints
- Top-level segments (file counts include tests): `admin` (126), `works` (51), `vault` (28), `workspaces` (23), `sync-library` (21), `ideas` (14), `split-sheets` (10), `cron` (12), `waitlist` (6), `roster` (6), `green-room` (6), `launchpad` (6), `buyer` (8), `dm` (7), `collaborators` (7), `producer-handoffs` (5), `selects` (5), `settings` (5), `signup` (4), `antenna` (4), `profile` (4), `webhooks` (4), plus smaller folders
- Key files: `app/api/vault/route.ts`, `app/api/workspaces/[workspaceId]/members/route.ts`, `app/api/admin/deals/[id]/pay/route.ts`, `app/api/cron/process-jobs/route.ts`, `app/api/webhooks/stripe/route.ts`
- Convention: `route.ts` beside `route.test.ts` (75 pairs)

**`app/sync/`:**
- Purpose: Client Partner (buyer) surface, the catalogue and requests side of Sync Library
- Contains: `catalog/`, `requests/` (with `[id]` and `new`), `shortlists/`, `brief/`, `access/`
- Key files: `app/sync/layout.tsx` (buyer shell, no redirect), `app/sync/catalog/page.tsx`

**`app/w/[workspaceId]/`:**
- Purpose: Workspace rooms (activity, contracts, master claims, plan, roster)
- Key files: `app/w/[workspaceId]/layout.tsx`, `app/w/[workspaceId]/page.tsx`

**`components/`:**
- Purpose: Client components and shared UI, one folder per domain
- Largest folders: `playbook` (54), `catalogue` (61), `admin` (41), `vault` (32), `profile` (19), `nav` (14), `workspaces` (7 in components, 67 in lib), `buyer` (11), `launchpad` (10)
- Shared chrome: `components/nav/` (ArtistNav, AdminNav, NotificationBell, MessagesIcon, PresenceTracker, ArtistLayoutClient), `components/auth/SessionIdentityGuard.tsx`, `components/ui/`, `components/layout/`
- Feature folders: `antenna`, `auth`, `benchmarks`, `buyer`, `catalogue`, `coach`, `collaborators`, `contracts`, `curators`, `deals`, `earnings`, `green-room`, `handles`, `ideas`, `launchpad`, `messages`, `network`, `onboarding`, `playbook`, `profile`, `selects-player`, `settings`, `split-sheets`, `sync-library`, `team-tier`, `tools`, `vault`, `workspaces`

**`lib/`:**
- Purpose: Domain modules that route handlers and pages call
- Root files: `lib/genres.ts`, `lib/industry-roles.ts`, `lib/phone.ts` (with `phone.test.ts`)
- Largest domains: `workspaces` (67 files), `catalogue` (85), `playbook` (60), `split-sheets` (30), `vault` (22), `deals` (22), `client-partners` (20), `metadata` (19), `song-passport` (17), `selects` (13), `email` (13), `auth` (13), `staff` (12)
- Infrastructure domains: `supabase/` (client and server factories), `jobs/` (queue, run, handlers), `observability/` (alerts, config, logger, scrub, vendor-health), `logging/` (correlation IDs), `security/` (rate limit, turnstile, upload admission, escape-html), `storage/`, `webhooks/`
- Provider domains: `stripe/` (Connect), `esign/` (provider, DocuSeal adapter, webhook), `anthropic/`, `ai/`, `email/` (Resend templates)
- Shared domain vocabulary: `admin/staff-role.ts` (client-safe role helpers), `accounts/account-context.ts`, `capabilities/check.ts`

**`lib/vault/`:**
- Purpose: Sound Vault business rules
- Key files: `lib/vault/readiness.ts` (score), `lib/vault/readiness-tiers.ts`, `lib/vault/membership.ts`, `lib/vault/access.ts`, `lib/vault/demo-store.ts` (demo mode), `lib/vault/pdf/` (9 files; document rendering), `lib/vault/export-*.ts`, `lib/vault/hire-credits.ts`

**`lib/workspaces/`:**
- Purpose: Workspace model, membership, grants, rosters, requests, and ownership
- Key files: `types.ts` (vocabulary), `membership.ts`, `access.ts` (`requireWorkspaceAccess`, `requireWorkspaceRole`, `requireWorkspaceMutationAccess`), `permissions.ts`, `grant-service.ts`, `request-service.ts`, `roster-service.ts`, `ownership-transfer.ts`, `access-kill-switch.ts`, `audit.ts`
- Each service module has a sibling `.test.ts`

**`lib/catalogue/`:**
- Purpose: Work and lyric records, lyric lift and lyric snapshots, the Writer's Room data
- Key files: `lib/catalogue/access.ts` (one access decision for every `/api/works` route), `lyric-lift-queue.ts`, `lyric-lift-service.ts`

**`lib/playbook/`:**
- Purpose: Staff playbook content, access grants, activation checks, reading and review reminders
- Key files: `access-grants.ts`, `read-doc.ts` (reads `docs/observability/*.md` at runtime)

**`lib/jobs/`:**
- Purpose: Durable background queue
- Files: `queue.ts` (enqueue, claim, fail), `run.ts` (dispatch), `handlers.ts` (`JOB_HANDLERS`: `lyric_lift`, `watermark_preview`, `vault_export`)

**`lib/auth/`:**
- Purpose: Sign-in routing and session identity
- Key files: `postSignInPath.ts`, `session-identity.ts`, `client-diagnostics.ts`, `diagnostics.ts`, `health.ts`, `public-errors.ts`

**`types/`:**
- Purpose: Shared type declarations
- Files: `index.ts` (shared domain types), `catalogue.ts` (catalogue types), `fontkit.d.ts` (ambient module declaration for the PDF font library)
- `types/supabase.ts` is the target of `npm run db:types` but is not tracked in the repository

**`supabase/migrations/`:**
- Purpose: Schema, RLS, RPCs, triggers, and storage setup
- Naming: `NNN_snake_case_description.sql`, zero-padded to three digits. Numbers run 001 to 242 with gaps. Latest: `242_collaboration_surface_lockdown.sql`. The next migration is `243_`.

**`__tests__/`:**
- Purpose: Jest tests that cover several modules or a product flow. Filenames are kebab-case and usually name the feature, for example `writer-room-vocal-direction-api.test.ts`.
- Other tests sit next to their source: 365 `*.test.ts(x)` files live outside `__tests__/`.

**`scripts/`:**
- Purpose: Operational and verification tooling run through `tsx` or `node`
- Files: `audit-gate.ts`, `break-glass.ts`, `build-marketing-artifact.ts`, `marketing-assets.ts`, `check-playbook-activation.ts`, `print-audition-sample.ts`, `verify-beta-security-migrations.mjs`, `verify-064-split-sheet-rls.mjs`, `verify-115-split-sheet-token-privacy.mjs`, `verify-228-identity-provenance.mjs`, `provision-test-admin.mjs`, `load/` (6 files), `__fixtures__/` (4 files)

**`docs/`:**
- Purpose: Design and operations documentation. Some of it is read at runtime.
- Subfolders: `design/` (19), `observability/` (9, read at runtime by Playbook IT pages), `marketing/`, `security/`, `verification/`, `catalogue/`, `architecture/`, `playbook/`, `sales/`
- Top-level notes include `DOMAIN-SETUP.md`, `BREAK-GLASS.md`, `e-sign-integration.md`, `split-sheets.md`, `cwr-plan.md`, `release-journey.md`

**`.planning/`:**
- Purpose: GSD workflow artifacts for planning and execution. Not imported by application code. Some paths are read at runtime (see Special Directories).
- Subfolders: `phases/`, `quick/`, `todos/`, `deliberations/`, `research/`, `reviews/`, `sketches/`, `design/`, `spikes/`, `milestones/`, `codebase/` (this document set), plus `security/` and `security-audit-260818/`
- Top-level files: `PROJECT.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, `MILESTONES.md`, `config.json`

## Key File Locations

**Entry Points:**
- `middleware.ts`: request gate, CSP, route guards
- `app/layout.tsx`: root HTML shell and font
- `app/page.tsx`: role router for `/`
- `instrumentation.ts`: Sentry server and edge init
- `app/api/cron/process-jobs/route.ts`: background worker

**Configuration:**
- `next.config.mjs`: Next config, security headers, `outputFileTracingIncludes`, Sentry wrap
- `vercel.json`: eight cron schedules
- `tsconfig.json`: strict mode, `@/*` alias
- `package.json`: scripts (`dev`, `build`, `test`, `typecheck`, `lint`, `db:types`, `db:push`, `audit:gate`)
- `.env.example`: documented environment variables (`.env.local` is gitignored and not read here)
- `supabase/config.toml`: local Supabase stack
- `jest.config.js`, `tailwind.config.ts`, `postcss.config.js`, `.eslintrc.json`, `sentry.server.config.ts`, `sentry.edge.config.ts`

**Core Logic:**
- `lib/workspaces/access.ts`: workspace authorization
- `lib/admin/gate.ts`: staff authorization for route handlers
- `lib/stripe/connect.ts`: payment split and checkout
- `lib/jobs/queue.ts`: job enqueue and claim
- `lib/vault/readiness.ts`: readiness score

**Testing:**
- `__tests__/`: cross-cutting Jest tests
- Co-located `*.test.ts(x)` files, including 75 `route.test.ts` files
- `tests/e2e/`: Playwright specs (untracked)

## Naming Conventions

**Files:**
- Route segments: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `route.ts`, `route.test.ts` (Next.js reserved names)
- Dynamic segments: `[id]`, `[projectId]`, `[workspaceId]`, `[token]`, `[inviteToken]`, `[room]`, `[slug]`, `[workId]`, `[listingId]`, `[orgId]`
- Route groups: `(admin)`, `(artist)`, `(auth)`, `(curator-portal)` (not in URLs)
- Library modules: kebab-case, for example `access-kill-switch.ts`, `lyric-lift-service.ts`, `session-identity.ts`, `date-schemas.ts`. A few are camelCase: `postSignInPath.ts`, `rootRewrite.ts`, `nonceInjection.ts`
- Components: PascalCase files, for example `ArtistNav.tsx`, `SessionIdentityGuard.tsx`, `TimedTrackPlayer.tsx`
- Tests: `<module>.test.ts` next to the module, `route.test.ts` next to `route.ts`, or a feature name in `__tests__/`
- Migrations: `NNN_snake_case.sql`, for example `242_collaboration_surface_lockdown.sql`

**Directories:**
- All `lib/` and `components/` domain folders are kebab-case: `client-partners`, `sync-library`, `split-sheets`, `green-room`, `selects-player`
- API folders match URL segments: `app/api/sync-library/mint-agreement/route.ts` serves `/api/sync-library/mint-agreement`

**Identifiers:**
- Constants: SCREAMING_SNAKE_CASE. Enum values use a `_VALUES` suffix and labels use a `_LABELS` suffix, for example `WORKSPACE_ROLE_VALUES`, `WORKSPACE_TYPE_LABELS` (`lib/workspaces/types.ts`)
- Types: PascalCase. Unions are derived from value arrays with `typeof X_VALUES[number]`
- Functions: camelCase. Predicates start with `is`, `can`, or `has`
- Design-decision IDs (`D-01`, `R-05`, `F15`) appear in comments and point to planning records in `.planning/`. Keep them when you change the code they describe.

**Imports:**
- Use the `@/` alias for every import (`tsconfig.json` paths)

## Where to Add New Code

**New artist feature page:**
- Page: `app/(artist)/<feature>/page.tsx` (server component, uses `createServerClient`)
- Components: `components/<feature>/`
- Domain logic: `lib/<feature>/` (pure functions first, plus a service module that takes a Supabase client)
- Route handler: `app/api/<feature>/route.ts` with `route.test.ts` beside it
- If the page must require sign-in, add its path prefix to `isProtected` in `middleware.ts` (see the anti-pattern in ARCHITECTURE.md)

**New admin room or tool:**
- Page: `app/(admin)/admin/<room>/page.tsx`. The group layout already admits any staff role. Add a leadership or role check inline when the page needs one.
- API: `app/api/admin/<room>/route.ts`, gated with `verifyAdmin()` or `requireStaff([...roles])` from `lib/admin/gate.ts`
- Playbook content: `lib/playbook/` and `components/playbook/`, with a sub-route under `app/(admin)/admin/playbook/`

**New workspace capability:**
- Route: `app/api/workspaces/[workspaceId]/<capability>/route.ts`, starting with `requireWorkspaceAccess` from `lib/workspaces/access.ts`
- Vocabulary changes: `lib/workspaces/types.ts`, plus a matching migration CHECK constraint
- Stateful writes: add or extend a database RPC, and call it from the route. Do not write `workspace_members` directly from a route.

**New database change:**
- Migration: `supabase/migrations/243_<description>.sql` (the next free number). Enable RLS on new tables and add policies in the same file.
- Generated types: run `npm run db:types`. Output goes to `types/supabase.ts`.

**New background job:**
- Handler: add a key to `JOB_HANDLERS` in `lib/jobs/handlers.ts`, implemented in `lib/<domain>/`
- Enqueue: `enqueueJob({ type, payload, dedupKey })` from `lib/jobs/queue.ts`. Pass a `dedupKey` for any work a user can trigger twice.

**New cron job:**
- Route: `app/api/cron/<name>/route.ts`, with the fail-closed `CRON_SECRET` bearer check used by the existing cron routes
- Schedule: add an entry to `vercel.json`

**New webhook receiver:**
- Route: `app/api/webhooks/<provider>/route.ts`. Verify the signature before parsing the body, as `app/api/webhooks/stripe/route.ts` does.

**New third-party provider:**
- Adapter: `lib/<provider>/` (plain `fetch` adapter, as in `lib/esign/docuseal.ts`), behind an interface file such as `lib/esign/provider.ts`

**New runtime-read file (fonts, markdown, templates):**
- Place it under `assets/` or `docs/`, read it with a `process.cwd()` path, and add it to `outputFileTracingIncludes` in `next.config.mjs`. Otherwise it is missing from the deployed bundle.

**New shared utility:**
- Cross-domain pure helper: `lib/<name>.ts` at the root (examples: `lib/phone.ts`, `lib/genres.ts`)
- Security helper: `lib/security/`
- Client-side role helper: `lib/admin/staff-role.ts` only. Do not import `lib/admin/gate.ts` from a client component.

**New UI component shared across features:**
- `components/ui/` for primitives, `components/nav/` for chrome

**New tests:**
- Next to the module as `<name>.test.ts`. Route tests go next to `route.ts` as `route.test.ts`. Cross-cutting or flow-level tests go in `__tests__/`.

## Special Directories

**`.next/`:**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No

**`node_modules/`:**
- Purpose: npm dependencies (`package-lock.json` is the lockfile)
- Generated: Yes
- Committed: No

**`assets/fonts/`:**
- Purpose: Noto Sans TTF files for PDF rendering, read at runtime by `lib/vault/pdf/fonts.ts`
- Generated: No
- Committed: Yes

**`assets/marketing/`:**
- Purpose: `landing.html` and `manifest.json` for the anonymous homepage, served through `app/marketing-document/route.ts`
- Generated: No. Build and verify scripts are `scripts/build-marketing-artifact.ts` and `scripts/verify-marketing-artifact.ts`.
- Committed: Yes

**`public/marketing/` and `public/buyer-catalogue/`:**
- Purpose: Static images, fonts, and HTML served from the site root. The `marketing/` prefix is excluded from middleware.
- Generated: Partly, by `scripts/marketing-assets.ts`
- Committed: Yes

**`docs/observability/`:**
- Purpose: Runbook text shown on Playbook IT pages, read at runtime
- Generated: No
- Committed: Yes

**`.planning/deliberations/`:**
- Purpose: Organizational doctrine documents read at runtime by the Playbook publication and adopt routes
- Generated: No
- Committed: Yes

**`playwright-report/` and `test-results/`:**
- Purpose: Playwright output
- Generated: Yes
- Committed: No (untracked in the current working tree)

**`tests/e2e/`:**
- Purpose: End-to-end Playwright specs
- Generated: No
- Committed: No (untracked in the current working tree)

**`.claude/` and `.agents/`:**
- Purpose: Agent configuration and skill definitions
- Generated: Partly (`skills-lock.json` at the root pins installed skills)
- Committed: Yes

---

*Structure analysis: 2026-10-18*
