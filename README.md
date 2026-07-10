# Funūn

The operating system for an independent music career — built around **Sound Vault**.

---

## The core idea

Sound Vault is the heart of Funūn. It's the place where an artist's entire discography lives — every single, snippet, EP, album, and unreleased project they've ever made. Not just the releases that are out. Everything.

Every tool, every community interaction, every pitch, and every opportunity flows through Sound Vault. It's the first platform that treats an artist's creative output as a permanent, structured archive — not a list of uploads.

```
                    ┌─────────────────────────┐
                    │                         │
    Tool Library ──►│      SOUND VAULT        │◄── The Antenna
   (feeds assets)   │                         │    (live matches)
                    │  Singles  ·  Snippets   │
    Community ────►│  EPs  ·  Albums          │───► The Pitch
   (peer review)    │  Unreleased             │    (industry pros)
                    │                         │
                    │  Full discography        │
                    │  Legal documentation     │
                    │  Submission history      │
                    │  Vault Readiness Score   │
                    └─────────────────────────┘
```

---

## Five project types in Sound Vault

| Type | What it is | Key tools |
|---|---|---|
| **Single** | One track, full release package | DropReady, PitchPlug, SplitSheet |
| **Snippet** | 15–60 second social media clip | LyricCard Studio, SoundBait, DropReady |
| **EP** | 3–6 track project | DropCalendar, EPK.fyi, PitchPlug |
| **Album** | Full project, complete discography entry | All tools, full legal gate |
| **Unreleased** | Demos, works in progress, shelved ideas | SplitSheet, CopyrightKit |

Snippets are a first-class project type — short-form content specifically built for social media promotion, with their own readiness checklist and tool connections. No other platform treats social media content as a structured creative project.

---

## The Vault Readiness Score

Every project in Sound Vault has a calculated 0–100 readiness score. The score gates all submissions — artists cannot distribute, pitch industry professionals, or apply to Antenna opportunities below the required threshold. Each missing item links directly to the tool that generates it.

| Item | Points | Tool |
|---|---|---|
| Audio files uploaded | 10 | — |
| Artwork / visual asset | 10 | LyricCard Studio |
| Split sheets signed | 15 | SplitSheet |
| Copyright registered | 15 | CopyrightKit |
| ISRC codes assigned | 10 | — |
| PRO registration confirmed | 10 | RoyaltyAudit |
| Producer agreements signed | 10 | HireRight |
| EPK complete | 10 | EPK.fyi |
| Metadata optimised | 10 | PressBit / DistroAdvisor |
| **Total** | **100** | |

Snippets have a simplified readiness checklist — visual asset, caption copy, and platform strategy. No distribution documentation required.

---

## Platform architecture

```
funun/
│
├── app/
│   ├── (marketing)/              # Public pages
│   │   ├── page.tsx              # Homepage
│   │   ├── pricing/
│   │   ├── features/
│   │   └── for-industry/
│   │
│   ├── (auth)/
│   │   ├── signin/
│   │   ├── signup/
│   │   └── onboarding/
│   │
│   ├── (artist)/
│   │   ├── dashboard/            # Active projects overview
│   │   ├── vault/                # SOUND VAULT — full discography
│   │   │   ├── page.tsx          # All projects, all types
│   │   │   ├── new/              # Create new vault project
│   │   │   └── [projectId]/      # Individual project room
│   │   │       ├── page.tsx      # Overview + Vault Readiness Score
│   │   │       ├── tracks/       # Audio + metadata
│   │   │       ├── assets/       # Artwork + visuals
│   │   │       ├── documents/    # Legal docs
│   │   │       ├── tools/        # Tool outputs for this project
│   │   │       ├── distribute/   # Send to distributors
│   │   │       ├── pitch/        # Pitch to industry
│   │   │       └── campaign/     # Promo calendar
│   │   ├── tools/[toolSlug]/
│   │   ├── community/
│   │   ├── antenna/
│   │   └── settings/
│   │
│   ├── (industry)/
│   │   ├── dashboard/
│   │   ├── inbox/
│   │   ├── search/
│   │   └── profile/
│   │
│   └── api/
│       ├── vault/                # Vault project CRUD
│       ├── tracks/
│       ├── assets/
│       ├── documents/
│       ├── tools/[toolSlug]/
│       ├── submissions/
│       ├── pitches/
│       ├── community/
│       ├── antenna/
│       ├── stripe/
│       └── user/
│
├── lib/
│   ├── supabase/
│   ├── stripe/
│   ├── anthropic/
│   ├── tools/
│   ├── vault/                    # Vault readiness + utilities
│   ├── storage/
│   └── matching/
│
├── types/index.ts
├── supabase/migrations/
├── middleware.ts
└── package.json
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind |
| Auth | Supabase Auth |
| Database | Supabase (PostgreSQL) with RLS |
| File Storage | Supabase Storage (audio up to 250MB, artwork up to 10MB) |
| Payments | Stripe (subscriptions + pitch credits) |
| AI | Anthropic API — server-side only |
| Email | Resend |
| Hosting | Vercel |

---

## Subscription tiers

| Tier | Price | Tools | Pitches/month | Community | Antenna |
|---|---|---|---|---|---|
| Free | $0 | 3 core tools | 2 | Read only | — |
| Pro | $19/mo | All 28 tools | 20 | Full access | Matched only |
| Studio | $29/mo | All 28 tools | Unlimited | Full + Pete's Table | Full access |
| Founding | $99 lifetime | All tools forever | Unlimited | Full + Pete's Table | Full access |

---

## Local setup

**Prerequisites:** Node.js 18.18+ (Next.js 15), npm, and a Supabase account/project.

```bash
# 1. Clone and install
git clone https://github.com/PeteyFranchise/funun.git
cd funun
npm install

# 2. Configure environment
cp .env.example .env.local
# Then open .env.local and fill in real values (see "Environment variables" below).
# Never commit .env.local — it is gitignored.

# 3. Sync the database schema (optional for UI work; required for backend)
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:push        # applies supabase/migrations
npm run db:types       # regenerates types/supabase.ts

# 4. Run the dev server
npm run dev            # http://localhost:3000
```

### Environment variables

All keys live in [`.env.example`](.env.example). Copy it to `.env.local` and fill in
values from the respective dashboards. Secrets are **never** committed — ask Pete for
them via a secure channel (password manager / encrypted message), not over GitHub.

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
| `ANTHROPIC_API_KEY` | Anthropic Console (server-side only) |
| `STRIPE_*`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Resend Dashboard |
| `DDEX_DPID` | DDEX Party ID (optional; placeholder used if unset) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally · `https://funun.studio` in prod |
| `NEXT_PUBLIC_VAULT_DEMO` | leave unset/`false`; `true` enables demo mode (no real backend) |

### Common scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the local dev server |
| `npm run build` | Production build |
| `npm run lint` | Lint with ESLint |
| `npm run db:push` | Apply Supabase migrations |
| `npm run db:types` | Regenerate Supabase TypeScript types |

### Contributing workflow

Production auto-deploys from `main` via Vercel, so don't push directly to `main`.
Branch, open a PR, and merge once it builds green:

```bash
git checkout -b feature/your-change
# ...commit work...
git push -u origin feature/your-change
# open a PR against main
```

---

## Authentication

Email/password auth via **Supabase Auth**, with confirmation and password-reset emails
delivered through **Resend** (custom SMTP configured in the Supabase dashboard). All keys
come from environment variables — no secrets are committed.

### Flows

| Flow | Page | Supabase call |
|---|---|---|
| Sign up | `/signup` | `signUp({ email, password, options: { emailRedirectTo } })` — sends a confirmation email; session stays `null` until the user verifies |
| Email confirmation | `/auth/callback` | `exchangeCodeForSession(code)` — verifies the `?code=` link, then redirects into the app |
| Sign in | `/signin` | `signInWithPassword({ email, password })` |
| Sign out | `SignOutButton` | `signOut()` |
| Forgot password | `/forgot-password` | `resetPasswordForEmail(email, { redirectTo: .../auth/callback?next=/update-password })` |
| Set new password | `/update-password` | `updateUser({ password })` (reached via the recovery link → `/auth/callback` → here) |

Route protection lives in [`middleware.ts`](middleware.ts): `/vault`, `/dashboard`,
`/settings`, `/collaborators`, `/split-sheets`, `/launchpad`, and `/admin` require a session;
`/signin`, `/signup`, and `/forgot-password` bounce signed-in users to `/vault`;
`/update-password` stays reachable during the temporary recovery session.

### Required env vars

| Variable | Where it goes | Source |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` (browser-exposed) | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` (browser-exposed) | Supabase → Project Settings → API → `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` (server-only, never exposed) | Supabase → Project Settings → API → `service_role` key |
| `NEXT_PUBLIC_APP_URL` | `.env.local` | `http://localhost:3000` locally · `https://funun.studio` in prod — used to build reset-email redirect URLs |

### Supabase dashboard config (one-time, not in code)

**Authentication → Emails → SMTP:** Resend, verified sender `noreply@auth.funun.studio`
(display name **Funún**), host `smtp.resend.com`, port `465`, username `resend`, password =
a Resend API key.

**Authentication → URL Configuration:**
- **Site URL:** `https://funun.studio` (production). This is the fallback redirect *and* the
  `{{ .SiteURL }}` template variable in the auth emails — never leave it as `localhost` on a
  production project.
- **Redirect URLs allowlist** (production entries always; add the localhost pair only if you
  test locally):
  ```
  https://funun.studio/auth/callback
  https://funun.studio/update-password
  http://localhost:3000/auth/callback      # dev only
  http://localhost:3000/update-password    # dev only
  ```
  Supabase matches the base path and ignores the `?next=…` query string, so the `/auth/callback`
  entry covers `/auth/callback?next=/update-password`. The `/update-password` entries are a
  defensive fallback for the hash-fragment recovery flow.

### How to test

**Signup + email confirmation**
1. Go to `/signup`, register with a real inbox you control.
2. You should see "Check your email." A confirmation email arrives from **Funún
   `<noreply@auth.funun.studio>`**.
3. Click the link → it hits `/auth/callback`, the session is created, and you land in `/vault`.

**Password reset**
1. Go to `/signin` → **Forgot password?** → `/forgot-password`.
2. Enter the account email → "If an account exists… we've sent a reset link."
3. The recovery email arrives (same sender). Click it → `/auth/callback` exchanges the code →
   you land on `/update-password` with an active recovery session.
4. Set a new password → confirmation → auto-redirect to `/vault`. Sign out and sign back in
   with the new password to confirm.

**Verify email delivery**
- **Resend → Emails/Logs:** each confirmation/reset send appears with delivery status. No row =
  Supabase never called SMTP (check the SMTP config) or the address was rate-limited.
- **Supabase → Authentication → Audit Logs / Users:** shows the auth event (user created,
  recovery requested) independent of email delivery.
- A stuck "Check your email" with nothing in Resend usually means the SMTP password (Resend API
  key) is wrong or the sender domain isn't verified in Resend.

---

Built by Pete — multi-platinum songwriter, 15 years in the music industry.
