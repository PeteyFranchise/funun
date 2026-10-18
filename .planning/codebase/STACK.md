# Technology Stack

**Analysis Date:** 2026-10-18

## Languages

**Primary:**
- TypeScript 5.5+ (`typescript` ^5.5.0, strict mode) - All application code: `app/`, `lib/`, `components/`, `types/`, `middleware.ts`, `instrumentation*.ts`, `sentry*.config.ts`, `scripts/*.ts`
- Config: `tsconfig.json` (target ES2017, `moduleResolution: bundler`, `jsx: preserve`, path alias `@/*` -> repo root)

**Secondary:**
- JavaScript (ESM and CJS) - `next.config.mjs`, `scripts/*.mjs` (e.g. `scripts/verify-beta-security-migrations.mjs`), `jest.config.js`, `jest.babel-plugins.js`, `postcss.config.js`
- SQL (PostgreSQL dialect) - 238 migrations in `supabase/migrations/` (numbered `NNN_*.sql`, latest `242_*`), plus `supabase/config.toml`
- Markdown is also used as runtime data: `docs/observability/*.md` and `.planning/deliberations/...` are read at request time (see `outputFileTracingIncludes` in `next.config.mjs`)

## Runtime

**Environment:**
- Node.js. No `.nvmrc`, `.node-version`, or `engines` field exists. CI pins Node 20 (`.github/workflows/quality.yml`, `node-version: 20`). `@types/node` is `^20.0.0`.
- Deployment runtime is Vercel serverless functions (see Platform Requirements). Routes run in the Node runtime, or in the Edge runtime for `middleware.ts`.

**Package Manager:**
- npm. Lockfile present: `package-lock.json` (committed).
- `package.json` `overrides` pin transitive versions: `next` -> `sharp` 0.35.5, `handlebars` ^4.7.10, `qs` 6.16.0, `postcss`, `nanoid` 3.3.18, `fast-uri` 3.1.8, `browserslist` 4.28.7, `brace-expansion` variants.
- Agent skills are installed via `skills-lock.json` (DocuSeal skills from `docusealco/docuseal-agent-skills`). Project skills live in `.agents/skills/` and `.claude/skills/`.

## Frameworks

**Core:**
- Next.js 15.5.27 (exact pin in `package.json`) - App Router with route groups `app/(artist)/`, `app/(auth)/`, `app/(industry)/`, `app/(admin)/`. About 338 `route.ts` handlers under `app/api/`. Server components fetch data; client components use `'use client'`.
- React ^18.3.0 and React DOM ^18.3.0 - UI. `@types/react` ^18.3.0.
- Tailwind CSS ^3.4.0 - styling via `tailwind.config.ts` (brand tokens) and `postcss.config.js` (tailwindcss, autoprefixer). PostCSS ^8.5.28.
- Zod ^3.23.0 - request and data validation in `lib/` and `app/api/`.
- React PDF `@react-pdf/renderer` ^4.5.1 - server-side PDF generation for split sheets, completion certificates, and vault documents (`lib/vault/pdf/`). Fonts are vendored under `assets/fonts/` and resolved at runtime.

**Testing:**
- Jest 30.5.1 (`jest` devDependency) with `ts-jest` ^29.4.11 for TypeScript. Config: `jest.config.js`. `@types/jest` ^30.0.0.
- `babel-jest` with `next/babel` transforms the ESM-only `@react-pdf` dependency tree (listed in `jest.config.js`) so it can load under CommonJS.
- Test files are co-located (e.g. `lib/phone.test.ts`, `lib/vault/pdf/split-sheet.test.ts`, `app/api/cron/daily-observability-check/route.test.ts`) and a top-level `__tests__/` directory exists.
- Playwright: no `@playwright/test` or `playwright` dependency is declared in `package.json`. Untracked `playwright-report/`, `test-results/`, and `tests/` directories exist at the repo root. Their contents are not analyzed here.

**Build/Dev:**
- `next build` / `next dev` / `next start` (npm scripts `build`, `dev`, `start`).
- Sentry build plugin via `withSentryConfig` in `next.config.mjs` (`@sentry/nextjs` ^10.70.0).
- ESLint 9.39.3 with `eslint-config-next` 15.5.24. The lint script runs with `ESLINT_USE_FLAT_CONFIG=false` and uses the legacy `.eslintrc.json` (`extends: next/core-web-vitals`). `.eslintignore` is present.
- `tsx` ^4.23.11 runs TypeScript scripts (`audit:gate`, `break-glass`, `marketing:*`, `playbook:activation-check`, `export:audition-sample`).
- Supabase CLI 2.116.0 (`supabase` devDependency). `db:types` regenerates `types/supabase.ts` from the local stack. `db:push` pushes migrations.
- `typecheck` (`tsc --noEmit`) and `typecheck:strict` (adds `--noUnusedLocals --noUnusedParameters`).
- `tsconfig.tsbuildinfo` (2.1 MB) is present at the repo root.

## Key Dependencies

**Critical (external service SDKs):**
- `@supabase/supabase-js` 2.109.0 - Database, Auth, Storage, Realtime client. Used in ~109 import sites.
- `@supabase/ssr` 0.10.0 - Cookie-based server clients in `lib/supabase/server.ts` and `middleware.ts`. The older `@supabase/auth-helpers-nextjs` is not in `package.json`.
- `@anthropic-ai/sdk` ^0.52.0 - Claude API. Imported directly by 12 modules (see INTEGRATIONS.md).
- `stripe` ^17.7.0 - Server SDK for Checkout, Connect, and webhook signature verification (`lib/stripe/`, `app/api/webhooks/stripe/route.ts`).
- `@stripe/stripe-js` ^4.0.0 - Browser loader for Stripe.js.
- `resend` ^4.0.0 - Transactional email (`lib/email/index.ts`).
- `svix` ^1.96.1 - Verifies Resend webhook signatures (`lib/webhooks/resend-verify.ts`).
- `@docuseal/react` ^1.0.75 - Embedded DocuSeal signing UI. The DocuSeal REST API is called with `fetch` (`lib/esign/docuseal.ts`), not an SDK.
- `@sentry/nextjs` ^10.70.0 - Error and trace reporting (`sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`).

**Infrastructure and document handling:**
- `node-id3` ^0.2.9 - Writes ID3 metadata into uploaded audio (`app/api/vault/[projectId]/tracks/[trackId]/metadata/embed/route.ts`).
- `archiver` ^8.0.0 - ZIP export (`lib/vault/export-assemble.ts`). `@types/archiver` ^8.0.0.
- `tus-js-client` ^4.3.1 - Resumable upload client for large audio files. The import site was not traced in this pass.
- `dompurify` ^3.4.16 - HTML sanitization.
- `react-markdown` ^10.1.0 and `remark-gfm` ^4.0.1 - Markdown rendering (Playbook and docs pages).
- `mermaid` ^11.17.2 - Diagram rendering. The import site was not located in this pass.
- `@dnd-kit/core` ^6.3.1, `@dnd-kit/sortable` ^10.0.0, `@dnd-kit/utilities` ^3.2.2 - Drag-and-drop ordering in the UI.

**Dev-only:**
- `@types/google.maps` ^3.65.2 - Typings for the Google Places autocomplete in `components/profile/AddressAutocomplete.tsx`.

## Configuration

**Environment:**
- Variables are read from `process.env` at runtime. `.env.example` at the repo root is the template and documents the names. Only `.env.example` exists at the repo root at analysis time. Real values belong in the Vercel project environment or a local `.env.local`, which is not committed.
- `NEXT_PUBLIC_*` variables are inlined into the browser bundle: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_VAULT_DEMO`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_GOOGLE_PLACES_KEY`.
- Server-only secrets must never carry a `NEXT_PUBLIC_` prefix. The full variable inventory is in INTEGRATIONS.md.
- Startup guards: `next.config.mjs` throws at build time if `NEXT_PUBLIC_VAULT_DEMO=true` while `NODE_ENV=production`. `lib/stripe/index.ts` throws at import if `STRIPE_SECRET_KEY` is unset. `lib/anthropic/index.ts` throws at import if `ANTHROPIC_API_KEY` is unset.
- Feature flags are environment-driven: `SONG_PASSPORT_ENABLED`, `SONG_PASSPORT_PILOT_ENABLED`, `SONG_PASSPORT_KILL_SWITCH`, `WORKSPACE_ACCESS_GENERAL_ENABLED`, `WORKSPACE_COHORT_PILOT_ENABLED`, `ENABLE_UI_PREVIEW`, `STAFF_AVATAR_SELF_EDIT`. The workspace kill switch lives in the database (`public.workspace_access_config`), not in env.

**Build and runtime config files:**
- `next.config.mjs` - Global security headers (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`). `outputFileTracingIncludes` forces bundling of `assets/fonts/**`, `docs/observability/**`, `assets/marketing/*`, and selected `.planning/deliberations/` markdown into serverless functions. `env` inlines `SENTRY_DSN` and `VERCEL_ENV` into the client bundle. `withSentryConfig` wraps the export.
- `middleware.ts` - Per-request CSP nonce, Supabase session refresh, and marketing root rewrite (`lib/marketing/rootRewrite.ts`).
- `vercel.json` - Eight cron schedules under `/api/cron/*` (see INTEGRATIONS.md). The `process-jobs` job runs every minute (`* * * * *`).
- `supabase/config.toml` - Local stack definition, `project_id = "funun"`. Realtime, Storage (including image transformation), Auth, and Studio are enabled locally.
- `tsconfig.json`, `.eslintrc.json`, `jest.config.js`, `tailwind.config.ts`, `postcss.config.js`, `next-env.d.ts`.
- `instrumentation.ts` - Next.js instrumentation hook. Loads `sentry.server.config.ts` for the Node runtime and `sentry.edge.config.ts` for the Edge runtime. Exports `onRequestError`.
- `.github/workflows/quality.yml` - CI job on pull requests and pushes to `main`. Runs `security:migrations:verify`, `typecheck:strict`, `lint`, `npm test -- --runInBand`, `npm audit --omit=dev --audit-level=moderate`, and `audit:gate`.
- `.github/workflows/close-completed-prs.yml` - Closes PRs labeled `completed`.

**Model configuration:**
- Anthropic model IDs are hard-coded in most call sites as `claude-sonnet-4-6`. The playbook assistant reads `ANTHROPIC_PLAYBOOK_MODEL` and falls back to `claude-sonnet-4-20250514`. `lib/anthropic/index.ts` exports a shared client and a `MODEL` constant (`claude-sonnet-4-20250514`), but no module imports it; `lib/tagging/ai-tag.ts` duplicates the model ID because of that import problem (per its own comment).
- OpenAI model IDs are read from env with code defaults in `lib/catalogue/lyric-lift-provider.ts`: `OPENAI_TRANSCRIPTION_MODEL` (default `gpt-transcribe`), `OPENAI_LYRIC_ALIGNMENT_MODEL` (default `whisper-1`), `OPENAI_LYRIC_STRUCTURE_MODEL` (default `gpt-5.6-sol`).

## Platform Requirements

**Development:**
- Node.js 20 (matches CI). npm.
- Supabase CLI for local migrations and type generation. `supabase/config.toml` drives the local stack.
- Repo-local `.env.local` populated from `.env.example`. Required for `next dev` because `lib/stripe/index.ts`, `lib/anthropic/index.ts`, and the Supabase clients read env at import or call time.
- Playwright and browsers are not declared in `package.json`, so any browser test run depends on tooling outside the lockfile.

**Production:**
- Vercel (Next.js serverless). `vercel.json` defines the cron jobs. `VERCEL_ENV` drives Sentry trace sampling (100% in preview, 15% otherwise). `VERCEL_PLAN_TIER` is read by the observability cron to decide whether to show the Spend Management note.
- Vercel Hobby plans limit cron jobs to once per day. The every-minute `process-jobs` schedule needs a plan that allows per-minute crons.
- Supabase hosted PostgreSQL, Auth, Storage, and Realtime. The production domain is `https://funun.studio` (see `NEXT_PUBLIC_APP_URL` in `.env.example`).
- Storage buckets referenced in code: `release-audio`, `release-assets`, `release-documents` (`lib/storage/index.ts`); `track-audio`, `vault-assets`, `vault-contracts` (migrations and `lib/vault/track-audio.ts`). The two naming sets are not reconciled in this pass.

---

*Stack analysis: 2026-10-18*
