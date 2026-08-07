# Phase 23: Buyer Onboarding · Model A + Buyer Account Model + Login/Register Modal + Public Browse - Research

**Researched:** 2026-08-07
**Domain:** Next.js 15 App Router auth/onboarding surfaces, Supabase RLS/RPC schema extension, service-role provisioning routes, cross-account lead routing
**Confidence:** HIGH (this phase is almost entirely additive to a live, well-documented Phase 16/25 substrate — very little is genuinely novel)

## Summary

Phase 23 is a **thin, mostly-UI phase over a schema and RBAC substrate that already exists and is already live in production.** Phase 16 shipped `buyer_orgs`/`buyer_members` with a two-tier role model (`requester`/`approver`) and RLS that already scopes `license_requests` to **every member of an org**, not just the row's creator — meaning the CONTEXT.md's open question #3 ("cross-company purchase visibility... spend-approver role") is **already ~90% solved by existing code** (`app/(buyer-portal)/buyers/requests/page.tsx` + migration 081's `license_requests_select_buyer_org_or_project_owner` RLS policy). Phase 25 (now shipped) added `buyer_orgs.ae_user_id`, staff RBAC (`requireStaff`), assignment-scoped admin routes, and lead-routing notification builders (`lib/staff/notifications.ts`) whose buyer-signup call site is **explicitly documented as unwired, waiting for this phase**. Phase 23's real work is: (1) a new light-touch **register** write path that creates a `buyer_orgs` row + first member in a `pending_onboarding` state (new column, new migration); (2) a Funūn-branded login/register **modal** mirroring the existing License-modal/scrim idiom already in `CatalogBrowserLight.tsx`; (3) opening `/buyers/catalog` (soon `/sync/catalog`, see below) to logged-out visitors while keeping any *engagement* (License/shortlist) gated behind the modal; (4) wiring the already-built `buildLeadRoutedNotification`/`resolveLeadRecipient` call site; and (5) per a **newer, same-day ROADMAP decision that supersedes 23-CONTEXT.md's file scope**, renaming the buyer route namespace from `/buyers/*` to `/sync/*` and adding a `/sync` marketing landing page — cheap now because no production buyer URLs exist yet.

The single largest **genuine gap** this research surfaces (not called out in CONTEXT.md) is an **auth-mechanism mismatch**: the CONTEXT.md's locked design explicitly wants an email/password modal ("email/password, remember-me... forgot-password"), but every buyer account today authenticates via **Supabase magic link only** (`signInWithOtp`, `app/buyers/access/page.tsx`) — buyers never set a password, and the shared `/forgot-password → /update-password` flow hard-redirects to `/vault` on success, which is wrong for a buyer. This must be resolved during planning (see Pitfall 1 and Open Question 7 answer below), not discovered during execution.

**Primary recommendation:** Add buyer-side password auth (buyers set a password via the same `generateLink`/magic-link invite flow, landing on a buyer-aware "set your password" step) OR keep magic-link-only login for the modal and drop the password/remember-me/forgot-password chrome from the Marmoset mirror for v1 — the CONTEXT.md's Marmoset-fidelity decision and the codebase's actual buyer-auth mechanism are in conflict and a planner cannot resolve this silently; flag it as a discuss-phase item if not already settled.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Public catalogue browse (logged-out) | Frontend Server (SSR) | Database | `app/(buyer-portal)/buyers/catalog/page.tsx` server component reads via service-role `loadCatalogPage`; no client-side privacy logic |
| Login/Register modal UI + client state | Browser / Client | — | `'use client'` component, mirrors `CatalogBrowserLight`'s existing scrim/modal pattern |
| Account creation (buyer_orgs + buyer_members write) | API / Backend | Database | Must go through a service-role route — migration 080 REVOKEs INSERT on both tables from `authenticated`/`anon` |
| Session creation (login) | API / Backend | Browser / Client | Supabase Auth (either `signInWithPassword` or `signInWithOtp`) — client SDK call, server sets cookies via `@supabase/auth-helpers-nextjs` |
| AE assignment + lead routing | API / Backend | Database | Already-shipped `requireStaff`-gated routes (`/api/admin/buyer-orgs/[id]/ae`) + `lib/staff/notifications.ts` builders |
| Cross-company purchase visibility (spend-approver oversight) | Database (RLS) | Frontend Server (SSR) | Already enforced at the RLS layer (migration 081); the SSR page just renders what RLS already returns |
| `pending_onboarding` → `active` status transition | Database | API / Backend | New column + CHECK constraint; transition written by staff route (AE completing onboarding) |
| Public preview audio | Browser / Client | — | Still simulated per Phase 22 (`components/buyer/CatalogBrowserLight.tsx` playhead is a `setInterval`, no real `<audio>` element) — no server change needed to keep it public |

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

- **Light-touch Register creates a buyer company account** — minimum viable info is **work email + phone**; that's enough to create the account. NOT a bare lead (earlier framing), and NOT full self-serve access: the account is created, then an **AE completes onboarding**.
- Both **"Register"** and **"Talk to a sales rep"** doors feed this same flow (two front doors, one pipeline).
- Funūn can **create + manage/edit** buyer accounts from the Funūn side — **access-gated by staff permission** (Phase 25: only permissioned staff create buyer accounts / edit scoped portions). Staff can also create a buyer account outright (AE onboards a client they sourced), not only via the buyer-initiated register flow.
- **Buyer company account model:** **Company-scoped** (org-first, B2B). A company has **multiple members** (people who make music purchases).
- **Cross-company purchase visibility:** members can see **what's happening across their company** — who is purchasing what. Critical for the person **green-lighting spend**.
- Implies a **spend-approver / company-admin role** (sees all company purchases, oversees spend) distinct from an individual purchaser role.
- **Very different from artist (user) accounts** — its own account type, shape, and admin tooling. Do not reuse the artist-profile model.
- **AE assignment:** Every buyer company is assigned **one AE** (a Funūn employee) by leadership → relationship-driven sales. Depends on **Phase 25**. Model A can **stub** AE (e.g. a nullable assignment) until Phase 25 lands. **(NOTE — this research supersedes the stub: Phase 25 is SHIPPED. Use real AE assignment, not a stub.)**
- **Public browse:** Catalogue becomes **browsable logged-out**. A logged-out visitor can **browse + play previews**; any **engagement** (shortlist / License) pops the modal ("create an account"). Email + phone is enough to create one.
- **Lead / notification routing:** A new-buyer signup lands in an **admin queue**; once Phase 25 exists (it does), it ALSO routes to the assigned **AE's / BD's in-app account** + a **Resend email** — part of the team's daily human systems. Capture fields (B2B qualifying): **company, contact name, work email, phone, role, use-case** (agency / film-TV / brand / other).
- **Design:** Funūn light `.fnbl` modal mirroring the Marmoset reference (Login title, email/password, remember-me, gradient Submit, forgot-password, divider, Register CTA), Funūn-branded, plus a **"Talk to a sales rep"** path, Funūn wordmark. Opens over the browse (scrim, like the License modal in `CatalogBrowserLight.tsx`).
- **Logo:** Adopt one of the 5 wordmark explorations (`~/Desktop/Fununbuyerbrowse/FUNUN Logo Exploration.html`).

### Claude's Discretion

None explicitly delegated in 23-CONTEXT.md beyond the 7 open questions below — treat the open questions as the discretion surface, informed by this research's findings.

### Deferred Ideas (OUT OF SCOPE)

- Self-serve **instant** buyer accounts, subscription/checkout, transact-gate → **Phase 24 (Model B)**.
- Funūn **employee accounts** backing AE assignment → **Phase 25 (now shipped — no longer deferred, now a real dependency)**.
- Sync-library **supply** (what songs exist to buy) → **Phase 26**.
- OAuth/SSO buyer login.

</user_constraints>

## Critical Update Since 23-CONTEXT.md Was Written

23-CONTEXT.md predates two facts now true in the live codebase and ROADMAP.md — the planner must treat both as real scope, not options:

1. **Phase 25 is SHIPPED to production** (STATE.md, 2026-08-07). `buyer_orgs.ae_user_id` (migration 090), `getStaffRole`/`requireStaff` (`lib/admin/gate.ts`), `funun_staff`, `staff_audit_log`, `/api/admin/buyer-orgs` (GET/POST), `/api/admin/buyer-orgs/[id]` (PATCH), `/api/admin/buyer-orgs/[id]/ae` (PATCH), and the lead-routing notification builders in `lib/staff/notifications.ts` all exist and are live. **Do not stub AE assignment — wire the real thing.**
2. **ROADMAP.md (§"Account Taxonomy & Green Room Access", owner-confirmed 2026-08-05, same day as 23-CONTEXT.md) locks a `/sync` namespace decision that 23-CONTEXT.md's canonical_refs do not mention:** the entire buyer world — landing page, browse, portal — moves from `/buyers/*` to `funun.studio/sync/*` (path now, `sync.funun.studio` subdomain later via a single rewrite). ROADMAP.md states explicitly: *"NOTE... Folds into Phase 23."* Internal names stay unchanged (`buyer_orgs`, `components/buyer`, `/api/buyer/*`, `buyer_members`) — this is a route/label rename only, done now specifically because *"Phase 22 catalog is the only existing code, no production URLs / real buyers yet."* A `/sync` landing page (hero, value prop, featured catalogue, Browse + Log in/Request-access CTAs) does not exist yet and must be built new.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.45.0 (pinned, in use) | Auth (`signInWithPassword`/`signInWithOtp`), DB client | Already the project's sole DB/auth layer — no alternative considered |
| `@supabase/auth-helpers-nextjs` | 0.10.0 (pinned, in use) | Cookie-based session in middleware/server components | Already wired into every existing auth surface |
| `next` | 15.0.0 (pinned, in use) | Route groups, server components, API routes | Existing framework |
| `resend` | 4.0.0 (pinned, in use) | Lead-routing email + buyer invite email | Already the project's only transactional-email provider (`lib/email/index.ts`) |
| `zod` | 3.23.0 (pinned, in use) | Register-form payload validation | Project convention (`lib/deals/schema.ts`, etc.) — no new validation library needed |

**No new npm packages are required for this phase.** Every capability (email/phone capture, modal state, service-role writes, notification fan-out) is achievable with what's already installed. `EMAIL_REGEX` (`app/api/admin/buyer-orgs/route.ts:7`) is the existing project convention for email validation; phone is stored as free-form text everywhere in this codebase (`tracks.metadata.composers[].phone`, `artist_profiles.contact_phone`) with **no** validation library used anywhere — follow that precedent rather than introducing a phone-format package.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| — | — | — | No supporting libraries identified as necessary |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Free-text phone capture | `libphonenumber-js` for E.164 validation | Adds a dependency for a field the rest of the codebase treats as free text; only justified if Phase 23 explicitly wants stricter validation than every other phone field in the app — recommend NOT adding it, for consistency |
| Custom register-form state machine | React Hook Form | Every existing Funūn form (License modal, admin org-create, profile settings) is hand-rolled `useState` — introducing a form library here would be the only place in the codebase using one |

**Installation:** none required.

**Version verification:** No new packages recommended; existing pinned versions (`package.json`) confirmed current for this codebase's conventions — no registry check needed since nothing new is installed.

## Package Legitimacy Audit

**Not applicable — this phase installs no external packages.** Every capability is built from libraries already present in `package.json` and already used by neighboring buyer-portal/staff code (Phases 16/22/25). If a planner later decides to add a phone-validation or form library, run the Package Legitimacy Gate protocol against it before adding it to a plan.

**Packages removed due to [SLOP] verdict:** none — no new packages considered.
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────────────────┐
                     │   Logged-out visitor                     │
                     └───────────────┬───────────────────────────┘
                                     │ GET /sync  (new landing page)
                                     ▼
                     ┌─────────────────────────────────────────┐
                     │  /sync landing (hero, value prop,         │
                     │  featured catalogue teaser)                │
                     │  → "Browse" CTA   → "Log in" CTA           │
                     └───────┬─────────────────────┬─────────────┘
                             │                       │
             GET /sync/catalog                 opens modal
                             │                       │
                             ▼                       ▼
      ┌───────────────────────────────┐   ┌─────────────────────────────┐
      │ CatalogPage (SSR, no          │   │ LoginRegisterModal (client)  │
      │  redirect for anon users)      │   │  - Login tab (email/pass     │
      │  → loadCatalogPage() via       │   │    OR magic link — DECIDE)   │
      │    service-role client         │   │  - Register tab (co/contact/ │
      │  → CatalogBrowserLight          │   │    email/phone/role/use-case)│
      │    isPublic=true                │   │  - "Talk to a sales rep"     │
      └───────────┬────────────────────┘   │    (same form, different     │
                  │ user clicks             │    framing copy)             │
                  │ License/shortlist        └──────────────┬───────────────┘
                  │ while logged out                          │
                  ▼                                            │ POST /api/sync/register
      ┌───────────────────────────┐                            │  (new route)
      │  Modal pops (same          │◄───────────────────────────┘
      │  component, "create an     │
      │  account to continue")     │
      └────────────┬────────────────┘
                    │
                    ▼
      ┌──────────────────────────────────────────────────────────┐
      │ POST /api/sync/register  (new — service-role, unauthenticated) │
      │  1. buyer_orgs.insert({ name, status:'pending_onboarding',      │
      │       use_case, ... })                                          │
      │  2. createBuyerAccount({ ...buyerRole:'approver',                │
      │       isOrgAdmin:true })  — reuses lib/buyers/createBuyerAccount │
      │  3. best-effort: resolveLeadRecipient(org, leadershipFallback)   │
      │     → createNotification(buildLeadRoutedNotification(...))       │
      │     → also lands in an admin queue (buyer_orgs WHERE              │
      │       status='pending_onboarding' AND ae_user_id IS NULL)         │
      └───────────────────────┬──────────────────────────────────────────┘
                              │
                              ▼
      ┌──────────────────────────────────────────────────────────┐
      │ Funūn Team Console (existing, Phase 25)                   │
      │  /admin/buyer-orgs (leadership) or                         │
      │  /admin/my-client-partners (AE/BD scoped)                  │
      │  → leadership assigns AE (PATCH .../ae, already live)       │
      │  → AE completes onboarding → status flips to 'active'       │
      │    (new PATCH, staff-only, mirrors STAFF_EDITABLE_BUYER_ORG │
      │     _FIELDS convention)                                     │
      └──────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
app/
├── sync/                                   # NEW route group (was app/buyers/*)
│   ├── page.tsx                            # NEW — /sync landing page
│   ├── catalog/page.tsx                    # moved from (buyer-portal)/buyers/catalog, opened to public
│   ├── requests/**                         # moved from (buyer-portal)/buyers/requests
│   └── shortlists/page.tsx                 # moved from (buyer-portal)/buyers/shortlists
├── api/
│   └── sync/
│       └── register/route.ts               # NEW — unauthenticated POST, creates buyer_orgs + first member
components/
└── buyer/
    ├── LoginRegisterModal.tsx              # NEW — Login/Register/Talk-to-sales, .fnbl themed
    └── CatalogBrowserLight.tsx             # EXTENDED — wire the isPublic Login button to the new modal
lib/
├── buyers/
│   ├── schema.ts                           # EXTENDED — BuyerOrg status field, register-form types
│   ├── register.ts                         # NEW — pure buildRegisterPayload/validate (mirrors buildRequestBody)
│   └── createBuyerAccount.ts               # REUSED unchanged for the first org-admin account
└── staff/
    └── notifications.ts                    # WIRE the already-built buildLeadRoutedNotification call site
supabase/migrations/
└── 092_buyer_org_lead_fields.sql           # NEW — status column + qualifying fields (human-gated push)
```

### Pattern 1: Server-owned write for an unauthenticated register endpoint

**What:** `POST /api/sync/register` must run entirely on the service-role client since the caller has no session at all — there is no RLS row to scope to. This is a *new* shape in this codebase (every existing buyer-account-creation route, `POST /api/admin/buyer-orgs`, is staff-authenticated first via `requireStaff`). The register route is the **first unauthenticated write path** in the buyer domain.
**When to use:** Any public "create an account" form.
**Example:**
```typescript
// New file, modeled on app/api/admin/buyer-orgs/route.ts's POST handler
// (createBuyerAccount reused unchanged) but WITHOUT requireStaff() —
// replace the staff gate with strict allowlist validation + rate limiting.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  // ... strict field validation (company, contactName, email, phone, role, useCase) ...
  const service = createServiceClient()
  const { data: org } = await service
    .from('buyer_orgs')
    .insert({ name: orgName, status: 'pending_onboarding', use_case: useCase })
    .select(ORG_COLUMNS)
    .single()
  const { userId } = await createBuyerAccount({
    email, displayName: contactName, orgId: org.id,
    buyerRole: 'approver', isOrgAdmin: true,
  })
  // best-effort lead routing (Phase 25 hook, lib/staff/notifications.ts)
  const leadershipFallbackId = await resolveLeadershipFallback(service)
  await createNotification(service, buildLeadRoutedNotification({
    recipientId: resolveLeadRecipient(org, leadershipFallbackId),
    orgId: org.id, orgName: org.name,
  })).catch(() => {})
  return NextResponse.json({ data: { orgId: org.id } }, { status: 201 })
}
```

### Pattern 2: The License-modal/scrim idiom, reused for login/register

**What:** `CatalogBrowserLight.tsx:474-557` already implements the exact scrim + modal + form pattern the new Login/Register modal should copy: `<div className="scrim open">` wrapping a `<form className="modal">` with `.mh`/`.mb2`/`.mf` sections, an `x` close button, and inline error state (`.err`). CSS classes already exist in `CatalogBrowserLight`'s `CSS` constant (`.scrim`, `.modal`, `.fld`, `.f2`) — reuse them rather than inventing new modal chrome.
**When to use:** The new `LoginRegisterModal` component.
**Example:**
```typescript
// components/buyer/CatalogBrowserLight.tsx:321 — today a no-op button:
{isPublic && <button className="navlink" type="button">...Login</button>}
// becomes:
{isPublic && <button className="navlink" type="button" onClick={() => setAuthModalOpen(true)}>...Login</button>}
// and the License-modal-gated engagement actions (setModalId(row.id) at
// lines 435/467) must check auth state first when isPublic:
onClick={() => (isPublic ? setAuthModalOpen(true) : setModalId(row.id))}
```

### Pattern 3: `pending_onboarding` → `active` as a staff-editable field, not a new endpoint shape

**What:** `app/api/admin/buyer-orgs/[id]/route.ts` already has the exact allowlist-PATCH shape needed — `STAFF_EDITABLE_BUYER_ORG_FIELDS` currently `['name']` and its own comment says *"Phase 23 is expected to add company-profile columns... extend this list then, not before."* Add `status` (and the new qualifying fields, if staff-editable) to that allowlist rather than building a parallel status-transition route.
**When to use:** The AE's "mark onboarding complete" action.
**Example:**
```typescript
// app/api/admin/buyer-orgs/[id]/route.ts:16
const STAFF_EDITABLE_BUYER_ORG_FIELDS = ['name', 'status', 'use_case'] as const
// status writes should still validate against the CHECK constraint
// ('pending_onboarding'|'active') before reaching the DB, mirroring the
// existing string-trim validation loop just below.
```

### Anti-Patterns to Avoid

- **Reusing `user_profiles`/artist-profile shape for buyer contact fields:** CONTEXT.md explicitly forbids this ("Very different from artist accounts — its own account type"), and migration 080's own commentary repeatedly stresses the buyer branch is a **fully separate, no-profile-row** account type. Do not add a `user_profiles` row for buyers under any circumstance.
- **Passing an anonymous/empty `buyerUserId` into `loadCatalogPage`:** see Pitfall 3 below — this will throw a Postgres `invalid input syntax for type uuid` error, not silently return empty.
- **Building a new admin queue table:** an admin queue is just `buyer_orgs WHERE status = 'pending_onboarding' AND ae_user_id IS NULL` read through the already-existing `GET /api/admin/buyer-orgs` (leadership sees all; AE/BD see only their assigned orgs — extend the query with an `.is('ae_user_id', null)` branch for leadership's "unassigned queue" view, don't build a parallel table).
- **A second `handle_new_user()` edit for this phase:** the buyer branch (early-return, no profile row) already exists and is correct (migration 086 restored it after Phase 28 briefly regressed it). Register-flow accounts go through `createBuyerAccount()` exactly like admin-created ones — no trigger changes needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Buyer account creation (auth user + org membership row + invite email) | A new provisioning function | `lib/buyers/createBuyerAccount.ts` unchanged | Already handles the GoTrue app_metadata-timing race (deletes any phantom `user_profiles`/`subscriptions` rows), already sends the Resend invite, already distinguishes `DuplicateBuyerAccountError` |
| Org-membership recursion-safe RLS check | A new SECURITY DEFINER helper | `is_buyer_org_member(org_id, uid)` (migration 080) | Already exists, already the precedent-following recursion-avoidance pattern (migration 064/078) |
| Cross-company purchase visibility | A new query/view | `license_requests_select_buyer_org_or_project_owner` RLS policy (migration 081) + `app/(buyer-portal)/buyers/requests/page.tsx` | Already returns every org member's requests to every org member — CONTEXT.md's open question #3 is functionally answered already |
| Lead/AE notification | A new notification pipeline | `lib/staff/notifications.ts`'s `buildLeadRoutedNotification`/`resolveLeadRecipient` + `lib/notifications/index.ts`'s `createNotification` | Purpose-built for this exact call site by Phase 25, documented as unwired and waiting |
| Staff role gating on any new admin route | A bespoke `is_admin` check | `requireStaff(['leadership','ae','bd'])` (`lib/admin/gate.ts`) | Single authority (D-01); do not add a parallel auth path |
| Assignment-scoped edit checks | A new predicate | `isAssignedToOrg()` (`lib/staff/scope.ts`) | Pure, fail-closed, already unit-tested precedent |

**Key insight:** This phase's "hard parts" (org schema, RLS, staff RBAC, lead routing, cross-company visibility) were **already built by Phases 16 and 25** specifically anticipating this phase. The actual net-new surface area is narrow: a public landing/browse experience, one modal component, one register endpoint, and one new migration for lead-qualifying fields + status. Treat any plan that re-derives buyer schema/RLS/RBAC from scratch as over-scoped.

## Runtime State Inventory

> This phase is additive (new columns, new route, new component) rather than a rename/refactor — but the ROADMAP-mandated `/buyers/* → /sync/*` route rename **is** a rename and needs this inventory.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | No stored data references the string `/buyers/` as a value (checked: `buyer_orgs`, `buyer_members`, `license_requests`, `notifications.link` columns like `'/admin/client-partners/${orgId}'` reference `/admin/*`, not `/buyers/*`) — the only literal `/buyers/access` and `/buyers/catalog` strings are in-code `redirect()` calls and `<Link href>` targets. | Code edit only, no data migration. |
| Live service config | None — no Vercel/DNS/webhook config references `/buyers/*` paths (ROADMAP explicitly notes "no production URLs / real buyers yet" as the reason this rename is cheap now). | None. |
| OS-registered state | None. | None. |
| Secrets/env vars | None — `RESEND_FROM_EMAIL`/`RESEND_API_KEY` are provider-level, not path-scoped. | None. |
| Build artifacts | None. | None. |

**Grep-confirmed route-literal call sites that must move together** (found via `grep -rn "/buyers/"`): `app/(buyer-portal)/layout.tsx` (`redirect('/buyers/access')` ×1, `redirect('/')` fallback), `app/(buyer-portal)/buyers/catalog/page.tsx` (`redirect('/buyers/access')`), `app/(buyer-portal)/buyers/requests/page.tsx` and `new/page.tsx` (`redirect('/buyers/access')`), `components/buyer/BuyerTopNav.tsx` (`href="/buyers/catalog"`, `/buyers/shortlists`, `/buyers/requests`), `app/buyers/access/page.tsx` itself. All are plain string literals — a careful find/replace plus a manual verification pass (not a blind sed) is sufficient; no data-layer implication.

## Common Pitfalls

### Pitfall 1: Buyer login is magic-link only — the CONTEXT.md modal design assumes password auth

**What goes wrong:** `app/buyers/access/page.tsx` calls `supabase.auth.signInWithOtp(...)` — there is no password field anywhere in the buyer auth surface, and `createBuyerAccount()` never sets a password (it calls `generateLink({ type: 'magiclink' })`). CONTEXT.md's locked Design decision explicitly wants "email/password, remember-me... forgot-password" (a literal Marmoset mirror). Building that UI verbatim would ship a password field that has no backing mechanism for existing buyer accounts.
**Why it happens:** CONTEXT.md was written from a design reference (Marmoset screenshot) without cross-checking the shipped Phase 16 auth mechanism.
**How to avoid:** Planner must pick one explicitly (this is a real product decision, not an implementation detail — surface it to the user if not already settled):
  - **(a)** Add password support: `createBuyerAccount`'s `generateLink` call switches to a recovery-style link that lands on a buyer-aware "set your password" page (new, mirrors `/update-password` but must NOT hardcode `router.push('/vault')` on success — see Pitfall 2), and the modal's Login tab uses `signInWithPassword`. Remember-me is a `localStorage` UX affordance only (Supabase sessions already persist via cookies by default) — no backend work.
  - **(b)** Keep magic-link-only login: modal's "Login" tab collects just an email and calls `signInWithOtp`, showing a "check your email" state (reuse the exact UX already in `app/buyers/access/page.tsx`). Drop the password/remember-me/forgot-password chrome from the Marmoset mirror for v1, note the deviation.
**Warning signs:** A plan that adds a password `<input>` to the modal without also touching `createBuyerAccount.ts`'s `generateLink` call and the post-recovery redirect.

### Pitfall 2: `/auth/callback` and `/update-password` hardcode `/vault` as the success destination

**What goes wrong:** `app/auth/callback/route.ts:11` defaults `next` to `/vault`; `app/(auth)/update-password/page.tsx:67` hardcodes `router.push('/vault')` after a successful password update. A buyer completing a password-reset (or password-set, if Pitfall 1's option (a) is chosen) flow would be dropped on the artist Sound Vault, not the buyer portal — and `(buyer-portal)/layout.tsx` would then bounce them right back out via its own `app_metadata.role !== 'buyer'` check on `/vault` (wait — `/vault` is a *different* route group, so no bounce occurs; the buyer would just land on an artist page with no `user_profiles` row, likely erroring).
**Why it happens:** These flows were built artist-first, before any buyer password flow existed.
**How to avoid:** If Pitfall 1's option (a) is chosen, make the post-recovery/post-set-password destination role-aware exactly like `postSignInPath()` already does for sign-in (`lib/auth/postSignInPath.ts` — extend it or mirror its pattern: check `app_metadata.role === 'buyer'` → `/sync/catalog`, else existing logic).
**Warning signs:** A buyer reports being sent to a blank/erroring page after setting a password.

### Pitfall 3: `loadCatalogPage(service, buyerUserId, ...)` will throw for an anonymous visitor, not degrade gracefully

**What goes wrong:** `lib/deals/catalog-query.ts:112` calls `loadBlockedIds(service, buyerUserId)`, which builds `.or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`)` against a `uuid` column. Passing an empty string (or any non-UUID sentinel) as `buyerUserId` for a logged-out visitor produces a Postgres `invalid input syntax for type uuid` error, not an empty result set.
**Why it happens:** `loadCatalogPage` was built exclusively for authenticated buyer sessions (Phase 16); nothing in its signature anticipates a null/anonymous caller.
**How to avoid:** Add a public-safe branch: either (a) make `buyerUserId: string | null` and skip the `loadBlockedIds` call entirely when null (blocks are meaningless for a visitor with no account, since `blocks` rows only ever reference real `auth.users` ids — an anonymous visitor can neither block nor be blocked), or (b) add a small `loadCatalogPagePublic()` wrapper that omits the block-exclusion step. Do this in `lib/deals/catalog-query.ts` so both `GET /api/buyer/catalog` (if it's ever opened to anon) and the SSR catalog page share the fix — mirrors the file's own existing "single implementation, no drift" doctrine.
**Warning signs:** `/sync/catalog` 500s for logged-out visitors while working fine when logged in.

### Pitfall 4: The `ae_assigned`/`ae_unassigned` notification link points at a page that doesn't exist yet

**What goes wrong:** `lib/staff/notifications.ts:68,93,115` builds `link: '/admin/client-partners/${orgId}'` for all three notification types (including the new `lead_routed` this phase wires up). No route at `/admin/client-partners/[orgId]` exists — only `/admin/buyer-orgs` (list, leadership-only) and `/admin/my-client-partners` (list, all staff, AE/BD-scoped) exist today. Clicking any of these notifications 404s.
**Why it happens:** Phase 25 built the notification builders ahead of a detail page that was left for a later phase (implicitly, this one — since it's the phase that finally fires `lead_routed`).
**How to avoid:** Either (a) build a minimal `/admin/client-partners/[orgId]` detail page as part of this phase (it needs to exist anyway for the AE to see the qualifying fields captured at register and to flip `status` to `active`), or (b) change the notification `link` to point at the existing list views with a query param, e.g. `/admin/my-client-partners?org=${orgId}`, if a detail page is out of scope. Recommend (a) — the AE literally needs a company-detail surface to "complete onboarding," which is this phase's own stated goal.
**Warning signs:** QA clicks a lead-routed notification and gets a 404.

### Pitfall 5: Migration numbering and the human-gate convention

**What goes wrong:** An executor runs `supabase db push` directly, or numbers a new migration file starting from a stale local head.
**Why it happens:** N/A — this is a documented, repeatedly-enforced project convention (every migration from 058 onward carries an identical "never push from an agent" banner), but it's easy to slip on a phase with this much schema surface (new `buyer_orgs` columns for status + qualifying fields).
**How to avoid:** The next free migration number is **092** (`091_funun_staff_revoke_all_hardening.sql` is the current HEAD per `ls supabase/migrations/`). Draft `092_buyer_org_lead_fields.sql` with the same "HUMAN-GATED — never `supabase db push` from an agent" banner every migration since 058 carries, and stop at drafting + text-testing (e.g. a `__tests__/migration-092.test.ts` asserting the raw SQL string, mirroring `__tests__/migration-089-090.test.ts`'s convention).
**Warning signs:** `supabase migration list` shows `LOCAL != REMOTE` after an agent session.

### Pitfall 6: Column-privilege doctrine — new `buyer_orgs` columns are private by default

**What goes wrong:** A new `status`/`use_case`/qualifying-field column is added to `buyer_orgs` but forgotten in the `GRANT SELECT (...)` allowlist (migration 080's `GRANT SELECT (id, name, is_personal, verified, created_at) ON public.buyer_orgs TO authenticated`), so the buyer's own session client can't read their own org's status — or conversely, a field meant to stay staff-only (e.g. the raw qualifying answers) gets accidentally granted to `authenticated` and leaks to the buyer.
**Why it happens:** Documented repeatedly as this codebase's #1 recurring migration mistake (`ae_user_id` was deliberately kept OUT of the grant list for exactly this reason — see migration 090's own comment).
**How to avoid:** Decide per-field, explicitly, in the new migration: `status` almost certainly needs to be buyer-readable (so the portal can show "Your account is being set up by your AE" during `pending_onboarding`) — add it to the authenticated GRANT. Qualifying fields (`use_case`, `role`, etc.) are plausibly buyer-readable too (they typed them in); decide and grant explicitly, don't default to "revoke everything" or "grant everything."
**Warning signs:** A buyer-portal page reads `undefined` for a column that exists in the DB, or a staff-only field shows up in a buyer's own network tab response.

### Pitfall 7: The register endpoint is the first genuinely public (unauthenticated) write path in this codebase's buyer domain — treat it as a higher-risk surface

**What goes wrong:** Every existing buyer-account-creation path (`POST /api/admin/buyer-orgs`, `POST /api/admin/buyer-orgs/[id]/members`) is staff-gated first. A public register endpoint has no session to check, no CSRF-adjacent staff gate, and is a natural target for spam/abuse (fake company signups, email-bombing the invite flow).
**Why it happens:** N/A — inherent to the feature (public self-serve account creation).
**How to avoid:** Rate-limit by IP and/or email (this codebase has a precedent rate-limiter for cold DM requests — `lib/social/dm.ts`'s 10/week gate — reuse that *pattern*, not that table); validate email format strictly (reuse `EMAIL_REGEX`); consider requiring a real phone format loosely (min-length check) even though the rest of the app treats phone as free text, specifically because this is the one place an attacker directly controls account-creation volume; do not reveal whether an email is "already registered" in the response (mirror `forgot-password`'s account-enumeration-avoidance discipline, `app/(auth)/forgot-password/page.tsx:38`).
**Warning signs:** Load-test or bot-traffic review shows unthrottled `buyer_orgs` row creation.

## Code Examples

### Public catalog page — remove the redirect, add public loading

```typescript
// app/(buyer-portal)/buyers/catalog/page.tsx (current, lines 21-33)
export default async function CatalogPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/buyers/access')          // ← REMOVE for public browse

  const { data: member } = await supabase
    .from('buyer_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) redirect('/buyers/access')          // ← keep, but only reachable when user exists
  // ...
}
```
Recommended shape: branch on `user` presence — anonymous visitors get `loadCatalogPagePublic()` (Pitfall 3's fix) and `<CatalogBrowserLight isPublic />`; authenticated non-buyer or buyer-without-membership still redirects as today.

### Wiring the already-built lead-routing hook

```typescript
// lib/staff/notifications.ts:14-20 (comment, already in the codebase, unwired)
// Phase 23 hook (documented per this plan's own instruction, not wired
// here): the buyer-signup lead-routing call site — a new Client Partner
// (buyer_orgs) row created → resolveLeadRecipient(org, leadershipFallbackId)
// → createNotification(service, buildLeadRoutedNotification(...)) as a
// best-effort side effect AFTER the signup mutation — lands in Phase 23
```
This is a literal to-do left by 25-02's plan — the new `/api/sync/register` route is exactly the "buyer-signup" call site referenced.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `/buyers/access` magic-link-only, invite-only buyer entry | `/sync` public landing + modal, register creates an account directly | This phase | The buyer domain moves from fully-gated (Phase 16) to public-browse-with-gated-engagement (Phase 22/23 direction) |
| AE assignment stubbed/nullable (as CONTEXT.md originally scoped it) | AE assignment is real and live (Phase 25 shipped) | 2026-08-07 | Do not build a stub — wire the real `PATCH /api/admin/buyer-orgs/[id]/ae` and the real notification builders |

**Deprecated/outdated:** The `app/buyers/access/page.tsx` magic-link form is not deprecated by this phase — it remains the mechanism for an already-invited buyer without a password (or the sole mechanism, if Pitfall 1's option (b) is chosen) — but its copy ("Buyer access is invite-only during beta") becomes stale once public register ships and should be revisited/removed as part of this phase's scope, not left contradicting the new public flow.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `buyer_role: 'approver'` + `is_org_admin: true` (the values `POST /api/admin/buyer-orgs` already uses for the first admin) is the correct role/tier for a self-registered company's first member | Pattern 1, Standard Stack | If wrong, the CONTEXT.md's "spend-approver/company-admin" framing wouldn't be satisfied for self-registered companies the way it is for staff-created ones — low risk, easy one-line fix, but confirm during planning since CONTEXT.md doesn't explicitly say what tier a register-flow signup gets |
| A2 | A `status` column (`pending_onboarding`/`active`) on `buyer_orgs`, rather than a separate `buyer_leads` table, is the right shape for open question #2 | Architecture Patterns, Runtime State Inventory | If the product actually wants pre-account "leads" that only become `buyer_orgs` rows once qualified, this is the wrong shape — but CONTEXT.md is explicit that register creates a real account immediately ("NOT a bare lead"), which strongly supports the status-column approach |
| A3 | The register-flow's first-member email/phone/role/use-case fields belong on `buyer_orgs` (company-level: `use_case`) and are otherwise captured only transiently (not stored per-member beyond what `buyer_members`/`auth.users.user_metadata` already holds) | Runtime State Inventory, Don't Hand-Roll | If product wants per-member contact fields queryable (not just in `user_metadata`), a `buyer_members` column extension is also needed — cheap to add alongside the same migration, worth confirming scope during planning |
| A4 | "Talk to a sales rep" needs no schema distinction from "Register" beyond UI copy/framing, per CONTEXT's "same flow, two doors" decision | Open Questions #4 | If product wants different qualifying fields per door, the register payload/validation needs a `source` discriminant column — cheap addition, confirm during planning |

## Open Questions — Answered

1. **Account model schema.** `buyer_members.buyer_role` (`requester`/`approver`) already IS the purchaser/spend-approver split — no new role enum needed. `is_org_admin` already IS the company-admin flag. The AE link is `buyer_orgs.ae_user_id` (migration 090, live, private column). **Recommendation:** add no new role column; the existing two-tier model already satisfies CONTEXT.md's "spend-approver/company-admin role distinct from an individual purchaser role" requirement (`approver` = spend-approver, `is_org_admin` = company-admin, and they're already-conventionally co-assigned per `POST /api/admin/buyer-orgs`).

2. **"Created but not onboarded" state.** Add `buyer_orgs.status text not null default 'pending_onboarding' check (status in ('pending_onboarding','active'))` in migration 092. A `pending_onboarding` buyer can do everything a normal buyer can today (browse, shortlist, submit requests) per D-14a's existing "both tiers get full browse+submit reach" precedent — CONTEXT.md doesn't restrict pending-buyer capability, only says the AE "helps the buyer complete onboarding," implying onboarding is a sales/relationship process, not a feature-gate. Do not gate any existing buyer-portal feature behind `status = 'active'` unless a future decision says otherwise.

3. **Cross-company purchase visibility.** Already built (migration 081's RLS + `app/(buyer-portal)/buyers/requests/page.tsx`, `OrgRequestDashboard` component) — every org member already sees every org member's requests. The only gap: no distinct "spend oversight" UI variant for `approver`-tier viewers (today `requester` and `approver` see an identical dashboard). If a dedicated approver view (e.g. a spend total, a pending-approval queue) is wanted, it's a UI-only addition on top of already-correct data access — no new RLS needed.

4. **Register vs "Talk to a sales rep."** Recommend: same form, same endpoint (`POST /api/sync/register`), a `source: 'register' | 'sales_rep'` field carried through for admin-queue/notification copy only (e.g. "wants a sales rep" vs. "self-registered") — not a schema fork. Both create a `buyer_orgs` row identically (per CONTEXT.md: "Both... do this... two doors, one pipeline").

5. **AE stub.** **Not applicable — Phase 25 is shipped.** Use the real `ae_user_id` column and the real `PATCH /api/admin/buyer-orgs/[id]/ae` route. Do not build a stub or nullable-only placeholder; the leadership admin queue is simply `buyer_orgs WHERE ae_user_id IS NULL`.

6. **Public preview audio.** Confirmed OK to expose — `CatalogBrowserLight`'s playback is entirely simulated (a `setInterval` progress bar over static duration text, no `<audio>` element, no real file URL ever fetched — see `CatalogBrowserLight.tsx:203-212`). There is no real audio asset being exposed publicly; this is purely a UI-state question and requires no additional gating.

7. **Login flows scope.** Recommend **login-only for beta**, deferring forgot-password/resend-activation for buyers specifically — but this recommendation is contingent on Pitfall 1's resolution: if the modal ships password auth at all, "forgot password" cannot reasonably be omitted from day one (a buyer who mistypes their password has no recovery path), and the existing `/forgot-password` flow's `/vault`-hardcoded redirect (Pitfall 2) must be fixed regardless of scope decision. If the modal ships magic-link-only (Pitfall 1 option b), "forgot password" and "resend activation" are moot — a fresh magic link IS the recovery mechanism, already built (`app/buyers/access/page.tsx`), and needs no new work. **Resend is confirmed not configured in production yet** (per task-provided critical context) — every email-dependent step in this phase (invite, lead-routing email, any password-reset email) will silently no-op (`sendEmail()` returns `{ ok: false }`, never throws) until the owner configures `RESEND_API_KEY`/`RESEND_FROM_EMAIL`. Plans must not treat email delivery as guaranteed; the in-app notification/admin-queue path is the reliable channel until then.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase (local/remote) | All schema + auth work | ✓ | project-pinned via `supabase` CLI 1.200.0 | — |
| Resend (`RESEND_API_KEY`/`RESEND_FROM_EMAIL`) | Lead-routing email, buyer invite email, any password-reset email | ✗ (per critical context: not configured in prod) | — | `sendEmail()` no-ops safely (`{ ok: false }`), never throws — every plan step that sends email must treat the in-app notification/DB write as the source of truth, email as best-effort enhancement only |
| DocuSeal | Not used by this phase | n/a | — | — |
| Stripe | Not used by this phase | n/a | — | — |

**Missing dependencies with no fallback:** none — Resend's absence has a documented, already-implemented graceful fallback (`sendEmail()`'s no-op contract).
**Missing dependencies with fallback:** Resend (see above).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (`ts-jest`, transpile-only per `isolatedModules: true`) |
| Config file | `jest.config.js` |
| Quick run command | `npm test -- <path-to-new-test-file>` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

No REQUIREMENTS.md IDs are registered for Phase 23 yet (confirmed: `grep` of REQUIREMENTS.md finds no `SYNC-`/`ONBOARD-` section — this phase's requirement IDs will be registered by the planner, following the established Phase 16/25 convention of a plan-time addition rather than a pre-registered set). The planner should register IDs (suggested prefix: `SYNC-` or `ONBOARD-`) covering at minimum:

| Suggested Req | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| (register form validation) | `buildRegisterPayload`/validation rejects malformed email/missing fields | unit | `npm test -- lib/buyers/register.test.ts` | ❌ Wave 0 |
| (register endpoint) | POST creates `buyer_orgs` row with `status='pending_onboarding'` + first `approver`/`is_org_admin` member | integration (mocked service client, mirrors existing `__tests__` conventions for admin routes) | `npm test -- app/api/sync/register` | ❌ Wave 0 |
| (public catalog) | `loadCatalogPagePublic` (or the null-safe branch) does not throw for an anonymous caller | unit | `npm test -- lib/deals/catalog-query.test.ts` | ❌ Wave 0 (no existing test file for `catalog-query.ts` found) |
| (lead routing) | `resolveLeadRecipient`/`buildLeadRoutedNotification` wired at the new call site | unit (pure functions, already tested at the builder level per Phase 25) | `npm test -- lib/staff/notifications.test.ts` | check — Phase 25 likely already covers the builders; the call-site wiring itself needs an integration test in the new route's test file |
| (migration 092) | Structural/text-content test mirroring `__tests__/migration-089-090.test.ts` | unit | `npm test -- __tests__/migration-092.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- <changed-file-glob>`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus `npm run build` (project has no separate typecheck script; `tsc --noEmit` is invoked implicitly by `next build`).

### Wave 0 Gaps

- [ ] `lib/buyers/register.test.ts` — pure payload-builder/validator tests (mirrors `lib/deals/request-payload.test.ts`'s existing pattern for `buildRequestBody`)
- [ ] `lib/deals/catalog-query.test.ts` — no existing test file found for this module; add coverage for both the authenticated and (new) anonymous-safe paths
- [ ] `__tests__/migration-092.test.ts` — structural test for the new migration, mirroring `__tests__/migration-089-090.test.ts`
- [ ] Route-level test for `POST /api/sync/register` (mirrors any existing `app/api/admin/buyer-orgs/route.test.ts` if one exists — verify during planning)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Yes | Supabase Auth (`signInWithPassword`/`signInWithOtp`) — decide per Pitfall 1; no custom password hashing/session logic to be hand-rolled |
| V3 Session Management | Yes | `@supabase/auth-helpers-nextjs` cookie sessions, already in use — no new session mechanism |
| V4 Access Control | Yes | `requireStaff()` for every admin-side write; RLS (`is_buyer_org_member`) for every buyer-side read; the new public register route is the one path with NO access control by design — compensate with rate limiting + strict input validation (Pitfall 7), not auth |
| V5 Input Validation | Yes | `zod` or the existing hand-rolled allowlist/regex pattern (`EMAIL_REGEX`) — register payload must be validated server-side, never trust client-supplied `org_name`/role/use_case beyond an explicit allowlist, exactly like every existing admin route in this domain |
| V6 Cryptography | No new surface | Supabase Auth owns password hashing entirely; nothing to hand-roll |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Public register endpoint abused for account-creation spam / email-bombing | Denial of Service | Rate limit by IP/email (reuse the `lib/social/dm.ts` rate-limit *pattern*), never reveal whether an email is already registered (mirror `forgot-password`'s existing account-enumeration-avoidance discipline) |
| Column-privilege leak on new `buyer_orgs` fields (staff-only qualifying data readable by the buyer, or vice versa) | Information Disclosure | Explicit `GRANT SELECT (...)` allowlist per new column in migration 092, decided deliberately (Pitfall 6), never "grant everything" |
| Open redirect via a crafted `?next=` on the buyer-flavored sign-in/reset path | Spoofing / Tampering | Reuse `postSignInPath()`'s existing `safeNext()` same-origin-only guard (`lib/auth/postSignInPath.ts:17-22`) — do not build a second, unguarded redirect resolver for the buyer flow |
| RLS recursion on any new buyer-scoped policy | Denial of Service (query failure) | Reuse `is_buyer_org_member()` (SECURITY DEFINER) rather than a naive self-join subquery — migration 064/078/080's established fix |

## Sources

### Primary (HIGH confidence — direct codebase inspection this session)

- `supabase/migrations/080_buyer_orgs_members.sql` — buyer schema, RLS, column-privilege doctrine
- `supabase/migrations/086_restore_buyer_branch_handle_new_user.sql` — current live `handle_new_user()` body
- `supabase/migrations/090_buyer_orgs_ae_assignment.sql` — AE column, live
- `supabase/migrations/081_license_requests_deals.sql` (RLS policy `license_requests_select_buyer_org_or_project_owner`) — cross-company visibility already-shipped
- `lib/buyers/createBuyerAccount.ts`, `lib/buyers/schema.ts`, `lib/buyers/permissions.ts`, `lib/buyers/org.ts`
- `lib/staff/notifications.ts`, `lib/admin/gate.ts`, `lib/staff/scope.ts`, `lib/staff/audit.ts`
- `app/api/admin/buyer-orgs/route.ts`, `[id]/route.ts`, `[id]/ae/route.ts`, `[id]/members/route.ts`
- `components/buyer/CatalogBrowserLight.tsx`, `components/buyer/fnbl-theme.ts`, `components/buyer/BuyerTopNav.tsx`
- `app/(buyer-portal)/buyers/catalog/page.tsx`, `app/(buyer-portal)/layout.tsx`, `app/(buyer-portal)/buyers/requests/page.tsx`
- `app/buyers/access/page.tsx`, `app/(auth)/signin/page.tsx`, `app/(auth)/forgot-password/page.tsx`, `app/(auth)/update-password/page.tsx`, `app/auth/callback/route.ts`, `lib/auth/postSignInPath.ts`
- `lib/deals/catalog.ts`, `lib/deals/catalog-query.ts`, `lib/deals/catalog-sample.ts`, `lib/deals/request-target.ts`
- `.planning/ROADMAP.md` (Phase 23/24/25/28 sections, `/sync` unification decision)
- `.planning/STATE.md` (Phase 25 completion status)
- `.planning/REQUIREMENTS.md` (confirmed no Phase 23 IDs registered yet)

### Secondary (MEDIUM confidence)

- `.planning/phases/23-buyer-onboarding-login-register/23-CONTEXT.md` — authoritative for locked product decisions, but written before Phase 25 shipped and before the `/sync` ROADMAP note landed same-day — cross-checked against ROADMAP.md and STATE.md for currency

### Tertiary (LOW confidence)

- None — this phase's domain is entirely internal codebase inspection; no external library research was needed since no new dependencies are recommended.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, every pattern has a direct existing precedent in this codebase
- Architecture: HIGH — schema/RLS/RBAC substrate is live and inspected directly; the one open architectural question (auth mechanism, Pitfall 1) is clearly flagged rather than silently assumed
- Pitfalls: HIGH — each pitfall traced to a specific file:line in the live codebase, not inferred

**Research date:** 2026-08-07
**Valid until:** Re-verify if Phase 24 (Model B self-serve) or Phase 26 (sync-library) land first and touch `buyer_orgs`/`handle_new_user`/catalog query shape before Phase 23 executes — otherwise stable for ~30 days (internal codebase research, not fast-moving external ecosystem).
