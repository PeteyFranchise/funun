# Phase 38: Member Organization & Team Workspaces - Pattern Map

**Mapped:** 2026-09-05
**Files analyzed:** ~30 (across Slices A–D per RESEARCH's recommended split boundary; E–I noted as later-phase)
**Analogs found:** 26 / 30

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/182_workspaces_foundation.sql` | migration | CRUD + guest-list lockdown | `supabase/migrations/078_project_members.sql` | exact (extends the same helper-pair shape one hop) |
| `supabase/migrations/183_workspace_roster_relationships.sql` | migration | event-driven state machine | `supabase/migrations/136_work_members.sql` (claim bridge) + `172_audit_integrity_hardening.sql` (guard triggers) | exact |
| `supabase/migrations/184_workspace_permissions_grants.sql` | migration | CRUD (tables only, no RLS yet) | `080_buyer_orgs_members.sql` (column-level REVOKE/GRANT convention) | role-match |
| `supabase/migrations/185_workspace_rls_extension.sql` | migration | request-response (RLS read gate) | `078_project_members.sql` §(e)/(f) (per-operation policy split + `OR` extension) | exact — the phase's central artifact |
| `supabase/migrations/186_workspace_billing.sql` | migration | CRUD (usage counters) | `supabase/migrations/156_song_passport_pilot_operations.sql` (cohort + counters table shape) | role-match |
| `supabase/migrations/187_workspace_beta_flag.sql` | migration | CRUD (cohort flag) | `supabase/migrations/156_song_passport_pilot_operations.sql` (`song_passport_cohorts`) | exact |
| `__tests__/migration-182.test.ts` … `-187.test.ts` | test | transform (string-assertion) | `__tests__/migration-136.test.ts` (assert `(SELECT fn(...))` wrapping textually) | exact |
| `lib/workspaces/types.ts` | model | transform | `lib/accounts/account-context.ts` (union types + summary shape) | role-match |
| `lib/workspaces/permissions.ts` | utility (pure) | transform | `lib/client-partners/health.ts` (`PERMISSION_TIER`/`BUNDLE_EXCLUDED` style const maps + pure resolver) | exact |
| `lib/workspaces/permissions.test.ts` | test | transform | `lib/client-partners/health.ts`'s paired test (pure, zero I/O) | exact |
| `lib/workspaces/grants.ts` (`isSubsetGrant`) | utility (pure) | transform | `lib/staff/scope.ts` (`isAssignedToOrg` — fail-closed pure predicate over an already-fetched row) | exact |
| `lib/workspaces/grants.test.ts` | test | transform | `lib/staff/scope.ts`'s shape (no I/O, pure predicate tests) | exact |
| `lib/workspaces/roster.ts` (state machine) | utility (pure) | event-driven | `lib/selects/stage-machine.ts` (`LEGAL_EDGES` map + `isLegalXTransition`) | exact |
| `lib/workspaces/roster.test.ts` | test | event-driven | `lib/selects/stage-machine.ts`'s paired test | exact |
| `lib/workspaces/context.ts` (`resolveWorkspaceContext`) | provider | request-response | `lib/accounts/account-context.ts` (`resolveAccountContext`) + `lib/accounts/member-api-gate.ts` (`requireMemberApiAccount`) | exact |
| `lib/workspaces/context.test.ts` | test | request-response | none direct — nearest is `lib/accounts/account-context.ts`'s implicit test shape (no paired test found in scan) | role-match |
| `lib/workspaces/audit.ts` (`logWorkspaceAction`) | service | event-driven (write-through) | `lib/staff/audit.ts` (`logStaffAction`) | exact |
| `lib/workspaces/audit.test.ts` | test | event-driven | mirrors `lib/staff/audit.ts`'s never-throws contract (no dedicated test file found for `logStaffAction` itself in this scan — write fresh, following its `{ ok, error }` shape) | role-match |
| `lib/workspaces/billing.ts` | service | CRUD | `lib/stripe/connect.ts` (confirms Stripe SDK usage shape) — **no in-repo org-billing precedent** | no analog (new territory) |
| `app/api/workspaces/route.ts` (create) | route | CRUD | `app/api/profile/route.ts` (EDITABLE_FIELDS allowlist, zod validation) + `080_buyer_orgs_members.sql` §(f) (server-owned write posture) | role-match |
| `app/api/workspaces/[workspaceId]/members/route.ts` | route | event-driven (invite) | `supabase/migrations/177_member_client_partner_coexistence.sql` (`find_auth_user_id_by_email`) + `080`'s buyer-invite posture | exact |
| `app/api/workspaces/[workspaceId]/roster/route.ts` | route | event-driven (accept/refuse/block) | `lib/client-partners/contacts.ts` (`CONTACT_EDITABLE_FIELDS` allowlist pattern) + `136_work_members.sql` claim/accept shape | role-match |
| `app/api/workspaces/[workspaceId]/grants/route.ts` | route | request-response (subset-checked write) | `lib/client-partners/contacts.ts` (zod schema + allowlist) + new `isSubsetGrant()` | role-match |
| `app/api/workspaces/[workspaceId]/attachments/route.ts` | route | CRUD (attach/detach) | `078_project_members.sql`'s guest-list model, generalized one hop | role-match |
| `app/w/[workspaceId]/layout.tsx` | provider (server layout) | request-response | `app/(admin)/layout.tsx` (server-resolves role, fails closed, hands data-only props down) + `app/(artist)/layout.tsx` (account-context resolution) | exact |
| `app/w/[workspaceId]/roster/page.tsx` | component (RSC page) | request-response | `app/(admin)/admin/client-partners/page.tsx` pattern via `lib/client-partners/room-data.ts` (data assembly factored out of the page) | exact |
| `app/w/[workspaceId]/activity/page.tsx` | component (RSC page) | request-response | same as above (sibling tab) | exact |
| `components/workspaces/WorkspaceRoom.tsx` | component | request-response | `components/admin/ClientPartnersRoom.tsx` (tabs, data-only props, no function props across RSC boundary) | exact |
| `components/workspaces/WorkspaceSwitcher.tsx` | component | event-driven (navigation) | **no analog** — `components/auth/AccountContextSwitch.tsx` is explicitly the anti-pattern (sign-out based); RESEARCH Pattern 4 forbids extending it | no analog (deliberately new) |

## Pattern Assignments

### `supabase/migrations/182_workspaces_foundation.sql` (migration)

**Analog:** `supabase/migrations/078_project_members.sql`

**Table + write lockdown pattern** (078 lines 64–91):
```sql
CREATE TABLE public.project_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.vault_projects ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('owner', 'co-owner', 'editor', 'viewer')),
  added_by   UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);
...
REVOKE INSERT, UPDATE, DELETE ON public.project_members FROM authenticated, anon;
```
Apply directly to `workspace_members` (role in `owner|admin|member|contractor|guest`, plus a `status` column for `pending|active|suspended|removed|expired` per WS-03). `gen_random_uuid()`, never `uuid_generate_v4()` (078's header note — uuid-ossp not on migration search_path).

**Never-zero-owners guard** (code example from RESEARCH, generalizing `172_audit_integrity_hardening.sql`'s `guard_work_graduation_owner_only()` BEFORE-trigger shape):
```sql
CREATE OR REPLACE FUNCTION public.guard_workspace_never_zero_owners()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_remaining_owners INT;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'owner')
     OR (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role <> 'owner') THEN
    SELECT COUNT(*) INTO v_remaining_owners
    FROM public.workspace_members
    WHERE workspace_id = OLD.workspace_id AND role = 'owner' AND status = 'active' AND id <> OLD.id;
    IF v_remaining_owners = 0 THEN
      RAISE EXCEPTION 'a workspace must always retain at least one owner' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
```

**Migration numbering rule (Pitfall 6):** header must declare `182 = Slice A` explicitly and note siblings 183–187, mirroring 078's header ("079 is reserved for Phase 21's own follow-up").

---

### `supabase/migrations/183_workspace_roster_relationships.sql` (migration)

**Analog:** `supabase/migrations/136_work_members.sql` (claimed-collaborator bridge) + `177_member_client_partner_coexistence.sql` (service-only email lookup)

**Nullable-identity + claim-bridge pattern** (136 lines 82–101, 310–343): a roster relationship row may exist before the named Member has an account or has accepted — mirrors `work_members.user_id` being nullable with a `collaborator_id` axis and a trigger that backfills identity on claim. Reuse the exact `WHEN (NEW.claimed_by IS DISTINCT FROM OLD.claimed_by)` guard idiom and the `user_id IS NULL` idempotency guard.

**Service-only email reconciliation** (177, full file, 34 lines) — copy verbatim shape for invite binding:
```sql
CREATE OR REPLACE FUNCTION public.find_auth_user_id_by_email(p_email TEXT)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT account.id FROM auth.users account
  WHERE pg_catalog.lower(account.email) = pg_catalog.lower(pg_catalog.btrim(p_email))
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.find_auth_user_id_by_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_auth_user_id_by_email(TEXT) TO service_role;
```
Already directly reusable for WS-04 (D-12) — this exact function may not need to be redefined, only called from the new invite route.

---

### `supabase/migrations/185_workspace_rls_extension.sql` (migration) — THE security-critical file

**Analog:** `supabase/migrations/078_project_members.sql` §(c)–(f)

**SECURITY DEFINER helper-pair signature shape** (078 lines 93–136), extended to a third hop per D-48:
```sql
CREATE OR REPLACE FUNCTION public.workspace_project_permission(
  p_project_id UUID, p_uid UUID, p_permission TEXT
) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_attachments attachment
    JOIN public.workspace_members member
      ON member.workspace_id = attachment.workspace_id AND member.user_id = p_uid AND member.status = 'active'
    JOIN public.workspace_grants grant_row
      ON grant_row.workspace_id = attachment.workspace_id AND grant_row.permission = p_permission
     AND (grant_row.project_id IS NULL OR grant_row.project_id = p_project_id)
    WHERE attachment.project_id = p_project_id
  )
$$;
REVOKE EXECUTE ON FUNCTION public.workspace_project_permission(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_project_permission(UUID, UUID, TEXT) TO authenticated;
```

**Policy extension — additive `OR` clause, no rewrite** (078 lines 158–163, extend identically for `tracks`, `vault_assets`, `vault_documents`, `tool_outputs`):
```sql
CREATE POLICY "vault_projects_select_owner_or_member" ON public.vault_projects
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.project_member_role(id, auth.uid())) IS NOT NULL
    OR (SELECT public.workspace_project_permission(id, auth.uid(), 'view_project'))
  );
```

**`(SELECT fn(...))` wrapping discipline** (136's own header comment, lines 44–50): every call site MUST use the scalar-subquery wrap so Postgres treats it as an InitPlan, not a per-row SubPlan. `__tests__/migration-136.test.ts` asserts this textually — do the same for 185.

**Recursion-avoidance rule** (078 lines 33–46, 136 lines 29–50): every new table in the access-resolution chain (`workspace_members`, `workspace_attachments`, `workspace_grants`) must have its OWN SELECT policy going through a SECURITY DEFINER helper, never a bare cross-table `EXISTS`.

**Never a "hide" for structurally excluded data** — pair 185 with a negative test asserting `workspace_project_permission` is never invoked from any clean-master signing route or `subscriptions`-adjacent table (RESEARCH Pitfall 2). No direct in-repo analog for the negative-test convention itself; author fresh, following `21-RLS-SMOKE-CHECKLIST.md`'s manual adversarial-check precedent (cited in RESEARCH, not read in this pass — flag for planner to locate before Slice D).

---

### `lib/workspaces/permissions.ts` (utility, pure)

**Analog:** `lib/client-partners/health.ts`

**Const-map + pure-resolver pattern** (health.ts lines 1–14, 90–116 — header doctrine explicitly cites this convention: "no I/O, no @/lib/supabase import"):
```typescript
export type HealthState = 'good' | 'warning' | 'at_risk' | 'cold' | 'prospect'
export type HealthRulesConfig = { good_within_days: number; ... }
export type HealthSignals = { lastExecutedLicenseAt: string | null; ...; now?: number }

export function computeHealth(signals: HealthSignals, rules: HealthRulesConfig): HealthState {
  if (!signals.lastExecutedLicenseAt) return 'prospect'
  ...
}
```
Apply this exact shape to permission tiers/bundles per RESEARCH Pattern 3's own code example:
```typescript
export const PERMISSION_TIER: Record<WorkspacePermission, 'operational' | 'authority'> = { ... }
export const BUNDLE_EXCLUDED: ReadonlySet<WorkspacePermission> = new Set([...])
export const STRUCTURALLY_EXCLUDED: ReadonlySet<WorkspacePermission> = new Set(['manage_payouts'])
```

---

### `lib/workspaces/grants.ts` (`isSubsetGrant`) (utility, pure)

**Analog:** `lib/staff/scope.ts` (full file, 20 lines)
```typescript
type OrgAssignmentRow = { ae_user_id: string | null }
export function isAssignedToOrg(
  org: Pick<OrgAssignmentRow, 'ae_user_id'> | null | undefined,
  staffUserId: string
): boolean {
  if (!staffUserId) return false
  return org?.ae_user_id === staffUserId
}
```
Copy the fail-closed, zero-argument-defensive, no-I/O shape verbatim for:
```typescript
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

---

### `lib/workspaces/roster.ts` (state machine) (utility, pure)

**Analog:** `lib/selects/stage-machine.ts` (full file, 41 lines)
```typescript
const LEGAL_EDGES: Record<SelectsStatus, ReadonlySet<SelectsStatus>> = {
  draft: new Set<SelectsStatus>(['sent']),
  sent: new Set<SelectsStatus>(['approved', 'changes_requested']),
  changes_requested: new Set<SelectsStatus>(['sent']),
  approved: new Set<SelectsStatus>(),
}
export function isLegalSelectsTransition(from: SelectsStatus, to: SelectsStatus): boolean {
  if (!isKnownStatus(from) || !isKnownStatus(to)) return false
  if (from === to) return false
  return LEGAL_EDGES[from].has(to)
}
```
> **CORRECTION (2026-09-05, after 38-01/38-02 shipped) — the line below is STALE. Do not follow it.**
> `document-supported` is **NOT** a roster relationship state. Open Question 2 resolved to
> **compute-on-read**: the evidence tier is DERIVED (`lib/workspaces/evidence.ts`) from an accepted
> relationship plus a live agreement with a declared scope, per D-16. The shipped
> `ROSTER_RELATIONSHIP_STATE_VALUES` in `lib/workspaces/types.ts` is the source of truth and
> deliberately omits it. **Do not add a `document_supported` column, enum value, or stored state to
> any migration** — D-39's expiry lapse then needs no cron job, which is the whole point.

~~Map directly onto `RosterRelationshipState` (`proposed | accepted | document-supported | refused | blocked | ended`) exactly as RESEARCH's own Code Examples section already drafts.~~ *(superseded — see correction above; read `lib/workspaces/types.ts` and `lib/workspaces/roster.ts` for the shipped shape)*

---

### `lib/workspaces/context.ts` (`resolveWorkspaceContext`) (provider)

**Analog:** `lib/accounts/account-context.ts` (full file, 64 lines) + `lib/accounts/member-api-gate.ts` (full file, 49 lines)

**Account-class resolver shape** (account-context.ts lines 9–64):
```typescript
export const ACCOUNT_CLASS_VALUES = ['member', 'client_partner', 'funun_team'] as const
export type AccountClass = (typeof ACCOUNT_CLASS_VALUES)[number]
export type AccountContextFacts = { hasMemberProfile: boolean; clientPartnerMembershipCount: number; staffRoles: readonly StaffRole[] }
export function resolveAccountContext(facts: AccountContextFacts): AccountContextSummary {
  const isFununTeamMember = facts.staffRoles.length > 0
  if (isFununTeamMember) { return { classes: ['funun_team'], ... } } // fail-closed, staff exclusive
  ...
}
```
**API-gate shape** (member-api-gate.ts lines 25–49) — model `requireWorkspaceAccess()` on this exact pattern: staff fails first and fails closed, then a DB row check, explicit 401/403/500 status discrimination via a tagged union return (`{ ok: true, ... } | { ok: false, status, error }`).

**Critical constraint (RESEARCH Pattern 4):** do NOT extend `lib/auth/session-identity.ts`'s `AccountWorkspace` union or `components/auth/AccountContextSwitch.tsx` — build `lib/workspaces/context.ts` as a new, parallel, additive module. `AccountContextSwitch.tsx` is explicitly the anti-pattern here (sign-out-based switch), not something to generalize.

---

### `lib/workspaces/audit.ts` (`logWorkspaceAction`) (service)

**Analog:** `lib/staff/audit.ts` (full file, 39 lines) — copy verbatim shape:
```typescript
export async function logStaffAction(
  service: SupabaseClient,
  args: { actorId: string; action: string; targetType: string; targetId?: string | null; changes?: Record<string, unknown> }
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await service.from('staff_audit_log').insert({
    actor_id: args.actorId, action: args.action, target_type: args.targetType,
    target_id: args.targetId ?? null, changes: args.changes ?? {},
  })
  return { ok: !error, error: error?.message }
}
```
Extend the args shape for D-50/D-22 dual-identity attribution: `logWorkspaceAction` needs BOTH `actorId` (who acted) and `subjectMemberId` (on whose behalf), never a single collapsed identity — this is the one deliberate deviation from the source shape, required by D-22's "always attributed, never impersonation" invariant. Table itself must ship with `REVOKE UPDATE, DELETE` from all non-superuser roles, matching `staff_audit_log`'s migration-089 zero-policy + REVOKE-ALL posture (see Don't Hand-Roll table in RESEARCH), but — per D-50 — visible to BOTH sides, unlike `staff_audit_log` which is service-role-only. This means the new `workspace_audit_log` table needs its OWN SELECT RLS policy (member sees rows where they are actor OR subject; workspace member with the right grant sees workspace rows) resolved through a SECURITY DEFINER helper, not a bare policy — do not copy `staff_audit_log`'s zero-RLS-policy posture wholesale.

---

### `app/w/[workspaceId]/layout.tsx` (server layout)

**Analog:** `app/(admin)/layout.tsx` (full file, 47 lines)
```tsx
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const role = getStaffRole(user)
  if (!role) redirect('/')
  ...
  return (
    <SessionIdentityGuard identity={{ userId: user.id, context: 'team', label: ... }}>
      ...
      <AdminNav role={role} theme={theme} userLabel={user.email} />
      <div>{children}</div>
    </SessionIdentityGuard>
  )
}
```
Apply directly: `resolveWorkspaceContext(workspaceId, user.id)` replaces `getStaffRole`, redirect-if-not-active-member replaces redirect-if-no-role. **CRITICAL WARNING carried over from this exact file's own commit history (referenced in `components/admin/ClientPartnersRoom.tsx` line 22, "commit 80443bb — production 500 otherwise"):** a Server Component layout must NEVER pass function props to a Client Component. Pass only `{ id, role, grants }` plain-data workspace context down, exactly as `AdminNav` receives only `role`/`theme`/`userLabel` strings.

---

### `components/workspaces/WorkspaceRoom.tsx` (component)

**Analog:** `components/admin/ClientPartnersRoom.tsx` (relevant excerpt, lines 1–120) + `lib/client-partners/room-data.ts` (data-assembly factored out of the page, lines 1–72)

**Tabs + data-only props contract** (ClientPartnersRoom.tsx lines 38–59, 89–113):
```tsx
export type ClientPartnersRoomProps = {
  myCompanyRows: ClientPartnerRow[]
  isLeadership: boolean
  allData: ClientPartnersAllData | null   // null when caller may not see it — hide, don't filter client-side
  ...
}
export function ClientPartnersRoom({ ... }: ClientPartnersRoomProps) {
  const [tab, setTab] = useState<RoomTab>('my')
  const showAll = isLeadership && allData !== null && tab === 'all'
  ...
}
```
Directly the template for D-32's Roster/Activity sibling tabs: `WorkspaceRoomProps` should carry `rosterRows`, `activityEvents`, and a `defaultTab: 'roster'`, with any leadership/authority-tier-only data resolved server-side to `null` for callers lacking the grant (hide-not-filter, matching `allData: ClientPartnersAllData | null`'s "the RSC page never fetches this data for them" doctrine, cited at line 44).

**Data-assembly factored out of the page** (room-data.ts lines 14–20): "Next.js page modules may only export page fields ... The page component remains the sole auth authority ... and passes an ALREADY-resolved [role] in." Apply identically: `lib/workspaces/room-data.ts` assembles `loadWorkspaceRoomData()`, the `app/w/[workspaceId]/roster/page.tsx` RSC page stays the sole `resolveWorkspaceContext` authority and passes the resolved context in.

---

## Shared Patterns

### SECURITY DEFINER helper pair + `(SELECT fn(...))` wrapping
**Source:** `supabase/migrations/078_project_members.sql`, `136_work_members.sql`, `080_buyer_orgs_members.sql`
**Apply to:** every new workspace table participating in RLS (`workspace_members`, `workspace_attachments`, `workspace_grants`, roster-relationship table) and migration 185's three-hop extension.
```sql
CREATE OR REPLACE FUNCTION public.<helper>(p_id UUID, p_uid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.<table> WHERE ...) $$;
REVOKE EXECUTE ON FUNCTION public.<helper>(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.<helper>(uuid, uuid) TO authenticated;
```

### Guest-list write lockdown
**Source:** `078_project_members.sql` line 91, `136_work_members.sql` line 114, `080_buyer_orgs_members.sql` lines 215–216
**Apply to:** every new membership/grant/roster table.
```sql
REVOKE INSERT, UPDATE, DELETE ON public.<table> FROM authenticated, anon;
```
All writes route through service-role API handlers that have already proved caller authority.

### Column-level SELECT lockdown alongside row RLS
**Source:** `080_buyer_orgs_members.sql` §(g) lines 218–233
**Apply to:** `workspace_grants`/`workspace_members` tables carrying audit-only columns (e.g. `invited_by`, admin fields) and — critically per D-40/D-42 — any column adjacent to clean-master or payout data.
```sql
REVOKE SELECT ON public.<table> FROM authenticated, anon;
GRANT SELECT (id, ..., created_at) ON public.<table> TO authenticated;
-- admin/audit-only columns stay private
```

### Pure-logic module convention (no I/O)
**Source:** `lib/client-partners/health.ts`, `lib/selects/stage-machine.ts`, `lib/staff/scope.ts`
**Apply to:** `lib/workspaces/permissions.ts`, `lib/workspaces/grants.ts`, `lib/workspaces/roster.ts` — write and unit-test these BEFORE migration 185 references their shape (RESEARCH's explicit "don't decide the permission storage shape inside the RLS migration" anti-pattern).

### Write-through audit, never-throws
**Source:** `lib/staff/audit.ts` (`logStaffAction`)
**Apply to:** `lib/workspaces/audit.ts` (`logWorkspaceAction`) — called unconditionally after every workspace-context write, `{ ok, error }` non-throwing return, caller decides whether a log failure blocks the primary write (repo convention: it never does).

### Server-resolved context, fail-closed layout gate
**Source:** `app/(admin)/layout.tsx`, `lib/accounts/account-context.ts`, `lib/accounts/member-api-gate.ts`
**Apply to:** `app/w/[workspaceId]/layout.tsx`, and every `app/api/workspaces/[workspaceId]/**/route.ts` handler (re-derive membership + grants from the DB every time; never trust a client-sent `workspaceId`).

### Migration-content string-assertion tests
**Source:** repo-wide convention, explicitly called out in `136_work_members.sql`'s header (lines 44–50) — `__tests__/migration-136.test.ts` asserts the `(SELECT fn(...))` wrapping textually.
**Apply to:** every `__tests__/migration-18{2..7}.test.ts` this phase adds — assert table shape, REVOKE statements, and the InitPlan-wrapping convention as literal string matches against the migration file.

## No Analog Found

Files with no close match in the codebase — RESEARCH explicitly flags these as genuinely new territory; the planner should build from RESEARCH's Architecture Patterns section rather than a copied analog:

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `components/workspaces/WorkspaceSwitcher.tsx` | component | event-driven (navigation) | In-session, sign-out-free workspace switching has no precedent — `components/auth/AccountContextSwitch.tsx` is the existing "switch," but it is sign-out-based and RESEARCH explicitly forbids extending it (D-33 requires the opposite mechanism: URL navigation + server-resolved layout, no shared client-side state). |
| `lib/workspaces/billing.ts` / `supabase/migrations/186_workspace_billing.sql` (`workspace_subscriptions`) | service / migration | CRUD | `subscriptions.user_id UUID ... UNIQUE NOT NULL` (migration 001) is the only precedent, and it is structurally single-tenant-per-person — org-level Stripe billing (one Customer per workspace) is a new integration shape in this codebase. `lib/stripe/connect.ts` confirms the SDK is already present but only for Connect, not Billing. Per RESEARCH's own recommendation (Pattern 5, Assumption A2), scope this to a plain `workspace_usage_counters` table during beta and defer live Stripe objects entirely — do not force-fit a billing analog that doesn't exist yet. |
| `lib/workspaces/context.test.ts` | test | request-response | No paired test file was found for `lib/accounts/account-context.ts` or `lib/accounts/member-api-gate.ts` in this scan (may exist elsewhere uninspected) — write fresh following the pure-input/tagged-union-output shape those modules already establish. |

## Metadata

**Analog search scope:** `supabase/migrations/` (078, 080, 136, 156, 172, 177, 001), `lib/accounts/`, `lib/staff/`, `lib/client-partners/`, `lib/selects/`, `components/admin/`, `app/(admin)/`, `app/(artist)/`, `middleware.ts`
**Files scanned:** 17 read in full or targeted excerpt (migrations: 078, 136, 080, 177, 172 [partial], 156; lib: account-context.ts, member-api-gate.ts, staff/audit.ts, staff/scope.ts, client-partners/health.ts, client-partners/contacts.ts [partial], client-partners/room-data.ts [partial], selects/stage-machine.ts; components: admin/ClientPartnersRoom.tsx [partial]; app: (admin)/layout.tsx, (artist)/layout.tsx [partial]; middleware.ts [partial])
**Pattern extraction date:** 2026-09-05
**Scope note:** This map covers Slices A–D (foundation, roster, permissions, RLS) per RESEARCH's own recommendation that Phase 38 itself end at Slice D, with Slices E–I (`active-workspace UX` including the switcher, contracts/authority, audit UI, billing, rollout/docs) deferred to Phase 38.1/38.2. The switcher and billing files above are flagged "no analog" regardless of which phase number ultimately hosts them, since that is a property of the codebase, not the phase split.
