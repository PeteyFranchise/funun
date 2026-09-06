# Phase 38: Member Organization & Team Workspaces - Research

**Researched:** 2026-09-05
**Domain:** Multi-tenant workspace layer over an existing single-tenant Supabase/Next.js 15 app — RLS extension, granular permission modeling, in-session multi-context routing, org billing
**Confidence:** MEDIUM-HIGH — the RLS/membership/audit patterns are HIGH confidence (directly verified against this repo's own prior migrations, which this phase explicitly extends). The org-billing and URL-routing patterns are MEDIUM confidence (well-established industry patterns, but new to this codebase). Counsel-gated vocabulary (D-37) and the kill-switch recommendation are explicitly out of this research's authority.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

55 decisions (D-01..D-55) are LOCKED and owner-approved. This research does not re-litigate any of
them; it researches HOW to implement them. Full text lives in
`.planning/phases/38-member-organization-team-workspaces/38-CONTEXT.md` `<decisions>`. Highlights
directly shaping this research: D-01/D-02 (one `workspaces` entity, independent capability flags,
never authorization); D-03/D-06 (never auto-provisioned; any Member may create any type); D-11..D-14
(five roles, pending-seat invites, never-zero-owners, removal preserves history); D-15..D-18 (roster
relationships: multiplicity, optional-then-required evidence, unilateral revocation); D-19..D-22
(granular DB permissions, two-tier operational/authority split, always-attributed acting-on-behalf,
no impersonation); D-23..D-29 (attachment not copy, no `owner_workspace_id`, custody ≠ rights
ownership, two-sided custody transfer); D-30..D-33 (URL-carried workspace, server-resolved every
request, sign-out-free switching for Members, unchanged staff boundary); D-36..D-43 (rights-holder
declares scope, never "verified," propose-then-confirm rights edits, structural payout exclusion,
no new split-sheet path); D-44..D-47 (workspace is its own billable entity, free/metered during
beta); D-48..D-51 (RLS workspace branch via existing helper pattern, server-side grant subset check,
member-side append-only audit, abuse controls); D-52..D-55 (`project_members` untouched, zero
migration risk for existing members, legacy fields untouched, cohort-scoped beta flag).

### Claude's Discretion

- Preset bundle contents and names (D-19) — must be editable and never hardcoded to role names.
- Roster card layout and which signals lead per professional role (D-35).
- How Roster and Activity tabs share data without contradicting each other (D-32).
- Membership state-machine mechanics, given the required states (pending, active, suspended,
  removed, expired).

### Deferred Ideas (OUT OF SCOPE)

- Kill switch / platform-wide disable control — raised, not selected (D-55); re-raise at planning,
  recorded under Risks in CONTEXT.md. **No decision was made in this research either — this
  research surfaces the same open question and does not resolve it.**
- Client Partner multi-organization membership — unaffected by this phase.
- Corporate-to-personal verified credential linking — a separate authentication build.
- Legacy field removal (`member_type`, `industry_roles`, `capability_grants`) — its own audited
  cleanup phase (D-54).
- Workspace verification operations (process, evidence, queue ownership) — undefined (D-04).
- Workspace-local annotations (private pipeline notes on a shared project) — rejected at D-26.
- Read-only "view as member" mode — rejected at D-22 as impersonation-shaped.
- Third "sensitive" permission tier — declined twice (D-21, D-40) in favour of bundle exclusion.
- A&R-facing member CRM — the separate discussion that surfaced this phase; still unplanned.

**Explicit non-goals restated for this research:** pricing/tiers, any earnings/royalty feature,
document parsing or verification, legacy field removal, `project_members` semantics changes,
`buyer_orgs` reuse for creative workspaces (already reviewed and rejected — see CONTEXT.md
"architecture review, finding 8").
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Requirement | Research Support |
|----|-------------|------------------|
| WS-01 | `workspaces` entity: type + independent capability flags | Architecture Patterns Pattern 1 (table shape follows the existing `vault_projects`/`works` single-owner-table convention); Recommended Project Structure |
| WS-02 | Workspace creation, unverified state, verification as separate auditable state | Don't Hand-Roll (never-zero-owners trigger pattern reusable for state guards generally); explicitly rejects `buyer_orgs`' born-verified default (Alternatives Considered) |
| WS-03 | Workspace membership: 5 roles, states incl. expired, never-zero-owners | Code Examples (never-zero-owners trigger); Pitfall 6 (migration numbering for the foundation migration) |
| WS-04 | Invitations: pending seat, email binding, service-only reconciliation, expiry | Sources Primary (`find_auth_user_id_by_email`, migration 177) directly reusable |
| WS-05 | Roster relationships: inert claim, acceptance, multiplicity, dates, unilateral revocation | Code Examples (roster relationship state machine, pure-logic pattern) |
| WS-06 | Agreement evidence ladder + rights-holder-declared scope | Open Question 2 (compute-on-read vs. stored document-supported state) |
| WS-07 | Granular permission model with editable preset bundles | Pattern 3 (pure-logic permission core); Pitfall 3 (bundle/DB drift) |
| WS-08 | Two-tier operational/authority separation, incl. bundle-excluded sensitive permissions | Pattern 3 code example (`PERMISSION_TIER`, `BUNDLE_EXCLUDED`, `STRUCTURALLY_EXCLUDED`) |
| WS-09 | Project attachment; workspace catalogue as a query, never a copy | Pattern 1 (three-hop helper); Open Question 4 (`workspace_attachments` shape) |
| WS-10 | Workspace-created projects born held by the subject Member | Architectural Responsibility Map (project record stays Member-held) |
| WS-11 | Read-only "Appears on" shelf for contributed records | Open Question 3 (extend Phase 21's Shared-with-me query, don't fork it) |
| WS-12 | Two-sided, logged record-custody transfer | Don't Hand-Roll (append-only audit pattern); Sources (migration 172 trigger-guard precedent) |
| WS-13 | URL-carried active workspace, server-resolved every request | Pattern 4 (server-resolved workspace context) |
| WS-14 | Persistent workspace chrome + server-side acting-context re-check on writes | Anti-Patterns ("client-sent workspaceId trusted without re-derivation") |
| WS-15 | Roster + Activity tabs; role-aware roster cards | Claude's Discretion note; out of RLS/data-model risk surface, low research need |
| WS-16 | Instant in-session switching; staff boundary unchanged | Pattern 4; Pitfall 4 (cross-tab bleed) |
| WS-17 | Contract Locker workspace shelf + provenance vocabulary (never "verified") | Counsel-gated — flagged, not resolved, in Dependencies/Risks (this research does not set vocabulary) |
| WS-18 | Authority lapses on document expiry; operational persists | Open Question 2 |
| WS-19 | Rights-information propose-then-confirm | Standard Stack / Validation Architecture (reuse `lib/profile/claim-prefill.ts` pattern verbatim) |
| WS-20 | Structural exclusion of payout/tax data | Pattern 3 (`STRUCTURALLY_EXCLUDED`); Security Domain (column-level REVOKE precedent, migration 090) |
| WS-21 | Workspace billing entity; lapse → read-only, nothing destroyed | Pattern 5 (Stripe org billing shape) |
| WS-22 | Usage metering tracked, not enforced, during beta | Pattern 5 recommendation (counters-only, defer live Stripe objects) |
| WS-23 | RLS workspace branch in SECURITY DEFINER helpers | Pattern 1 + Pattern 2 (the phase's central research finding) |
| WS-24 | Grant subset check at grant time and at use time | Pattern 3 code example (`isSubsetGrant`) |
| WS-25 | Member-side immutable audit trail, visible to both sides | Don't Hand-Roll (append-only REVOKE pattern, migration 089 precedent) |
| WS-26 | Abuse controls: rate limits, expiry, member-side block | Sources Primary (`lib/security/rate-limit.ts` — durable Postgres-backed limiter, directly reusable) |
| WS-27 | Cohort-scoped server-side beta flag; personal paths untouched | Sources Primary (migration 156 `song_passport_cohorts` — directly reusable shape) |
| WS-28 | Documentation updates: ACCOUNT-TYPES.md + The Playbook | Out of code-research scope; content drafting is a planning/execution task, not a research task |
| WS-29 | Master-ownership claims + D-08 evidence-derived label access | Bounded by custody doctrine D-01/D-02/D-08 (read in full — see canonical_refs in CONTEXT.md); no new research needed beyond what custody doctrine already specifies |
| WS-30 | Attributed acting-on-behalf; no impersonation anywhere | Security Domain (STRIDE: Spoofing mitigation — dual-identity audit rows) |
</phase_requirements>

## Summary

Phase 38 is not a new technology — it is the fourth application of a pattern this repo has already
built three times: a "guest list" join table (`project_members` — 078, `work_members` — 136,
`buyer_members` — 080) paired with SECURITY DEFINER helper functions that let RLS policies on the
owning table and its children see across the join without recursing. D-48 explicitly asks the
planner to extend that same helper family — `is_project_owner`/`project_member_role` and their
`is_work_owner`/`work_member_tier` siblings — with a *workspace* branch, so `vault_projects`,
`tracks`, `vault_assets`, `vault_documents`, and `tool_outputs` inherit workspace access with zero
policy rewrites on those five tables. This is well-trodden ground in this specific repo: three
prior phases (21, 37.1, 16) hit and fixed the exact 42P17 recursion class this migration must avoid
from day one, and Postgres's own optimizer behavior (`(SELECT function(...))` wrapping to force an
InitPlan) is what makes a fourth, more expensive helper branch affordable per-row.

What is genuinely new territory for this codebase: (1) a granular ~20-permission model that must be
efficiently checkable *inside* a SECURITY DEFINER helper rather than just at an API boundary — the
existing `work_members`/`project_members` tables only ever expressed 2-4 named roles, never
per-permission grants; (2) in-session multi-context switching — every existing "switch" in this app
(`AccountContextSwitch.tsx`) is actually a sign-out + re-login, which D-33 explicitly forbids for
workspaces; and (3) organization-level Stripe billing — `subscriptions.user_id` carries a hard
`UNIQUE NOT NULL` constraint today, so workspace billing is an additive, parallel table and
resolution path, never a relaxation of that constraint.

**Primary recommendation:** Build Slice A (workspaces + membership + helper *scaffolding*) and
Slice C's pure permission core FIRST and in parallel — they have no runtime dependency on each
other — then let the RLS workspace branch (Slice D) consume both. Do not let the RLS migration be
the first place the permission model's storage shape is decided; decide the shape in a pure,
unit-tested TypeScript module before a single policy references it, exactly as
`lib/client-partners/health.ts` and `lib/selects/stage-machine.ts` do today.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Workspace CRUD, membership, roles | API / Backend | Database / Storage | Service-role routes own every write per the house "guest-list tables are never client-writable" doctrine (078, 136, 080); DB stores state + RLS enforces read boundary |
| Permission grant storage + subset check | Database / Storage | API / Backend | Grants must be readable from inside a SECURITY DEFINER RLS helper (DB), but *issuing* a grant (D-49 subset check) is a service-route business rule, not a DB constraint alone |
| RLS workspace branch (D-48) | Database / Storage | — | Structural access boundary; must never depend on application-layer filtering (custody D-04's "hiding a button is never sufficient" doctrine) |
| Active-workspace resolution (D-30) | Frontend Server (SSR) | API / Backend | Resolved server-side on every request per D-30; API routes independently re-derive it per D-31 (never trust a client-sent workspace id) |
| Workspace chrome / switcher UI | Browser / Client | Frontend Server (SSR) | Visual identity only — D-31 explicitly requires this NOT be the security boundary |
| Roster relationship lifecycle (accept/refuse/block) | API / Backend | Database / Storage | Notification + state-machine logic belongs in service routes; DB stores the state and its never-zero-owners / uniqueness invariants |
| Agreement evidence ladder (D-16, D-36) | API / Backend | Database / Storage | "Rights holder declares scope" is a business action recorded via API; DB is the evidence store, never a parser |
| Workspace billing entity | API / Backend | Database / Storage | Stripe webhook + resolution logic in `lib/`; DB is the source of truth for plan/lapse state so a Stripe outage never blocks reads |
| Member-side audit trail (D-50) | Database / Storage | API / Backend | Append-only insert triggered by the same service routes doing the action, mirroring `logStaffAction` — but the record itself must be DB-enforced immutable |
| Clean-master download exclusion (D-08/D-40) | Database / Storage | API / Backend | Structural — must be provably unreachable from workspace-derived RLS paths, not merely unbundled in UI |

## Standard Stack

### Core

No new external packages are required. This phase is architecture over the existing stack:

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.45.0 (in use) | DB/auth client, unchanged | Already the project's sole DB access layer |
| `stripe` | 17.7.0 (in use) | Server-side Stripe SDK for the new org-billing Customer/Subscription objects | Already integrated for Connect (`lib/stripe/connect.ts`); org billing is a *second* use of the same SDK, not a new dependency |
| `zod` | 3.23.0 (in use) | Validating workspace/grant/invite API payloads | House convention for every API input |
| Next.js | 15.0.0 (in use) | `/w/[workspaceId]/...` dynamic route segment, server-resolved | App Router dynamic segments are the standard mechanism [CITED: nextjs.org/docs/app/building-your-application/routing/dynamic-routes] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| PostgreSQL `SECURITY DEFINER` functions (native, no library) | n/a | RLS workspace-branch helpers | Only mechanism proven in this repo to avoid the 42P17 recursion class (064, 078, 136) |
| `resend` | 4.0.0 (in use) | Invitation + roster-claim notification emails | Already the project's transactional-email provider |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Granular permission join table (permission enum × relationship/grant id) | Bitmask integer column | Bitmask is faster to check in a hot RLS path but is opaque in the DB, hard to audit per-permission (D-50 needs a named permission per audit row), and brittle to extend past 63 flags. Rejected — auditability and D-19's "editable preset bundles" requirement both favor a readable join table. |
| Granular permission join table | JSONB permissions array on the relationship row | Cheap to add ad hoc but not efficiently indexable/queryable from inside a STABLE SQL helper the way a normalized table with a covering index is; also harder to enforce D-49's subset check with a SQL constraint. Rejected for the DB layer; JSONB remains fine for the UI-facing preset-bundle *definition*, which is not itself security-relevant. |
| One `workspaces` table with `workspace_type` (D-01, LOCKED) | Separate tables per workspace type | Already rejected by D-01/D-02 — capabilities are independent flags, not exclusive types. Not open for reconsideration. |
| URL-path workspace segment (D-30, LOCKED) | Subdomain-per-workspace | Already implicitly rejected by D-30's explicit choice of URL path over any other mechanism; subdomains would also require new DNS/TLS/Vercel routing work with no corresponding benefit at this scale. |
| Stripe Billing Customer = workspace | Stripe Billing Customer = existing per-user customer with multiple subscriptions | A workspace can have multiple member-owners and must survive any single member leaving (D-46: billing must never destroy rights evidence) — tying the billing Customer to a person's own Stripe Customer object couples workspace continuity to one member's account lifecycle. One Customer per workspace, entirely separate from `subscriptions.stripe_customer_id`, is the standard multi-tenant SaaS pattern [CITED: Stripe Billing multi-tenant guidance — see Sources]. |

**Installation:** None — no new packages.

**Version verification:** `stripe` 17.7.0 and `@supabase/supabase-js` 2.45.0 are already pinned in
`package.json` and installed; no registry lookup was performed because no new package is being
added. If the planner later decides a small permission-bundle-definition library is warranted, run
`npm view <package> version` before adding it and re-run the Package Legitimacy Gate below.

## Package Legitimacy Audit

**No new external packages are introduced by this phase.** Every capability (workspace CRUD,
permission storage, RLS helpers, Stripe org billing, URL routing) is built on packages already
present in `package.json` and already vetted in prior phases. The Package Legitimacy Gate therefore
has nothing to check this phase.

**Packages removed due to [SLOP] verdict:** none — none proposed.
**Packages flagged as suspicious [SUS]:** none — none proposed.

## Architecture Patterns

### System Architecture Diagram

```text
                     ┌─────────────────────────────────────────────┐
                     │  Browser: workspace switcher (chrome only)   │
                     │  — visual identity, NEVER the auth boundary  │
                     └───────────────────┬───────────────────────────┘
                                          │ navigates to /w/[workspaceId]/...
                                          ▼
        ┌───────────────────────────────────────────────────────────────┐
        │ Next.js Server: /w/[workspaceId]/layout.tsx (Server Component) │
        │  1. auth.getUser() — who is acting                             │
        │  2. resolveWorkspaceContext(workspaceId, userId) — SERVER-SIDE │
        │     re-derives membership + role + grants EVERY request (D-30) │
        │  3. fail closed → redirect if not an active member             │
        └───────────────────┬─────────────────────────────────────────────┘
                             │ acting-workspace context (id, role, grants)
                 ┌───────────┴────────────┐
                 ▼                        ▼
      ┌─────────────────────┐   ┌──────────────────────────────┐
      │ Server Component     │   │ API route (mutations)         │
      │ pages under /w/...   │   │ requireMemberApiAccount() +    │
      │ read via Supabase    │   │ requireWorkspaceAccess() —     │
      │ client (RLS-scoped)  │   │ RE-CHECKS acting context on    │
      └──────────┬────────────┘   │ EVERY write (D-31, D-49)       │
                 │                └───────────────┬────────────────┘
                 ▼                                 ▼
      ┌─────────────────────────────────────────────────────────────┐
      │ PostgreSQL — RLS policies on vault_projects, tracks,          │
      │ vault_assets, vault_documents, tool_outputs                   │
      │                                                                │
      │  policy USING (                                                │
      │    is_project_owner(id, uid)                                   │
      │    OR project_member_role(id, uid) IS NOT NULL   -- existing   │
      │    OR workspace_project_permission(id, uid, 'view') -- NEW D-48│
      │  )                                                              │
      │                                                                │
      │  workspace_project_permission() is SECURITY DEFINER, STABLE,   │
      │  reads workspace_attachments + workspace_grants + roster       │
      │  relationships — NEVER re-enters vault_projects' own policies  │
      └─────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
lib/
├── workspaces/
│   ├── types.ts                # WorkspaceType, WorkspaceRole, MembershipState unions
│   ├── permissions.ts          # PERMISSION catalogue, tiers, bundle definitions — PURE
│   ├── grants.ts                # subset-check pure logic (D-49) — PURE, unit-tested first
│   ├── roster.ts                # relationship state machine (accepted/document-supported/...) — PURE
│   ├── context.ts               # resolveWorkspaceContext() — the ONE server-side resolver (D-30)
│   ├── audit.ts                 # logWorkspaceAction(), mirrors lib/staff/audit.ts's logStaffAction
│   └── billing.ts               # workspace plan resolution, lapse → read-only
app/
├── w/
│   └── [workspaceId]/
│       ├── layout.tsx           # server-resolves context, renders persistent chrome (D-31)
│       ├── roster/page.tsx      # D-32 Roster tab (default landing)
│       └── activity/page.tsx    # D-32 Activity tab (sibling)
app/api/
├── workspaces/
│   ├── route.ts                 # create (D-06: any Member may create any type)
│   ├── [workspaceId]/
│   │   ├── members/route.ts     # invite, pending seat (D-12)
│   │   ├── roster/route.ts      # inert claim → accept/refuse/block (D-05, D-51)
│   │   ├── grants/route.ts      # issue/narrow a grant, subset-checked server-side (D-49)
│   │   └── attachments/route.ts # project attachment/detachment (D-23..D-26)
supabase/migrations/
├── 182_workspaces_foundation.sql       # Slice A
├── 183_workspace_roster_relationships.sql  # Slice B
├── 184_workspace_permissions_grants.sql    # Slice C (tables only; RLS lands with D)
├── 185_workspace_rls_extension.sql         # Slice D — THE security-critical migration
├── 186_workspace_billing.sql               # Slice H
└── 187_workspace_beta_flag.sql             # Slice I
```

### Pattern 1: SECURITY DEFINER helper pair, extended with a third state (not just a second table)

**What:** Every prior guest-list phase (064, 078, 136, 080) solved a *two*-table recursion: table A
("the record") and table B ("the guest list"), each needing to read the other's RLS-gated state.
D-48 asks for a *three*-hop read: `vault_projects` → `workspace_attachments` (does a workspace reach
this project?) → `workspace_grants` (does this workspace member have grant X?) → `roster
relationships` (is the relationship still active/document-supported?). Every hop in that chain must
happen inside ONE SECURITY DEFINER function so the rewriter never re-enters any RLS-protected table
along the way.

**When to use:** Any time a policy needs to answer a question that spans more than one table, whichever of those tables also has its own RLS policies.

**Example:**
```sql
-- Source: pattern generalized from supabase/migrations/078_project_members.sql and
-- 136_work_members.sql (both in this repo), extended per D-48's three-hop requirement.
CREATE OR REPLACE FUNCTION public.workspace_project_permission(
  p_project_id UUID, p_uid UUID, p_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_attachments attachment
    JOIN public.workspace_members member
      ON member.workspace_id = attachment.workspace_id
     AND member.user_id = p_uid
     AND member.status = 'active'
    JOIN public.workspace_grants grant_row
      ON grant_row.workspace_id = attachment.workspace_id
     AND grant_row.permission = p_permission
     AND (grant_row.project_id IS NULL OR grant_row.project_id = p_project_id)
    WHERE attachment.project_id = p_project_id
  )
$$;

REVOKE EXECUTE ON FUNCTION public.workspace_project_permission(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_project_permission(UUID, UUID, TEXT) TO authenticated;
```
Then, per D-48, existing policies gain ONE additional `OR` clause — no rewrite of the policy's
existing owner/member branches:
```sql
-- vault_projects_select_owner_or_member, EXTENDED (078's policy, +1 clause):
USING (
  (SELECT auth.uid()) = user_id
  OR (SELECT public.project_member_role(id, auth.uid())) IS NOT NULL
  OR (SELECT public.workspace_project_permission(id, auth.uid(), 'view_project'))
)
```

### Pattern 2: `(SELECT function(...))` wrapping is not optional — it is the performance control

**What:** Postgres treats a bare `function(col)` call inside a policy's `USING` clause as a
per-row `SubPlan`. Wrapping it as a scalar subquery, `(SELECT function(col))`, makes the planner
emit an `InitPlan` instead, which for STABLE functions is evaluated once per statement (when the
arguments do not vary per row — true here, since the argument is `auth.uid()`, constant for the
whole statement) rather than once per row [CITED: Supabase RLS Performance and Best Practices,
supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv]. Real-world
measurements cited in that guide show this can be the difference between multi-second and ~40ms
query times.

**When to use:** Every single call site of every workspace RLS helper, with no exceptions. This
repo already enforces the discipline structurally: migration 136's own comment says
`__tests__/migration-136.test.ts` asserts the wrapping textually so "a later hand-edit that inlines
an EXISTS fails the suite rather than production." **Recommend the same textual assertion test for
migration 185 (the D-48 RLS extension).**

**Caveat for D-48 specifically:** `workspace_project_permission()`'s argument list includes
`p_project_id`, which DOES vary per row when the policy scans multiple projects (e.g., a workspace
catalogue query across many `vault_projects` rows). In that case Postgres cannot treat it as a
single per-statement InitPlan — it degrades back toward a per-row evaluation. This is the "per-row
performance" risk D-48 explicitly flags. Mitigation: ensure `workspace_attachments` and
`workspace_grants` both carry a covering index on `(workspace_id, project_id)` /
`(workspace_id, permission, project_id)` so each per-row invocation is an index-only lookup, not a
sequential scan — the function itself stays cheap even if it cannot be fully hoisted to once-per-
statement. **This must be measured (EXPLAIN ANALYZE against a seeded multi-hundred-project
workspace) before rollout, not assumed.**

### Pattern 3: Pure-logic permission core before any RLS or route touches it

**What:** This repo has a proven three-times-repeated convention: business logic that must be
correct and independently testable is written as a pure TypeScript module with no I/O — no
Supabase import, no network call — and only THEN wired into an RSC page or API route.
`lib/client-partners/health.ts`, `lib/client-partners/columns.ts`, `lib/selects/stage-machine.ts`,
and `lib/crate-requests/ranking.ts` all state this convention explicitly in their own header
comments, each citing the others as precedent.

**When to use:** WS-07/WS-08 (permission catalogue, bundles, tier split) and WS-24 (grant subset
check) are exactly this shape — logic that has no business touching a database in its own unit
tests.

**Example:**
```typescript
// Source: pattern from lib/selects/stage-machine.ts (this repo) — legality
// as a pure function over a static edge table, unit-tested with zero I/O.
export const PERMISSION_TIER: Record<WorkspacePermission, 'operational' | 'authority'> = {
  view_summaries: 'operational',
  edit_metadata: 'operational',
  access_clean_masters: 'operational', // D-40: operational tier, but bundle-excluded
  request_signatures: 'authority',
  approve_releases: 'authority',
  manage_payouts: 'authority', // D-42: NEVER actually grantable — see isStructurallyExcluded
  // ...
}

export const BUNDLE_EXCLUDED: ReadonlySet<WorkspacePermission> = new Set([
  'access_clean_masters',
  'view_private_rights_identifiers',
  'view_earnings',
])

export const STRUCTURALLY_EXCLUDED: ReadonlySet<WorkspacePermission> = new Set([
  'manage_payouts', // D-42 — no code path may ever set this true, tested by construction
])

/** D-49: a grant can never exceed what the granter itself holds. */
export function isSubsetGrant(
  requested: ReadonlySet<WorkspacePermission>,
  granterHolds: ReadonlySet<WorkspacePermission>
): boolean {
  for (const permission of requested) {
    if (STRUCTURALLY_EXCLUDED.has(permission)) return false
    if (!granterHolds.has(permission)) return false
  }
  return true
}
```

### Pattern 4: Server-resolved workspace context, never a client-trusted id

**What:** D-30 requires the active workspace be resolved server-side on every request from URL +
authenticated user — never from client state (localStorage, a cookie the client can set, or a
request header). The Next.js App Router mechanism is a dynamic segment `[workspaceId]` whose
`layout.tsx` is a Server Component that calls `auth.getUser()` and then re-derives membership from
the database on every render — the standard multi-tenant Next.js pattern of loading tenant context
once per layout and passing it down via props (not React Context, which cannot cross the
server/client boundary safely for authorization data) [CITED: Next.js dynamic routing docs;
general multi-tenant Next.js pattern — see Sources].

**When to use:** WS-13, WS-14, WS-16.

**Critical gap this phase must close:** `lib/auth/session-identity.ts`'s `AccountWorkspace` union
(`'personal' | 'team'`) and `components/auth/AccountContextSwitch.tsx`'s sign-out-based switch
CANNOT be extended to a third value for workspaces — D-33 explicitly requires workspace switching
be sign-out-free while staff switching stays sign-out-based. These must become two independent
concepts: `AccountClass` (member/client_partner/funun_team, sign-out boundary preserved for staff)
and a NEW, separate `activeWorkspaceId` resolved purely from the URL, never from
`sessionStorage`/`TAB_IDENTITY_KEY`. Do not attempt to fold workspace-switching into the existing
`AccountContextSwitch` component or `session-identity.ts` module — build a parallel, additive
`lib/workspaces/context.ts` instead.

### Pattern 5: Stripe org billing as a second, parallel integration — not a relaxation of `subscriptions`

**What:** `subscriptions.user_id UUID ... UNIQUE NOT NULL` (migration 001, confirmed in the current
schema by direct read) makes the existing table structurally single-tenant-per-person. The standard
multi-tenant Stripe pattern is: one Stripe `Customer` per billing entity, one `Subscription` linking
that Customer to one or more `Price` objects, with quantity-based line items used for seat/roster
counters [CITED: Stripe multi-tenant SaaS billing guidance — see Sources]. D-44 requires the
workspace be its OWN billable entity, so the correct shape is a new `workspace_subscriptions` table
— never a widened `subscriptions.user_id` (which would also violate D-45's requirement that a
workspace never silently consumes a Member's personal plan).

**When to use:** WS-21, WS-22. Given D-47 (free during beta, metered not enforced), the Stripe
`Customer`/`Subscription` objects may not need to be created at all during beta — a `workspace_usage_counters`
table tracking seat/roster/storage/AI/e-sign counts without any live Stripe object is sufficient and
defers the entire Stripe integration surface to the post-beta pricing phase. **Recommend the planner
scope Slice H to counters only, with the `workspace_subscriptions` table's Stripe columns present
but nullable/unused until pricing is decided** — this avoids building throwaway Stripe integration
code before the pricing model (already on hold — see Dependencies) exists.

### Anti-Patterns to Avoid

- **Recursion via bare cross-table EXISTS:** The single most-repeated lesson in this codebase (018,
  064, 078, 136 all hit or pre-empted this). Never write a policy on `workspace_members` that does
  `EXISTS (SELECT 1 FROM workspaces WHERE ...)` while `workspaces`' own policy does
  `EXISTS (SELECT 1 FROM workspace_members WHERE ...)` — always route through a SECURITY DEFINER
  helper, from the first migration, never as a later patch.
- **Deciding the permission storage shape inside the RLS migration:** Slice D's migration should
  *consume* a permission model Slice C already finalized and unit-tested, not invent it inline.
  Writing the enum/table shape for the first time inside a 185_*.sql file with no prior pure-TS
  contract to validate against is how this repo's later migrations end up needing a corrective
  migration (see 085/086/087/088's three-migration repair cycle for a first-pass RLS gate).
- **Treating `AccountContextSwitch.tsx`'s sign-out switch as a template for workspace switching:**
  It is structurally the OPPOSITE of D-33's requirement. Do not "extend" it; build a new mechanism.
- **A general "sign a storage path" accessor reachable from any workspace grant:** custody D-09's
  structural boundary (no public/shared accessor that can sign an arbitrary storage path) applies
  with full force to workspace-derived access. A workspace grant must resolve through the SAME
  narrow, asset-class-specific accessors non-workspace access already uses — never a new, wider one.
- **Client-sent `workspaceId` trusted without server re-derivation:** D-31 requires re-checking
  acting context on every write. An API route reading `workspaceId` from a request body/header and
  trusting it without re-verifying the caller's live membership + grant is the exact "hiding a
  button" failure custody D-04 already prohibits for project-level access.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-table RLS visibility | A bespoke recursive-EXISTS policy pair | The SECURITY DEFINER helper pattern already proven 3x in this repo (064, 078, 136) | Recursion (42P17) is a known, previously-shipped failure class in this exact codebase — reinventing the fix risks reintroducing the bug |
| Never-zero-owners invariant | A UI-only "can't remove the last owner" check | A DB-level guard: either a `CHECK`-adjacent trigger (`BEFORE DELETE/UPDATE` raising an exception) or a service-route transaction with `SELECT ... FOR UPDATE` counting active owners before allowing the removal | D-13 explicitly requires DB/service-layer enforcement, not UI; this repo's `guard_work_graduation_owner_only()` (migration 172) is the exact trigger-guard shape to copy |
| Subset-of-grant checking | An ad hoc per-route permission diff | The pure `isSubsetGrant()` function (Pattern 3 above), called identically at grant-time AND at use-time (D-49) | A single tested function used at both checkpoints guarantees they can never drift out of sync — two independent implementations of "is this a subset" is exactly the kind of duplication that produces the security gap D-49 is trying to prevent |
| Seat/usage metering during beta | A live Stripe Subscription with $0 price items | A plain `workspace_usage_counters` table incremented by the same service routes that already perform each action | D-47 explicitly wants tracked-not-enforced; a live Stripe object adds webhook-reconciliation complexity for zero product value until pricing exists |
| Workspace switch UX | A new sign-out/sign-in round trip generalized from `AccountContextSwitch` | A URL navigation to `/w/[workspaceId]/...` plus a server-resolved layout | D-33 requires zero re-auth; the existing switch component's entire mechanism is incompatible by design |
| Append-only audit trail | A regular table with UPDATE/DELETE left open "just in case" | `REVOKE UPDATE, DELETE` from the audit table for all roles including service_role's own application-level discipline, mirroring `staff_audit_log`'s zero-policy RLS + REVOKE ALL from anon/authenticated (migration 089) | An audit trail that can be edited is not evidence; D-50 explicitly requires append-only, and this repo already has the exact REVOKE pattern to copy |

**Key insight:** every "don't hand-roll" item in this phase already has a working, shipped precedent
somewhere in this same repository. The research risk here is not "does a pattern exist" — it is
"will the planner correctly generalize the existing two-table pattern to the three-hop workspace
case without silently reintroducing recursion or an unindexed hot path."

## Common Pitfalls

### Pitfall 1: RLS recursion reintroduced through a fourth, careless path
**What goes wrong:** A policy on `workspace_grants` or `workspace_members` ends up transitively
reading `vault_projects`' own RLS-protected policy (e.g., to check "is this project's owner also a
workspace owner") without going through a SECURITY DEFINER function.
**Why it happens:** The three-hop chain in D-48 (project → attachment → grant → roster) is one hop
longer than any prior helper in this codebase, and it is tempting to write "just one more EXISTS"
inline for a quick check during development.
**How to avoid:** Every new table this phase creates that participates in the access-resolution
chain (`workspace_members`, `workspace_attachments`, `workspace_grants`, roster-relationship table)
must have its OWN SELECT policy that does NOT read any other RLS-protected table directly — only
through a SECURITY DEFINER helper, symmetric to how `project_members_select` in migration 078 reads
`is_project_owner()` rather than `EXISTS (SELECT 1 FROM vault_projects ...)`.
**Warning signs:** `supabase db push` (or a local Postgres smoke test) returning SQLSTATE 42P17 on
ANY authenticated query — not just workspace-related ones, since the recursion is user-independent
and breaks all query rewrites through the affected table.

### Pitfall 2: The workspace branch masks or widens an existing exclusion
**What goes wrong:** The new `OR workspace_project_permission(...)` clause is added to
`vault_projects_select_owner_or_member` etc., but the SAME kind of clause is accidentally NOT
excluded from a policy path that must remain closed — e.g., a clean-master storage accessor, or a
payout/tax column-level `REVOKE`.
**Why it happens:** D-48 says "every policy... picks it up with no policy rewrite" — this is correct
for the FIVE named tables, but the phrase can be over-generalized to mean "add the workspace branch
everywhere," including places (clean-master signing routes, `subscriptions`, any payout-adjacent
table) where custody D-01/D-08/D-40 and D-42 require the workspace branch to be STRUCTURALLY absent.
**How to avoid:** Build an explicit checklist, before writing migration 185, of every table/route the
D-48 branch is added to (five named tables + their child mutation routes) versus every
table/route it must never touch (clean-master storage accessors, `subscriptions`, any future payout
table). Write a negative test asserting `workspace_project_permission` is never called from the
clean-master signing path.
**Warning signs:** A test suite that only tests "workspace access reaches X" and never tests
"workspace access does NOT reach Y" — the phase's acceptance criteria #5/#6 already demand exactly
this negative coverage; don't let it slip to informal review.

### Pitfall 3: Permission bundle definitions drift from the DB enum
**What goes wrong:** The UI's editable preset bundles (D-19) are stored/edited as JSONB or a
TypeScript literal that falls out of sync with the actual `CHECK` constraint or enum backing
`workspace_grants.permission` in the database — a bundle references a permission name the DB no
longer recognizes, or vice versa.
**Why it happens:** Bundles are explicitly "UI sugar" per D-19/D-20, which invites treating them as
a purely front-end concern disconnected from the DB's canonical permission list.
**How to avoid:** Define the permission list ONCE, in the pure TypeScript module (Pattern 3 above),
and generate both the DB `CHECK (permission IN (...))` constraint text and the UI bundle definitions
from that single source — or at minimum, add a migration-content test (this repo's established
`__tests__/migration-NNN.test.ts` string-assertion convention) asserting the DB constraint's literal
value list matches the TypeScript module's exported list.
**Warning signs:** A permission that works in the UI's bundle picker but is silently rejected (or
silently ignored) when actually granted, because the DB constraint doesn't recognize it.

### Pitfall 4: In-session switch bleeds workspace context across browser tabs
**What goes wrong:** Because D-33 requires no re-auth, a naive implementation might cache the
"active workspace" in a place shared across tabs (e.g., a plain cookie without tab-scoping, or
`localStorage`), so switching workspace in Tab A silently changes what Tab B is acting as mid-task —
directly undermining D-31's "wrong-context protection."
**Why it happens:** The existing `AccountContextSwitch` mechanism uses `sessionStorage` +
a full navigation precisely BECAUSE sign-out is involved; once sign-out is removed (D-33), the
temptation is to reach for a simpler shared-state mechanism.
**How to avoid:** D-30 already prescribes the fix: carry the workspace in the URL PATH, not in any
shared client-side store. Two tabs on two different `/w/[workspaceId]/...` URLs are naturally
independent, exactly as `38-CONTEXT.md` states ("Tabs are naturally independent; personal routes
keep existing URLs"). Do not add any cross-tab state layer for this.
**Warning signs:** A workspace switch component that writes to `localStorage` or an un-scoped
cookie rather than performing a `router.push('/w/[id]/...')` navigation.

### Pitfall 5: `handle_new_user()` perturbation
**What goes wrong:** A well-intentioned attempt to auto-provision something workspace-related at
signup (e.g., "give every new member an empty personal Artist Team row") touches
`handle_new_user()`, which this repo has already had to patch multiple times (curator early-return,
buyer early-return, industry branch) and which D-53 explicitly forbids touching for this phase
("nothing automatic... no workspace is provisioned for anyone").
**Why it happens:** `handle_new_user()` is the obvious place to hook "set up defaults for a new
user," and D-03's "solo Artist Team may be created on demand" can be misread as "should be created
at signup."
**How to avoid:** D-03 says explicitly NEVER auto-provisioned, rejecting exactly the
`buyer_orgs.is_personal` pattern this repo already has. Workspace creation is always an explicit,
later, user-initiated action — never wired into the signup trigger.
**Warning signs:** Any diff touching `handle_new_user()`'s SQL body in this phase's migrations.

### Pitfall 6: Migration number collision under parallel wave execution
**What goes wrong:** Two parallel plan executors each draft a migration and both claim `182`.
**Why it happens:** This repo's own history shows this exact collision multiple times (062/063,
064's header notes a Phase 16 collision risk, 077 was reserved-then-removed-then-restored). The
next free number after 181 is **182** — but if slices A, C, and H truly execute in parallel (as the
CONTEXT.md dependency graph allows: H depends only on A, not on B/C/D), more than one plan may try to
claim it simultaneously.
**How to avoid:** Assign migration numbers explicitly per-slice in the PLAN.md files at plan-authoring
time (e.g., 182 = Slice A, 183 = Slice B, 184 = Slice C, 185 = Slice D, 186 = Slice H, 187 = Slice
I), and have each plan's migration file header note the assignment, mirroring how migration 078's
header pre-declares that 079 is reserved for a specific follow-up.
**Warning signs:** `ls supabase/migrations | grep -oE '^[0-9]+' | sort -n | uniq -d` returning any
duplicate.

## Code Examples

> **CORRECTION (2026-09-05, after 38-01/38-02 shipped).** The roster state-machine draft below
> lists `document-supported` as a stored state and Open Question 2 (further down) leaves it open.
> **That question is now RESOLVED: compute-on-read.** The evidence tier is DERIVED at read time in
> `lib/workspaces/evidence.ts` from an accepted relationship plus a live agreement with a declared
> scope (D-16). The shipped `ROSTER_RELATIONSHIP_STATE_VALUES` in `lib/workspaces/types.ts`
> deliberately omits it, and `lib/workspaces/roster.ts` implements the 5-state machine.
> **Migrations must NOT add a `document_supported` column, enum value or stored status.** The draft
> below is preserved as the research record only — read the shipped modules for the real shape.


### Never-zero-owners guard (D-13) — trigger shape to copy

```sql
-- Source: pattern generalized from supabase/migrations/172_audit_integrity_hardening.sql's
-- guard_work_graduation_owner_only() (BEFORE trigger raising an exception), applied to
-- workspace ownership removal instead of graduation linkage.
CREATE OR REPLACE FUNCTION public.guard_workspace_never_zero_owners()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_remaining_owners INT;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'owner')
     OR (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role <> 'owner') THEN
    SELECT COUNT(*) INTO v_remaining_owners
    FROM public.workspace_members
    WHERE workspace_id = OLD.workspace_id
      AND role = 'owner'
      AND status = 'active'
      AND id <> OLD.id;
    IF v_remaining_owners = 0 THEN
      RAISE EXCEPTION 'a workspace must always retain at least one owner'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
```

### Roster relationship state machine (WS-05) — pure logic, mirrors `stage-machine.ts`

```typescript
// Source: pattern from lib/selects/stage-machine.ts (this repo).
export type RosterRelationshipState =
  | 'proposed'          // D-05: inert, grants nothing
  | 'accepted'           // operational grants may be issued
  | 'document-supported' // D-16: authority-tier grants unlocked
  | 'refused'
  | 'blocked'            // D-51
  | 'ended'              // D-17/D-18: terminated or revoked

const LEGAL_EDGES: Record<RosterRelationshipState, ReadonlySet<RosterRelationshipState>> = {
  proposed: new Set(['accepted', 'refused', 'blocked']),
  accepted: new Set(['document-supported', 'ended']),
  'document-supported': new Set(['accepted', 'ended']), // D-39: expiry demotes, doesn't end
  refused: new Set([]),
  blocked: new Set([]),
  ended: new Set([]), // terminal — a new relationship is a new row, never a revival (mirrors D-25)
}

export function isLegalRosterTransition(
  from: RosterRelationshipState,
  to: RosterRelationshipState
): boolean {
  if (from === to) return false
  return LEGAL_EDGES[from]?.has(to) ?? false
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `AccountContextSwitch.tsx`'s sign-out + re-login switch (personal ↔ team, Phase 25/36) | URL-path-carried workspace context, server-resolved, no re-auth | This phase (D-30/D-33) | The two mechanisms coexist permanently — staff keeps the hard boundary (D-33), Members get the soft one. Do not merge them. |
| Two-table guest-list RLS (project_members, work_members, buyer_members) | Three-hop workspace-resolution RLS (project → attachment → grant) | This phase (D-48) | First time this codebase's RLS helper pattern must resolve more than one join hop; per-row cost must be measured, not assumed from the two-hop precedent |
| `subscriptions` (strictly per-user) | `workspace_subscriptions` (new, parallel, per-workspace) | This phase (D-44) | First org-level Stripe billing surface in the codebase; the per-user table is untouched |

**Deprecated/outdated:** none within this phase's scope — `project_members` and `work_members`
remain fully live and untouched per D-52.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A `workspace_grants` table with `(workspace_id, permission, project_id NULLABLE)` plus a covering index is sufficiently performant for the D-48 per-row helper call, without needing a materialized/denormalized permission cache | Architecture Patterns, Pattern 2 | If wrong, the RLS extension could be measurably slower on large catalogues, requiring a caching layer (e.g., a materialized view refreshed on grant change) not currently scoped |
| A2 | Stripe `Customer`/`Subscription` objects can be deferred entirely during beta in favor of plain usage counters (per D-47) with no loss of future flexibility | Architecture Patterns, Pattern 5 | If wrong (e.g., Stripe requires early Customer creation for some later feature), the planner may need to create placeholder Stripe Customers now, adding scope back into Slice H |
| A3 | The next free migration number is 182 and no other in-flight branch has already claimed it | Common Pitfalls, Pitfall 6 | If wrong, colliding migration numbers block a clean `supabase db push`; verify immediately before Slice A's plan finalizes its migration file name |
| A4 | A `workspace_attachments` join table (workspace_id, project_id) is the right shape for D-23's "attachment, never a copy" rather than a column on `vault_projects` | Recommended Project Structure | D-23 already locks "no `owner_workspace_id` column" — this assumption only concerns the attachment table's own shape (e.g., whether it needs a `granted_by`/`created_at` audit pair), which is a minor, low-risk implementation detail |

**If this table is empty:** N/A — see above; all four assumptions are implementation-shape details, not contested facts about locked decisions.

## Open Questions

1. **Exact `workspace_grants` cardinality: per-relationship row or per-(relationship, permission) row?**
   - What we know: D-20 says a grant "attaches to the member↔workspace relationship by default and
     may be narrowed or widened per project." D-19 says permissions are granular in the DB.
   - What's unclear: whether one `workspace_grants` row holds a single permission (many rows per
     relationship) or an array/JSONB of permissions (one row per relationship, or one row per
     relationship+project override).
   - Recommendation: one row per (relationship_id, permission, project_id NULLABLE) — normalized,
     directly indexable, and makes D-49's subset check a simple set-difference query rather than an
     array-diff. This is also what makes D-50's per-permission audit trail natural (log which named
     permission was relied on, not "some permission in a JSONB blob").

2. **[RESOLVED 2026-09-05 — compute-on-read. Derived in `lib/workspaces/evidence.ts`; no stored column. See the correction under Code Examples.]** Where does the "document-supported" state live — on the roster relationship row, or derived
   from a join to the agreement-evidence table?**
   - What we know: D-16 says an agreement is optional to form a relationship but a prerequisite for
     authority-tier permissions; D-39 says authority lapses automatically on document expiry while
     operational persists.
   - What's unclear: whether `document-supported` is a stored state that a scheduled job/trigger
     transitions on expiry, or a computed-on-read value (`is_document_supported()` helper checking
     `agreement.expires_at > now()` at query time).
   - Recommendation: compute-on-read, mirroring this repo's established `computeHealth()`/D-06
     doctrine ("Config save recomputes nothing; the next render just reads the new config row").
     A computed value can never go stale between a cron tick and a request; a stored state requires
     a scheduled job this phase does not otherwise need.

3. **Does the "Appears on" shelf (D-27, WS-11) require its own RLS policy, or is it a query filter
   over the existing `work_members`/`project_members` tables?**
   - What we know: D-27 extends Phase 21's existing Shared-with-me lane, which already excludes
     shared projects from personal dashboard math.
   - What's unclear: whether workspace-derived "Appears on" entries (a contributor added via a
     workspace grant, not a direct `project_members` row) need a NEW query path, or whether
     `workspace_project_permission()` can simply be UNIONed into the existing Shared-with-me query.
   - Recommendation: extend the existing Shared-with-me query with a UNION branch reading workspace
     attachments — do not build a parallel "Appears on" data path. Confirm with Phase 21's actual
     query implementation before Slice D's plan is finalized.

## Environment Availability

Skip condition does not apply — this phase depends on Stripe (already integrated) and Supabase CLI
(already integrated) but introduces no NEW external tool dependency.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI | Migration authoring/testing | ✓ | 1.200.0 (package.json) | — |
| PostgreSQL (via Supabase) | RLS, SECURITY DEFINER helpers | ✓ | Supabase-managed | — |
| Stripe SDK (server) | Workspace billing (Slice H, deferrable per A2) | ✓ | 17.7.0 | Defer live Stripe objects to post-beta per D-47; counters-only table needs no external service |
| Resend | Invitation/roster notification emails | ✓ | 4.0.0 | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Stripe live objects — fallback is "don't create them yet" (A2).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.4.2 (ts-jest 29.4.11) |
| Config file | `jest.config.js` |
| Quick run command | `npx jest lib/workspaces` (or the specific new test file) |
| Full suite command | `npm test` (707+ existing test files; this repo runs the full suite before every merge) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WS-01/02 | `workspaces` table + unverified state | migration-content string-assertion | `npx jest __tests__/migration-182.test.ts` | ❌ Wave 0 |
| WS-03/04 | Never-zero-owners + pending-seat invite | unit (pure) + migration text-assertion | `npx jest lib/workspaces/roster.test.ts` | ❌ Wave 0 |
| WS-05/06 | Roster state machine + evidence ladder | unit (pure) | `npx jest lib/workspaces/roster.test.ts` | ❌ Wave 0 |
| WS-07/08 | Permission catalogue, tiers, bundle exclusions | unit (pure) | `npx jest lib/workspaces/permissions.test.ts` | ❌ Wave 0 |
| WS-09..12 | Attachment/catalogue/custody transfer | integration (RLS smoke against local Postgres) + unit | `npx jest __tests__/migration-185.test.ts` | ❌ Wave 0 |
| WS-13/14/16 | URL routing, server resolution, switch | unit (`resolveWorkspaceContext`) + manual UAT (no headless browser in this repo) | `npx jest lib/workspaces/context.test.ts` | ❌ Wave 0 |
| WS-19 | Rights propose-then-confirm | unit, mirrors `lib/profile/claim-prefill.test.ts` | `npx jest lib/workspaces/rights-propose.test.ts` | ❌ Wave 0 |
| WS-20 | Structural payout exclusion | unit — assert `STRUCTURALLY_EXCLUDED` set membership + a negative RLS test that no grant path returns true for `manage_payouts` | `npx jest lib/workspaces/permissions.test.ts` | ❌ Wave 0 |
| WS-23 | RLS workspace branch, no recursion, adversarial escalation | integration (against local Supabase / test Postgres instance) | `npx jest __tests__/migration-185.test.ts` (text-assertion) + a manual `supabase db reset && psql` adversarial smoke, mirroring `21-RLS-SMOKE-CHECKLIST.md`'s convention | ❌ Wave 0 — this repo has no automated live-Postgres CI; smoke checklists have been the house pattern for every prior RLS phase (078, 136) |
| WS-24 | Grant subset check at grant + use time | unit (pure `isSubsetGrant`) | `npx jest lib/workspaces/grants.test.ts` | ❌ Wave 0 |
| WS-25 | Append-only audit, both-sides visible | migration text-assertion (REVOKE UPDATE/DELETE) + route test | `npx jest lib/workspaces/audit.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest <changed-file>.test.ts` + `npx tsc --noEmit` (per CLAUDE.md's "no
  `npm run build` while dev server runs" rule — use `tsc --noEmit`, never a full build, during
  active development).
- **Per wave merge:** full `npm test` (this repo's convention: every prior phase reports the exact
  suite/test count green before merge, e.g. "266 suites / 2843 tests").
- **Phase gate:** Full suite green, `tsc --noEmit` clean, ESLint clean, AND — because this is the
  RLS-critical phase — a manual adversarial RLS smoke test against a real (non-demo) Postgres
  instance before the human-gated `supabase db push`, exactly as `21-RLS-SMOKE-CHECKLIST.md`
  precedent requires. **Do not treat Jest text-assertion migration tests as sufficient proof the
  RLS policies are non-recursive and non-escalating** — they can only confirm the SQL text matches
  what was authored, not that it behaves correctly against live Postgres.

### Wave 0 Gaps
- [ ] `lib/workspaces/permissions.test.ts` — permission catalogue, tiers, bundle/structural exclusions
- [ ] `lib/workspaces/grants.test.ts` — subset-check pure logic
- [ ] `lib/workspaces/roster.test.ts` — relationship state machine
- [ ] `lib/workspaces/context.test.ts` — server-side workspace resolution
- [ ] `lib/workspaces/audit.test.ts` — append-only write-through mirroring `lib/staff/audit.ts`'s test shape
- [ ] `__tests__/migration-182.test.ts` through `__tests__/migration-187.test.ts` — one per slice's migration, following this repo's universal string-assertion convention (every migration in this repo ships with a paired test)
- [ ] A written, human-run adversarial RLS smoke checklist for migration 185 (horizontal-escalation attempts), mirroring `21-RLS-SMOKE-CHECKLIST.md` — this repo has no automated equivalent; do not skip it because Jest is green

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | The Architectural Responsibility Map above; workspace access must be enforced at the DB/RLS tier, never only at the API tier (custody D-04 doctrine already binding) |
| V2 Authentication | no | No new authentication mechanism — Supabase session auth, unchanged |
| V4 Access Control | yes | This is the whole phase — SECURITY DEFINER RLS helpers (Pattern 1/2), server-side grant subset checks (D-49), server-resolved acting context re-checked on every write (D-31) |
| V5 Input Validation | yes | Zod schemas on every new API route (workspace create, invite, grant issue, attach/detach) — house convention |
| V6 Cryptography | no | No new cryptographic primitive introduced |
| V8 Data Protection | yes | D-40/D-42's structural exclusion of clean-master/payout/tax data from any workspace-derived grant path is a data-protection control, not merely an access-control one — column-level `REVOKE` alongside RLS is this repo's house pattern for exactly this (per `38-CONTEXT.md`'s own "Established Patterns" note) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Horizontal privilege escalation via a crafted `workspaceId` in a URL or API payload | Elevation of Privilege | Server-side re-derivation of membership + grants on every request (D-30/D-31), never trusting a client-supplied workspace id without a DB check |
| RLS policy recursion (42P17) silently taken as "access denied" rather than a functional break | Denial of Service | Textual migration tests asserting the `(SELECT helper(...))` wrapping (Pattern 2), plus a live-Postgres adversarial smoke before push (this repo's `21-RLS-SMOKE-CHECKLIST.md` precedent) |
| Grant escalation beyond the granter's own access (D-49) | Elevation of Privilege | `isSubsetGrant()` pure function invoked identically at grant-time and use-time; a grant issued once cannot be trusted to remain valid forever — re-check at use time, not just at issue time |
| Sensitive-column exposure (payout/tax, private rights identifiers) through an over-broad `SELECT *` on a workspace-joined query | Information Disclosure | Column-level `REVOKE`/`GRANT` in addition to row-level RLS (D-42's "structurally excluded, not merely untested" requirement) — this repo's established pattern for `buyer_orgs.ae_user_id` (migration 090) is the direct precedent to copy |
| Impersonation via an "act on behalf of" feature quietly becoming a view-as/login-as | Spoofing | D-22's hard prohibition — every acting-on-behalf action must carry BOTH identities in its audit row (actor + subject member), never silently substitute one session for another |

## Sources

### Primary (HIGH confidence — direct codebase verification)
- `supabase/migrations/064_fix_split_sheet_rls_recursion.sql` — the original 42P17 recursion fix and its SECURITY DEFINER prescription
- `supabase/migrations/078_project_members.sql` — the two-table guest-list + helper-pair pattern D-48 extends
- `supabase/migrations/136_work_members.sql` — the same pattern's second application, including the claimed-collaborator bridge trigger relevant to WS-05
- `supabase/migrations/080_buyer_orgs_members.sql` — the rejected `buyer_orgs` shape, confirmed born-verified/one-org-per-user as CONTEXT.md describes
- `supabase/migrations/177_member_client_partner_coexistence.sql` — `find_auth_user_id_by_email`, the service-only reconciliation pattern for WS-04
- `supabase/migrations/172_audit_integrity_hardening.sql` — the `BEFORE` trigger guard shape reused for never-zero-owners
- `supabase/migrations/156_song_passport_pilot_operations.sql` — the cohort-flag table shape (`song_passport_cohorts`) directly reusable for D-55/WS-27
- `supabase/migrations/001_initial_schema.sql` — confirms `subscriptions.user_id UUID ... UNIQUE NOT NULL`
- `lib/accounts/account-context.ts`, `lib/accounts/member-api-gate.ts`, `lib/auth/session-identity.ts`, `components/auth/AccountContextSwitch.tsx` — confirms the sign-out-based switch and the identity-only (no workspace dimension) resolver, as CONTEXT.md states
- `lib/staff/audit.ts` — `logStaffAction`'s never-throws, unconditional write-through shape for D-50
- `lib/client-partners/health.ts`, `lib/client-partners/columns.ts`, `lib/selects/stage-machine.ts` — the pure-logic-module convention
- `lib/stripe/connect.ts` — confirms Stripe 17.7.0 is already integrated (Connect, not yet Billing)
- `middleware.ts` — confirms path-prefix-based route protection, relevant to adding `/w/` to `isProtected`
- `.planning/config.json` — confirms `nyquist_validation: true`, `security_enforcement: true`, `security_asvs_level: 1`

### Secondary (MEDIUM confidence — WebSearch, cross-checked against official/authoritative sources)
- [Supabase RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv) — InitPlan-vs-SubPlan wrapping behavior for SECURITY DEFINER functions in policies
- [Row Level Security | Supabase Docs](https://supabase.com/docs/guides/database/postgres/row-level-security) — general RLS guidance
- [PostgreSQL 18 Docs: Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — authoritative RLS semantics
- [Next.js Dynamic Segments docs](https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes) — the `[workspaceId]` mechanism
- Stripe multi-tenant SaaS billing pattern discussion (Customer/Subscription/Price architecture, per-seat quantity billing) — general industry pattern, cross-referenced across multiple 2026 sources returned by search

### Tertiary (LOW confidence — package names or specifics not independently verified; none used, since no new package is proposed)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; every library cited is already pinned and in production use in this repo
- Architecture (RLS extension, permission model, pure-logic core): HIGH — directly derived from three prior, shipped, successful applications of the identical pattern in this same codebase
- Architecture (in-session workspace routing, org billing): MEDIUM — sound, well-documented industry patterns, but genuinely new to this codebase with no internal precedent to verify against
- Pitfalls: HIGH for RLS-recursion-class pitfalls (directly sourced from this repo's own documented incident history); MEDIUM for the newer routing/billing pitfalls (reasoned from the pattern, not from a prior incident in this repo)

**Research date:** 2026-09-05
**Valid until:** 30 days (stable domain — Postgres RLS semantics and this repo's own established conventions do not shift quickly; re-verify migration numbering immediately before Slice A execution regardless of this window, since that number changes with every merged phase)

---

## Slice/Split Recommendation

**Recommendation: split the phase, roughly along the lines CONTEXT.md already proposes, but with
the boundary drawn after Slice D rather than after Slice C.**

Reasoning, backed by evidence from this repo's own history:

1. **File-count/scope evidence.** Phase 31 needed a split at ~19 plans. This phase's nine slices
   (A–I) each look like 1-3 plans by the shape of comparable prior phases (078's project_members
   work was one plan; 136's work_members was one plan plus a companion; 080's buyer org model was
   three plans). Nine slices × 1-3 plans each puts this phase at roughly 15-25 plans — squarely in
   Phase-31 split territory, and this phase carries materially higher risk per plan (RLS security-
   critical work, not CRM/UI work).

2. **Risk-concentration evidence.** CONTEXT.md's own Risks section calls Slice D's RLS branch "the
   highest-risk change in the phase" and recommends it "soak" after Slice C lands. A phase boundary
   should isolate the highest-risk, security-critical work into its own reviewable, independently
   verifiable unit — exactly the reasoning this repo already applied when it isolated Phase 16's
   Stripe/e-sign slices (MONEY-01..03, PAPER-01..04) as separately-gated, deferrable pieces within
   one phase, rather than blocking the whole phase's completion on them.

3. **Dependency-graph evidence.** Slice H (billing) depends only on Slice A, and CONTEXT.md
   explicitly marks it "independent of D–G." This is a strong signal that billing does not need to
   ship in the same milestone as the RLS/permission core — it can trail without blocking the
   security-critical work's own soak period.

**Concrete recommendation:**
- **Phase 38** = Slices A, B, C, D (foundation → roster → permissions → RLS extension). This is the
  security-critical, must-be-correct-together core. Ends with the phase's riskiest artifact fully
  built, tested, and soaked before anything user-facing depends on it.
- **Phase 38.1** = Slices E, F, G (active-workspace UX, contracts/authority/rights boundaries,
  audit). This is where the phase becomes user-visible and usable end-to-end for the beta cohort.
- **Phase 38.2** = Slices H, I (billing/metering, rollout/docs). Lowest risk, most deferrable,
  correctly last regardless of split.

This mirrors CONTEXT.md's own suggested A–C/D–F/G–I split closely, with one adjustment: keep D
(RLS) bundled with A–C rather than starting the second phase, because D is the direct, tightly-
coupled CONSUMER of C's permission model — splitting between C and D risks a phase boundary landing
in the middle of one continuous security review, which is exactly the pattern CONTEXT.md's own risk
section warns against ("let it soak" implies C and D should be reviewed and stabilized as one unit
before E/F/G build on top of them).
