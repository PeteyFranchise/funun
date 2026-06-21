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

## Getting started

```bash
git clone https://github.com/YOUR_USERNAME/funun.git
cd funun
npm install
cp .env.example .env.local
npx supabase link --project-ref YOUR_REF
npx supabase db push
npm run dev
```

---

Built by Pete — multi-platinum songwriter, 15 years in the music industry.
