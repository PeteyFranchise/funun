# Technology Stack

**Analysis Date:** 2026-06-26

## Languages

**Primary:**
- TypeScript 5.5.0 - Full application codebase, server components, API routes, type safety

**Secondary:**
- JavaScript - Configuration files, build setup
- SQL - Supabase migrations and database layer

## Runtime

**Environment:**
- Node.js (no specific version pinned; inferred from Next.js 15 compatibility)

**Package Manager:**
- npm (as specified in package.json scripts)
- Lockfile: package-lock.json (standard npm)

## Frameworks

**Core:**
- Next.js 15.0.0 - Full-stack React framework, API routes, server components, authentication middleware
- React 18.3.0 - UI component library and rendering
- React DOM 18.3.0 - DOM binding for React

**Styling & Layout:**
- Tailwind CSS 3.4.0 - Utility-first CSS framework with custom design tokens
- PostCSS 8.4.0 - CSS processing pipeline
- Autoprefixer 10.4.0 - Browser compatibility for CSS

**Authentication & Database:**
- Supabase (via `@supabase/supabase-js` 2.45.0) - PostgreSQL database and auth backend
- `@supabase/auth-helpers-nextjs` 0.10.0 - Supabase Auth integration with Next.js server/client
- Cookie-based session management through Supabase auth flow

**Validation & Schemas:**
- Zod 3.23.0 - TypeScript-first schema validation for API inputs, profiles, and data models

**Testing/Development:**
- ESLint 8.57.0 - Linting with Next.js config
- TypeScript 5.5.0 - Type checking (strict mode enabled)
- No test framework in dependencies (testing infrastructure not detected)

## Key Dependencies

**Critical:**
- `@anthropic-ai/sdk` 0.52.0 - Claude API integration for AI-powered tools (PitchPlug, contract verification)
- `@supabase/supabase-js` 2.45.0 - Core database, real-time subscriptions, storage, auth client
- `stripe` 17.7.0 - Server-side Stripe payment processing
- `@stripe/stripe-js` 4.0.0 - Client-side Stripe.js for payment forms
- `resend` 4.0.0 - Email delivery service for notifications and pitch confirmations
- `node-id3` 0.2.9 - ID3 tag reading/writing for audio metadata extraction

**Infrastructure:**
- `supabase` 1.200.0 - CLI for local development, migrations, and database type generation
- `next` 15.0.0 - Server rendering, static generation, API routes, image optimization

## Configuration

**Environment:**
- Environment variables (see INTEGRATIONS.md for required keys)
- `.env.example` exists but `.env.local` contains actual configuration (secrets not committed)
- `NEXT_PUBLIC_*` prefixed variables exposed to browser runtime

**Build:**
- `next.config.mjs` - Minimal Next.js config (default settings)
- `tsconfig.json` - TypeScript configuration with strict mode, path aliases `@/*`
- `tailwind.config.ts` - Custom design tokens for Funūn brand (ink, card, lav, gradients, money colors)
- `postcss.config.js` - PostCSS plugins (tailwindcss, autoprefixer)

## Platform Requirements

**Development:**
- Node.js compatible with Next.js 15
- PostgreSQL-compatible database (via Supabase)
- npm for dependency management
- Supabase CLI for local development (`supabase` package installed)

**Production:**
- Deployment target: Vercel (Next.js standard hosting)
- PostgreSQL database (Supabase production instance)
- Environment secrets configured in deployment platform
- Anthropic API access for AI features
- Stripe API keys for payment processing
- Resend API key for email delivery

**Storage:**
- Supabase Storage buckets for audio, assets, and documents (up to 250MB per track)

---

*Stack analysis: 2026-06-26*
