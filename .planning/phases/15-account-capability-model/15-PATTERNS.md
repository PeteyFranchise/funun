# Phase 15: Account Capability Model - Pattern Map

**Mapped:** 2026-07-07
**Files analyzed:** 11 (new + modified)
**Analogs found:** 10 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `supabase/migrations/04X_capability_grants.sql` | migration | CRUD (request/approve state machine) | `supabase/migrations/035_connections_blocks.sql` | exact |
| `supabase/migrations/04X_capability_grants.sql` (column-privilege block) | migration | CRUD | `supabase/migrations/040_artist_profiles_column_privileges.sql` | exact |
| `lib/capabilities/grant.ts` | service | CRUD (request/approve) | `lib/industry/createIndustryMember.ts` | role-match (creation vs. grant-onto-existing — see caveat) |
| `lib/capabilities/check.ts` | utility | request-response (boolean check) | `lib/industry/roleMapping.ts` (`isValidRoleSlugList`) + migration 035's `no_block()` (conceptual mirror, not code copy) | role-match |
| `app/api/capabilities/request/route.ts` | route | request-response | `app/api/admin/members/route.ts` (POST handler shape) | role-match |
| `app/api/capabilities/approve/[grantId]/route.ts` | route | request-response | `app/api/admin/members/route.ts` (GET+POST combined pattern, `verifyAdmin()` gate) | exact |
| `app/(admin)/admin/capability-requests/page.tsx` | route (server page) | request-response | `app/(admin)/admin/members/page.tsx` | exact |
| `components/admin/CapabilityRequestsAdmin.tsx` | component | request-response | `components/admin/MembersAdmin.tsx` | exact |
| `components/nav/ArtistNav.tsx` (modified) | component | request-response (render-time filter) | itself — extend existing `ITEMS.filter()` shape; no external analog needed | exact (self-extend) |
| `app/api/antenna/opportunities/route.ts` (modified — add capability check) | route | request-response | itself, referencing `verifyAdmin()` gate pattern from `lib/admin/gate.ts` for the "re-verify server-side, don't trust client" convention | role-match |
| `app/(industry)/layout.tsx` (retired) → files relocate into `app/(artist)/` | route (layout retirement / file move) | request-response | `app/(industry)/layout.tsx` itself (source of truth for what moves) | exact (source, not target) |

## Pattern Assignments

### `supabase/migrations/04X_capability_grants.sql` (migration, CRUD)

**Analog:** `supabase/migrations/035_connections_blocks.sql` (request/accept state machine) + `supabase/migrations/040_artist_profiles_column_privileges.sql` (column lockdown)

**Table + partial unique index pattern** (035 lines 15-32):
```sql
CREATE TABLE connections (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id   UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  addressee_id   UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requester_id <> addressee_id)
);

CREATE UNIQUE INDEX connections_active_pair_uniq
  ON connections (requester_id, addressee_id)
  WHERE status IN ('pending', 'accepted');
```
Adapt directly to `capability_grants(profile_id, capability, status)` with a partial unique index on `(profile_id, capability) WHERE status IN ('pending','approved')` — this is exactly RESEARCH.md's Pattern 1 recommendation and should be copied nearly verbatim, substituting columns.

**Two-targeted-UPDATE-policy split** (035 lines 53-65) — prevents self-accept and rewriting other columns:
```sql
CREATE POLICY "connections_update_addressee" ON connections FOR UPDATE TO authenticated
  USING (addressee_id = auth.uid() AND status = 'pending')
  WITH CHECK (addressee_id = auth.uid() AND status IN ('accepted', 'declined'));

CREATE POLICY "connections_update_requester_withdraw" ON connections FOR UPDATE TO authenticated
  USING (requester_id = auth.uid() AND status = 'pending')
  WITH CHECK (requester_id = auth.uid() AND status = 'withdrawn');
```
For `capability_grants`, the equivalent split is: requester can INSERT only a `'pending'` row (never `'approved'` for the `industry` capability); only `service_role` (via the approve route) can flip `pending → approved`. There is no self-service "withdraw" requirement in CONTEXT.md, so only one INSERT policy plus a service-role-only UPDATE path is needed — simpler than `connections`' two-sided UPDATE split, since only admins (service role) ever transition status here.

**Column-level UPDATE/INSERT lockdown pattern** (035 lines 67-72, mirrored in 040 lines 83-119):
```sql
REVOKE UPDATE ON connections FROM authenticated;
GRANT UPDATE (status) ON connections TO authenticated;
```
For `capability_grants`: `REVOKE INSERT, UPDATE ON capability_grants FROM authenticated;` then grant back only the minimal INSERT needed for the self-serve instant/pending paths (or route all writes through `service_role` via API routes entirely, which is simpler and matches D-14's server-enforcement intent — recommend all writes go through `createServiceClient()`-backed API routes, with NO direct authenticated INSERT/UPDATE grant at all, since both the instant-grant and the pending-request paths already go through `/api/capabilities/request/route.ts`).

**Defensive backfill guard for D-12** — no direct precedent exists (migration 040 has no `IF EXISTS` guard on a foreign column), but `034`'s own defensive `ADD COLUMN IF NOT EXISTS claimed_at` used in migration 040 (line 19-20) is the template for wrapping the `member_type` backfill in an existence check per RESEARCH Pitfall 3:
```sql
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
```
Use a `DO $$ ... IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='artist_profiles' AND column_name='member_type') ... $$` block around the backfill INSERT.

---

### `lib/capabilities/grant.ts` (service, CRUD)

**Analog:** `lib/industry/createIndustryMember.ts`

**Caveat (RESEARCH Pitfall 4):** Do NOT copy the `admin.createUser()` / `generateLink()` mechanics — those exist because that function provisions a brand-new account. The grant flow here operates on an existing `artist_profiles` row, so the pattern to copy is only the *shape*: a standalone reusable async function, service-role client, badge-mapping call, and typed return — not the atomic-metadata-at-creation technique itself.

**Reusable shape to copy** (createIndustryMember.ts lines 21-41, trimmed to the transferable parts):
```typescript
import { createServiceClient } from '@/lib/supabase/server'
import { mapSlugsToProfileRoles } from '@/lib/industry/roleMapping'

export async function grantCapability(input: {
  profileId: string
  capability: 'artist' | 'industry'
  roleSlugs: string[]
  source: 'signup' | 'self_serve_instant' | 'admin_approved'
  decidedBy?: string
}): Promise<{ grantId: string }> {
  const service = createServiceClient()
  const profileRoles = mapSlugsToProfileRoles(input.roleSlugs)

  const { data, error } = await service
    .from('capability_grants')
    .insert({
      profile_id: input.profileId,
      capability: input.capability,
      status: 'approved',
      role_slugs: input.roleSlugs,
      source: input.source,
      decided_at: new Date().toISOString(),
      decided_by: input.decidedBy ?? null,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to grant capability: ${error.message}`)

  // D-10: auto-attach the badge — mirrors createIndustryMember()'s
  // pre-population of roles, but as an UPDATE onto an existing row
  // instead of user_metadata at creation time.
  await service
    .from('artist_profiles')
    .update({ roles: profileRoles })
    .eq('id', input.profileId)

  return { grantId: data.id }
}
```

**Error-handling convention to copy** (createIndustryMember.ts lines 43-57) — descriptive thrown Errors, distinguish known failure modes with a custom Error subclass:
```typescript
export class DuplicateIndustryMemberError extends Error {}
// ...
if (createError?.code === 'email_exists' || createError?.status === 422) {
  throw new DuplicateIndustryMemberError(...)
}
throw new Error(`Failed to create industry member: ${createError?.message ?? 'unknown error'}`)
```
Use the same pattern for a `DuplicateCapabilityRequestError` thrown when the partial unique index rejects a duplicate pending/approved request (catch the Postgres unique-violation error code and rethrow typed).

---

### `lib/capabilities/check.ts` (utility, request-response)

**Analog:** RESEARCH.md's own code example (already drafted, grounded in this repo's service-client convention) — copy near-verbatim:
```typescript
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
**Validation companion pattern** — `lib/industry/roleMapping.ts`'s `isValidRoleSlugList()` (lines 45-48) is the template for a `isValidCapability()` guard:
```typescript
export function isValidRoleSlugList(slugs: unknown): slugs is string[] {
  if (!Array.isArray(slugs) || slugs.length === 0) return false
  return slugs.every(s => typeof s === 'string' && ALL_INDUSTRY_ROLE_SLUGS.includes(s))
}
```

---

### `app/api/capabilities/request/route.ts` (route, request-response)

**Analog:** `app/api/admin/members/route.ts` POST handler (lines 47-109)

**Imports pattern** (lines 1-5):
```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { createIndustryMember, DuplicateIndustryMemberError } from '@/lib/industry/createIndustryMember'
import { isValidRoleSlugList, mapSlugsToProfileRoles } from '@/lib/industry/roleMapping'
```
For the request route, swap `verifyAdmin()` for a plain `auth.getUser()` self-identity check — per RESEARCH's V4 threat model, the requester's own `profile_id` must be derived from the session, never accepted from the request body.

**Validation-then-delegate pattern** (lines 53-76) — strict allowlist body parsing, then delegate to the `lib/` service function:
```typescript
const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
if (!email || !EMAIL_REGEX.test(email)) {
  return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
}
// ...
const roleSlugs = body.role_slugs
if (!isValidRoleSlugList(roleSlugs)) {
  return NextResponse.json({ error: 'Select at least one role.' }, { status: 400 })
}
try {
  const result = await createIndustryMember({ ... })
  return NextResponse.json({ data: result }, { status: 201 })
} catch (err) {
  if (err instanceof DuplicateIndustryMemberError) {
    return NextResponse.json({ error: 'This email has already been invited.' }, { status: 409 })
  }
  return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 })
}
```
Apply identically: validate `capability` enum + `role_slugs`, branch D-02's asymmetric gate (industry→artist inserts `status='approved'` directly; artist→industry inserts `status='pending'`), catch the unique-constraint violation and return 409.

---

### `app/api/capabilities/approve/[grantId]/route.ts` (route, request-response)

**Analog:** `app/api/admin/members/route.ts` (both GET and POST, full file)

**Admin gate pattern** (lines 16-19, reused verbatim):
```typescript
const auth = await verifyAdmin()
if ('error' in auth) {
  return NextResponse.json({ error: auth.error }, { status: auth.status })
}
```
This must be the first line of the approve route's handler — same as every `/api/admin/*` route in this codebase (T-05-02 doctrine, confirmed in `lib/admin/gate.ts` comment).

**verifyAdmin() source** (`lib/admin/gate.ts` lines 15-24) — copy import, do not reimplement:
```typescript
import { createApiClient } from '@/lib/supabase/server'
export async function verifyAdmin(): Promise<VerifyAdminResult> {
  const supabase = createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) return { error: 'Forbidden', status: 403 }
  return { user }
}
```

---

### `app/(admin)/admin/capability-requests/page.tsx` + `components/admin/CapabilityRequestsAdmin.tsx`

**Analog:** `components/admin/MembersAdmin.tsx` (full file structure) — copy the state-machine shape directly:

**State + form shape** (lines 13-29):
```typescript
export type IndustryMember = {
  id: string
  artist_name: string | null
  member_type: string
  industry_roles: string[]
  roles: ProfileRole[]
  created_at: string
  email: string
}
type FormState = { email: string; displayName: string; roleSlugs: string[] }
const EMPTY_FORM: FormState = { email: '', displayName: '', roleSlugs: [] }
```
Rename to `CapabilityRequest` type (`profileId`, `artistName`, `capability`, `roleSlugs`, `requestedAt`, `email`) and drop `FormState`/`EMPTY_FORM` (D-11: the badge pick is already collected at request time by the requester, so the admin queue is read-only display + approve/deny buttons only — no form).

**Chip-toggle role picker** (`INDUSTRY_ROLE_GROUPS` import, line 4) — reuse directly for the *requester-facing* request form (per D-11), not the admin queue itself (per RESEARCH Open Question 3, read-only display is sufficient there):
```typescript
import { INDUSTRY_ROLE_GROUPS } from '@/lib/industry-roles'
```

**Error/warning surfacing pattern** (lines 50-52):
```typescript
const [addError, setAddError] = useState<string | null>(null)
const [emailWarning, setEmailWarning] = useState<string | null>(null)
```
Apply the same pattern for approve/deny actions (`actionError`, no email-warning equivalent needed since no invite email is sent by this flow).

---

### `components/nav/ArtistNav.tsx` (modified — add `capabilities` prop + conditional filter)

**Analog:** itself — the existing `ITEMS` array + render loop (lines 19-37, 210-246) is the direct template; RESEARCH.md's own code example shows the extension:
```typescript
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
Current `ITEMS` array (lines 26-37) has no `requiresCapability` field on any entry today — every item is universal. Per D-06/D-07, no *new* top-level item is added (Split Sheets folds into existing `/contracts`, Post/Manage-postings folds into existing `/antenna`), so `requiresCapability` is likely only needed for conditional *sub-sections* inside the Antenna and Contract Locker pages themselves, not the top-level nav `ITEMS` array — confirm with planner whether any top-level item ever needs to be industry-only (currently none do, since Vault/Locker/Antenna/etc. are all artist-side rooms an industry-only account per D-08 should not see at all — meaning most `ITEMS` entries need `requiresCapability: 'artist'`, and none need `'industry'` at the top level).

`ArtistNav` currently receives only `{ user }` (line 48) — must gain a `capabilities: string[]` prop, sourced server-side from the layout (`app/(artist)/layout.tsx`), never fetched client-side (RESEARCH anti-pattern warning).

---

### `app/api/antenna/opportunities/route.ts` (modified — add capability check, D-14)

**Analog:** itself (current GET/POST, lines 1-50) — current auth check pattern to extend:
```typescript
const supabase = createApiClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```
Add immediately after, per D-14:
```typescript
if (!(await hasCapability(user.id, 'industry'))) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```
Confirmed via direct read: this route today (lines 22-50) has zero `member_type`/capability check — any authenticated user, artist or industry, can already POST an opportunity. This is the single concrete route RESEARCH flags as the minimum D-14 fix target.

---

### `app/(industry)/layout.tsx` (retired)

**Source file itself** (full file, 32 lines) is the reference for what must be redistributed, not an analog to copy from:
```typescript
<Link href="/opportunities">Opportunities</Link>
<Link href="/split-sheets">Split Sheets</Link>
<Link href="/opportunities/new">Post</Link>
```
Per D-06/D-07 and RESEARCH's recommended lower-risk option: keep URLs stable (`/opportunities`, `/opportunities/new`, `/split-sheets`), move only the route-group wrapper (`(industry)` → `(artist)`), and delete this layout file entirely once `app/(artist)/layout.tsx` wraps every relocated route via `ArtistNav`.

---

## Shared Patterns

### Server-side re-verification of privileged state (never trust layout/nav alone)
**Source:** `lib/admin/gate.ts`'s `verifyAdmin()`, invoked at the top of `app/api/admin/members/route.ts` (lines 16, 48)
**Apply to:** `app/api/capabilities/approve/[grantId]/route.ts` (verifyAdmin), `app/api/capabilities/request/route.ts` (self-identity via `auth.getUser()`, never trust a client-supplied `profile_id`), `app/api/antenna/opportunities/route.ts` (new `hasCapability()` check)
```typescript
const auth = await verifyAdmin()
if ('error' in auth) {
  return NextResponse.json({ error: auth.error }, { status: auth.status })
}
```

### Column-level REVOKE/GRANT lockdown on any new table (standing doctrine since migration 040)
**Source:** `supabase/migrations/035_connections_blocks.sql` lines 67-72; `supabase/migrations/040_artist_profiles_column_privileges.sql` lines 83-119
**Apply to:** the new `capability_grants` migration — must ship REVOKE/GRANT statements in the same migration that creates the table, not a follow-up migration.

### Partial unique index for request/approve state machines
**Source:** `supabase/migrations/035_connections_blocks.sql` lines 30-32 (`connections_active_pair_uniq`)
**Apply to:** `capability_grants_active_uniq ON capability_grants (profile_id, capability) WHERE status IN ('pending', 'approved')`

### Badge auto-attach via `mapSlugsToProfileRoles()`
**Source:** `lib/industry/roleMapping.ts` lines 26-42
**Apply to:** `lib/capabilities/grant.ts`'s grant-approval write path (D-10) — call this exact function, do not reimplement slug→badge mapping.

### Validation: strict server-side enum/allowlist checks, never trust client body shape
**Source:** `app/api/admin/members/route.ts` lines 55-68 (`EMAIL_REGEX`, `isValidRoleSlugList`)
**Apply to:** both new capability routes — validate `capability` against a literal `['artist','industry']` check and `role_slugs` via `isValidRoleSlugList()`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `app/(artist)/antenna/*` post/manage-postings section additions (if URL relocation is chosen over keeping `/opportunities*` stable) | route | request-response | No existing precedent in this codebase for folding one route-group's pages into another's nested sub-route; RESEARCH recommends avoiding this entirely (keep URLs stable, move only the route-group wrapper) — flagged as an Open Question for the planner rather than a pattern gap. |

## Metadata

**Analog search scope:** `supabase/migrations/`, `lib/industry/`, `lib/admin/`, `app/api/admin/members/`, `components/admin/`, `components/nav/`, `app/(industry)/`, `app/api/antenna/opportunities/`
**Files scanned:** 11 read directly (034, 035, 040 migrations; createIndustryMember.ts; roleMapping.ts; admin/members/route.ts; admin/gate.ts; ArtistNav.tsx; industry layout.tsx; antenna/opportunities/route.ts; MembersAdmin.tsx)
**Pattern extraction date:** 2026-07-07
