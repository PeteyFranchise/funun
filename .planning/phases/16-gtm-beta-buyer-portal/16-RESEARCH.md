# Phase 16: GTM Beta Launch & Buyer Portal - Research

**Researched:** 2026-07-18
**Domain:** Buyer/org identity model, license-request & deal-pipeline schema, Stripe Connect marketplace payments, SignWell embedded e-sign, buyer portal + artist Deals room
**Confidence:** MEDIUM (internal architecture: HIGH — strong precedent in this codebase; external APIs: MEDIUM — official docs fetched directly, two integration mechanics flagged as open questions)

## Summary

Phase 16 is large but not architecturally novel — Funūn has already solved every hard sub-problem this phase needs, just for different account types. The buyer/org account model is a direct re-application of two existing precedents: the Wave 3 **curator** account (`app_metadata.role`-gated, magic-link, `handle_new_user()` **early-return** — no `artist_profiles` row) and the Wave 4 **industry member** admin-invite flow (`admin.createUser()` with atomic `app_metadata`/`user_metadata`, custom Resend email, no post-insert role UPDATE). Buyers should follow the **curator** pattern for `handle_new_user()` (early return, zero `artist_profiles` row — D-11's "fully separate" only holds if this is true) and the **industry-invite** pattern for the admin-creates-first-org-admin flow. Server-owned-write RLS doctrine (migrations 040/056/058: row RLS restricts rows, column GRANT restricts columns, service-role owns all state transitions) applies unchanged to `buyer_orgs`, `buyer_members`, and `license_requests`.

The two genuinely new external integrations are Stripe Connect (first payment-splitting code in this repo — today's `lib/stripe/index.ts` is a bare client singleton with no Connect, no webhook route, no checkout route at all) and SignWell (first live e-sign provider behind the already-built `lib/esign/provider.ts` abstraction, which today has zero vendor implementations). Both are well-documented, standard integrations, but two mechanics are **not conclusively resolved** by available documentation and are flagged as open questions rather than guessed at: (1) SignWell's exact webhook signature-verification header/scheme, and (2) whether to bill the buyer via a Stripe Invoice object or a Checkout Session — both achieve D-17/D-17a's split, they differ in buyer-facing UX and build surface.

**Primary recommendation:** Build buyer identity as a fully separate `app_metadata.role='buyer'` account type mirroring the curator early-return + industry admin-invite precedents exactly; use Stripe Connect **Express** accounts requesting only the `transfers` capability (never `card_payments` — the artist's connected account never charges anyone) with **destination charges** (one buyer, one connected account, one project — the exact case destination charges are built for); implement SignWell as a thin `fetch()`-based adapter behind the existing `EsignProvider` interface (no official Node SDK exists on npm — verified via registry search); and reuse the Phase 14 export-pack pipeline unchanged for buyer delivery rather than building a parallel export system.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Buyer/org identity, auth, permission tiers | API / Backend (Supabase Auth + service-role routes) | Database (RLS + column grants) | Mirrors curator/industry account creation — server-owned, no client-side account provisioning |
| Buyer portal browse/shortlist/dashboard UI | Frontend Server (SSR route group) | Browser/Client (interactive filters, shortlist toggles) | New `(buyer-portal)` route group, server-fetched + client-interactive, same split as `(artist)`/`(curator-portal)` |
| `license_requests` + deal-stage pipeline | API / Backend | Database (server-owned writes) | Stage transitions are authority actions (admin/system), not client-writable — mirrors `reports`/`dm_threads` doctrine |
| Pre-cleared terms (Marmoset five) + matching | API / Backend | Database (new 1:1 table) | Matching logic is a pure function consumed server-side before a request is ever shown to a buyer or artist |
| Stripe Connect onboarding + payment split | API / Backend (server-side Stripe SDK only) | — | Stripe secret key and Connect writes must never reach the browser; Stripe-hosted Account Links keep KYC UI off Funūn's servers too |
| SignWell embedded signing + webhook | API / Backend (server-side fetch + webhook route) | Browser/Client (iframe render only) | API key is server-only; the browser only ever renders a signed embedded URL, never talks to SignWell directly |
| Contract Locker handoff, export-pack unlock | API / Backend | Database (`vault_documents`, existing Storage buckets) | Reuses existing Phase 2/14 infrastructure — no new tier introduced |
| Artist Deals room + pre-cleared-terms settings | Frontend Server (SSR page under `(artist)`) | Browser/Client (settings form) | Same split as every other `(artist)` room (Vault, Contract Locker) |
| Admin negotiation queue / deal workflow | Frontend Server (SSR `(admin)` page) | API / Backend (`verifyAdmin()`-gated routes) | Mirrors `admin/reports`, `admin/verification` exactly |
| GTM beta metrics | API / Backend (aggregation queries) | Frontend Server (dashboard page) | Read-only aggregation over `license_requests`; no new tier |

## Project Constraints (from CLAUDE.md)

- TypeScript strict mode, `@/*` path aliases only (no relative `../` imports in shared code), 2-space indentation, no semicolons, named exports, `export type` for type exports.
- API routes: `export async function POST/GET/PATCH`, always `NextResponse.json(...)`, explicit field allowlists (never raw request-body assignment).
- Error handling: throw descriptive `Error` instances; no silent failures; best-effort side effects (notifications) wrapped in try/catch at the call site (see `lib/social/activity-emit.ts` convention) — new `lib/deals/notifications.ts` builders must follow this.
- Never `select('*')` against `artist_profiles` or any column-privilege-locked table from a session-bound client — this phase adds at least one more such table (`license_requests`) and must follow the same explicit-column-list discipline from day one, not retrofit it later like migration 040 had to.
- GSD workflow enforcement: no direct repo edits outside a GSD workflow — this is a planning research doc only, the actual build happens under `/gsd-execute-phase 16`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Original (2026-07-18 planning draft):**
- D-01: Phase 16 is a new post-Green-Room planning lane: GTM Beta Launch & Buyer Portal.
- D-02: The buyer/license-request gap should be solved with an integrated portal, not a long-lived manual intake form.
- D-03: Manual intake is allowed only as a temporary admin fallback or founder-assist path. It should write into the same tables and workflows as the portal, never a separate spreadsheet/system.
- D-04: Sync buyers are a distinct user audience with their own account capability, profile, verification, and permissions separate from artists and industry members.
- D-05: Buyer accounts should not automatically receive broad Green Room social privileges. Buyer messaging, profile access, and search depth should be gated by verification/trust state.
- D-06: The first buyer portal should optimize for Hook-style founder-led deals: fewer, higher-signal requests, structured rights terms, and fast legal/admin handoff.
- D-07: License requests should become first-class data: requested tracks/artists, usage context, territory, term, exclusivity, budget, need-by date, buyer identity, stage, owner, notes, and linked contract/document artifacts.
- D-08: Contract Locker should be the document destination for signed sync licenses and related legal PDFs. Phase 16 may link into Contract Locker but should not expand into the full Contract Locker Intelligence roadmap unless explicitly planned later.
- D-09: Trust & Safety from Phase 13 is a prerequisite for broad buyer visibility (shipped and merged 2026-07-18 — prerequisite satisfied).
- D-10: The GTM model should use real beta metrics before hiring an AE: 3-5 closed deals, request-to-quote time, quote-to-close rate, average sync fee, artist readiness pass rate, and buyer repeat/referral signal.

**Discuss-phase session (2026-07-18) — resolves former Q-01..Q-05:**

Buyer identity model (resolves Q-01, Q-02):
- D-11: Buyers are fully separate accounts — NOT a capability grant on the artist/industry account model — with a company/org layer: buyer orgs, individual buyer profiles linked to their org, and org-level admins who add employees with scoped buying permissions.
- D-12: Org origin for beta is Funūn-admin created: platform admins create the company record and the first org-admin invite from the admin panel. Self-serve org signup deferred post-beta.
- D-13: Per-member buying permissions are two tiers: `requester` (browse + submit requests) and `approver` (requester rights + approve terms/budget + sign off). Org admins are approvers with member management. Solo buyers are an auto-created single-member personal org where they are the admin — one data model, no special cases.
- D-13a: Activity attribution is dual-level, company always shown: every request/deal records the individual AND their org; artists always see which company is behind a request.

Verification gating (resolves Q-03):
- D-14: Verification is org-level only for beta: admin-created orgs are born verified; members inherit org verification. No per-member verification flow.
- D-14a: Default verified-buyer reach without artist opt-in: browse rights-ready catalog + submit license requests. No direct messaging, no non-public availability/contact signals.
- D-14b: Buyer↔artist communication is admin-mediated for beta (founder concierge). No request-scoped message threads, no DM unlock in Phase 16.
- D-14c: Org-shared shortlists: members can save tracks/artists to shortlists visible to their whole org. Invisible to artists.

Artist consent flow (resolves Q-04):
- D-15: Artists pre-clear terms per project rather than approving every request. Pre-clearable fields are the "Marmoset five": minimum fee, allowed usage/media types, territories, exclusivity yes/no, term length.
- D-15a: Requests that do NOT match a project's pre-cleared terms (or target a project with none set) route to admin negotiation first.
- D-15b: Artist-facing surface is a dedicated "Deals" sidebar room listing all license requests across the artist's projects with deal stages. Requests also emit Phase 10 notifications.

Beta portal scope (resolves Q-05):
- D-16: Catalog discovery is filtered browse: genre, mood/energy, vocals, usage cleared. NO free-text search ranking.
- D-16a: Buyer request tracking is an org dashboard with deal stages (submitted → in negotiation → terms agreed → contract → closed/declined), visible org-wide. Doubles as GTM-metrics substrate.

Deal flow model (2026-07-18 follow-up session):
- D-17 (money): Buyer pays Funūn, Funūn pays artist. Funūn invoices the buyer via Stripe, takes commission, pays out artist's net. Funūn is merchant of record.
- D-17a (payout): Stripe Connect from day one — artists onboard to Connect, payments auto-split. Connect onboarding is in scope for this phase.
- D-18 (contract): Funūn admin drafts from a standard sync-license template, executed via embedded e-sign. Signed PDF lands in Contract Locker (D-08).
- D-18a (e-sign provider): SignWell. Embedded signing pay-as-you-go (25 free API docs/mo, then ~$0.85/doc). Supersedes older Dropbox Sign docs; `docs/e-sign-integration.md` must be updated.
- D-19 (delivery): Through the portal, reusing Phase 14's Export pack. Once contract is signed, buyer's dashboard unlocks the export-pack download. No manual file sending.
- D-20 (commission): Commission % tracked on every deal — gross fee, Funūn commission %, artist net, feeding both the Stripe split and D-10 GTM metrics.

### Claude's Discretion

- Schema mechanics for buyer orgs/members/permissions (tables, RLS doctrine) — follow the column-privilege and server-owned-write precedents from migrations 040/056/058.
- Exact filter taxonomy for catalog browse (reuse metadata/genre vocabularies where they exist).
- Deal-stage state machine details beyond the named stages.
- Admin UI conventions — follow the `/admin` patterns established in 13-04/13-05 (verifyAdmin gate, admin sidebar).

### Deferred Ideas (OUT OF SCOPE)

- Self-serve buyer org signup (approval-queue or domain-verified) — post-beta; beta orgs are admin-created (D-12).
- Per-member buyer verification tiers and action-based verification escalation — beta uses org-level verification only (D-14).
- Request-scoped buyer↔artist message threads or DM unlock on accept — beta is admin-mediated (D-14b).
- Third "viewer" permission tier for buyer orgs (browse-only seats) — beta ships requester/approver only (D-13).
- Unifying buyer accounts with the Phase 15 capability model (one login holding artist+industry+buyer) — revisit post-beta.
- Free-text catalog search and ranking — beta is filtered browse only (D-16).
- Self-serve paid ad buying, targeting, budgets, Stripe billing, ad review, and ad analytics.
- Content ID direct partnership or fingerprinting build.
- Automated legal negotiation or legal advice.
- AE hiring automation, CRM replacement, or broad sales tooling before the first 3-5 closed deals.
</user_constraints>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` | ^17.7.0 (already installed; latest on npm is 22.3.2) [VERIFIED: npm registry — `npm view stripe version`] | Connect account creation, Account Links, PaymentIntent/Checkout destination charges, webhook verification | Already the project's only payment SDK; no version bump required — destination-charge params (`transfer_data`, `application_fee_amount`) and Connect account APIs are available on 17.x. A version bump is optional hygiene, not a phase blocker. |
| `@supabase/supabase-js` / `@supabase/auth-helpers-nextjs` | existing (2.45.0 / 0.10.0) | `admin.createUser()`, `generateLink()`, service-role queries for buyer identity | Exact mechanism already used twice (curator claim, industry invite) |
| `@react-pdf/renderer` | ^4.5.1 (already installed) | Render the standard sync-license PDF that gets uploaded to SignWell for signing | Already used for credits/metadata PDFs (`lib/vault/pdf/`) — reuse the same rendering approach instead of introducing a second PDF library |
| `zod` | ^3.23.0 (already installed) | Validate `license_requests` create payload (usage types, territories, dates) | Existing project-wide validation standard |

**No new npm packages are required for either external integration** (see Package Legitimacy Audit below).

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node built-in `crypto` (`createHmac`) | n/a | SignWell webhook signature verification once the exact scheme is confirmed against `developers.signwell.com` | Same approach as `lib/webhooks/resend-verify.ts`, adapted once SignWell's header name is confirmed (see Open Questions) |
| `stripe.webhooks.constructEvent()` | part of the `stripe` package | Stripe webhook signature verification | Stripe's own SDK method — do **not** reuse `svix` (already installed, but only applicable to Resend's svix-signed webhooks) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom fetch wrapper for SignWell | An unofficial npm SDK (`@signwell/cli` is a CLI, not a library; no `@signwell/sdk` exists) | Rejected — no first-party package exists, and depending on an unofficial third-party package for a legally load-bearing signing flow is worse than a small, auditable in-repo fetch wrapper (mirrors the project's own stated design in `lib/esign/provider.ts`: "No vendor SDK is imported here yet") |
| Destination charges | Separate charges and transfers | Rejected for Phase 16 — only needed when splitting ONE charge across MULTIPLE connected accounts (e.g. paying several composers directly per-payment); Phase 16's deal shape is always one buyer + one project (one connected account). Revisit only if a future phase pays collaborators directly via Connect instead of via the existing split-sheet system. |
| Stripe Connect Express | Stripe Connect Standard | Rejected — Standard gives the connected account (the artist) a full independent Stripe relationship and dispute/compliance ownership, which contradicts D-17 (Funūn is merchant of record in the middle of every deal) |
| Stripe Connect Express | Stripe Connect Custom | Rejected for beta — Custom makes the platform responsible for ALL onboarding UI and KYC data collection; far more compliance/engineering lift than a 3-5 deal founder-led beta justifies |

**Installation:**
No new packages to install. If a stripe version bump is desired for hygiene: `npm install stripe@^17.7.0` (already satisfied) — do not bump to a new major inside this phase unless a specific Connect API requires it (none identified).

**Version verification:** `npm view stripe version` → confirms `stripe` package resolves and the installed `17.7.0` is a valid, non-yanked version on the registry. [VERIFIED: npm registry]

## Package Legitimacy Audit

No new external packages are recommended for installation in this phase. Both new integrations are implemented against already-installed dependencies:

- **Stripe Connect** — uses the already-installed `stripe` npm package (17.7.0, installed and in `package.json` since before this phase).
- **SignWell** — has no official first-party Node/JS SDK on the npm registry. A registry search for `signwell` surfaced only: `@signwell/cli` (a CLI tool, not an importable library, published by a `signwell.com`-affiliated maintainer), `@signwell/mcp` (a Model Context Protocol server, irrelevant here), and several unrelated/unofficial third-party wrapper packages (`react-signwell-library`, `@pipedream/signwell`, `@xenterprises/fastify-xsignwell`, etc.) with no official affiliation. [VERIFIED: npm registry — `npm view signwell`/`npm view @signwell/sdk` both 404; `npm search` confirms no first-party SDK package exists]

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `stripe` (17.7.0) | npm | already installed, long-established (Stripe's official SDK) | very high | github.com/stripe/stripe-node | OK | Approved — already in use, no change needed |

**Packages removed due to [SLOP] verdict:** none — no unofficial SignWell package is being recommended in the first place, so there is nothing to remove.
**Packages flagged as suspicious [SUS]:** none.

*Recommendation for the planner:* do not add any `signwell`-named or `-esign`-named third-party npm dependency. Build the adapter as a plain `fetch()`-based module (`lib/esign/providers/signwell.ts`) matching the un-vendored design already described in `lib/esign/provider.ts`'s own top-of-file comment.

## Architecture Patterns

### System Architecture Diagram

```text
                          ┌───────────────────────────────────────────┐
                          │              Buyer (browser)               │
                          └───────────────┬─────────────────────────────┘
                                          │ signed-in session (app_metadata.role='buyer')
                                          ▼
                 ┌────────────────────────────────────────────────────────────┐
                 │            app/(buyer-portal)/  — own layout gate            │
                 │  catalog browse · shortlists · request composer · org dash   │
                 └───────────────┬───────────────────────┬──────────────────────┘
                                 │ fetch                  │ fetch
                                 ▼                         ▼
                 ┌───────────────────────────┐   ┌───────────────────────────────┐
                 │ GET /api/buyer/catalog     │   │ POST /api/buyer/requests      │
                 │ (filtered, rights-ready    │   │ (creates license_requests row,│
                 │  vault_projects only)      │   │  runs pre-cleared-terms match)│
                 └───────────────┬────────────┘   └───────────────┬────────────────┘
                                 │                                 │
                                 ▼                                 ▼
                 ┌──────────────────────────────────────────────────────────────┐
                 │                     Supabase (Postgres + RLS)                  │
                 │  vault_projects · project_license_terms · license_requests    │
                 │  buyer_orgs · buyer_members · buyer_shortlists                │
                 └───────────────┬───────────────────────┬──────────────────────┘
                                 │                         │ admin stage transitions
                                 ▼                         ▼
                 ┌───────────────────────────┐   ┌───────────────────────────────┐
                 │  app/(artist)/deals        │   │  app/(admin)/admin/deals       │
                 │  (read + notifications)    │   │  negotiation queue, assigns    │
                 └────────────────────────────┘   │  owner, edits commission,     │
                                                   │  triggers e-sign + payment     │
                                                   └───────────────┬────────────────┘
                                                                   │
                              ┌────────────────────────────────────┼──────────────────────────┐
                              ▼                                    ▼                           ▼
                  ┌───────────────────────┐          ┌─────────────────────────┐   ┌─────────────────────────┐
                  │ SignWell (server-side) │          │ Stripe Connect          │   │ vault_documents /       │
                  │ create embedded doc →  │          │ (Express, destination   │   │ Contract Locker         │
                  │ iframe signing URL     │          │  charge, application_   │   │ (signed PDF lands here, │
                  │ webhook → completed     │          │  fee_amount)            │   │  D-08)                  │
                  └───────────┬────────────┘          └────────────┬────────────┘   └─────────────────────────┘
                              │                                    │
                              ▼                                    ▼
                 POST /api/webhooks/esign               POST /api/webhooks/stripe
                 (raw-body-first verify, mirrors         (stripe.webhooks.constructEvent,
                  lib/webhooks/resend-verify.ts)          mirrors same raw-body-first order)
                              │                                    │
                              └──────────────┬─────────────────────┘
                                             ▼
                              license_requests.stage → 'closed'
                                             │
                                             ▼
                          POST /api/buyer/deals/[id]/export
                     (reuses lib/vault/export-pack.ts unchanged —
                      D-19 delivery unlock, buyer-scoped wrapper only)
```

### Recommended Project Structure

```
lib/
├── buyers/
│   ├── org.ts              # buyer_orgs/buyer_members CRUD, admin-invite + org-admin-invites-employee
│   ├── permissions.ts      # requester/approver checks (hasApproverRole(), mirrors lib/capabilities/check.ts style)
│   └── schema.ts           # BuyerOrg/BuyerMember types + label/value pairs (mirrors lib/curators/schema.ts pattern)
├── deals/
│   ├── schema.ts           # license_requests types, DEAL_STAGE_VALUES, usage/territory value lists
│   ├── matching.ts         # matchesPreclearedTerms() pure function (D-15/D-15a)
│   ├── commission.ts       # computeNetFee() pure function (D-20)
│   └── notifications.ts    # buildLicenseRequestNotification()/buildDealStageChangedNotification() builders
├── esign/
│   ├── provider.ts         # existing interface (unchanged contract, extend EsignState.provider union)
│   └── providers/
│       └── signwell.ts     # new: fetch()-based SignWell adapter implementing EsignProvider
└── stripe/
    ├── index.ts             # existing singleton client (unchanged)
    └── connect.ts           # new: createExpressAccount(), createAccountLink(), createDestinationCharge()

app/
├── (buyer-portal)/          # new route group, own layout.tsx (mirrors (curator-portal))
│   ├── layout.tsx
│   ├── catalog/page.tsx
│   ├── shortlists/page.tsx
│   ├── requests/page.tsx    # org dashboard, deal stages (D-16a)
│   └── requests/[id]/page.tsx
├── (artist)/
│   └── deals/
│       └── page.tsx         # new Deals sidebar room (D-15b)
├── (admin)/admin/
│   └── deals/page.tsx       # negotiation queue (mirrors admin/reports pattern)
└── api/
    ├── admin/buyer-orgs/route.ts          # admin creates org + first org-admin (mirrors admin/members)
    ├── admin/buyer-orgs/[id]/route.ts
    ├── admin/deals/[id]/route.ts           # stage transitions, commission edits, owner assignment
    ├── buyer/members/route.ts              # org-admin invites additional employees (D-13)
    ├── buyer/catalog/route.ts              # filtered rights-ready browse (D-16)
    ├── buyer/shortlists/route.ts           # D-14c
    ├── buyer/requests/route.ts             # create license_requests (buyer-facing)
    ├── buyer/deals/[id]/export/route.ts    # D-19 buyer-facing export unlock wrapper
    ├── vault/[projectId]/licensing/route.ts # artist pre-cleared terms CRUD (D-15)
    └── webhooks/
        ├── esign/route.ts    # SignWell webhook (raw-body-first)
        └── stripe/route.ts   # Stripe webhook (raw-body-first)
```

### Pattern 1: Curator-style early-return account (buyer identity, D-11)

**What:** A wholly separate `app_metadata.role`-gated account type that never receives an `artist_profiles` row.
**When to use:** Any account type whose data model must be fully isolated from the artist/industry identity table — exactly D-11's requirement.
**Example:**
```sql
-- Source: supabase/migrations/030_curators_pitch_history.sql + 039_handle_new_user_industry_branch.sql (in-repo precedent)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN
    RETURN NEW;  -- early return, no artist_profiles row
  END IF;

  -- NEW buyer branch (Phase 16) — same early-return shape as curator,
  -- NOT the industry branch's artist_profiles insert (D-11: fully separate).
  IF (NEW.raw_app_meta_data->>'role') = 'buyer' THEN
    RETURN NEW;
  END IF;

  IF (NEW.raw_app_meta_data->>'role') = 'industry' THEN
    INSERT INTO public.artist_profiles (id, member_type, ...) VALUES (...);
    RETURN NEW;
  END IF;

  INSERT INTO public.artist_profiles (id) VALUES (NEW.id);
  ...
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Pattern 2: Admin-created account with atomic role + custom invite email

**What:** Server-side `admin.createUser()` with `app_metadata.role` set **at creation time** (never a post-insert UPDATE), followed by `generateLink({type:'magiclink'})` and a custom Resend email — never Supabase's built-in invite template.
**When to use:** Admin creates the first buyer-org-admin (D-12); later, an org-admin (not a superuser) invites additional employees (D-13) using the same primitive, gated by org-membership instead of `is_admin`.
**Example:**
```typescript
// Source: lib/industry/createIndustryMember.ts (in-repo precedent — adapt for buyers)
const { data: created, error: createError } = await service.auth.admin.createUser({
  email,
  email_confirm: true,
  app_metadata: { role: 'buyer' },
  user_metadata: { display_name: displayName, buyer_org_id: orgId, buyer_role: 'approver' | 'requester' },
})
// ... generateLink({ type: 'magiclink', email }) + sendEmail(...) — identical shape to createIndustryMember()
```

### Pattern 3: Server-owned-write RLS doctrine (license_requests deal-stage transitions)

**What:** Row RLS controls which rows a client can see; a companion column-level `REVOKE`/`GRANT` in the *same migration* controls which columns; all authority-action writes (stage transitions, commission edits) are revoked from `authenticated` entirely and go through service-role API routes only.
**When to use:** Every new table this phase introduces (`buyer_orgs`, `buyer_members`, `license_requests`, `project_license_terms`, `buyer_shortlists`).
**Example:**
```sql
-- Source: supabase/migrations/056_harden_dm_write_privileges.sql + 058_trust_safety_schema.sql (in-repo precedent)
ALTER TABLE license_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buyer_org_members_select_own_org_requests" ON license_requests
  FOR SELECT TO authenticated
  USING (buyer_org_id IN (SELECT org_id FROM buyer_members WHERE user_id = auth.uid()));

-- Column lockdown — buyers should not read admin-only fields even on their own org's rows.
REVOKE SELECT ON license_requests FROM authenticated, anon;
GRANT SELECT (id, buyer_org_id, vault_project_id, usage_types, territories, term_months,
              exclusivity, budget_cents, need_by, stage, created_at)
  ON license_requests TO authenticated;

-- All INSERT (buyer creates a request) needs its own narrow policy; all UPDATE
-- (stage transitions, commission fields, owner assignment) is server-owned only.
REVOKE UPDATE ON license_requests FROM authenticated, anon;
```

### Pattern 4: Destination-charge Stripe Connect payment split

**What:** A single PaymentIntent (or Checkout Session in payment mode) on the platform account with `transfer_data[destination]` + `application_fee_amount`, computed server-side from the deal's stored `commission_pct` — never trust a client-supplied fee.
**When to use:** Every closed deal's buyer payment (D-17/D-17a/D-20).
**Example:**
```typescript
// Source: https://docs.stripe.com/connect/destination-charges (fetched 2026-07-18)
const grossCents = deal.gross_fee_cents
const applicationFeeCents = Math.round(grossCents * (deal.commission_pct / 100))
await stripe.paymentIntents.create({
  amount: grossCents,
  currency: 'usd',
  application_fee_amount: applicationFeeCents,
  transfer_data: { destination: artistConnectAccountId },
})
```

### Pattern 5: Express Connect account onboarding (transfers-only capability)

**What:** Create an Express connected account requesting **only** `transfers` (not `card_payments` — the artist never charges anyone directly; Funūn is always the merchant of record per D-17), then redirect to a Stripe-hosted Account Link.
**When to use:** Artist's first-time Connect onboarding, surfaced from Settings (a new "Payouts" section), gating only the payout step of the deal pipeline, not negotiation/signing.
**Example:**
```typescript
// Source: https://docs.stripe.com/connect/express-accounts (fetched 2026-07-18), capability narrowed for this app's shape
const account = await stripe.accounts.create({
  type: 'express',
  country: 'US',
  capabilities: { transfers: { requested: true } }, // NOT card_payments
})
const accountLink = await stripe.accountLinks.create({
  account: account.id,
  refresh_url: `${appUrl}/settings/payouts/refresh`,
  return_url: `${appUrl}/settings/payouts/return`,
  type: 'account_onboarding',
})
// redirect artist to accountLink.url — never emailed (Stripe's own docs warn against this)
```

### Pattern 6: Embedded SignWell document creation

**What:** POST to SignWell's Create Document endpoint with `embedded_signing: true` (disables email auth, enables iframe), `test_mode: true` in non-production environments, and the Funūn-generated sync-license PDF as the `files` payload (not a SignWell-hosted template) so the contract stays version-controlled in git.
**When to use:** Admin action "Send for signature" on a deal that has reached `terms_agreed`.
**Example:**
```typescript
// Source: https://developers.signwell.com/reference/createdocument (fetched 2026-07-18)
const res = await fetch('https://api.signwell.com/api/v1/documents', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', /* auth header — confirm exact name, see Open Questions */ },
  body: JSON.stringify({
    test_mode: process.env.NODE_ENV !== 'production',
    embedded_signing: true,
    draft: false,
    files: [{ name: 'sync-license.pdf', file_base64: pdfBase64 }],
    recipients: [
      { id: '1', name: artistName, email: artistEmail },
      { id: '2', name: buyerContactName, email: buyerContactEmail },
    ],
  }),
})
```

### Anti-Patterns to Avoid

- **Buyer accounts getting an `artist_profiles` row:** if `handle_new_user()`'s buyer branch is placed *after* the default artist-insert fallback, or omitted entirely, every buyer signup silently creates a bogus `artist_profiles` row — the exact bug class this codebase has already fixed twice (curator branch, industry branch). D-11's "fully separate" is not real unless this early return exists.
- **Trusting a client-supplied Stripe `application_fee_amount`:** always recompute from the server-stored `commission_pct` at charge-creation time.
- **Reusing `svix` for Stripe or SignWell webhook verification:** `svix` is already installed but is Resend-specific (Resend delivers webhooks via svix's infrastructure). Stripe has its own `stripe.webhooks.constructEvent()`; SignWell uses its own HMAC scheme. Applying `svix`'s `Webhook` class to either would silently misparse headers.
- **Parsing a webhook body with `.json()` before signature verification:** every webhook route in this phase must read the raw request body as text FIRST (mirrors `app/api/webhooks/resend/route.ts`), verify, then parse — a parsed-then-reserialized body will not byte-match what was signed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Legally defensible e-signature (audit trail, tamper-evidence, ESIGN/UETA) | A custom PDF + checkbox "I agree" flow | SignWell embedded signing | `docs/e-sign-integration.md` already documents why this needs a specialist provider — a homemade attestation checkbox has none of the evidentiary package courts expect |
| Payment splitting / connected-account payouts | A manual ledger + manual bank transfers to artists | Stripe Connect destination charges | Money movement, tax reporting (1099-K), and payout timing are exactly what Connect exists to solve; a manual ledger reintroduces reconciliation risk this phase's own D-20 commission tracking is trying to prevent |
| Webhook signature verification | A custom shared-secret string comparison | Each provider's documented verification (`stripe.webhooks.constructEvent`, SignWell's HMAC scheme) | Timing-attack-safe comparison and replay protection are already implemented correctly in the SDKs |
| Buyer account creation / magic-link invite | A new bespoke auth flow | The exact `admin.createUser()` + `generateLink()` + Resend-custom-email pattern already proven twice (curators, industry members) | A third, slightly different mechanism is pure risk with zero benefit — this codebase has already hit and fixed the phantom-row race and the atomic-role-assignment bug once each; don't re-litigate |
| Export-pack ZIP assembly under Vercel Hobby's 10s ceiling | A second, buyer-facing export pipeline | `lib/vault/export-pack.ts` + the existing `POST /api/vault/[projectId]/export` route's Storage-upload-then-signed-URL pattern, wrapped by a thin buyer-scoped route | Re-solving the Hobby-tier streaming constraint (never return archive bytes as the response body) is exactly the kind of subtle infra bug (Pitfall class) this phase should avoid reintroducing |
| "Is this project licensable" determination | A new standalone boolean flag that can drift from the real readiness pipeline | `readinessItemsForProject()` / `computeStage3()` (`lib/vault/readiness.ts`, `lib/vault/stage3.ts`) | The existing readiness system is the single source of truth for what "ready" means on a project; a parallel flag will desync the first time either pipeline changes |

**Key insight:** every "hard" problem in this phase (legal signature, payment splitting, account provisioning, large-file delivery, readiness gating) has already been solved either by a specialist vendor this phase is explicitly directed to integrate, or by existing code in this exact repository. The actual net-new engineering is the schema/glue connecting them — not any of the underlying hard problems themselves.

## Common Pitfalls

### Pitfall 1: Phantom `artist_profiles` row for buyer accounts
**What goes wrong:** A buyer signs up (or is admin-invited) and silently gets a real `artist_profiles` row with `member_type` unset/wrong, polluting every artist-facing query (readiness dashboards, People Search, Discover) with junk buyer rows.
**Why it happens:** `handle_new_user()`'s buyer branch is missing, placed after the default fallback, or the role isn't set atomically at `admin.createUser()` time.
**How to avoid:** Add the buyer branch as an early return, positioned before the curator/industry/default branches (order doesn't strictly matter since each is a distinct `IF` with `RETURN NEW`, but mirror the curator branch's exact shape). Set `app_metadata: { role: 'buyer' }` inside the same `admin.createUser()` call — never a post-insert `UPDATE`.
**Warning signs:** `SELECT COUNT(*) FROM artist_profiles WHERE id IN (SELECT id FROM auth.users WHERE raw_app_meta_data->>'role'='buyer')` returns > 0.

### Pitfall 2: Column-level grants forgotten on `license_requests`
**What goes wrong:** A buyer with valid API access can read internal admin fields (admin notes, owner assignment, raw negotiation history) on their own org's requests via direct PostgREST, even though the UI never displays them.
**Why it happens:** Row RLS (`buyer_org_id IN (...)`) is added without a companion column-level `REVOKE`/`GRANT` — exactly the historical bug documented in migration 040's own commit message ("RLS restricts rows, not columns").
**How to avoid:** Every migration that adds a private column to `license_requests` must ship its `REVOKE SELECT ... GRANT SELECT (explicit column list)` in the *same* migration, per the migration 040/058 convention.
**Warning signs:** A buyer session client can `select('*')` (or an unlisted column) against `license_requests` and get a 200, not a 42501.

### Pitfall 3: Direct authenticated UPDATE grants left open on deal-stage/commission fields
**What goes wrong:** A buyer (or a compromised buyer session) self-approves their own deal, or edits the commission percentage.
**Why it happens:** The table is RLS-enabled with a SELECT policy but no explicit `REVOKE UPDATE ... FROM authenticated`, so Supabase's default column-level UPDATE grant remains in effect.
**How to avoid:** Mirror migration 056's `dm_threads`/`dm_messages` hardening exactly: `REVOKE INSERT, UPDATE ON license_requests FROM authenticated` (except a narrow, explicitly-granted INSERT policy for buyer-initiated request creation); every stage/commission mutation goes through a service-role admin route.
**Warning signs:** A buyer's session-bound client can successfully `.update({ stage: 'closed' })` against their own request row.

### Pitfall 4: Buyer portal auth relying on `middleware.ts` instead of its own layout gate
**What goes wrong:** Either an unauthenticated visitor reaches a buyer route because `middleware.ts`'s `isProtected` array doesn't know about the new prefix, or a future "fix" adds the prefix to `isProtected` without teaching middleware about `app_metadata.role`, creating an inconsistent double-gate.
**Why it happens:** This codebase's existing curator-portal precedent deliberately keeps its route group OUT of `middleware.ts`'s `isProtected` array — the layout's own `getUser()` + role check is the sole authority (documented explicitly in `app/(curator-portal)/layout.tsx`'s own comment).
**How to avoid:** Do not add `(buyer-portal)`'s path prefix to `middleware.ts`. Write `app/(buyer-portal)/layout.tsx` with its own `getUser()` + `app_metadata.role === 'buyer'` check, redirecting to a buyer-specific landing (not `/signin`) — exact mirror of the curator-portal layout.
**Warning signs:** Any reliance on `middleware.ts` alone to protect a buyer route.

### Pitfall 5: Requesting `card_payments` capability on the artist's Connect account
**What goes wrong:** Unnecessary onboarding friction (more KYC fields collected than needed) and a larger compliance surface than the deal shape requires.
**Why it happens:** Most Stripe Connect marketplace tutorials default to requesting both `card_payments` and `transfers` because in their examples the connected account is often directly chargeable by the end customer. In Funūn's shape, the artist's connected account **never** charges anyone — Funūn (the platform) is always the merchant of record (D-17); the connected account only ever *receives* a transfer.
**How to avoid:** Request only `capabilities: { transfers: { requested: true } }` when creating the artist's Express account.
**Warning signs:** The Account Link's onboarding flow asks the artist for card-acceptance-related business details they have no reason to provide.

### Pitfall 6: Treating SignWell `test_mode` documents as production-valid
**What goes wrong:** A "signed" contract from staging/dev is treated as a real, legally binding sync license.
**Why it happens:** `test_mode: true` documents are fully functional for integration testing but explicitly not legally binding and don't count toward billing.
**How to avoid:** Gate `test_mode` strictly by `process.env.NODE_ENV !== 'production'` (or an explicit env flag), never a client-supplied parameter. Re-confirm with counsel before marketing "binding signature" in production, per `docs/e-sign-integration.md`'s own existing caveat.
**Warning signs:** A production deal's `document_data.esign` shows a document created with `test_mode: true`.

### Pitfall 7: `vault_documents.type` CHECK constraint silently rejecting sync-license documents
**What goes wrong:** Inserting a Contract Locker row with `type = 'sync_license'` fails at the database layer with a raw constraint-violation error the API route doesn't handle gracefully.
**Why it happens:** `vault_documents.type` (consumed by `lib/vault/stage3.ts`'s `Stage3ToolSlug`-adjacent document types: `split_sheet`, `hire_right`, `copyright_registration`, `sample_clearance`, etc.) needs a new value added via migration for sync-license contracts; this is easy to miss since Phase 16's "documents" conceptually feel adjacent to, but are a new category from, the existing Stage-3 document set.
**How to avoid:** Add a migration widening the `vault_documents.type` CHECK constraint (or confirm it's unconstrained — verify at build time) before the first sync-license document insert; write an explicit error-message branch in the e-sign-completion webhook handler if the insert fails.
**Warning signs:** `23514` (check_violation) Postgres errors on the e-sign webhook's document-insert path.

### Pitfall 8: Gating catalog browse behind `approver`-only
**What goes wrong:** Breaks D-13/D-14c's intended "scout saves (requester), approver reviews" shortlist workflow — plain requesters can't browse or save at all.
**Why it happens:** A natural (but wrong) assumption that only approvers, who can commit budget, should see the catalog.
**How to avoid:** D-14a is explicit: default verified-buyer reach (both tiers) is browse rights-ready catalog + submit requests. Only *terms/budget approval and sign-off* is approver-gated, not browse/save/request-creation.
**Warning signs:** A `requester`-tier test account gets a 403 on `GET /api/buyer/catalog` or `POST /api/buyer/shortlists`.

## Code Examples

### SignWell embedded document creation (see Pattern 6 above for full example)

### Stripe destination charge with computed commission (see Pattern 4 above for full example)

### Server-owned deal-stage transition (admin route)
```typescript
// New: app/api/admin/deals/[id]/route.ts — mirrors app/api/admin/verification pattern
// (lib/trust-safety/verification.ts's grantOrRevokeVerification shape)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  // explicit allowlist — never spread body directly into .update()
  const update: Record<string, unknown> = {}
  if (typeof body.stage === 'string' && DEAL_STAGE_VALUES.includes(body.stage)) update.stage = body.stage
  if (typeof body.commission_pct === 'number') update.commission_pct = body.commission_pct
  if (typeof body.owner_id === 'string') update.owner_id = body.owner_id

  const service = createServiceClient()
  const { data, error } = await service.from('license_requests').update(update).eq('id', id).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `docs/e-sign-integration.md` recommended Dropbox Sign (embedded signing gated behind ~$300/mo Standard API tier) | SignWell (D-18a) — pay-as-you-go embedded signing, 25 free docs/mo then ~$0.85/doc | 2026-07-18 discuss-phase follow-up session | `docs/e-sign-integration.md` must be rewritten (this is an explicit, locked instruction in D-18a, not optional cleanup); `lib/esign/provider.ts`'s `EsignState.provider` union type must add `'signwell'` |
| No payment/payout infrastructure beyond a bare Stripe client singleton for subscription-tier billing | Full Stripe Connect Express marketplace flow, first webhook route (`app/api/webhooks/stripe/`) in the project | This phase (net-new) | First Connect account-creation code, first Stripe webhook route, first `application_fee_amount`/`transfer_data` usage anywhere in the repo |

**Deprecated/outdated:**
- Dropbox Sign as the planned e-sign provider — explicitly superseded by D-18a; do not build a Dropbox Sign adapter in this phase.
- Stripe's newer "Accounts v2" API (configurable Merchant/Customer/Recipient roles referenced in some 2026 Stripe docs) was surfaced in search results as an emerging alternative to the classic `type: express` Accounts v1 API. [ASSUMED — not verified in depth this session] The classic `type: express` account-creation flow shown in Pattern 5 remains fully supported and is what the majority of current tutorials and the installed `stripe` SDK version use; recommend sticking with it for documentation-maturity and stability reasons rather than adopting the newer API surface mid-phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SignWell's webhook HMAC verification header/secret location — not confirmed via available search/fetch tools this session | Pattern 6 / Common Pitfalls | Webhook route ships without real signature verification, or the first live webhook fails outright. Recommend a direct read of `developers.signwell.com/reference`'s Webhooks section as the very first task of the SignWell integration plan, before writing the webhook route. |
| A2 | SignWell API authentication header name (`Authorization` vs a custom key header) — search confirmed "generate your API key" exists but not the exact request header | Pattern 6 | Low risk — first API call fails fast and is a one-line fix once confirmed against docs. |
| A3 | Whether to bill the buyer via a Stripe Invoice object or a Checkout Session (payment mode) with `payment_intent_data.transfer_data` — both achieve D-17/D-17a, not conclusively resolved which fits this exact B2B-invoiced-deal shape best | Standard Stack / Open Questions | Rework of the buyer-payment route if the wrong mechanism is built first; recommend the planner make this call explicitly (this research defaults to recommending Checkout Session for lower build surface at beta volume). |
| A4 | "Rights-ready" catalog-filter definition (readiness score ≥ 60 AND `computeStage3().canContinue` AND `is_public`) is a synthesized recommendation, not an existing single flag or a decision already locked in CONTEXT.md | Architecture Patterns / Open Questions | Buyers see either too few or too many projects in filtered browse if this threshold is wrong; recommend explicit user confirmation before implementation. |
| A5 | `license_requests` needs a join table (`license_request_tracks`) for multi-track requests rather than a `track_ids UUID[]` column — inferred from D-07's plural "requested tracks/artists," not explicitly specified | Architecture Patterns | Schema rework later if multi-track referential integrity/per-track matching is required and the array-column shape was built instead. |
| A6 | Per-project pre-cleared-terms settings UI extends the existing `app/(artist)/vault/[projectId]/rights/page.tsx` rather than a new dedicated route — a discretion call, not locked in CONTEXT.md | Architecture Patterns | UI rework during the `/gsd-ui-phase` step if the wrong surface is chosen. |
| A7 | Stripe's newer "Accounts v2" API is an emerging alternative but not yet the recommended path for this phase | State of the Art | Low risk — this is a "watch, don't adopt" note, not a build decision; using classic `type: express` is safe regardless. |

## Open Questions

1. **SignWell webhook signature verification scheme (header name, secret format).**
   - What we know: SignWell supports configurable webhooks for document viewed/signed/declined/completed events via its API, and third-party sources confirm it uses *some* HMAC scheme.
   - What's unclear: the exact header name and payload-signing convention.
   - Recommendation: the first task in the SignWell integration plan should be a direct doc-read of `developers.signwell.com/reference` (Webhooks section) — do not guess at a header name in code; if the docs are ambiguous, create a `checkpoint:human-verify` step to confirm against a real test webhook delivery before trusting the verification logic.

2. **Stripe buyer-payment mechanism: Invoice object vs. Checkout Session.**
   - What we know: both support Connect destination-charge parameters (`transfer_data`, `application_fee_amount`) on the underlying PaymentIntent.
   - What's unclear: which better fits a founder-led, admin-created, B2B sync-licensing deal (Invoice feels closer to buyer expectations for a formal deal; Checkout Session is less API surface to build correctly at beta volume).
   - Recommendation: default to Checkout Session (payment mode) for build simplicity given 3-5 deal beta volume; treat Stripe Invoicing as a fast-follow if real buyers ask for formal invoices/net terms.

3. **Exact "rights-ready" catalog-filter definition.**
   - What we know: the existing readiness pipeline (`readinessItemsForProject()`, `computeStage3()`, `vault_readiness_score`, `is_public`) already captures every dimension needed.
   - What's unclear: the exact threshold/combination CONTEXT.md hasn't locked (readiness ≥ 60? ≥ 80? plus which specific rights-status columns).
   - Recommendation: confirm with the user during planning/discuss before implementation; this research recommends `is_public = true AND vault_readiness_score >= 60 AND computeStage3().canContinue === true` as a starting synthesis.

4. **Multi-track license requests — join table vs. array column.**
   - What we know: D-07 says "requested tracks/artists" (plural).
   - What's unclear: whether a single request can span multiple tracks/projects, or is always scoped to one project (likely, given pre-cleared terms are per-project).
   - Recommendation: assume one request = one project (multiple tracks within that project via a `license_request_tracks` join table) unless the user says otherwise during planning.

5. **Buyer sign-in landing page — dedicated page vs. `/signin` with role-detection redirect.**
   - What we know: the curator precedent uses a dedicated `/curators/claim` landing, never `/signin`.
   - What's unclear: whether product wants a distinct buyer-branded sign-in experience or a unified one.
   - Recommendation: mirror the curator precedent (dedicated minimal landing) for consistency with existing account-type routing.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `STRIPE_SECRET_KEY` | Existing subscription billing + new Connect/destination-charge calls | ✓ (documented in INTEGRATIONS.md; used today by `lib/stripe/index.ts`) | n/a (secret, not versioned) | — |
| `STRIPE_WEBHOOK_SECRET` | New `POST /api/webhooks/stripe` signature verification | ✗ (no Stripe webhook route exists anywhere in the current codebase — confirmed via `find app/api/webhooks`) | — | None — this is a hard blocker for the payment-completion flow; must be provisioned (Stripe Dashboard → Webhooks) before the webhook route can go live. Sandbox/test-mode development can proceed using the Stripe CLI's local webhook forwarding (`stripe listen`) with a locally-generated signing secret in the interim. |
| `SIGNWELL_API_KEY` | All SignWell API calls | ✗ (not yet present; project currently has no e-sign vendor configured at all) | — | None with a fallback — required before any embedded-signing call can succeed. SignWell's free `test_mode` tier means a real (even free-tier) API key is still required; there is no keyless sandbox. |
| `SIGNWELL_WEBHOOK_SECRET` (exact env var name TBD pending A1) | e-sign completion webhook verification | ✗ | — | None — blocks the webhook route; confirm exact secret-retrieval mechanism against SignWell's dashboard/API during the SignWell integration plan. |
| `stripe` npm package | Connect account creation, charges | ✓ | 17.7.0 installed | — |
| SignWell official Node SDK | Would simplify SignWell integration | ✗ (does not exist — verified via npm registry search) | — | Plain `fetch()` wrapper (no fallback needed; this is the recommended primary approach, not a degraded fallback) |

**Missing dependencies with no fallback:**
- `STRIPE_WEBHOOK_SECRET`, `SIGNWELL_API_KEY`, `SIGNWELL_WEBHOOK_SECRET` — all three must be provisioned by the founder/admin (Stripe Dashboard, SignWell account settings) before the corresponding webhook/API routes can be exercised end-to-end in a live environment. Local/sandbox development can proceed with test-mode keys and the Stripe CLI's local webhook forwarder.

**Missing dependencies with fallback:**
- No official SignWell SDK exists, but this has a clean fallback (a small, auditable `fetch()`-based adapter) that is in fact the recommended approach, not a compromise.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest ^30.4.2 + ts-jest ^29.4.11 (transpile-only — `isolatedModules: true`, so `tsc --noEmit` must be run separately for type-level RED/GREEN contracts, per this project's established convention) |
| Config file | `jest.config.js` (existing) |
| Quick run command | `npx jest <pattern>` (e.g. `npx jest lib/deals`) |
| Full suite command | `npm test` (runs full Jest suite) |

### Phase Requirements → Test Map

No formal `REQUIREMENTS.md` IDs exist yet for Phase 16 (ROADMAP.md marks "Requirements: TBD (planning source: 16-CONTEXT.md decisions D-01 through D-10)"). Until requirement IDs are assigned during planning, tests should be organized around the locked decisions instead:

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|--------------|
| D-11 | `handle_new_user()` buyer branch never creates an `artist_profiles` row | unit (SQL fixture) / integration | new — `supabase/tests/` or a Jest integration harness against a local Supabase instance | ❌ Wave 0 |
| D-15/D-15a | `matchesPreclearedTerms()` correctly routes matched vs. unmatched requests | unit | `npx jest lib/deals/matching.test.ts` | ❌ Wave 0 |
| D-20 | `computeNetFee()` commission math is exact (no floating-point drift on cents) | unit | `npx jest lib/deals/commission.test.ts` | ❌ Wave 0 |
| D-13/D-14a | requester-tier accounts can browse/save but not approve/sign-off | integration (API route) | `npx jest app/api/buyer` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest <changed-area>` + `npx tsc --noEmit`
- **Per wave merge:** `npm test` (full suite) + `npm run lint`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `lib/deals/matching.test.ts` — pure-function tests for `matchesPreclearedTerms()` (D-15/D-15a matrix: no terms set, all five dimensions match, one dimension mismatches, budget below minimum)
- [ ] `lib/deals/commission.test.ts` — `computeNetFee()` rounding/edge cases (D-20)
- [ ] `lib/buyers/permissions.test.ts` — `hasApproverRole()`/`isOrgMember()` pure checks (D-13)
- [ ] A local-Supabase or SQL-fixture test confirming the `handle_new_user()` buyer branch (D-11) — this is the single highest-value regression test in the phase, given the exact bug class it's guarding against has recurred twice already in this codebase's history

*(No pre-existing test infrastructure covers any of this phase's new domain — this is a fully net-new area of the test suite.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes | Supabase Auth magic-link, `app_metadata.role` set atomically at `admin.createUser()` time (never client-writable) |
| V3 Session Management | yes | Existing Supabase cookie-session middleware; buyer portal route group uses its own layout-level gate (Pitfall 4), not middleware |
| V4 Access Control | yes | Row RLS (org-scoped) + column-level GRANT/REVOKE (migration 040/056/058 doctrine) + service-role-only writes for all authority actions (deal-stage transitions, commission edits, verification) |
| V5 Input Validation | yes | Zod schemas for `license_requests` create payload; explicit field allowlists on every PATCH route (no raw `request.json()` spread into `.update()`) |
| V6 Cryptography | yes | Webhook signature verification via each provider's own SDK/HMAC scheme (`stripe.webhooks.constructEvent`, SignWell's documented scheme once confirmed) — never hand-rolled string comparison |
| V9 Communications | yes | Stripe secret key, SignWell API key, and all webhook secrets are server-only env vars, never exposed via `NEXT_PUBLIC_*` |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Buyer self-approves own deal / edits commission via direct PostgREST | Tampering / Elevation of Privilege | `REVOKE UPDATE ON license_requests FROM authenticated` — all stage/commission writes server-owned (Pattern 3) |
| Forged Stripe/SignWell webhook triggering a fraudulent deal-close or payout | Spoofing | Raw-body-first signature verification before any DB write (mirrors `lib/webhooks/resend-verify.ts`); reject on verification failure with no partial processing |
| Buyer account created without atomic role assignment, briefly exposed to artist-only flows during the race window | Elevation of Privilege | `app_metadata.role` set inside the same `admin.createUser()` call, never a post-insert UPDATE (Pattern 2) |
| Internal admin negotiation notes leaked to buyer org via unrestricted column SELECT | Information Disclosure | Column-level GRANT allowlist on `license_requests` (Pattern 3 / Pitfall 2) |
| Client-supplied `application_fee_amount` inflating or zeroing platform commission | Tampering | Server computes `application_fee_amount` from the deal's stored `commission_pct` at charge time; never accepted from request body (Pitfall 5's sibling concern) |
| Stripe Connect connected-account fraud (a bad-actor "artist" onboarding solely to receive fraudulent payouts) | Repudiation / platform liability | Rely on Stripe-hosted Account Links for KYC (never build a custom identity-collection form) — keeps the platform's own PII-handling and fraud-vetting compliance surface minimal, per Stripe's documented platform-responsibility model |

## Sources

### Primary (HIGH confidence — in-repo precedent, directly read this session)
- `lib/esign/provider.ts` — existing `EsignProvider` interface, `readEsignState()`/`allSigned()` helpers
- `docs/e-sign-integration.md` — existing Dropbox Sign vs. DocuSign comparison doc (must be rewritten per D-18a)
- `lib/curators/*`, `app/(curator-portal)/layout.tsx`, `app/api/curators/claim/[token]/route.ts` — separate-account precedent for buyer identity
- `lib/industry/createIndustryMember.ts`, `app/api/admin/members/route.ts` — admin-invite precedent
- `supabase/migrations/030, 031, 039, 040, 056, 058` — RLS/column-privilege/server-owned-write doctrine
- `lib/vault/export-pack.ts`, `app/api/vault/[projectId]/export/route.ts` — Export Pack pipeline (D-19 reuse target)
- `lib/vault/readiness.ts`, `lib/vault/stage3.ts` — readiness/"rights-ready" source of truth
- `lib/stripe/index.ts` — existing (minimal) Stripe client
- `lib/webhooks/resend-verify.ts`, `app/api/webhooks/resend/route.ts` — raw-body-first webhook verification precedent
- `lib/social/notifications.ts` — notification-builder pattern for the new Deals notifications
- `components/nav/ArtistNav.tsx`, `app/(admin)/layout.tsx` — nav/admin-sidebar patterns

### Secondary (MEDIUM confidence — official docs fetched directly this session)
- [SignWell Create Document reference](https://developers.signwell.com/reference/createdocument) — `embedded_signing`, `test_mode`, `draft` params
- [Stripe: Using Express connected accounts](https://docs.stripe.com/connect/express-accounts) — account creation, capabilities, Account Links onboarding flow
- [Stripe: Create destination charges](https://docs.stripe.com/connect/destination-charges) — `transfer_data`, `application_fee_amount`, refund/dispute liability
- npm registry checks: `npm view stripe version`, `npm view signwell version` (404), `npm view @signwell/sdk version` (404), `npm search signwell`

### Tertiary (LOW confidence — WebSearch only, flagged in Assumptions Log/Open Questions)
- SignWell webhook signature/HMAC scheme details (header name unconfirmed)
- Stripe Invoice vs. Checkout Session recommendation for this exact B2B deal shape
- Stripe Connect platform compliance/liability summary (synthesized from search snippets of `support.stripe.com`/`docs.stripe.com`, not fetched directly)
- Stripe "Accounts v2" API mention (flagged as emerging, not adopted)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages needed; existing `stripe` install confirmed live on the registry, SignWell's lack of an official SDK independently confirmed via direct registry queries
- Architecture (buyer identity, RLS doctrine, notification/nav patterns): HIGH — every pattern has a working, shipped precedent in this exact codebase
- Architecture (Stripe Connect, SignWell specifics): MEDIUM — official docs fetched directly for the core mechanics; two specific mechanics (webhook signature scheme, Invoice-vs-Checkout choice) remain open questions
- Pitfalls: HIGH — most are direct extrapolations of bug classes this codebase has already hit and fixed at least once (phantom rows, atomic role assignment, column-privilege gaps, raw-body-first webhook verification)

**Research date:** 2026-07-18
**Valid until:** 30 days for internal architecture guidance (stable); 14 days for the two flagged external-API open questions (SignWell webhook scheme, Stripe billing mechanism) — re-verify directly against `developers.signwell.com` and `docs.stripe.com` immediately before implementation regardless of this window, since those two facts were not conclusively confirmed this session.
