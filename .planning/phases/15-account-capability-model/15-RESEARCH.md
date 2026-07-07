# Phase 15: Account Capability Model - Research

**Researched:** 2026-07-07
**Domain:** Postgres/Supabase schema evolution (single-value discriminant → grant set), Next.js App Router route-group consolidation, admin approval workflows
**Confidence:** HIGH (all findings grounded in this repo's own migrations/code; no unverified external packages involved)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Capability Request/Grant Flow**
- **D-01:** An existing account gains a second capability via **self-serve request + admin approval** — not a fully open self-serve toggle, and not admin-only in both directions.
- **D-02:** The gate is **asymmetric**, matching today's actual trust bar exactly: **industry → artist is instant** (no review — artist signup is already open to anyone with zero verification today, so gating it here would be a new restriction with no justification). **Artist → industry requires admin approval** (mirrors today's admin-invite trust gate for industry claims — impersonation/credibility risk is real on this side).
- **D-03:** Build a **full in-app request UI + admin approval queue** this phase — not an informal out-of-band process. Extend the existing `/admin/members` pattern (`app/api/admin/members/route.ts`, `components/admin/MembersAdmin.tsx`) rather than inventing a separate surface.
- **D-04:** Curators (the fully separate Wave 3 magic-link account type, isolated from `artist_profiles`) **stay deliberately separate** — explicitly out of scope for this phase. Do not fold curator into this capability-grant model.

**Multi-Capability Navigation**
- **D-05:** Unify around **one left-sidebar nav** — the existing `ArtistNav.tsx` pattern (`components/nav/ArtistNav.tsx`) becomes the single nav for both capabilities, replacing `app/(industry)/layout.tsx`'s separate topbar-only nav entirely. Not a mode/workspace switcher between two separate nav experiences.
- **D-06 (user-specified):** **Split Sheets** (currently an industry-only topbar link in `app/(industry)/layout.tsx`) folds into the existing **"Contract Locker"** sidebar room (`/contracts`, already in `ArtistNav.tsx`'s `ITEMS` array) — not a new standalone nav item. Contract Locker is already the rights/document room from Wave 2; split sheets belong there conceptually.
- **D-07:** The industry-only actions (**Post an opportunity**, **manage postings** — today's `/opportunities` and `/opportunities/new`) fold into the **existing Antenna room** (`/antenna`, already in `ArtistNav.tsx` for artist browse/apply) rather than getting a separate sidebar item. One room, contextual to what the account can do — Antenna grows a Post/Manage-postings section when the account has industry capability.
- **D-08:** The sidebar **hides what doesn't apply** to the account's actual capabilities — matches the existing hide-when-absent convention from Phase 14 (D-08 there: never show a disabled dead-end control). An industry-only account never sees Vault/Launchpad/PitchPlug/Contract Locker/etc. at all; an artist-only account's Antenna room has no Post/Manage-postings section. Do NOT show everything with inapplicable items grayed out.
- **D-09:** A **subtle sidebar entry point** near the Settings/profile footer (e.g. "Add industry access" / "Add artist access" — whichever the account lacks) surfaces the D-01 request flow. Not buried Settings-page-only with no proactive discovery.

**Badges vs. Capability Relationship**
- **D-10:** Gaining a capability **auto-suggests/attaches a matching role badge** — not fully independent from today's cosmetic badge system. Mirrors how `createIndustryMember()` already pre-populates `roles`/`industry_roles` today. The badge stays freely editable afterward; this is a sensible default, not a new coupling that breaks Phase 8 D-09's "badges are cosmetic" rule.
- **D-11:** The capability **request form itself collects the role-badge pick up front** (reusing the existing `INDUSTRY_ROLE_GROUPS` chip picker from `MembersAdmin.tsx`) — not a separate follow-up step after approval. By the time an admin approves, the badge is already chosen and ready to attach.

**Existing Account Handling**
- **D-12:** Every existing `artist_profiles` row (single `member_type` value today) gets **auto-preserved as its one existing grant** when the schema converts to a capability set. Zero behavior change for any current account — nobody needs to re-request a capability they already have. This applies to both real beta accounts (once beta starts) and any sandbox-created rows.
- **D-13:** **Capability revocation is explicitly out of scope for this phase.** Revoking a grant (e.g. a fraudulent industry claim) is Trust & Safety territory — Phase 13's block/report domain, not an identity-model concern. Admins can revoke manually via direct DB action until real volume justifies building revocation UI.

### Claude's Discretion
- Exact schema mechanism for the capability set (array column on `artist_profiles` vs. a join/grants table) — a migration mechanics detail, not a product decision. Researcher/planner's call, informed by the existing `member_type` CHECK constraint (migration 034) and the column-privilege lockdown precedent (migration 040) that must be preserved/extended correctly.
- Exact UI copy/layout for the admin approval queue — follow the existing `/admin/members` visual conventions (per D-03).
- Exact UI copy/placement details for the sidebar's subtle capability-request entry point (D-09) within the footer/Settings area.

### Deferred Ideas (OUT OF SCOPE)
- **Curator unification** — folding curators into this same capability-grant model as a third grantable capability. Explicitly deferred (D-04); curators stay separate as Wave 3 designed them.
- **Capability revocation UI** — an admin-facing "pull back a grant" flow. Explicitly deferred (D-13) to Phase 13 (Trust & Safety) territory or a later phase if volume ever justifies it.

**Phase boundary:** Replace the single `member_type` value (`'artist' | 'industry'`, migration 034) with multiple capability grants on one account. Explicitly deferred until after beta testing begins (scheduled after Phase 13 for sequencing only, not a technical dependency — does not block or reorder Phases 9–13).
</user_constraints>

## Summary

This phase has no new library surface — it is a pure architecture change inside a codebase that already has strong, directly-reusable precedent for every sub-problem it raises. The `connections` table (migration 035) is a request/accept state machine with a partial unique index for exactly the "pending → decided" shape D-01/D-03 need. The `createIndustryMember()` / `handle_new_user()` industry branch (migrations 039, `lib/industry/createIndustryMember.ts`) is the atomic-metadata-at-creation pattern this phase's *grant-onto-existing-account* flow must parallel (not copy verbatim, since there is no `admin.createUser()` call here — the account already exists). Migration 040's column-privilege REVOKE/GRANT lockdown is standing project doctrine and must be applied to whatever new column/table this phase introduces, in the same migration that adds it.

A grep audit of the entire codebase found `member_type` used in exactly three places outside its own migrations: two admin-list queries (`app/api/admin/members/route.ts`, `app/(admin)/admin/members/page.tsx`) that filter `.eq('member_type', 'industry')`, and the `ArtistProfile` type definition. **No route, page, or component today branches on `member_type` for access control.** The `(industry)` route group's separation from `(artist)` is the *entire* current access boundary — it is nav/URL-based, not permission-checked. `/api/antenna/opportunities` (POST) has no member_type check at all: any authenticated account, artist or industry, can already post an opportunity today. This is a real, pre-existing gap the planner should be aware of when deciding how much server-side enforcement this phase adds versus how much it inherits.

**Primary recommendation:** Add a new `capability_grants` join table (not an array column, not a repurposed `member_type`) that models capability ownership as a set of rows, each with a `status` of `'approved'` or `'pending'`, directly modeled on migration 035's `connections` table (same partial-unique-index shape, same column-level UPDATE lockdown pattern). Keep `artist_profiles.member_type` unchanged as the "primary/lead capability" for badge-highlighting and backward-compat reads (PROFILE-01's lead-role-highlighted requirement lands in Phase 9 and already depends on a single primary value existing). Backfill one `'approved'` grant row per existing `member_type` value in the same migration (satisfies D-12). Because migrations 034–040 have not yet been pushed to any live database (per `08-VERIFICATION.md` and STATE.md's Blockers/Concerns), this phase's own migration should defensively re-verify that `member_type` exists before backfilling from it, mirroring migration 040's own `ADD COLUMN IF NOT EXISTS` defensiveness.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Capability grant storage (who has artist/industry access) | Database / Storage | API / Backend | New table + RLS + column-privilege lockdown; server routes are the only writers |
| Instant industry→artist grant | API / Backend | Database | No review needed — server route inserts an `'approved'` row directly, mirrors today's zero-friction artist signup |
| Artist→industry request + admin approval queue | API / Backend | Database | Extends `/admin/members` pattern; admin route re-verifies `is_admin` server-side per project doctrine |
| Sidebar capability-aware rendering | Frontend Server (SSR) / Browser Client | — | `ArtistNav` is a client component (`'use client'`) but capability data must be fetched server-side (layout) and passed as a prop — never client-fetched from `artist_profiles` directly (RLS/column-grant surface) |
| Route protection for capability-gated pages (`/opportunities/new`, `/antenna` Post section) | API / Backend | Frontend Server | UI hiding (D-08) is not a substitute for a server-side capability check — see Pitfall 1 |
| Badge auto-attach on grant (D-10/D-11) | API / Backend | Database | Mirrors `mapSlugsToProfileRoles()` — pure function, called from the grant-approval route, writes to `artist_profiles.roles` |

## Standard Stack

### Core
No new libraries. This phase is 100% additive SQL + existing Next.js/Supabase/TypeScript stack already in `package.json`.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.45.0 (already installed) | `createServiceClient()` for the grant/approval routes | Already the project's exclusive DB access pattern for admin-privileged writes |
| PostgreSQL (via Supabase) | project's existing instance | `capability_grants` table, RLS, partial unique index, REVOKE/GRANT | Matches every precedent migration (031, 034, 035, 038, 040) |

### Supporting
No supporting packages needed. Zod is already in the stack (3.23.0) and should validate the capability-request API body (`capability: 'artist' | 'industry'`, optional `role_slugs: string[]`) consistent with how `app/api/admin/members/route.ts` hand-validates today (that route does NOT use Zod — it hand-rolls validation; either pattern is acceptable per existing convention, Zod is slightly more consistent with `lib/metadata/schema.ts` conventions).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `capability_grants` join table | `capabilities TEXT[]` array column on `artist_profiles` | Array column is simpler for the steady-state "does this account have X" check (`'industry' = ANY(capabilities)`), but has no natural place to store `pending` request state, no audit trail (who requested/approved/when), and array-membership RLS predicates are less standard than the row-per-grant pattern already proven in this codebase (`connections`). Rejected — request/approval workflow needs row-level state. |
| `capability_grants` join table | Repurpose `member_type` into a JSONB array in place | Breaks the CHECK constraint contract migration 034 established and every existing `.eq('member_type', 'industry')` query; also collapses "primary badge identity" and "capability grant" into one concept, which D-10 explicitly treats as related-but-separate (`roles` badges stay independently editable after grant). Rejected. |
| Zod validation on new API route | Hand-rolled validation (current `admin/members/route.ts` style) | Either is acceptable per existing convention; Zod recommended for consistency with `lib/metadata/schema.ts`-style modules but not load-bearing. |

**Installation:**
No install step — no new packages.

**Version verification:** N/A — no new package versions to verify. Existing stack versions confirmed via `package.json` read (Section: Technology Stack in CLAUDE.md, already current in this repo).

## Package Legitimacy Audit

**Not applicable this phase.** No new external packages are introduced. All work is additive SQL migrations and TypeScript modules built on already-installed dependencies (`@supabase/supabase-js`, `zod`, `next`). If the planner discovers a genuine need for a new package during planning (unlikely), the Package Legitimacy Gate protocol must be run at that time.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────┐
                    │   Existing authenticated     │
                    │   account (artist_profiles)  │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │  Sidebar "Add industry/artist │
                    │  access" entry point (D-09)   │──── reads capability_grants
                    └──────────────┬───────────────┘      (server component, layout)
                                   │
                     ┌─────────────┴─────────────┐
                     │                           │
        request: industry → artist    request: artist → industry
                     │                           │
                     ▼                           ▼
     ┌───────────────────────────┐   ┌─────────────────────────────┐
     │ POST /api/capabilities/   │   │ POST /api/capabilities/      │
     │ request  (instant path)   │   │ request  (review path)       │
     │ INSERT capability_grants  │   │ INSERT capability_grants     │
     │  status='approved'        │   │  status='pending'            │
     └──────────────┬────────────┘   └──────────────┬────────────────┘
                    │                                │
                    ▼                                ▼
         badge auto-attach (D-10)          ┌─────────────────────────┐
         mapSlugsToProfileRoles()          │ Admin approval queue     │
         writes artist_profiles.roles      │ (extends /admin/members) │
                    │                       │ verifyAdmin() gate       │
                    │                       └──────────────┬───────────┘
                    │                                       │
                    │                          admin approves/denies
                    │                                       │
                    │                                       ▼
                    │                       UPDATE capability_grants
                    │                       status='approved'
                    │                       + badge auto-attach (D-11:
                    │                       role already picked at
                    │                       request time)
                    │                                       │
                    └───────────────────┬───────────────────┘
                                        │
                                        ▼
                    ┌────────────────────────────────────┐
                    │ ArtistNav (unified sidebar, D-05)   │
                    │ reads capability set server-side,   │
                    │ conditionally renders items (D-08): │
                    │  Vault/Locker/Antenna Post section/  │
                    │  etc. hidden when capability absent │
                    └────────────────────────────────────┘
```

### Recommended Project Structure
```
supabase/migrations/
└── 042_capability_grants.sql       # new table + RLS + column privileges + backfill

lib/capabilities/
├── grant.ts                         # grantCapability(), requestCapability() — parallels createIndustryMember.ts
└── check.ts                        # hasCapability(profileId, cap) helper for server components/routes

app/api/capabilities/
├── request/route.ts                 # self-serve POST (instant or pending, per D-02 asymmetric gate)
└── approve/[grantId]/route.ts       # admin approve/deny — extends admin/members pattern, verifyAdmin() gate

app/(admin)/admin/capability-requests/
└── page.tsx                         # approval queue UI — parallels admin/members/page.tsx

components/admin/
└── CapabilityRequestsAdmin.tsx      # parallels MembersAdmin.tsx's chip-picker + optimistic list

components/nav/
└── ArtistNav.tsx                    # gains `capabilities: string[]` prop, filters ITEMS + Antenna sub-sections

app/(industry)/                      # RETIRED — its 3 routes physically move into app/(artist)/
├── opportunities/**  →  app/(artist)/antenna/post/**  (or nested under /antenna, per D-07)
└── split-sheets/**   →  folds into /contracts (Contract Locker), per D-06
```

### Pattern 1: Grant-table-with-request-state (mirrors `connections`)
**What:** A single table storing one row per (profile, capability) pair, with a `status` column (`'pending' | 'approved'`) rather than two separate tables for "grants" and "requests."
**When to use:** Any time a permission needs both an instant-grant path and a review-then-grant path sharing the same underlying resource — exactly this phase's D-01/D-02 asymmetric gate.
**Example:**
```sql
-- Source: migration 035 pattern (connections table), adapted
CREATE TABLE capability_grants (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id   UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  capability   TEXT NOT NULL CHECK (capability IN ('artist', 'industry')),
  status       TEXT NOT NULL DEFAULT 'approved'
               CHECK (status IN ('pending', 'approved', 'denied')),
  role_slugs   TEXT[] NOT NULL DEFAULT '{}',  -- D-11: badge pick collected at request time
  source       TEXT NOT NULL
               CHECK (source IN ('signup', 'self_serve_instant', 'admin_approved')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at   TIMESTAMPTZ,
  decided_by   UUID REFERENCES auth.users(id)
);

-- Partial unique index — exact precedent from connections_active_pair_uniq:
-- prevents a duplicate pending/approved request for the same capability,
-- while allowing a fresh request after a prior 'denied' row.
CREATE UNIQUE INDEX capability_grants_active_uniq
  ON capability_grants (profile_id, capability)
  WHERE status IN ('pending', 'approved');
```

### Pattern 2: Physically relocate route files to unify nav (not a layout hack)
**What:** Next.js route groups are directory-only conventions — moving a page file from `app/(industry)/opportunities/page.tsx` to `app/(artist)/antenna/post/page.tsx` (or wherever D-07 lands it) does not change any URL that isn't itself changing, and does not trigger a full-page reload concern here because both `(artist)` and `(industry)` already share the same single root layout (`app/layout.tsx` defines `<html>/<body>`; neither route group redefines its own root).
**When to use:** This exact phase — D-05 retires `app/(industry)/layout.tsx` entirely.
**Example:**
```
# Source: Next.js docs — route groups are organizational only (verified via WebSearch, official docs)
# Before:                              # After:
app/(industry)/opportunities/          app/(artist)/antenna/post/
app/(industry)/opportunities/new/      app/(artist)/antenna/post/new/
app/(industry)/opportunities/[id]/     app/(artist)/antenna/post/[id]/
app/(industry)/split-sheets/           (folds into existing app/(artist)/contracts/ per D-06)
app/(industry)/layout.tsx              DELETED
```
Since URLs for `/opportunities*` are not required to be preserved by any decision in CONTEXT.md, the planner may choose to keep the same URL segments (`/opportunities`, `/opportunities/new`) while only moving the *route-group* wrapper (`app/(industry)/opportunities` → `app/(artist)/opportunities`), which is the lower-risk option — it changes zero URLs, only which layout wraps them. D-07 talks about the Antenna *room* growing a Post/Manage-postings *section*, which can be satisfied either by literal URL nesting under `/antenna` or by keeping `/opportunities*` URLs and just adding sidebar links to them from within the Antenna nav context. This is a planner decision point — see Open Questions.

### Anti-Patterns to Avoid
- **Nav-only capability gating:** Hiding a sidebar link is not access control. `/api/antenna/opportunities` POST today has zero server-side ownership/capability check — any authenticated user can hit it directly regardless of what the sidebar shows. This phase should not repeat that pattern for any *new* capability-gated route; see Pitfall 1.
- **Client-side capability read from `artist_profiles`/`capability_grants` via direct PostgREST:** Per migration-040 doctrine, any new table must get the column-privilege lockdown from day one. Capability data should be read server-side in layouts/pages and passed down as props, not queried client-side.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request/approve state machine | A custom status-transition validator from scratch | Postgres CHECK constraint + partial unique index + two targeted RLS UPDATE policies (mirrors `connections`' `connections_update_addressee` / `connections_update_requester_withdraw` split) | Already proven correct in this codebase; prevents the exact self-accept/rewrite bugs CR-04 fixed on `connections` |
| Admin-privileged approval action | A new bespoke admin-auth check | `verifyAdmin()` from `lib/admin/gate.ts`, called at the top of the new approval route exactly like `app/api/admin/members/route.ts` does | Per-route re-verification (not just layout gating) is explicit project doctrine (T-05-02) |
| Slug → badge preset mapping for the request-time role picker (D-11) | A new mapping table | `mapSlugsToProfileRoles()` (`lib/industry/roleMapping.ts`) — already handles slug→preset dedup and custom-label fallback | Exact same shape of problem D-10/D-11 describe; this function already exists and is tested by the createIndustryMember flow |

**Key insight:** Every mechanical piece of this phase (state machine, admin gate, badge mapping) already has a working, reviewed implementation elsewhere in this codebase. The only genuinely new work is: the join table itself, the two new API routes, the nav's conditional-rendering logic, and the file relocation for route-group unification.

## Runtime State Inventory

**Trigger:** This phase converts `member_type` (a single-value discriminant, migration 034) into a capability-grant set — a schema migration affecting existing account data (D-12 requires "auto-preserved as its one existing grant").

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `artist_profiles.member_type` values — **but per `08-VERIFICATION.md` and STATE.md's Blockers/Concerns, migrations 034–040 have not yet been pushed to ANY live database** (no `supabase/config.toml`, no linked project, `SUPABASE_ACCESS_TOKEN` unset at last check). Phase 15 is scheduled after Phase 13 + start of beta, so by the time it executes, 034–040 should have landed in a real database as part of normal deployment — but this must be **re-confirmed at Phase 15 planning/execution time**, not assumed. | Data migration (backfill one `capability_grants` row per existing `member_type` value) — but only after confirming the column and its data actually exist in the target database. Code edit: none needed for `handle_new_user()`'s existing branches (they still write `member_type`; a new `AFTER INSERT` trigger or application-level call must also insert the matching `capability_grants` row for new signups going forward). |
| Live service config | None found. No external service (Supabase dashboard config, third-party API) stores `member_type` outside the `artist_profiles` table itself. | None. |
| OS-registered state | None — this is a pure application/database change, no OS-level task scheduling, process names, or external registrations reference `member_type`. | None. |
| Secrets/env vars | None — no env var or secret name references `member_type` or "capability." | None. |
| Build artifacts | None — no compiled/installed artifact embeds `member_type` as an identifier that would go stale. | None. |

**Additional note (not a runtime-state category but adjacent):** `handle_new_user()` (migration 039) must gain a companion write to `capability_grants` for both the artist branch and the industry branch, in the same transaction, so every *new* signup from this phase forward gets a proper grant row — not just existing accounts via backfill. This is new schema work, not a runtime-state migration concern, but the planner must not treat D-12 backfill as sufficient on its own.

## Common Pitfalls

### Pitfall 1: Treating sidebar visibility as the security boundary
**What goes wrong:** D-08 says "hide what doesn't apply" — if the planner implements only client-side/nav hiding and does not add server-side capability checks to the underlying routes, an artist-only account can still `POST /api/antenna/opportunities` or hit `/opportunities/new` directly by URL, exactly as is already possible today (confirmed: that route has zero member_type/capability check right now).
**Why it happens:** The existing codebase already has this gap (nav-only separation via route groups), so it's easy to preserve the status quo without noticing the phase is the first place where capability enforcement becomes semantically real (before, "industry" vs "artist" was assigned at signup and never crossed; now it can be requested and combined).
**How to avoid:** Add an explicit `hasCapability(profileId, 'industry')` server-side check to any route this phase newly capability-gates (at minimum, opportunity-posting routes, if the planner decides to formalize that boundary). This is a planner decision — flagged in Open Questions below since CONTEXT.md doesn't explicitly require it, but D-08's "hide-when-absent" principle is undermined if the hidden action is still reachable.
**Warning signs:** Any new/moved route that reads `capabilities`/`capability_grants` only in a page component for rendering decisions, with no corresponding check in the route handler / server action that performs the mutation.

### Pitfall 2: Forgetting column-privilege lockdown on the new table
**What goes wrong:** Migration 040 exists specifically because migration 001's `artist_profiles` policy shipped with a blanket RLS `USING (true)` and no column grants, silently exposing PII for years. A brand-new `capability_grants` table that ships without REVOKE/GRANT from day one repeats that exact mistake pattern this project has already paid down once.
**Why it happens:** RLS enablement feels sufficient; it's easy to forget that Supabase's default schema bootstrap grants blanket column-level SELECT/UPDATE to `authenticated`/`anon` on any RLS-enabled table with a matching policy, independent of RLS row-filtering.
**How to avoid:** In the same migration that creates `capability_grants`, add explicit REVOKE/GRANT statements limiting `authenticated` to `SELECT` on their own rows (via RLS) and no direct `UPDATE`/`INSERT` privilege beyond what an explicit RLS policy scopes (writes should go through `service_role` via the API routes, matching the `connections` table's `REVOKE UPDATE ... GRANT UPDATE (status)` pattern).
**Warning signs:** A migration that creates a table with RLS `ENABLE` but no accompanying `REVOKE`/`GRANT` block.

### Pitfall 3: Assuming migrations 034–040 are already live
**What goes wrong:** D-12's backfill (`member_type` → one `capability_grants` row) is written as a `INSERT INTO capability_grants SELECT id, member_type, 'approved' FROM artist_profiles` — but if `member_type` doesn't exist yet in the target database (per the confirmed gap in STATE.md), this migration fails outright.
**Why it happens:** Wave 4 (Phases 8–14) migrations were authored and reviewed but a sandbox limitation (no linked Supabase project, no `SUPABASE_ACCESS_TOKEN`) prevented pushing them to any live database as of the last recorded check. Phase 15 is explicitly scheduled after beta begins, so this *should* be resolved by then, but the plan must not hard-assume it.
**How to avoid:** The Phase 15 migration should check for `member_type`'s existence defensively (e.g., wrap the backfill in a `DO $$ ... IF EXISTS ...` block, or simply confirm via a pre-flight `\d artist_profiles` / `information_schema.columns` check during planning) rather than assuming a clean, fully-migrated state.
**Warning signs:** A migration file with no defensive check that fails hard with "column does not exist" the first time it's run against a database that hasn't caught up on 034–040 yet (this exact failure mode already happened once with `claimed_at` in migration 034/040's own history).

### Pitfall 4: Re-implementing `createIndustryMember()`'s atomic pattern where it doesn't apply
**What goes wrong:** `createIndustryMember()`'s core lesson is "set `app_metadata` atomically inside `admin.createUser()`, never a post-insert UPDATE, to avoid a phantom-row race." That lesson is about *account creation*. This phase's grant flow operates on an *already-existing* account — there is no `admin.createUser()` call, no `handle_new_user()` trigger firing, and no phantom-row race to avoid, because the `artist_profiles` row already exists. A planner copying the pattern too literally might try to route the grant through a fake "recreate the user" step, which is unnecessary and risky (would orphan or duplicate a real account).
**Why it happens:** The canonical reference in CONTEXT.md points to `createIndustryMember.ts` as the closest precedent, but the mechanism (atomic metadata at creation time) doesn't map 1:1 onto "add a capability to row X that already exists."
**How to avoid:** The grant-approval action should be a plain `INSERT`/`UPDATE` against `capability_grants` (and, for D-10, a badge-attach write to `artist_profiles.roles`) via `createServiceClient()` — no `admin.createUser()`, no `generateLink()`, no invite email. It parallels the *ownership/gating* pattern of `createIndustryMember()` (admin-invoked, service-role, atomic), not its *account-provisioning* mechanics.
**Warning signs:** Any new code path calling `service.auth.admin.createUser()` or `generateLink()` for an account that already has a session/auth.users row.

## Code Examples

### Server-side capability check helper
```typescript
// Pattern source: mirrors no_block()'s SECURITY DEFINER RLS-helper shape
// (migration 035), adapted for a simple boolean capability check used in
// server components/route handlers — NOT intended as a client RPC.
import { createServiceClient } from '@/lib/supabase/server'

export async function hasCapability(
  profileId: string,
  capability: 'artist' | 'industry'
): Promise<boolean> {
  const service = createServiceClient()
  const { data } = await service
    .from('capability_grants')
    .select('id')
    .eq('profile_id', profileId)
    .eq('capability', capability)
    .eq('status', 'approved')
    .maybeSingle()
  return data !== null
}
```

### Nav conditional rendering (extends existing `ITEMS` filter pattern)
```typescript
// Source: components/nav/ArtistNav.tsx's existing ITEMS.map() — extended
// with a capability predicate. `capabilities` passed down from the server
// layout (never fetched client-side against artist_profiles directly).
type Item = {
  href: string
  label: string
  match: string
  Icon: (p: { gradient?: boolean; className?: string }) => React.ReactNode
  requiresCapability?: 'artist' | 'industry'
}

const visibleItems = ITEMS.filter(
  item => !item.requiresCapability || capabilities.includes(item.requiresCapability)
)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `member_type` single exclusive value (`'artist' | 'industry'`), set once at signup | `capability_grants` set, multiple approved rows per account | This phase (15) | Enables one account to hold both capabilities; `member_type` is retained as the "primary/lead" value for badge display, not deprecated |
| Two separate route groups / nav experiences (`(artist)`, `(industry)`) | One unified sidebar (`ArtistNav`), capability-conditional rendering | This phase (15), per D-05 | `app/(industry)/layout.tsx` retired; its 3 links redistribute into existing Vault-nav rooms |

**Deprecated/outdated:**
- `app/(industry)/layout.tsx`: retired per D-05 — its topbar nav is replaced entirely by the unified `ArtistNav` sidebar.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A join table (`capability_grants`) is the right schema mechanism, not an array column | Standard Stack / Architecture Patterns | This is explicitly flagged in CONTEXT.md as "Claude's Discretion" — the planner is free to choose an array column instead; if chosen, the request/approval workflow needs a separate table anyway (a `capability_requests` table alongside a `capabilities TEXT[]` column), which is closer to two-tables-instead-of-one than a real alternative. Low risk either way since CONTEXT.md explicitly defers this decision to the planner. |
| A2 | `member_type` should be kept, not deprecated, as the "primary/lead capability" | Summary, State of the Art | If the planner decides to fully replace `member_type` with a derived "first approved capability" value instead, existing code reading `member_type` directly (admin list queries, `ArtistProfile` type) would need broader changes than this research assumes. Medium risk — worth confirming with the user/planner since Phase 9's PROFILE-01 (lead role highlighted) already shipped assuming a single primary value exists. |
| A3 | Migrations 034–040 will be live in the target database by the time Phase 15 executes | Runtime State Inventory, Pitfall 3 | If not live yet, the backfill migration fails outright on missing `member_type` column. Must be verified at execution time, not assumed from this research. |
| A4 | New capability-gated routes (opportunity-posting, etc.) should get real server-side capability checks, not just nav hiding | Pitfall 1, Architectural Responsibility Map | This is a recommendation beyond CONTEXT.md's explicit decisions (D-08 only mandates UI hiding). If the user/planner decides nav-hiding alone is sufficient for this phase's scope (matching today's pre-existing gap), this adds unrequested scope. Flagged as an Open Question, not baked into the plan as a hard requirement. |

## Open Questions

1. **Should this phase add real server-side capability enforcement to routes it newly makes dual-accessible (e.g., opportunity posting), or preserve today's nav-only boundary?**
   - What we know: Today, `/api/antenna/opportunities` POST has zero member_type check — any authenticated account can already post. D-08 only specifies UI-hiding behavior.
   - What's unclear: Whether closing this gap is in scope for Phase 15 or a separate hardening concern.
   - Recommendation: Raise with the user during plan-checking/discuss — recommend adding the check since this phase is the one formalizing "capability" as a real permission concept; leaving the gap open undermines the model's credibility, and the fix is small (one `hasCapability()` call per route).

2. **Exact URL/route-nesting for the Antenna Post/Manage-postings section (D-07)**
   - What we know: D-07 says these fold into the existing `/antenna` room "rather than getting a separate sidebar item" — a nav/IA decision, clearly resolved.
   - What's unclear: Whether the underlying page URLs (`/opportunities`, `/opportunities/new`) must also move (e.g., to `/antenna/post`) or whether they can stay at their current URLs while only the route-group wrapper and nav placement change.
   - Recommendation: Keep URLs stable (`/opportunities*`) and only move the route-group wrapper (`(industry)` → `(artist)`) — lowest risk, zero broken links/bookmarks, and D-07's requirement (one room, contextual sections) is satisfiable via nav placement + in-page tab/section design without a URL rename. Confirm with planner/user if a URL rename is actually desired for IA clarity.

3. **Does `capability_grants.role_slugs` (D-11's request-time badge pick) need its own admin edit UI, or is `INDUSTRY_ROLE_GROUPS` chip reuse (already decided) sufficient end-to-end?**
   - What we know: D-11 says the request form itself collects the badge pick, reusing `MembersAdmin.tsx`'s chip picker.
   - What's unclear: Whether the *admin approval queue* UI needs to let the admin override the requester's role pick before approving, or just display it read-only.
   - Recommendation: Read-only display with the pre-picked roles is sufficient for D-11's stated scope ("badge is already chosen and ready to attach") — no override UI needed unless the user requests it during planning.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.4.2 + ts-jest 29.4.11 |
| Config file | `jest.config.js` (root) |
| Quick run command | `npx jest __tests__/<new-test-file>.test.ts` |
| Full suite command | `npx jest` |

### Phase Requirements → Test Map
No REQUIREMENTS.md IDs exist for this phase (predates that scoping, per phase description). The planner should define phase-local acceptance checks in PLAN.md instead. Suggested behaviors to cover, mapped to the closest existing test pattern (`__tests__/schema-stems-instrumental.test.ts` is the only precedent — a pure-function unit test against a `lib/` module):

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|--------------------|--------------|
| Instant industry→artist grant inserts an `'approved'` row, no admin path | unit | `npx jest __tests__/capability-grant.test.ts -t "instant grant"` | ❌ Wave 0 |
| Artist→industry request inserts a `'pending'` row, does not grant access until approved | unit | `npx jest __tests__/capability-grant.test.ts -t "pending request"` | ❌ Wave 0 |
| Duplicate pending/approved request for same (profile, capability) is rejected by the partial unique index | integration (requires a live/test DB) | manual or `supabase db push` to a local/test project + direct SQL insert test | ❌ Wave 0 — no local Supabase test DB confirmed wired up |
| `ArtistNav` hides Antenna Post section when `capabilities` lacks `'industry'` | unit (component) | No React Testing Library / component-test setup detected in this repo — likely manual/visual verification only | N/A — no component test infra exists |
| `hasCapability()` returns false for a `'pending'`-only grant | unit | `npx jest __tests__/capability-check.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest __tests__/capability-*.test.ts` (fast, pure-function subset)
- **Per wave merge:** `npx jest` (full suite — currently only 1 pre-existing test file, so this remains fast)
- **Phase gate:** Full suite green before `/gsd-verify-work`; RLS/partial-unique-index behavior needs a manual `supabase db push` + direct SQL verification pass since there is no automated Postgres-integration test harness in this project today (consistent with Phase 8's own migration-push verification gap).

### Wave 0 Gaps
- [ ] `__tests__/capability-grant.test.ts` — covers instant-grant and pending-request insert behavior (pure function, mockable service client)
- [ ] `__tests__/capability-check.test.ts` — covers `hasCapability()` status filtering
- [ ] No component-testing framework exists for `ArtistNav`'s conditional rendering — this phase does not need to introduce one, but the planner should note that nav-visibility changes are manual/visual-verification only, consistent with how this project has always verified UI (no React Testing Library / Playwright detected anywhere in `package.json`)
- [ ] No local Supabase test-DB harness exists to automate RLS/partial-unique-index verification — this is a pre-existing project-wide gap (Phase 8 also hit it), not something Phase 15 alone should be expected to close

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Unchanged — this phase does not touch login/session mechanics |
| V3 Session Management | No | Unchanged |
| V4 Access Control | Yes | This phase's entire purpose is an access-control model change. Every new route (`/api/capabilities/request`, `/api/capabilities/approve/[grantId]`) must independently re-verify the caller's identity (own-account for requests, `verifyAdmin()` for approvals) server-side — never trust a client-supplied `profile_id` |
| V5 Input Validation | Yes | `capability` field must be a strict enum check (`'artist' | 'industry'`), `role_slugs` validated against `ALL_INDUSTRY_ROLE_SLUGS` via the existing `isValidRoleSlugList()` helper (`lib/industry/roleMapping.ts`) |
| V6 Cryptography | No | Not applicable — no new secrets/tokens introduced |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Client sends an arbitrary `profile_id` to grant itself a capability | Elevation of Privilege | Server route must derive the acting user from the authenticated session (`auth.getUser()`), never accept `profile_id` from the request body for the *requester's own* grant; only the admin-approval route accepts a target id, and only after `verifyAdmin()` passes |
| Direct PostgREST write to `capability_grants` bypassing the API route's business logic (e.g., inserting `status='approved'` directly for an artist→industry request) | Tampering | Column-level `REVOKE INSERT/UPDATE ... GRANT` restricted so `authenticated` callers can only `INSERT` a `'pending'` row for `capability='industry'` requests (never `'approved'` directly) and can never `UPDATE` `status` themselves — only `service_role` (via the approval route) can flip `pending → approved` |
| Sidebar hides an action but the underlying route has no matching check (see Pitfall 1) | Elevation of Privilege | Add `hasCapability()` server-side check to any route this phase decides to newly capability-gate; do not rely on nav visibility alone |
| Race: two concurrent requests for the same (profile, capability) both succeed, creating duplicate pending rows | Tampering / Repudiation | The partial unique index (`capability_grants_active_uniq`) enforces this at the database level — the second concurrent insert fails with a constraint violation, which the API route should catch and return a friendly "already requested" response (mirrors how `connections`' partial unique index is expected to behave, per migration 035's own design comment) |

## Sources

### Primary (HIGH confidence — codebase-internal, directly read this session)
- `supabase/migrations/034_member_identity_wave4.sql` — `member_type` column + CHECK constraint definition
- `supabase/migrations/035_connections_blocks.sql` — direct precedent for the request/approve state-machine table shape, partial unique index, column-level UPDATE lockdown
- `supabase/migrations/039_handle_new_user_industry_branch.sql` — atomic-metadata-at-creation pattern (and why it does NOT map onto this phase's grant-onto-existing-account flow)
- `supabase/migrations/040_artist_profiles_column_privileges.sql` — column-privilege REVOKE/GRANT doctrine
- `lib/industry/createIndustryMember.ts`, `lib/industry/roleMapping.ts` — reusable badge-mapping function, admin-invoked account-creation precedent
- `app/api/admin/members/route.ts`, `components/admin/MembersAdmin.tsx` — admin approval-surface pattern to extend
- `components/nav/ArtistNav.tsx`, `app/(artist)/layout.tsx`, `app/(industry)/layout.tsx` — nav unification target and retirement target
- `middleware.ts` — confirmed no `member_type`-based routing assumptions exist (route protection is purely path-prefix based)
- `app/api/antenna/opportunities/route.ts`, `app/(industry)/opportunities/page.tsx`, `app/(industry)/opportunities/new/page.tsx` — confirmed today's opportunity-posting has zero capability check (grep + direct read)
- `types/index.ts` (ArtistProfile type), `lib/profile/load.ts` — confirmed no component branches on `member_type` for rendering anywhere in the codebase (grep audit: zero hits for `.member_type` outside migrations/admin-list/type-def)
- `.planning/STATE.md` — confirmed migrations 034–040 not yet pushed to any live database (Blockers/Concerns section)
- `.planning/phases/08-identity-schema-foundation/08-VERIFICATION.md` (referenced via STATE.md; not independently re-read this session but its conclusion is corroborated by STATE.md's own Blockers/Concerns entry)
- `jest.config.js`, `package.json` — test framework and script inventory

### Secondary (MEDIUM confidence — WebSearch verified against official docs)
- [Next.js Route Groups documentation](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups) — confirms route groups are purely organizational (moving files between them doesn't change URLs)
- [Next.js Route Groups — This Dot Labs](https://www.thisdot.co/blog/next-js-route-groups) — confirms shared-layout / multiple-root-layout mechanics, and the full-page-reload caveat only applies when route groups define *different* root layouts (not the case in this repo)

### Tertiary (LOW confidence — general pattern guidance, not project-specific)
- [Laravel Daily — Multiple Roles per User](https://laraveldaily.com/lesson/roles-permissions/multiple-roles-per-user) and [Laracasts discussion](https://laracasts.com/discuss/channels/design/laravel-with-multiple-role-user-is-my-database-design-ok) — general pivot-table-vs-array-column tradeoff framing (framework-agnostic, cited only to corroborate the join-table recommendation's general soundness; the actual decision basis is this project's own `connections` table precedent, which is HIGH confidence)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; every pattern cited is read directly from this repo's own migrations/code this session
- Architecture: HIGH — grant-table shape is a direct structural mirror of an existing, working, reviewed table (`connections`); route-group relocation is confirmed safe via official Next.js docs
- Pitfalls: HIGH — Pitfalls 1 and 3 are grounded in directly-observed gaps (grep audit of `member_type` usage; STATE.md's explicit migration-push status), not speculation

**Research date:** 2026-07-07
**Valid until:** Effectively unbounded for the architectural recommendations (internal codebase precedent doesn't go stale on a calendar), but re-verify Assumption A3 (migrations 034–040 live status) at the start of Phase 15 execution regardless of how much time has passed, since that fact is time-dependent, not documentation-dependent.
