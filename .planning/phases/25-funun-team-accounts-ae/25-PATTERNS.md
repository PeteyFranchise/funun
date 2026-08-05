# Phase 25: Funūn Team / Internal Accounts & AE Assignment - Pattern Map

**Mapped:** 2026-08-05
**Files analyzed:** 14 (new/modified, per CONTEXT.md + RESEARCH.md's recommended structure)
**Analogs found:** 14 / 14

**Note on RESEARCH.md accuracy:** RESEARCH.md's Pattern 1 code excerpt for `lib/admin/gate.ts` shows an
imagined *generalized* version, not the current file. The actual current file (verified below) is much
smaller than described — it exports `verifyAdmin()` and an unrelated `EDITABLE_FIELDS`/`SECTION_VALUES`/
`ACTION_TYPE_VALUES`/`KEY_REGEX` set for a **different** feature (checklist items), not a buyer-org
allowlist. The real `EDITABLE_FIELDS` precedent for mass-assignment allowlisting lives in
`app/api/profile/route.ts`, exactly as RESEARCH.md's Pattern 2 and Sources section correctly say. Do not
copy RESEARCH.md's `lib/admin/gate.ts` code block verbatim — extend the real file shown below instead.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `lib/admin/gate.ts` (MODIFY) | middleware/utility | request-response | itself (extend in place) | exact |
| `app/(admin)/layout.tsx` (MODIFY) | route/layout | request-response | itself (extend in place) | exact |
| `lib/staff/createStaffAccount.ts` (NEW) | service | request-response | `lib/buyers/createBuyerAccount.ts` | exact |
| `lib/staff/scope.ts` (NEW) | utility | CRUD (read predicate) | `lib/buyers/permissions.ts` | exact |
| `lib/staff/scope.test.ts` / `lib/staff/audit.test.ts` (NEW) | test | — | `lib/buyers/permissions.test.ts` | exact |
| `lib/staff/audit.ts` (NEW) | utility | event-driven (write-through log) | `lib/notifications/index.ts` (write-through helper shape) | role-match |
| `lib/staff/notifications.ts` (NEW) | utility | event-driven | `lib/notifications/index.ts` + `lib/deals/notifications.ts` | exact |
| `app/api/admin/staff/route.ts` (NEW) | route/controller | CRUD | `app/api/admin/buyer-orgs/route.ts` | exact |
| `app/api/admin/staff/[id]/route.ts` (NEW) | route/controller | CRUD | `app/api/admin/buyer-orgs/route.ts` (POST) + `app/api/profile/route.ts` (PATCH) | role-match |
| `app/api/admin/buyer-orgs/[id]/route.ts` (NEW) | route/controller | CRUD | `app/api/profile/route.ts` (PATCH + EDITABLE_FIELDS) | exact |
| `app/api/admin/buyer-orgs/[id]/ae/route.ts` (NEW) | route/controller | CRUD | `app/api/profile/route.ts` (PATCH) | role-match |
| `app/api/admin/buyer-orgs/route.ts` (MODIFY: widen gate) | route/controller | CRUD | itself (extend in place) | exact |
| `supabase/migrations/085_funun_staff_and_audit.sql` (NEW) | migration | batch/DDL | `supabase/migrations/058_trust_safety_schema.sql` (`verification_audit_log`) | exact |
| `supabase/migrations/086_buyer_orgs_ae_assignment.sql` (NEW) | migration | batch/DDL | `supabase/migrations/081_license_requests_deals.sql` (`owner_id` column) + `supabase/migrations/080_buyer_orgs_members.sql` (REVOKE/GRANT posture) | exact |

## Pattern Assignments

### `lib/admin/gate.ts` (middleware/utility, request-response) — MODIFY IN PLACE

**Analog:** itself, current content (full file, 56 lines, verified read)

**Current file — copy this shape, don't replace it:**
```typescript
// Source: lib/admin/gate.ts lines 1-28 (verified current content)
import { createApiClient } from '@/lib/supabase/server'

type VerifyAdminResult =
  | { error: 'Unauthorized'; status: 401 }
  | { error: 'Forbidden'; status: 403 }
  | {
      user: NonNullable<
        Awaited<ReturnType<Awaited<ReturnType<typeof createApiClient>>['auth']['getUser']>>['data']['user']
      >
    }

export async function verifyAdmin(): Promise<VerifyAdminResult> {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) return { error: 'Forbidden', status: 403 }
  return { user }
}
```

**Important:** lines 30-56 of this file (`EDITABLE_FIELDS`, `SECTION_VALUES`, `ACTION_TYPE_VALUES`,
`KEY_REGEX`) belong to the **checklist-items admin feature**, unrelated to Phase 25 — leave them untouched.
Add the new `StaffRole` type, `getStaffRole()`, and `requireStaff()` functions alongside `verifyAdmin()`,
and keep `verifyAdmin()` itself (either as-is, calling `requireStaff(['leadership'])` internally, or left
byte-identical with `requireStaff` as a new sibling) so the ~15 existing `/api/admin/*` routes that already
call `verifyAdmin()` need zero changes (RESEARCH.md's Pattern 1 intent — the *shape* of that recommendation
is sound, just don't paste its fabricated code block over the real file).

**Return-type discipline to copy:** every gate function returns a discriminated union
(`{ error, status } | { user }`), never throws — callers do `if ('error' in auth) return NextResponse.json(...)`.
Follow this exact shape for `requireStaff()`.

---

### `app/(admin)/layout.tsx` (route/layout, request-response) — MODIFY IN PLACE

**Analog:** itself, current content (lines 1-96, verified read)

**Current inline gate to replace with a `getStaffRole()`/`requireStaff` call** (lines 6-15):
```typescript
// Source: app/(admin)/layout.tsx lines 6-15 (verified current content)
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) redirect('/')
```
Replace the inline `isAdmin` check with `getStaffRole(user)` (imported from `lib/admin/gate.ts`) — this
also fixes the pre-existing inconsistency RESEARCH.md's Pattern 1 flags (layout duplicates the check
instead of calling the shared gate module).

**Sidebar pattern to copy** (lines 19-92): a flat list of `<Link>` items inside a fixed `w-48` nav, each
using the same `rounded-lg px-3 py-2 text-[13px] text-white/70 hover:bg-white/10 hover:text-white` classes.
Add new links (e.g. "Staff", "My Companies") the same way. Per RESEARCH.md's Pitfall 3, wrap
leadership-only links in a conditional on the resolved `staffRole` so AE/BD don't see links to pages whose
backing API still 403s them.

---

### `lib/staff/createStaffAccount.ts` (service, request-response) — NEW

**Analog:** `lib/buyers/createBuyerAccount.ts` (full file, 98 lines, verified read)

**Imports pattern** (lines 1-4):
```typescript
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { buyerInviteEmail } from '@/lib/email/buyerInvite'
import type { BuyerRole } from './schema'
```

**Duplicate-detection error class pattern** (line 7):
```typescript
export class DuplicateBuyerAccountError extends Error {}
```
→ mirror as `export class DuplicateStaffAccountError extends Error {}`.

**Atomic account-creation core pattern — the load-bearing part** (lines 22-59): `app_metadata` role is set
**inside** `service.auth.admin.createUser()`, never via a post-insert `UPDATE` (RESEARCH's Anti-Pattern:
"A post-insert UPDATE to set staff_role" — this file is the proof the codebase never does that):
```typescript
export async function createBuyerAccount(input: {
  email: string
  displayName: string
  orgId: string
  buyerRole: BuyerRole
  isOrgAdmin: boolean
  invitedBy?: string
}): Promise<{ userId: string; emailSent: boolean }> {
  const { email, displayName, orgId, buyerRole, isOrgAdmin, invitedBy } = input
  const service = createServiceClient()

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { role: 'buyer' },
    user_metadata: { display_name: displayName, org_id: orgId, buyer_role: buyerRole, is_org_admin: isOrgAdmin, invited_by: invitedBy ?? null },
  })

  if (createError || !created?.user) {
    if (createError?.code === 'email_exists' || createError?.status === 422) {
      throw new DuplicateBuyerAccountError(createError?.message ?? 'This email has already been invited.')
    }
    throw new Error(`Failed to create buyer account: ${createError?.message ?? 'unknown error'}`)
  }

  const { error: memberError } = await service.from('buyer_members').insert({
    org_id: orgId, user_id: created.user.id, buyer_role: buyerRole, is_org_admin: isOrgAdmin, invited_by: invitedBy ?? null,
  })
  if (memberError) throw new Error(`Failed to create buyer account: ${memberError.message}`)
  // ... generateLink + sendEmail follow (lines 77-97)
}
```
For `createStaffAccount({ email, displayName, staffRole, invitedBy })`:
`app_metadata: { staff_role: staffRole }` set atomically in the same `createUser()` call, then a
`funun_staff` insert (mirrors the `buyer_members` insert step), then `generateLink({ type: 'magiclink' })`
+ `sendEmail()` (lines 77-97 — copy verbatim, swap the invite-template import for a new
`staffInviteEmail()`, mirroring `buyerInviteEmail`).

**Error-distinguishing discipline to copy** (lines 51-58): only `createError?.code === 'email_exists'` maps
to the duplicate error — every other `createUser` failure re-throws generically so a transient outage isn't
misreported as "already invited."

---

### `lib/staff/scope.ts` (utility, CRUD read predicate) — NEW

**Analog:** `lib/buyers/permissions.ts` (full file, 51 lines, verified read)

**Pure-predicate, fail-closed pattern to copy** (lines 1-16):
```typescript
// Source: lib/buyers/permissions.ts lines 1-16 (verified)
import type { BuyerMember } from './schema'

/** True only when the member's tier is 'approver'. */
export function hasApproverRole(
  member: Pick<BuyerMember, 'buyer_role'> | null | undefined
): boolean {
  return member?.buyer_role === 'approver'
}
```
Every predicate takes an already-fetched row (or `null`/`undefined`), does no I/O, and degrades to `false`
(never throws) on missing/unrecognized input — copy this discipline exactly for
`isAssignedToOrg(org: Pick<BuyerOrg, 'ae_user_id'> | null | undefined, staffUserId: string): boolean`.
Note: RESEARCH.md's own code example for `isAssignedToOrg` takes a Supabase client and does I/O (async,
queries `buyer_orgs`) — that is a **different, acceptable** shape (an I/O-performing scope check used at
the route layer), but if a pure row-level predicate is also useful (e.g. to reuse against an
already-fetched org row without a second query), follow this file's zero-I/O convention for that variant.

---

### `lib/staff/scope.test.ts`, `lib/staff/audit.test.ts` (test) — NEW

**Analog:** `lib/buyers/permissions.test.ts` (full file, 79 lines, verified read)

**Test structure to copy** (lines 1-30, 59-77): plain Jest `describe`/`it`, fixtures declared as typed
`Pick<...>` objects at top of file, explicit "degrades to false... never throws" test block for every
predicate given `null`/`undefined`/unrecognized-enum input:
```typescript
// Source: lib/buyers/permissions.test.ts lines 59-77 (verified)
it('degrades to false from every predicate given no membership row, never throws (fail-closed)', () => {
  expect(() => hasApproverRole(null)).not.toThrow()
  expect(hasApproverRole(null)).toBe(false)
  expect(hasApproverRole(undefined)).toBe(false)
  // ...
})

it('degrades to false for an unrecognized buyer_role string, never throws', () => {
  const bogus = { buyer_role: 'superadmin' as unknown as BuyerMember['buyer_role'], is_org_admin: false }
  expect(() => canSubmitRequest(bogus)).not.toThrow()
  expect(canSubmitRequest(bogus)).toBe(false)
})
```
Apply the same two test shapes to `getStaffRole()` (unrecognized `staff_role` string, missing
`app_metadata`, `is_admin` fallback true/false) and to `isAssignedToOrg()`.

---

### `lib/staff/audit.ts` — `logStaffAction()` (utility, event-driven write-through) — NEW

**Analog:** `lib/notifications/index.ts`'s `createNotification()` (full file, 67 lines, verified read) — closest
existing "single write-through helper taking a service client + args, called unconditionally after a
mutation" shape in the codebase.

**Signature + service-client-injection pattern to copy** (lines 11-26):
```typescript
// Source: lib/notifications/index.ts lines 11-26 (verified)
export async function createNotification(
  service: SupabaseClient,
  args: {
    userId: string
    type: string
    title: string
    body?: string | null
    link?: string | null
    data?: Record<string, unknown>
    email?: string | null
    sendEmailCopy?: boolean
    actorId?: string | null
  }
): Promise<{ ok: boolean; error?: string }> {
```
Copy this exact shape for `logStaffAction(service: SupabaseClient, args: { actorId: string; action: string;
targetType: string; targetId?: string | null; changes?: Record<string, unknown> }): Promise<{ ok: boolean;
error?: string }>` — same first-arg-is-service-client convention, same `{ ok, error }` non-throwing return
(the caller decides whether a log failure should block the response; per RESEARCH default #4, prefer
"log unconditionally, never fail the primary write on a log error").

**Insert-and-return-ok pattern** (lines 52-66):
```typescript
const { error } = await service.from('notifications').insert({
  user_id: args.userId, type: args.type, title: args.title, body: args.body ?? null,
  // ...
})
return { ok: !error, error: error?.message }
```

---

### `lib/staff/notifications.ts` (utility, event-driven) — NEW

**Analog:** `lib/notifications/index.ts`'s `createNotification()` (as above) called from a new
`buildLeadRoutedNotification()`-style pure builder, mirroring `lib/deals/notifications.ts`'s
pure-builder-plus-call-site convention (per RESEARCH.md's Recommended Project Structure — `lib/deals/notifications.ts`
exists in this repo at `lib/deals/notifications.ts`, confirmed via `find`). Fan-out call site: after
`createBuyerAccount()`/buyer-signup mutation succeeds, `await createNotification(service, { userId:
org.ae_user_id ?? leadershipFallbackId, type: 'lead_routed', ... }).catch(() => {})` — best-effort, never
blocks the primary response (mirrors `lib/social/activity-emit.ts`'s "never throws" convention cited in
CLAUDE.md's Error Handling section).

---

### `app/api/admin/staff/route.ts` (GET list / POST create) — NEW

**Analog:** `app/api/admin/buyer-orgs/route.ts` (full file, 126 lines, verified read)

**Gate-first discipline — copy verbatim shape** (lines 14-18, 47-51):
```typescript
// Source: app/api/admin/buyer-orgs/route.ts lines 14-18 (verified)
export async function GET() {
  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
```
Swap `verifyAdmin()` for `requireStaff(['leadership'])` (staff listing/creation stays leadership-only per
RESEARCH's architecture, since default #2 says only leadership creates staff).

**Column-explicit select discipline** (line 8, 22-24) — never `select('*')`, mirrors migration 080's
column-grant lockdown convention:
```typescript
const ORG_COLUMNS = 'id, name, is_personal, verified, created_at'
// ...
.select(ORG_COLUMNS)
```

**POST: strict allowlist validation before any insert, then call the account-creation helper, then
distinguish duplicate vs. generic failure** (lines 47-124) — copy this exact three-phase structure
(validate → insert primary row → try/catch the account-creation helper, returning 409 for
`DuplicateBuyerAccountError` vs 500 generic, and note the comment's discipline: "never silently roll back a
successful insert on a downstream failure").

---

### `app/api/admin/staff/[id]/route.ts` (PATCH role-change/deactivate) — NEW

**Analog:** `app/api/profile/route.ts`'s `PATCH` handler (lines 191-318, verified read) for the
gate-then-sanitize-then-service-write shape; `app/api/admin/buyer-orgs/route.ts`'s POST (above) for the
staff-creation-adjacent error handling.

**Sanitize-function-returns-discriminated-union pattern** (lines 75-83, 305-307):
```typescript
// Source: app/api/profile/route.ts lines 75-83 (verified)
type SanitizeResult =
  | { update: Partial<UserProfile> }
  | { error: string; status: number }

async function sanitize(
  body: Record<string, unknown>,
  service: SupabaseClient,
  userId: string
): Promise<SanitizeResult> {
```
Copy this shape for a `sanitizeStaffPatch()` that only accepts `{ staff_role }` (validated against the
closed `StaffRole` enum) and an optional `active`/`deactivated_at` flag — reject with `{ error, status:
400 }` on an invalid role string, never silently coerce.

Per Pitfall 1 (RESEARCH.md), this route must write **both** `app_metadata.staff_role` (via
`service.auth.admin.updateUserById()`) **and** `funun_staff.staff_role` in the same handler — never split
across two endpoints.

---

### `app/api/admin/buyer-orgs/[id]/route.ts` (PATCH scoped edit) — NEW

**Analog:** `app/api/profile/route.ts`'s `EDITABLE_FIELDS` allowlist loop (lines 35-73, 84-189) — the
explicit precedent named by CONTEXT.md default #3.

**Allowlist-loop pattern to copy exactly** (lines 84-107):
```typescript
// Source: app/api/profile/route.ts lines 84-107 (verified) — adapt field list/branches
async function sanitize(body: Record<string, unknown>, service: SupabaseClient, userId: string) {
  const update: Record<string, unknown> = {}
  for (const key of EDITABLE_FIELDS) {
    if (!(key in body)) continue
    const value = body[key]
    // per-field branch: coerce/validate, or fall through to generic string-trim
    if (typeof value === 'string') {
      const trimmed = value.trim()
      update[key] = trimmed === '' ? null : trimmed
    } else if (value === null) {
      update[key] = null
    }
  }
  return { update }
}
```
Use `STAFF_EDITABLE_BUYER_ORG_FIELDS = ['name'] as const` (per RESEARCH's Assumption A3) as the allowlist
constant, named and placed the same way `EDITABLE_FIELDS` is (top of file, commented with what's
deliberately excluded and why — copy the comment style from lines 28-34).

**Service-role write, ownership already checked upstream** (lines 309-317):
```typescript
const { data, error } = await service
  .from('user_profiles')
  .update(update)
  .eq('id', user.id)
  .select()
  .single()
if (error) return NextResponse.json({ error: error.message }, { status: 500 })
return NextResponse.json({ data })
```
Adapt to `.from('buyer_orgs').update(update).eq('id', id)`, preceded by the `requireStaff(['leadership',
'ae','bd'])` + `isAssignedToOrg()` scope check (RESEARCH's Pattern 2, already verified sound against the
real gate file) and followed by an unconditional `logStaffAction()` call (Pitfall 4: 404-not-403 on
scope-denied, mirrors this repo's existing ownership-check convention elsewhere).

---

### `app/api/admin/buyer-orgs/[id]/ae/route.ts` (PATCH leadership-only AE assignment) — NEW

**Analog:** same as above (`app/api/profile/route.ts` PATCH shape), scoped down to `requireStaff(['leadership'])`
only, single-field update (`ae_user_id`), UUID-shape validated before write (reject non-UUID/empty string
early — mirrors `EMAIL_REGEX` early-validation style at `app/api/admin/buyer-orgs/route.ts` lines 60-64).

---

### `app/api/admin/buyer-orgs/route.ts` (MODIFY: widen POST gate) — existing file

**Analog:** itself (lines 47-51, verified above) — change `await verifyAdmin()` to
`await requireStaff(['leadership', 'ae', 'bd'])` for POST only; leave GET's `verifyAdmin()` call as
leadership-only OR widen+scope it (RESEARCH's Pitfall 4 requires the list/GET path to also be scoped by
`ae_user_id = caller` for non-leadership callers — don't widen GET without adding that filter).

---

### `supabase/migrations/085_funun_staff_and_audit.sql` (migration, batch/DDL) — NEW — HUMAN-GATED

**Analog:** `supabase/migrations/058_trust_safety_schema.sql`'s `verification_audit_log` table (lines
157-181, verified read in full) — the exact zero-RLS-policy, service-role-only shape.

**Verbatim structural pattern to reapply:**
```sql
-- Source: supabase/migrations/058_trust_safety_schema.sql lines 158-179 (verified)
CREATE TABLE IF NOT EXISTS verification_audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id  UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  action      TEXT NOT NULL CHECK (action IN ('grant', 'revoke')),
  actor_id    UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_audit_log_profile
  ON verification_audit_log (profile_id, created_at DESC);

ALTER TABLE verification_audit_log ENABLE ROW LEVEL SECURITY;

-- No policies are created for any role. An RLS-enabled table with zero
-- policies denies ALL row access to authenticated/anon by construction —
-- combined with the REVOKE below (which removes the table-level grant
-- Supabase applies to newly created public-schema tables by default),
-- this table is reachable ONLY via the service role.
REVOKE SELECT, INSERT, UPDATE, DELETE ON verification_audit_log FROM authenticated, anon;
```
Reapply this exact CREATE TABLE / index / `ENABLE ROW LEVEL SECURITY` / comment / `REVOKE` sequence for
both `staff_audit_log` (columns: `id, actor_id, action, target_type, target_id, changes JSONB, created_at`)
and `funun_staff` (columns: `id, user_id UUID REFERENCES auth.users, staff_role TEXT NOT NULL CHECK
(staff_role IN ('leadership','ae','bd')), display_name, created_at` — also zero-RLS/REVOKE-ALL, since
`funun_staff` per RESEARCH is a display-copy table read only via service-role staff-listing routes, never
directly by session clients).

**Reminder:** this file is a migration under `supabase/migrations/` — per CLAUDE.md/GSD convention,
migrations are human-gated; do not run `supabase db push`.

---

### `supabase/migrations/086_buyer_orgs_ae_assignment.sql` (migration, batch/DDL) — NEW — HUMAN-GATED

**Analog A (column precedent):** `supabase/migrations/081_license_requests_deals.sql` line 95 —
`owner_id UUID REFERENCES auth.users,` — single nullable FK column for admin-assignment, confirmed present.

**Analog B (REVOKE/GRANT posture to preserve, not extend):** `supabase/migrations/080_buyer_orgs_members.sql`
lines 215-231 (verified read via grep):
```sql
-- Source: supabase/migrations/080_buyer_orgs_members.sql lines 215-231 (verified)
REVOKE INSERT, UPDATE, DELETE ON public.buyer_orgs FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.buyer_members FROM authenticated, anon;

-- COLUMNS. Both REVOKE-then-GRANT an explicit allowlist so a session client
REVOKE SELECT ON public.buyer_orgs FROM authenticated, anon;
GRANT SELECT (id, name, is_personal, verified, created_at)
  ON public.buyer_orgs TO authenticated, anon;
```
`ADD COLUMN ae_user_id` does **not** need a matching `GRANT SELECT` addition — per RESEARCH's Pitfall 2,
a new column is private-by-default under this column-privilege regime; leaving `ae_user_id` out of the
`GRANT SELECT (id, name, is_personal, verified, created_at)` allowlist is the **correct, deliberate**
outcome (mirrors how `verified_at`/`created_by` are kept private elsewhere in this same migration file per
its own documented convention). State that explicitly in the new migration's comment so a future author
doesn't "fix" it.

```sql
-- Source: pattern composed from migrations 080 + 081 (verified structure)
ALTER TABLE public.buyer_orgs
  ADD COLUMN ae_user_id UUID REFERENCES auth.users ON DELETE SET NULL;

CREATE INDEX idx_buyer_orgs_ae_user_id ON public.buyer_orgs (ae_user_id);

COMMENT ON COLUMN public.buyer_orgs.ae_user_id IS
  'Phase 25: the Funūn staff member (AE) assigned to this buyer company. Private column — deliberately NOT added to the migration-080 authenticated GRANT list.';

NOTIFY pgrst, 'reload schema';
```

---

## Shared Patterns

### Staff/admin gate — single authority, never a parallel path
**Source:** `lib/admin/gate.ts` (verified current file)
**Apply to:** every new/modified route under `app/api/admin/**` and `app/(admin)/layout.tsx`
```typescript
export async function verifyAdmin(): Promise<VerifyAdminResult> {
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) return { error: 'Forbidden', status: 403 }
  return { user }
}
```
`requireStaff(allowed: StaffRole[])` must be added to this same file, return the same discriminated-union
shape, and every existing caller of `verifyAdmin()` must keep working unchanged.

### Mass-assignment allowlist
**Source:** `app/api/profile/route.ts` lines 35-73, 84-107 (`EDITABLE_FIELDS` + `sanitize()` loop)
**Apply to:** `app/api/admin/buyer-orgs/[id]/route.ts`, `app/api/admin/staff/[id]/route.ts`
```typescript
const EDITABLE_FIELDS = [/* explicit list, never spread req.body */] as const
async function sanitize(body: Record<string, unknown>, service: SupabaseClient, userId: string) {
  const update: Record<string, unknown> = {}
  for (const key of EDITABLE_FIELDS) {
    if (!(key in body)) continue
    // per-field validation/coercion branch
  }
  return { update }
}
```

### Zero-RLS-policy service-role-only table
**Source:** `supabase/migrations/058_trust_safety_schema.sql` lines 158-179 (`verification_audit_log`)
**Apply to:** `staff_audit_log`, `funun_staff` (migration `085_funun_staff_and_audit.sql`)

### Atomic account creation (role in `createUser()`, never post-insert UPDATE)
**Source:** `lib/buyers/createBuyerAccount.ts` lines 22-59
**Apply to:** `lib/staff/createStaffAccount.ts`

### In-app + email notification fan-out
**Source:** `lib/notifications/index.ts` `createNotification()` (full file)
**Apply to:** `lib/staff/notifications.ts` (lead/work routing to assigned AE, with leadership fallback)

## No Analog Found

None — every file in RESEARCH.md's recommended structure maps to a verified existing analog in this
codebase (this phase is explicitly "generalize an existing pattern," per RESEARCH.md's own framing).

## Metadata

**Analog search scope:** `lib/admin/`, `lib/buyers/`, `lib/industry/`, `lib/notifications/`, `lib/deals/`,
`app/(admin)/`, `app/api/admin/`, `app/api/profile/`, `supabase/migrations/058_*`, `080_*`, `081_*`
**Files read in full (verified, no re-reads):** `lib/admin/gate.ts`, `app/(admin)/layout.tsx`,
`app/api/profile/route.ts`, `lib/buyers/createBuyerAccount.ts`, `lib/buyers/permissions.ts`,
`lib/buyers/permissions.test.ts`, `app/api/admin/buyer-orgs/route.ts`, `lib/notifications/index.ts`,
migration 058 lines 157-181, migration 080 lines 191-231 (grep + targeted read), migration 081 line 95 (grep)
**Pattern extraction date:** 2026-08-05
