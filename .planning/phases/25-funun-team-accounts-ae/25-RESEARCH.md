# Phase 25: Funūn Team / Internal Accounts & AE Assignment + Staff Permissions - Research

**Researched:** 2026-08-05
**Domain:** Third-principal-type RBAC (staff) generalized from an existing binary admin gate, assignment-scoped data access, and audit logging — all inside an existing Next.js 15 / Supabase RLS codebase
**Confidence:** HIGH — every architectural claim below is grounded in direct reads of this repo's existing gate, buyer, and audit-log code, not external documentation. No new libraries or external APIs are introduced by this phase.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Direction (from the discussion):**
- Funūn employee accounts are a **third principal type** — distinct from artist and buyer accounts.
- **Staff accounts are provisioned, not self-serve** (owner/superadmin bootstrap → leadership creates more).
- **Access-gated capabilities:** only staff **with the permission** can create buyer accounts or edit (portions of) them. Editing is **scoped** (assigned companies + subset of fields), not blanket.
- **One AE per buyer company** (assigned by leadership); leads/activity route to in-app queue **and** email.

**Locked defaults (owner-approved 2026-08-05 — plan against these):**
1. **Identity / reconciliation — generalize `is_admin`, don't duplicate.** Today's admin gate is a single binary `app_metadata.is_admin === true` (checked in `app/(admin)/layout.tsx` + per page via `lib/admin/gate.ts`, no roles). Generalize it into a **staff role**: **leadership** (= today's `is_admin: true`, full access), **AE**, **BD**. Extend `lib/admin/gate.ts` as the single authority — **no parallel auth path**. Staff role carried on `app_metadata` (an optional `funun_staff` table for profile/assignment data is the planner's discretion).
2. **Bootstrap — seed like `is_admin` today.** The first **leadership** account is seeded the same way `is_admin` is set now (owner via Supabase dashboard / service role). Leadership then creates further staff **in-app** (setting their role). No self-serve staff signup; no chicken-and-egg.
3. **Permission granularity — role-level + scoped, beta-simple.** Capabilities are **role-level** (leadership / AE / BD imply capability sets), **NOT** a per-capability grant matrix. Buyer-account **editing is assignment-scoped** (an AE edits only *their* assigned companies) and limited to a **field allowlist** (mirror the `EDITABLE_FIELDS` allowlist pattern in `app/api/profile/route.ts`).
4. **Audit — log staff writes to client data.** Staff create/edit actions on buyer accounts are recorded (who / what / when) — staff hold cross-tenant access, so the trail is required.

**Out of scope / later:** full CRM; commission tracking; HR/org-chart; permission granularity beyond what AE/BD/leadership need for beta.

### Claude's Discretion

- Whether/how to build a `funun_staff` table for profile/assignment data (default #1 explicitly leaves this open) — this research recommends building it (see Standard Stack "Alternatives Considered" and Assumption A4).
- RLS shape for the staff principal — how leadership/AE/BD read/write across buyer orgs scoped by permission, on top of existing RLS. **This research's primary finding: no new RLS is needed** — buyer_orgs/buyer_members already REVOKE all client writes (migration 080); staff access is purely an application-layer gate + scope check in front of the existing service-role write path.
- Which exact buyer-account fields are staff-editable — this research recommends `name` only for v1 (see Assumption A3), pending Phase 23's not-yet-landed company-profile schema additions.
- Assignment storage — this research recommends a single nullable `buyer_orgs.ae_user_id` column (mirrors `license_requests.owner_id` precedent), not a join table (see Assumption A2).
- Work-queue surface (`/team` vs extending `/admin`) — this research recommends extending `/admin` (see Open Question 3).

### Deferred Ideas (OUT OF SCOPE)

- Full CRM.
- Commission tracking.
- HR/org-chart.
- Permission granularity beyond what AE/BD/leadership need for beta (no per-capability grant matrix).
- Capability revocation UI (Phase 15's own deferral, adjacent but not this phase's concern).
- Self-serve staff signup (bootstrap is owner-seeded only, per default #2).
</user_constraints>

<phase_requirements>
## Phase Requirements

No formal requirement IDs (`REQ-XX`) are registered for Phase 25 in `.planning/REQUIREMENTS.md` — confirmed by direct read of that file (no Phase 25 section exists as of this research). Per the phase description's explicit instruction, this research does **not** invent IDs. The phase's four in-scope capabilities (staff provisioning, staff RBAC, AE↔buyer-company assignment, lead/work routing) are tracked descriptively in this document's Validation Architecture "Phase Requirements → Test Map" section instead. The planner should register formal requirement IDs during plan-phase, per this project's own established convention (see the "pre-existing documentation gap" pattern already recorded for Phases 16/22 in `.planning/STATE.md` — this phase should not repeat that gap if it can reasonably register IDs at plan time).
</phase_requirements>

## Summary

Phase 25 does not need a new authorization primitive — it needs to **widen an existing one**. Today `lib/admin/gate.ts`'s `verifyAdmin()` and `app/(admin)/layout.tsx`'s inline check both test a single boolean, `app_metadata.is_admin === true`. The locked defaults direct generalizing this into a three-value staff role (`leadership | ae | bd`) carried the same way (`app_metadata`), gated through the same single-authority module, bootstrapped the same way (manual dashboard/service-role seed), and consumed the same way every other admin route already consumes `verifyAdmin()` — by calling a shared function before touching the service-role client.

The single most important finding: **`buyer_orgs` and `buyer_members` already have zero client write policies** (migration 080 REVOKEs INSERT/UPDATE/DELETE from `authenticated`/`anon` entirely — every write goes through a service-role route today, gated only by `verifyAdmin()`). This means Phase 25 requires **no new RLS policies and no new column-grant changes on the buyer tables themselves** to let AE/BD write buyer data — it only needs new service-role routes gated by a widened `requireStaff()` check, with assignment-scoping and field-allowlisting enforced in application code inside those routes (the exact same pattern `app/api/profile/route.ts`'s `EDITABLE_FIELDS` already uses). This resolves the "RLS shape for the staff principal" open question directly: there isn't one, by design — this codebase's convention for privileged cross-tenant access is service-role-bypass-after-app-layer-check, never RLS keyed to `auth.jwt()` claims (confirmed: no migration in this repo ever reads `auth.jwt()->'app_metadata'`).

**Primary recommendation:** Generalize `lib/admin/gate.ts` into a single `getStaffRole()` / `requireStaff(allowedRoles?)` pair (keeping `verifyAdmin()` as a thin `requireStaff(['leadership'])` alias so the ~15 existing `/api/admin/*` routes need zero changes), add one nullable `buyer_orgs.ae_user_id` column (mirrors the existing `license_requests.owner_id` precedent — a plain FK column, not a join table), add two new private/service-role-only tables (`funun_staff` for profile/listing data, `staff_audit_log` mirroring `verification_audit_log`'s proven zero-RLS-policy shape exactly), and build new staff routes under `/api/admin/staff/*` and `/api/admin/buyer-orgs/*` (extend, don't fork) with assignment-scope + field-allowlist checks before every service-role write.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Staff role gate (leadership/AE/BD) | API / Backend | — | Extends `lib/admin/gate.ts`; every check happens server-side against `app_metadata`, never trusted from the client |
| Staff account provisioning (bootstrap + in-app creation) | API / Backend | Database / Storage (`auth.users`, `funun_staff`) | Mirrors `createIndustryMember()`/`createBuyerAccount()` — atomic `admin.createUser()` + companion table row + Resend invite |
| Buyer-account create/edit by staff | API / Backend | Database / Storage (`buyer_orgs`/`buyer_members`, already service-role-only) | No RLS change needed — this is purely an application-layer permission + scope check in front of an already-locked-down write path |
| AE↔buyer-company assignment | API / Backend | Database / Storage (`buyer_orgs.ae_user_id`) | Single nullable FK column, leadership-only write, mirrors `license_requests.owner_id` |
| Staff audit trail | Database / Storage (`staff_audit_log`) | API / Backend (write-through helper) | Zero-RLS-policy, service-role-only table — mirrors `verification_audit_log` exactly |
| Staff work queue (leads/companies) | Frontend Server (SSR) | API / Backend (scoped query) | Server component reads via service client, scoped by `ae_user_id = caller` unless leadership |
| Lead/activity notification fan-out | API / Backend | Browser / Client (`NotificationBell`, existing) | Reuses existing `notifications` table + `createNotification()` — no new infra |

## Standard Stack

### Core

No new libraries. This phase is 100% additive to the existing stack already in use for identical problems:

| Library | Version | Purpose | Why Standard (in this repo) |
|---------|---------|---------|------------------------------|
| `@supabase/supabase-js` | 2.45.0 [VERIFIED: package.json] | Service-role client for all staff writes | Already the exclusive write path for `buyer_orgs`/`buyer_members` (migration 080) |
| `resend` | 4.0.0 [VERIFIED: package.json] | Staff invite email, lead-routing email | `lib/email/index.ts`'s `sendEmail()` already used identically by `buyerInviteEmail`/`industryInviteEmail` |
| `zod` | 3.23.0 [VERIFIED: package.json] | Optional: staff-role/action payload validation | Already a project dependency; this repo's existing admin routes largely hand-roll validation instead (see Anti-Patterns note below) — either is acceptable, hand-rolled matches local convention |

### Supporting

None required. No queueing system, no cron, no new Supabase extension. The "work queue" is a filtered SQL read, not a message queue.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| App-layer scope check (staff route reads `ae_user_id` and compares to caller) | RLS policy reading `auth.jwt()->'app_metadata'->>'staff_role'` | RLS would be a **new pattern** for this codebase (never used here) and would require staff routes to stop using the service-role client — a much larger blast-radius change for no benefit, since every other admin surface already trusts app-layer gating exclusively. Rejected. |
| `buyer_orgs.ae_user_id` single column | `buyer_org_ae_assignments` join table with `assigned_at`/`unassigned_at` | Only justified if assignment **history** (multiple past AEs, overlapping assignments) is a real product need. CONTEXT explicitly says "likely their assigned companies" (singular, current) and default #3 says beta-simple. The audit log (default #4) already captures every reassignment event, giving history "for free" without a second table. Rejected for v1; documented as an Open Question below for the planner to confirm with the owner. |
| `funun_staff` table | `app_metadata`-only, list via paginated `auth.admin.listUsers()` filtered client-side (mirrors `scripts/provision-test-admin.mjs`'s `findUserByEmail` loop) | Works at current team size (a handful of staff) but doesn't scale past ~1-2 GoTrue admin API pages and requires an unbounded-pagination loop on every staff-list render. A table is one migration and matches the `user_profiles`/`buyer_members` precedent of "coarse type in `app_metadata`, profile detail in a table." Recommended, but genuinely low-stakes either way at beta scale — flagged as Claude's Discretion per the locked defaults. |

**Installation:** none — no `npm install` needed this phase.

## Package Legitimacy Audit

**Not applicable.** This phase introduces zero new npm/pip/cargo dependencies — every capability (service-role Supabase writes, Resend email, in-app notifications) is built from libraries already present and already used for the exact same shape of problem elsewhere in this codebase. Package Legitimacy Gate is skipped by rule ("Required whenever this phase installs external packages" — it does not).

## Architecture Patterns

### System Architecture Diagram

```text
                     ┌─────────────────────────────────────────┐
                     │  Owner (one-time, human-gated)           │
                     │  Supabase dashboard / service role:      │
                     │  set app_metadata.staff_role='leadership'│
                     │  on the bootstrap account                │
                     └───────────────────┬───────────────────────┘
                                          │
                                          ▼
┌──────────────┐   POST /api/admin/staff │ (leadership-only, requireStaff(['leadership']))
│ Leadership    │──────────────────────────────────────────────┐
│ (browser)     │                                                │
└──────────────┘                                                ▼
                                                    ┌─────────────────────────┐
                                                    │ createStaffAccount()     │
                                                    │  1. admin.createUser()   │
                                                    │     app_metadata.        │
                                                    │     staff_role='ae'|'bd' │
                                                    │     (atomic — no post-   │
                                                    │     insert UPDATE)       │
                                                    │  2. insert funun_staff   │
                                                    │  3. generateLink +       │
                                                    │     Resend invite        │
                                                    │  4. logStaffAction()     │
                                                    └───────────┬─────────────┘
                                                                │
                     ┌──────────────────────────────────────────┘
                     ▼
        ┌─────────────────────────────┐
        │ AE / BD signs in             │
        │ app/(admin)/layout.tsx       │      requireStaff() widened from
        │ requireStaff(ANY_STAFF_ROLE) │◄─────  is_admin-only to any staff_role
        └───────────┬──────────────────┘
                     │
        ┌────────────┴─────────────────────────────────────────┐
        ▼                                                       ▼
┌─────────────────────┐                              ┌────────────────────────┐
│ /admin/buyer-orgs    │  requireStaff +               │ Buyer signup (Phase 23) │
│ create/edit buyer org │  assignment-scope check      │ createBuyerAccount()    │
│ (new: staff, not just │  (ae_user_id === caller,      │  → notifications INSERT │
│  platform admin)      │   unless leadership)          │    (best-effort,        │
└──────────┬────────────┘                              │    AFTER primary write) │
           │ EDITABLE_FIELDS-style allowlist            └──────────┬──────────────┘
           ▼                                                        │
┌──────────────────────┐   service-role write                       │  recipient =
│ buyer_orgs / members  │◄── (already REVOKE-locked from             │  buyer_orgs.ae_user_id
│ (migration 080,       │     authenticated/anon — no new RLS)       │  OR leadership fallback
│  UNCHANGED RLS)       │                                            ▼
└──────────┬────────────┘                              ┌────────────────────────┐
           │ every write                                │ notifications table     │
           ▼                                             │ (existing, unchanged)   │
┌──────────────────────┐                                │  → NotificationBell     │
│ staff_audit_log        │  service-role-only,           │  → Resend email copy    │
│ (zero RLS policies,    │  mirrors verification_         └────────────────────────┘
│  mirrors migration 058)│  audit_log exactly
└────────────────────────┘
```

### Recommended Project Structure

```
lib/
├── admin/
│   └── gate.ts                 # EXTEND (not fork): getStaffRole(), requireStaff(), verifyAdmin() alias
├── staff/                       # NEW module, mirrors lib/buyers/, lib/industry/
│   ├── createStaffAccount.ts    # mirrors createBuyerAccount.ts / createIndustryMember.ts exactly
│   ├── audit.ts                 # logStaffAction() — single write-through helper, mirrors grantOrRevokeVerification's unconditional-log discipline
│   ├── scope.ts                 # isAssignedToOrg(orgId, staffUserId, role) — the assignment-scope predicate, unit-testable pure-ish function
│   └── notifications.ts         # buildLeadRoutedNotification() etc., mirrors lib/deals/notifications.ts's pure-builder convention
app/api/admin/
├── staff/
│   ├── route.ts                 # GET (list), POST (create) — mirrors app/api/admin/members/route.ts
│   └── [id]/route.ts            # PATCH (role change/deactivate) — new, no direct precedent but mirrors verification PATCH shape
└── buyer-orgs/
    ├── route.ts                 # EXISTING — widen verifyAdmin() call to requireStaff(['leadership','ae','bd']) for POST (staff can create), keep GET listing scoped
    └── [id]/
        ├── route.ts             # NEW PATCH — scoped field-allowlist edit + assign-AE (leadership-only sub-action)
        └── ae/route.ts          # NEW PATCH — leadership-only AE (re)assignment, separate route so the two permission bars stay legible
supabase/migrations/
├── 089_funun_staff_and_audit.sql   # funun_staff + staff_audit_log tables, zero-RLS-policy pattern
└── 090_buyer_orgs_ae_assignment.sql # buyer_orgs.ae_user_id nullable column (private — no column GRANT to authenticated)
```

### Pattern 1: Widen the gate, don't fork it

**What:** `lib/admin/gate.ts` currently has exactly one authority function, `verifyAdmin()`, and `app/(admin)/layout.tsx` duplicates its `is_admin` check inline instead of calling it (already a minor existing inconsistency worth fixing in this phase, not introducing a second one).
**When to use:** Any time a route or layout needs to know "is this caller staff, and which tier."
**Example:**
```typescript
// Source: lib/admin/gate.ts (existing file, generalized — this repo, verified read)
export type StaffRole = 'leadership' | 'ae' | 'bd'
const ALL_STAFF_ROLES: StaffRole[] = ['leadership', 'ae', 'bd']

export function getStaffRole(user: { app_metadata?: unknown }): StaffRole | null {
  const meta = user.app_metadata as { staff_role?: string; is_admin?: boolean } | undefined
  if (meta?.staff_role === 'leadership' || meta?.staff_role === 'ae' || meta?.staff_role === 'bd') {
    return meta.staff_role
  }
  // Backward-compat fallback for the pre-existing is_admin bootstrap account —
  // ASSUMED recommendation, confirm with owner (see Assumptions Log A1).
  if (meta?.is_admin === true) return 'leadership'
  return null
}

export async function requireStaff(allowed: StaffRole[] = ALL_STAFF_ROLES) {
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' as const, status: 401 as const }
  const role = getStaffRole(user)
  if (!role || !allowed.includes(role)) return { error: 'Forbidden' as const, status: 403 as const }
  return { user, staffRole: role }
}

// Backward-compat alias — zero changes required to ~15 existing /api/admin/* routes.
export const verifyAdmin = () => requireStaff(['leadership'])
```

### Pattern 2: Buyer-table writes need no new RLS — only a new gate + scope check

**What:** `buyer_orgs`/`buyer_members` already REVOKE all client INSERT/UPDATE/DELETE (migration 080). Staff routes were always going to be service-role; the only new work is the permission/scope check in front of the existing write.
**When to use:** Every staff route that touches `buyer_orgs`/`buyer_members`.
**Example:**
```typescript
// Source: app/api/admin/buyer-orgs/[id]/route.ts (new file, pattern verified
// against migration 080's REVOKE statements + app/api/profile/route.ts's
// EDITABLE_FIELDS convention)
import { requireStaff } from '@/lib/admin/gate'
import { isAssignedToOrg } from '@/lib/staff/scope'
import { logStaffAction } from '@/lib/staff/audit'

const STAFF_EDITABLE_BUYER_ORG_FIELDS = ['name'] as const // see Open Questions — extend as Phase 23 adds company-profile columns

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireStaff(['leadership', 'ae', 'bd'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (auth.staffRole !== 'leadership') {
    const assigned = await isAssignedToOrg(id, auth.user.id)
    if (!assigned) return NextResponse.json({ error: 'Not found' }, { status: 404 }) // 404, not 403 — mirrors app/api/vault ownership-check precedent, avoids leaking org existence
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  for (const key of STAFF_EDITABLE_BUYER_ORG_FIELDS) {
    if (key in body && typeof body[key] === 'string') update[key] = (body[key] as string).trim()
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service.from('buyer_orgs').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Unconditional — mirrors grantOrRevokeVerification's "log even idempotent actions" rule (SAFETY-03 precedent).
  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'edit_buyer_org',
    targetType: 'buyer_org',
    targetId: id,
    changes: update,
  })

  return NextResponse.json({ data })
}
```

### Pattern 3: Zero-RLS-policy private table (audit log, staff profile)

**What:** RLS enabled, no policies created for any role, table-level GRANT revoked from `authenticated`/`anon` — a table reachable ONLY via the service-role client. This exact shape already exists in the codebase for `verification_audit_log` (migration 058).
**When to use:** `staff_audit_log` and `funun_staff`.
**Example:**
```sql
-- Source: supabase/migrations/058_trust_safety_schema.sql (existing file,
-- verification_audit_log — verbatim pattern to reapply)
CREATE TABLE IF NOT EXISTS public.staff_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES auth.users ON DELETE SET NULL,
  action      TEXT NOT NULL,          -- 'create_staff' | 'edit_buyer_org' | 'assign_ae' | 'create_buyer_account' | ...
  target_type TEXT NOT NULL,          -- 'buyer_org' | 'buyer_member' | 'funun_staff'
  target_id   UUID,
  changes     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_audit_log_actor ON public.staff_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_audit_log_target ON public.staff_audit_log (target_type, target_id, created_at DESC);

ALTER TABLE public.staff_audit_log ENABLE ROW LEVEL SECURITY;
-- No policies for any role — RLS-enabled + zero policies denies ALL row
-- access to authenticated/anon by construction (migration 058's own
-- documented reasoning, reapplied verbatim).
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.staff_audit_log FROM authenticated, anon;

COMMENT ON TABLE public.staff_audit_log IS
  'Staff write-action audit trail (Phase 25 default #4). Service-role-only, mirrors migration 058''s verification_audit_log exactly. Never authenticated/anon-writable or -readable.';
```

### Anti-Patterns to Avoid

- **A second `is_admin`-style boolean per capability:** Default #3 explicitly rejects a per-capability grant matrix — one `staff_role` enum, not `can_create_buyer`/`can_edit_buyer`/`can_assign_ae` booleans. Role implies capability set; do not build a permissions table.
- **RLS policies keyed to `auth.jwt()->'app_metadata'`:** Would be the first such policy in this codebase. Every existing privileged surface uses app-layer gate + service-role bypass. Introducing a second authorization mechanism for the same principal type is exactly the "parallel auth path" locked default #1 forbids.
- **Trusting `app_metadata.staff_role` on the client for anything but UI hints:** It's opaque to the browser only in the sense that it isn't user-editable, but it's readable in the session JWT — never use it to decide what to *render as sensitive data*, only to decide what to *request*; the server route re-checks on every write (matches this repo's own documented convention: "Admin routes independently re-verify `is_admin` server-side, not just layout gating").
- **A post-insert `UPDATE` to set `staff_role`:** Every account-creation helper in this codebase (`createIndustryMember`, `createBuyerAccount`) sets the role atomically inside `admin.createUser()`'s `app_metadata` argument specifically to avoid a race with `handle_new_user()`. Staff creation must follow the same discipline even though staff accounts have no `handle_new_user()` branch to race — do it anyway for consistency and because a `funun_staff` insert failing after `createUser()` succeeds is the same "phantom successful-but-broken account" risk class documented repeatedly in this repo's migration history.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Staff account creation | A new bespoke `admin.createUser()` call inline in the route handler | A `createStaffAccount()` helper mirroring `createBuyerAccount.ts`/`createIndustryMember.ts` line-for-line (atomic app_metadata, `generateLink`, `sendEmail`, `DuplicateXError` class) | Two near-identical helpers already exist in this exact codebase for this exact shape of problem; a third bespoke implementation is pure risk with zero benefit |
| Audit logging | Ad-hoc `.insert()` calls scattered across every staff route | One `logStaffAction()` helper, called unconditionally after every staff write, mirroring `grantOrRevokeVerification`'s "audit even idempotent actions" discipline | Centralizing means default #4's requirement can be enforced by code review of one file, not N routes |
| In-app + email notification fan-out | A new notification table/queue | The existing `notifications` table + `createNotification()` (already supports `sendEmailCopy`) | Feature-complete for this need already; no gap to fill |
| Lead-routing recipient resolution | A cron/queue-based dispatcher | A synchronous, best-effort, try/catch side-effect immediately after the buyer-signup mutation (`lib/social/activity-emit.ts` convention, cited in this project's own CLAUDE.md) | Matches the codebase's own stated architectural constraint: "Long-running tasks... are awaited in API routes; consider a job queue for 30s+ operations" — a single notification insert + email send is well under that bar |

**Key insight:** Every piece of this phase — role gate, scoped account creation, audit trail, notification fan-out — has a **line-for-line precedent already shipped in this repo** for an adjacent principal type (industry members, buyer orgs, verification actions). The work is almost entirely "generalize an existing pattern to a third value," not "invent new infrastructure." Treat any design that doesn't map to an existing precedent as a signal to re-check the locked defaults before proceeding.

## Runtime State Inventory

**Trigger check:** This phase is additive (new tables/columns, generalized gate) — not a rename/refactor/migration of existing runtime state. Runtime State Inventory is not required, but one adjacent risk is worth recording explicitly since it touches identity semantics:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | The owner's own account currently has `app_metadata.is_admin === true` and no `staff_role`. Once `requireStaff()` ships, `getStaffRole()`'s fallback (Pattern 1) treats `is_admin===true` as `leadership` — **if the planner rejects that fallback (Assumption A1), the owner's account is locked out of `/admin` until a manual re-seed.** | Confirm with owner before/at plan time whether the `is_admin` fallback ships, or schedule the manual re-seed as the very first task of Wave 0 |
| Live service config | None — no external service (Resend, Stripe, DocuSeal) holds staff-role state | None |
| OS-registered state | None | None |
| Secrets/env vars | None new — reuses `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, all already configured | None |
| Build artifacts | None | None |

## Common Pitfalls

### Pitfall 1: Two sources of truth for `staff_role` drifting apart

**What goes wrong:** If `funun_staff.staff_role` is built as a companion table, a route that updates one but not the other (e.g., a role change that only calls `admin.updateUserById()` and forgets the table row, or vice versa) leaves the DISPLAYED role (from the table) out of sync with the ENFORCED role (from `app_metadata`, which the gate actually checks).
**Why it happens:** Two writes, one logical change, no transaction spanning `auth.users` (GoTrue) and `public.funun_staff` (Postgres) — they are genuinely different systems.
**How to avoid:** `app_metadata` is always authoritative for the gate; `funun_staff.staff_role` is a derived display copy, written SECOND, and any route that changes role must write both in the same handler (not two separate endpoints a UI could call independently). Wrap the table write in a try/catch that does not fail the whole request (mirrors `handle_new_user()`'s subscription-insert exception-swallow pattern) but DOES log a warning path for ops to notice drift.
**Warning signs:** Staff list UI shows a role that doesn't match what that user can actually access.

### Pitfall 2: `ae_user_id` column added without extending the existing column-grant list

**What goes wrong:** Migration 080 already issued `REVOKE SELECT ON buyer_orgs FROM authenticated, anon; GRANT SELECT (id, name, is_personal, verified, created_at) ON buyer_orgs TO authenticated;`. Adding `ae_user_id` via `ALTER TABLE ... ADD COLUMN` does **not** automatically add it to that column-level GRANT — Postgres column-privilege GRANTs are an explicit allowlist, not "all columns unless revoked."
**Why it happens:** Easy to assume `ADD COLUMN` + no new REVOKE means the column is reachable; in this codebase's column-privilege regime the opposite is true — a new column is private by default until explicitly GRANTed.
**How to avoid:** This is actually the DESIRED outcome here (recommend keeping `ae_user_id` private/staff-only in v1 — see Standard Stack "Alternatives Considered"), but the migration comment must say so explicitly, or a future migration author will "fix" what looks like an oversight. Follow migration 080's own precedent: its comment explicitly says `verified_at`/`created_by` "stay private (admin-audit fields)" — do the same for `ae_user_id`.
**Warning signs:** A buyer-facing surface silently returns `null`/undefined for a field that IS populated in the database — always a column-grant gap, not a query bug, in this codebase.

### Pitfall 3: Layout widened but individual admin pages not re-checked

**What goes wrong:** `app/(admin)/layout.tsx`'s gate widens from "is_admin only" to "any staff role" so AE/BD can enter `/admin` at all — but every existing page under `/admin/*` (Verification, Reports, E-Sign Usage, GTM Metrics) was built assuming only leadership-tier admins would ever reach them, and several of those pages' OWN API routes call `verifyAdmin()` (which, per Pattern 1's alias, still means leadership-only) — so the data fetch will 403, but the PAGE SHELL will render for an AE, producing a broken/empty page instead of a clean redirect.
**Why it happens:** Layout-level gating and route-level gating are deliberately separate defenses in this codebase (documented in 15-CONTEXT.md); widening one without auditing the other creates exactly this gap.
**How to avoid:** Treat this as a Wave 0 checklist item — enumerate every existing `/admin/*` page and its backing API route, and, for each, and decide explicitly: (a) leadership-only, unchanged, OR (b) opened to AE/BD. Don't let "the layout gate passed" stand in for "this page is meant for this role."
**Warning signs:** An AE/BD account can navigate to a leadership-only admin page and sees an empty/broken UI instead of being redirected away.

### Pitfall 4: Assignment-scope check applied to reads but not writes (or vice versa)

**What goes wrong:** Building `isAssignedToOrg()` and calling it only in the PATCH handler, while the GET (list) handler still returns every buyer org to any staff caller — an AE could not edit a company they aren't assigned to, but could still see its full detail via the list endpoint.
**Why it happens:** Read and write are different route handlers; it's easy to secure the "dangerous" one (write) and forget the "just a list" one is also scoped data.
**How to avoid:** `isAssignedToOrg()`/scope-filtering must gate BOTH the list query (`.eq('ae_user_id', caller)` unless leadership) and the individual write — the same discipline this codebase already applies elsewhere (e.g., `license_requests` SELECT is scoped by artist ownership on the read path, not just the stage-transition write path).
**Warning signs:** An AE's "My Companies" queue accidentally shows every buyer org, not just their own.

## Code Examples

### Assignment-scope predicate
```typescript
// Source: lib/staff/scope.ts (new file, pattern verified against
// is_buyer_org_member() in migration 080 and license_requests.owner_id
// usage in lib/deals/*)
import type { SupabaseClient } from '@supabase/supabase-js'

export async function isAssignedToOrg(
  service: SupabaseClient,
  orgId: string,
  staffUserId: string
): Promise<boolean> {
  const { data } = await service
    .from('buyer_orgs')
    .select('id')
    .eq('id', orgId)
    .eq('ae_user_id', staffUserId)
    .maybeSingle()
  return data !== null
}
```

### Migration: nullable AE assignment column
```sql
-- Source: supabase/migrations/090_buyer_orgs_ae_assignment.sql (new file)
-- Additive, nullable — no backfill needed (every existing org starts
-- unassigned; leadership assigns via the new PATCH .../ae route).
ALTER TABLE public.buyer_orgs
  ADD COLUMN ae_user_id UUID REFERENCES auth.users ON DELETE SET NULL;

CREATE INDEX idx_buyer_orgs_ae_user_id ON public.buyer_orgs (ae_user_id);

-- Deliberately NOT added to the migration-080 column-level SELECT GRANT
-- list — stays private/staff-only in v1, mirroring verified_at/created_by's
-- treatment in the same table (Pitfall 2). Extend the GRANT in a future
-- migration if/when a buyer-facing "your AE" surface is built (Phase 23+).
COMMENT ON COLUMN public.buyer_orgs.ae_user_id IS
  'Phase 25: the Funūn staff member (AE) assigned to this buyer company. One AE per company (nullable — unassigned until leadership sets it via the staff-only PATCH route). Private column — not in migration 080''s authenticated GRANT list.';

NOTIFY pgrst, 'reload schema';
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `app_metadata.is_admin: boolean` — single binary admin flag, checked inline in two places (`gate.ts`, admin layout) | `app_metadata.staff_role: 'leadership' \| 'ae' \| 'bd'` — single authority function, three-tier, layout defers to the same function | This phase | Every `/api/admin/*` route keeps working unchanged (leadership scope preserved via the `verifyAdmin()` alias); only new routes need the wider `requireStaff()` call |
| `/admin/buyer-orgs` creates buyer accounts, platform-admin-only | Same route, gate widened to any staff role with the "create buyer accounts" capability (i.e., leadership/AE/BD per default #3's role-implies-capability model) | This phase | `createBuyerAccount()` itself is untouched — only the caller-side gate check changes |

**Deprecated/outdated:** None — nothing existing is removed. `is_admin` may be kept as a compatibility fallback (Assumption A1) rather than deprecated outright; the planner should decide with the owner whether to formally deprecate it once the leadership account is re-seeded with `staff_role`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `getStaffRole()` should treat `app_metadata.is_admin === true` as an implicit `leadership` fallback, so the owner's existing bootstrap account isn't locked out of `/admin` the moment this phase ships, ahead of a manual `staff_role` re-seed. | Pattern 1, Runtime State Inventory | If wrong (owner wants a clean break, no fallback), the phase MUST sequence a mandatory `checkpoint:human-verify` task — "re-seed your own account's `app_metadata.staff_role='leadership'` before merging" — as the literal first task, or the owner loses `/admin` access on deploy. |
| A2 | `buyer_orgs.ae_user_id` should be a single nullable column (not a join table), because default #3 says beta-simple and the audit log already gives reassignment history. | Standard Stack (Alternatives Considered), Architecture Patterns | If the owner actually wants overlapping/historical AE assignments tracked structurally (not just via audit-log replay), the schema needs a join table instead — a different (larger) migration. Low risk to reverse later since it's additive, but worth confirming before Wave 0. |
| A3 | Staff-editable `buyer_orgs` field allowlist is `['name']` only for v1, because that's the only non-audit, non-system column that currently exists on the table. | Architecture Patterns Pattern 2, Standard Stack | Phase 23 (buyer onboarding, not yet executed) is expected to add company-profile columns (contact name, phone, use-case, etc.) that staff will plausibly need to edit. If Phase 23 lands its migration before Phase 25 executes, the allowlist should be revisited to include those new columns at plan time, not left at `['name']` by default. |
| A4 | A `funun_staff` table should be built (not app_metadata-only), for listing/display efficiency. | Standard Stack (Alternatives Considered) | Low risk either way — explicitly left to planner discretion by the locked defaults themselves (default #1: "optional... is the planner's discretion"). If skipped, staff listing must paginate `auth.admin.listUsers()` client-side, which is fine at current team size but doesn't scale gracefully. |
| A5 | "Buyer activity" that should route to the assigned AE's queue is scoped narrowly (new signup + first license request) rather than every buyer action, since the phase description says "relevant buyer activity" without enumerating events and default #3 favors beta-simple scope. | Common Pitfalls / Don't Hand-Roll | If the owner expects broader activity coverage (e.g., every license-request stage change, every shortlist action) from day one, the notification trigger points need to be enumerated explicitly at plan/discuss time rather than left to implementation discretion. |

## Open Questions

1. **Is `is_admin` fully retired or kept as a permanent fallback?**
   - What we know: Default #1 says "generalize... don't duplicate," implying eventual retirement. Default #2 describes bootstrapping `staff_role` the same manual way `is_admin` is set today, implying a fresh, deliberate seed — not an automatic carry-over.
   - What's unclear: Whether the fallback in Pattern 1 (A1) is wanted as a permanent safety net or just removed once the owner manually re-seeds.
   - Recommendation: Ship the fallback for zero-downtime safety, but track it as a `Pending Todos` item to formally retire in a later cleanup phase once every real staff account carries an explicit `staff_role`.

2. **Which buyer_orgs/buyer_members fields belong on the staff-editable allowlist beyond `name`?**
   - What we know: Today's schema (migration 080) has almost no editable "profile" surface — most columns are system/audit fields already excluded by convention (`verified`, `verified_at`, `created_by`, `is_org_admin` is member-management not profile-edit).
   - What's unclear: Whether billing/membership-history fields the CONTEXT explicitly flags as undecided ("decide on billing / membership / purchase history") should be staff-editable at all, or read-only even for leadership.
   - Recommendation: Keep the allowlist minimal (`name` only) for v1; treat this as a discuss-phase or plan-time question once Phase 23's schema additions are known, rather than guessing at fields that don't exist yet.

3. **Does the work-queue surface live at `/admin` (widened) or a new `/team` route group?**
   - What we know: `/admin` already IS the staff area today (just leadership-only). Widening its gate is the smallest change and matches the "generalize, don't duplicate" mandate. `/team` would be a second parallel nav for the same principal type.
   - What's unclear: Whether product/branding wants a distinct "Team" identity separate from "Admin" for AE/BD (who may not think of themselves as "admins").
   - Recommendation: Extend `/admin` (add role-aware sidebar sections, hide leadership-only items from AE/BD per the existing D-08 hide-when-absent convention from Phase 15), unless the owner has a strong product-naming preference for a separate `/team` surface — flag this explicitly in discuss-phase if not already settled.

## Environment Availability

Skipped — this phase has no new external dependencies. `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` are already configured and exercised by the existing buyer/industry account-creation paths this phase directly extends.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (jest.config.js, `testEnvironment: 'node'`, ts-jest transpile-only) [VERIFIED: package.json, jest.config.js] |
| Config file | `jest.config.js` |
| Quick run command | `npx jest <path-to-new-test-file>` |
| Full suite command | `npm test` |

Existing precedent for admin-route tests to mirror: `__tests__/verification-admin-api.test.ts`, `__tests__/green-room-placements-admin-api.test.ts`, `__tests__/trust-safety-admin-reports.test.ts` — all test the pattern this phase extends (`verifyAdmin()`-gated route + service-role write).

### Phase Requirements → Test Map

No formal `REQ-XX` IDs are registered for this phase in `.planning/REQUIREMENTS.md` yet (confirmed: no Phase 25 section exists there as of this research). The phase description's four in-scope capabilities map to tests as follows — the planner should register these as requirement IDs during plan-phase per this project's own established convention (see the "pre-existing documentation gap" notes recorded for Phases 16/22 in STATE.md — do not repeat that gap here if avoidable):

| Capability | Behavior | Test Type | Automated Command | File Exists? |
|------------|----------|-----------|--------------------|--------------|
| Staff role gate | `getStaffRole()` returns correct tier for is_admin/staff_role/absent combinations | unit | `npx jest lib/admin/gate.test.ts -x` | ❌ Wave 0 |
| Staff account provisioning | `createStaffAccount()` sets `app_metadata.staff_role` atomically, never a post-insert UPDATE | unit (mocked Supabase client, mirrors existing createBuyerAccount test conventions if any exist) | `npx jest lib/staff/createStaffAccount.test.ts -x` | ❌ Wave 0 |
| Assignment-scoped buyer edit | AE cannot PATCH an org they aren't assigned to (404); AE can PATCH their own; leadership can PATCH any | integration (API route test, mirrors `__tests__/verification-admin-api.test.ts` shape) | `npx jest __tests__/staff-buyer-orgs-api.test.ts -x` | ❌ Wave 0 |
| Field allowlist enforcement | A PATCH body containing a non-allowlisted field (e.g. `verified`) is silently ignored, never written | unit/integration | `npx jest __tests__/staff-buyer-orgs-api.test.ts -x` (same file, additional case) | ❌ Wave 0 |
| Audit logging | Every staff write inserts exactly one `staff_audit_log` row, including idempotent/no-op edits | integration | `npx jest lib/staff/audit.test.ts -x` | ❌ Wave 0 |
| Notification fan-out | New buyer signup with `ae_user_id` set notifies that AE; unassigned falls back to leadership | unit (pure builder, mirrors `lib/deals/notifications.ts`'s test-free-but-pure convention, or add a test) | `npx jest lib/staff/notifications.test.ts -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** targeted `npx jest <file>` for the file(s) touched
- **Per wave merge:** `npm test` (full suite — this repo's convention per STATE.md's "full repo suite green (280+ tests)" checkpoints)
- **Phase gate:** Full suite green + `tsc`/`lint` clean before `/gsd-verify-work`, matching every prior phase's closeout convention in this repo

### Wave 0 Gaps

- [ ] `lib/admin/gate.test.ts` — covers `getStaffRole()`'s is_admin-fallback and staff_role branches (no test file exists for `gate.ts` today — first one)
- [ ] `lib/staff/scope.test.ts` — covers `isAssignedToOrg()`
- [ ] `lib/staff/audit.test.ts` — covers `logStaffAction()` unconditional-write behavior
- [ ] `__tests__/staff-buyer-orgs-api.test.ts` — covers the new scoped-PATCH route end to end
- [ ] Register Phase 25 requirement IDs in `.planning/REQUIREMENTS.md` — no section exists yet (repeat of a documented pre-existing gap pattern from Phases 16/22; avoid extending it here per STATE.md's own "deferred to a future /gsd-docs-update pass" notes)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | No (new) | Reuses existing Supabase auth session; no new auth flow introduced |
| V3 Session Management | No (new) | Same session/cookie mechanism as every other authenticated route |
| V4 Access Control | **Yes — this IS the phase** | Server-side role check (`requireStaff`) on every route, re-verified per-route (not layout-only), least-privilege assignment scoping (`isAssignedToOrg`), 404-not-403 on scope-denied reads to avoid existence leakage, mirroring this repo's own established precedent |
| V5 Input Validation | Yes | Field allowlist (`STAFF_EDITABLE_BUYER_ORG_FIELDS`) mirroring `EDITABLE_FIELDS`'s mass-assignment protection; role values validated against a closed enum (`'leadership'|'ae'|'bd'`), never freeform text |
| V6 Cryptography | No | No new crypto surface |
| V7 Error Handling / Logging | Yes | `staff_audit_log` is the "who/what/when" trail default #4 requires — unconditional writes, service-role-only readable |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Privilege escalation via mass-assignment (a PATCH body sneaking `staff_role` or `verified` into an update) | Elevation of Privilege | Field allowlist loop that only ever reads keys explicitly listed (exact `EDITABLE_FIELDS` pattern already proven in `app/api/profile/route.ts`) |
| Horizontal access-control bypass (AE reading/editing a buyer org they aren't assigned to, by guessing/enumerating IDs) | Elevation of Privilege / Information Disclosure | `isAssignedToOrg()` check on every read AND write (Pitfall 4), 404 (not 403) on denial |
| Confused-deputy via the service-role client (a route forgets to gate before using `createServiceClient()`, since the client itself bypasses all RLS) | Elevation of Privilege | `requireStaff()` MUST be the first statement in every staff route, before any service-client call — matches the existing `verifyAdmin()`-first convention in every current `/api/admin/*` route (verified: all six read files above call it as their first substantive line) |
| Audit-log tampering or gaps (a route forgets to log, or a client could theoretically write directly) | Repudiation | Zero-RLS-policy + REVOKE-ALL table (Pattern 3) makes client writes structurally impossible; centralizing the write in one `logStaffAction()` helper (Don't Hand-Roll) makes "forgot to log" a one-file code-review surface instead of an N-route audit |
| Staff account takeover via a weak/guessable bootstrap invite link | Spoofing | Reuses the existing `generateLink({ type: 'magiclink' })` + one-time-use Supabase mechanism already proven for buyer/industry invites — no new link-generation logic |

## Sources

### Primary (HIGH confidence — direct codebase reads, this session)
- `lib/admin/gate.ts` — current `verifyAdmin()` / `EDITABLE_FIELDS` pattern
- `app/(admin)/layout.tsx` — current inline `is_admin` gate
- `supabase/migrations/080_buyer_orgs_members.sql` — buyer_orgs/buyer_members schema, RLS, REVOKE/GRANT posture, `is_buyer_org_member()` SECURITY DEFINER precedent
- `supabase/migrations/058_trust_safety_schema.sql` — `verification_audit_log`'s zero-RLS-policy pattern, `reports` server-owned-write pattern
- `supabase/migrations/078_project_members.sql` — SECURITY DEFINER helper-pair precedent for cross-table RLS recursion (confirmed NOT needed here since buyer tables have no client RLS reads to recurse against)
- `supabase/migrations/081_license_requests_deals.sql` — `owner_id` single-column admin-assignment precedent (grep-confirmed line 95)
- `lib/buyers/createBuyerAccount.ts`, `lib/industry/createIndustryMember.ts` — atomic `app_metadata`-at-creation account-provisioning pattern
- `app/api/admin/buyer-orgs/route.ts`, `app/api/admin/members/route.ts`, `app/api/admin/verification/[id]/route.ts` — existing admin-route conventions (gate-first, service-role write, allowlist validation, unconditional audit)
- `app/api/profile/route.ts` — `EDITABLE_FIELDS` mass-assignment-allowlist pattern (the explicit precedent default #3 names)
- `lib/notifications/index.ts`, `lib/deals/notifications.ts`, `supabase/migrations/009_antenna_notifications.sql` — existing in-app + email notification infrastructure, reused as-is
- `scripts/provision-test-admin.mjs` — idempotent GoTrue admin-API `app_metadata` promotion pattern (bootstrap precedent)
- `app/(buyer-portal)/layout.tsx` — precedent for a route-group-own auth gate deliberately excluded from `middleware.ts`'s `isProtected` array
- `middleware.ts` — confirmed `/admin` is already in `isProtected`; no changes needed there
- `grep` sweep of `supabase/migrations/*.sql` for `auth.jwt()` — confirmed zero usages, grounding the "no RLS-via-JWT-claims" architectural claim
- `.planning/phases/25-funun-team-accounts-ae/25-CONTEXT.md`, `.planning/phases/23-buyer-onboarding-login-register/23-CONTEXT.md`, `.planning/phases/15-account-capability-model/15-CONTEXT.md` — locked decisions, consumer-phase needs, capability-model precedent
- `.planning/STATE.md` — migration numbering (084 is latest; 089/090 recommended next), pre-existing REQUIREMENTS.md registration-gap pattern to avoid repeating
- `.planning/config.json` — confirmed `nyquist_validation: true`, `security_enforcement: true`, `security_asvs_level: 1`

### Secondary (MEDIUM confidence)
None — no external documentation was needed; the entire domain is internal architecture.

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new libraries, every pattern cross-checked against a live file in this repo
- Architecture: HIGH — the "no new RLS needed on buyer tables" finding is a direct read of migration 080's REVOKE statements, not an inference
- Pitfalls: HIGH — each pitfall is grounded in a documented precedent bug class already fixed elsewhere in this codebase (phantom-row races, column-grant gaps, layout-vs-route gating splits)
- Open questions / assumptions: MEDIUM-LOW by nature — these are genuinely undecided product questions (bootstrap fallback, field scope, `/admin` vs `/team`) that depend on Phase 23's not-yet-executed schema and the owner's product-naming preference, not on missing research

**Research date:** 2026-08-05
**Valid until:** Effectively stable (internal architecture, no external version drift risk) — re-verify only if Phase 23 executes first and changes the `buyer_orgs`/`buyer_members` schema referenced above, or if Phase 15's capability-model work (still pending its own live UAT) changes `app_metadata` conventions.
